import "server-only";

import { runDeterministicRecommendationV2WithShadowSeed, type DeterministicRecommendationV2Input } from "../../orchestration/deterministic-engine";
import { runGroundedResearchActivePipeline, type ActiveGroundedResearchHandoff } from "../shadow/orchestrator";
import type { GroundedResearchShadowContext } from "../shadow/types";
import { buildActiveResearchMerge } from "./merge";
import type { ActiveGroundedRecommendationResult, ActiveResearchProvenanceSidecar, ResearchOutcomeChange } from "./types";

export interface ActiveGroundedRecommendationDependencies {
  runDeterministic?: typeof runDeterministicRecommendationV2WithShadowSeed;
  runResearch?: typeof runGroundedResearchActivePipeline;
}

function cloneInput(input: DeterministicRecommendationV2Input): DeterministicRecommendationV2Input {
  return {
    ...input,
    intent: structuredClone(input.intent), retrievalPlan: structuredClone(input.retrievalPlan), settings: structuredClone(input.settings),
    candidates: structuredClone(input.candidates), mediaItems: structuredClone(input.mediaItems), feedback: structuredClone(input.feedback),
    feedbackV2: input.feedbackV2 ? structuredClone(input.feedbackV2) : undefined, dismissed: structuredClone(input.dismissed),
    structuredRequest: input.structuredRequest ? structuredClone(input.structuredRequest) : undefined,
  };
}

function eligibleContext(context: GroundedResearchShadowContext): GroundedResearchShadowContext {
  const candidates = context.candidates
    .map((candidate) => ({ ...candidate, researchCandidate: { ...candidate.researchCandidate, unresolvedConstraints: candidate.researchCandidate.unresolvedConstraints
      .filter((constraint) => constraint.source === "explicit" && (constraint.role === "must" || constraint.role === "avoid") && constraint.currentStructuredDecision === "unknown")
      .sort((a, b) => (a.role === b.role ? a.aspectId.localeCompare(b.aspectId, "en") : a.role === "must" ? -1 : 1))
      .slice(0, 1) } }))
    .filter((candidate) => candidate.researchCandidate.unresolvedConstraints.length > 0)
    .sort((a, b) => a.researchCandidate.preResearchRank - b.researchCandidate.preResearchRank || a.researchCandidate.identity.canonicalKey.localeCompare(b.researchCandidate.identity.canonicalKey, "en"))
    .slice(0, 3);
  return { ...context, candidates };
}

function responseHasCandidate(response: ActiveGroundedRecommendationResult["baselineResponse"], identity: ActiveGroundedResearchHandoff["handoff"]["candidateIdentity"]): boolean {
  return response.recommendations.some((item) => item.externalSource === identity.primaryProvider && item.externalId === identity.primaryExternalId);
}

function outcome(input: { role: "must" | "avoid"; before: boolean; after: boolean; effect: string }): ResearchOutcomeChange {
  if (!input.before && input.after) return input.role === "avoid" && input.effect === "would_clear_avoid" ? "cleared_avoid" : "rescued_candidate";
  if (input.before && !input.after) return "rejected_candidate";
  return "no_change";
}

export async function runActiveGroundedRecommendation(input: {
  engineInput: DeterministicRecommendationV2Input;
  requestId: string;
  signal?: AbortSignal;
}, dependencies: ActiveGroundedRecommendationDependencies = {}): Promise<ActiveGroundedRecommendationResult> {
  const runDeterministic = dependencies.runDeterministic ?? runDeterministicRecommendationV2WithShadowSeed;
  const runResearch = dependencies.runResearch ?? runGroundedResearchActivePipeline;
  const baseline = await runDeterministic(cloneInput(input.engineInput));
  const context = baseline.researchShadowContext ? eligibleContext(baseline.researchShadowContext) : undefined;
  if (!context || context.candidates.length === 0 || input.signal?.aborted) return { execution: baseline, baselineResponse: baseline.response, provenance: [], status: "baseline" };
  try {
    const research = await runResearch({ ...context, requestId: input.requestId, ...(input.signal ? { signal: input.signal } : {}) });
    if (research.handoffs.length === 0) return { execution: baseline, baselineResponse: baseline.response, provenance: [], status: "baseline" };
    const merge = buildActiveResearchMerge({ handoffs: research.handoffs.map((item) => item.handoff), constraints: context.structuredRequest.aspectConstraints });
    if (merge.constraintDecisionsByCandidateKey.size === 0) return { execution: baseline, baselineResponse: baseline.response, provenance: [], status: "baseline" };
    const finalExecution = await runDeterministic({ ...cloneInput(input.engineInput), researchAspectEvidenceByCandidateKey: merge.aspectEvidenceByCandidateKey, researchConstraintDecisionOverridesByCandidateKey: merge.constraintDecisionsByCandidateKey });
    const provenance: ActiveResearchProvenanceSidecar[] = research.handoffs.flatMap((item) => item.handoff.aspectDecisions.flatMap((decision) => {
      const constraint = context.structuredRequest.aspectConstraints.find((candidate) => candidate.aspectId === decision.aspectId && (candidate.role === "must" || candidate.role === "avoid"));
      if (!constraint || !merge.constraintDecisionsByCandidateKey.get(item.handoff.candidateIdentity.canonicalKey)?.has(constraint.id)) return [];
      const before = responseHasCandidate(baseline.response, item.handoff.candidateIdentity);
      const after = responseHasCandidate(finalExecution.response, item.handoff.candidateIdentity);
      const effect = research.result.results.find((candidate) => candidate.candidateIdentity.canonicalKey === item.handoff.candidateIdentity.canonicalKey && candidate.aspectId === decision.aspectId)?.hypotheticalEffect ?? "no_effect";
      const role: "must" | "avoid" = constraint.role === "must" ? "must" : "avoid";
      return [{ candidateIdentity: item.handoff.candidateIdentity, aspectId: decision.aspectId, decisionStatus: decision.status, decisionLevel: decision.level, citationIds: item.handoff.citations.map((citation) => citation.citationId).slice(0, 16), sourceCount: decision.sourceCount, cacheStatus: item.cacheStatus, whetherResearchChangedOutcome: outcome({ role, before, after, effect }) }];
    }));
    return { execution: finalExecution, baselineResponse: baseline.response, provenance, status: "active_applied" };
  } catch {
    return { execution: baseline, baselineResponse: baseline.response, provenance: [], status: "failed_soft" };
  }
}
