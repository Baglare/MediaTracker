import type { AiCandidate, RecommendationFeedbackEvent } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";
import type { RecommendationRequestV2 } from "../domain/codec";
import { buildCandidateEligibility, evaluateConstraintEligibility } from "../domain/policies";
import type { AspectId } from "../domain/aspect-registry";
import type { AspectEvidence } from "../domain/evidence";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import { evaluateObjectiveConstraint, objectiveDecisionsAllowPrimary } from "./objective-filters";
import { buildPersonalPreferenceProfile, calculatePersonalFit, hasExactLibraryIdentity } from "./personal-profile";
import type { ScoredRecommendationCandidate } from "./types";
import type { RecommendationFeedbackEventV2 } from "../feedback";
import { evaluateExplicitRequestCoverage } from "./request-relevance";

const CONFIDENCE_VALUE = { unknown: 0, low: 0.35, medium: 0.7, high: 1 } as const;
const LEVEL_VALUE = { unknown: -1, absent: 0, incidental: 1, significant: 2, primary: 3 } as const;

function quality(snapshot: CandidateProviderEvidenceSnapshot): number {
  const score = snapshot.objectiveMetadata.communityScore;
  const normalizedScore = typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(1, score > 10 ? score / 100 : score / 10)) : 0;
  const popularity = snapshot.objectiveMetadata.popularity;
  const normalizedPopularity = typeof popularity === "number" && popularity > 0 ? Math.min(1, Math.log10(popularity + 1) / 6) : 0;
  return normalizedScore * 0.8 + normalizedPopularity * 0.2;
}

function requestFit(request: RecommendationRequestV2, aspect: readonly import("../domain/policies").ConstraintDecision[], objective: readonly import("./types").ObjectiveConstraintDecision[], coverage: import("./request-relevance").ExplicitRequestCoverage): number {
  const decisions = [...aspect, ...objective].filter((decision) => decision.role !== "avoid");
  if (decisions.length === 0) return 0.5;
  let totalWeight = 0;
  let total = 0;
  for (const decision of decisions) {
    const value = decision.outcome === "passed" || decision.outcome === "preferred"
      ? 1
      : decision.outcome === "risk"
        ? 0.45
        : decision.outcome === "not_preferred"
          ? 0.25
          : 0;
    const constraint = request.aspectConstraints.find((item) => item.id === decision.constraintId);
    if (constraint?.source === "profile") continue;
    const weight = constraint?.source === "explicit" && constraint.role === "must"
      ? 2
      : constraint?.source === "inferred"
        ? 0.5
        : 1;
    total += value * weight;
    totalWeight += weight;
  }
  const decisionFit = totalWeight > 0 ? total / totalWeight : 0.5;
  return coverage.applicable ? decisionFit * 0.8 + coverage.coverage * 0.2 : decisionFit;
}

function evidenceConfidence(request: RecommendationRequestV2, evidence: ReadonlyMap<AspectId, AspectEvidence>): number {
  const positiveConstraints = request.aspectConstraints.filter((constraint) => constraint.role !== "avoid" && constraint.source !== "profile");
  if (positiveConstraints.length === 0) return 0.5;
  return positiveConstraints.reduce((sum, constraint) => sum + CONFIDENCE_VALUE[evidence.get(constraint.aspectId)?.confidence ?? "unknown"], 0) / positiveConstraints.length;
}

function rejectionReason(input: {
  request: RecommendationRequestV2;
  aspectEvidence: ReadonlyMap<AspectId, AspectEvidence>;
  aspectDecisions: readonly import("../domain/policies").ConstraintDecision[];
  objectiveDecisions: readonly import("./types").ObjectiveConstraintDecision[];
}): string {
  const failedMust = input.request.aspectConstraints.find((constraint) => constraint.role === "must"
    && input.aspectDecisions.some((decision) => decision.constraintId === constraint.id && !decision.passed));
  if (failedMust) {
    const evidence = input.aspectEvidence.get(failedMust.aspectId);
    if (evidence && evidence.level !== "unknown" && failedMust.minimumLevel
      && LEVEL_VALUE[evidence.level] < LEVEL_VALUE[failedMust.minimumLevel]) {
      return failedMust.aspectId === "romance"
        ? "candidates_failed_romance_strength"
        : "candidates_failed_aspect_strength";
    }
    return "candidates_failed_confidence";
  }
  if (input.aspectDecisions.some((decision) => decision.outcome === "triggered_avoid")) {
    return "candidates_failed_avoid";
  }
  if (input.objectiveDecisions.some((decision) => !decision.passed)) {
    return "candidates_failed_objective";
  }
  return "constraint_failed";
}

