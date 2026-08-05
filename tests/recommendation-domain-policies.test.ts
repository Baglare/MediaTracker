import { describe, expect, it } from "vitest";
import {
  buildCandidateEligibility,
  canEnterNearMatches,
  canEnterPrimaryResults,
  createAspectEvidence,
  createUnknownAspectEvidence,
  evaluateConstraintEligibility,
  resolveConstraintFailureReason,
  type AspectConstraint,
  type AspectEvidence,
  type EvidenceClaim,
} from "@/features/recommendations/domain";

const must: AspectConstraint = {
  kind: "aspect",
  id: "must-romance",
  aspectId: "romance",
  role: "must",
  source: "explicit",
  minimumLevel: "significant",
};

const avoid: AspectConstraint = {
  kind: "aspect",
  id: "avoid-triangle",
  aspectId: "love_triangle",
  role: "avoid",
  source: "explicit",
  rejectAtLevel: "significant",
};

function claim(id: string, field: string, provider: "anilist" | "tmdb" = "anilist"): EvidenceClaim {
  return {
    id,
    sourceKind: provider === "anilist" ? "provider_tag_rank" : "provider_keyword",
    scope: "candidate_metadata",
    provider,
    field,
    reliability: 0.8,
  };
}

function aspectEvidence(overrides: Partial<AspectEvidence> = {}): AspectEvidence {
  const supporting = [claim("tag", "tags.Romance.rank")];
  return createAspectEvidence({
    aspectId: "romance",
    strength: 0.7,
    confidence: "high",
    sources: supporting,
    supportingEvidence: supporting,
    contradictoryEvidence: [],
    verifierMode: "structured_only",
    warnings: [],
    ...overrides,
  });
}

describe("Recommendation V2 strictness policy", () => {
  it("strict explicit must'i high-confidence kanıtla geçirir", () => {
    const decision = evaluateConstraintEligibility({ constraint: must, evidence: aspectEvidence(), strictness: "strict" });
    expect(decision).toMatchObject({ passed: true, outcome: "passed" });
  });

  it("strict medium-confidence must'i varsayılan olarak reddeder", () => {
    const decision = evaluateConstraintEligibility({
      constraint: must,
      evidence: aspectEvidence({ confidence: "medium" }),
      strictness: "strict",
    });
    expect(decision).toMatchObject({ passed: false, outcome: "failed_must" });
  });

  it("balanced iki bağımsız medium evidence ile explicit must'i kabul eder", () => {
    const supporting = [
      claim("tag", "tags.Romance.rank", "anilist"),
      claim("keyword", "keywords.romance", "tmdb"),
    ];
    const decision = evaluateConstraintEligibility({
      constraint: must,
      evidence: aspectEvidence({ confidence: "medium", sources: supporting, supportingEvidence: supporting }),
      strictness: "balanced",
    });
    expect(decision).toMatchObject({ passed: true, outcome: "passed" });
  });

  it("unknown must'i bütün modlarda primary sonuçtan eler", () => {
    for (const strictness of ["strict", "balanced", "exploratory"] as const) {
      const decision = evaluateConstraintEligibility({
        constraint: must,
        evidence: createUnknownAspectEvidence("romance"),
        strictness,
      });
      expect(decision).toMatchObject({ passed: false, outcome: "unknown" });
      expect(canEnterPrimaryResults([decision])).toBe(false);
    }
  });

  it("exploratory must ihlalini primary'ye sokmaz, near-match'e ayırabilir", () => {
    const decision = evaluateConstraintEligibility({
      constraint: must,
      evidence: aspectEvidence({ strength: 0.3 }),
      strictness: "exploratory",
    });
    expect(canEnterPrimaryResults([decision])).toBe(false);
    expect(canEnterNearMatches("exploratory", [decision])).toBe(true);
    expect(canEnterNearMatches("balanced", [decision])).toBe(false);
    expect(resolveConstraintFailureReason(decision)).toBe("must_constraint_failed");
  });

  it("reliable avoid eşiğini eler, low-confidence avoid'ı risk olarak taşır", () => {
    const triangle = aspectEvidence({ aspectId: "love_triangle", strength: 0.6, confidence: "medium" });
    const triggered = evaluateConstraintEligibility({ constraint: avoid, evidence: triangle, strictness: "balanced" });
    const risk = evaluateConstraintEligibility({
      constraint: avoid,
      evidence: aspectEvidence({ aspectId: "love_triangle", strength: 0.6, confidence: "low" }),
      strictness: "balanced",
    });
    expect(triggered).toMatchObject({ passed: false, outcome: "triggered_avoid" });
    expect(risk).toMatchObject({ passed: true, outcome: "risk" });
  });

  it("reliable avoid ihlalini exploratory modda yalnız near-match'e yönlendirir", () => {
    const failedMust = evaluateConstraintEligibility({
      constraint: must,
      evidence: aspectEvidence({ strength: 0.3 }),
      strictness: "exploratory",
    });
    const triggeredAvoid = evaluateConstraintEligibility({
      constraint: avoid,
      evidence: aspectEvidence({ aspectId: "love_triangle", strength: 0.6, confidence: "high" }),
      strictness: "exploratory",
    });
    const eligibility = buildCandidateEligibility("exploratory", [failedMust, triggeredAvoid]);
    expect(eligibility).toMatchObject({ eligibleForPrimary: false, eligibleForNearMatch: true });
    expect(eligibility.triggeredAvoidConstraints).toContainEqual(triggeredAvoid);
  });

  it("prefer eligibility'yi değiştirmez ve policy popularity/personal-fit girdisi almaz", () => {
    const prefer: AspectConstraint = {
      kind: "aspect", id: "prefer-fantasy", aspectId: "fantasy", role: "prefer", source: "profile", minimumLevel: "significant",
    };
    const decision = evaluateConstraintEligibility({
      constraint: prefer,
      evidence: aspectEvidence({ aspectId: "fantasy", strength: 0.1 }),
      strictness: "strict",
    });
    expect(decision).toMatchObject({ passed: true, outcome: "not_preferred" });
    expect(canEnterPrimaryResults([decision])).toBe(true);
  });
});
