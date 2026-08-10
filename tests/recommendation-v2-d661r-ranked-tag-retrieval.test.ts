import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as searchAniListRoute } from "@/app/api/anilist/search/route";
import {
  ASPECT_IDS,
  ASPECT_REGISTRY,
  evaluateConstraintEvidenceCapability,
  queryableProviderRetrievalMapping,
} from "@/features/recommendations/domain";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import { aggregateAspectEvidence } from "@/features/recommendations/evidence";
import { adaptAniListEvidence } from "@/features/recommendations/providers/anilist-adapter";
import { scoreEligibleCandidates } from "@/features/recommendations/ranking";
import { userFacingRankedTagNoResult } from "@/features/recommendations/ui/user-facing-text";
import {
  applyRankedTagCandidatePoolGate,
  searchCandidatesWithDebug,
} from "@/lib/ai/candidate-search";
import type { AiCandidate, AiIntent, AiRetrievalPlan } from "@/lib/ai/types";
import type { AniListNormalizedResult, AniListRawMedia } from "@/lib/anilist-types";

const intent: AiIntent = {
  kind: "general_recommendation",
  references: [],
  targetTypes: ["anime"],
  sourceTypes: [],
  mood: [],
  avoid: [],
  needsLibraryProfile: false,
  needsCandidateSearch: true,
  needsWebResearch: false,
};

const providerPlan: AiRetrievalPlan = {
  taskType: "general_recommendation",
  interpretation: "political intrigue anime",
  targetMediaTypes: ["anime"],
  sourceTypes: [],
  preferenceSignals: ["Political Intrigue"],
  avoidSignals: [],
  needsClarification: false,
  searchPlans: [{ source: "anilist", mediaType: "anime", queries: ["FANTASY", "Fantasy"], reason: "planning title ideas" }],
};

function request(strictness: RecommendationRequestV2["strictness"] = "balanced"): RecommendationRequestV2 {
  return {
    version: 2,
    queryText: "Politik entrikanın ana unsurlardan biri olduğu anime öner.",
    targetMediaTypes: ["anime"],
    aspectConstraints: [{
      id: "political:must",
      kind: "aspect",
      aspectId: "political_intrigue",
      role: "must",
      source: "explicit",
      minimumLevel: "significant",
    }],
    objectiveConstraints: [],
    strictness,
    references: [],
    profileSignalsEnabled: false,
    semanticVerifierMode: "structured_only",
    locale: "tr-TR",
  };
}

function normalized(id: string, title: string, rank?: number, popularity = 1_000_000): AniListNormalizedResult {
  return {
    externalSource: "anilist",
    externalId: id,
    type: "anime",
    title,
    totalProgress: 12,
    popularity,
    averageScore: 90,
    tags: rank === undefined ? [] : [{ name: "Politics", rank }],
  };
}

function candidate(item: AniListNormalizedResult): AiCandidate {
  return {
    source: "anilist",
    externalId: item.externalId,
    type: "anime",
    title: item.title,
    averageScore: item.averageScore,
    globalSearch: { source: "anilist", externalId: item.externalId, type: "anime", title: item.title, raw: item },
  };
}

function rankable(item: AniListNormalizedResult) {
  const snapshot = adaptAniListEvidence(item, "2026-08-06T00:00:00.000Z");
  return { candidate: candidate(item), snapshot, aspectEvidence: aggregateAspectEvidence({ snapshot }) };
}

function rawMedia(rank: number): AniListRawMedia {
  return {
    id: 99,
    type: "ANIME",
    title: { english: "Verified Politics" },
    episodes: 12,
    tags: [{ name: "Politics", rank }],
  };
}

