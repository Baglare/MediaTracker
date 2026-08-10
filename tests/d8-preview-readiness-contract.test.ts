import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("D8-4A.5 Preview readiness contract", () => {
  it("keeps the archived annotation surface fail-closed in production", () => {
    const access = source("features/recommendations/evaluation/annotation-tool/access.ts");
    const page = source("app/dev/recommendation-annotation/page.tsx");
    const route = source("app/api/dev/recommendation-annotation/route.ts");

    expect(access).toContain('input.nodeEnv === "production"');
    expect(access).toContain('{ allowed: false, reason: "production" }');
    expect(page).toContain("annotationToolAccessForHost");
    expect(page).toContain("notFound()");
    expect(route).toContain("annotationApiGuard(request)");
  });

  it("keeps privileged Supabase credentials server-only", () => {
    const persistentCache = source("lib/ai/persistent-embedding-cache.ts");
    const browserClient = source("lib/supabase/client.ts");

    expect(persistentCache.trimStart()).toMatch(/^import "server-only";/);
    expect(persistentCache).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(browserClient).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("supports Vercel request origins without a localhost-only dependency", () => {
    const candidateSearch = source("lib/ai/candidate-search.ts");
    const requestSecurity = source("lib/api/request-security.ts");

    expect(candidateSearch).toContain("process.env.VERCEL_URL");
    expect(candidateSearch.indexOf("process.env.VERCEL_URL"))
      .toBeLessThan(candidateSearch.indexOf('return "http://localhost:3000"'));
    expect(requestSecurity).toContain("new URL(origin).origin === new URL(request.url).origin");
  });

  it("keeps incompatible cloud rollout combinations fail-closed", () => {
    const media = source("lib/cloud-rollout.ts");
    const goals = source("features/goals/cloud/rollout.ts");

    expect(media).toContain('status: "incompatible"');
    expect(media).toContain("v2_client_requires_additive_schema");
    expect(media).toContain("legacy_client_blocked_after_pk_cutover");
    expect(goals).toContain("goal_schema_unavailable");
  });

  it("retains the minimum production security-header contract", () => {
    const config = source("next.config.ts");

    for (const value of [
      "Content-Security-Policy",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Content-Type-Options",
    ]) expect(config).toContain(value);
  });
});
