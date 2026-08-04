import { describe, expect, it } from "vitest";
import { aspectLevelAccuracy, decodeRecommendationEvaluationCase, duplicateRate, fallbackRate, hallucinatedOrUnverifiedTitleRate, hardConstraintViolationRate, latencySummary, meanOrdinalError, ndcgAtK, precisionAtK, precisionRecallF1, providerCoverage, recallAtK, resultCoverage, unsupportedExplanationRate, verifierUsageRate } from "@/features/recommendations/evaluation";
import { RECOMMENDATION_V2_CONTRACT_SEEDS } from "./fixtures/recommendations-v2/contract-seeds";

describe("D7 evaluation fixture contract", () => {
  it("contains exactly the 15 required synthetic contract scenarios", () => {
    expect(RECOMMENDATION_V2_CONTRACT_SEEDS).toHaveLength(15);
    expect(new Set(RECOMMENDATION_V2_CONTRACT_SEEDS.map((item) => item.id)).size).toBe(15);
    for (const fixture of RECOMMENDATION_V2_CONTRACT_SEEDS) {
      const decoded = decodeRecommendationEvaluationCase(fixture);
      expect(decoded.ok, decoded.ok ? undefined : JSON.stringify(decoded.issues)).toBe(true);
      expect(fixture.libraryProfileFixture.synthetic).toBe(true);
      expect(JSON.stringify(fixture)).not.toMatch(/personalNotes|ownerId|userId|rawPrompt/i);
    }
  });

  it("keeps unknown and absent as separate gold labels", () => {
    const unknown = RECOMMENDATION_V2_CONTRACT_SEEDS.find((item) => item.id === "openlibrary_subject_only_low_confidence")!;
    const incidental = RECOMMENDATION_V2_CONTRACT_SEEDS.find((item) => item.id === "romance_primary_vs_incidental")!;
    expect(unknown.candidateLabels[0].expectedAspectLevels.romance).toBe("unknown");
    expect(incidental.candidateLabels[1].expectedAspectLevels.romance).toBe("incidental");
  });
});

describe("D7 metric math utilities", () => {
  it("computes extraction, ranking, violation and ordinal metrics", () => {
    expect(precisionRecallF1(8, 2, 2)).toEqual({ precision: 0.8, recall: 0.8, f1: 0.8000000000000002 });
    expect(precisionAtK([3, 0, 2], 2)).toBe(0.5);
    expect(recallAtK([3, 0, 2], 2, 3)).toBe(1);
    expect(ndcgAtK([3, 1, 2], 3)).toBeGreaterThan(0.9);
    expect(meanOrdinalError([3, 2, 0], [2, 2, 1])).toBeCloseTo(2 / 3);
    expect(aspectLevelAccuracy(["primary", "unknown"], ["primary", "absent"])).toBe(0.5);
    expect(hardConstraintViolationRate([{ returned: true, hardConstraintPass: true }, { returned: true, hardConstraintPass: false }])).toBe(0.5);
    expect(unsupportedExplanationRate([{ supported: true }, { supported: false }])).toBe(0.5);
    expect(hallucinatedOrUnverifiedTitleRate([{ verifiedIdentity: true }, { verifiedIdentity: false }])).toBe(0.5);
    expect(providerCoverage([{ provider: "anilist", verified: true }], ["anilist", "tvmaze"])).toBe(0.5);
    expect(fallbackRate([{ fallbackUsed: true }, { fallbackUsed: false }])).toBe(0.5);
    expect(verifierUsageRate([{ verifierUsed: false }, { verifierUsed: true }])).toBe(0.5);
  });

  it("does not blindly penalize correct expected-empty strict cases as coverage failure", () => {
    expect(resultCoverage([{ expectedEmpty: true, resultCount: 0 }, { expectedEmpty: false, resultCount: 1 }])).toBe(1);
    expect(duplicateRate(["a", "a", "b"])).toBeCloseTo(1 / 3);
    expect(latencySummary([10, 20, 30, Number.NaN])).toEqual({ count: 3, mean: 20, p50: 20, p95: 30, max: 30 });
  });
});
