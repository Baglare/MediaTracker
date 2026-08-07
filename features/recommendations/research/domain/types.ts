import type { AspectId, ConstraintRole, ConstraintSource, EvidenceConfidence, RecommendationMediaType } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";

export const RESEARCH_CONTRACT_VERSION = 1 as const;

export type ResearchScopeKind = "work" | "season" | "installment" | "edition";

interface ResearchVersionScopeBase {
  version: typeof RESEARCH_CONTRACT_VERSION;
  canonicalKey: string;
  parentCanonicalKey?: string;
  mediaType: RecommendationMediaType;
  sourceIdentityVerified: true;
  scopeKey: string;
}

export type ResearchVersionScope =
  | (ResearchVersionScopeBase & { scopeKind: "work" })
  | (ResearchVersionScopeBase & { scopeKind: "season"; seasonNumber: number })
  | (ResearchVersionScopeBase & { scopeKind: "installment"; installmentKey: string })
  | (ResearchVersionScopeBase & { scopeKind: "edition"; editionKey: string });

export type ResearchSourceClass =
  | "structured_knowledge"
  | "encyclopedia"
  | "official"
  | "editorial"
  | "community_reference"
  | "forum";

export type ResearchTrustTier = "high" | "medium" | "low";
export type ResearchLicenseClass = "cc0" | "cc_by_sa" | "provider_terms" | "unknown";
export type PermittedEvidenceUse = "identity" | "presence" | "centrality" | "contradiction" | "explicit_absence";
export type ResearchPersistenceClass = "source_metadata" | "derived_claim" | "transient_passage";

export interface ResearchSourceRegistryEntry {
  sourceId: string;
  sourceClass: ResearchSourceClass;
  trustTier: ResearchTrustTier;
  allowedHosts: readonly string[];
  licenseClass: ResearchLicenseClass;
  permittedEvidenceUses: readonly PermittedEvidenceUse[];
  persistence: readonly ResearchPersistenceClass[];
  requiresRevisionId: boolean;
  attributionRequired: boolean;
  queryable: boolean;
  enabled: boolean;
  notes: string;
}

export type ResearchDocumentSecurityFlag =
  | "prompt_injection_detected"
  | "script_or_html_detected"
  | "oversized_content"
  | "unsupported_language"
  | "source_identity_mismatch";

export interface TransientResearchDocument {
  documentId: string;
  sourceId: string;
  canonicalUrl: string;
  revisionId?: string;
  fetchedAt: string;
  title: string;
  boundedText: string;
  contentHash: string;
  securityFlags: readonly ResearchDocumentSecurityFlag[];
  retention: "transient_only";
}

export interface PersistedResearchCitation {
  citationId: string;
  sourceId: string;
  canonicalUrl: string;
  revisionId?: string;
  accessedAt: string;
  sectionOrLocator?: string;
  sourceContentHash?: string;
  attribution?: string;
  licenseClass: ResearchLicenseClass;
}

export type ResearchClaimPolarity = "support" | "contradict";
export type ResearchClaimLevel = "incidental" | "significant" | "primary" | null;
export type ResearchExtractionMethod = "deterministic_structured" | "grounded_llm" | "manual_review";

export interface PersistedResearchClaim {
  claimId: string;
  aspectId: AspectId;
  polarity: ResearchClaimPolarity;
  level: ResearchClaimLevel;
  confidence: Exclude<EvidenceConfidence, "unknown">;
  paraphrasedClaim: string;
  citationIds: readonly string[];
  extractionMethod: ResearchExtractionMethod;
  extractionPolicyVersion: string;
  warnings: readonly string[];
}

export type AspectResearchDecisionStatus = "supported" | "contradicted" | "unknown";
export type ResearchDecisionConfidence = "low" | "medium" | "high" | "none";
export type ResearchDecisionReasonCode =
  | "structured_evidence_sufficient"
  | "direct_source_support"
  | "multi_source_support"
  | "combined_evidence_support"
  | "explicit_source_contradiction"
  | "multi_source_contradiction"
  | "no_source_found"
  | "source_not_allowed"
  | "source_quality_insufficient"
  | "conflicting_sources"
  | "passage_insufficient"
  | "budget_exhausted"
  | "adapter_unavailable"
  | "unsupported_aspect"
  | "version_scope_unresolved";

export interface AspectResearchDecision {
  version: typeof RESEARCH_CONTRACT_VERSION;
  versionScope: ResearchVersionScope;
  aspectId: AspectId;
  status: AspectResearchDecisionStatus;
  level: ResearchClaimLevel;
  confidence: ResearchDecisionConfidence;
  supportingClaimIds: readonly string[];
  contradictingClaimIds: readonly string[];
  sourceCount: number;
  independentSourceCount: number;
  decisionPolicyVersion: string;
  reasonCode: ResearchDecisionReasonCode;
  researchedAt: string;
  expiresAt: string;
  warnings: readonly string[];
}

