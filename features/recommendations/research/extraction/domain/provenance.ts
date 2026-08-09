import { ASPECT_REGISTRY, type AspectId } from "../../../domain/aspect-registry";
import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../../domain/types";
import type { GroundedAspectDefinition, GroundedExtractionProvenance } from "./types";

const HASH = /^sha256:[a-f0-9]{64}$/;
function issue(code: string, path: string, message: string): RecommendationDomainIssue { return { code, path, message }; }

export function buildGroundedAspectDefinition(aspectId: AspectId): GroundedAspectDefinition {
  const aspect = ASPECT_REGISTRY[aspectId];
  const aliases = aspect.aliasesEn.length > 0 ? ` Controlled related terms: ${aspect.aliasesEn.join(", ")}.` : "";
  return {
    aspectId,
    labelEn: aspect.labelEn,
    semanticDefinition: `Assess only whether supplied evidence explicitly describes ${aspect.labelEn} and its narrative role.${aliases}`,
    incidentalDefinition: "Present briefly or peripherally without materially shaping recurring character choices or plot movement.",
    significantDefinition: "Recurring or materially affects character decisions, relationships, or multiple plot developments.",
    primaryDefinition: "A core premise or dominant driver whose removal would substantially change the work's main narrative.",
    explicitAbsenceDefinition: "Only an explicit source statement that the aspect or subplot is not present; omission is never absence.",
    limitationNotes: [aspect.limitationNoteTr ?? "Source wording and scope may limit centrality assessment.", "Use no knowledge outside supplied evidence units."],
  };
}

export function validateGroundedExtractionProvenance(value: GroundedExtractionProvenance): RecommendationDecodeResult<GroundedExtractionProvenance> {
  const issues: RecommendationDomainIssue[] = [];
  const allowed = new Set(["providerId", "modelId", "schemaVersion", "extractorPolicyVersion", "packetContentHash", "extractionStartedAt", "extractionCompletedAt", "assessmentCount", "validEvidenceUnitCount", "responseStatus", "warnings"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(issue("grounded_provenance_unknown_field", key, "Provenance raw payload taşıyamaz."));
  if (!HASH.test(value.packetContentHash)) issues.push(issue("grounded_provenance_packet_hash_invalid", "packetContentHash", "SHA-256 packet hash zorunludur."));
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(value.modelId)) issues.push(issue("grounded_provenance_model_invalid", "modelId", "Bounded model ID zorunludur."));
  const start = Date.parse(value.extractionStartedAt); const end = Date.parse(value.extractionCompletedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) issues.push(issue("grounded_provenance_time_invalid", "$", "Provenance timestamps canonical ve sıralı olmalıdır."));
  if (!Number.isInteger(value.assessmentCount) || value.assessmentCount < 0 || value.assessmentCount > 8 || !Number.isInteger(value.validEvidenceUnitCount) || value.validEvidenceUnitCount < 0 || value.validEvidenceUnitCount > 64) issues.push(issue("grounded_provenance_count_invalid", "$", "Provenance counts bounded olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

