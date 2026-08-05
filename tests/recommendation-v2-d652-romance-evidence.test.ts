import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeRecommendationRequestV2, type RecommendationRequestV2 } from "@/features/recommendations/domain";
import { aggregateAspectEvidence, buildRecommendationEvidenceTrace } from "@/features/recommendations/evidence";
import { buildGroundedNearMatchRecommendation } from "@/features/recommendations/explanation";
import { extractStructuredConstraints } from "@/features/recommendations/intent/constraint-extractor";
import { patchRecommendationRequest } from "@/features/recommendations/intent/request-patch";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { mapAniListTagClaims, mapProviderGenreClaims } from "@/features/recommendations/providers/evidence-mappers";
import type { CandidateProviderEvidenceSnapshot } from "@/features/recommendations/providers/types";
import { scoreEligibleCandidates } from "@/features/recommendations/ranking";
import { appendRecommendationMessage, userFacingNoResultSummary } from "@/features/recommendations/ui";
import { extractAniListStructuredFilters } from "@/lib/ai/candidate-search";
import { aiSessionCodec } from "@/lib/ai/local-state";
import type { AiCandidate, AiIntent } from "@/lib/ai/types";

const intent: AiIntent = {
  kind: "general_recommendation", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: [],
  needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false,
};

function request(minimumLevel: "significant" | "primary" = "significant", strictness: RecommendationRequestV2["strictness"] = "balanced"): RecommendationRequestV2 {
  return {
    version: 2,
    queryText: "Romantizm odaklı anime öner.",
    targetMediaTypes: ["anime"],
    aspectConstraints: [{ id: "romance:must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel }],
    objectiveConstraints: [],
    strictness,
    references: [],
    profileSignalsEnabled: false,
    semanticVerifierMode: "structured_only",
    locale: "tr-TR",
  };
}

function snapshot(input: {
  id: string;
  romanceGenre?: boolean;
  romanceTagRank?: number;
  loveTriangle?: boolean;
  communityScore?: number;
}): CandidateProviderEvidenceSnapshot {
  const genres = input.romanceGenre ? ["Romance", "Comedy"] : ["Comedy"];
  const tags = [
    ...(input.romanceTagRank === undefined ? [] : [{ name: "Romance", rank: input.romanceTagRank, category: "Theme" }]),
    ...(input.loveTriangle ? [{ name: "Love Triangle", rank: 50, category: "Theme" }] : []),
  ];
  return {
    schemaVersion: 1,
    candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: input.id, mediaType: "anime" }),
    objectiveMetadata: { mediaType: "anime", genres, tags, communityScore: input.communityScore },
    rawEvidenceClaims: [...mapProviderGenreClaims("anilist", genres, 0.9), ...mapAniListTagClaims(tags)],
    providerCoverage: { anilist: "available" },
    missingFields: [],
    fetchedAt: "2026-08-05T00:00:00.000Z",
    cacheStatus: "miss",
    warnings: [],
  };
}

function rankable(item: CandidateProviderEvidenceSnapshot) {
  const candidate: AiCandidate = { source: "anilist", externalId: item.candidateIdentity.primaryExternalId, type: "anime", title: `Synthetic ${item.candidateIdentity.primaryExternalId}` };
  return { candidate, snapshot: item, aspectEvidence: aggregateAspectEvidence({ snapshot: item }) };
}

