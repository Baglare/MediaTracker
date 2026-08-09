import { decodeRecommendationRequestV2 } from "../../domain/codec";
import type { RecommendationDomainIssue } from "../../domain/types";
import { containsForbiddenResearchData, decodeResearchCandidateInput } from "../domain/codec";
import type { GroundedResearchShadowInput } from "./types";

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function issue(code: string, path: string, message: string): RecommendationDomainIssue { return { code, path, message }; }
function unknown(value: Record<string, unknown>, fields: readonly string[], path: string) { const allowed = new Set(fields); return Object.keys(value).filter((key) => !allowed.has(key)).map((key) => issue("research_shadow_unknown_field", `${path}.${key}`, "Shadow contract bilinmeyen alan kabul etmez.")); }

export function decodeGroundedResearchShadowInput(value: unknown): { ok: true; value: GroundedResearchShadowInput } | { ok: false; issues: RecommendationDomainIssue[] } {
  if (!record(value)) return { ok: false, issues: [issue("research_shadow_input_invalid", "$", "Shadow input object olmalıdır.")] };
  const issues = unknown(value, ["version", "structuredRequest", "candidates", "requestId", "signal"], "$" );
  if (value.version !== 1 || typeof value.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(value.requestId)) issues.push(issue("research_shadow_header_invalid", "$", "version=1 ve bounded requestId zorunludur."));
  if (containsForbiddenResearchData(value)) issues.push(issue("research_shadow_private_data_forbidden", "$", "Private/raw user data shadow input'una giremez."));
  if (!record(value.structuredRequest)) issues.push(issue("research_shadow_request_invalid", "structuredRequest", "Sanitized structured request zorunludur."));
  else {
    issues.push(...unknown(value.structuredRequest, ["version", "targetMediaTypes", "aspectConstraints", "objectiveConstraints", "strictness"], "structuredRequest"));
    const decoded = decodeRecommendationRequestV2({
      version: 2, queryText: "shadow-validation", targetMediaTypes: value.structuredRequest.targetMediaTypes,
      aspectConstraints: value.structuredRequest.aspectConstraints, objectiveConstraints: value.structuredRequest.objectiveConstraints,
      strictness: value.structuredRequest.strictness, references: [], profileSignalsEnabled: false,
      semanticVerifierMode: "structured_only", locale: "en",
    });
    if (!decoded.ok) issues.push(...decoded.issues.map((item) => ({ ...item, path: `structuredRequest.${item.path}` })));
  }
  if (!Array.isArray(value.candidates)) issues.push(issue("research_shadow_candidates_invalid", "candidates", "Candidate context listesi zorunludur."));
  else value.candidates.forEach((candidate, index) => {
    if (!record(candidate)) { issues.push(issue("research_shadow_candidate_invalid", `candidates.${index}`, "Candidate context object olmalıdır.")); return; }
    issues.push(...unknown(candidate, ["researchCandidate", "titleSnapshot", "releaseYear"], `candidates.${index}`));
    const decoded = decodeResearchCandidateInput(candidate.researchCandidate);
    if (!decoded.ok) issues.push(...decoded.issues.map((item) => ({ ...item, path: `candidates.${index}.researchCandidate.${item.path}` })));
    if (typeof candidate.titleSnapshot !== "string" || !candidate.titleSnapshot.trim() || candidate.titleSnapshot.length > 300 || /[\0\r\n]/.test(candidate.titleSnapshot)) issues.push(issue("research_shadow_title_invalid", `candidates.${index}.titleSnapshot`, "Public bounded title snapshot zorunludur."));
    if (candidate.releaseYear !== undefined && (!Number.isInteger(candidate.releaseYear) || candidate.releaseYear < 1800 || candidate.releaseYear > 2200)) issues.push(issue("research_shadow_year_invalid", `candidates.${index}.releaseYear`, "Release year bounded olmalıdır."));
  });
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) issues.push(issue("research_shadow_signal_invalid", "signal", "AbortSignal geçersiz."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as GroundedResearchShadowInput };
}

