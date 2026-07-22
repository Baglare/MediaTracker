import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "20260722110000_unified_profile_presentation.sql";
const migration = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

describe("unified profile migration contract (static, not live RLS integration)", () => {
  it("uses a unique fourteen-digit migration timestamp", () => {
    const names = readdirSync("supabase/migrations").filter((name) => /^\d{14}_.+\.sql$/.test(name));
    expect(migrationName).toMatch(/^\d{14}_.+\.sql$/);
    expect(new Set(names.map((name) => name.slice(0, 14))).size).toBe(names.length);
  });

  it.each(["tagline", "profile_palette_id", "banner_mode", "banner_position", "overlay_strength", "avatar_frame", "surface_style", "motif_intensity"])("adds %s", (column) => {
    expect(migration).toContain(`add column if not exists ${column}`);
  });

  it("constrains tagline length and markup", () => {
    expect(migration).toContain("length(tagline)<=120");
    expect(migration).toContain("tagline !~ '[<>]'");
    expect(migration).toContain("length(coalesce(p_tagline,''))>120");
  });

  it("enforces every presentation allowlist in SQL", () => {
    expect(migration).toContain("profile_palette_id in ('neutral','east','screen','arch','ocean')");
    expect(migration).toContain("banner_mode in ('none','gradient','world','image')");
    expect(migration).toContain("banner_position in ('top','center','bottom')");
    expect(migration).toContain("overlay_strength in ('low','medium','high')");
    expect(migration).toContain("avatar_frame in ('none','subtle','world','tier')");
    expect(migration).toContain("surface_style in ('solid','soft_glass','textured')");
    expect(migration).toContain("motif_intensity in ('none','subtle','full')");
  });

  it("keeps connection color separate from profile palette", () => {
    expect(migration).toContain("p_connection_color");
    expect(migration).toContain("p_profile_palette_id");
    expect(migration).not.toMatch(/profile_palette_id\s*=\s*p_connection_color/);
  });

  it("binds profile mutation to auth.uid and prevents client-selected ids", () => {
    expect(migration).toContain("v_user uuid:=auth.uid()");
    expect(migration).toContain("where id=v_user");
    expect(migration).not.toMatch(/p_user_id\s+uuid/);
  });

  it("keeps direct profile writes revoked and permits only asset paths", () => {
    expect(migration).toContain("revoke insert,update on table public.profiles from authenticated");
    expect(migration).toContain("grant update (avatar_path,banner_path)");
  });

  it("exposes presentation only through the existing visibility-safe loader", () => {
    expect(migration).toContain("v_payload:=public.get_social_profile(p_username)");
    expect(migration).toContain("if v_payload->>'status'<>'available' then return v_payload");
  });

  it("keeps the migration body mirrored in schema.sql", () => {
    const body = migration.split(/\r?\n/).slice(1).join("\n").trim();
    expect(schema.replace(/\r\n/g, "\n")).toContain(body);
  });
});
