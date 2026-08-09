import { isAspectId } from "../../domain/aspect-registry";
import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../domain/types";
import { RESEARCH_POLICY_VERSION } from "../cache/key";
import { validatePersistedResearchCitation, validateTransientResearchDocument } from "../domain/citations";
import { RESEARCH_SOURCE_REGISTRY_VERSION, getResearchSource } from "../domain/source-registry";
import type { ResearchVersionScope } from "../domain/types";
import { validateResearchVersionScope } from "../domain/version-scope";
import type { DiscoveredResearchSource } from "../discovery/types";
import { validateGroundedResearchPacket } from "../passages/codec";
import { RESEARCH_PACKET_HARD_MAX_CHARACTERS } from "../passages/types";
import { validateResearchUrl } from "../security/url-policy";
import {
  RESEARCH_ACQUISITION_CONTRACT_VERSION,
  RESEARCH_ACQUISITION_MAX_DOCUMENTS,
  RESEARCH_ACQUISITION_POLICY_VERSION,
  type ResearchAcquisitionResult,
  type ResearchSourceAcquisitionRequest,
} from "./types";

const ROOT_FIELDS = [
  "version", "candidateIdentity", "versionScope", "wikimediaIdentity", "aspectId", "role", "minimumLevel",
  "directDocuments", "discoveredSources", "maxDocuments", "maxPassages", "maxPacketCharacters", "requestId",
  "researchPolicyVersion", "sourceRegistryVersion", "acquisitionPolicyVersion",
] as const;
const IDENTITY_FIELDS = ["primaryProvider", "primaryExternalId", "mediaType", "verified", "secondaryIds", "canonicalKey", "verificationEvidence"] as const;
const SCOPE_FIELDS = ["version", "canonicalKey", "parentCanonicalKey", "mediaType", "sourceIdentityVerified", "scopeKey", "scopeKind", "seasonNumber", "installmentKey", "editionKey"] as const;
const WIKIMEDIA_FIELDS = [
  "candidateCanonicalKey", "versionScopeKey", "wikidataEntityId", "matchedPropertyId", "matchedExternalId",
  "verificationStatus", "sitelinks", "otherSitelinkKeys", "entityRevisionId", "lastModified", "resolvedAt", "warnings",
] as const;
const DOCUMENT_ENVELOPE_FIELDS = ["document", "citation"] as const;
const DOCUMENT_FIELDS = ["documentId", "sourceId", "canonicalUrl", "revisionId", "fetchedAt", "title", "boundedText", "contentHash", "securityFlags", "retention"] as const;
const CITATION_FIELDS = ["citationId", "sourceId", "canonicalUrl", "revisionId", "accessedAt", "sectionOrLocator", "sourceContentHash", "attribution", "licenseClass"] as const;
const DISCOVERED_FIELDS = ["version", "sourceId", "canonicalUrl", "hostname", "discoveryAdapter", "discoveryRank", "discoveredAt", "queryFingerprint", "sourceRegistryVersion", "warnings"] as const;
const FORBIDDEN_KEYS = new Set([
  "ownerid", "userid", "username", "email", "rating", "favorite", "progress", "note", "feedback", "library",
  "rawprompt", "prompt", "conversation", "searchquery", "searchqueries", "searchresponse", "snippet", "outputtext",
  "providersynthesizedoutput", "openairesponse", "groqresponse", "openrouterresponse", "arbitraryurl",
]);
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const QID = /^Q[1-9]\d*$/;
const PROPERTY_ID = /^P[1-9]\d*$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const ADAPTER_IDS = new Set(["openai_web_search", "groq_compound_web_search", "openrouter_web_search"]);

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function issue(code: string, path: string, message: string): RecommendationDomainIssue { return { code, path, message }; }
function unknownFields(value: Record<string, unknown>, allowed: readonly string[], path: string): RecommendationDomainIssue[] {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key)).map((key) => issue("research_acquisition_unknown_field", `${path}.${key}`, "Acquisition contract bilinmeyen alan kabul etmez."));
}
function containsForbiddenData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenData);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => FORBIDDEN_KEYS.has(key.toLowerCase()) || containsForbiddenData(nested));
}
function boundedStrings(value: unknown, maxItems = 32): boolean {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string" && item.length <= 240);
}

