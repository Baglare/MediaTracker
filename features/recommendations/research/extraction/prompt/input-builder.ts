import { getResearchSource } from "../../domain/source-registry";
import type { GroundedEvidenceUnit, GroundedExtractionModelInput, GroundedExtractionRequest } from "../domain/types";

export function buildMinimizedGroundedModelInput(input: { request: GroundedExtractionRequest; units: readonly GroundedEvidenceUnit[] }): GroundedExtractionModelInput {
  return {
    version: 1,
    candidateRef: "candidate-1",
    aspect: input.request.aspectDefinition,
    evidenceUnits: input.units.map((unit) => ({
      unitId: unit.unitId,
      passageId: unit.passageId,
      publisherGroup: unit.publisherGroup,
      language: unit.language,
      passageOrder: unit.passageOrder,
      unitOrder: unit.unitOrder,
      sourceTrust: getResearchSource(unit.sourceId)?.trustTier ?? "low",
      text: unit.text,
    })),
  };
}

