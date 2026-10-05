import "./helpers/admitted-rate-limit";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as search } from "@/app/api/anilist/search/route";
import { GET as details } from "@/app/api/anilist/details/route";
import { GET as calendar } from "@/app/api/calendar/anilist/route";
import { GET as capabilities } from "@/app/api/providers/capabilities/route";
import { enforceDistributedRateLimit } from "@/lib/api/distributed-rate-limit";
import { categoriesForCapabilities } from "@/components/global-search";
import MediaCard from "@/components/media-card";
import { normalizeAniListMedia } from "@/lib/anilist";
import { mapAniListResult } from "@/features/discovery/domain/media-mappers";
import { adaptAniListEvidence } from "@/features/recommendations/providers/anilist-adapter";
import { classifyTvmazeAnime } from "@/features/recommendations/providers/tvmaze-anime-classifier";
import { decodeMediaItem } from "@/lib/local-data-codec";
import { loadMediaList, saveMediaList } from "@/lib/local-data-storage";
import { createPortableBackup, inspectPortableBackupText } from "@/lib/portable-backup";
import { emptyMediaIdentityAliasRegistry } from "@/lib/media-identity-aliases";
import { emptyMediaRecordRedirectRegistry } from "@/lib/media-record-redirects";
import { fromMediaRow, toMediaRow } from "@/lib/supabase/mapping";
import { resolveAniListSeriesGroup } from "@/lib/series-group";
import { searchCandidatesWithDebug } from "@/lib/ai/candidate-search";
import { createReleaseProviders, releaseProviderForMedia } from "@/features/calendar/providers/release-providers";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("V1 AniList hard-disable", () => {
  it.each([undefined, "disabled", "preview_test", "authorized", "arbitrary"])("denies every route before admission with mode %s", async (mode) => {
    vi.stubEnv("MEDIA_TRACKER_ANILIST_MODE", mode);
    vi.stubEnv("D6_PROVIDER_LIVE_SMOKE", "1");
    const fetcher = vi.fn(() => { throw new Error("Unexpected network"); });
    vi.stubGlobal("fetch", fetcher);
    for (const environment of [undefined, "preview", "production", "development"]) {
      vi.stubEnv("VERCEL_ENV", environment);
      for (const nodeEnvironment of ["development", "production", "test"]) {
        vi.stubEnv("NODE_ENV", nodeEnvironment);
        const responses = await Promise.all([
          search(new NextRequest("http://localhost/api/anilist/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "Example", category: "anime" }) })),
          details(new NextRequest("http://localhost/api/anilist/details?id=21")),
          calendar(new NextRequest("http://localhost/api/calendar/anilist?mediaId=21")),
        ]);
        for (const response of responses) {
          expect(response.status).toBe(503);
          expect(response.headers.get("cache-control")).toBe("no-store");
          expect(await response.json()).toMatchObject({ code: "provider_unavailable", reason: "authorization_required" });
        }
      }
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(enforceDistributedRateLimit).not.toHaveBeenCalled();
  });

  it("excludes live AniList discovery sources via the real capability endpoint", async () => {
    vi.stubEnv("MEDIA_TRACKER_ANILIST_MODE", "authorized");
    const response = await capabilities();
    const body = await response.json();
    expect(body.providers.anilist).toEqual({ enabled: false, reason: "authorization_required" });
    const categories = categoriesForCapabilities(body).map((entry) => entry.value);
    for (const category of ["anime", "manga", "novel"]) expect(categories).not.toContain(category);
    const discovery = readFileSync("features/discovery/components/discovery-feature.tsx", "utf8");
    expect(discovery).toContain("enabled.anilist.enabled && <AniListSearch");
  });

  it("cannot create recommendation candidates through the disabled live proxy", async () => {
    const upstream = vi.fn(() => { throw new Error("Unexpected upstream"); });
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (!url.endsWith("/api/anilist/search")) return upstream();
      return search(new NextRequest(new URL(url, "http://localhost"), { ...init, signal: init?.signal ?? undefined }));
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({
      intent: { kind: "general_recommendation", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false },
      retrievalPlan: { taskType: "general_recommendation", interpretation: "anime", targetMediaTypes: ["anime"], sourceTypes: [], preferenceSignals: [], avoidSignals: [], needsClarification: false, searchPlans: [{ source: "anilist", mediaType: "anime", queries: ["Example"], reason: "fixture" }] },
      profile: null, message: "Anime öner", mediaItems: [], progressLogs: [],
    });
    expect(fetcher).toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
    expect(upstream).not.toHaveBeenCalled();
    expect(enforceDistributedRateLimit).not.toHaveBeenCalled();
  });

  it("resolves a legacy Calendar identity but denies its upstream request", async () => {
    const upstream = vi.fn(() => { throw new Error("Unexpected upstream"); });
    vi.stubGlobal("fetch", upstream);
    const item = mapAniListResult(normalizeAniListMedia({ id: 21, type: "ANIME", title: { english: "Legacy Anime" }, episodes: 12 }));
    const providers = createReleaseProviders({ maxAttempts: 1, fetcher: vi.fn(async (input) => calendar(new NextRequest(new URL(String(input), "http://localhost")))) });
    expect(releaseProviderForMedia(item, providers)?.id).toBe("anilist");
    await expect(providers.anilist.fetchEvents({ mediaRecordId: item.id, mediaIdentityKey: item.identity?.key })).rejects.toMatchObject({ detail: { status: 503 } });
    expect(upstream).not.toHaveBeenCalled();
    expect(enforceDistributedRateLimit).not.toHaveBeenCalled();
  });

  it("preserves stored snapshots, storage, portable backup, cloud mapping, relations, grouping, classification and saved card covers offline", async () => {
    const fetcher = vi.fn(() => { throw new Error("Unexpected network"); });
    vi.stubGlobal("fetch", fetcher);
    const normalized = normalizeAniListMedia({ id: 21, type: "ANIME", format: "TV", episodes: 12, title: { english: "Legacy Anime" }, countryOfOrigin: "JP", genres: ["Fantasy"], coverImage: { large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/test.jpg" }, relations: { edges: [{ relationType: "SEQUEL", node: { id: 22, type: "ANIME", format: "TV", episodes: 12, startDate: { year: 2020 }, title: { english: "Legacy Sequel" } } }] } });
    const item = mapAniListResult(normalized);
    const decoded = decodeMediaItem(item);
    if (decoded.status === "invalid") throw new Error("Legacy decode failed");
    expect(decoded.value).toMatchObject({ externalSource: "anilist", type: "anime", mediaType: "anime", subType: "anime_tv" });
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(saveMediaList([item], storage).ok).toBe(true);
    expect(loadMediaList(storage).data?.[0]).toMatchObject({ externalSource: "anilist", externalId: "21", anilistRelations: item.anilistRelations, coverImage: item.coverImage });
    const backup = await createPortableBackup({ ownerType: "guest", mediaItems: [item], progressLogs: [], identityAliases: emptyMediaIdentityAliasRegistry(), recordRedirects: emptyMediaRecordRedirectRegistry(), recommendationLinks: [] }, { exportedAt: "2026-10-05T00:00:00Z", includePersonalNotes: false });
    expect((await inspectPortableBackupText(backup.serialized)).status).toBe("valid");
    expect(backup.backup.data.mediaItems?.[0]).toMatchObject({ externalSource: "anilist", anilistRelations: item.anilistRelations });
    const row = toMediaRow("test-owner", item);
    const restored = fromMediaRow({ ...row, created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" } as Parameters<typeof fromMediaRow>[0]);
    expect(restored).toMatchObject({ externalSource: "anilist", externalId: "21", anilistRelations: item.anilistRelations, coverImage: item.coverImage });
    const sequel = { ...item, id: "anilist-22", externalId: "22", title: "Legacy Sequel", anilistRelations: [] };
    expect(resolveAniListSeriesGroup(item, [sequel]).newItemSeriesPatch.seriesGroupId).toBeTruthy();
    const evidence = adaptAniListEvidence(normalized);
    expect(evidence.candidateIdentity).toMatchObject({ verified: true, primaryProvider: "anilist" });
    expect(evidence.rawEvidenceClaims.some((claim) => claim.mappedAspectIds.includes("fantasy"))).toBe(true);
    const html = renderToStaticMarkup(createElement(MediaCard, { item: restored, onIncrement: vi.fn(), onComplete: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onToggleFavorite: vi.fn(), onOpenDetail: vi.fn() }));
    expect(html).toContain("Legacy Anime");
    expect(html).toContain("anilistcdn");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("runs the live integration source with D6_PROVIDER_LIVE_SMOKE=1 using an isolated fixture transport and zero AniList/TMDB invocations", async () => {
    const cases: Array<() => unknown> = [];
    const register = Object.assign((_name: string, callback: () => unknown) => { cases.push(callback); }, { skipIf: (skip: boolean) => skip ? () => {} : (_name: string, callback: () => unknown) => { cases.push(callback); } });
    const invocations: string[] = [];
    const transport = vi.fn(async ({ provider, url }: { provider: string; url: string }) => {
      invocations.push(provider);
      expect(provider).not.toBe("anilist");
      expect(provider).not.toBe("tmdb");
      let body: unknown;
      if (provider === "tvmaze") {
        const anime = url.includes("One%20Piece");
        body = [{ show: { id: 1, type: anime || url.includes("Simpsons") ? "Animation" : "Scripted", language: anime ? "Japanese" : "English", network: { country: { code: anime ? "JP" : "US" } } } }];
      } else if (provider === "openlibrary") body = { docs: [{ key: "/works/OL1W", author_name: ["Fixture"], subject: ["Fantasy"] }] };
      else if (provider === "omdb") body = { Response: "True", imdbID: "tt0137523", Genre: "Drama" };
      else throw new Error("Unexpected provider");
      return { response: Response.json(body), telemetry: { provider, attemptCount: 1, requestCount: 1 } };
    });
    const source = readFileSync("tests/recommendation-provider-live.integration.test.ts", "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    runInNewContext(compiled, {
      exports: {}, Response, Array,
      process: { env: { D6_PROVIDER_LIVE_SMOKE: "1", TMDB_READ_ACCESS_TOKEN: "fixture", OMDB_API_KEY: "fixture" } },
      require: (id: string) => {
        if (id === "vitest") return { describe: { skipIf: (skip: boolean) => skip ? () => {} : (_name: string, callback: () => void) => callback() }, it: register, expect };
        if (id.endsWith("/request-policy")) return { fetchWithProviderRequestPolicy: transport };
        if (id.endsWith("/tvmaze-anime-classifier")) return { classifyTvmazeAnime };
        throw new Error(`Unapproved live test import: ${id}`);
      },
    });
    expect(cases).toHaveLength(4);
    for (const callback of cases) await callback();
    expect(new Set(invocations)).toEqual(new Set(["tvmaze", "openlibrary", "omdb"]));
    expect(invocations.filter((provider) => provider === "anilist")).toHaveLength(0);
    expect(invocations.filter((provider) => provider === "tmdb")).toHaveLength(0);
  });

  it("allows endpoint literals only in the three dormant gated routes, never executable tests or tooling", () => {
    const allowed = new Set(["app/api/anilist/search/route.ts", "app/api/anilist/details/route.ts", "app/api/calendar/anilist/route.ts"]);
    const found: string[] = [];
    function scan(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name).replaceAll("\\", "/");
        if (entry.isDirectory()) scan(file);
        else if (/\.(?:[cm]?[jt]sx?)$/.test(file)) {
          const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
          function visit(node: ts.Node) {
            if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && node.text.includes(["graphql", "anilist", "co"].join("."))) found.push(file);
            ts.forEachChild(node, visit);
          }
          visit(source);
        }
      }
    }
    for (const directory of ["app", "lib", "features", "components", "tests", "scripts"]) scan(directory);
    expect(new Set(found)).toEqual(allowed);
    expect(readFileSync("lib/providers/release-policy.ts", "utf8")).not.toContain("MEDIA_TRACKER_ANILIST_MODE");
  });
});
