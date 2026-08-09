import "server-only";

import { runDeterministicRecommendationV2WithShadowSeed, type DeterministicRecommendationV2Input } from "../../orchestration/deterministic-engine";
import { runGroundedResearchActivePipeline, type ActiveGroundedResearchHandoff } from "../shadow/orchestrator";
import type { GroundedResearchShadowContext } from "../shadow/types";
import { buildActiveResearchMerge } from "./merge";
import { buildPublicResearchEvidenceSummary } from "./public-evidence";
import type { PublicResearchOutcomeNotice } from "@/lib/ai/types";
import { ASPECT_REGISTRY } from "../../domain/aspect-registry";
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
  if (input.role === "avoid" && input.after && input.effect === "would_clear_avoid") return "cleared_avoid";
  if (!input.before && input.after) return input.role === "avoid" && input.effect === "would_clear_avoid" ? "cleared_avoid" : "rescued_candidate";
  if (input.before && !input.after) return "rejected_candidate";
  return "no_change";
}

const UNAVAILABLE_RESEARCH_STATUSES = new Set(["adapter_unavailable", "provider_unavailable", "rate_limited", "budget_exhausted", "security_rejected", "identity_not_found", "identity_ambiguous", "identity_unverified", "wikipedia_unavailable"]);

function buildOutcomeNotice(input: {
  context: GroundedResearchShadowContext;
  status: PublicResearchOutcomeNotice["status"];
  affectedCandidateCount?: number;
  onlyAvoidPresence?: boolean;
}): PublicResearchOutcomeNotice {
  const aspects = input.context.candidates.flatMap((candidate) => candidate.researchCandidate.unresolvedConstraints).flatMap((constraint) => {
    if (input.onlyAvoidPresence && constraint.role !== "avoid") return [];
    return [{
      aspectId: constraint.aspectId,
      label: ASPECT_REGISTRY[constraint.aspectId].labelTr,
      outcome: input.onlyAvoidPresence
        ? "verified_avoided_element" as const
        : constraint.role === "must"
          ? "could_not_verify_required" as const
          : "explicit_absence_not_verified" as const,
    }];
  });
  const deduped = [...new Map(aspects.map((item) => [item.aspectId, item])).values()].slice(0, 3);
  return { version: 1, status: input.status, aspects: deduped, ...(input.affectedCandidateCount ? { affectedCandidateCount: Math.min(3, Math.max(1, input.affectedCandidateCount)) } : {}) };
}

function withNotice(execution: ActiveGroundedRecommendationResult["execution"], notice: PublicResearchOutcomeNotice): ActiveGroundedRecommendationResult["execution"] {
  return { ...execution, response: { ...execution.response, researchOutcomeNotice: notice } };
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
    if (research.handoffs.length === 0) {
      const unavailable = research.result.status === "budget_exhausted" || research.result.status === "aborted" || research.result.results.some((item) => UNAVAILABLE_RESEARCH_STATUSES.has(item.researchStatus));
      const notice = buildOutcomeNotice({ context, status: unavailable ? "research_unavailable" : "no_verified_match", affectedCandidateCount: context.candidates.length });
      return { execution: withNotice(baseline, notice), baselineResponse: baseline.response, provenance: [], status: unavailable ? "failed_soft" : "baseline" };
    }
    const merge = buildActiveResearchMerge({ handoffs: research.handoffs.map((item) => item.handoff), constraints: context.structuredRequest.aspectConstraints });
    if (merge.constraintDecisionsByCandidateKey.size === 0) return { execution: withNotice(baseline, buildOutcomeNotice({ context, status: "no_verified_match", affectedCandidateCount: context.candidates.length })), baselineResponse: baseline.response, provenance: [], status: "baseline" };
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
    const publicEvidenceByCandidateKey = new Map<string, ReturnType<typeof buildPublicResearchEvidenceSummary>>();
    for (const provenanceItem of provenance.filter((item) => item.whetherResearchChangedOutcome === "rescued_candidate" || item.whetherResearchChangedOutcome === "cleared_avoid")) {
      const handoff = research.handoffs.find((item) => item.handoff.candidateIdentity.canonicalKey === provenanceItem.candidateIdentity.canonicalKey && item.handoff.aspectDecisions.some((decision) => decision.aspectId === provenanceItem.aspectId))?.handoff;
      const summary = handoff ? buildPublicResearchEvidenceSummary({ handoff, provenance: provenanceItem }) : null;
      if (!summary) return { execution: withNotice(baseline, buildOutcomeNotice({ context, status: "research_unavailable", affectedCandidateCount: context.candidates.length })), baselineResponse: baseline.response, provenance: [], status: "failed_soft" };
      publicEvidenceByCandidateKey.set(provenanceItem.candidateIdentity.canonicalKey, summary);
    }
    const recommendations = finalExecution.response.recommendations.map((recommendation) => {
      const key = provenance.find((item) => item.candidateIdentity.primaryProvider === recommendation.externalSource && item.candidateIdentity.primaryExternalId === recommendation.externalId)?.candidateIdentity.canonicalKey;
      const researchEvidence = key ? publicEvidenceByCandidateKey.get(key) : undefined;
      return researchEvidence ? { ...recommendation, researchEvidence } : recommendation;
    });
    const excludedByAvoid = provenance.filter((item) => item.whetherResearchChangedOutcome === "rejected_candidate" && context.structuredRequest.aspectConstraints.some((constraint) => constraint.aspectId === item.aspectId && constraint.role === "avoid"));
    const researchOutcomeNotice = excludedByAvoid.length > 0
      ? buildOutcomeNotice({ context: { ...context, candidates: context.candidates.filter((candidate) => excludedByAvoid.some((item) => item.candidateIdentity.canonicalKey === candidate.researchCandidate.identity.canonicalKey)) }, status: "candidates_excluded_by_research", affectedCandidateCount: excludedByAvoid.length, onlyAvoidPresence: true })
      : undefined;
    return { execution: { ...finalExecution, response: { ...finalExecution.response, recommendations, ...(researchOutcomeNotice ? { researchOutcomeNotice } : {}) } }, baselineResponse: baseline.response, provenance, status: "active_applied" };
  } catch {
    return { execution: withNotice(baseline, buildOutcomeNotice({ context, status: "research_unavailable", affectedCandidateCount: context.candidates.length })), baselineResponse: baseline.response, provenance: [], status: "failed_soft" };
  }
}
