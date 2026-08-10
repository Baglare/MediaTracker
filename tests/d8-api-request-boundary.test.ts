import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as tmdbPost } from "@/app/api/tmdb/search/route";
import { POST as omdbPost } from "@/app/api/omdb/search/route";
import { POST as tvmazePost } from "@/app/api/tvmaze/search/route";
import { POST as anilistPost } from "@/app/api/anilist/search/route";
import { POST as openLibraryPost } from "@/app/api/openlibrary/search/route";
import nextConfig from "@/next.config";
import { SEARCH_QUERY_MAX_LENGTH, enforceRateLimit, resetRateLimitsForTests } from "@/lib/api/request-security";

vi.mock("@/lib/providers/release-policy", () => ({
  publicProviderCapability: () => ({ enabled: true, reason: "enabled" }),
}));

function post(path: string, body: unknown, headers: HeadersInit = { "Content-Type": "application/json" }) {
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("D8-1 search POST JSON boundary", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    process.env.TMDB_READ_ACCESS_TOKEN = "token";
    process.env.OMDB_API_KEY = "key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TMDB_READ_ACCESS_TOKEN;
    delete process.env.OMDB_API_KEY;
  });

  it("preserves all five provider response contracts and keeps query out of internal URLs", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname.includes("themoviedb")) return Response.json({ results: [{ id: 1, title: "Movie" }] });
      if (url.hostname.includes("omdbapi")) return url.searchParams.has("s")
        ? Response.json({ Response: "True", Search: [{ imdbID: "tt1" }] })
        : Response.json({ Response: "True", imdbID: "tt1", Title: "Movie" });
      if (url.hostname.includes("tvmaze")) return Response.json([{ show: { id: 2, name: "Show" } }]);
      if (url.hostname.includes("anilist")) return Response.json({ data: { Page: { media: [{ id: 3, type: "ANIME", title: { english: "Anime" } }] } } });
      return Response.json({ numFound: 1, docs: [{ key: "/works/1", title: "Book" }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const secretQuery = "private search text";
    const responses = await Promise.all([
      tmdbPost(post("/api/tmdb/search", { query: secretQuery })),
      omdbPost(post("/api/omdb/search", { query: secretQuery })),
      tvmazePost(post("/api/tvmaze/search", { query: secretQuery })),
      anilistPost(post("/api/anilist/search", { query: secretQuery, category: "anime" })),
      openLibraryPost(post("/api/openlibrary/search", { query: secretQuery })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json()).results).toHaveLength(1);
    }
    expect(fetcher.mock.calls.some((call) => [...new URL(String(call[0])).searchParams.values()].includes(secretQuery))).toBe(true);
  });

  it.each([
    ["unknown field", post("/api/tvmaze/search", { query: "x", extra: true }), 400, "unknown_field"],
    ["empty query", post("/api/tvmaze/search", { query: "   " }), 400, "search_query_invalid"],
    ["oversized query", post("/api/tvmaze/search", { query: "x".repeat(SEARCH_QUERY_MAX_LENGTH + 1) }), 400, "search_query_invalid"],
    ["wrong content type", post("/api/tvmaze/search", { query: "x" }, { "Content-Type": "text/plain" }), 415, "unsupported_content_type"],
    ["invalid origin", post("/api/tvmaze/search", { query: "x" }, { "Content-Type": "application/json", Origin: "https://evil.example" }), 403, "invalid_origin"],
  ])("rejects %s with a stable public error", async (_name, request, status, code) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await tvmazePost(request);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enforces process-local rate limit deterministically", async () => {
    expect(enforceRateLimit("test", "user:1", 1, 60_000, 100)).toBeNull();
    const denied = enforceRateLimit("test", "user:1", 1, 60_000, 101);
    expect(denied?.status).toBe(429);
    expect(await denied?.json()).toEqual({ code: "rate_limited" });
  });

  it("production UI and internal adapters contain no search query string", () => {
    for (const file of ["components/global-search.tsx", "components/anilist-search.tsx", "components/tvmaze-search.tsx", "components/openlibrary-search.tsx", "components/social/people-search.tsx", "components/social/recommendation-composer.tsx", "lib/anilist-search-diagnostic.ts", "lib/ai/candidate-search.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\/api\/(tmdb|omdb|tvmaze|anilist|openlibrary)\/search\?[^"'`]*[qQ]=/);
      expect(source).not.toMatch(/\/api\/social\/people\?[^"'`]*q=/);
    }
  });

  it("sets the minimum security-header contract", async () => {
    const entries = await nextConfig.headers?.();
    const headers = new Map(entries?.[0].headers.map((header) => [header.key, header.value]));
    const csp = headers.get("Content-Security-Policy") || "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
