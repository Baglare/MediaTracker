import type { AspectEvidence } from "./evidence";
import type { AspectConstraint, LengthConstraint } from "./constraints";
import { aspectConstraintKey } from "./constraints";
import type { VerifiedRecommendationIdentity } from "./providers";
import type {
  AspectStrengthLevel,
  EvidenceConfidence,
  RecommendationDecodeResult,
  RecommendationMediaType,
  RecommendationStrictness,
} from "./types";

export type ConstraintDecisionOutcome =
  | "passed"
  | "failed_must"
  | "triggered_avoid"
  | "unknown"
  | "preferred"
  | "not_preferred"
  | "risk";

export interface ConstraintDecision {
  constraintId: string;
  constraintKey: string;
  role: AspectConstraint["role"];
  passed: boolean;
  outcome: ConstraintDecisionOutcome;
  evidenceConfidence: EvidenceConfidence;
  reasons: readonly string[];
  warnings: readonly string[];
}

export interface CandidateEligibility {
  eligibleForPrimary: boolean;
  eligibleForNearMatch: boolean;
  failedMustConstraints: readonly ConstraintDecision[];
  triggeredAvoidConstraints: readonly ConstraintDecision[];
  unknownConstraints: readonly ConstraintDecision[];
}

export interface NearMatchExplanation {
  summary: string;
  disclosedViolations: readonly string[];
  warnings: readonly string[];
}

export interface NearMatchCandidate {
  identity: VerifiedRecommendationIdentity;
  violatedConstraints: readonly ConstraintDecision[];
  satisfiedConstraints: readonly ConstraintDecision[];
  explanation: NearMatchExplanation;
}

const LEVEL_RANK: Readonly<Record<AspectStrengthLevel, number>> = {
  unknown: -1,
  absent: 0,
  incidental: 1,
  significant: 2,
  primary: 3,
};

const CONFIDENCE_RANK: Readonly<Record<EvidenceConfidence, number>> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function hasMultipleIndependentSupportingClaims(evidence: AspectEvidence): boolean {
  const keys = new Set(evidence.supportingEvidence.map((claim) => (
    `${claim.sourceKind}:${claim.provider ?? "none"}:${claim.field ?? "none"}`
  )));
  return keys.size >= 2;
}

function confidenceMeetsMust(
  constraint: AspectConstraint,
  evidence: AspectEvidence,
  strictness: RecommendationStrictness,
): boolean {
  if (constraint.minimumConfidence) {
    return CONFIDENCE_RANK[evidence.confidence] >= CONFIDENCE_RANK[constraint.minimumConfidence];
  }
  if (evidence.confidence === "high") return true;
  if (strictness !== "strict"
    && evidence.confidence === "medium"
    && hasMultipleIndependentSupportingClaims(evidence)) return true;
  return false;
}

function decision(
  constraint: AspectConstraint,
  evidence: AspectEvidence | null,
  passed: boolean,
  outcome: ConstraintDecisionOutcome,
  reasons: readonly string[],
  warnings: readonly string[] = [],
): ConstraintDecision {
  return {
    constraintId: constraint.id,
    constraintKey: aspectConstraintKey(constraint),
    role: constraint.role,
    passed,
    outcome,
    evidenceConfidence: evidence?.confidence ?? "unknown",
    reasons,
    warnings,
  };
}

