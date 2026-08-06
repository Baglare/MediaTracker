import { describe, expect, it } from "vitest";
import { createAspectEvidence, createUnknownAspectEvidence } from "@/features/recommendations/domain";
import type { EvidenceConfidence, RecommendationRequestV2 } from "@/features/recommendations/domain";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import type { CandidateProviderEvidenceSnapshot } from "@/features/recommendations/providers/types";
import { rerankForDiversity, scoreEligibleCandidates } from "@/features/recommendations/ranking";
import type { AiCandidate } from "@/lib/ai/types";

function snapshot(id: string, score = 80): CandidateProviderEvidenceSnapshot {
  return { schemaVersion: 1, candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: id, mediaType: "anime" }), objectiveMetadata: { mediaType: "anime", episodeCount: 12, communityScore: score }, rawEvidenceClaims: [], providerCoverage: { anilist: "available" }, missingFields: [], fetchedAt: "2026-08-04T00:00:00.000Z", cacheStatus: "miss", warnings: [] };
}

const request: RecommendationRequestV2 = {
  version: 2, queryText: "romantik anime", targetMediaTypes: ["anime"], strictness: "balanced", references: [], profileSignalsEnabled: true, semanticVerifierMode: "structured_only", locale: "tr-TR",
  aspectConstraints: [{ id: "romance-must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant", minimumConfidence: "medium" }],
  objectiveConstraints: [{ id: "short", kind: "objective", field: "length", unit: "episode", operator: "lte", value: 13, role: "must", source: "explicit" }],
};

function rankable(id: string, strength: number | null, score = 80, confidence: EvidenceConfidence = "medium") {
  const candidate: AiCandidate = { source: "anilist", externalId: id, type: "anime", title: `Anime ${id}` };
  const evidence = strength === null ? createUnknownAspectEvidence("romance") : createAspectEvidence({ aspectId: "romance", strength, confidence, sources: [{ id: `g-${id}`, sourceKind: "provider_genre", scope: "candidate_metadata", provider: "anilist", field: "genres", reliability: 0.8 }, { id: `t-${id}`, sourceKind: "provider_tag_rank", scope: "candidate_metadata", provider: "anilist", field: "tags", reliability: 0.8 }], supportingEvidence: [{ id: `g-${id}`, sourceKind: "provider_genre", scope: "candidate_metadata", provider: "anilist", field: "genres", reliability: 0.8 }, { id: `t-${id}`, sourceKind: "provider_tag_rank", scope: "candidate_metadata", provider: "anilist", field: "tags", reliability: 0.8 }], contradictoryEvidence: [], verifierMode: "structured_only", warnings: [] });
  return { candidate, snapshot: snapshot(id, score), aspectEvidence: new Map([["romance" as const, evidence]]) };
}

