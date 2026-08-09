import { isAspectId } from "../../../domain/aspect-registry";
import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../../domain/types";
import { validateGroundedResearchPacket } from "../../passages/codec";
import { computeGroundedResearchPacketContentHash } from "../../passages/packet-builder";
import { buildGroundedAspectDefinition } from "./provenance";
import {
  GROUNDED_EXTRACTION_CONTRACT_VERSION,
  GROUNDED_EXTRACTION_MAX_ASSESSMENTS,
  GROUNDED_EXTRACTION_MAX_EVIDENCE_UNITS,
  GROUNDED_EXTRACTION_POLICY_VERSION,
  GROUNDED_EXTRACTION_SCHEMA_VERSION,
  type GroundedExtractionRequest,
} from "./types";

function issue(code: string, path: string, message: string): RecommendationDomainIssue { return { code, path, message }; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): RecommendationDomainIssue[] {
  const set = new Set(allowed);
  return Object.keys(value).filter((key) => !set.has(key)).map((key) => issue("grounded_extraction_unknown_field", `${path}.${key}`, "Unknown field fail-closed reddedildi."));
}

export async function decodeGroundedExtractionRequest(value: unknown): Promise<RecommendationDecodeResult<GroundedExtractionRequest>> {
  if (!record(value)) return { ok: false, issues: [issue("grounded_extraction_request_invalid", "$", "Request object olmalıdır.")] };
  const issues = exactKeys(value, ["version", "packet", "aspectDefinition", "extractorPolicyVersion", "schemaVersion", "requestId", "maxEvidenceUnits", "maxOutputAssessments"], "$" );
  if (value.version !== GROUNDED_EXTRACTION_CONTRACT_VERSION) issues.push(issue("grounded_extraction_version_invalid", "version", "version=1 zorunludur."));
  if (!record(value.packet)) issues.push(issue("grounded_extraction_packet_invalid", "packet", "Grounded packet zorunludur."));
  else {
    const packet = validateGroundedResearchPacket(value.packet as never);
    if (!packet.ok) issues.push(...packet.issues);
    else if (await computeGroundedResearchPacketContentHash(packet.value) !== packet.value.packetContentHash) issues.push(issue("grounded_extraction_packet_hash_invalid", "packet.packetContentHash", "Packet content hash yeniden doğrulanamadı."));
  }
  if (!record(value.aspectDefinition) || !isAspectId(value.aspectDefinition.aspectId)) issues.push(issue("grounded_extraction_aspect_invalid", "aspectDefinition", "Registry aspect definition zorunludur."));
  else {
    issues.push(...exactKeys(value.aspectDefinition, ["aspectId", "labelEn", "semanticDefinition", "incidentalDefinition", "significantDefinition", "primaryDefinition", "explicitAbsenceDefinition", "limitationNotes"], "aspectDefinition"));
    const expected = buildGroundedAspectDefinition(value.aspectDefinition.aspectId);
    if (JSON.stringify(value.aspectDefinition) !== JSON.stringify(expected)) issues.push(issue("grounded_extraction_aspect_definition_mismatch", "aspectDefinition", "Aspect definition server registry ile eşleşmelidir."));
    if (record(value.packet) && value.packet.aspectId !== value.aspectDefinition.aspectId) issues.push(issue("grounded_extraction_aspect_packet_mismatch", "aspectDefinition.aspectId", "Aspect packet ile eşleşmelidir."));
  }
  if (value.extractorPolicyVersion !== GROUNDED_EXTRACTION_POLICY_VERSION || value.schemaVersion !== GROUNDED_EXTRACTION_SCHEMA_VERSION) issues.push(issue("grounded_extraction_policy_invalid", "$", "Extractor/schema policy version geçersiz."));
  if (typeof value.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value.requestId)) issues.push(issue("grounded_extraction_request_id_invalid", "requestId", "Bounded requestId zorunludur."));
  if (!Number.isInteger(value.maxEvidenceUnits) || Number(value.maxEvidenceUnits) < 1 || Number(value.maxEvidenceUnits) > GROUNDED_EXTRACTION_MAX_EVIDENCE_UNITS) issues.push(issue("grounded_extraction_unit_budget_invalid", "maxEvidenceUnits", "Evidence unit budget 1..64 olmalıdır."));
  if (!Number.isInteger(value.maxOutputAssessments) || Number(value.maxOutputAssessments) < 1 || Number(value.maxOutputAssessments) > GROUNDED_EXTRACTION_MAX_ASSESSMENTS) issues.push(issue("grounded_extraction_assessment_budget_invalid", "maxOutputAssessments", "Assessment budget 1..8 olmalıdır."));
  const forbidden = ["ownerId", "userId", "rating", "favorite", "progress", "note", "feedback", "rawPrompt", "conversation", "searchQuery", "providerResponse"];
  for (const key of forbidden) if (Object.hasOwn(value, key)) issues.push(issue("grounded_extraction_private_field_forbidden", key, "Private/search provider field yasaktır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as GroundedExtractionRequest };
}

