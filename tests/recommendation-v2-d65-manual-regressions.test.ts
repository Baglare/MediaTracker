import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAspectEvidence,
  createUnknownAspectEvidence,
  decodeRecommendationRequestV2,
  type AspectId,
  type AspectEvidence,
  type RecommendationRequestV2,
} from "@/features/recommendations/domain";
import { buildGroundedRecommendation } from "@/features/recommendations/explanation";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { mapAniListTagClaims, mapProviderGenreClaims } from "@/features/recommendations/providers/evidence-mappers";
import type { CandidateProviderEvidenceSnapshot } from "@/features/recommendations/providers/types";
import { scoreEligibleCandidates } from "@/features/recommendations/ranking";
import { userFacingRecommendationWarning, userFacingRejectionReason } from "@/features/recommendations/ui/user-facing-text";
import { extractAniListStructuredFilters } from "@/lib/ai/candidate-search";
import { applyStructuredRequestToRetrievalPlan } from "@/features/recommendations/intent/retrieval-guardrails";
import type { AiCandidate, AiIntent } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";

const intent: AiIntent = {
  kind: "general", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: [],
  needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false,
};

function request(aspectConstraints: RecommendationRequestV2["aspectConstraints"], strictness: RecommendationRequestV2["strictness"] = "balanced"): RecommendationRequestV2 {
  return {
    version: 2, queryText: "anime öner", targetMediaTypes: ["anime"], aspectConstraints,
    objectiveConstraints: [], strictness, references: [], profileSignalsEnabled: true,
    semanticVerifierMode: "structured_only", locale: "tr-TR",
  };
}

function snapshot(id: string, communityScore = 70): CandidateProviderEvidenceSnapshot {
  return {
    schemaVersion: 1,
    candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: id, mediaType: "anime" }),
    objectiveMetadata: { mediaType: "anime", communityScore }, rawEvidenceClaims: [],
    providerCoverage: { anilist: "available" }, missingFields: [], fetchedAt: "2026-08-05T00:00:00.000Z",
    cacheStatus: "miss", warnings: [],
  };
}

function evidence(aspectId: AspectId, strength: number, confidence: AspectEvidence["confidence"], sourceKind: "provider_genre" | "provider_tag_rank" = "provider_genre"): AspectEvidence {
  const claim = { id: `${aspectId}:${sourceKind}`, sourceKind, scope: "candidate_metadata" as const, provider: "anilist" as const, field: sourceKind === "provider_genre" ? "genres" : "tags", value: aspectId, reliability: sourceKind === "provider_tag_rank" ? 0.9 : 0.8 };
  return createAspectEvidence({ aspectId, strength, confidence, sources: [claim], supportingEvidence: [claim], contradictoryEvidence: [], verifierMode: "structured_only", warnings: [] });
}

function rankable(id: string, aspectId: AspectId, itemEvidence: AspectEvidence, communityScore = 70) {
  const candidate: AiCandidate = { source: "anilist", externalId: id, type: "anime", title: id };
  return { candidate, snapshot: snapshot(id, communityScore), aspectEvidence: new Map([[aspectId, itemEvidence]]) };
}

