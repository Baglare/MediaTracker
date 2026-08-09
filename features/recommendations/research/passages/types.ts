import type { AspectId, ConstraintRole } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { PersistedResearchCitation, ResearchClaimLevel, ResearchVersionScope } from "../domain/types";
import type { ResearchSourceId } from "../domain/source-registry";

export const RESEARCH_PASSAGE_POLICY_VERSION = "d7-r3a.passage.1" as const;
export const RESEARCH_PASSAGE_TARGET_MIN_CHARACTERS = 250;
export const RESEARCH_PASSAGE_TARGET_MAX_CHARACTERS = 1_200;
export const RESEARCH_PASSAGE_HARD_MAX_CHARACTERS = 1_500;
export const RESEARCH_PACKET_DEFAULT_MAX_CHARACTERS = 10_000;
export const RESEARCH_PACKET_HARD_MAX_CHARACTERS = 12_000;
export const RESEARCH_PACKET_DEFAULT_MAX_PASSAGES = 8;

export type ResearchPassageSecurityFlag =
  | "instruction_like_text"
  | "prompt_injection_pattern"
  | "role_marker_pattern"
  | "tool_call_pattern"
  | "encoded_payload_pattern"
  | "script_or_html_detected"
  | "oversized_fragment"
  | "malformed_unicode"
  | "source_identity_mismatch";

export type ResearchPassageSelectionReason =
  | "lead_coverage"
  | "lexical_relevance"
  | "distributed_coverage";

export interface GroundedResearchPacketDocument {
  documentId: string;
  sourceId: ResearchSourceId;
  canonicalUrl: string;
  language: "en" | "tr";
  wikidataEntityId: string;
  pageId: number;
  revisionId: string;
  title: string;
  contentHash: string;
  normalizedCharacterCount: number;
  securityFlags: readonly ResearchPassageSecurityFlag[];
  retention: "transient_only";
}

export interface GroundedResearchPassage {
  passageId: string;
  documentId: string;
  citationId: string;
  sourceId: ResearchSourceId;
  language: "en" | "tr";
  pageId: number;
  revisionId: string;
  order: number;
  startOffset: number;
  endOffset: number;
  text: string;
  textHash: string;
  selectionReason: ResearchPassageSelectionReason;
  matchedAspectTerms: readonly string[];
  securityFlags: readonly ResearchPassageSecurityFlag[];
  retention: "transient_only";
}

export interface GroundedResearchPacket {
  version: 1;
  candidateIdentity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  aspectId: AspectId;
  role: ConstraintRole;
  minimumLevel?: Exclude<ResearchClaimLevel, null>;
  documents: readonly GroundedResearchPacketDocument[];
  citations: readonly PersistedResearchCitation[];
  passages: readonly GroundedResearchPassage[];
  sourceCount: number;
  publisherCount: number;
  packetContentHash: string;
  createdAt: string;
  retention: "transient_only";
  warnings: readonly string[];
  securityFlags: readonly ResearchPassageSecurityFlag[];
  acquisitionPolicyVersion: string;
  passagePolicyVersion: typeof RESEARCH_PASSAGE_POLICY_VERSION;
}

export interface ResearchPacketDocumentInput {
  documentId: string;
  sourceId: ResearchSourceId;
  canonicalUrl: string;
  language: "en" | "tr";
  wikidataEntityId: string;
  pageId: number;
  revisionId: string;
  title: string;
  text: string;
  citation: PersistedResearchCitation;
}

export interface PassageBuildTelemetry {
  documentBytes: number;
  normalizedCharacters: number;
  segmentCount: number;
  lexicalPassageCount: number;
  coveragePassageCount: number;
  injectionFlagCount: number;
  packetCharacters: number;
}

