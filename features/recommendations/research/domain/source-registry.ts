import type { RecommendationDomainIssue } from "../../domain/types";
import type { ResearchSourceRegistryEntry } from "./types";

export const RESEARCH_SOURCE_REGISTRY_VERSION = "d7-r1.1" as const;

export const RESEARCH_SOURCE_REGISTRY = {
  wikidata: {
    sourceId: "wikidata",
    sourceClass: "structured_knowledge",
    trustTier: "high",
    allowedHosts: ["www.wikidata.org", "query.wikidata.org"],
    licenseClass: "cc0",
    permittedEvidenceUses: ["identity", "presence", "contradiction"],
    persistence: ["source_metadata", "derived_claim", "transient_passage"],
    requiresRevisionId: false,
    attributionRequired: false,
    queryable: true,
    enabled: true,
    notes: "CC0 structured identity/relation evidence; narrative centrality tek başına çıkarılmaz.",
  },
  wikipedia: {
    sourceId: "wikipedia",
    sourceClass: "encyclopedia",
    trustTier: "medium",
    allowedHosts: ["en.wikipedia.org", "tr.wikipedia.org"],
    licenseClass: "cc_by_sa",
    permittedEvidenceUses: ["presence", "centrality", "contradiction", "explicit_absence"],
    persistence: ["source_metadata", "derived_claim", "transient_passage"],
    requiresRevisionId: true,
    attributionRequired: true,
    queryable: true,
    enabled: true,
    notes: "Direct revision-bound passage; attribution zorunlu, ham uzun metin kalıcı değildir.",
  },
  official: {
    sourceId: "official",
    sourceClass: "official",
    trustTier: "high",
    allowedHosts: [],
    licenseClass: "provider_terms",
    permittedEvidenceUses: ["identity", "presence", "centrality", "contradiction", "explicit_absence"],
    persistence: ["source_metadata", "transient_passage"],
    requiresRevisionId: false,
    attributionRequired: true,
    queryable: false,
    enabled: false,
    notes: "Host ve terms audit tamamlanmadan enabled yapılamaz.",
  },
  editorial: {
    sourceId: "editorial",
    sourceClass: "editorial",
    trustTier: "medium",
    allowedHosts: [],
    licenseClass: "unknown",
    permittedEvidenceUses: ["presence", "centrality", "contradiction"],
    persistence: ["source_metadata", "transient_passage"],
    requiresRevisionId: false,
    attributionRequired: true,
    queryable: false,
    enabled: false,
    notes: "Allowlist ve storage-rights audit bekliyor.",
  },
  community_reference: {
    sourceId: "community_reference",
    sourceClass: "community_reference",
    trustTier: "low",
    allowedHosts: [],
    licenseClass: "unknown",
    permittedEvidenceUses: ["presence", "centrality", "contradiction"],
    persistence: ["transient_passage"],
    requiresRevisionId: false,
    attributionRequired: true,
    queryable: false,
    enabled: false,
    notes: "Güvenli allowlist ve terms audit olmadan evidence üretmez.",
  },
  forum: {
    sourceId: "forum",
    sourceClass: "forum",
    trustTier: "low",
    allowedHosts: [],
    licenseClass: "unknown",
    permittedEvidenceUses: ["presence", "contradiction"],
    persistence: ["transient_passage"],
    requiresRevisionId: false,
    attributionRequired: true,
    queryable: false,
    enabled: false,
    notes: "D7-R1 hard evidence kaynağı değildir.",
  },
} as const satisfies Record<string, ResearchSourceRegistryEntry>;

export type ResearchSourceId = keyof typeof RESEARCH_SOURCE_REGISTRY;

export const SEARCH_DISCOVERY_ADAPTER_IDS = ["openai_web_search", "brave_search"] as const;

export function isResearchSourceId(value: unknown): value is ResearchSourceId {
  return typeof value === "string" && Object.hasOwn(RESEARCH_SOURCE_REGISTRY, value);
}

export function isSearchDiscoveryAdapter(value: unknown): value is typeof SEARCH_DISCOVERY_ADAPTER_IDS[number] {
  return typeof value === "string" && SEARCH_DISCOVERY_ADAPTER_IDS.includes(value as never);
}

export function getResearchSource(sourceId: string): ResearchSourceRegistryEntry | null {
  return isResearchSourceId(sourceId) ? RESEARCH_SOURCE_REGISTRY[sourceId] : null;
}

export function validateResearchSourceRegistry(): { ok: true; value: typeof RESEARCH_SOURCE_REGISTRY } | { ok: false; issues: RecommendationDomainIssue[] } {
  const issues: RecommendationDomainIssue[] = [];
  const entries = Object.entries(RESEARCH_SOURCE_REGISTRY) as Array<[string, ResearchSourceRegistryEntry]>;
  for (const [key, entry] of entries) {
    if (entry.sourceId !== key) issues.push({ code: "research_source_id_mismatch", path: key, message: "Registry key ve sourceId eşleşmelidir." });
    if (entry.enabled && entry.allowedHosts.length === 0) issues.push({ code: "research_source_enabled_without_hosts", path: `${key}.allowedHosts`, message: "Enabled source allowlisted host taşımalıdır." });
    if (entry.allowedHosts.some((host) => host !== host.toLowerCase() || host.includes("*") || host.endsWith("."))) issues.push({ code: "research_source_host_invalid", path: `${key}.allowedHosts`, message: "Host lowercase exact allowlist olmalıdır." });
    if (entry.requiresRevisionId && !entry.persistence.includes("source_metadata")) issues.push({ code: "research_source_revision_metadata_required", path: `${key}.persistence`, message: "Revision isteyen source metadata persistence taşımalıdır." });
    if (isSearchDiscoveryAdapter(entry.sourceId)) issues.push({ code: "research_search_adapter_forbidden_as_source", path: key, message: "Search adapter evidence source registry girdisi olamaz." });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: RESEARCH_SOURCE_REGISTRY };
}
