import { containsForbiddenResearchData } from "../domain/codec";
import { validatePersistedResearchCitation, validatePersistedResearchClaim } from "../domain/citations";
import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../domain/types";
import type { ResearchEvidenceCacheEntry } from "../domain/types";

export type ResearchCachePolicyClass = "direct_source_long" | "unknown_short" | "not_cacheable";

const FORBIDDEN_PERSISTED_FIELDS = new Set([
  "boundedText", "documentId", "retention", "searchResult", "searchResults", "snippet",
  "searchQuery", "searchQueries", "query", "outputText", "searchActionId", "discoveredSource",
  "discoveredSources", "discoveryResult", "openaiResponse", "braveResponse", "fullWikipediaText",
  "transientDocument", "rawPassage", "groqResponse", "openrouterResponse", "providerResponse",
  "tavilyMetadata", "exaMetadata", "providerSynthesizedAnswer", "highlight", "responseId",
  "packet", "passages", "passageText", "groundedResearchPacket", "normalizedText",
  "normalizedDocument", "packetContentHash", "researchPassagePacket",
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
  if (entry.decision.status === "unknown" && ["adapter_unavailable", "budget_exhausted"].includes(entry.decision.reasonCode)) return "not_cacheable";
  if (entry.decision.status === "unknown") return "unknown_short";
  return "direct_source_long";
}

export function validateResearchEvidenceCacheEntry(entry: ResearchEvidenceCacheEntry): RecommendationDecodeResult<ResearchEvidenceCacheEntry> {
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
  if (researchCachePolicyClass(entry) === "not_cacheable") issues.push(issue("research_cache_adapter_error_not_cacheable", "decision.reasonCode", "Adapter/budget failure negative-cache edilmez."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: entry };
}
