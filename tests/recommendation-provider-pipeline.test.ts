import { describe, expect, it, vi } from "vitest";
import type { AiCandidate } from "@/lib/ai/types";
import { prepareProviderEvidencePipeline, PROVIDER_ENRICHMENT_CONCURRENCY, PROVIDER_ENRICHMENT_MAX_CANDIDATES } from "@/features/recommendations/providers/pipeline";
import { searchCandidatesWithDebug } from "@/lib/ai/candidate-search";

function tvmazeCandidate(id: string, raw: Record<string, unknown>): AiCandidate {
  return { source: "tvmaze", externalId: id, type: "tv", title: String(raw.title || raw.name || id), globalSearch: { source: "tvmaze", externalId: id, type: "tv", title: String(raw.title || raw.name || id), raw } as never };
}

function omdbCandidate(id: string, title = "Same"): AiCandidate {
  const raw = { externalSource: "omdb", externalId: id, type: "movie", title, releaseYear: 2020, totalProgress: 1 };
  return { source: "omdb", externalId: id, type: "movie", title, releaseYear: 2020, globalSearch: { source: "omdb", externalId: id, type: "movie", title, raw } as never };
}

describe("D6-2 recommendation provider pipeline", () => {
  it("confirmed ve likely anime TVMaze adaylarını eler, telemetry sayar", async () => {
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates: [
      tvmazeCandidate("901", { externalSource: "tvmaze", externalId: "901", type: "tv", title: "A", genres: ["Anime"] }),
      tvmazeCandidate("902", { externalSource: "tvmaze", externalId: "902", type: "tv", title: "B", showType: "Animation", language: "Japanese" }),
    ] });
    expect(result.candidates).toHaveLength(0);
    expect(result.telemetry).toMatchObject({ tvmaze_anime_excluded: 1, tvmaze_anime_likely_excluded: 1 });
  });

  it("unknown ve Batı animasyonunu tutar", async () => {
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates: [
      tvmazeCandidate("903", { externalSource: "tvmaze", externalId: "903", type: "tv", title: "Unknown" }),
      tvmazeCandidate("904", { externalSource: "tvmaze", externalId: "904", type: "tv", title: "Western", showType: "Animation", language: "English", networkCountryCode: "US" }),
    ] });
    expect(result.candidates).toHaveLength(2);
    expect(result.telemetry).toMatchObject({ tvmaze_anime_unknown: 1, tvmaze_non_anime_kept: 1 });
  });

  it("aynı title/year fakat farklı exact ID adaylarını merge etmez", async () => {
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates: [omdbCandidate("tt9000001"), omdbCandidate("tt9000002")] });
    expect(result.candidates).toHaveLength(2);
    expect(result.telemetry.exact_bridge_deduped).toBe(0);
  });

  it("TMDB/OMDb aynı IMDb bridge ile primary TMDB adayına merge eder", async () => {
    const tmdbRaw = { externalSource: "tmdb", externalId: "99001", type: "movie", title: "Film", totalProgress: 1 };
    const tmdb: AiCandidate = { source: "tmdb", externalId: "99001", type: "movie", title: "Film", globalSearch: { source: "tmdb", externalId: "99001", type: "movie", title: "Film", raw: tmdbRaw } as never };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: { ...tmdbRaw, imdbId: "tt9900001", genres: ["Drama"] } }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates: [omdbCandidate("tt9900001", "Film"), tmdb], fetchImpl: fetchImpl as typeof fetch });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source).toBe("tmdb");
    expect(result.telemetry.exact_bridge_deduped).toBe(1);
  });

  it("library adayını provider sidecar'a sokmadan korur", async () => {
    const library: AiCandidate = { source: "library", externalId: "local", libraryItemId: "local", type: "anime", title: "Local" };
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates: [library] });
    expect(result.candidates).toEqual([library]);
    expect(result.evidenceByCandidateKey.size).toBe(0);
  });

  it("TMDB details/token hatasında adayı korur ve evidence'i fail-soft işaretler", async () => {
    const raw = { externalSource: "tmdb", externalId: "88001", type: "movie", title: "Film", totalProgress: 1 };
    const candidate: AiCandidate = { source: "tmdb", externalId: "88001", type: "movie", title: "Film", globalSearch: { source: "tmdb", externalId: "88001", type: "movie", title: "Film", raw } as never };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: null }), { status: 503 }));
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates: [candidate], fetchImpl: fetchImpl as typeof fetch });
    expect(result.candidates).toEqual([candidate]);
    expect(result.telemetry.enrichmentFailures).toBe(1);
  });

  it("top-N enrichment concurrency'sini üç ile sınırlar", async () => {
    let active = 0;
    let maximum = 0;
    const candidates = Array.from({ length: 8 }, (_, index) => {
      const id = String(88100 + index);
      const raw = { externalSource: "tmdb", externalId: id, type: "movie", title: `Film ${index}`, totalProgress: 1 };
      return { source: "tmdb", externalId: id, type: "movie", title: raw.title, globalSearch: { source: "tmdb", externalId: id, type: "movie", title: raw.title, raw } as never } satisfies AiCandidate;
    });
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const id = new URL(String(url)).searchParams.get("id") || "0";
      return new Response(JSON.stringify({ result: { externalSource: "tmdb", externalId: id, type: "movie", title: id, totalProgress: 1 } }), { status: 200 });
    });
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates, fetchImpl: fetchImpl as typeof fetch });
    expect(result.telemetry.enrichedCandidates).toBe(8);
    expect(maximum).toBeLessThanOrEqual(3);
  });

  it("provider raw identity yoksa external adayı reddeder", async () => {
    const candidate: AiCandidate = { source: "omdb", externalId: "tt88200", type: "movie", title: "Unverified" };
    const result = await prepareProviderEvidencePipeline({ baseUrl: "http://local", candidates: [candidate] });
    expect(result.candidates).toEqual([]);
    expect(result.rejectedCandidates[0]?.reason).toBe("provider_identity_unverified");
  });

  it("bounded enrichment limitlerini export eder", () => {
    expect(PROVIDER_ENRICHMENT_MAX_CANDIDATES).toBe(8);
    expect(PROVIDER_ENRICHMENT_CONCURRENCY).toBe(3);
  });

  it("anime-only retrieval planında TVMaze çağrısı yapmaz", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await searchCandidatesWithDebug({
        intent: { kind: "general", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false },
        retrievalPlan: {
          taskType: "general", interpretation: "anime", targetMediaTypes: ["anime"], sourceTypes: [], preferenceSignals: [], avoidSignals: [], needsClarification: false,
          searchPlans: [{ source: "tvmaze", mediaType: "tv", queries: ["anime"], reason: "invalid provider plan" }],
        },
        profile: null, message: "anime öner", mediaItems: [], progressLogs: [],
      });
      expect(result.candidates).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
