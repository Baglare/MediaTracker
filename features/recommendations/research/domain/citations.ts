import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../domain/types";
import { getResearchSource, isSearchDiscoveryAdapter } from "./source-registry";
import type { PersistedResearchCitation, PersistedResearchClaim, TransientResearchDocument } from "./types";
import { validateResearchUrl } from "../security/url-policy";
import { RESEARCH_DOCUMENT_MAX_TEXT_LENGTH, RESEARCH_DOCUMENT_MAX_TITLE_LENGTH } from "../security/content-policy";

export const RESEARCH_PARAPHRASED_CLAIM_MAX_LENGTH = 280;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function iso(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateTransientResearchDocument(value: TransientResearchDocument): RecommendationDecodeResult<TransientResearchDocument> {
  const issues: RecommendationDomainIssue[] = [];
  const source = getResearchSource(value.sourceId);
  if (!source || !source.enabled || isSearchDiscoveryAdapter(value.sourceId)) issues.push(issue("research_document_source_invalid", "sourceId", "Transient document enabled underlying source kullanmalıdır."));
  const url = validateResearchUrl({ url: value.canonicalUrl, sourceId: value.sourceId });
  if (!url.ok) issues.push(issue("research_document_url_invalid", "canonicalUrl", url.reason));
  if (source?.requiresRevisionId && !value.revisionId?.trim()) issues.push(issue("research_document_revision_required", "revisionId", "Source revision ID zorunludur."));
  if (!iso(value.fetchedAt)) issues.push(issue("research_document_fetched_at_invalid", "fetchedAt", "Canonical timestamp zorunludur."));
  if (!value.title.trim() || value.title.length > RESEARCH_DOCUMENT_MAX_TITLE_LENGTH) issues.push(issue("research_document_title_invalid", "title", "Title bounded olmalıdır."));
  if (!value.boundedText.trim() || value.boundedText.length > RESEARCH_DOCUMENT_MAX_TEXT_LENGTH) issues.push(issue("research_document_text_invalid", "boundedText", "Transient text bounded olmalıdır."));
  if (!HASH_PATTERN.test(value.contentHash)) issues.push(issue("research_document_hash_invalid", "contentHash", "SHA-256 content hash zorunludur."));
  if (value.retention !== "transient_only") issues.push(issue("research_document_retention_invalid", "retention", "Raw passage yalnız transient olabilir."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

export function validatePersistedResearchCitation(value: PersistedResearchCitation): RecommendationDecodeResult<PersistedResearchCitation> {
  const issues: RecommendationDomainIssue[] = [];
  const source = getResearchSource(value.sourceId);
  if (!source || !source.enabled || isSearchDiscoveryAdapter(value.sourceId)) issues.push(issue("research_citation_source_invalid", "sourceId", "Citation enabled underlying source'a bağlanmalıdır."));
  const url = validateResearchUrl({ url: value.canonicalUrl, sourceId: value.sourceId });
  if (!url.ok) issues.push(issue("research_citation_url_invalid", "canonicalUrl", url.reason));
  if (source && value.licenseClass !== source.licenseClass) issues.push(issue("research_citation_license_mismatch", "licenseClass", "Citation license registry ile eşleşmelidir."));
  if (source?.requiresRevisionId && !value.revisionId?.trim()) issues.push(issue("research_citation_revision_required", "revisionId", "Source revision ID zorunludur."));
  if (source?.attributionRequired && !value.attribution?.trim()) issues.push(issue("research_citation_attribution_required", "attribution", "Source attribution zorunludur."));
  if (!iso(value.accessedAt)) issues.push(issue("research_citation_accessed_at_invalid", "accessedAt", "Canonical timestamp zorunludur."));
  if (value.sourceContentHash && !HASH_PATTERN.test(value.sourceContentHash)) issues.push(issue("research_citation_hash_invalid", "sourceContentHash", "Source hash SHA-256 olmalıdır."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: url.ok ? { ...value, canonicalUrl: url.canonicalUrl } : value };
}

export function validatePersistedResearchClaim(input: {
  claim: PersistedResearchClaim;
  citations: readonly PersistedResearchCitation[];
}): RecommendationDecodeResult<PersistedResearchClaim> {
  const { claim } = input;
  const issues: RecommendationDomainIssue[] = [];
  if (!claim.paraphrasedClaim.trim() || claim.paraphrasedClaim.length > RESEARCH_PARAPHRASED_CLAIM_MAX_LENGTH) issues.push(issue("research_claim_text_invalid", "paraphrasedClaim", "Paraphrased claim 1..280 karakter olmalıdır."));
  if (/<[^>]+>/.test(claim.paraphrasedClaim)) issues.push(issue("research_claim_html_forbidden", "paraphrasedClaim", "HTML claim içine giremez."));
  if (claim.polarity === "support" && claim.level === null) issues.push(issue("research_claim_support_level_required", "level", "Support claim ordinal level taşımalıdır."));
  if (claim.citationIds.length === 0) issues.push(issue("research_claim_citation_required", "citationIds", "Supported/contradicted claim citation taşımak zorundadır."));
  if (claim.extractionMethod === "grounded_llm" && claim.citationIds.length === 0) issues.push(issue("research_grounded_claim_citation_required", "citationIds", "Grounded LLM claim citation olmadan kabul edilmez."));
  if (new Set(claim.citationIds).size !== claim.citationIds.length) issues.push(issue("research_claim_citation_duplicate", "citationIds", "Citation ID listesi unique olmalıdır."));
  const citations = new Map(input.citations.map((item) => [item.citationId, item]));
  for (const citationId of claim.citationIds) {
    const citation = citations.get(citationId);
    if (!citation) issues.push(issue("research_claim_citation_missing", "citationIds", `Citation bulunamadı: ${citationId}`));
    else if (!validatePersistedResearchCitation(citation).ok) issues.push(issue("research_claim_citation_invalid", "citationIds", `Citation geçersiz: ${citationId}`));
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: claim };
}

