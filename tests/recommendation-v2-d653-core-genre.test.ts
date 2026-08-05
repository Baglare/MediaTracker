import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASPECT_REGISTRY, type AspectId } from "@/features/recommendations/domain";
import { aggregateAspectEvidence, buildRecommendationEvidenceTrace } from "@/features/recommendations/evidence";
import { adaptOpenLibraryEvidence } from "@/features/recommendations/providers/openlibrary-adapter";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { mapAniListTagClaims, mapProviderGenreClaims } from "@/features/recommendations/providers/evidence-mappers";
import type { CandidateProviderEvidenceSnapshot, RawProviderEvidenceClaim } from "@/features/recommendations/providers/types";
import { scoreEligibleCandidates } from "@/features/recommendations/ranking";
import { getPlanningProviderPolicy, getProviderSequence } from "@/lib/ai/provider";
import { aiSessionCodec } from "@/lib/ai/local-state";
import type { AiCandidate, AiIntent } from "@/lib/ai/types";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import { extractAniListStructuredFilters } from "@/lib/ai/candidate-search";

const CORE_GENRE_ASPECTS = [
  "action", "adventure", "comedy", "drama", "mystery", "horror", "fantasy",
  "sci_fi", "slice_of_life", "supernatural", "psychological", "historical", "romance",
] as const satisfies readonly AspectId[];

function snapshot(input: {
  id: string;
  aspectId: AspectId;
  provider?: "anilist" | "tmdb" | "omdb";
  genre?: boolean;
  tagRank?: number;
  communityScore?: number;
  claims?: RawProviderEvidenceClaim[];
}): CandidateProviderEvidenceSnapshot {
  const provider = input.provider ?? "anilist";
  const label = ASPECT_REGISTRY[input.aspectId].labelEn;
  const genres = input.genre ? [label] : [];
  const tags = input.tagRank === undefined ? [] : [{ name: label, rank: input.tagRank, category: "Theme" }];
  return {
    schemaVersion: 1,
    candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: provider, primaryExternalId: input.id, mediaType: provider === "anilist" ? "anime" : "movie" }),
    objectiveMetadata: { mediaType: provider === "anilist" ? "anime" : "movie", genres, tags, communityScore: input.communityScore },
    rawEvidenceClaims: input.claims ?? [
      ...mapProviderGenreClaims(provider, genres, provider === "omdb" ? 0.65 : 0.9),
      ...(provider === "anilist" ? mapAniListTagClaims(tags) : []),
    ],
    providerCoverage: { [provider]: "available" },
    missingFields: [],
    fetchedAt: "2026-08-05T00:00:00.000Z",
    cacheStatus: "miss",
    warnings: [],
  };
}

function request(aspectId: AspectId, strictness: RecommendationRequestV2["strictness"] = "balanced"): RecommendationRequestV2 {
  return {
    version: 2,
    queryText: `${ASPECT_REGISTRY[aspectId].labelTr} anime`,
    targetMediaTypes: ["anime"],
    aspectConstraints: [{ id: `${aspectId}:must`, kind: "aspect", aspectId, role: "must", source: "explicit", minimumLevel: "significant" }],
    objectiveConstraints: [], strictness, references: [], profileSignalsEnabled: false,
    semanticVerifierMode: "structured_only", locale: "tr-TR",
  };
}

function rankable(item: CandidateProviderEvidenceSnapshot) {
  const candidate: AiCandidate = {
    source: item.candidateIdentity.primaryProvider,
    externalId: item.candidateIdentity.primaryExternalId,
    type: item.candidateIdentity.mediaType,
    title: `Synthetic ${item.candidateIdentity.primaryExternalId}`,
  };
  return { candidate, snapshot: item, aspectEvidence: aggregateAspectEvidence({ snapshot: item }) };
}

