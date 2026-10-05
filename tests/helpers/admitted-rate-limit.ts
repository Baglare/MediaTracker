import { vi } from "vitest";
// Existing route regression tests isolate their original contract with an admitted
// limiter dependency. Actual unavailable/denied/identity/transport tests live in
// v1-distributed-rate-limit.test.ts; this fixture never configures a runtime bypass.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/distributed-rate-limit", () => ({
  enforceDistributedRateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ allowed: true, source: "distributed" })),
  reportProviderCooldown: vi.fn(async (_request: Request, _policy: string, response: Response) => response.status === 429
    ? Response.json({ code: "rate_limited" }, { status: 429, headers: { "Retry-After": response.headers.get("retry-after") ?? "30", "Cache-Control": "no-store" } }) : null),
}));
