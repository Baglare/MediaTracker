import type { RecommendationMediaType } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { PersistedResearchCitation, ResearchVersionScope, TransientResearchDocument } from "../domain/types";
import type { ResearchNetworkTelemetry } from "../network/telemetry";
import type { SecureResearchHttpClient } from "../network/types";

export interface ResolvedWikimediaIdentity {
  candidateCanonicalKey: string;
  versionScopeKey: string;
  wikidataEntityId: string;
  matchedPropertyId: string;
  matchedExternalId: string;
  verificationStatus: "verified";
  sitelinks: Readonly<Partial<Record<"enwiki" | "trwiki", string>>>;
  otherSitelinkKeys: readonly string[];
  entityRevisionId?: string;
  lastModified?: string;
  resolvedAt: string;
  warnings: readonly string[];
}

export interface ResolvedWikipediaPage {
  sourceId: "wikipedia";
  wikiProject: "enwiki" | "trwiki";
  language: "en" | "tr";
  wikidataEntityId: string;
  canonicalTitle: string;
  pageId: number;
  revisionId: string;
  revisionTimestamp: string;
  canonicalUrl: string;
  revisionUrl: string;
  warnings: readonly string[];
}

export interface WikipediaLanguagePolicy {
  preferredProjects: readonly ("enwiki" | "trwiki")[];
}

export type DirectSourceResearchStatus =
  | "document_ready" | "wikidata_only" | "identity_not_found" | "identity_ambiguous"
  | "identity_unverified" | "wikipedia_unavailable" | "adapter_unavailable"
  | "security_rejected" | "budget_exhausted";

export interface DirectSourceResearchTelemetry {
  network: ResearchNetworkTelemetry;
  propertyId?: string;
  identityResultCount: number;
  entityVerificationPassed: boolean;
  wikipediaSitelinkAvailable: boolean;
  revisionFetched: boolean;
  documentReady: boolean;
  identityCacheHit: boolean;
  pageCacheHit: boolean;
  coalesced: boolean;
}

export interface DirectSourceResearchResult {
  status: DirectSourceResearchStatus;
  wikimediaIdentity?: ResolvedWikimediaIdentity;
  documents: readonly TransientResearchDocument[];
  citations: readonly PersistedResearchCitation[];
  telemetry: DirectSourceResearchTelemetry;
  warnings: readonly string[];
}

export interface DirectSourceResearchInput {
  identity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  httpClient: SecureResearchHttpClient;
  languagePolicy?: WikipediaLanguagePolicy;
  now?: () => Date;
  environment?: NodeJS.ProcessEnv;
}

export interface WikidataExternalIdentityCandidate {
  registryKey: string;
  propertyId: string;
  externalId: string;
  mediaType: RecommendationMediaType;
  scopeKey: string;
}