export type AspectStructuredDecision = "decisive_supported" | "decisive_contradicted" | "partial" | "unknown";

export interface ResearchConstraintRequest {
  aspectId: AspectId;
  role: ConstraintRole;
  minimumLevel?: Exclude<ResearchClaimLevel, null>;
  source: ConstraintSource;
  currentStructuredDecision: AspectStructuredDecision;
  unresolvedReason: string;
}

export interface StructuredEvidenceSummary {
  aspectId: AspectId;
  decision: AspectStructuredDecision;
  level: ResearchClaimLevel;
  confidence: EvidenceConfidence;
  sourceKinds: readonly string[];
  warnings: readonly string[];
}

export interface ResearchCandidateInput {
  identity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  mediaType: RecommendationMediaType;
  preResearchRank: number;
  hardObjectiveEligible: boolean;
  unresolvedConstraints: readonly ResearchConstraintRequest[];
  structuredEvidenceSummary: readonly StructuredEvidenceSummary[];
}

export type StructuredResearchDecision = "sufficient" | "partial" | "unavailable";
export type AspectResearchMode = "none" | "fallback" | "required_for_hard_decision" | "unsupported";
export type AspectResearchValue = "presence" | "centrality" | "contradiction" | "absence";
export type ResearchRiskLevel = "low" | "medium" | "high";

export interface AspectResearchCapability {
  aspectId: AspectId;
  structuredDecision: StructuredResearchDecision;
  researchMode: AspectResearchMode;
  researchValue: AspectResearchValue;
  allowedSourceClasses: readonly ResearchSourceClass[];
  canResearchMust: boolean;
  canResearchAvoid: boolean;
  canResearchPrefer: boolean;
  riskLevel: ResearchRiskLevel;
  limitationReason: string;
}

export interface ResearchBudget {
  maxCandidates: number;
  maxAspectsPerCandidate: number;
  maxResearchJobs: number;
  maxExternalSearchOperations: number;
  maxConcurrentOperations: number;
  totalTimeoutMs: number;
}

export interface ResearchJobBudget {
  maxExternalSearchOperations: 0 | 1;
  maxDirectSources: number;
  timeoutMs: number;
}

export interface ResearchEvidenceCacheKey {
  key: string;
  scopeKey: string;
  aspectId: AspectId;
  researchPolicyVersion: string;
  sourceRegistryVersion: string;
  extractionPolicyVersion: string;
}

export interface ResearchJob {
  jobId: string;
  candidateScope: ResearchVersionScope;
  aspectId: AspectId;
  role: ConstraintRole;
  minimumLevel?: Exclude<ResearchClaimLevel, null>;
  priority: number;
  sourceClasses: readonly ResearchSourceClass[];
  budget: ResearchJobBudget;
  cacheKey: ResearchEvidenceCacheKey;
  researchPolicyVersion: string;
}

export type ResearchPlanSkipReason =
  | "candidate_budget_exceeded"
  | "aspect_budget_exceeded"
  | "job_budget_exceeded"
  | "structured_evidence_decisive"
  | "invalid_identity_scope"
  | "hard_objective_rejected"
  | "unsupported_capability"
  | "profile_research_disabled"
  | "duplicate_candidate_aspect";

export interface ResearchPlanSkippedItem {
  scopeKey?: string;
  aspectId?: AspectId;
  reason: ResearchPlanSkipReason;
  detail: string;
}

export interface ResearchPlan {
  version: typeof RESEARCH_CONTRACT_VERSION;
  jobs: readonly ResearchJob[];
  skipped: readonly ResearchPlanSkippedItem[];
  budget: ResearchBudget;
  estimatedOperations: number;
  warnings: readonly string[];
  policyVersion: string;
}

export type ResearchCacheStatus = "fresh" | "stale" | "refreshed";

export interface ResearchEvidenceCacheEntry {
  key: ResearchEvidenceCacheKey;
  decision: AspectResearchDecision;
  claims: readonly PersistedResearchClaim[];
  citations: readonly PersistedResearchCitation[];
  createdAt: string;
  expiresAt: string;
  sourceRevisionFingerprint: string;
  cacheStatus: ResearchCacheStatus;
  warnings: readonly string[];
}

export type ResearchRunStatus = "not_planned" | "planned" | "partial" | "complete" | "unavailable";

export interface ResearchEvidenceHandoff {
  candidateIdentity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  aspectDecisions: readonly AspectResearchDecision[];
  claims: readonly PersistedResearchClaim[];
  citations: readonly PersistedResearchCitation[];
  unresolvedAspects: readonly AspectId[];
  researchStatus: ResearchRunStatus;
  cacheMetadata: readonly Pick<ResearchEvidenceCacheEntry, "key" | "createdAt" | "expiresAt" | "cacheStatus" | "sourceRevisionFingerprint">[];
}

