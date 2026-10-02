import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { assertSafeSupabaseTestTarget } from "@/lib/supabase-test-target";

const requiredEnvironment = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_ANON_KEY",
  "SUPABASE_TEST_USER_A_EMAIL",
  "SUPABASE_TEST_USER_A_PASSWORD",
  "SUPABASE_TEST_USER_B_EMAIL",
  "SUPABASE_TEST_USER_B_PASSWORD",
] as const;

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const configured = missingEnvironment.length === 0;
let isolatedTarget = false;

if (configured) {
  try {
    assertSafeSupabaseTestTarget(process.env.SUPABASE_TEST_URL!);
    isolatedTarget = true;
  } catch {
    isolatedTarget = false;
  }
}

const live = configured && isolatedTarget;

function client(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_TEST_URL!,
    process.env.SUPABASE_TEST_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}

function expectPermissionDenied(error: { code?: string; message: string } | null): void {
  expect(error).not.toBeNull();
  expect(`${error?.code ?? ""} ${error?.message ?? ""}`).toMatch(/42501|permission denied/i);
}

function expectNotExecutable(error: { code?: string; message: string } | null): void {
  expect(error).not.toBeNull();
  expect(`${error?.code ?? ""} ${error?.message ?? ""}`).toMatch(
    /42501|permission denied|PGRST202|could not find the function/i,
  );
}

describe.runIf(live)("D8 Security Advisor hardening live Staging contract", () => {
  let guest: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let userAId = "";

  beforeAll(async () => {
    guest = client();
    userA = client();
    userB = client();
    const [a, b] = await Promise.all([
      userA.auth.signInWithPassword({
        email: process.env.SUPABASE_TEST_USER_A_EMAIL!,
        password: process.env.SUPABASE_TEST_USER_A_PASSWORD!,
      }),
      userB.auth.signInWithPassword({
        email: process.env.SUPABASE_TEST_USER_B_EMAIL!,
        password: process.env.SUPABASE_TEST_USER_B_PASSWORD!,
      }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    userAId = a.data.user?.id ?? "";
    expect(userAId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("keeps the reviewed public profile search available to Guest", async () => {
    const publicSearch = await guest.rpc("search_social_profiles", {
      p_query: "zz",
      p_offset: 0,
      p_limit: 1,
    });
    expect(publicSearch.error).toBeNull();
    expect(Array.isArray(publicSearch.data)).toBe(true);

    const publicXp = await guest.rpc("get_xp_public_summary", {
      p_user: crypto.randomUUID(),
    });
    expect(publicXp.error).toBeNull();
    expect(publicXp.data).toBeNull();

    expectPermissionDenied((await guest.rpc("social_get_preferences")).error);
    expectPermissionDenied((await guest.rpc("get_theme_sync_state")).error);
  });

  it("keeps authenticated read and harmless mutation RPCs available", async () => {
    const preferences = await userA.rpc("social_get_preferences");
    expect(preferences.error).toBeNull();
    expect(preferences.data).toBeTruthy();

    const theme = await userA.rpc("get_theme_sync_state");
    expect(theme.error).toBeNull();
    expect(theme.data).toMatchObject({ schemaVersion: 1 });

    const harmlessMutation = await userA.rpc("social_unblock", {
      p_target: crypto.randomUUID(),
    });
    expect(harmlessMutation.error).toBeNull();
    expect(harmlessMutation.data).toMatchObject({ ok: true });

    const selfFollow = await userA.rpc("social_follow", { p_target: userAId });
    expect(selfFollow.error?.message).toMatch(/self_follow_not_allowed/i);
    const selfBlock = await userA.rpc("social_block", { p_target: userAId });
    expect(selfBlock.error?.message).toMatch(/self_block_not_allowed/i);
  });

  it("denies direct execution of an internal SECURITY DEFINER helper", async () => {
    const result = await userA.rpc("social_is_blocked", {
      p_a: userAId,
      p_b: crypto.randomUUID(),
    });
    expectNotExecutable(result.error);
  });

  it("denies embedding_cache reads and writes to Guest and authenticated users", async () => {
    for (const [role, roleClient] of [
      ["anon", guest],
      ["authenticated-a", userA],
      ["authenticated-b", userB],
    ] as const) {
      const id = `d8-denied-${role}-${crypto.randomUUID()}`;
      expectPermissionDenied((await roleClient.from("embedding_cache").select("id").limit(1)).error);
      expectPermissionDenied((await roleClient.from("embedding_cache").insert({
        id,
        provider: "d8-denial-probe",
        model: "none",
        hash: id,
        dimensions: 1,
        vector: [0],
      })).error);
      expectPermissionDenied((await roleClient.from("embedding_cache").update({ last_used_at: new Date(0).toISOString() }).eq("id", id)).error);
      expectPermissionDenied((await roleClient.from("embedding_cache").delete().eq("id", id)).error);
    }
  });
});

describe.skipIf(live)("D8 Security Advisor hardening live Staging guard", () => {
  it("does not run without isolated Test/Staging credentials", () => {
    expect(live).toBe(false);
  });
});
