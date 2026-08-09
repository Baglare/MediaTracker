import { buildDeterministicGroundedClaims } from "../domain/claims";
import { buildDeterministicResearchDecision } from "../domain/decision";
import type { GroundedEvidenceUnit, GroundedExtractionModelOutput, GroundedExtractionRequest } from "../domain/types";

export async function aggregateGroundedExtraction(input: { request: GroundedExtractionRequest; output: GroundedExtractionModelOutput; units: readonly GroundedEvidenceUnit[]; now?: () => Date }) {
  const claims = await buildDeterministicGroundedClaims(input);
  const decision = buildDeterministicResearchDecision({ request: input.request, claims, now: input.now });
  return { claims, decision };
}