describe("D6-3 deterministic eligibility and ranking", () => {
  it("must aspect ihlalini popularity yüksek olsa da scored listeye sokmaz", () => {
    const result = scoreEligibleCandidates({ request, candidates: [rankable("bad", 0.3, 99), rankable("good", 0.65, 60)], mediaItems: [], feedback: [] });
    expect(result.scored.map((item) => item.candidate.externalId)).toEqual(["good"]);
    expect(result.rejected).toContainEqual({ title: "Anime bad", reason: "candidates_failed_romance_strength" });
  });

  it("unknown must primary sonuçtan elenir", () => {
    const result = scoreEligibleCandidates({ request, candidates: [rankable("unknown", null)], mediaItems: [], feedback: [] });
    expect(result.scored).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("candidates_failed_confidence");
  });

  it("aynı girdide deterministik sıra üretir", () => {
    const input = [rankable("b", 0.65), rankable("a", 0.65)];
    const first = scoreEligibleCandidates({ request, candidates: input, mediaItems: [], feedback: [] }).scored;
    const second = scoreEligibleCandidates({ request, candidates: [...input].reverse(), mediaItems: [], feedback: [] }).scored;
    expect(first.map((item) => item.candidate.externalId)).toEqual(second.map((item) => item.candidate.externalId));
    expect(first[0].scoreBreakdown).toEqual(expect.objectContaining({ requestFit: expect.any(Number), personalFit: expect.any(Number), evidenceConfidence: expect.any(Number), qualitySignal: expect.any(Number), novelty: 1, diversityContribution: 1 }));
  });

  it("exact dismissed feedback yalnız exact item personal fit'ini etkiler", () => {
    const feedback = [{ id: "f", action: "dismissed" as const, recommendationId: "r", title: "Anime a", mediaType: "anime" as const, source: "AniList", externalSource: "anilist" as const, externalId: "a", createdAt: "2026-08-04T00:00:00.000Z" }];
    const result = scoreEligibleCandidates({ request, candidates: [rankable("a", 0.65), rankable("b", 0.65)], mediaItems: [], feedback });
    expect(result.scored.find((item) => item.candidate.externalId === "a")?.scoreBreakdown.personalFit).toBe(-1);
    expect(result.scored.find((item) => item.candidate.externalId === "b")?.scoreBreakdown.personalFit).toBe(0);
    expect(result.scored.map((item) => item.candidate.externalId)).toEqual(["b", "a"]);
  });

  it("eşit requestFit'te evidence confidence'ı personal fit'in önünde tutar", () => {
    const feedback = [{ id: "f", action: "dismissed" as const, recommendationId: "r", title: "Anime strong", mediaType: "anime" as const, source: "AniList", externalSource: "anilist" as const, externalId: "strong", createdAt: "2026-08-04T00:00:00.000Z" }];
    const result = scoreEligibleCandidates({ request, candidates: [rankable("personal", 0.65, 80, "medium"), rankable("strong", 0.65, 80, "high")], mediaItems: [], feedback });
    expect(result.scored.map((item) => item.candidate.externalId)).toEqual(["strong", "personal"]);
    expect(result.scored[0]?.scoreBreakdown.personalFit).toBe(-1);
  });

  it("aynı input'u 20 tekrarda aynı sırada tutar", () => {
    const candidates = [rankable("c", 0.65), rankable("a", 0.65), rankable("b", 0.65)];
    const orders = Array.from({ length: 20 }, (_, index) => scoreEligibleCandidates({ request, candidates: index % 2 ? [...candidates].reverse() : candidates, mediaItems: [], feedback: [] }).scored.map((item) => item.candidate.externalId).join(","));
    expect(new Set(orders)).toEqual(new Set(["a,b,c"]));
  });

  it("weighted explicit coverage ile daha fazla prefer eşleşen adayı öne alır", () => {
    const preferRequest: RecommendationRequestV2 = { ...request, objectiveConstraints: [], aspectConstraints: [
      { id: "romance", kind: "aspect", aspectId: "romance", role: "prefer", source: "explicit", minimumLevel: "incidental" },
      { id: "fantasy", kind: "aspect", aspectId: "fantasy", role: "prefer", source: "explicit", minimumLevel: "incidental" },
    ] };
    const romanceOnly = rankable("one", 0.65);
    const fantasyEvidence = createAspectEvidence({ aspectId: "fantasy", strength: 0.65, confidence: "medium", sources: [{ id: "fantasy", sourceKind: "provider_genre", scope: "candidate_metadata", provider: "anilist", field: "genres", reliability: 0.9 }], supportingEvidence: [{ id: "fantasy", sourceKind: "provider_genre", scope: "candidate_metadata", provider: "anilist", field: "genres", reliability: 0.9 }], contradictoryEvidence: [], verifierMode: "structured_only", warnings: [] });
    const both = rankable("both", 0.65);
    both.aspectEvidence.set("fantasy", fantasyEvidence);
    const result = scoreEligibleCandidates({ request: preferRequest, candidates: [romanceOnly, both], mediaItems: [], feedback: [] });
    expect(result.scored.map((item) => item.candidate.externalId)).toEqual(["both", "one"]);
    expect(result.scored[0]?.explicitRequestCoverage).toMatchObject({ matchedWeight: 2, totalWeight: 2, coverage: 1, matchedExplicitAspectIds: ["romance", "fantasy"], unmatchedExplicitAspectIds: [] });
    expect(result.scored[1]?.explicitRequestCoverage).toMatchObject({ matchedWeight: 1, totalWeight: 2, coverage: 0.5, matchedExplicitAspectIds: ["romance"], unmatchedExplicitAspectIds: ["fantasy"], meetsMinimum: true });
  });

  it("diversity rerank sonucu sayısını zorla doldurmaz", () => {
    const scored = scoreEligibleCandidates({ request, candidates: [rankable("a", 0.65), rankable("b", 0.65)], mediaItems: [], feedback: [] }).scored;
    expect(rerankForDiversity(scored, 5)).toHaveLength(2);
  });
});
