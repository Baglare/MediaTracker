import { ASPECT_REGISTRY } from "../../../domain/aspect-registry";
import { validatePersistedResearchClaim } from "../../domain/citations";
import { getResearchSource } from "../../domain/source-registry";
import type { PersistedResearchClaim } from "../../domain/types";
import { researchSha256 } from "../../passages/hash";
import type { GroundedEvidenceUnit, GroundedExtractionModelOutput, GroundedExtractionRequest } from "./types";

const LEVEL_TR = { incidental: "sınırlı", significant: "önemli", primary: "merkezî" } as const;
const CONFIDENCE_VALUE = { low: 1, medium: 2, high: 3 } as const;

function boundedConfidence(input: { model: "low" | "medium" | "high"; sourceTiers: readonly ("high" | "medium" | "low")[]; unitCount: number }): "low" | "medium" | "high" {
  let value: number = CONFIDENCE_VALUE[input.model];
  const trustCap = input.sourceTiers.every((tier) => tier === "high") ? 3 : input.sourceTiers.some((tier) => tier === "medium" || tier === "high") ? 2 : 1;
  value = Math.min(value, trustCap, input.unitCount > 0 ? 3 : 1);
  return value >= 3 ? "high" : value >= 2 ? "medium" : "low";
}

export async function buildDeterministicGroundedClaims(input: { request: GroundedExtractionRequest; output: GroundedExtractionModelOutput; units: readonly GroundedEvidenceUnit[] }): Promise<readonly PersistedResearchClaim[]> {
  const units = new Map(input.units.map((unit) => [unit.unitId, unit]));
  const claims: PersistedResearchClaim[] = [];
  for (const assessment of input.output.assessments) {
    if (assessment.finding !== "supports_presence" && assessment.finding !== "supports_explicit_absence") continue;
    const citedUnits = assessment.evidenceUnitIds.map((id) => units.get(id)).filter((unit): unit is GroundedEvidenceUnit => Boolean(unit));
    const citationIds = [...new Set(citedUnits.map((unit) => unit.citationId))].sort();
    if (citationIds.length === 0) continue;
    const sourceTiers = citedUnits.map((unit) => getResearchSource(unit.sourceId)?.trustTier ?? "low");
    const confidence = boundedConfidence({ model: assessment.confidence, sourceTiers, unitCount: citedUnits.length });
    const aspect = ASPECT_REGISTRY[input.request.packet.aspectId];
    const polarity = assessment.finding === "supports_presence" ? "support" : "contradict";
    const level = polarity === "support" ? assessment.level : null;
    if (polarity === "support" && level === null) continue;
    const paraphrasedClaim = polarity === "support"
      ? `${aspect.labelTr} unsurunun anlatıda ${LEVEL_TR[level as keyof typeof LEVEL_TR]} düzeyde bulunduğunu destekleyen kaynak kanıtı.`
      : `Kaynak, ${aspect.labelTr} unsurunun veya ilgili alt hikâyenin açıkça bulunmadığını belirtiyor.`;
    const claimId = await researchSha256([input.request.packet.packetContentHash, input.request.packet.aspectId, polarity, level ?? "null", ...citationIds, ...assessment.evidenceUnitIds].join("|"));
    const claim: PersistedResearchClaim = { claimId, aspectId: input.request.packet.aspectId, polarity, level, confidence, paraphrasedClaim, citationIds, extractionMethod: "grounded_llm", extractionPolicyVersion: input.request.extractorPolicyVersion, warnings: [] };
    if (validatePersistedResearchClaim({ claim, citations: input.request.packet.citations }).ok) claims.push(claim);
  }
  return claims;
}
