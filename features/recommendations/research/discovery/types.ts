import type { AspectId, ConstraintRole, RecommendationMediaType } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { ResearchSourceId } from "../domain/source-registry";
import type { ResearchClaimLevel, ResearchVersionScope } from "../domain/types";

export const RESEARCH_DISCOVERY_CONTRACT_VERSION = 1 as const;
export const OPENAI_WEB_DISCOVERY_ADAPTER_ID = "openai_web_search" as const;

export interface ResearchDiscoveryRequest {
  version: typeof RESEARCH_DISCOVERY_CONTRACT_VERSION;
  candidateIdentity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  titleSnapshot: string;
  releaseYear?: number;
  mediaType: RecommendationMediaType;
  aspectId: AspectId;
  role: ConstraintRole;
  minimumLevel?: Exclude<ResearchClaimLevel, null>;
  allowedSourceIds: readonly ResearchSourceId[];
  allowedDomains: readonly string[];
  maxSources: number;
  requestId: string;
  researchPolicyVersion: string;
}

export interface DiscoveredResearchSource {
  version: typeof RESEARCH_DISCOVERY_CONTRACT_VERSION;
  sourceId: ResearchSourceId;
  canonicalUrl: string;
  hostname: string;
  discoveryAdapter: typeof OPENAI_WEB_DISCOVERY_ADAPTER_ID;
  discoveryRank: number;
  discoveredAt: string;
  queryFingerprint: string;
  sourceRegistryVersion: string;
  warnings: readonly string[];
}

export interface TransientDiscoveryMetadata {
  title?: string;
  snippet?: string;
  searchActionId?: string;
  query?: string;
  retention: "request_only";
}

export type ResearchDiscoveryStatus =
  | "sources_discovered"
  | "no_source_discovered"
  | "disabled"
  | "adapter_unavailable"
  | "budget_exhausted"
  | "source_policy_blocked"
  | "invalid_request";

export interface ResearchDiscoveryTelemetry {
  requestCount: number;
  durationMs: number;
  httpStatusClass?: string;
  rateLimits: number;
  retryCount: number;
  timeouts: number;
  responseBytes: number;
  webSearchCallCount: number;
  rawSourceUrlCount: number;
  acceptedSourceCount: number;
  rejectedSourceCount: number;
  rejectedDomainCount: number;
  malformedItemCount: number;
  coalescedCount: number;
  requestId?: string;
}

export interface ResearchDiscoveryResult {
  status: ResearchDiscoveryStatus;
  sources: readonly DiscoveredResearchSource[];
  attemptedQueries: readonly string[];
  adapter: typeof OPENAI_WEB_DISCOVERY_ADAPTER_ID;
  telemetry: ResearchDiscoveryTelemetry;
  warnings: readonly string[];
}

export function emptyResearchDiscoveryTelemetry(): ResearchDiscoveryTelemetry {
  return {
    requestCount: 0,
    durationMs: 0,
    rateLimits: 0,
    retryCount: 0,
    timeouts: 0,
    responseBytes: 0,
    webSearchCallCount: 0,
    rawSourceUrlCount: 0,
    acceptedSourceCount: 0,
    rejectedSourceCount: 0,
    rejectedDomainCount: 0,
    malformedItemCount: 0,
    coalescedCount: 0,
  };
}
