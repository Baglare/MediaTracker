import { countIndependentResearchSources, validateAspectResearchDecision } from "../../domain/decisions";
import type { AspectResearchDecision, PersistedResearchClaim } from "../../domain/types";
import type { GroundedExtractionRequest } from "./types";
import { GROUNDED_DECISION_POLICY_VERSION } from "./types";

const LEVEL_VALUE = { incidental: 1, significant: 2, primary: 3 } as const;
const LEVEL_FROM_VALUE = { 1: "incidental", 2: "significant", 3: "primary" } as const;

function decisionLevel(claims: readonly PersistedResearchClaim[]): "incidental" | "significant" | "primary" | null {
  const supported = claims.filter((claim) => claim.polarity === "support" && claim.level !== null);
  if (supported.length === 0) return null;
  let strongest = Math.max(...supported.map((claim) => LEVEL_VALUE[claim.level as keyof typeof LEVEL_VALUE]));
  if (strongest === 3 && !supported.some((claim) => claim.level === "primary" && claim.confidence !== "low")) strongest = 2;
  return LEVEL_FROM_VALUE[strongest as keyof typeof LEVEL_FROM_VALUE];
}

export function buildDeterministicResearchDecision(input: { request: GroundedExtractionRequest; claims: readonly PersistedResearchClaim[]; now?: () => Date }): AspectResearchDecision {
  const support = input.claims.filter((claim) => claim.polarity === "support");
  const contradict = input.claims.filter((claim) => claim.polarity === "contradict");
  const allIds = input.claims.map((claim) => claim.claimId);
  const counts = countIndependentResearchSources({ claimIds: allIds, claims: input.claims, citations: input.request.packet.citations });
  const now = (input.now ?? (() => new Date()))();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const conflict = support.length > 0 && contradict.length > 0;
  const status = conflict || input.claims.length === 0 ? "unknown" : support.length > 0 ? "supported" : "contradicted";
  const level = status === "supported" ? decisionLevel(support) : null;
  const claimConfidence = input.claims.some((claim) => claim.confidence === "medium" || claim.confidence === "high") ? "medium" : input.claims.length > 0 ? "low" : "none";
  const reasonCode = conflict ? "conflicting_sources" : status === "supported" ? "direct_source_support" : status === "contradicted" ? "explicit_source_contradiction" : "passage_insufficient";
  const decision: AspectResearchDecision = {
    version: 1, versionScope: input.request.packet.versionScope, aspectId: input.request.packet.aspectId,
    status, level, confidence: status === "unknown" ? "none" : claimConfidence,
    supportingClaimIds: support.map((claim) => claim.claimId), contradictingClaimIds: contradict.map((claim) => claim.claimId),
    sourceCount: counts.sourceCount, independentSourceCount: counts.independentSourceCount,
    decisionPolicyVersion: GROUNDED_DECISION_POLICY_VERSION, reasonCode,
    researchedAt: now.toISOString(), expiresAt: expires.toISOString(), warnings: conflict ? ["grounded_claim_conflict"] : [],
  };
  if (!validateAspectResearchDecision({ decision, claims: input.claims, citations: input.request.packet.citations, identity: input.request.packet.candidateIdentity }).ok) throw new Error("grounded_decision_validation_failed");
  return decision;
}