export function scoreEligibleCandidates(input: {
  request: RecommendationRequestV2;
  candidates: readonly { candidate: AiCandidate; snapshot: CandidateProviderEvidenceSnapshot; aspectEvidence: ReadonlyMap<AspectId, AspectEvidence> }[];
  mediaItems: readonly MediaItem[];
  feedback: readonly RecommendationFeedbackEvent[];
  feedbackV2?: readonly RecommendationFeedbackEventV2[];
}): { scored: ScoredRecommendationCandidate[]; nearMatches: ScoredRecommendationCandidate[]; rejected: { title: string; reason: string }[] } {
  const profile = buildPersonalPreferenceProfile(input.mediaItems);
  const scored: ScoredRecommendationCandidate[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const nearMatches: ScoredRecommendationCandidate[] = [];
  const avoidedAspectIds = new Set(input.request.aspectConstraints
    .filter((constraint) => constraint.role === "avoid")
    .map((constraint) => constraint.aspectId));
  for (const item of input.candidates) {
    const aspectDecisions = input.request.aspectConstraints.map((constraint) => evaluateConstraintEligibility({ constraint, evidence: item.aspectEvidence.get(constraint.aspectId) ?? null, strictness: input.request.strictness }));
    const objectiveDecisions = input.request.objectiveConstraints.map((constraint) => evaluateObjectiveConstraint({ constraint, snapshot: item.snapshot }));
    const aspectEligibility = buildCandidateEligibility(input.request.strictness, aspectDecisions);
    const objectiveEligible = objectiveDecisionsAllowPrimary(objectiveDecisions);
    const explicitCoverage = evaluateExplicitRequestCoverage({ request: input.request, evidence: item.aspectEvidence });
    if (!aspectEligibility.eligibleForPrimary || !objectiveEligible) {
      const reason = rejectionReason({ request: input.request, aspectEvidence: item.aspectEvidence, aspectDecisions, objectiveDecisions });
      if (aspectEligibility.eligibleForNearMatch && objectiveEligible && explicitCoverage.meetsMinimum && !hasExactLibraryIdentity(item.snapshot, input.mediaItems)) {
        const breakdown = {
          requestFit: requestFit(input.request, aspectDecisions, objectiveDecisions, explicitCoverage),
          explicitRequestCoverage: explicitCoverage.coverage,
          evidenceConfidence: evidenceConfidence(input.request, item.aspectEvidence),
          personalFit: input.request.profileSignalsEnabled ? calculatePersonalFit({ profile, snapshot: item.snapshot, aspectEvidence: item.aspectEvidence, feedback: input.feedback, feedbackV2: input.feedbackV2 ?? [], suppressedAspectIds: avoidedAspectIds }) : 0,
          qualitySignal: quality(item.snapshot), novelty: 1, diversityContribution: 1,
        };
        nearMatches.push({ ...item, aspectDecisions, objectiveDecisions, explicitRequestCoverage: explicitCoverage, scoreBreakdown: breakdown, deterministicSortKey: [breakdown.requestFit, breakdown.evidenceConfidence, breakdown.personalFit, breakdown.qualitySignal, breakdown.novelty, item.snapshot.candidateIdentity.canonicalKey], warnings: [...item.snapshot.warnings, ...aspectDecisions.flatMap((decision) => decision.warnings)] });
      }
      rejected.push({ title: item.candidate.title, reason });
      continue;
    }
    if (hasExactLibraryIdentity(item.snapshot, input.mediaItems)) {
      rejected.push({ title: item.candidate.title, reason: "exact_library_identity" });
      continue;
    }
    if (!explicitCoverage.meetsMinimum) {
      rejected.push({ title: item.candidate.title, reason: "candidates_below_request_coverage" });
      continue;
    }
    const breakdown = {
      requestFit: requestFit(input.request, aspectDecisions, objectiveDecisions, explicitCoverage),
      explicitRequestCoverage: explicitCoverage.coverage,
      evidenceConfidence: evidenceConfidence(input.request, item.aspectEvidence),
      personalFit: input.request.profileSignalsEnabled ? calculatePersonalFit({ profile, snapshot: item.snapshot, aspectEvidence: item.aspectEvidence, feedback: input.feedback, feedbackV2: input.feedbackV2 ?? [], suppressedAspectIds: avoidedAspectIds }) : 0,
      qualitySignal: quality(item.snapshot),
      novelty: 1,
      diversityContribution: 1,
    };
    scored.push({
      ...item,
      aspectDecisions,
      objectiveDecisions,
      explicitRequestCoverage: explicitCoverage,
      scoreBreakdown: breakdown,
      deterministicSortKey: [breakdown.requestFit, breakdown.evidenceConfidence, breakdown.personalFit, breakdown.qualitySignal, breakdown.novelty, item.snapshot.candidateIdentity.canonicalKey],
      warnings: [...item.snapshot.warnings, ...aspectDecisions.flatMap((decision) => decision.warnings), ...objectiveDecisions.flatMap((decision) => decision.warnings)],
    });
  }
  scored.sort(compareScoredCandidates);
  nearMatches.sort(compareScoredCandidates);
  return { scored, nearMatches, rejected };
}

export function compareScoredCandidates(a: ScoredRecommendationCandidate, b: ScoredRecommendationCandidate): number {
  for (let index = 0; index < 5; index += 1) {
    const delta = (b.deterministicSortKey[index] as number) - (a.deterministicSortKey[index] as number);
    if (Math.abs(delta) > 1e-9) return delta;
  }
  return String(a.deterministicSortKey[5]).localeCompare(String(b.deterministicSortKey[5]), "en");
}
