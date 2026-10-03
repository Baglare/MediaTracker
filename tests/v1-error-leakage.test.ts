import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ server: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.server }));
vi.mock("@/lib/providers/release-policy", () => ({ publicProviderCapability: () => ({ enabled: true, reason: "enabled" }) }));
import { POST as search } from "@/app/api/tvmaze/search/route";
import { GET as xp } from "@/app/api/xp/route";
import { GET as profile } from "@/app/api/social/profile/route";
import { GET as omdb } from "@/app/api/omdb/details/route";
import { resetRateLimitsForTests } from "@/lib/api/request-security";
import { openaiProvider } from "@/lib/ai/providers/openai-compatible-provider";
import { generateGeminiRetrievalPlan } from "@/lib/ai/providers/gemini-provider";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/local-state";
import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import { safeDiagnostic } from "@/lib/security/safe-diagnostic";
const leak = "SQL SELECT password FROM users; C:\\internal\\secret.ts private@example.test eyJ.secret.token project-ref-private raw-provider-body";
const req = () => new NextRequest("https://tracker.test/api/tvmaze/search?private=query", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": leak, Authorization: "Bearer secret", Cookie: "session=secret" }, body: JSON.stringify({ query: "personal-search-text" }) });
let sink: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitsForTests();
  sink = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.server.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } }, error: null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function clean(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  const text = await response.text();
  for (const forbidden of [leak, "SELECT password", "secret.ts", "private@example.test", "eyJ.secret.token", "project-ref-private", "raw-provider-body", "personal-search-text", "stack", "Bearer secret", "session=secret"]) {
    expect(text).not.toContain(forbidden);
    expect(JSON.stringify(sink.mock.calls)).not.toContain(forbidden);
  }
  return JSON.parse(text);
}
describe("route failure surfaces", () => {
  it.each(["timeout", "500"])("provider %s returns stable code without upstream detail", async (kind) => {
    vi.stubGlobal("fetch", kind === "timeout" ? vi.fn().mockRejectedValue(new Error(leak, { cause: leak })) : vi.fn().mockResolvedValue(new Response(leak, { status: 500 })));
    expect(await clean(await search(req()), 502)).toEqual({ code: "upstream_error" });
  });
  it("malformed request neither echoes body nor calls provider", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const request = new NextRequest("https://tracker.test/api/tvmaze/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: leak });
    expect(await clean(await search(request), 400)).toEqual({ code: "invalid_json" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("auth failure hides session/internal payload", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: leak } });
    expect(await clean(await xp(), 401)).toEqual({ message: "Bu işlem için giriş yapmalısın." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("mocked RLS/DB failure hides message, detail and hint", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: leak, details: leak, hint: leak } });
    expect(await clean(await xp(), 500)).toEqual({ message: "XP işlemi tamamlanamadı." });
  });
  it("unexpected route failure is caught before framework logging", async () => {
    mocks.server.mockRejectedValue(new Error(leak));
    expect(await clean(await profile(), 500)).toEqual({ error: "internal_error" });
  });
  it("legacy OMDb detail error never echoes provider Error field", async () => {
    vi.stubEnv("OMDB_API_KEY", "provider-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ Response: "False", Error: leak })));
    expect(await clean(await omdb(new NextRequest("https://tracker.test/api/omdb/details?id=tt1")), 502)).toEqual({ error: "omdb_upstream_error" });
  });
});

describe("dormant provider diagnostics (mock network only)", () => {
  const args = { message: "synthetic request", profile: null, settings: DEFAULT_AI_SETTINGS, intent: analyzeIntent("synthetic request") };
  it.each(["openai", "gemini"])("%s does not put raw upstream bodies or transport errors in exceptions", async (provider) => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
    vi.stubEnv("GEMINI_API_KEY", "synthetic-key");
    const call = () => provider === "openai" ? openaiProvider.generateRetrievalPlan!(args) : generateGeminiRetrievalPlan(args);
    for (const failure of [vi.fn().mockResolvedValue(new Response(leak, { status: 500 })), vi.fn().mockRejectedValue(new Error(leak))]) {
      vi.stubGlobal("fetch", failure);
      await expect(call()).rejects.toMatchObject({ code: "api_error" });
      await call().catch((error: Error) => { for (const fragment of [leak, "SQL", "secret.ts", "private@example.test", "project-ref-private"]) expect(error.message).not.toContain(fragment); });
    }
  });
  it("research diagnostic allowlist strips free text while preserving controlled security codes", () => {
    expect(safeDiagnostic(new Error(leak), "adapter_failure")).toBe("adapter_failure");
    expect(safeDiagnostic(new Error(`research_document_security_rejected:${leak}`), "adapter_failure")).toBe("research_document_security_rejected");
  });
});
