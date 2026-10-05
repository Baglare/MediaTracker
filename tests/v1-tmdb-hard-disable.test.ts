import "./helpers/admitted-rate-limit";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as search, normalizeMovieResult } from "@/app/api/tmdb/search/route";
import { GET as details } from "@/app/api/tmdb/details/route";
import { GET as calendar } from "@/app/api/calendar/tmdb/route";
import { GET as capabilities } from "@/app/api/providers/capabilities/route";
import { enforceDistributedRateLimit } from "@/lib/api/distributed-rate-limit";
import { categoriesForCapabilities } from "@/components/global-search";
import MediaCard from "@/components/media-card";
import MediaDetailModal from "@/components/media-detail-modal";
import { mapTmdbResult } from "@/features/discovery/domain/media-mappers";
import { adaptTmdbEvidence } from "@/features/recommendations/providers/tmdb-adapter";
import { prepareProviderEvidencePipeline } from "@/features/recommendations/providers/pipeline";
import { decodeMediaItem } from "@/lib/local-data-codec";
import { loadMediaList, saveMediaList } from "@/lib/local-data-storage";
import { createPortableBackup, inspectPortableBackupText } from "@/lib/portable-backup";
import { emptyMediaIdentityAliasRegistry } from "@/lib/media-identity-aliases";
import { emptyMediaRecordRedirectRegistry } from "@/lib/media-record-redirects";
import { fromMediaRow, toMediaRow } from "@/lib/supabase/mapping";
import { searchCandidatesWithDebug } from "@/lib/ai/candidate-search";
import { createReleaseProviders, releaseProviderForMedia } from "@/features/calendar/providers/release-providers";
import { createReleaseCacheEntry, emptyReleaseCalendarCache, upsertReleaseCacheEntry } from "@/features/calendar/data/release-cache";
import { buildReleaseAgendaView, refreshReleaseCalendarCache } from "@/features/calendar/services/release-calendar-service";
import { GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

function snapshot() {
  return { externalSource: "tmdb" as const, externalId: "550", type: "movie" as const, title: "Legacy Movie", totalProgress: 1 as const, coverUrl: "https://image.tmdb.org/t/p/w500/fixture.jpg", imdbId: "tt0137523", genres: ["Drama"] };
}

describe("V1 TMDB hard-disable", () => {
  it.each([undefined, "disabled", "noncommercial", "arbitrary"])("denies every route before admission with mode %s even with a token", async (mode) => {
    vi.stubEnv("MEDIA_TRACKER_TMDB_MODE", mode);
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "synthetic-test-token");
    const fetcher = vi.fn(() => { throw new Error("Unexpected network"); });
    vi.stubGlobal("fetch", fetcher);
    for (const environment of [undefined, "preview", "production", "development"]) {
      vi.stubEnv("VERCEL_ENV", environment);
      for (const nodeEnvironment of ["development", "production", "test"]) {
        vi.stubEnv("NODE_ENV", nodeEnvironment);
        const responses = await Promise.all([
          search(new NextRequest("http://localhost/api/tmdb/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "Example", mediaType: "movie" }) })),
          details(new NextRequest("http://localhost/api/tmdb/details?id=550")),
          calendar(new NextRequest("http://localhost/api/calendar/tmdb?movieId=550")),
        ]);
        for (const response of responses) {
          expect(response.status).toBe(503);
          expect(response.headers.get("cache-control")).toBe("no-store");
          expect(await response.json()).toMatchObject({ code: "provider_unavailable", reason: "disabled_by_policy" });
        }
      }
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(enforceDistributedRateLimit).not.toHaveBeenCalled();
  });

  it("excludes live movie search via the real capability endpoint", async () => {
    vi.stubEnv("MEDIA_TRACKER_TMDB_MODE", "noncommercial");
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "synthetic-test-token");
    const body = await (await capabilities()).json();
    expect(body.providers.tmdb).toEqual({ enabled: false, reason: "disabled_by_policy" });
    expect(categoriesForCapabilities(body).map((entry) => entry.value)).not.toContain("movie");
    expect(readFileSync("components/global-search.tsx", "utf8")).toContain('capabilities.providers.tmdb.enabled && (activeCategory === "all" || activeCategory === "movie")');
    expect(readFileSync("features/settings/components/settings-feature.tsx", "utf8")).toContain("capabilities.providers.tmdb.enabled && <li>");
  });

  it("cannot acquire recommendation candidates or new evidence through live proxies", async () => {
    vi.stubEnv("MEDIA_TRACKER_TMDB_MODE", "noncommercial");
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "synthetic-test-token");
    const upstream = vi.fn(() => { throw new Error("Unexpected upstream"); });
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const request = new NextRequest(url, { ...init, signal: init?.signal ?? undefined });
      if (url.pathname === "/api/tmdb/search") return search(request);
      if (url.pathname === "/api/tmdb/details") return details(request);
      return upstream();
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({
      intent: { kind: "general_recommendation", references: [], targetTypes: ["movie"], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false },
      retrievalPlan: { taskType: "general_recommendation", interpretation: "movie", targetMediaTypes: ["movie"], sourceTypes: [], preferenceSignals: [], avoidSignals: [], needsClarification: false, searchPlans: [{ source: "tmdb", mediaType: "movie", queries: ["Example"], reason: "fixture" }] },
      profile: null, message: "Film öner", mediaItems: [], progressLogs: [],
    });
    expect(fetcher).toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
    const raw = snapshot();
    const candidate = { source: "tmdb" as const, externalId: raw.externalId, type: "movie" as const, title: raw.title, globalSearch: { source: "tmdb" as const, externalId: raw.externalId, type: "movie" as const, title: raw.title, raw } };
    const evidence = await prepareProviderEvidencePipeline({ baseUrl: "http://localhost", candidates: [candidate], fetchImpl: fetcher });
    expect(evidence.candidates).toEqual([candidate]);
    expect(evidence.telemetry.enrichmentFailures).toBe(1);
    expect(upstream).not.toHaveBeenCalled();
    expect(enforceDistributedRateLimit).not.toHaveBeenCalled();
  });

  it("keeps a legacy Calendar identity and stale cache after capability denial", async () => {
    const upstream = vi.fn(() => { throw new Error("Unexpected upstream"); });
    vi.stubGlobal("fetch", upstream);
    const item = mapTmdbResult(snapshot());
    const providers = createReleaseProviders({ maxAttempts: 1, fetcher: vi.fn(async (input) => calendar(new NextRequest(new URL(String(input), "http://localhost")))) });
    expect(releaseProviderForMedia(item, providers)?.id).toBe("tmdb");
    const event = { schemaVersion: 1 as const, id: "legacy-release", mediaRecordId: item.id, mediaIdentityKey: item.identity?.key, type: "movie_release" as const, title: item.title, date: { precision: "date_only" as const, date: "2026-10-06" }, origin: { kind: "provider" as const, provider: "tmdb" as const, providerEventId: "legacy-release", persistence: "reproducible_cache" as const } };
    const cache = upsertReleaseCacheEntry(emptyReleaseCalendarCache(), createReleaseCacheEntry({ item, provider: "tmdb", events: [event], fetchedAtMs: 0 }));
    const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
    const result = await refreshReleaseCalendarCache({ scope: GUEST_OWNER_SCOPE, items: [item], cache, providers, force: true, nowMs: Date.now(), storage });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toMatchObject({ status: 503 });
    expect(result.cache).toEqual(cache);
    expect(buildReleaseAgendaView({ items: [item], cache: result.cache, today: "2026-10-05" }).next7Days[0]).toMatchObject({ event, stale: true });
    expect(upstream).not.toHaveBeenCalled();
    expect(enforceDistributedRateLimit).not.toHaveBeenCalled();
  });

  it("preserves normalizers, records, identity, IMDb bridge, storage, backup, cloud mapping, edits and saved covers offline", async () => {
    const fetcher = vi.fn(() => { throw new Error("Unexpected network"); });
    vi.stubGlobal("fetch", fetcher);
    const raw = snapshot();
    expect(normalizeMovieResult({ id: 550, title: raw.title, poster_path: "/fixture.jpg" })?.coverUrl).toBe(raw.coverUrl);
    const item = { ...mapTmdbResult(raw), currentProgress: 1, rating: 8, personalNotes: "Personal fixture note" };
    const decoded = decodeMediaItem(item);
    if (decoded.status === "invalid") throw new Error("Legacy decode failed");
    expect(decoded.value).toMatchObject({ externalSource: "tmdb", type: "movie", mediaType: "movie", identity: item.identity, imdbId: raw.imdbId });
    expect(item.identity?.key).toBeTruthy();
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(saveMediaList([item], storage).ok).toBe(true);
    const persisted = { externalSource: "tmdb", externalId: "550", identity: item.identity, imdbId: raw.imdbId, coverImage: raw.coverUrl, currentProgress: 1, rating: 8, personalNotes: item.personalNotes };
    expect(loadMediaList(storage).data?.[0]).toMatchObject(persisted);
    const backup = await createPortableBackup({ ownerType: "guest", mediaItems: [item], progressLogs: [], identityAliases: emptyMediaIdentityAliasRegistry(), recordRedirects: emptyMediaRecordRedirectRegistry(), recommendationLinks: [] }, { exportedAt: "2026-10-05T00:00:00Z", includePersonalNotes: true });
    expect((await inspectPortableBackupText(backup.serialized)).status).toBe("valid");
    expect(backup.backup.data.mediaItems?.[0]).toMatchObject(persisted);
    const row = toMediaRow("test-owner", item);
    const restored = fromMediaRow({ ...row, created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" } as Parameters<typeof fromMediaRow>[0]);
    expect(restored).toMatchObject(persisted);
    const evidence = adaptTmdbEvidence(raw);
    expect(evidence.candidateIdentity).toMatchObject({ verified: true, primaryProvider: "tmdb", primaryExternalId: "550" });
    const html = renderToStaticMarkup(createElement(MediaCard, { item: restored, onIncrement: vi.fn(), onComplete: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onToggleFavorite: vi.fn(), onOpenDetail: vi.fn() }));
    expect(html).toContain(raw.title);
    expect(html).toContain("image.tmdb.org");
    const detailHtml = renderToStaticMarkup(createElement(MediaDetailModal, { media: restored, open: true, onClose: vi.fn(), onIncrementProgress: vi.fn(), onComplete: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onToggleFavorite: vi.fn() }));
    expect(detailHtml).toContain(raw.title);
    expect(detailHtml).toContain("image.tmdb.org");
    expect(detailHtml).toContain(item.personalNotes);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("allows metadata endpoints only in the three dormant gated routes", () => {
    const allowed = new Set(["app/api/tmdb/search/route.ts", "app/api/tmdb/details/route.ts", "app/api/calendar/tmdb/route.ts"]);
    const found: string[] = [];
    function scan(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name).replaceAll("\\", "/");
        if (entry.isDirectory()) scan(file);
        else if (/\.(?:[cm]?[jt]sx?)$/.test(file)) {
          const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
          function visit(node: ts.Node) {
            if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && node.text.includes(["api", "themoviedb", "org"].join("."))) found.push(file);
            ts.forEachChild(node, visit);
          }
          visit(source);
        }
      }
    }
    for (const directory of ["app", "lib", "features", "components", "tests", "scripts"]) scan(directory);
    expect(new Set(found)).toEqual(allowed);
    const policy = readFileSync("lib/providers/release-policy.ts", "utf8");
    for (const removed of ["MEDIA_TRACKER_TMDB_MODE", "TMDB_READ_ACCESS_TOKEN", "tmdbApprovedLogoAvailable", "TMDB_APPROVED_LOGO_AVAILABLE"]) expect(policy).not.toContain(removed);
  });
});
