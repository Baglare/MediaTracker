import type { AiRecommendResponse } from "@/lib/ai/types";
import type { AspectId } from "../../domain/aspect-registry";
import type { DeterministicRecommendationV2Execution } from "../../orchestration/deterministic-engine";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { AspectResearchDecisionStatus, ResearchClaimLevel } from "../domain/types";
import type { ResearchShadowCacheStatus } from "../shadow/types";

export type ResearchOutcomeChange = "rescued_candidate" | "rejected_candidate" | "cleared_avoid" | "no_change";

export interface ActiveResearchProvenanceSidecar {
  candidateIdentity: RecommendationCandidateIdentity;
  aspectId: AspectId;
  decisionStatus: AspectResearchDecisionStatus;
  decisionLevel: ResearchClaimLevel;
  citationIds: readonly string[];
  sourceCount: number;
  cacheStatus: ResearchShadowCacheStatus;
  whetherResearchChangedOutcome: ResearchOutcomeChange;
}

export interface ActiveGroundedRecommendationResult {
  execution: DeterministicRecommendationV2Execution;
  baselineResponse: AiRecommendResponse;
  provenance: readonly ActiveResearchProvenanceSidecar[];
  status: "active_applied" | "baseline" | "failed_soft";
}
