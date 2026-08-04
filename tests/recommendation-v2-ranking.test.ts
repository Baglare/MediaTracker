import { describe, expect, it } from "vitest";
import { createAspectEvidence, createUnknownAspectEvidence } from "@/features/recommendations/domain";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain";
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

function rankable(id: string, strength: number | null, score = 80) {
  const candidate: AiCandidate = { source: "anilist", externalId: id, type: "anime", title: `Anime ${id}` };
  const evidence = strength === null ? createUnknownAspectEvidence("romance") : createAspectEvidence({ aspectId: "romance", strength, confidence: "medium", sources: [{ id: `g-${id}`, sourceKind: "provider_genre", scope: "candidate_metadata", provider: "anilist", field: "genres", reliability: 0.8 }, { id: `t-${id}`, sourceKind: "provider_tag_rank", scope: "candidate_metadata", provider: "anilist", field: "tags", reliability: 0.8 }], supportingEvidence: [{ id: `g-${id}`, sourceKind: "provider_genre", scope: "candidate_metadata", provider: "anilist", field: "genres", reliability: 0.8 }, { id: `t-${id}`, sourceKind: "provider_tag_rank", scope: "candidate_metadata", provider: "anilist", field: "tags", reliability: 0.8 }], contradictoryEvidence: [], verifierMode: "structured_only", warnings: [] });
  return { candidate, snapshot: snapshot(id, score), aspectEvidence: new Map([["romance" as const, evidence]]) };
}

describe("D6-3 deterministic eligibility and ranking", () => {
  it("must aspect ihlalini popularity yüksek olsa da scored listeye sokmaz", () => {
    const result = scoreEligibleCandidates({ request, candidates: [rankable("bad", 0.3, 99), rankable("good", 0.65, 60)], mediaItems: [], feedback: [] });
    expect(result.scored.map((item) => item.candidate.externalId)).toEqual(["good"]);
    expect(result.rejected).toContainEqual({ title: "Anime bad", reason: "failed_must" });
  });

  it("unknown must primary sonuçtan elenir", () => {
    const result = scoreEligibleCandidates({ request, candidates: [rankable("unknown", null)], mediaItems: [], feedback: [] });
    expect(result.scored).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("unknown");
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
  });

  it("diversity rerank sonucu sayısını zorla doldurmaz", () => {
    const scored = scoreEligibleCandidates({ request, candidates: [rankable("a", 0.65), rankable("b", 0.65)], mediaItems: [], feedback: [] }).scored;
    expect(rerankForDiversity(scored, 5)).toHaveLength(2);
  });
});