function validateWikimediaIdentity(value: unknown, candidateKey: string | undefined, scopeKey: string | undefined): RecommendationDomainIssue[] {
  if (!record(value)) return [issue("research_acquisition_wikimedia_identity_invalid", "wikimediaIdentity", "Verified Wikimedia identity object zorunludur.")];
  const issues = unknownFields(value, WIKIMEDIA_FIELDS, "wikimediaIdentity");
  if (value.verificationStatus !== "verified" || value.candidateCanonicalKey !== candidateKey || value.versionScopeKey !== scopeKey) issues.push(issue("research_acquisition_wikimedia_scope_mismatch", "wikimediaIdentity", "Wikimedia identity exact candidate/scope ile verified olmalıdır."));
  if (!QID.test(String(value.wikidataEntityId)) || !PROPERTY_ID.test(String(value.matchedPropertyId)) || typeof value.matchedExternalId !== "string" || !value.matchedExternalId) issues.push(issue("research_acquisition_wikimedia_mapping_invalid", "wikimediaIdentity", "Exact QID/property/external ID mapping zorunludur."));
  if (!record(value.sitelinks)) issues.push(issue("research_acquisition_wikimedia_sitelinks_invalid", "wikimediaIdentity.sitelinks", "Sitelinks object olmalıdır."));
  else {
    issues.push(...unknownFields(value.sitelinks, ["enwiki", "trwiki"], "wikimediaIdentity.sitelinks"));
    for (const title of Object.values(value.sitelinks)) if (typeof title !== "string" || !title || title.length > 240) issues.push(issue("research_acquisition_wikimedia_sitelink_invalid", "wikimediaIdentity.sitelinks", "Sitelink title bounded olmalıdır."));
  }
  if (!boundedStrings(value.otherSitelinkKeys) || !boundedStrings(value.warnings)) issues.push(issue("research_acquisition_wikimedia_lists_invalid", "wikimediaIdentity", "Wikimedia metadata listeleri bounded olmalıdır."));
  if (!Number.isFinite(Date.parse(String(value.resolvedAt)))) issues.push(issue("research_acquisition_wikimedia_time_invalid", "wikimediaIdentity.resolvedAt", "Resolved timestamp geçersiz."));
  return issues;
}

function validateDirectDocuments(value: unknown): RecommendationDomainIssue[] {
  if (!Array.isArray(value) || value.length > RESEARCH_ACQUISITION_MAX_DOCUMENTS) return [issue("research_acquisition_direct_documents_invalid", "directDocuments", "Direct document listesi bounded olmalıdır.")];
  const issues: RecommendationDomainIssue[] = [];
  value.forEach((item, index) => {
    if (!record(item)) { issues.push(issue("research_acquisition_direct_document_invalid", `directDocuments.${index}`, "Direct document envelope object olmalıdır.")); return; }
    issues.push(...unknownFields(item, DOCUMENT_ENVELOPE_FIELDS, `directDocuments.${index}`));
    if (!record(item.document) || !record(item.citation)) { issues.push(issue("research_acquisition_direct_relation_invalid", `directDocuments.${index}`, "Document ve citation zorunludur.")); return; }
    issues.push(...unknownFields(item.document, DOCUMENT_FIELDS, `directDocuments.${index}.document`));
    issues.push(...unknownFields(item.citation, CITATION_FIELDS, `directDocuments.${index}.citation`));
    const document = item.document as never;
    const citation = item.citation as never;
    if (!validateTransientResearchDocument(document).ok || !validatePersistedResearchCitation(citation).ok) issues.push(issue("research_acquisition_direct_payload_invalid", `directDocuments.${index}`, "R2A document/citation codec doğrulaması başarısız."));
    const typedDocument = item.document as { sourceId?: unknown; revisionId?: unknown; contentHash?: unknown };
    const typedCitation = item.citation as { sourceId?: unknown; revisionId?: unknown; sourceContentHash?: unknown };
    if (typedDocument.sourceId !== typedCitation.sourceId || typedDocument.revisionId !== typedCitation.revisionId || typedDocument.contentHash !== typedCitation.sourceContentHash) issues.push(issue("research_acquisition_direct_citation_mismatch", `directDocuments.${index}`, "Document/citation source, revision ve hash ilişkisi exact olmalıdır."));
  });
  return issues;
}

