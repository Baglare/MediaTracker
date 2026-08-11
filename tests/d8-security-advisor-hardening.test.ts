import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260811120000_d8_security_advisor_hardening.sql", "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");
const audit = readFileSync("docs/D8_SECURITY_ADVISOR_AUDIT.md", "utf8");
const cache = readFileSync("lib/ai/persistent-embedding-cache.ts", "utf8");

const publicRead = [
  "get_social_profile",
  "get_unified_social_profile",
  "get_xp_public_summary",
  "list_profile_activity",
  "list_social_connections",
  "search_social_profiles",
  "social_profile_asset_visible",
] as const;

const authenticatedRead = [
  "get_social_person_summary",
  "get_social_recommendation_detail",
  "get_theme_sync_state",
  "get_xp_dashboard",
  "list_social_blocks",
  "list_social_feed",
  "list_social_notifications",
  "list_social_recommendations",
  "social_get_preferences",
] as const;

const authenticatedMutation = [
  "apply_media_item_sync_operation",
  "apply_progress_log_sync_operation",
  "delete_theme_sync_state",
  "save_theme_sync_state",
  "social_block",
  "social_comment",
  "social_comment_action",
  "social_delete_activity",
  "social_follow",
  "social_follow_action",
  "social_notification_action",
  "social_publish_activity",
  "social_react",
  "social_recommendation_transition",
  "social_replace_showcase",
  "social_report",
  "social_save_preferences",
  "social_save_profile",
  "social_save_unified_profile",
  "social_send_recommendation",
  "social_send_recommendation_message",
  "social_share_note",
  "social_unblock",
  "social_unshare_note",
  "xp_select_badges",
  "xp_select_title",
  "xp_sync_media_states",
] as const;

const internalOnly = [
  "social_can_view_activity_row",
  "social_can_view_module",
  "social_ensure_activity_module",
  "social_insert_notification",
  "social_insert_recommendation_message",
  "social_is_blocked",
  "social_notification_allowed",
  "xp_apply_adjustment",
  "xp_apply_event",
  "xp_award_recommendation_completion",
  "xp_convert_legacy_local_state",
  "xp_evaluate_quests",
  "xp_profile_entitlement_trigger",
  "xp_recommendation_event_trigger",
  "xp_recommendation_feedback_trigger",
  "xp_reconcile_entitlement",
  "xp_reconcile_media_state",
  "xp_repair_selected_title",
  "xp_showcase_trigger",
] as const;

const allNames = [
  ...publicRead,
  ...authenticatedRead,
  ...authenticatedMutation,
  ...internalOnly,
];

describe("D8-4A.5E Security Advisor hardening", () => {
  it("classifies all 62 exported SECURITY DEFINER names exactly once", () => {
    expect(publicRead).toHaveLength(7);
    expect(authenticatedRead).toHaveLength(9);
    expect(authenticatedMutation).toHaveLength(27);
    expect(internalOnly).toHaveLength(19);
    expect(new Set(allNames).size).toBe(62);

    const revoked = [...migration.matchAll(/revoke all on function public\.([a-z0-9_]+)\(/gi)]
      .map((match) => match[1]);
    for (const name of allNames) {
      expect(revoked, name).toContain(name);
      expect(audit, name).toContain(`public.${name}`);
    }
  });

  it("starts deny-all and grants only the reviewed public/authenticated entry points", () => {
    for (const name of allNames) {
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public,anon,authenticated;`, "i"));
    }
    for (const name of publicRead) {
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to anon,authenticated;`, "i"));
    }
    for (const name of [...authenticatedRead, ...authenticatedMutation]) {
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated;`, "i"));
    }
    for (const name of internalOnly) {
      expect(migration).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\(`, "i"));
    }
    expect(migration).not.toMatch(/grant execute[^;]+to\s+anon\s*;/i);
  });

  it("fixes set_updated_at search_path without rewriting its trigger body", () => {
    expect(migration).toContain("alter function public.set_updated_at() set search_path = pg_catalog;");
    expect(schema).toMatch(/function public\.set_updated_at\(\)[\s\S]*?set search_path = pg_catalog[\s\S]*?new\.updated_at = now\(\);/i);
    expect(migration).not.toContain("create or replace function public.set_updated_at");
  });

  it("keeps embedding_cache schema-compatible but inaccessible to user roles", () => {
    expect(migration).toContain("alter table public.embedding_cache enable row level security;");
    for (const policy of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(`drop policy if exists embedding_cache_${policy}_global on public.embedding_cache;`);
    }
    expect(migration).toContain("revoke all on table public.embedding_cache from public,anon,authenticated;");
    expect(migration).not.toMatch(/drop table[^;]*embedding_cache/i);
    expect(schema).toContain("revoke all on table public.embedding_cache from public, anon, authenticated;");
    expect(cache).toContain('MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE !== "on"');
    expect(cache).not.toContain("text_preview:");
    expect(cache).not.toContain("personalNotes");
  });

  it("records current and expected Advisor counts without claiming Production closure", () => {
    for (const expected of [
      "123 WARN",
      "anon SECURITY DEFINER: `57 → 7`",
      "authenticated SECURITY DEFINER: `62 → 43`",
      "Toplam tahmini: **51 WARN**",
      "ACCEPTED_PLATFORM_LIMITATION",
    ]) expect(audit).toContain(expected);
    expect(audit).toContain("Production'da migration uygulanmadan");
  });
});
