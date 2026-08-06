import type { RecommendationRequestV2 } from "../domain/codec";
import type { AspectId } from "../domain/aspect-registry";
import type { AspectEvidence } from "../domain/evidence";

export interface ExplicitRequestCoverage {
  applicable: boolean;
  matchedWeight: number;
  totalWeight: number;
  coverage: number;
  matchedExplicitAspectIds: readonly AspectId[];
  unmatchedExplicitAspectIds: readonly AspectId[];
  meetsMinimum: boolean;
}

function constraintWeight(constraint: RecommendationRequestV2["aspectConstraints"][number]): number {
  if (constraint.source === "profile" || constraint.role === "avoid") return 0;
  if (constraint.source === "explicit" && constraint.role === "must") return 2;
  if (constraint.source === "explicit") return 1;
  return 0.5;
}

export function evaluateExplicitRequestCoverage(input: {
  request: RecommendationRequestV2;
  evidence: ReadonlyMap<AspectId, AspectEvidence>;
}): ExplicitRequestCoverage {
  const positives = input.request.aspectConstraints.filter((constraint) => constraintWeight(constraint) > 0);
  const explicitAspectIds = positives.filter((constraint) => constraint.source === "explicit").map((constraint) => constraint.aspectId);
  const isMatched = (aspectId: AspectId) => {
    const evidence = input.evidence.get(aspectId);
    return Boolean(evidence
      && evidence.level !== "unknown"
      && evidence.level !== "absent"
      && evidence.confidence !== "unknown"
      && evidence.supportingEvidence.length > 0);
  };
  const matchedExplicitAspectIds = explicitAspectIds.filter(isMatched);
  const unmatchedExplicitAspectIds = explicitAspectIds.filter((aspectId) => !isMatched(aspectId));
  const totalWeight = positives.reduce((sum, constraint) => sum + constraintWeight(constraint), 0);
  const matchedWeight = positives.reduce((sum, constraint) => sum + (isMatched(constraint.aspectId) ? constraintWeight(constraint) : 0), 0);
  if (explicitAspectIds.length === 0) {
    return { applicable: false, matchedWeight, totalWeight, coverage: 1, matchedExplicitAspectIds: [], unmatchedExplicitAspectIds: [], meetsMinimum: true };
  }
  return {
    applicable: true,
    matchedWeight,
    totalWeight,
    coverage: totalWeight > 0 ? matchedWeight / totalWeight : 1,
    matchedExplicitAspectIds,
    unmatchedExplicitAspectIds,
    meetsMinimum: matchedExplicitAspectIds.length > 0,
  };
}
