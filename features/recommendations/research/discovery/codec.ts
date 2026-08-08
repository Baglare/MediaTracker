import { isAspectId } from "../../domain/aspect-registry";
import { RECOMMENDATION_MEDIA_TYPES, type RecommendationDecodeResult, type RecommendationDomainIssue } from "../../domain/types";
import { createCandidateCanonicalKey } from "../../providers/candidate-identity";
import type { RecommendationCandidateIdentity, SecondaryIdentityKind } from "../../providers/types";
import { isResearchSourceId } from "../domain/source-registry";
import type { ResearchVersionScope } from "../domain/types";
import { validateResearchVersionScope } from "../domain/version-scope";
import { RESEARCH_DISCOVERY_CONTRACT_VERSION, type ResearchDiscoveryRequest } from "./types";

const ROOT_FIELDS = [
  "version", "candidateIdentity", "versionScope", "titleSnapshot", "releaseYear", "mediaType",
  "aspectId", "role", "minimumLevel", "allowedSourceIds", "allowedDomains", "maxSources",
  "requestId", "researchPolicyVersion",
] as const;
const IDENTITY_FIELDS = ["primaryProvider", "primaryExternalId", "mediaType", "verified", "secondaryIds", "canonicalKey", "verificationEvidence"] as const;
const SECONDARY_FIELDS = ["kind", "externalId"] as const;
const VERIFICATION_FIELDS = ["provider", "field", "externalId"] as const;
const SCOPE_FIELDS = ["version", "canonicalKey", "parentCanonicalKey", "mediaType", "sourceIdentityVerified", "scopeKey", "scopeKind", "seasonNumber", "installmentKey", "editionKey"] as const;
const FORBIDDEN_KEYS = new Set([
  "ownerid", "userid", "username", "email", "rating", "favorite", "progress", "note", "feedback",
  "personallibrary", "rawprompt", "prompt", "conversation", "conversationtext", "arbitraryquery",
  "query", "arbitraryurl", "url", "recommendationhistory",
]);
const SECONDARY_KINDS = new Set<SecondaryIdentityKind>(["imdb", "tmdb", "tvmaze", "anilist", "openlibrary_work", "openlibrary_edition", "thetvdb"]);
const PROVIDERS = new Set(["anilist", "tvmaze", "tmdb", "omdb", "openlibrary"]);
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function unknownFields(value: Record<string, unknown>, allowed: readonly string[], path: string): RecommendationDomainIssue[] {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key)).map((key) => issue("research_discovery_unknown_field", `${path}.${key}`, "Discovery contract bilinmeyen alan kabul etmez."));
}

function containsForbiddenData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenData);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => FORBIDDEN_KEYS.has(key.toLowerCase()) || containsForbiddenData(nested));
}

