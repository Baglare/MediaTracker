import type { EvidenceClaim } from "../domain/evidence";
import type { EvidenceConfidence } from "../domain/types";

export function independentEvidenceCount(claims: readonly EvidenceClaim[]): number {
  return new Set(claims.map((claim) => `${claim.provider ?? "semantic"}:${claim.sourceKind}:${claim.field ?? "-"}`)).size;
}

export function deriveEvidenceConfidence(input: {
  supporting: readonly EvidenceClaim[];
  contradictory: readonly EvidenceClaim[];
  strength: number | null;
}): EvidenceConfidence {
  if (input.strength === null || input.supporting.length === 0) return "unknown";
  const independent = independentEvidenceCount(input.supporting);
  const maxReliability = Math.max(...input.supporting.map((claim) => claim.reliability ?? 0));
  let confidence: EvidenceConfidence = independent >= 2 && maxReliability >= 0.72
    ? "high"
    : maxReliability >= 0.55 || independent >= 2 ? "medium" : "low";
  if (input.contradictory.length > 0) {
    confidence = confidence === "high" ? "medium" : confidence === "medium" ? "low" : "low";
  }
  return confidence;
}