function postAniList(body: Record<string, unknown>) {
  return searchAniListRoute(new NextRequest("http://localhost/api/anilist/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function requestBody(init?: RequestInit) {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

describe("D6.6-1R provider retrieval mapping and route", () => {
  beforeEach(() => vi.stubEnv("MEDIA_TRACKER_ANILIST_MODE", "authorized"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("43 aspect id ve D6.6-1 strategy dağılımını değiştirmez", () => {
    expect(ASPECT_IDS).toHaveLength(43);
    const counts = ASPECT_IDS.reduce<Record<string, number>>((out, id) => {
      const strategy = ASPECT_REGISTRY[id].defaultEvidenceStrategy;
      out[strategy] = (out[strategy] ?? 0) + 1;
      return out;
    }, {});
    expect(counts).toEqual({ exact_taxonomy: 13, ranked_tag: 21, semantic_required: 9 });
  });

  it("political_intrigue için UI label'dan ayrı canonical AniList Politics mapping'i taşır", () => {
    expect(ASPECT_REGISTRY.political_intrigue.labelEn).toBe("Political Intrigue");
    expect(queryableProviderRetrievalMapping("political_intrigue", "anilist", "anime")).toMatchObject({
      strategy: "ranked_tag",
      canonicalTags: ["Politics"],
      minimumRankPolicy: { strict: 40, relaxed: 20 },
      queryable: true,
    });
  });

  it("mapping varsa ranked_tag_supported, geniş bileşik aspect mapping yoksa semantic confirmation gösterir", () => {
    const base = { id: "x", kind: "aspect" as const, role: "must" as const, source: "explicit" as const, minimumLevel: "significant" as const };
    expect(evaluateConstraintEvidenceCapability({ constraint: { ...base, aspectId: "political_intrigue" }, targetMediaTypes: ["anime"], semanticVerifierMode: "structured_only" }).status).toBe("ranked_tag_supported");
    expect(evaluateConstraintEvidenceCapability({ constraint: { ...base, aspectId: "power_progression" }, targetMediaTypes: ["anime"], semanticVerifierMode: "structured_only" })).toMatchObject({ status: "requires_semantic_verifier", reasonCode: "constraint_evidence_semantic_verifier_required", canUseAsMust: false });
  });

  it("route canonical tag ve minimumTagRank'i GraphQL variables'a taşır", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { Page: { media: [rawMedia(86)] } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await postAniList({ category: "anime", tags: ["Politics"], minimumTagRank: 40, sort: ["POPULARITY_DESC", "SCORE_DESC", "ID"] });
    expect(response.status).toBe(200);
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.variables).toMatchObject({ type: "ANIME", tagIn: ["Politics"], minimumTagRank: 40 });
    expect(body.query).toContain("minimumTagRank: $minimumTagRank");
  });

  it.each([
    [{ tags: ["Political Intrigue"], minimumTagRank: 40 }, 400],
    [{ tags: ["Politics"], minimumTagRank: 101 }, 400],
    [{ tags: ["Politics"], minimumTagRank: 20.5 }, 400],
  ])("unsupported veya güvensiz structured parametreyi kontrollü reddeder: %o", async (filters, status) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await postAniList({ category: "anime", ...filters });
    expect(response.status).toBe(status);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("no-result reason code'larını raw enum göstermeden eyleme dönük Türkçe metne çevirir", () => {
    expect(userFacingRankedTagNoResult("provider_tag_mapping_missing")).toBe("Bu özellik için seçilen kaynakta doğrudan arama desteği bulunmuyor.");
    expect(userFacingRankedTagNoResult("provider_tag_no_candidates")).toBe("Seçilen içerik etiketini taşıyan doğrulanmış aday bulunamadı.");
    expect(userFacingRankedTagNoResult("candidates_below_tag_rank", "Politik entrika")).toBe("Adaylar bulundu ancak politik entrika istenen belirginlik düzeyinin altında kaldı.");
    expect(userFacingRankedTagNoResult("provider_tag_query_unavailable")).not.toContain("provider_tag_query_unavailable");
  });
});

describe("D6.6-1R strict/relaxed ranked-tag candidate discovery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("strict Politics pass'i title planından önce çalıştırır ve yeterliyse title fallback yapmaz", async () => {
    const items = [normalized("1", "One", 86), normalized("2", "Two", 63), normalized("3", "Three", 45)];
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = requestBody(init);
      expect(body.query).toBeUndefined();
      expect(body.tags).toEqual(["Politics"]);
      expect(body.minimumTagRank).toBe(40);
      return new Response(JSON.stringify({ results: items }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request().queryText, mediaItems: [], progressLogs: [], structuredRequest: request() });
    expect(result.candidates.map((item) => item.title)).toEqual(["One", "Two", "Three"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.debug.rankedTagRetrieval).toMatchObject({ anilist_strict_tag_queries: 1, anilist_relaxed_tag_queries: 0, title_fallback_candidate_count: 0, strict_tag_candidate_count: 3 });
    expect(result.debug.executedQueries.some((query) => query.query === "FANTASY" || query.query === "Fantasy")).toBe(false);
  });

  it("strict boşsa canonical tag'i koruyarak rank 20 relaxed pass çalıştırır", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const rank = requestBody(init).minimumTagRank;
      return new Response(JSON.stringify({ results: rank === 40 ? [] : [normalized("28", "Low Politics", 28)] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request("exploratory").queryText, mediaItems: [], progressLogs: [], structuredRequest: request("exploratory") });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map((call) => requestBody(call[1]).tags)).toEqual([["Politics"], ["Politics"]]);
    expect(fetcher.mock.calls.map((call) => requestBody(call[1]).minimumTagRank)).toEqual([40, 20]);
    expect(result.internal?.rankedTagTraceByCandidateKey.get("anilist:anime:28")).toMatchObject({ retrievalPass: "relaxed_tag", rankBand: "20-39" });
  });

  it("tag sorgusu sıfır sonuçsa generic title adaylarıyla havuzu doldurmaz", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request().queryText, mediaItems: [], progressLogs: [], structuredRequest: request() });
    expect(result.candidates).toEqual([]);
    expect(result.debug.rankedTagRetrieval?.noResultReason).toBe("provider_tag_no_candidates");
    expect(fetcher.mock.calls.every((call) => requestBody(call[1]).query === undefined)).toBe(true);
  });

  it("tag provider hatasını constraint failure yerine unavailable olarak ayırır", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "hidden" }), { status: 503 })));
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request().queryText, mediaItems: [], progressLogs: [], structuredRequest: request() });
    expect(result.debug.rankedTagRetrieval?.noResultReason).toBe("provider_tag_query_unavailable");
    expect(result.candidates).toEqual([]);
  });

  it("schema drift'i boş katalog gibi yorumlamaz", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: { unexpected: true } }), { status: 200 })));
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request().queryText, mediaItems: [], progressLogs: [], structuredRequest: request() });
    expect(result.debug.rankedTagRetrieval?.noResultReason).toBe("provider_tag_query_unavailable");
    expect(result.debug.filterSummary.reasons.provider_response_schema_invalid).toBeGreaterThan(0);
  });

  it("tek malformed kayıt bütün response'u düşürmez ve büyük HTML metni taşınmaz", async () => {
    const valid = { ...normalized("valid", " Valid ", 63), overview: `<script>secret()</script>${"x".repeat(2_500)}` };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [null, { externalId: "", title: "" }, valid, normalized("two", "Two", 45)] }), { status: 200 })));
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request().queryText, mediaItems: [], progressLogs: [], structuredRequest: request() });
    expect(result.candidates.map((item) => item.externalId)).toEqual(["valid", "two"]);
    expect(result.candidates[0].title).toBe("Valid");
    expect(result.candidates[0].overview).not.toContain("<script>");
    expect(result.candidates[0].overview?.length).toBeLessThanOrEqual(2_000);
    expect(result.debug.filterSummary.reasons.provider_response_item_malformed).toBe(2);
  });

  it("strict pass geçerli aday bulduysa relaxed provider hatasında bu adayı kaybetmez", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const rank = requestBody(init).minimumTagRank;
      return rank === 40
        ? new Response(JSON.stringify({ results: [normalized("strict-one", "Strict one", 63)] }), { status: 200 })
        : new Response(JSON.stringify({ error: "hidden" }), { status: 503 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request().queryText, mediaItems: [], progressLogs: [], structuredRequest: request() });
    expect(result.candidates.map((item) => item.title)).toEqual(["Strict one"]);
    expect(result.debug.rankedTagRetrieval?.noResultReason).toBeUndefined();
  });

  it("mapping bulunmayan hard ranked-tag constraint'i title-search'e düşürmez", async () => {
    const unmappedRequest: RecommendationRequestV2 = {
      ...request(),
      aspectConstraints: [{ ...request().aspectConstraints[0], aspectId: "power_progression" }],
    };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: unmappedRequest.queryText, mediaItems: [], progressLogs: [], structuredRequest: unmappedRequest });
    expect(result.candidates).toEqual([]);
    expect(result.debug.rankedTagRetrieval).toMatchObject({ structuredTagRetrievalUsed: false, noResultReason: "provider_tag_mapping_missing", title_fallback_candidate_count: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("provider tag döndürüp relaxed tabanın altında rank verirse ayrı below-rank nedeni üretir", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [normalized("10", "Below minimum", 10)] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: request().queryText, mediaItems: [], progressLogs: [], structuredRequest: request() });
    expect(result.candidates).toEqual([]);
    expect(result.debug.rankedTagRetrieval?.noResultReason).toBe("candidates_below_tag_rank");
  });

  it("birden fazla ranked-tag must için bounded ayrı pass yapar; union tek must eşleşmesini primary yapmaz", async () => {
    const multiRequest: RecommendationRequestV2 = {
      ...request(),
      aspectConstraints: [
        ...request().aspectConstraints,
        { id: "revenge:must", kind: "aspect", aspectId: "revenge", role: "must", source: "explicit", minimumLevel: "significant" },
      ],
    };
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const tag = (requestBody(init).tags as string[] | undefined)?.[0];
      const item = tag === "Revenge"
        ? { ...normalized("revenge", "Revenge only", undefined), tags: [{ name: "Revenge", rank: 86 }] }
        : normalized("politics", "Politics only", 86);
      return new Response(JSON.stringify({ results: [item] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: providerPlan, profile: null, message: multiRequest.queryText, mediaItems: [], progressLogs: [], structuredRequest: multiRequest });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(4);
    expect(new Set(fetcher.mock.calls.map((call) => (requestBody(call[1]).tags as string[])[0]))).toEqual(new Set(["Politics", "Revenge"]));
    expect(result.candidates.map((item) => item.title).sort()).toEqual(["Politics only", "Revenge only"]);
    expect(scoreEligibleCandidates({ request: multiRequest, candidates: [rankable(normalized("politics", "Politics only", 86))], mediaItems: [], feedback: [] }).scored).toHaveLength(0);
  });
});

