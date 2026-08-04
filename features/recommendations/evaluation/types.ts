import type { RecommendationRequestV2 } from "../domain/codec";
import type { AspectId } from "../domain/aspect-registry";
import type { AspectStrengthLevel, EvidenceConfidence } from "../domain/types";
import type { CandidateProviderEvidenceSnapshot, RecommendationCandidateIdentity } from "../providers/types";

export const RECOMMENDATION_EVALUATION_VERSION = 1 as const;

export type EvaluationLabelSource = "provider_metadata" | "human_annotation" | "synthetic_contract";
export type EvaluationResultKind = "primary" | "near_match" | "excluded";

export interface RecommendationEvaluationCandidateLabel {
  candidateIdentity: RecommendationCandidateIdentity;
  relevanceGrade: 0 | 1 | 2 | 3;
  hardConstraintPass: boolean;
  expectedAspectLevels: Readonly<Partial<Record<AspectId, AspectStrengthLevel>>>;
  expectedConfidenceBounds: Readonly<Partial<Record<AspectId, { min: EvidenceConfidence; max: EvidenceConfidence }>>>;
  expectedAvoidViolation: boolean;
  supportedExplanationClaims: readonly string[];
  forbiddenExplanationClaims: readonly string[];
  expectedResultKind: EvaluationResultKind;
  labelSource: EvaluationLabelSource;
  annotatorNotes?: readonly string[];
}

export interface RecommendationEvaluationProfileFixture {
  synthetic: true;
  favoriteAspectIds: readonly AspectId[];
  avoidedAspectIds: readonly AspectId[];
  exactSuppressedCandidateKeys: readonly string[];
}

export interface RecommendationEvaluationCase {
  version: typeof RECOMMENDATION_EVALUATION_VERSION;
  id: string;
  locale: string;
  queryText: string;
  structuredRequest: RecommendationRequestV2;
  strictness: RecommendationRequestV2["strictness"];
  libraryProfileFixture: RecommendationEvaluationProfileFixture;
  candidates: readonly CandidateProviderEvidenceSnapshot[];
  expectedConstraints: readonly string[];
  candidateLabels: readonly RecommendationEvaluationCandidateLabel[];
  expectedPrimaryIds: readonly string[];
  expectedNearMatchIds: readonly string[];
  notes: readonly string[];
}
