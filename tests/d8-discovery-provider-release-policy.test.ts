import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as searchAniList } from "@/app/api/anilist/search/route";
import { POST as searchOmdb } from "@/app/api/omdb/search/route";
import { POST as searchOpenLibrary } from "@/app/api/openlibrary/search/route";
import { POST as searchTmdb } from "@/app/api/tmdb/search/route";
import { GET as providerCapabilities } from "@/app/api/providers/capabilities/route";
import { categoriesForCapabilities, categoryForCapabilities } from "@/components/global-search";
import { shouldShowDashboardRightRail } from "@/features/library/domain/selectors";
import { resetRateLimitsForTests } from "@/lib/api/request-security";
import { resolvePublicProviderCapabilities } from "@/lib/providers/release-policy";
import type { PublicProviderCapabilities } from "@/lib/providers/types";

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function capabilities(enabled: Partial<Record<keyof PublicProviderCapabilities["providers"], boolean>>): PublicProviderCapabilities {
  const value = resolvePublicProviderCapabilities({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  for (const [provider, isEnabled] of Object.entries(enabled)) {
    const id = provider as keyof typeof value.providers;
    value.providers[id] = { enabled: Boolean(isEnabled), reason: isEnabled ? "enabled" : "disabled_by_policy" };
  }
  return value;
}

describe("D8-4A.5C1 provider release policy", () => {
  beforeEach(() => resetRateLimitsForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fails closed by default and rejects invalid modes", () => {
    const defaultPolicy = resolvePublicProviderCapabilities({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(defaultPolicy.providers).toMatchObject({
      tvmaze: { enabled: true },
      openlibrary: { enabled: false, reason: "missing_configuration" },
      anilist: { enabled: false },
      tmdb: { enabled: false },
      omdb: { enabled: false },
    });
    const invalid = resolvePublicProviderCapabilities({
      NODE_ENV: "production",
      MEDIA_TRACKER_ANILIST_MODE: "yes",
      MEDIA_TRACKER_TMDB_MODE: "enabled",
    } as NodeJS.ProcessEnv);
    expect(invalid.providers.anilist.enabled).toBe(false);
    expect(invalid.providers.tmdb.enabled).toBe(false);
  });

  it("allows AniList preview_test only outside Vercel production and accepts explicit authorized mode", () => {
    expect(resolvePublicProviderCapabilities({ VERCEL_ENV: "preview", NODE_ENV: "production", MEDIA_TRACKER_ANILIST_MODE: "preview_test" } as NodeJS.ProcessEnv).providers.anilist.enabled).toBe(true);
    expect(resolvePublicProviderCapabilities({ VERCEL_ENV: "production", NODE_ENV: "production", MEDIA_TRACKER_ANILIST_MODE: "preview_test" } as NodeJS.ProcessEnv).providers.anilist).toEqual({ enabled: false, reason: "authorization_required" });
    expect(resolvePublicProviderCapabilities({ VERCEL_ENV: "production", NODE_ENV: "production", MEDIA_TRACKER_ANILIST_MODE: "authorized" } as NodeJS.ProcessEnv).providers.anilist.enabled).toBe(true);
  });

  it("requires TMDB mode, token and approved logo contract together", () => {
    const withoutLogo = resolvePublicProviderCapabilities({ NODE_ENV: "production", MEDIA_TRACKER_TMDB_MODE: "noncommercial", TMDB_READ_ACCESS_TOKEN: "test-token" } as NodeJS.ProcessEnv);
    expect(withoutLogo.providers.tmdb).toEqual({ enabled: false, reason: "attribution_required" });
    const ready = resolvePublicProviderCapabilities(
      { NODE_ENV: "production", MEDIA_TRACKER_TMDB_MODE: "noncommercial", TMDB_READ_ACCESS_TOKEN: "test-token" } as NodeJS.ProcessEnv,
      { tmdbApprovedLogoAvailable: true },
    );
    expect(ready.providers.tmdb.enabled).toBe(true);
  });

  it("requires a bounded MediaTracker User-Agent with contact for Open Library", () => {
    expect(resolvePublicProviderCapabilities({ MEDIA_TRACKER_PROVIDER_USER_AGENT: "MediaTracker/1" } as NodeJS.ProcessEnv).providers.openlibrary.enabled).toBe(false);
    expect(resolvePublicProviderCapabilities({ MEDIA_TRACKER_PROVIDER_USER_AGENT: "MediaTracker/1 (contact@example.test)" } as NodeJS.ProcessEnv).providers.openlibrary.enabled).toBe(true);
  });

  it.each([
    ["OMDb", searchOmdb, "/api/omdb/search", {}],
    ["TMDB", searchTmdb, "/api/tmdb/search", { MEDIA_TRACKER_TMDB_MODE: "disabled" }],
    ["AniList", searchAniList, "/api/anilist/search", { MEDIA_TRACKER_ANILIST_MODE: "preview_test", VERCEL_ENV: "production" }],
    ["Open Library", searchOpenLibrary, "/api/openlibrary/search", { MEDIA_TRACKER_PROVIDER_USER_AGENT: "" }],
  ] as const)("does not start a %s upstream request while disabled", async (_label, route, path, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await route(post(path, { query: "bounded query" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "provider_unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("publishes only sanitized stable capability fields", async () => {
    vi.stubEnv("MEDIA_TRACKER_ANILIST_MODE", "disabled");
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "must-not-leak");
    const response = await providerCapabilities();
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["version", "providers"]);
    expect(JSON.stringify(body)).not.toMatch(/must-not-leak|token|key|model/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("D8-4A.5C1 Discover layout and card contract", () => {
  it("hides the right rail only on the existing excluded tabs plus Discover", () => {
    expect(shouldShowDashboardRightRail("discover")).toBe(false);
    expect(shouldShowDashboardRightRail("dashboard")).toBe(false);
    expect(shouldShowDashboardRightRail("ai")).toBe(false);
    expect(shouldShowDashboardRightRail("settings")).toBe(false);
    expect(shouldShowDashboardRightRail("library")).toBe(true);
    expect(shouldShowDashboardRightRail("calendar")).toBe(true);
  });

  it("derives chips from enabled capabilities and normalizes disabled prefill", () => {
    const value = capabilities({ tvmaze: true, openlibrary: true });
    expect(categoriesForCapabilities(value).map((entry) => entry.value)).toEqual(["all", "tv", "book"]);
    expect(categoryForCapabilities("movie", value)).toBe("all");
    expect(categoryForCapabilities("book", value)).toBe("book");
  });

  it("shares the presentation shell without fake MediaItem actions", () => {
    const library = readFileSync("components/media-card.tsx", "utf8");
    const discovery = readFileSync("components/global-search-result-card.tsx", "utf8");
    expect(library).toContain("<MediaCardShell");
    expect(discovery).toContain("<MediaCardShell");
    expect(discovery).not.toContain("MediaItem");
    expect(discovery).not.toMatch(/onEdit|onDelete|onIncrement|onComplete/);
    expect(discovery).toContain("mt-auto flex min-h-12");
  });

  it("keeps titles, tags, description and grid bounded", () => {
    const card = readFileSync("components/global-search-result-card.tsx", "utf8");
    const search = readFileSync("components/global-search.tsx", "utf8");
    expect(card).toMatch(/line-clamp-2.*overflow-wrap:anywhere.*word-break:normal/);
    expect(card).toContain(".slice(0, 3)");
    expect(card).toContain("<SearchResultDescription");
    expect(card).toContain("max-w-[9rem] truncate");
    expect(search.match(/grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3/g)).toHaveLength(2);
    expect(search).not.toMatch(/(^|[^2])xl:grid-cols-3/);
  });

  it("keeps legacy OMDb values but removes active search and attribution", () => {
    const candidate = readFileSync("lib/ai/candidate-search.ts", "utf8");
    const globalSearch = readFileSync("components/global-search.tsx", "utf8");
    const settings = readFileSync("features/settings/components/settings-feature.tsx", "utf8");
    const types = readFileSync("lib/global-search-types.ts", "utf8");
    expect(candidate).not.toContain("/api/omdb/search");
    expect(globalSearch).not.toContain("/api/omdb/search");
    expect(settings).not.toContain("OMDb");
    expect(types).toContain('| "omdb"');
  });

  it("renders only active attribution and safe canonical source links", () => {
    const settings = readFileSync("features/settings/components/settings-feature.tsx", "utf8");
    const card = readFileSync("components/global-search-result-card.tsx", "utf8");
    expect(settings).toContain("CC BY-SA");
    expect(settings).toContain("Open Library");
    expect(settings).toContain("This product uses the");
    expect(settings).toContain("but is not endorsed or certified by TMDB.");
    expect(card).toContain('rel="noopener noreferrer"');
    expect(card).toContain("result.sourceUrl");
  });
});
