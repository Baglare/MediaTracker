import { validateGroundedExtractionGrounding } from "../domain/model-output";
import type { GroundedEvidenceUnit, GroundedExtractionModelOutput, GroundedExtractionRequest } from "../domain/types";

export function validateProviderGroundedObservation(input: { request: GroundedExtractionRequest; output: GroundedExtractionModelOutput; units: readonly GroundedEvidenceUnit[]; excludedUnitIds: readonly string[] }) {
  return validateGroundedExtractionGrounding({ output: input.output, packet: input.request.packet, units: input.units, excludedUnitIds: input.excludedUnitIds });
}

