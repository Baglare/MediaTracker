import type { RecommendationRequestV2 } from "../domain/codec";
import type { AspectId } from "../domain/aspect-registry";
import type { AspectEvidence } from "../domain/evidence";

export interface ExplicitRequestCoverage {
  applicable: boolean;
  matchedAspectIds: readonly AspectId[];
  requestedAspectIds: readonly AspectId[];
  coverage: number;
  meetsMinimum: boolean;
}

export function evaluateExplicitRequestCoverage(input: {
  request: RecommendationRequestV2;
  evidence: ReadonlyMap<AspectId, AspectEvidence>;
}): ExplicitRequestCoverage {
  const requestedAspectIds = [...new Set(input.request.aspectConstraints
    .filter((constraint) => constraint.source === "explicit" && constraint.role !== "avoid")
    .map((constraint) => constraint.aspectId))];
  if (requestedAspectIds.length === 0) {
    return { applicable: false, matchedAspectIds: [], requestedAspectIds, coverage: 1, meetsMinimum: true };
  }
  const matchedAspectIds = requestedAspectIds.filter((aspectId) => {
    const evidence = input.evidence.get(aspectId);
    return Boolean(evidence
      && evidence.level !== "unknown"
      && evidence.level !== "absent"
      && evidence.confidence !== "unknown"
      && evidence.supportingEvidence.length > 0);
  });
  return {
    applicable: true,
    matchedAspectIds,
    requestedAspectIds,
    coverage: matchedAspectIds.length / requestedAspectIds.length,
    meetsMinimum: matchedAspectIds.length > 0,
  };
}
