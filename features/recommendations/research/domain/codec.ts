import { isAspectId } from "../../domain/aspect-registry";
import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../domain/types";
import { RECOMMENDATION_MEDIA_TYPES } from "../../domain/types";
import { createCandidateCanonicalKey } from "../../providers/candidate-identity";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { ResearchCandidateInput, ResearchConstraintRequest, ResearchVersionScope, StructuredEvidenceSummary } from "./types";
import { validateResearchVersionScope } from "./version-scope";

const FORBIDDEN_RESEARCH_KEYS = new Set([
  "ownerid", "userid", "userrating", "rating", "favorite", "progress", "currentprogress",
  "personalnotes", "note", "feedback", "prompt", "querytext", "library", "mediaitems",
]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function unknownFields(value: Record<string, unknown>, allowed: readonly string[], path: string): RecommendationDomainIssue[] {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key)).map((key) => issue("research_unknown_field", `${path}.${key}`, "Research contract bilinmeyen alan kabul etmez."));
}

export function containsForbiddenResearchData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenResearchData);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => FORBIDDEN_RESEARCH_KEYS.has(key.toLowerCase()) || containsForbiddenResearchData(nested));
}

function decodeIdentity(value: unknown, path: string): RecommendationDecodeResult<RecommendationCandidateIdentity> {
  if (!record(value)) return { ok: false, issues: [issue("research_identity_invalid", path, "Candidate identity object olmalıdır.")] };
  const issues = unknownFields(value, ["primaryProvider", "primaryExternalId", "mediaType", "verified", "secondaryIds", "canonicalKey", "verificationEvidence"], path);
  if (value.verified !== true) issues.push(issue("research_identity_unverified", `${path}.verified`, "Research yalnız verified identity kabul eder."));
  if (!RECOMMENDATION_MEDIA_TYPES.includes(value.mediaType as never)) issues.push(issue("research_identity_media_type_invalid", `${path}.mediaType`, "Media type geçersiz."));
  if (typeof value.primaryProvider !== "string" || typeof value.primaryExternalId !== "string") issues.push(issue("research_identity_provider_invalid", path, "Provider ve external ID zorunludur."));
  let expected: string | null = null;
  try {
    expected = createCandidateCanonicalKey(value.primaryProvider as never, value.mediaType as never, value.primaryExternalId as string);
  } catch {
    issues.push(issue("research_identity_external_id_invalid", `${path}.primaryExternalId`, "External ID exact provider formatında olmalıdır."));
  }
  if (typeof value.canonicalKey !== "string" || value.canonicalKey !== expected) issues.push(issue("research_identity_canonical_key_invalid", `${path}.canonicalKey`, "Canonical key exact provider/media/id alanlarından türemelidir."));
  if (!Array.isArray(value.secondaryIds) || !Array.isArray(value.verificationEvidence)) issues.push(issue("research_identity_evidence_invalid", path, "Secondary ID ve verification evidence array olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as RecommendationCandidateIdentity };
}

function decodeConstraint(value: unknown, path: string): RecommendationDecodeResult<ResearchConstraintRequest> {
  if (!record(value)) return { ok: false, issues: [issue("research_constraint_invalid", path, "Research constraint object olmalıdır.")] };
  const issues = unknownFields(value, ["aspectId", "role", "minimumLevel", "source", "currentStructuredDecision", "unresolvedReason"], path);
  if (!isAspectId(value.aspectId)) issues.push(issue("research_constraint_aspect_invalid", `${path}.aspectId`, "Aspect registry ID zorunludur."));
  if (!["must", "avoid", "prefer"].includes(String(value.role))) issues.push(issue("research_constraint_role_invalid", `${path}.role`, "Role geçersiz."));
  if (!["explicit", "inferred", "profile"].includes(String(value.source))) issues.push(issue("research_constraint_source_invalid", `${path}.source`, "Source geçersiz."));
  if (value.source === "profile" && value.role === "must") issues.push(issue("research_profile_must_forbidden", `${path}.source`, "Profile source must olamaz."));
  if (value.minimumLevel !== undefined && !["incidental", "significant", "primary"].includes(String(value.minimumLevel))) issues.push(issue("research_constraint_level_invalid", `${path}.minimumLevel`, "Minimum level geçersiz."));
  if (!["decisive_supported", "decisive_contradicted", "partial", "unknown"].includes(String(value.currentStructuredDecision))) issues.push(issue("research_constraint_decision_invalid", `${path}.currentStructuredDecision`, "Structured decision geçersiz."));
  if (typeof value.unresolvedReason !== "string" || value.unresolvedReason.trim().length === 0 || value.unresolvedReason.length > 240) issues.push(issue("research_constraint_reason_invalid", `${path}.unresolvedReason`, "Unresolved reason bounded olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as ResearchConstraintRequest };
}

function decodeSummary(value: unknown, path: string): RecommendationDecodeResult<StructuredEvidenceSummary> {
  if (!record(value)) return { ok: false, issues: [issue("research_summary_invalid", path, "Structured summary object olmalıdır.")] };
  const issues = unknownFields(value, ["aspectId", "decision", "level", "confidence", "sourceKinds", "warnings"], path);
  if (!isAspectId(value.aspectId)) issues.push(issue("research_summary_aspect_invalid", `${path}.aspectId`, "Aspect registry ID zorunludur."));
  if (!["decisive_supported", "decisive_contradicted", "partial", "unknown"].includes(String(value.decision))) issues.push(issue("research_summary_decision_invalid", `${path}.decision`, "Decision geçersiz."));
  if (value.level !== null && !["incidental", "significant", "primary"].includes(String(value.level))) issues.push(issue("research_summary_level_invalid", `${path}.level`, "Level geçersiz."));
  if (!["unknown", "low", "medium", "high"].includes(String(value.confidence))) issues.push(issue("research_summary_confidence_invalid", `${path}.confidence`, "Confidence geçersiz."));
  if (!Array.isArray(value.sourceKinds) || !Array.isArray(value.warnings)) issues.push(issue("research_summary_lists_invalid", path, "Source kind ve warnings array olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as StructuredEvidenceSummary };
}

export function decodeResearchCandidateInput(value: unknown): RecommendationDecodeResult<ResearchCandidateInput> {
  if (!record(value)) return { ok: false, issues: [issue("research_candidate_invalid", "$", "Research candidate object olmalıdır.")] };
  const issues = unknownFields(value, ["identity", "versionScope", "mediaType", "preResearchRank", "hardObjectiveEligible", "unresolvedConstraints", "structuredEvidenceSummary"], "$" );
  if (containsForbiddenResearchData(value)) issues.push(issue("research_owner_data_forbidden", "$", "Owner/private kullanıcı verisi research job contract'ına giremez."));
  const identity = decodeIdentity(value.identity, "identity");
  if (!identity.ok) issues.push(...identity.issues);
  if (!RECOMMENDATION_MEDIA_TYPES.includes(value.mediaType as never)) issues.push(issue("research_candidate_media_type_invalid", "mediaType", "Media type geçersiz."));
  if (!Number.isInteger(value.preResearchRank) || (value.preResearchRank as number) < 0) issues.push(issue("research_candidate_rank_invalid", "preResearchRank", "Pre-research rank non-negative integer olmalıdır."));
  if (typeof value.hardObjectiveEligible !== "boolean") issues.push(issue("research_candidate_objective_state_invalid", "hardObjectiveEligible", "Hard objective eligibility boolean olmalıdır."));
  if (!Array.isArray(value.unresolvedConstraints)) issues.push(issue("research_candidate_constraints_invalid", "unresolvedConstraints", "Unresolved constraints array olmalıdır."));
  else value.unresolvedConstraints.forEach((item, index) => { const result = decodeConstraint(item, `unresolvedConstraints.${index}`); if (!result.ok) issues.push(...result.issues); });
  if (!Array.isArray(value.structuredEvidenceSummary)) issues.push(issue("research_candidate_summary_invalid", "structuredEvidenceSummary", "Structured summary array olmalıdır."));
  else value.structuredEvidenceSummary.forEach((item, index) => { const result = decodeSummary(item, `structuredEvidenceSummary.${index}`); if (!result.ok) issues.push(...result.issues); });
  if (identity.ok && record(value.versionScope)) {
    const scope = validateResearchVersionScope({ identity: identity.value, scope: value.versionScope as unknown as ResearchVersionScope });
    if (!scope.ok) issues.push(...scope.issues);
    if (value.mediaType !== identity.value.mediaType) issues.push(issue("research_candidate_media_identity_mismatch", "mediaType", "Candidate media type identity ile eşleşmelidir."));
  } else if (!record(value.versionScope)) issues.push(issue("research_candidate_scope_invalid", "versionScope", "Version scope object olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as ResearchCandidateInput };
}