describe("D6.6-1R political intrigue evidence and pool gate", () => {
  it.each([
    [86, "significant", "high", true],
    [63, "significant", "high", true],
    [45, "significant", "medium", true],
  ] as const)("Politics rank %s -> %s/%s ve balanced primary havuzu=%s", (rank, level, confidence, eligible) => {
    const item = rankable(normalized(String(rank), `Politics ${rank}`, rank));
    expect(item.aspectEvidence.get("political_intrigue")).toMatchObject({ level, confidence });
    expect(scoreEligibleCandidates({ request: request(), candidates: [item], mediaItems: [], feedback: [] }).scored.length === 1).toBe(eligible);
    if (rank === 45) expect(scoreEligibleCandidates({ request: request("strict"), candidates: [item], mediaItems: [], feedback: [] }).scored).toHaveLength(0);
  });

  it("rank 28'i incidental tutar; yalnız exploratory near-match yapar", () => {
    const item = rankable(normalized("28", "Low Politics", 28));
    expect(item.aspectEvidence.get("political_intrigue")).toMatchObject({ level: "incidental", confidence: "low" });
    expect(scoreEligibleCandidates({ request: request(), candidates: [item], mediaItems: [], feedback: [] }).scored).toHaveLength(0);
    expect(scoreEligibleCandidates({ request: request("exploratory"), candidates: [item], mediaItems: [], feedback: [] }).nearMatches).toHaveLength(1);
  });

  it.each(["FANTASY", "Fantasy", "Pokémon: Diancie — Princess of the Diamond Domain"])("tag evidence taşımayan title/popularity adayını gate'te eler: %s", (title) => {
    const item = normalized(`missing-${title.length}`, title, undefined, 9_999_999);
    const snapshot = adaptAniListEvidence(item, "2026-08-06T00:00:00.000Z");
    const gate = applyRankedTagCandidatePoolGate({ request: request("exploratory"), candidates: [candidate(item)], evidenceByCandidateKey: new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]) });
    expect(gate.candidates).toEqual([]);
    expect(gate.rejected).toEqual([{ title, reason: "candidates_failed_ranked_tag_confidence" }]);
  });

  it("canonical Politics evidence taşıyan doğrulanmış title candidate'ı enrichment yoluyla kabul eder", () => {
    const item = normalized("verified", "Verified", 63);
    const snapshot = adaptAniListEvidence(item, "2026-08-06T00:00:00.000Z");
    const gate = applyRankedTagCandidatePoolGate({ request: request(), candidates: [candidate(item)], evidenceByCandidateKey: new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]) });
    expect(gate.candidates).toHaveLength(1);
    expect(gate.candidatesWithoutRequestedTag).toBe(0);
  });
});
