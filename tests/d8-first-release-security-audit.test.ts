import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = "supabase/migrations";
const migrationFiles = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(join(migrationDir, name), "utf8") }));

describe("D8 first-release SQL/RPC/RLS/Storage source audit", () => {
  it("pins search_path on every SECURITY DEFINER function and avoids dynamic SQL", () => {
    const violations: string[] = [];
    for (const migration of migrationFiles) {
      const functions = migration.sql.match(/create\s+(?:or\s+replace\s+)?function\s+[\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi) ?? [];
      for (const fn of functions) {
        if (/security\s+definer/i.test(fn) && !/(set\s+search_path|set_config\s*\(\s*'search_path')/i.test(fn)) {
          violations.push(migration.name);
        }
      }
      expect(migration.sql).not.toMatch(/execute\s+(?:format\s*\(|\()/i);
    }
    expect(violations).toEqual([]);
  });

  it("limits broad read policies to public XP definition catalogs", () => {
    const broadPolicies = migrationFiles.flatMap(({ name, sql }) =>
      (sql.match(/create\s+policy[^;]+using\s*\(\s*true\s*\)\s*;/gi) ?? [])
        .map((policy) => `${name}:${policy}`));

    expect(broadPolicies).toHaveLength(2);
    expect(broadPolicies.every((policy) => /xp_(?:quest|badge)_definitions_read/i.test(policy))).toBe(true);
  });

  it("preserves owner-scoped Cloud, Goal, theme and exact-path asset boundaries", () => {
    const d2c1 = readFileSync(join(migrationDir, "20260728120000_owner_scoped_primary_key_enforcement.sql"), "utf8");
    const goals = readFileSync(join(migrationDir, "20260803120000_goal_cloud_v1_additive.sql"), "utf8");
    const theme = readFileSync(join(migrationDir, "20260809120000_d8_public_profile_theme.sql"), "utf8");
    const assets = readFileSync(join(migrationDir, "20260810120000_d8_profile_asset_visibility_hardening.sql"), "utf8");

    expect(d2c1).toContain("add constraint media_items_pkey primary key (row_pk)");
    expect(d2c1).toContain("media_items_owner_record_v2_key");
    expect(d2c1).toContain("on m.user_id=p.user_id and m.id=p.media_id");
    expect(d2c1).toContain("v_user uuid:=auth.uid()");
    expect(d2c1).toContain("revoke insert,update,delete");
    expect(goals).toContain("auth.uid()=user_id");
    expect(goals).toContain("v_user uuid:=auth.uid()");
    expect(goals).toContain("revoke all on table public.goals from public,anon,authenticated");
    expect(theme).toContain("v_user uuid:=auth.uid()");
    expect(theme).toContain("p_theme_visibility text");
    expect(assets).toContain("(storage.foldername(name))[1]=auth.uid()::text");
    expect(assets).toContain("public.social_profile_asset_visible(name,(storage.foldername(name))[1],auth.uid())");
  });
});
