import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn(async () => ({ rpc })) }));
import { accountWriteLockedResponse, checkAccountWriteAllowed } from "@/lib/api/account-write-barrier";
import { supabaseApplicationError } from "@/lib/supabase/safe-error";
import { safeSocialRouteError } from "@/lib/social/route-response";
beforeEach(() => rpc.mockReset());

describe("account-write barrier HTTP contract", () => {
  it("ACTIVE preflight makes only an own-account assertion, with no admin target", async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await checkAccountWriteAllowed()).toBeNull();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("assert_account_write_allowed");
  });
  it("returns stable locked failure with no SQL, identity or erasure metadata", async () => {
    rpc.mockResolvedValue({ error: { message: "account_write_locked", details: "private-owner", hint: "secret-fixture" } });
    const result = await checkAccountWriteAllowed();
    expect(result?.status).toBe(423);
    expect(await result?.json()).toEqual({ code: "account_write_locked", message: "Hesap yazma işlemleri şu anda kullanılamıyor." });
    expect(result?.headers.get("cache-control")).toBe("private, no-store");
    const social = safeSocialRouteError(supabaseApplicationError({ message: "account_write_locked" }));
    expect(social.status).toBe(423);
    expect((await social.json()).code).toBe("account_write_locked");
  });
  it("unknown DB failures fail closed and exact-match mapping prevents raw error reflection", async () => {
    rpc.mockResolvedValue({ error: { message: "SQL account_write_locked owner=private-fixture" } });
    const result = await checkAccountWriteAllowed();
    expect(result?.status).toBe(503);
    expect(await result?.json()).toEqual({ code: "account_write_unavailable" });
    expect(accountWriteLockedResponse({ message: "SQL account_write_locked owner=private-fixture" })).toBeNull();
  });
});
