import type { EvidenceConfidence } from "../domain/types";

export const RANKED_TAG_EVIDENCE_POLICY = Object.freeze({
  primaryRequiresIndependentEvidence: true,
  bands: [
    { minimumRank: 85, strengthFloor: 0.68, confidence: "high" },
    { minimumRank: 60, strengthFloor: 0.62, confidence: "high" },
    { minimumRank: 40, strengthFloor: 0.55, confidence: "medium" },
    { minimumRank: 20, strengthFloor: 0.28, confidence: "low" },
  ],
  primaryFloor: 0.78,
  belowContributionRank: 20,
} as const);

export function rankedTagPolicyFor(rank: number, hasIndependentStrongClaim: boolean): {
  included: boolean;
  strengthFloor: number;
  confidence: Exclude<EvidenceConfidence, "unknown">;
} {
  const band = RANKED_TAG_EVIDENCE_POLICY.bands.find((entry) => rank >= entry.minimumRank);
  if (!band) return { included: false, strengthFloor: 0, confidence: "low" };
  return {
    included: true,
    strengthFloor: rank >= 85 && hasIndependentStrongClaim
      ? RANKED_TAG_EVIDENCE_POLICY.primaryFloor
      : band.strengthFloor,
    confidence: band.confidence,
  };
}
