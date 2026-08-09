import type { AspectConstraint, ObjectiveConstraint } from "../../domain/constraints";
import type { AspectId, RecommendationMediaType, RecommendationStrictness } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { ResearchCandidateInput, ResearchClaimLevel } from "../domain/types";

export const GROUNDED_RESEARCH_SHADOW_POLICY_VERSION = "d7-r4a.shadow.1" as const;
export const GROUNDED_RESEARCH_SHADOW_MAX_CANDIDATES = 2;
export const GROUNDED_RESEARCH_SHADOW_MAX_JOBS = 2;
export const GROUNDED_RESEARCH_SHADOW_MAX_ASPECTS_PER_CANDIDATE = 1;
export const GROUNDED_RESEARCH_SHADOW_MAX_CONCURRENCY = 2;
export const GROUNDED_RESEARCH_SHADOW_TIMEOUT_MS = 16_000;

export interface ResearchShadowStructuredRequest {
  version: 1;
  targetMediaTypes: readonly RecommendationMediaType[];
  aspectConstraints: readonly AspectConstraint[];
  objectiveConstraints: readonly ObjectiveConstraint[];
  strictness: RecommendationStrictness;
}

export interface GroundedResearchShadowCandidateContext {
  researchCandidate: ResearchCandidateInput;
  titleSnapshot: string;
  releaseYear?: number;
}

export interface GroundedResearchShadowContext {
  version: 1;
  structuredRequest: ResearchShadowStructuredRequest;
  candidates: readonly GroundedResearchShadowCandidateContext[];
}

export interface GroundedResearchShadowInput extends GroundedResearchShadowContext {
  requestId: string;
  signal?: AbortSignal;
}

export type ResearchShadowHypotheticalEffect =
  | "would_satisfy_must"
  | "would_fail_must"
  | "would_reject_avoid"
  | "would_clear_avoid"
  | "would_remain_unknown"
  | "no_effect";

export type ResearchShadowDurationBucket = "lt_1s" | "1_4s" | "4_8s" | "8_16s" | "gte_16s";

export interface ResearchShadowCandidateResult {
  candidateIdentity: RecommendationCandidateIdentity;
  aspectId: AspectId;
  structuredStatusBeforeResearch: "partial" | "unknown";
  researchStatus: string;
  researchDecisionStatus: "supported" | "contradicted" | "unknown" | "unavailable";
  researchLevel: ResearchClaimLevel;
  hypotheticalEffect: ResearchShadowHypotheticalEffect;
  durationBucket: ResearchShadowDurationBucket;
  providerAdapterStatus: string;
  warnings: readonly string[];
}

export interface GroundedResearchShadowTelemetry {
  plannerRan: boolean;
  plannedCandidateCount: number;
  plannedJobCount: number;
  attemptedJobCount: number;
  completedJobCount: number;
  skippedJobCount: number;
  coalescedJobCount: number;
  discoveryOperationCount: number;
  timeoutCount: number;
  sampleCount: number;
  stageDurationsMs: {
    planning: number;
    directSource: number;
    discovery: number;
    acquisition: number;
    extraction: number;
    total: number;
  };
  durationBucket: ResearchShadowDurationBucket;
}

export type GroundedResearchShadowStatus = "disabled" | "complete" | "partial" | "no_jobs" | "invalid_input" | "budget_exhausted" | "aborted";

export interface GroundedResearchShadowResult {
  status: GroundedResearchShadowStatus;
  results: readonly ResearchShadowCandidateResult[];
  telemetry: GroundedResearchShadowTelemetry;
  warnings: readonly string[];
  policyVersion: typeof GROUNDED_RESEARCH_SHADOW_POLICY_VERSION;
}