function decodeIdentity(value: unknown): RecommendationDecodeResult<RecommendationCandidateIdentity> {
  if (!record(value)) return { ok: false, issues: [issue("research_discovery_identity_invalid", "candidateIdentity", "Candidate identity object olmalıdır.")] };
  const issues = unknownFields(value, IDENTITY_FIELDS, "candidateIdentity");
  if (value.verified !== true) issues.push(issue("research_discovery_identity_unverified", "candidateIdentity.verified", "Discovery yalnız verified identity kabul eder."));
  if (!PROVIDERS.has(String(value.primaryProvider)) || !RECOMMENDATION_MEDIA_TYPES.includes(value.mediaType as never) || typeof value.primaryExternalId !== "string") {
    issues.push(issue("research_discovery_identity_provider_invalid", "candidateIdentity", "Provider, media type ve external ID geçerli olmalıdır."));
  }
  let expectedCanonicalKey: string | null = null;
  try {
    expectedCanonicalKey = createCandidateCanonicalKey(value.primaryProvider as never, value.mediaType as never, value.primaryExternalId as string);
  } catch {
    issues.push(issue("research_discovery_identity_external_id_invalid", "candidateIdentity.primaryExternalId", "External ID exact provider formatında olmalıdır."));
  }
  if (value.canonicalKey !== expectedCanonicalKey) issues.push(issue("research_discovery_identity_key_invalid", "candidateIdentity.canonicalKey", "Canonical key exact identity alanlarından türemelidir."));
  if (!Array.isArray(value.secondaryIds) || value.secondaryIds.length > 20) issues.push(issue("research_discovery_secondary_ids_invalid", "candidateIdentity.secondaryIds", "Secondary IDs bounded array olmalıdır."));
  else value.secondaryIds.forEach((item, index) => {
    if (!record(item)) { issues.push(issue("research_discovery_secondary_id_invalid", `candidateIdentity.secondaryIds.${index}`, "Secondary ID object olmalıdır.")); return; }
    issues.push(...unknownFields(item, SECONDARY_FIELDS, `candidateIdentity.secondaryIds.${index}`));
    if (!SECONDARY_KINDS.has(item.kind as SecondaryIdentityKind) || typeof item.externalId !== "string" || item.externalId.length === 0 || item.externalId.length > 200) {
      issues.push(issue("research_discovery_secondary_id_invalid", `candidateIdentity.secondaryIds.${index}`, "Secondary ID exact ve bounded olmalıdır."));
    }
  });
  if (!Array.isArray(value.verificationEvidence) || value.verificationEvidence.length > 20) issues.push(issue("research_discovery_verification_invalid", "candidateIdentity.verificationEvidence", "Verification evidence bounded array olmalıdır."));
  else value.verificationEvidence.forEach((item, index) => {
    if (!record(item)) { issues.push(issue("research_discovery_verification_invalid", `candidateIdentity.verificationEvidence.${index}`, "Verification evidence object olmalıdır.")); return; }
    issues.push(...unknownFields(item, VERIFICATION_FIELDS, `candidateIdentity.verificationEvidence.${index}`));
    if (!PROVIDERS.has(String(item.provider)) || typeof item.field !== "string" || !item.field || item.field.length > 80 || typeof item.externalId !== "string" || !item.externalId || item.externalId.length > 200) {
      issues.push(issue("research_discovery_verification_invalid", `candidateIdentity.verificationEvidence.${index}`, "Verification evidence exact provider alanları taşımalıdır."));
    }
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as RecommendationCandidateIdentity };
}

function decodeScope(value: unknown, identity: RecommendationCandidateIdentity | null): RecommendationDecodeResult<ResearchVersionScope> {
  if (!record(value)) return { ok: false, issues: [issue("research_discovery_scope_invalid", "versionScope", "Version scope object olmalıdır.")] };
  const issues = unknownFields(value, SCOPE_FIELDS, "versionScope");
  if (!identity) issues.push(issue("research_discovery_scope_identity_missing", "versionScope", "Scope doğrulaması için valid identity zorunludur."));
  else {
    const validated = validateResearchVersionScope({ identity, scope: value as unknown as ResearchVersionScope });
    if (!validated.ok) issues.push(...validated.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as ResearchVersionScope };
}

export function decodeResearchDiscoveryRequest(value: unknown): RecommendationDecodeResult<ResearchDiscoveryRequest> {
  if (!record(value)) return { ok: false, issues: [issue("research_discovery_request_invalid", "$", "Discovery request object olmalıdır.")] };
  const issues = unknownFields(value, ROOT_FIELDS, "$" );
  if (containsForbiddenData(value)) issues.push(issue("research_discovery_private_data_forbidden", "$", "Discovery request kişisel, prompt veya arbitrary query/URL verisi kabul etmez."));
  if (value.version !== RESEARCH_DISCOVERY_CONTRACT_VERSION) issues.push(issue("research_discovery_version_invalid", "version", "Discovery version=1 olmalıdır."));
  const identity = decodeIdentity(value.candidateIdentity);
  if (!identity.ok) issues.push(...identity.issues);
  const scope = decodeScope(value.versionScope, identity.ok ? identity.value : null);
  if (!scope.ok) issues.push(...scope.issues);
  if (typeof value.titleSnapshot !== "string" || value.titleSnapshot.trim().length === 0 || value.titleSnapshot.length > 180 || /[\u0000-\u001F\u007F]/.test(value.titleSnapshot)) {
    issues.push(issue("research_discovery_title_invalid", "titleSnapshot", "Public title snapshot non-empty, controlsüz ve en fazla 180 karakter olmalıdır."));
  }
  if (value.releaseYear !== undefined && (!Number.isInteger(value.releaseYear) || (value.releaseYear as number) < 1800 || (value.releaseYear as number) > 2200)) issues.push(issue("research_discovery_year_invalid", "releaseYear", "Release year bounded integer olmalıdır."));
  if (!RECOMMENDATION_MEDIA_TYPES.includes(value.mediaType as never)) issues.push(issue("research_discovery_media_type_invalid", "mediaType", "Media type geçersiz."));
  if (identity.ok && value.mediaType !== identity.value.mediaType) issues.push(issue("research_discovery_media_identity_mismatch", "mediaType", "Media type identity ile exact eşleşmelidir."));
  if (!isAspectId(value.aspectId)) issues.push(issue("research_discovery_aspect_invalid", "aspectId", "Registry aspect ID zorunludur."));
  if (!["must", "avoid", "prefer"].includes(String(value.role))) issues.push(issue("research_discovery_role_invalid", "role", "Role geçersiz."));
  if (value.minimumLevel !== undefined && !["incidental", "significant", "primary"].includes(String(value.minimumLevel))) issues.push(issue("research_discovery_level_invalid", "minimumLevel", "Minimum level geçersiz."));
  if (!Array.isArray(value.allowedSourceIds) || value.allowedSourceIds.length === 0 || value.allowedSourceIds.length > 8 || value.allowedSourceIds.some((id) => !isResearchSourceId(id))) {
    issues.push(issue("research_discovery_source_ids_invalid", "allowedSourceIds", "Allowed source IDs server policy registry girdileri olmalıdır."));
  }
  if (!Array.isArray(value.allowedDomains) || value.allowedDomains.length === 0 || value.allowedDomains.length > 20 || value.allowedDomains.some((domain) => typeof domain !== "string" || domain !== domain.toLowerCase() || !DOMAIN_PATTERN.test(domain))) {
    issues.push(issue("research_discovery_domains_invalid", "allowedDomains", "Allowed domains lowercase server policy token'ları olmalıdır."));
  }
  if (Array.isArray(value.allowedSourceIds) && new Set(value.allowedSourceIds).size !== value.allowedSourceIds.length) issues.push(issue("research_discovery_source_ids_duplicate", "allowedSourceIds", "Allowed source IDs unique olmalıdır."));
  if (Array.isArray(value.allowedDomains) && new Set(value.allowedDomains).size !== value.allowedDomains.length) issues.push(issue("research_discovery_domains_duplicate", "allowedDomains", "Allowed domains unique olmalıdır."));
  if (!Number.isInteger(value.maxSources) || (value.maxSources as number) < 1 || (value.maxSources as number) > 5) issues.push(issue("research_discovery_max_sources_invalid", "maxSources", "Max sources 1..5 olmalıdır."));
  if (typeof value.requestId !== "string" || !REQUEST_ID_PATTERN.test(value.requestId)) issues.push(issue("research_discovery_request_id_invalid", "requestId", "Request ID bounded ve güvenli olmalıdır."));
  if (typeof value.researchPolicyVersion !== "string" || value.researchPolicyVersion.length === 0 || value.researchPolicyVersion.length > 80) issues.push(issue("research_discovery_policy_version_invalid", "researchPolicyVersion", "Research policy version bounded olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as ResearchDiscoveryRequest };
}