function validateDiscoveredSources(value: unknown): RecommendationDomainIssue[] {
  if (!Array.isArray(value) || value.length > 5) return [issue("research_acquisition_discovered_sources_invalid", "discoveredSources", "Discovered source listesi bounded olmalıdır.")];
  const issues: RecommendationDomainIssue[] = [];
  value.forEach((item, index) => {
    if (!record(item)) { issues.push(issue("research_acquisition_discovered_source_invalid", `discoveredSources.${index}`, "Discovered source object olmalıdır.")); return; }
    issues.push(...unknownFields(item, DISCOVERED_FIELDS, `discoveredSources.${index}`));
    const source = item as unknown as DiscoveredResearchSource;
    const registry = getResearchSource(String(item.sourceId));
    const url = validateResearchUrl({ url: String(item.canonicalUrl ?? ""), sourceId: String(item.sourceId ?? "") });
    if (item.version !== 1 || !registry?.enabled || item.sourceId !== "wikipedia" || item.sourceRegistryVersion !== RESEARCH_SOURCE_REGISTRY_VERSION || !url.ok) issues.push(issue("research_acquisition_discovered_policy_invalid", `discoveredSources.${index}`, "Discovered source enabled Wikipedia registry ve URL policy'den geçmelidir."));
    if (url.ok && (item.hostname !== url.normalizedHost || item.canonicalUrl !== url.canonicalUrl)) issues.push(issue("research_acquisition_discovered_canonical_mismatch", `discoveredSources.${index}`, "Discovered URL/hostname canonical olmalıdır."));
    if (!ADAPTER_IDS.has(String(item.discoveryAdapter)) || !Number.isInteger(item.discoveryRank) || (item.discoveryRank as number) < 0 || !Number.isFinite(Date.parse(String(item.discoveredAt))) || !HASH.test(String(item.queryFingerprint)) || !boundedStrings(item.warnings)) issues.push(issue("research_acquisition_discovered_metadata_invalid", `discoveredSources.${index}`, "Discovered source ephemeral metadata geçersiz."));
    void source;
  });
  return issues;
}

