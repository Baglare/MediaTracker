import { containsForbiddenResearchData } from "../domain/codec";
import { validatePersistedResearchCitation, validatePersistedResearchClaim } from "../domain/citations";
import { validateGroundedExtractionProvenance } from "../extraction/domain/provenance";
import type { GroundedExtractionProvenance } from "../extraction/domain/types";
import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../domain/types";
import type { ResearchEvidenceCacheEntry } from "../domain/types";

export type ResearchCachePolicyClass = "direct_source_long" | "unknown_short" | "not_cacheable";

export const RESEARCH_EVIDENCE_CACHE_MAX_ENTRIES = 256;
export const RESEARCH_EVIDENCE_CACHE_DIRECT_TTL_MS = 6 * 60 * 60 * 1_000;
export const RESEARCH_EVIDENCE_CACHE_UNKNOWN_TTL_MS = 15 * 60 * 1_000;

const FORBIDDEN_PERSISTED_FIELDS = new Set([
  "boundedText", "documentId", "retention", "searchResult", "searchResults", "snippet",
  "searchQuery", "searchQueries", "query", "outputText", "searchActionId", "discoveredSource",
  "discoveredSources", "discoveryResult", "openaiResponse", "braveResponse", "fullWikipediaText",
  "transientDocument", "rawPassage", "groqResponse", "openrouterResponse", "providerResponse",
  "tavilyMetadata", "exaMetadata", "providerSynthesizedAnswer", "highlight", "responseId",
  "packet", "passages", "passageText", "groundedResearchPacket", "normalizedText",
  "normalizedDocument", "researchPassagePacket", "evidenceUnit", "evidenceUnits", "modelInput",
  "modelOutput", "rawModelResponse", "rawPrompt", "systemInstruction", "reasoning", "chainOfThought",
  "rawResponse", "rawNetworkError", "providerError",
]);

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function containsTransientPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsTransientPayload);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => FORBIDDEN_PERSISTED_FIELDS.has(key) || containsTransientPayload(nested));
}

export function researchCachePolicyClass(entry: ResearchEvidenceCacheEntry): ResearchCachePolicyClass {
  if (entry.decision.status === "unknown" && entry.decision.reasonCode !== "passage_insufficient") return "not_cacheable";
  if (entry.decision.status === "unknown") return "unknown_short";
  return "direct_source_long";
}

export function researchCacheTtlMs(policyClass: Exclude<ResearchCachePolicyClass, "not_cacheable">): number {
  return policyClass === "unknown_short" ? RESEARCH_EVIDENCE_CACHE_UNKNOWN_TTL_MS : RESEARCH_EVIDENCE_CACHE_DIRECT_TTL_MS;
}

export function validateResearchEvidenceCacheEntry(entry: ResearchEvidenceCacheEntry & { extractionProvenance?: GroundedExtractionProvenance }): RecommendationDecodeResult<ResearchEvidenceCacheEntry & { extractionProvenance?: GroundedExtractionProvenance }> {
  const issues: RecommendationDomainIssue[] = [];
  if (containsForbiddenResearchData(entry)) issues.push(issue("research_cache_owner_data_forbidden", "$", "Owner/private data research cache'e giremez."));
  if (containsTransientPayload(entry)) issues.push(issue("research_cache_transient_payload_forbidden", "$", "Raw passage/search response cache value içinde bulunamaz."));
  if (entry.key.scopeKey !== entry.decision.versionScope.scopeKey || entry.key.aspectId !== entry.decision.aspectId) issues.push(issue("research_cache_key_decision_mismatch", "key", "Cache key exact scope/aspect decision ile eşleşmelidir."));
  if (!Number.isFinite(Date.parse(entry.createdAt)) || !Number.isFinite(Date.parse(entry.expiresAt)) || Date.parse(entry.expiresAt) <= Date.parse(entry.createdAt)) issues.push(issue("research_cache_time_invalid", "expiresAt", "Cache timestamps canonical ve artan olmalıdır."));
  if (entry.decision.expiresAt !== entry.expiresAt) issues.push(issue("research_cache_decision_expiry_mismatch", "expiresAt", "Cache ve decision expiry eşleşmelidir."));
  if (!entry.sourceRevisionFingerprint.trim() || entry.sourceRevisionFingerprint.length > 240) issues.push(issue("research_cache_revision_fingerprint_invalid", "sourceRevisionFingerprint", "Bounded source revision fingerprint zorunludur."));
  const citationIds = new Set<string>();
  for (const citation of entry.citations) {
    if (citationIds.has(citation.citationId)) issues.push(issue("research_cache_citation_duplicate", "citations", "Citation IDs unique olmalıdır."));
    citationIds.add(citation.citationId);
    const result = validatePersistedResearchCitation(citation);
    if (!result.ok) issues.push(...result.issues);
  }
  const claimIds = new Set<string>();
  for (const claim of entry.claims) {
    if (claimIds.has(claim.claimId)) issues.push(issue("research_cache_claim_duplicate", "claims", "Claim IDs unique olmalıdır."));
    claimIds.add(claim.claimId);
    const result = validatePersistedResearchClaim({ claim, citations: entry.citations });
    if (!result.ok) issues.push(...result.issues);
  }
  if (entry.extractionProvenance) {
    const provenance = validateGroundedExtractionProvenance(entry.extractionProvenance);
    if (!provenance.ok) issues.push(...provenance.issues);
  }
  if ((entry.decision.status === "supported" || entry.decision.status === "contradicted") && (entry.claims.length === 0 || entry.citations.length === 0 || !entry.extractionProvenance)) {
    issues.push(issue("research_cache_validated_evidence_required", "$", "Supported/contradicted cache entry claim, citation ve extraction provenance ister."));
  }
  if (entry.decision.status === "contradicted" && !entry.claims.some((claim) => claim.polarity === "contradict")) {
    issues.push(issue("research_cache_explicit_absence_required", "claims", "Contradicted cache entry explicit-absence contradiction claim ister."));
  }
  if (entry.decision.status === "unknown" && entry.claims.length > 0) {
    issues.push(issue("research_cache_unknown_claim_forbidden", "claims", "Unknown cache entry claim taşıyamaz."));
  }
  if (researchCachePolicyClass(entry) === "not_cacheable") issues.push(issue("research_cache_adapter_error_not_cacheable", "decision.reasonCode", "Adapter/budget failure negative-cache edilmez."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: entry };
}