describe("D6-5.3 registry-driven core genre calibration", () => {
  it.each(CORE_GENRE_ASPECTS)("AniList %s exact genre-only significant/medium üretir", (aspectId) => {
    const genreOnly = aggregateAspectEvidence({ snapshot: snapshot({ id: `${aspectId}:genre`, aspectId, genre: true }) }).get(aspectId);
    const medium = aggregateAspectEvidence({ snapshot: snapshot({ id: `${aspectId}:medium`, aspectId, genre: true, tagRank: 50 }) }).get(aspectId);
    const high = aggregateAspectEvidence({ snapshot: snapshot({ id: `${aspectId}:high`, aspectId, genre: true, tagRank: 85 }) }).get(aspectId);
    const lowTag = aggregateAspectEvidence({ snapshot: snapshot({ id: `${aspectId}:low`, aspectId, tagRank: 15 }) }).get(aspectId);
    const none = aggregateAspectEvidence({ snapshot: snapshot({ id: `${aspectId}:none`, aspectId, communityScore: 100 }) }).get(aspectId);
    expect(genreOnly).toMatchObject({ level: "significant", confidence: "medium" });
    expect(genreOnly?.strength).toBeGreaterThanOrEqual(0.5);
    expect(genreOnly?.strength).toBeLessThan(0.75);
    expect(medium).toMatchObject({ level: "significant", confidence: "high" });
    expect(high).toMatchObject({ level: "primary", confidence: "high" });
    expect(lowTag).toMatchObject({ level: "incidental" });
    expect(none).toMatchObject({ strength: null, level: "unknown", confidence: "unknown" });
  });

  it("Fantasy genre ve tag kombinasyonlarını bounded merkezilikle ayırır", () => {
    const genreOnly = aggregateAspectEvidence({ snapshot: snapshot({ id: "g", aspectId: "fantasy", genre: true }) }).get("fantasy");
    const medium = aggregateAspectEvidence({ snapshot: snapshot({ id: "m", aspectId: "fantasy", genre: true, tagRank: 50 }) }).get("fantasy");
    const high = aggregateAspectEvidence({ snapshot: snapshot({ id: "h", aspectId: "fantasy", genre: true, tagRank: 85 }) }).get("fantasy");
    const lowTag = aggregateAspectEvidence({ snapshot: snapshot({ id: "l", aspectId: "fantasy", tagRank: 15 }) }).get("fantasy");
    const none = aggregateAspectEvidence({ snapshot: snapshot({ id: "n", aspectId: "fantasy", communityScore: 99 }) }).get("fantasy");
    expect(genreOnly).toMatchObject({ level: "significant", confidence: "medium" });
    expect(medium).toMatchObject({ level: "significant", confidence: "high" });
    expect(high).toMatchObject({ level: "primary", confidence: "high" });
    expect(lowTag).toMatchObject({ level: "incidental", confidence: "medium" });
    expect(none).toMatchObject({ strength: null, level: "unknown", confidence: "unknown" });
  });

  it.each(["political_intrigue", "love_triangle", "fanservice", "character_driven"] as const)("%s core genre tabanından significant olmaz", (aspectId) => {
    const claim: RawProviderEvidenceClaim = {
      id: `malformed-map:${aspectId}`, sourceKind: "provider_genre", scope: "candidate_metadata",
      provider: "anilist", field: "genres", value: "Fantasy", normalizedValue: "fantasy",
      reliability: 0.9, mappedAspectIds: [aspectId],
    };
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({ id: aspectId, aspectId, claims: [claim] }) }).get(aspectId);
    expect(evidence?.level).not.toBe("significant");
    expect(evidence?.level).not.toBe("primary");
  });

  it("provider support seviyesini uygular ve Open Library subject'i genre saymaz", () => {
    expect(aggregateAspectEvidence({ snapshot: snapshot({ id: "tmdb", aspectId: "fantasy", provider: "tmdb", genre: true }) }).get("fantasy")).toMatchObject({ level: "significant", confidence: "medium" });
    expect(aggregateAspectEvidence({ snapshot: snapshot({ id: "omdb", aspectId: "fantasy", provider: "omdb", genre: true }) }).get("fantasy")?.level).toBe("incidental");
    const openLibrary = adaptOpenLibraryEvidence({ externalId: "/works/OL1W", workId: "/works/OL1W", type: "book", title: "Synthetic Fantasy", subjects: ["Fantasy"] });
    expect(openLibrary.rawEvidenceClaims[0]?.sourceKind).toBe("provider_keyword");
    expect(openLibrary.rawEvidenceClaims[0]?.field).toBe("subjects");
    expect(openLibrary.objectiveMetadata).toMatchObject({ subjects: ["Fantasy"] });
    expect(openLibrary.objectiveMetadata.genres).toBeUndefined();
    expect(aggregateAspectEvidence({ snapshot: openLibrary }).get("fantasy")?.level).toBe("incidental");
    expect(ASPECT_REGISTRY.fantasy.providerSupport.tvmaze).toBe("partial");
    const unsupportedClaim: RawProviderEvidenceClaim = {
      id: "omdb-power", sourceKind: "provider_genre", scope: "candidate_metadata", provider: "omdb",
      field: "genres", value: "Power Progression", normalizedValue: "power progression", reliability: 0.9,
      mappedAspectIds: ["power_progression"],
    };
    expect(aggregateAspectEvidence({ snapshot: snapshot({ id: "unsupported", aspectId: "power_progression", provider: "omdb", claims: [unsupportedClaim] }) }).get("power_progression")).toMatchObject({ level: "unknown" });
  });

  it("Fantasy balanced eligibility ve exploratory near-match sözleşmesini korur", () => {
    const significant = rankable(snapshot({ id: "significant", aspectId: "fantasy", genre: true }));
    const incidental = rankable(snapshot({ id: "incidental", aspectId: "fantasy", tagRank: 15 }));
    const unknown = rankable(snapshot({ id: "unknown", aspectId: "fantasy", communityScore: 100 }));
    expect(scoreEligibleCandidates({ request: request("fantasy"), candidates: [significant], mediaItems: [], feedback: [] }).scored).toHaveLength(1);
    expect(scoreEligibleCandidates({ request: request("fantasy", "strict"), candidates: [significant], mediaItems: [], feedback: [] }).scored).toHaveLength(0);
    const exploratory = scoreEligibleCandidates({ request: request("fantasy", "exploratory"), candidates: [incidental, unknown], mediaItems: [], feedback: [] });
    expect(exploratory.nearMatches.map((item) => item.candidate.externalId)).toEqual(["incidental"]);
    const trace = buildRecommendationEvidenceTrace({
      titleSnapshot: incidental.candidate.title, snapshot: incidental.snapshot,
      constraint: request("fantasy", "exploratory").aspectConstraints[0], evidence: incidental.aspectEvidence.get("fantasy")!,
      decision: exploratory.nearMatches[0].aspectDecisions[0],
    });
    expect(trace).toMatchObject({ aggregationResult: { level: "incidental" }, failedRule: "must_minimum_level" });
  });

  it("approved Fantasy request'i strict ve relaxed AniList discover pass'lerinde korur", () => {
    const intent: AiIntent = {
      kind: "general_recommendation", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: ["romance"],
      needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false,
    };
    const structured: RecommendationRequestV2 = {
      ...request("fantasy", "exploratory"),
      aspectConstraints: [
        ...request("fantasy").aspectConstraints,
        { id: "romance:avoid", kind: "aspect", aspectId: "romance", role: "avoid", source: "explicit", rejectAtLevel: "incidental" },
      ],
    };
    const filters = extractAniListStructuredFilters(intent, "eski mesaj", structured);
    expect(filters.strict?.genres).toEqual(["Fantasy"]);
    expect(filters.relaxed?.genres).toEqual(["Fantasy"]);
  });

  it("Fantasy prefer coverage'sız popüler adayı doldurma amacıyla kabul etmez", () => {
    const prefer: RecommendationRequestV2 = {
      ...request("fantasy"),
      aspectConstraints: [{ id: "fantasy:prefer", kind: "aspect", aspectId: "fantasy", role: "prefer", source: "explicit", minimumLevel: "incidental" }],
    };
    const genre = rankable(snapshot({ id: "genre", aspectId: "fantasy", genre: true }));
    const popularUnknown = rankable(snapshot({ id: "popular", aspectId: "fantasy", communityScore: 100 }));
    const result = scoreEligibleCandidates({ request: prefer, candidates: [genre, popularUnknown], mediaItems: [], feedback: [] });
    expect(result.scored.map((item) => item.candidate.externalId)).toEqual(["genre"]);
    expect(result.rejected).toContainEqual({ title: popularUnknown.candidate.title, reason: "candidates_below_request_coverage" });
  });
});

