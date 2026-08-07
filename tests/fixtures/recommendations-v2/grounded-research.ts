import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import {
  buildResearchEvidenceCacheKey,
  createResearchVersionScope,
  type AspectResearchDecision,
  type PersistedResearchCitation,
  type PersistedResearchClaim,
  type ResearchCandidateInput,
  type ResearchConstraintRequest,
  type ResearchVersionScope,
} from "@/features/recommendations/research";
import type { AspectId, RecommendationMediaType, RecommendationProvider } from "@/features/recommendations/domain";

export const TEST_NOW = "2026-08-08T10:00:00.000Z";
export const TEST_EXPIRY = "2026-08-09T10:00:00.000Z";
export const TEST_HASH = `sha256:${"a".repeat(64)}`;

export function researchIdentity(input: {
  provider?: RecommendationProvider;
  externalId?: string;
  mediaType?: RecommendationMediaType;
  editionId?: string;
} = {}) {
  const provider = input.provider ?? "anilist";
  const mediaType = input.mediaType ?? "anime";
  const externalId = input.externalId ?? "9253";
  return createVerifiedCandidateIdentity({
    primaryProvider: provider,
    primaryExternalId: externalId,
    mediaType,
    secondaryIds: input.editionId ? [{ kind: "openlibrary_edition", externalId: input.editionId }] : [],
  });
}

export function workScope(identity = researchIdentity()): ResearchVersionScope {
  return createResearchVersionScope({ identity, scopeKind: "work" });
}

export function wikipediaCitation(overrides: Partial<PersistedResearchCitation> = {}): PersistedResearchCitation {
  return {
    citationId: "citation-wikipedia-1",
    sourceId: "wikipedia",
    canonicalUrl: "https://en.wikipedia.org/wiki/Example",
    revisionId: "12345",
    accessedAt: TEST_NOW,
    sectionOrLocator: "Plot",
    sourceContentHash: TEST_HASH,
    attribution: "Wikipedia contributors, CC BY-SA 4.0",
    licenseClass: "cc_by_sa",
    ...overrides,
  };
}

export function researchClaim(input: {
  aspectId?: AspectId;
  polarity?: "support" | "contradict";
  level?: "incidental" | "significant" | "primary" | null;
  citationIds?: readonly string[];
  claimId?: string;
} = {}): PersistedResearchClaim {
  return {
    claimId: input.claimId ?? "claim-1",
    aspectId: input.aspectId ?? "romance",
    polarity: input.polarity ?? "support",
    level: input.level === undefined ? "significant" : input.level,
    confidence: "medium",
    paraphrasedClaim: "Kaynak, bu unsurun karakter kararlarını tekrar eden biçimde etkilediğini belirtiyor.",
    citationIds: input.citationIds ?? ["citation-wikipedia-1"],
    extractionMethod: "grounded_llm",
    extractionPolicyVersion: "d7-r1.extract.1",
    warnings: [],
  };
}

export function researchDecision(input: {
  scope?: ResearchVersionScope;
  aspectId?: AspectId;
  status?: "supported" | "contradicted" | "unknown";
  level?: "incidental" | "significant" | "primary" | null;
  claimId?: string;
  reasonCode?: AspectResearchDecision["reasonCode"];
} = {}): AspectResearchDecision {
  const status = input.status ?? "supported";
  const claimId = input.claimId ?? "claim-1";
  return {
    version: 1,
    versionScope: input.scope ?? workScope(),
    aspectId: input.aspectId ?? "romance",
    status,
    level: input.level === undefined ? (status === "unknown" ? null : "significant") : input.level,
    confidence: status === "unknown" ? "none" : "medium",
    supportingClaimIds: status === "supported" ? [claimId] : [],
    contradictingClaimIds: status === "contradicted" ? [claimId] : [],
    sourceCount: status === "unknown" ? 0 : 1,
    independentSourceCount: status === "unknown" ? 0 : 1,
    decisionPolicyVersion: "d7-r1.1",
    reasonCode: input.reasonCode ?? (status === "supported" ? "direct_source_support" : status === "contradicted" ? "explicit_source_contradiction" : "no_source_found"),
    researchedAt: TEST_NOW,
    expiresAt: TEST_EXPIRY,
    warnings: [],
  };
}

export function constraint(input: Partial<ResearchConstraintRequest> & { aspectId: AspectId }): ResearchConstraintRequest {
  return {
    aspectId: input.aspectId,
    role: input.role ?? "must",
    minimumLevel: input.minimumLevel ?? "significant",
    source: input.source ?? "explicit",
    currentStructuredDecision: input.currentStructuredDecision ?? "unknown",
    unresolvedReason: input.unresolvedReason ?? "structured evidence unresolved",
  };
}

export function researchCandidate(input: {
  identity?: ReturnType<typeof researchIdentity>;
  scope?: ResearchVersionScope;
  mediaType?: RecommendationMediaType;
  rank?: number;
  eligible?: boolean;
  constraints?: readonly ResearchConstraintRequest[];
} = {}): ResearchCandidateInput {
  const identity = input.identity ?? researchIdentity();
  const scope = input.scope ?? workScope(identity);
  const unresolvedConstraints = input.constraints ?? [constraint({ aspectId: "romance" })];
  return {
    identity,
    versionScope: scope,
    mediaType: input.mediaType ?? identity.mediaType,
    preResearchRank: input.rank ?? 0,
    hardObjectiveEligible: input.eligible ?? true,
    unresolvedConstraints,
    structuredEvidenceSummary: unresolvedConstraints.map((item) => ({
      aspectId: item.aspectId,
      decision: item.currentStructuredDecision,
      level: null,
      confidence: "unknown",
      sourceKinds: [],
      warnings: [],
    })),
  };
}

export function cacheEntry(input: {
  decision?: AspectResearchDecision;
  claims?: readonly PersistedResearchClaim[];
  citations?: readonly PersistedResearchCitation[];
} = {}) {
  const decision = input.decision ?? researchDecision();
  return {
    key: buildResearchEvidenceCacheKey({ versionScope: decision.versionScope, aspectId: decision.aspectId }),
    decision,
    claims: input.claims ?? [researchClaim({ aspectId: decision.aspectId })],
    citations: input.citations ?? [wikipediaCitation()],
    createdAt: TEST_NOW,
    expiresAt: TEST_EXPIRY,
    sourceRevisionFingerprint: "wikipedia:12345",
    cacheStatus: "fresh" as const,
    warnings: [],
  };
}