export function evaluateConstraintEligibility(args: {
  constraint: AspectConstraint;
  evidence: AspectEvidence | null;
  strictness: RecommendationStrictness;
}): ConstraintDecision {
  const { constraint, evidence, strictness } = args;
  if (!evidence || evidence.aspectId !== constraint.aspectId || evidence.level === "unknown") {
    if (constraint.role === "prefer") {
      return decision(constraint, evidence, true, "not_preferred", ["Tercih için yeterli aspect kanıtı yok."], ["Aspect sonucu unknown."]);
    }
    if (constraint.role === "avoid") {
      return decision(constraint, evidence, true, "unknown", ["Avoid aspect için yeterli kanıt yok."], ["Unknown, absent değildir."]);
    }
    return decision(constraint, evidence, false, "unknown", ["Must aspect kanıtı unknown; primary sonuç uygun değil."]);
  }

  if (constraint.role === "must") {
    const levelPassed = LEVEL_RANK[evidence.level] >= LEVEL_RANK[constraint.minimumLevel ?? "primary"];
    const confidencePassed = confidenceMeetsMust(constraint, evidence, strictness);
    if (levelPassed && confidencePassed) {
      return decision(constraint, evidence, true, "passed", ["Must aspect seviyesi ve confidence şartı karşılandı."]);
    }
    const reasons = [
      ...(levelPassed ? [] : [`Aspect seviyesi ${constraint.minimumLevel} eşiğinin altında.`]),
      ...(confidencePassed ? [] : ["Must evidence confidence şartı karşılanmadı."]),
    ];
    return decision(constraint, evidence, false, "failed_must", reasons);
  }

  if (constraint.role === "avoid") {
    const thresholdReached = LEVEL_RANK[evidence.level] >= LEVEL_RANK[constraint.rejectAtLevel ?? "significant"];
    if (!thresholdReached) {
      return decision(constraint, evidence, true, "passed", ["Avoid eşiği tetiklenmedi."]);
    }
    if (CONFIDENCE_RANK[evidence.confidence] >= CONFIDENCE_RANK.medium) {
      return decision(constraint, evidence, false, "triggered_avoid", ["Avoid eşiği güvenilir kanıtla tetiklendi."]);
    }
    return decision(
      constraint,
      evidence,
      true,
      "risk",
      ["Avoid eşiği düşük güvenli kanıtla görüldü."],
      ["Primary sonuçta risk etiketi gösterilmelidir."],
    );
  }

  const preferred = constraint.minimumLevel === undefined
    || LEVEL_RANK[evidence.level] >= LEVEL_RANK[constraint.minimumLevel];
  return decision(
    constraint,
    evidence,
    true,
    preferred ? "preferred" : "not_preferred",
    [preferred ? "Prefer aspect karşılandı." : "Prefer aspect karşılanmadı; eligibility değişmedi."],
  );
}

export function canEnterPrimaryResults(decisions: readonly ConstraintDecision[]): boolean {
  return !decisions.some((item) => item.outcome === "failed_must"
    || (item.role === "must" && item.outcome === "unknown")
    || item.outcome === "triggered_avoid");
}

export function canEnterNearMatches(
  strictness: RecommendationStrictness,
  decisions: readonly ConstraintDecision[],
): boolean {
  if (strictness !== "exploratory" || canEnterPrimaryResults(decisions)) return false;
  const hasMustFailure = decisions.some((item) => item.role === "must" && !item.passed);
  const hasReliableAvoidViolation = decisions.some((item) => item.outcome === "triggered_avoid");
  return hasMustFailure && !hasReliableAvoidViolation;
}

export function buildCandidateEligibility(
  strictness: RecommendationStrictness,
  decisions: readonly ConstraintDecision[],
): CandidateEligibility {
  return {
    eligibleForPrimary: canEnterPrimaryResults(decisions),
    eligibleForNearMatch: canEnterNearMatches(strictness, decisions),
    failedMustConstraints: decisions.filter((item) => item.role === "must" && !item.passed),
    triggeredAvoidConstraints: decisions.filter((item) => item.outcome === "triggered_avoid"),
    unknownConstraints: decisions.filter((item) => item.outcome === "unknown"),
  };
}

export function resolveConstraintFailureReason(decision: ConstraintDecision): string | null {
  if (decision.passed) return null;
  if (decision.outcome === "triggered_avoid") return "avoid_constraint_triggered";
  if (decision.outcome === "unknown") return "must_evidence_unknown";
  if (decision.outcome === "failed_must") return "must_constraint_failed";
  return "constraint_failed";
}

const LENGTH_MEDIA_TYPES: Readonly<Record<LengthConstraint["unit"], readonly RecommendationMediaType[]>> = {
  episode: ["anime", "tv"],
  chapter: ["manga", "manhwa", "manhua"],
  page: ["book"],
  minute: ["anime", "tv", "movie"],
};

export function validateLengthMediaTypeCompatibility(
  constraint: LengthConstraint,
  targetMediaTypes: readonly RecommendationMediaType[],
): RecommendationDecodeResult<LengthConstraint> {
  if (targetMediaTypes.length === 0) return { ok: true, value: constraint };
  const incompatible = targetMediaTypes.filter((mediaType) => !LENGTH_MEDIA_TYPES[constraint.unit].includes(mediaType));
  if (incompatible.length === 0) return { ok: true, value: constraint };
  return {
    ok: false,
    issues: [{
      code: "length_media_type_incompatible",
      path: "objectiveConstraints",
      message: `${constraint.unit} birimi şu hedeflerle uyumsuz: ${incompatible.join(", ")}.`,
    }],
  };
}
