import type { AspectId, ConstraintRole } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { ResolvedWikimediaIdentity } from "../adapters/types";
import type { ResearchSourceId } from "../domain/source-registry";
import type { PersistedResearchCitation, ResearchClaimLevel, ResearchVersionScope, TransientResearchDocument } from "../domain/types";
import type { DiscoveredResearchSource } from "../discovery/types";
import type { GroundedResearchPacket, PassageBuildTelemetry } from "../passages/types";

export const RESEARCH_ACQUISITION_CONTRACT_VERSION = 1 as const;
export const RESEARCH_ACQUISITION_POLICY_VERSION = "d7-r3a.acquire.1" as const;
export const RESEARCH_ACQUISITION_MAX_DOCUMENTS = 2;
export const RESEARCH_ACQUISITION_MAX_NETWORK_OPERATIONS = 2;
export const RESEARCH_ACQUISITION_OPERATION_TIMEOUT_MS = 8_000;

export interface DirectResearchDocumentInput {
  document: TransientResearchDocument;
  citation: PersistedResearchCitation;
}

export interface ResearchSourceAcquisitionRequest {
  version: typeof RESEARCH_ACQUISITION_CONTRACT_VERSION;
  candidateIdentity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  wikimediaIdentity: ResolvedWikimediaIdentity;
  aspectId: AspectId;
  role: ConstraintRole;
  minimumLevel?: Exclude<ResearchClaimLevel, null>;
  directDocuments: readonly DirectResearchDocumentInput[];
  discoveredSources: readonly DiscoveredResearchSource[];
  maxDocuments: number;
  maxPassages: number;
  maxPacketCharacters: number;
  requestId: string;
  researchPolicyVersion: string;
  sourceRegistryVersion: string;
  acquisitionPolicyVersion: typeof RESEARCH_ACQUISITION_POLICY_VERSION;
}

export type ResearchAcquisitionStatus =
  | "packet_ready"
  | "no_eligible_source"
  | "source_identity_mismatch"
  | "version_scope_unresolved"
  | "source_policy_blocked"
  | "security_rejected"
  | "adapter_unavailable"
  | "budget_exhausted"
  | "passage_insufficient";

export interface AcquiredResearchSource {
  sourceId: ResearchSourceId;
  canonicalUrl: string;
  language: "en" | "tr";
  wikidataEntityId: string;
  pageId: number;
  revisionId: string;
  documentId: string;
  contentHash: string;
  acquisitionKind: "direct" | "discovered";
}

export interface RejectedResearchSource {
  sourceId?: string;
  canonicalUrl?: string;
  reason: string;
}

export interface ResearchAcquisitionTelemetry extends PassageBuildTelemetry {
  directInputCount: number;
  discoveredInputCount: number;
  acceptedUrlCount: number;
  rejectedUrlCount: number;
  registryRejectCount: number;
  qidMatchCount: number;
  qidMismatchCount: number;
  missingPageCount: number;
  disambiguationCount: number;
  revisionResultCount: number;
  networkAcquisitionCount: number;
  acquisitionDurationMs: number;
  cacheHitCount: number;
  coalescedCount: number;
}

export interface ResearchAcquisitionResult {
  status: ResearchAcquisitionStatus;
  packet?: GroundedResearchPacket;
  acquiredSources: readonly AcquiredResearchSource[];
  rejectedSources: readonly RejectedResearchSource[];
  telemetry: ResearchAcquisitionTelemetry;
  warnings: readonly string[];
}

