import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "20260721100000_core_cloud_baseline.sql";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8",
).toLowerCase();
const socialFoundationName =
  "20260721110000_social_profile_foundation.sql";
const socialFoundation = readFileSync(
  new URL(
    `../supabase/migrations/${socialFoundationName}`,
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const cloudV2 = readFileSync(
  new URL(
    "../supabase/migrations/20260727120000_cloud_media_schema_v2_additive.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

describe("core cloud baseline SQL contract (static, not live PostgreSQL/RLS)", () => {
  it("is the unique first migration and uses one transaction", () => {
    const names = readdirSync(
      new URL("../supabase/migrations/", import.meta.url),
    ).sort();
    expect(names[0]).toBe(migrationName);
    expect(migrationName).toMatch(/^\d{14}_.+\.sql$/);
    expect(new Set(names.map((name) => name.slice(0, 14))).size).toBe(
      names.length,
    );
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("fails fast on managed Supabase capabilities and non-blank targets", () => {
    for (const marker of [
      "core_baseline_requires_postgresql_15",
      "core_baseline_missing_supabase_auth",
      "core_baseline_missing_supabase_storage",
      "core_baseline_missing_postgresql_capability",
      "core_baseline_target_objects_already_exist",
      "auth.users",
      "auth.uid()",
      "storage.buckets",
      "storage.objects",
      "storage.foldername(text)",
      "pg_catalog.gen_random_uuid()",
      "pg_catalog.sha256(bytea)",
      "pg_catalog.hashtextextended(text,bigint)",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).not.toContain("create extension");
    expect(migration).not.toMatch(
      /create\s+(?:table|function|index|trigger|policy)\s+if\s+not\s+exists/,
    );
  });

  it("creates only the required core tables and shared trigger function", () => {
    for (const table of [
      "profiles",
      "media_items",
      "progress_logs",
      "recommendation_feedback",
      "embedding_cache",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
    }
    expect(migration).toContain("create function public.set_updated_at()");
    expect(migration).toContain("create trigger profiles_set_updated_at");
    expect(migration).toContain("create trigger media_items_set_updated_at");
  });

  it("provides owner RLS policies and keeps the technical cache private", () => {
    for (const table of [
      "profiles",
      "media_items",
      "progress_logs",
      "recommendation_feedback",
      "embedding_cache",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    for (const policy of [
      "profiles_select_own",
      "profiles_insert_own",
      "profiles_update_own",
      "media_items_select_own",
      "media_items_insert_own",
      "media_items_update_own",
      "media_items_delete_own",
      "progress_logs_select_own",
      "progress_logs_insert_own",
      "progress_logs_update_own",
      "progress_logs_delete_own",
      "recommendation_feedback_select_own",
      "recommendation_feedback_insert_own",
      "recommendation_feedback_update_own",
      "recommendation_feedback_delete_own",
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).not.toContain("create policy embedding_cache_");
  });

  it("preserves the legacy progress to media FK required by D2B.1", () => {
    expect(migration).toContain(
      "media_id text references public.media_items(id) on delete set null",
    );
    expect(cloudV2).toContain(
      "foreign key (user_id,media_id)\n    references public.media_items(user_id,id)",
    );
    expect(cloudV2).toContain("on delete set null (media_id)");
  });

  it("satisfies the first social migration's external dependencies", () => {
    expect(socialFoundation.trimStart()).toMatch(
      /^--[\s\S]*?alter table public\.profiles add column/,
    );
    expect(socialFoundation).toContain(
      "execute function public.set_updated_at()",
    );
    expect(migration).toContain("create table public.profiles");
    expect(migration).toContain("create function public.set_updated_at()");
  });

  it("matches the media and progress contracts checked by D2B.1", () => {
    for (const fragment of [
      "id text primary key",
      "user_id uuid not null references auth.users(id) on delete cascade",
      "constraint media_items_progress_nonneg",
      "constraint media_items_total_nonneg",
      "constraint media_items_user_rating_range",
      "create unique index media_items_user_external_unique",
      "create policy media_items_select_own",
      "create policy media_items_insert_own",
      "create policy media_items_update_own",
      "create policy media_items_delete_own",
      "create policy progress_logs_select_own",
      "create policy progress_logs_insert_own",
      "create policy progress_logs_update_own",
      "create policy progress_logs_delete_own",
    ]) {
      expect(migration).toContain(fragment);
    }
    for (const guard of [
      "d2b1_media_items_full_shape_drift",
      "d2b1_progress_logs_full_shape_drift",
      "d2b1_external_unique_index_missing_or_changed",
      "d2b1_owner_rls_not_enabled",
    ]) {
      expect(cloudV2).toContain(guard);
    }
  });

  it("excludes social, XP, theme and Cloud Media V2 targets", () => {
    for (const forbidden of [
      "create table public.profile_modules",
      "create table public.profile_follows",
      "create table public.social_activity_events",
      "create table public.social_recommendations",
      "create table public.xp_events",
      "create table public.xp_media_entitlements",
      "create table public.user_theme_preferences",
      "create table public.cloud_media_sync_operations",
      "add column row_pk",
      "add column log_pk",
      "canonical_key",
      "media_items_v2_revision_guard",
      "apply_media_item_sync_operation",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});
