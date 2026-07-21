import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260721_social_profile_foundation.sql", import.meta.url), "utf8");
const smokeFixMigration = readFileSync(new URL("../supabase/migrations/20260721_social_profile_live_smoke_fixes.sql", import.meta.url), "utf8");
const protectedVisibilityV2 = readFileSync(new URL("../supabase/migrations/20260721_social_profile_protected_visibility_fix_v2.sql", import.meta.url), "utf8");

describe("social Supabase migration contract (static, not live RLS integration)", () => {
  it("enforces username uniqueness, cooldown, history reservation and serialized claims", () => {
    expect(migration).toContain("profiles_username_lower_unique");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("interval '90 days'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("profile_username_history");
  });

  it("prevents direct authenticated profile writes from bypassing the username RPC", () => {
    expect(migration).toContain("revoke insert, update on table public.profiles from authenticated");
    expect(migration).toContain("grant update (avatar_path, banner_path)");
  });

  it("implements every follow lifecycle action and atomic block cleanup", () => {
    for (const action of ["unfollow", "cancel", "accept", "reject", "remove_follower"]) expect(migration).toContain(`p_action='${action}'`);
    expect(migration).toContain("on conflict do nothing");
    expect(migration).toMatch(/delete from public\.profile_follows where \(follower_id=v_user and following_id=p_target\) or \(follower_id=p_target and following_id=v_user\)/);
  });

  it("keeps personal and soft-deleted profiles out of search with a hard result cap", () => {
    expect(migration).toContain("p.visibility_mode in ('public','protected')");
    expect(migration).toContain("p.deleted_at is null");
    expect(migration).toContain("not public.social_is_blocked(v_viewer,p.id)");
    expect(migration).toContain("limit least(20,greatest(1,p_limit))");
  });

  it("filters hidden modules and notes inside the security-definer profile resolver", () => {
    expect(migration).toContain("public.social_can_view_module(v_owner.id,visibility,v_viewer)");
    expect(migration).toContain("from public.profile_shared_notes where user_id=v_owner.id and public.social_can_view_module");
  });

  it("requires explicit shared-note confirmation and blocks direct table mutation", () => {
    expect(migration).toContain("p_confirmed is distinct from true");
    expect(migration).toContain("revoke insert, update, delete on table public.profile_shared_notes from authenticated");
    expect(migration).toMatch(/delete from public\.profile_shared_notes where id=p_note and user_id=auth\.uid\(\)/);
    expect(migration).not.toContain("delete from public.media_items");
  });

  it("uses a private owner-scoped storage bucket without a service role", () => {
    expect(migration).toContain("values('profile-assets','profile-assets',false");
    expect(migration).toContain("(storage.foldername(name))[1]=auth.uid()::text");
    expect(migration).toContain("social_profile_asset_visible");
    expect(migration).not.toContain("SERVICE_ROLE");
  });

  it("raises protected module visibility in a replacement server-side helper", () => {
    expect(smokeFixMigration).toContain("select visibility_mode");
    expect(smokeFixMigration).toContain("v_profile_visibility = 'public' and p_visibility = 'public'");
    expect(smokeFixMigration).toContain("status = 'accepted'");
    expect(smokeFixMigration).toContain("p_visibility in ('public', 'followers')");
    expect(smokeFixMigration).not.toMatch(/update\s+public\.profile_modules/i);
  });

  it("ships the protected visibility replacement as a second deployable migration", () => {
    expect(protectedVisibilityV2).toContain("create or replace function public.social_can_view_module");
    expect(protectedVisibilityV2).toContain("select visibility_mode");
    expect(protectedVisibilityV2).toContain("status = 'accepted'");
    expect(protectedVisibilityV2).not.toMatch(/update\s+public\.profile_modules/i);
  });
});
