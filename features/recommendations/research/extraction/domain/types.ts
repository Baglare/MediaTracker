import type { AspectId } from "../../../domain/aspect-registry";
import type { EvidenceConfidence } from "../../../domain/types";
import type { PersistedResearchClaim, AspectResearchDecision } from "../../domain/types";
import type { GroundedResearchPacket, ResearchPassageSecurityFlag } from "../../passages/types";

export const GROUNDED_EXTRACTION_CONTRACT_VERSION = 1 as const;
export const GROUNDED_EXTRACTION_SCHEMA_VERSION = "d7-r3b.schema.1" as const;
export const GROUNDED_EXTRACTION_POLICY_VERSION = "d7-r3b.extract.1" as const;
export const GROUNDED_EVIDENCE_UNIT_POLICY_VERSION = "d7-r3b.unit.1" as const;
export const GROUNDED_DECISION_POLICY_VERSION = "d7-r3b.decision.1" as const;
export const GROUNDED_EXTRACTION_MAX_EVIDENCE_UNITS = 64;
export const GROUNDED_EXTRACTION_MAX_ASSESSMENTS = 8;
export const GROUNDED_EVIDENCE_UNIT_TARGET_MIN_CHARACTERS = 80;
export const GROUNDED_EVIDENCE_UNIT_TARGET_MAX_CHARACTERS = 500;
export const GROUNDED_EVIDENCE_UNIT_HARD_MAX_CHARACTERS = 700;
export const GROUNDED_EXTRACTION_MAX_RESPONSE_BYTES = 128 * 1024;

export interface GroundedAspectDefinition {
  aspectId: AspectId;
  labelEn: string;
  semanticDefinition: string;
  incidentalDefinition: string;
  significantDefinition: string;
  primaryDefinition: string;
  explicitAbsenceDefinition: string;
  limitationNotes: readonly string[];
}

export interface GroundedExtractionRequest {
  version: typeof GROUNDED_EXTRACTION_CONTRACT_VERSION;
  packet: GroundedResearchPacket;
  aspectDefinition: GroundedAspectDefinition;
  extractorPolicyVersion: typeof GROUNDED_EXTRACTION_POLICY_VERSION;
  schemaVersion: typeof GROUNDED_EXTRACTION_SCHEMA_VERSION;
  requestId: string;
  maxEvidenceUnits: number;
  maxOutputAssessments: number;
}

export interface GroundedEvidenceUnit {
  unitId: string;
  passageId: string;
  citationId: string;
  sourceId: string;
  publisherGroup: string;
  language: "en" | "tr";
  passageOrder: number;
  unitOrder: number;
  text: string;
  textHash: string;
  securityFlags: readonly ResearchPassageSecurityFlag[];
  retention: "transient_only";
}

export interface GroundedModelEvidenceUnit {
  unitId: string;
  passageId: string;
  publisherGroup: string;
  language: "en" | "tr";
  passageOrder: number;
  unitOrder: number;
  sourceTrust: "high" | "medium" | "low";
  text: string;
}

export interface GroundedExtractionModelInput {
  version: 1;
  candidateRef: "candidate-1";
  aspect: GroundedAspectDefinition;
  evidenceUnits: readonly GroundedModelEvidenceUnit[];
}

export type GroundedAssessmentFinding = "supports_presence" | "supports_explicit_absence" | "irrelevant" | "insufficient";
export type GroundedAssessmentBasis =
  | "explicit_statement"
  | "recurring_element"
  | "affects_character_decisions"
  | "affects_plot"
  | "core_premise"
  | "explicit_absence_statement"
  | "context_insufficient"
  | "unrelated_context";

export interface GroundedPassageAssessment {
  passageId: string;
  finding: GroundedAssessmentFinding;
  level: "incidental" | "significant" | "primary" | null;
  confidence: Exclude<EvidenceConfidence, "unknown">;
  evidenceUnitIds: readonly string[];
  basis: GroundedAssessmentBasis;
}

export interface GroundedExtractionModelOutput {
  version: 1;
  assessments: readonly GroundedPassageAssessment[];
}

export type GroundedExtractionProviderId = "groq" | "openai" | "openrouter";

export interface GroundedExtractionProvenance {
  providerId: GroundedExtractionProviderId;
  modelId: string;
  schemaVersion: string;
  extractorPolicyVersion: string;
  packetContentHash: string;
  extractionStartedAt: string;
  extractionCompletedAt: string;
  assessmentCount: number;
  validEvidenceUnitCount: number;
  responseStatus: "validated" | "no_claims";
  warnings: readonly string[];
}

export interface GroundedExtractionTelemetry {
  attemptedProviders: readonly GroundedExtractionProviderId[];
  requestCount: number;
  retryCount: number;
  rateLimitCount: number;
  timeoutCount: number;
  responseBytes: number;
  durationMs: number;
  evidenceUnitCount: number;
  assessmentCount: number;
  claimCount: number;
  coalescedCount: number;
  requestId?: string;
}

export type GroundedExtractionStatus =
  | "claims_extracted"
  | "no_claims_extracted"
  | "disabled"
  | "provider_unavailable"
  | "model_unsupported"
  | "budget_exhausted"
  | "output_invalid"
  | "grounding_invalid"
  | "refusal";

export interface GroundedExtractionResult {
  status: GroundedExtractionStatus;
  providerId?: GroundedExtractionProviderId;
  modelId?: string;
  assessments: readonly GroundedPassageAssessment[];
  claims: readonly PersistedResearchClaim[];
  decision?: AspectResearchDecision;
  provenance?: GroundedExtractionProvenance;
  telemetry: GroundedExtractionTelemetry;
  warnings: readonly string[];
}

