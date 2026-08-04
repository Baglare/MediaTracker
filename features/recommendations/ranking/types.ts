import type { AiCandidate } from "@/lib/ai/types";
import type { AspectId, EvidenceConfidence } from "../domain/types";
import type { AspectEvidence } from "../domain/evidence";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";

export interface ObjectiveConstraintDecision {
  constraintId: string;
  role: "must" | "prefer" | "avoid";
  passed: boolean;
  outcome: "passed" | "failed_must" | "triggered_avoid" | "unknown" | "preferred" | "not_preferred" | "risk";
  evidenceConfidence: EvidenceConfidence;
  reasons: readonly string[];
  warnings: readonly string[];
}

export interface RecommendationScoreBreakdown {
  requestFit: number;
  personalFit: number;
  evidenceConfidence: number;
  qualitySignal: number;
  novelty: number;
  diversityContribution: number;
}

export interface ScoredRecommendationCandidate {
  candidate: AiCandidate;
  snapshot: CandidateProviderEvidenceSnapshot;
  aspectEvidence: ReadonlyMap<AspectId, AspectEvidence>;
  aspectDecisions: readonly import("../domain/policies").ConstraintDecision[];
  objectiveDecisions: readonly ObjectiveConstraintDecision[];
  scoreBreakdown: RecommendationScoreBreakdown;
  deterministicSortKey: readonly [number, number, number, number, number, string];
  warnings: readonly string[];
}