describe("D6-5.3 planning provider transparency", () => {
  it("auto modunda OpenAI tercihini yalnız provider sırasına uygular", () => {
    expect(getProviderSequence({ useOpenAIProvider: true }, "auto").map((provider) => provider.name)[0]).toBe("openai");
    expect(getProviderSequence({ useOpenAIProvider: false }, "auto").map((provider) => provider.name)).not.toContain("openai");
    expect(getPlanningProviderPolicy({ useOpenAIProvider: true }, "auto")).toEqual({ providerPolicyMode: "auto", openAiPreferenceApplied: true });
  });

  it("fixed ve mock modlarında OpenAI checkbox tercihinin uygulanmadığını bildirir", () => {
    expect(getProviderSequence({ useOpenAIProvider: true }, "gemini").map((provider) => provider.name)).toEqual(["gemini"]);
    expect(getPlanningProviderPolicy({ useOpenAIProvider: true }, "gemini")).toEqual({ providerPolicyMode: "fixed", configuredPlanningProvider: "gemini", openAiPreferenceApplied: false });
    expect(getPlanningProviderPolicy({ useOpenAIProvider: true }, "mock")).toEqual({ providerPolicyMode: "mock", configuredPlanningProvider: "mock", openAiPreferenceApplied: false });
  });

  it("normal UI planning provider'ı ayrı, final ranking'i deterministic olarak anlatır", () => {
    const source = readFileSync("features/recommendations/ui/engine-transparency.tsx", "utf8");
    const advisor = readFileSync("components/ai-advisor.tsx", "utf8");
    expect(source).toContain("Arama planı:");
    expect(source).toContain("LLM final sıralama: kullanılmadı");
    expect(advisor).toContain("OpenAI tercihi uygulanmaz");
    expect(advisor).toContain('disabled={key === "useOpenAIProvider" && openAiPreferenceLocked}');
  });

  it("planning policy active-session hydration'da allowlist ile korunur", () => {
    const decoded = aiSessionCodec({
      version: 1,
      sessions: [],
      activeSession: {
        v: 1, messages: [], recommendations: [], nearMatches: [],
        planningPolicy: { providerPolicyMode: "fixed", configuredPlanningProvider: "gemini", openAiPreferenceApplied: false, secret: "drop" },
      },
    });
    expect(decoded.ok && decoded.value.activeSession?.planningPolicy).toEqual({
      providerPolicyMode: "fixed", configuredPlanningProvider: "gemini", openAiPreferenceApplied: false,
    });
  });
});