export function decodeResearchSourceAcquisitionRequest(value: unknown): RecommendationDecodeResult<ResearchSourceAcquisitionRequest> {
  if (!record(value)) return { ok: false, issues: [issue("research_acquisition_request_invalid", "$", "Acquisition request object olmalıdır.")] };
  const issues = unknownFields(value, ROOT_FIELDS, "$" );
  if (containsForbiddenData(value)) issues.push(issue("research_acquisition_private_or_search_data_forbidden", "$", "Kişisel/search/provider payload acquisition request'e giremez."));
  if (value.version !== RESEARCH_ACQUISITION_CONTRACT_VERSION) issues.push(issue("research_acquisition_version_invalid", "version", "Acquisition version=1 olmalıdır."));
  if (!record(value.candidateIdentity)) issues.push(issue("research_acquisition_identity_invalid", "candidateIdentity", "Candidate identity object olmalıdır."));
  else issues.push(...unknownFields(value.candidateIdentity, IDENTITY_FIELDS, "candidateIdentity"));
  if (!record(value.versionScope)) issues.push(issue("research_acquisition_scope_invalid", "versionScope", "Version scope object olmalıdır."));
  else issues.push(...unknownFields(value.versionScope, SCOPE_FIELDS, "versionScope"));
  if (record(value.candidateIdentity) && record(value.versionScope)) {
    const scope = validateResearchVersionScope({ identity: value.candidateIdentity as never, scope: value.versionScope as unknown as ResearchVersionScope });
    if (!scope.ok) issues.push(...scope.issues);
  }
  issues.push(...validateWikimediaIdentity(value.wikimediaIdentity, record(value.candidateIdentity) ? String(value.candidateIdentity.canonicalKey) : undefined, record(value.versionScope) ? String(value.versionScope.scopeKey) : undefined));
  if (!isAspectId(value.aspectId)) issues.push(issue("research_acquisition_aspect_invalid", "aspectId", "Registry aspect ID zorunludur."));
  if (!['must', 'avoid', 'prefer'].includes(String(value.role))) issues.push(issue("research_acquisition_role_invalid", "role", "Role geçersiz."));
  if (value.minimumLevel !== undefined && !["incidental", "significant", "primary"].includes(String(value.minimumLevel))) issues.push(issue("research_acquisition_level_invalid", "minimumLevel", "Minimum level geçersiz."));
  issues.push(...validateDirectDocuments(value.directDocuments));
  issues.push(...validateDiscoveredSources(value.discoveredSources));
  if (!Number.isInteger(value.maxDocuments) || (value.maxDocuments as number) < 1 || (value.maxDocuments as number) > RESEARCH_ACQUISITION_MAX_DOCUMENTS) issues.push(issue("research_acquisition_max_documents_invalid", "maxDocuments", "Max documents 1..2 olmalıdır."));
  if (!Number.isInteger(value.maxPassages) || (value.maxPassages as number) < 1 || (value.maxPassages as number) > 8) issues.push(issue("research_acquisition_max_passages_invalid", "maxPassages", "Max passages 1..8 olmalıdır."));
  if (!Number.isInteger(value.maxPacketCharacters) || (value.maxPacketCharacters as number) < 250 || (value.maxPacketCharacters as number) > RESEARCH_PACKET_HARD_MAX_CHARACTERS) issues.push(issue("research_acquisition_packet_budget_invalid", "maxPacketCharacters", "Packet character budget 250..12000 olmalıdır."));
  if (typeof value.requestId !== "string" || !REQUEST_ID.test(value.requestId)) issues.push(issue("research_acquisition_request_id_invalid", "requestId", "Request ID bounded olmalıdır."));
  if (value.researchPolicyVersion !== RESEARCH_POLICY_VERSION || value.sourceRegistryVersion !== RESEARCH_SOURCE_REGISTRY_VERSION || value.acquisitionPolicyVersion !== RESEARCH_ACQUISITION_POLICY_VERSION) issues.push(issue("research_acquisition_policy_version_invalid", "$", "Research/source/acquisition policy version exact olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as ResearchSourceAcquisitionRequest };
}

export function validateResearchAcquisitionResult(value: ResearchAcquisitionResult): RecommendationDecodeResult<ResearchAcquisitionResult> {
  const issues: RecommendationDomainIssue[] = [];
  if (value.status === "packet_ready") {
    if (!value.packet || !validateGroundedResearchPacket(value.packet).ok) issues.push(issue("research_acquisition_packet_invalid", "packet", "packet_ready valid packet gerektirir."));
  } else if (value.packet) issues.push(issue("research_acquisition_unexpected_packet", "packet", "Başarısız acquisition packet taşıyamaz."));
  if (Object.hasOwn(value as object, "claims") || Object.hasOwn(value as object, "decision") || Object.hasOwn(value as object, "confidence") || Object.hasOwn(value as object, "level")) issues.push(issue("research_acquisition_semantic_output_forbidden", "$", "R3A claim/decision/confidence/level üretmez."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

