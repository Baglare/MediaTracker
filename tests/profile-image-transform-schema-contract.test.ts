import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const name = "20260722120000_profile_image_transforms.sql";
const migration = readFileSync(`supabase/migrations/${name}`, "utf8");
const oldMigration = readFileSync("supabase/migrations/20260722110000_unified_profile_presentation.sql", "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

describe("profile image transform migration contract (static, not live RLS integration)", () => {
  it("uses a unique fourteen-digit migration timestamp", () => {
    const names = readdirSync("supabase/migrations").filter((entry) => /^\d{14}_.+\.sql$/.test(entry));
    expect(name).toMatch(/^\d{14}_.+\.sql$/);
    expect(new Set(names.map((entry) => entry.slice(0, 14))).size).toBe(names.length);
  });

  it.each(["banner_focal_x", "banner_focal_y", "banner_zoom", "avatar_focal_x", "avatar_focal_y", "avatar_zoom"])("adds and persists %s", (field) => {
    expect(migration).toContain(`add column if not exists ${field}`);
    expect(migration).toContain(field);
  });

  it("constrains focal points and zoom", () => {
    expect(migration).toContain("banner_focal_x between 0 and 100");
    expect(migration).toContain("banner_zoom between 1 and 3");
    expect(migration).toContain("avatar_focal_x between 0 and 100");
    expect(migration).toContain("avatar_zoom between 1 and 3");
    expect(migration).toContain("invalid_image_transform");
  });

  it("keeps the mutation auth-bound without a client-selected user id", () => {
    expect(migration).toContain("v_user uuid:=auth.uid()");
    expect(migration).toContain("where id=v_user");
    expect(migration).not.toContain("p_user_id uuid");
  });

  it("does not rewrite the applied P2 migration", () => {
    expect(oldMigration).not.toContain("banner_focal_x");
    expect(oldMigration).not.toContain("avatar_zoom");
  });

  it("is mirrored in schema.sql", () => {
    const body = migration.replace(/\r\n/g, "\n").trim();
    expect(schema.replace(/\r\n/g, "\n")).toContain(body);
  });
});
