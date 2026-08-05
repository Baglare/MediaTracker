import type { AspectConstraint } from "../domain/constraints";
import type { AspectEvidence, EvidenceClaim } from "../domain/evidence";
import type { ConstraintDecision } from "../domain/policies";
import type { AspectStrengthLevel } from "../domain/types";
import type { RecommendationCandidateIdentity } from "../providers/types";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import { normalizeRawEvidenceClaims } from "./claim-normalizer";

const TRACE_CLAIM_LIMIT = 12;
const TRACE_WARNING_LIMIT = 12;
const LEVEL_RANK: Readonly<Record<AspectStrengthLevel, number>> = {
  unknown: -1,
  absent: 0,
  incidental: 1,
  significant: 2,
  primary: 3,
};

export interface RecommendationEvidenceTrace {
  candidateIdentity: RecommendationCandidateIdentity;
  titleSnapshot: string;
  constraint: Pick<AspectConstraint, "id" | "aspectId" | "role" | "source" | "minimumLevel" | "rejectAtLevel" | "minimumConfidence">;
  rawClaims: readonly EvidenceClaim[];
  mappedClaims: readonly {
    claimId: string;
    sourceKind: EvidenceClaim["sourceKind"];
    provider?: EvidenceClaim["provider"];
    field?: string;
    contribution: number;
  }[];
  aggregationResult: Pick<AspectEvidence, "aspectId" | "strength" | "level" | "confidence" | "verifierMode">;
  eligibilityDecision: ConstraintDecision;
  failedRule: "must_evidence_unknown" | "must_minimum_level" | "must_confidence" | "avoid_triggered" | null;
  warnings: readonly string[];
}

function failedRule(
  constraint: AspectConstraint,
  evidence: AspectEvidence,
  decision: ConstraintDecision,
): RecommendationEvidenceTrace["failedRule"] {
  if (decision.passed) return null;
  if (decision.outcome === "triggered_avoid") return "avoid_triggered";
  if (evidence.level === "unknown") return "must_evidence_unknown";
  if (constraint.role === "must"
    && constraint.minimumLevel
    && LEVEL_RANK[evidence.level] < LEVEL_RANK[constraint.minimumLevel]) return "must_minimum_level";
  return constraint.role === "must" ? "must_confidence" : null;
}

/** Bounded developer/test trace. It is intentionally not part of AiRecommendResponse. */
export function buildRecommendationEvidenceTrace(input: {
  titleSnapshot: string;
  snapshot: CandidateProviderEvidenceSnapshot;
  constraint: AspectConstraint;
  evidence: AspectEvidence;
  decision: ConstraintDecision;
}): RecommendationEvidenceTrace {
  const normalized = normalizeRawEvidenceClaims(input.snapshot);
  const mapped = normalized.contributions.filter((item) => item.aspectId === input.constraint.aspectId);
  const rawClaims = input.snapshot.rawEvidenceClaims
    .filter((claim) => claim.mappedAspectIds.includes(input.constraint.aspectId))
    .slice(0, TRACE_CLAIM_LIMIT)
    .map((claim): EvidenceClaim => ({
      id: claim.id,
      sourceKind: claim.sourceKind,
      scope: claim.scope,
      ...(claim.provider ? { provider: claim.provider } : {}),
      ...(claim.field ? { field: claim.field } : {}),
      ...(claim.value !== undefined ? { value: claim.value } : {}),
      ...(claim.normalizedValue !== undefined ? { normalizedValue: claim.normalizedValue } : {}),
      ...(claim.reliability !== undefined ? { reliability: claim.reliability } : {}),
      ...(claim.explanation ? { explanation: claim.explanation } : {}),
      ...(claim.observedAt ? { observedAt: claim.observedAt } : {}),
    }));
  return {
    candidateIdentity: input.snapshot.candidateIdentity,
    titleSnapshot: input.titleSnapshot.slice(0, 300),
    constraint: {
      id: input.constraint.id,
      aspectId: input.constraint.aspectId,
      role: input.constraint.role,
      source: input.constraint.source,
      ...(input.constraint.minimumLevel ? { minimumLevel: input.constraint.minimumLevel } : {}),
      ...(input.constraint.rejectAtLevel ? { rejectAtLevel: input.constraint.rejectAtLevel } : {}),
      ...(input.constraint.minimumConfidence ? { minimumConfidence: input.constraint.minimumConfidence } : {}),
    },
    rawClaims,
    mappedClaims: mapped.slice(0, TRACE_CLAIM_LIMIT).map((item) => ({
      claimId: item.claim.id,
      sourceKind: item.claim.sourceKind,
      ...(item.claim.provider ? { provider: item.claim.provider } : {}),
      ...(item.claim.field ? { field: item.claim.field } : {}),
      contribution: item.contribution,
    })),
    aggregationResult: {
      aspectId: input.evidence.aspectId,
      strength: input.evidence.strength,
      level: input.evidence.level,
      confidence: input.evidence.confidence,
      verifierMode: input.evidence.verifierMode,
    },
    eligibilityDecision: input.decision,
    failedRule: failedRule(input.constraint, input.evidence, input.decision),
    warnings: [...new Set([...normalized.warnings, ...input.evidence.warnings])].slice(0, TRACE_WARNING_LIMIT),
  };
}
