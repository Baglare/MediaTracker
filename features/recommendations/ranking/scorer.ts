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

const CONFIDENCE_VALUE = { unknown: 0, low: 0.35, medium: 0.7, high: 1 } as const;

function quality(snapshot: CandidateProviderEvidenceSnapshot): number {
  const score = snapshot.objectiveMetadata.communityScore;
  const normalizedScore = typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(1, score > 10 ? score / 100 : score / 10)) : 0;
  const popularity = snapshot.objectiveMetadata.popularity;
  const normalizedPopularity = typeof popularity === "number" && popularity > 0 ? Math.min(1, Math.log10(popularity + 1) / 6) : 0;
  return normalizedScore * 0.8 + normalizedPopularity * 0.2;
}

function requestFit(aspect: readonly import("../domain/policies").ConstraintDecision[], objective: readonly import("./types").ObjectiveConstraintDecision[]): number {
  const decisions = [...aspect, ...objective];
  if (decisions.length === 0) return 0.5;
  const values: number[] = decisions.map((decision) => {
    if (decision.outcome === "passed" || decision.outcome === "preferred") return 1;
    if (decision.outcome === "risk") return 0.45;
    if (decision.outcome === "not_preferred") return 0.25;
    return 0;
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evidenceConfidence(request: RecommendationRequestV2, evidence: ReadonlyMap<AspectId, AspectEvidence>): number {
  if (request.aspectConstraints.length === 0) return 0.5;
  return request.aspectConstraints.reduce((sum, constraint) => sum + CONFIDENCE_VALUE[evidence.get(constraint.aspectId)?.confidence ?? "unknown"], 0) / request.aspectConstraints.length;
}

export function scoreEligibleCandidates(input: {
  request: RecommendationRequestV2;
  candidates: readonly { candidate: AiCandidate; snapshot: CandidateProviderEvidenceSnapshot; aspectEvidence: ReadonlyMap<AspectId, AspectEvidence> }[];
  mediaItems: readonly MediaItem[];
  feedback: readonly RecommendationFeedbackEvent[];
}): { scored: ScoredRecommendationCandidate[]; rejected: { title: string; reason: string }[] } {
  const profile = buildPersonalPreferenceProfile(input.mediaItems);
  const scored: ScoredRecommendationCandidate[] = [];
  const rejected: { title: string; reason: string }[] = [];
  for (const item of input.candidates) {
    const aspectDecisions = input.request.aspectConstraints.map((constraint) => evaluateConstraintEligibility({ constraint, evidence: item.aspectEvidence.get(constraint.aspectId) ?? null, strictness: input.request.strictness }));
    const objectiveDecisions = input.request.objectiveConstraints.map((constraint) => evaluateObjectiveConstraint({ constraint, snapshot: item.snapshot }));
    const aspectEligibility = buildCandidateEligibility(input.request.strictness, aspectDecisions);
    if (!aspectEligibility.eligibleForPrimary || !objectiveDecisionsAllowPrimary(objectiveDecisions)) {
      const reason = [...aspectDecisions, ...objectiveDecisions].find((decision) => !decision.passed)?.outcome ?? "constraint_failed";
      rejected.push({ title: item.candidate.title, reason });
      continue;
    }
    if (hasExactLibraryIdentity(item.snapshot, input.mediaItems)) {
      rejected.push({ title: item.candidate.title, reason: "exact_library_identity" });
      continue;
    }
    const breakdown = {
      requestFit: requestFit(aspectDecisions, objectiveDecisions),
      personalFit: input.request.profileSignalsEnabled ? calculatePersonalFit({ profile, snapshot: item.snapshot, aspectEvidence: item.aspectEvidence, feedback: input.feedback }) : 0,
      evidenceConfidence: evidenceConfidence(input.request, item.aspectEvidence),
      qualitySignal: quality(item.snapshot),
      novelty: 1,
      diversityContribution: 1,
    };
    scored.push({
      ...item,
      aspectDecisions,
      objectiveDecisions,
      scoreBreakdown: breakdown,
      deterministicSortKey: [breakdown.requestFit, breakdown.personalFit, breakdown.evidenceConfidence, breakdown.qualitySignal, breakdown.novelty, item.snapshot.candidateIdentity.canonicalKey],
      warnings: [...item.snapshot.warnings, ...aspectDecisions.flatMap((decision) => decision.warnings), ...objectiveDecisions.flatMap((decision) => decision.warnings)],
    });
  }
  scored.sort(compareScoredCandidates);
  return { scored, rejected };
}

export function compareScoredCandidates(a: ScoredRecommendationCandidate, b: ScoredRecommendationCandidate): number {
  for (let index = 0; index < 5; index += 1) {
    const delta = (b.deterministicSortKey[index] as number) - (a.deterministicSortKey[index] as number);
    if (Math.abs(delta) > 1e-9) return delta;
  }
  return String(a.deterministicSortKey[5]).localeCompare(String(b.deterministicSortKey[5]), "en");
}