describe("D6-5.1 manual recommendation regressions", () => {
  it("legacy avoid eşiğini incidental olarak canonicalize eder", () => {
    const decoded = decodeRecommendationRequestV2(request([{ id: "avoid", kind: "aspect", aspectId: "love_triangle", role: "avoid", source: "explicit" }] as never));
    expect(decoded.ok && decoded.value.aspectConstraints[0]).toMatchObject({ rejectAtLevel: "incidental" });
  });

  it.each(["love_triangle", "fanservice", "sexual_content", "violence_gore", "disturbing_content"] as const)(
    "%s incidental+medium evidence'ını balanced primary'den çıkarır",
    (aspectId) => {
      const result = scoreEligibleCandidates({
        request: request([{ id: `avoid:${aspectId}`, kind: "aspect", aspectId, role: "avoid", source: "explicit", rejectAtLevel: "incidental" }]),
        candidates: [rankable(aspectId, aspectId, evidence(aspectId, 0.3, "medium"))], mediaItems: [], feedback: [],
      });
      expect(result.scored).toHaveLength(0);
      expect(result.rejected[0]?.reason).toBe("candidates_failed_avoid");
    },
  );

  it("low-confidence avoid evidence'ını risk yapar; avoid fit/reason/personal bonus üretmez", () => {
    const aspectId = "love_triangle" as const;
    const result = scoreEligibleCandidates({
      request: request([{ id: "avoid", kind: "aspect", aspectId, role: "avoid", source: "explicit", rejectAtLevel: "incidental" }]),
      candidates: [rankable("low", aspectId, evidence(aspectId, 0.3, "low"))],
      mediaItems: [{ id: "liked", title: "Liked", type: "anime", status: "completed", currentProgress: 1, totalProgress: 1, favorite: true, tags: ["Love Triangle"] } as MediaItem],
      feedback: [],
      feedbackV2: [{
        version: 2, id: "positive-triangle", action: "similar_requested",
        candidateIdentity: { kind: "provider", provider: "anilist", externalId: "liked", mediaType: "anime" },
        resultKind: "primary", aspectIds: [aspectId], constraintKeys: [], createdAt: "2026-08-05T00:00:00.000Z",
      }],
    });
    expect(result.scored[0]?.aspectDecisions[0]).toMatchObject({ outcome: "risk", passed: true });
    expect(result.scored[0]?.scoreBreakdown.personalFit).toBe(0);
    const strict = scoreEligibleCandidates({
      request: request([{ id: "avoid", kind: "aspect", aspectId, role: "avoid", source: "explicit", rejectAtLevel: "incidental" }], "strict"),
      candidates: [rankable("strict-low", aspectId, evidence(aspectId, 0.3, "low"))], mediaItems: [], feedback: [],
    });
    expect(strict.scored[0]?.aspectDecisions[0]?.outcome).toBe("risk");
    const recommendation = buildGroundedRecommendation(result.scored[0], request([{ id: "avoid", kind: "aspect", aspectId, role: "avoid", source: "explicit", rejectAtLevel: "incidental" }]), 0);
    expect(recommendation.fitLabel).toBe("Yeni keşif");
    expect(recommendation.reason).not.toContain("Aşk üçgeni");
    expect(recommendation.evidenceSummary).toEqual([]);
  });

  it("strict avoid medium evidence'ını reddeder; exploratory'de yalnız near-match'e alır", () => {
    const constraint = { id: "avoid", kind: "aspect", aspectId: "love_triangle", role: "avoid", source: "explicit", rejectAtLevel: "incidental" } as const;
    const candidate = rankable("triangle", "love_triangle", evidence("love_triangle", 0.3, "medium"));
    expect(scoreEligibleCandidates({ request: request([constraint], "strict"), candidates: [candidate], mediaItems: [], feedback: [] }).scored).toHaveLength(0);
    const exploratory = scoreEligibleCandidates({ request: request([constraint], "exploratory"), candidates: [candidate], mediaItems: [], feedback: [] });
    expect(exploratory.scored).toHaveLength(0);
    expect(exploratory.nearMatches).toHaveLength(1);
  });

  it("approved romance must structured discover'a Romance genre ve episode limitini taşır", () => {
    const structured = {
      ...request(
        [{ id: "romance", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }],
        "balanced",
      ),
      objectiveConstraints: [{ id: "short", kind: "objective", field: "length", unit: "episode", operator: "lte", value: 13, role: "must", source: "explicit" }],
    } as RecommendationRequestV2;
    const filters = extractAniListStructuredFilters(intent, "eski mesaj yalnız fantastik", structured);
    expect(filters.strict).toMatchObject({ genres: ["Romance"], episodesLesser: 14 });
    expect(filters.strict?.reason).toContain("structured:must:romance");
  });

  it("provider plan onaylanmış romance constraint'ini silemez veya yeniden clarification açamaz", () => {
    const structured = request([{ id: "romance", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }]);
    const guarded = applyStructuredRequestToRetrievalPlan({
      taskType: "general", interpretation: "fantasy", targetMediaTypes: ["tv"], sourceTypes: [],
      preferenceSignals: ["Fantasy"], avoidSignals: [], needsClarification: true,
      clarificationQuestion: "Anime mi?", searchPlans: [],
    }, structured);
    expect(guarded).toMatchObject({ targetMediaTypes: ["anime"], needsClarification: false });
    expect(guarded.preferenceSignals).toContain("Romance");
  });

  it("AniList Romance genre/tag claim'lerini merkezi registry aspect'ine map eder", () => {
    expect(mapProviderGenreClaims("anilist", ["Romance"], 0.9)[0]?.mappedAspectIds).toEqual(["romance"]);
    expect(mapAniListTagClaims([{ name: "Romance", rank: 90, category: "Theme" }])[0]?.mappedAspectIds).toEqual(["romance"]);
  });

  it("balanced güçlü ranked tag'i geçirir; incidental must'u yalnız exploratory near-match yapar; unknown'ı göstermez", () => {
    const constraint = { id: "romance", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" } as const;
    const strongTag = rankable("strong", "romance", evidence("romance", 0.58, "medium", "provider_tag_rank"));
    expect(scoreEligibleCandidates({ request: request([constraint]), candidates: [strongTag], mediaItems: [], feedback: [] }).scored).toHaveLength(1);
    expect(scoreEligibleCandidates({ request: request([constraint], "strict"), candidates: [strongTag], mediaItems: [], feedback: [] }).scored).toHaveLength(0);
    const incidental = rankable("incidental", "romance", evidence("romance", 0.3, "medium"));
    expect(scoreEligibleCandidates({ request: request([constraint], "exploratory"), candidates: [incidental], mediaItems: [], feedback: [] }).nearMatches).toHaveLength(1);
    const unknown = rankable("unknown", "romance", createUnknownAspectEvidence("romance"));
    expect(scoreEligibleCandidates({ request: request([constraint], "exploratory"), candidates: [unknown], mediaItems: [], feedback: [] }).nearMatches).toHaveLength(0);
  });

  it("romance prefer için coverage'sız yüksek community adayını eler; incidental evidence'i değerlendirir", () => {
    const prefer = { id: "romance", kind: "aspect", aspectId: "romance", role: "prefer", source: "explicit", minimumLevel: "incidental" } as const;
    const result = scoreEligibleCandidates({
      request: request([prefer]),
      candidates: [
        rankable("Kakegurui-like", "romance", createUnknownAspectEvidence("romance"), 99),
        rankable("Romance-present", "romance", evidence("romance", 0.3, "low"), 55),
      ], mediaItems: [], feedback: [],
    });
    expect(result.scored.map((item) => item.candidate.externalId)).toEqual(["Romance-present"]);
    expect(result.rejected).toContainEqual({ title: "Kakegurui-like", reason: "candidates_below_request_coverage" });
  });

  it("aspect içermeyen genel istekte minimum explicit coverage uygulamaz", () => {
    const result = scoreEligibleCandidates({ request: request([]), candidates: [rankable("general", "romance", createUnknownAspectEvidence("romance"), 90)], mediaItems: [], feedback: [] });
    expect(result.scored).toHaveLength(1);
    expect(result.scored[0]?.explicitRequestCoverage).toMatchObject({ applicable: false, meetsMinimum: true });
  });

  it("community score ölçeğini açık gösterir ve raw reason code'u Türkçeleştirir", () => {
    const prefer = { id: "romance", kind: "aspect", aspectId: "romance", role: "prefer", source: "explicit", minimumLevel: "incidental" } as const;
    const result = scoreEligibleCandidates({ request: request([prefer]), candidates: [rankable("score", "romance", evidence("romance", 0.3, "medium"), 70)], mediaItems: [], feedback: [] });
    const recommendation = buildGroundedRecommendation(result.scored[0], request([prefer]), 0);
    expect(recommendation.communitySignal).toBe("AniList topluluk puanı: 7.0/10");
    expect(userFacingRecommendationWarning("conditional_must_requires_evidence:romance")).toBe("Romantizm özelliğini zorunlu tutmak için yeterli içerik kanıtı gerekiyor.");
    expect(userFacingRejectionReason("explicit_request_evidence_missing")).not.toMatch(/explicit_request|_/);
  });

  it("aktif kartta badge başlık satırını sıkıştırmaz ve uzun başlık iki satırdan güvenle genişler", () => {
    const source = readFileSync("features/recommendations/ui/recommendation-card-header.tsx", "utf8");
    expect(source).toMatch(/line-clamp-2[^\n]*group-hover:line-clamp-none[^\n]*group-focus-within:line-clamp-none/);
    expect(source).toMatch(/break-normal \[overflow-wrap:break-word\]/);
    expect(source).not.toMatch(/items-start justify-between gap-2/);
    expect(readFileSync("components/ai-advisor.tsx", "utf8")).toMatch(/md:grid-cols-2 2xl:grid-cols-3/);
  });
});