describe("D6-5.2 structured-only romance evidence", () => {
  it("güçlü romantizm ve ana tema ifadelerini primary; manuel must'ı significant yapar", () => {
    const strong = extractStructuredConstraints({ message: "Güçlü romantizm öğeleri olan anime istiyorum.", targetMediaTypes: ["anime"] });
    const theme = extractStructuredConstraints({ message: "Romantizm ana tema olan anime istiyorum.", targetMediaTypes: ["anime"] });
    expect(strong.aspectConstraints).toContainEqual(expect.objectContaining({ aspectId: "romance", role: "must", source: "explicit", minimumLevel: "primary" }));
    expect(theme.aspectConstraints).toContainEqual(expect.objectContaining({ aspectId: "romance", minimumLevel: "primary" }));
    const decoded = decodeRecommendationRequestV2({ ...request(), aspectConstraints: [{ id: "legacy", kind: "aspect", aspectId: "romance", role: "must", source: "explicit" }] });
    expect(decoded.ok && decoded.value.aspectConstraints[0]).toMatchObject({ minimumLevel: "significant" });
  });

  it("Romance genre-only significant/medium üretir ve balanced significant must'ı geçirir", () => {
    const item = rankable(snapshot({ id: "genre-only", romanceGenre: true }));
    expect(item.aspectEvidence.get("romance")).toMatchObject({ level: "significant", confidence: "medium", verifierMode: "structured_only" });
    expect(scoreEligibleCandidates({ request: request(), candidates: [item], mediaItems: [], feedback: [] }).scored).toHaveLength(1);
    expect(scoreEligibleCandidates({ request: request("significant", "strict"), candidates: [item], mediaItems: [], feedback: [] }).scored).toHaveLength(0);
  });

  it("genre + yüksek tag primary/high; genre + orta tag significant/high üretir", () => {
    const high = rankable(snapshot({ id: "high", romanceGenre: true, romanceTagRank: 85 }));
    const medium = rankable(snapshot({ id: "medium", romanceGenre: true, romanceTagRank: 50 }));
    expect(high.aspectEvidence.get("romance")).toMatchObject({ level: "primary", confidence: "high" });
    expect(medium.aspectEvidence.get("romance")).toMatchObject({ level: "significant", confidence: "high" });
    expect(scoreEligibleCandidates({ request: request(), candidates: [high, medium], mediaItems: [], feedback: [] }).scored).toHaveLength(2);
  });

  it("yalnız düşük tag incidental kalır; primary must için bounded trace ve near-match üretir", () => {
    const item = rankable(snapshot({ id: "incidental", romanceTagRank: 15 }));
    expect(item.aspectEvidence.get("romance")).toMatchObject({ level: "incidental", confidence: "medium" });
    const result = scoreEligibleCandidates({ request: request("primary", "exploratory"), candidates: [item], mediaItems: [], feedback: [] });
    expect(result.scored).toHaveLength(0);
    expect(result.nearMatches).toHaveLength(1);
    const trace = buildRecommendationEvidenceTrace({ titleSnapshot: item.candidate.title, snapshot: item.snapshot, constraint: request("primary", "exploratory").aspectConstraints[0], evidence: item.aspectEvidence.get("romance")!, decision: result.nearMatches[0].aspectDecisions[0] });
    expect(trace).toMatchObject({ failedRule: "must_minimum_level", aggregationResult: { level: "incidental", confidence: "medium" } });
    expect(trace.rawClaims.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(trace)).not.toMatch(/personal|secret/i);
  });

  it("romance claim'i olmayan popüler aday coverage veya near-match kazanmaz", () => {
    const item = rankable(snapshot({ id: "popular-no-romance", communityScore: 99 }));
    expect(item.aspectEvidence.get("romance")).toMatchObject({ strength: null, level: "unknown", confidence: "unknown" });
    const result = scoreEligibleCandidates({ request: request("significant", "exploratory"), candidates: [item], mediaItems: [], feedback: [] });
    expect(result.scored).toHaveLength(0);
    expect(result.nearMatches).toHaveLength(0);
  });

  it("love triangle avoid ihlalini primary'den çıkarır ve pozitif açıklama üretmez", () => {
    const item = rankable(snapshot({ id: "triangle", romanceGenre: true, romanceTagRank: 50, loveTriangle: true }));
    const structured: RecommendationRequestV2 = {
      ...request("significant", "exploratory"),
      aspectConstraints: [
        ...request().aspectConstraints,
        { id: "triangle:avoid", kind: "aspect", aspectId: "love_triangle", role: "avoid", source: "explicit", rejectAtLevel: "incidental" },
      ],
    };
    const result = scoreEligibleCandidates({ request: structured, candidates: [item], mediaItems: [], feedback: [] });
    expect(result.scored).toHaveLength(0);
    expect(result.nearMatches).toHaveLength(1);
    const recommendation = buildGroundedNearMatchRecommendation(result.nearMatches[0], structured, 0);
    expect(recommendation.fitLabel).toBe("Yakın eşleşme");
    expect(recommendation.reason).not.toContain("Aşk üçgeni");
    expect(recommendation.violatedConstraints.join(" ")).toContain("Aşk üçgeni");
  });
});

describe("D6-5.2 request, message and UI contracts", () => {
  it("approved request Romance discover filtresini relaxed pass'te de korur", () => {
    const filters = extractAniListStructuredFilters(intent, "eski mesaj yalnız aksiyon", request());
    expect(filters.strict?.genres).toContain("Romance");
    expect(filters.relaxed?.genres).toContain("Romance");
  });

  it("follow-up minimumLevel patch'ini görünür request'e primary olarak taşır", () => {
    const patched = patchRecommendationRequest(request(), "Romantizmi daha güçlü olsun");
    expect(patched.request?.aspectConstraints).toContainEqual(expect.objectContaining({ aspectId: "romance", minimumLevel: "primary", source: "explicit" }));
  });

  it("session hydration minimumLevel'ı korur ve legacy eksik level'ı significant yapar", () => {
    const state = aiSessionCodec({
      version: 1,
      sessions: [{ id: "s", createdAt: "2026-08-05T00:00:00.000Z", prompt: "p", assistantMessage: "a", recommendations: [], settings: {}, structuredRequestV2: { ...request(), aspectConstraints: [{ id: "legacy", kind: "aspect", aspectId: "romance", role: "must", source: "explicit" }] } }],
    });
    expect(state.ok && state.value.sessions[0].structuredRequestV2).toMatchObject({ aspectConstraints: [expect.objectContaining({ minimumLevel: "significant" })] });
  });

  it("aynı stable message event'ini tek kez, aynı metinli yeni event'i ayrı tutar", () => {
    const first = appendRecommendationMessage([], { id: "m1", role: "user", content: "Aynı istek" });
    expect(appendRecommendationMessage(first, { id: "m1", role: "user", content: "Aynı istek" })).toHaveLength(1);
    expect(appendRecommendationMessage(first, { id: "m2", role: "user", content: "Aynı istek" })).toHaveLength(2);
    const advisor = readFileSync("components/ai-advisor.tsx", "utf8");
    expect(advisor.match(/appendRecommendationMessage\(/g)).toHaveLength(1);
  });

  it("minimum seviye, no-result ve ortak near-match kart metinlerini kullanıcı sözleşmesiyle gösterir", () => {
    const editor = readFileSync("features/recommendations/ui/aspect-constraint-editor.tsx", "utf8");
    expect(editor).toContain("Belirgin veya ana unsur");
    expect(editor).toContain("Yalnız ana unsur");
    expect(editor).not.toMatch(/>primary<|>significant<|>minimumLevel</);
    expect(userFacingNoResultSummary({ rejectedReasons: ["candidates_failed_romance_strength"], providerFallbackUsed: false, evaluatedCandidateCount: 4 })).toContain("Romantizm için istenen merkeziyet düzeyini");
    const near = readFileSync("features/recommendations/ui/near-match-section.tsx", "utf8");
    expect(near).toContain("RecommendationCardHeader");
    expect(near).toContain("EvidenceSummary");
    expect(near).toContain("nearMatchReason");
  });
});
