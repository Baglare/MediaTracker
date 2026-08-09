import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authGetUser = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: authGetUser } })),
}));

import { GET as capabilitiesGet } from "@/app/api/ai/capabilities/route";
import { POST as recommendPost } from "@/app/api/ai/recommend/route";
import { deriveAiEntitlement, isServerVerifiedAdmin } from "@/lib/ai/entitlement";
import { resetRateLimitsForTests } from "@/lib/api/request-security";

function recommendRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ai/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "anime öner",
      mediaItems: [],
      progressLogs: [],
      settings: { useProfile: false, useOpenAIProvider: true, role: "admin" },
      researchMode: "source-apis",
      ...body,
    }),
  });
}

describe("D8-1 server-funded AI entitlement", () => {
  beforeEach(() => {
    process.env.AI_SERVER_ACCESS_MODE = "admin_only";
    resetRateLimitsForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.D7_RESEARCH_ACTIVE_ENABLED;
  });

  it("defaults disabled and trusts only server-verified app_metadata", () => {
    expect(deriveAiEntitlement(null, "disabled")).toMatchObject({ authenticated: false, isAdmin: false, canUseServerProviders: false });
    expect(deriveAiEntitlement({ id: "u", app_metadata: {} }, "admin_only")).toMatchObject({ authenticated: true, isAdmin: false, canUseServerProviders: false });
    expect(deriveAiEntitlement({ id: "a", app_metadata: { role: "admin" } }, "admin_only")).toMatchObject({ authenticated: true, isAdmin: true, canUseServerProviders: true, canUseOpenAi: true, canUseGroundedResearch: true });
    expect(isServerVerifiedAdmin({ app_metadata: {} } as never)).toBe(false);
    expect(isServerVerifiedAdmin({ app_metadata: {}, user_metadata: { role: "admin", is_admin: true } } as never)).toBe(false);
  });

  it.each([
    ["guest", null],
    ["authenticated non-admin", { id: "user-1", app_metadata: {}, user_metadata: { role: "admin" } }],
  ])("denies %s before any provider or grounded-research network call", async (_label, user) => {
    authGetUser.mockResolvedValue({ data: { user }, error: null });
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);
    process.env.D7_RESEARCH_ACTIVE_ENABLED = "1";
    const response = await recommendPost(recommendRequest({ settings: { useOpenAIProvider: true, role: "admin", isAdmin: true }, researchMode: "web" }) as never);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "ai_server_provider_forbidden" });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("returns an admin capability read-model without key/model/raw-role leakage", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "admin-1", app_metadata: { role: "admin" }, user_metadata: { private: "x" } } }, error: null });
    const response = await capabilitiesGet(new Request("http://localhost/api/ai/capabilities"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload).toEqual({ authenticated: true, isAdmin: true, canUseDeterministicAdvisor: true, canUseServerProviders: true, canUseOpenAi: true, canUseGroundedResearch: true });
    expect(JSON.stringify(payload)).not.toMatch(/key|model|role|userId|admin-1/i);
  });

  it("keeps client/local state non-authoritative in the UI and route", () => {
    const ui = readFileSync("components/ai-advisor.tsx", "utf8");
    const route = readFileSync("app/api/ai/recommend/route.ts", "utf8");
    expect(ui).toContain("/api/ai/capabilities");
    expect(ui).toContain("aiEntitlement?.canUseOpenAi === true");
    expect(route).toContain("entitlement.canUseOpenAi && body.settings?.useOpenAIProvider === true");
    expect(route.indexOf("ai_server_provider_forbidden")).toBeLessThan(route.indexOf("runPlanningWithProviders({"));
  });
});
