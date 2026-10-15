import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TmdbAttribution } from "@/components/tmdb-attribution";
import MediaDetailModal from "@/components/media-detail-modal";
import { useDiscoveryController } from "@/features/discovery/hooks/use-discovery-controller";
import { mapTmdbResult } from "@/features/discovery/domain/media-mappers";
import { assertTmdbPersistenceAllowed, hasTmdbProvenance, tmdbSourceUrl } from "@/lib/providers/tmdb-usage-policy";
import { buildCandidateEmbeddingText, buildLibraryItemEmbeddingText } from "@/lib/ai/embedding-text-builder";
import { embedManyWithFallback, LocalMockEmbeddingProvider, PythonServiceEmbeddingProvider } from "@/lib/ai/embedding-provider";
import { buildEmbeddingSimilarityProfilePayloads } from "@/lib/ai/embedding-similarity-scorer";
import { runSemanticVerifier } from "@/features/recommendations/evidence/semantic-verifier";
import { adaptTmdbEvidence } from "@/features/recommendations/providers/tmdb-adapter";
import { buildGroundedResearchShadowContext } from "@/features/recommendations/research/shadow/context";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import type { EmbeddingVectorPayload } from "@/lib/ai/embedding-types";

const detail = { externalSource: "tmdb" as const, externalId: "55", type: "movie" as const, title: "Synthetic movie", totalProgress: 1 as const, overview: "Synthetic overview" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Phase 2 TMDB preparation", () => {
  it("renders official local branding, the exact disclaimer and safe links while API access stays closed", () => {
    const html = renderToStaticMarkup(createElement(TmdbAttribution));
    expect(html).toContain('src="/attribution/tmdb.svg"');
    expect(html).toContain("This product uses the TMDB API but is not endorsed or certified by TMDB.");
    expect(html).toContain('href="https://www.themoviedb.org/"');
    expect(html).toContain('href="https://www.themoviedb.org/api-terms-of-use"');
    expect(html).toContain('rel="noopener noreferrer"');
    const svg = readFileSync("public/attribution/tmdb.svg", "utf8");
    expect(svg).toContain('viewBox="0 0 190.24 81.52"');
    expect(createHash("sha256").update(svg).digest("hex")).toBe("5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4");
    expect(svg).not.toMatch(/<script|<foreignObject/i);
  });

  it("uses exact movie/TV source links and ignores a legacy third-party homepage", () => {
    expect(tmdbSourceUrl("55", "movie")).toBe("https://www.themoviedb.org/movie/55");
    expect(tmdbSourceUrl("55", "tv")).toBe("https://www.themoviedb.org/tv/55");
    expect(tmdbSourceUrl("55/javascript:bad", "movie")).toBeUndefined();
    const noop = () => {};
    const html = renderToStaticMarkup(createElement(MediaDetailModal, { media: { ...mapTmdbResult(detail), siteUrl: "https://example.invalid/" }, open: true, onClose: noop, onIncrementProgress: noop, onComplete: noop, onEdit: noop, onDelete: noop, onToggleFavorite: noop }));
    expect(html).toContain('href="https://www.themoviedb.org/movie/55"');
    expect(html).not.toContain('href="https://example.invalid/"');
  });

  it("blocks new Quick Add persistence before details fetch or fallback without changing legacy mapping", async () => {
    expect(() => assertTmdbPersistenceAllowed()).toThrow("tmdb_persistence_disabled");
    const openQuickAdd = vi.fn();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("window", { alert: vi.fn() });
    let controller!: ReturnType<typeof useDiscoveryController>;
    function Probe() {
      controller = useDiscoveryController({ mediaList: [], commands: { openQuickAdd } as unknown as Parameters<typeof useDiscoveryController>[0]["commands"], commitMediaChanges: vi.fn() });
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    await controller.addFromGlobalSearch({ source: "tmdb", externalId: "55", type: "movie", title: detail.title });
    expect(openQuickAdd).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(mapTmdbResult(detail)).toMatchObject({ externalSource: "tmdb", title: detail.title });
  });

  it("blocks both candidate and legacy library embeddings before network, mock or cache use", async () => {
    vi.stubEnv("MEDIA_TRACKER_ML_SERVICE_URL", "http://ml.invalid");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const library = { ...mapTmdbResult(detail), favorite: true };
    const candidate = { source: "tmdb" as const, externalId: "55", type: "movie" as const, title: detail.title };
    const texts = [buildCandidateEmbeddingText(candidate), buildLibraryItemEmbeddingText(library)];
    const payloads: EmbeddingVectorPayload[] = texts.map((text, i) => ({ id: `synthetic-${i}`, ...text }));
    payloads.push(...buildEmbeddingSimilarityProfilePayloads([library]).payloads);
    const result = await embedManyWithFallback(payloads);
    expect(result.results).toEqual([]);
    expect(result.cache?.hits).toBe(0);
    expect(result.cache?.stored).toBe(0);
    expect(result.persistentCache).toMatchObject({ hits: 0, stored: 0 });
    expect(await new PythonServiceEmbeddingProvider("http://ml.invalid").embedMany(payloads)).toEqual([]);
    expect(await new LocalMockEmbeddingProvider().embedMany(payloads)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("recognizes mixed evidence and legacy identity without labelling unrelated records TMDB", () => {
    expect(hasTmdbProvenance({ source: "library", globalSearch: { raw: detail } })).toBe(true);
    expect(hasTmdbProvenance({ identity: { source: "tmdb" } })).toBe(true);
    expect(hasTmdbProvenance({ id: "tmdb-55" })).toBe(true);
    expect(hasTmdbProvenance({ source: "tvmaze", title: "TMDB" })).toBe(false);
  });

  it("keeps structured deterministic evidence but never sends TMDB or mixed evidence to a verifier", async () => {
    vi.stubEnv("AI_LOCAL_SEMANTIC_VERIFIER_URL", "http://verifier.invalid");
    const snapshot = adaptTmdbEvidence(detail);
    const fetcher = vi.fn();
    const snapshots = new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]);
    expect((await runSemanticVerifier({ mode: "structured_only", snapshots, fetchImpl: fetcher })).status).toBe("structured_only");
    const result = await runSemanticVerifier({ mode: "local_enhanced", snapshots, fetchImpl: fetcher });
    expect(result).toMatchObject({ status: "unavailable", effectiveMode: "structured_only", warnings: ["tmdb_model_use_forbidden"] });
    const mixed = { ...snapshot, candidateIdentity: { ...snapshot.candidateIdentity, primaryProvider: "tvmaze" as const } };
    await runSemanticVerifier({ mode: "local_enhanced", snapshots: new Map([["mixed", mixed]]), fetchImpl: fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("excludes TMDB evidence from research seeds while other unresolved candidates remain eligible", () => {
    const request: Parameters<typeof buildGroundedResearchShadowContext>[0]["request"] = {
      version: 2, queryText: "Synthetic query", targetMediaTypes: ["movie"],
      aspectConstraints: [{ id: "romance", kind: "aspect", aspectId: "romance", role: "must", minimumLevel: "significant", source: "explicit" }],
      objectiveConstraints: [], strictness: "strict", references: [], profileSignalsEnabled: false, semanticVerifierMode: "structured_only", locale: "tr",
    };
    const snapshot = adaptTmdbEvidence(detail);
    const candidate = { source: "tmdb" as const, externalId: "55", type: "movie" as const, title: detail.title };
    const blocked = buildGroundedResearchShadowContext({ request, candidates: [{ candidate, snapshot, aspectEvidence: new Map() }], mediaItems: [] });
    expect(blocked.candidates).toEqual([]);
    const allowed = buildGroundedResearchShadowContext({ request, candidates: [{
      candidate: { ...candidate, source: "omdb" },
      snapshot: { ...snapshot, candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: "omdb", primaryExternalId: "tt0000055", mediaType: "movie" }), providerCoverage: { omdb: "available" } },
      aspectEvidence: new Map(),
    }], mediaItems: [] });
    expect(allowed.candidates).toHaveLength(1);
  });
});
