import type { AspectId } from "../../domain/aspect-registry";
import type { ConstraintRole, RecommendationDecodeResult, RecommendationDomainIssue } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import { getResearchSource } from "./source-registry";
import type {
  AspectResearchDecision,
  PersistedResearchCitation,
  PersistedResearchClaim,
  ResearchClaimLevel,
  ResearchEvidenceCacheEntry,
  ResearchEvidenceHandoff,
  ResearchRunStatus,
  ResearchVersionScope,
} from "./types";
import { validatePersistedResearchClaim } from "./citations";
import { validateResearchVersionScope } from "./version-scope";

const LEVEL_VALUE: Readonly<Record<Exclude<ResearchClaimLevel, null>, number>> = { incidental: 1, significant: 2, primary: 3 };
const SUPPORTED_REASONS = new Set(["structured_evidence_sufficient", "direct_source_support", "multi_source_support", "combined_evidence_support"]);
const CONTRADICTED_REASONS = new Set(["explicit_source_contradiction", "multi_source_contradiction"]);

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

export function validateAspectResearchDecision(input: {
  decision: AspectResearchDecision;
  claims: readonly PersistedResearchClaim[];
  citations: readonly PersistedResearchCitation[];
  identity: RecommendationCandidateIdentity;
}): RecommendationDecodeResult<AspectResearchDecision> {
  const { decision } = input;
  const issues: RecommendationDomainIssue[] = [];
  if (!validateResearchVersionScope({ identity: input.identity, scope: decision.versionScope }).ok) issues.push(issue("research_decision_scope_invalid", "versionScope", "Decision exact version scope taşımalıdır."));
  if (decision.version !== 1) issues.push(issue("research_decision_version_invalid", "version", "Decision version=1 olmalıdır."));
  if (!Number.isFinite(Date.parse(decision.researchedAt)) || !Number.isFinite(Date.parse(decision.expiresAt)) || Date.parse(decision.expiresAt) <= Date.parse(decision.researchedAt)) issues.push(issue("research_decision_time_invalid", "expiresAt", "Decision timestamps canonical ve artan olmalıdır."));
  if (!Number.isInteger(decision.sourceCount) || !Number.isInteger(decision.independentSourceCount) || decision.sourceCount < 0 || decision.independentSourceCount < 0 || decision.independentSourceCount > decision.sourceCount) issues.push(issue("research_decision_source_count_invalid", "sourceCount", "Source counts tutarlı non-negative integers olmalıdır."));
  const claimMap = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const allIds = [...decision.supportingClaimIds, ...decision.contradictingClaimIds];
  for (const claimId of allIds) {
    const claim = claimMap.get(claimId);
    if (!claim || claim.aspectId !== decision.aspectId) issues.push(issue("research_decision_claim_invalid", "claimIds", `Decision claim bulunamadı/aspect mismatch: ${claimId}`));
    else if (!validatePersistedResearchClaim({ claim, citations: input.citations }).ok) issues.push(issue("research_decision_claim_codec_invalid", "claimIds", `Decision claim codec geçersiz: ${claimId}`));
  }
  if (decision.status === "supported") {
    if (decision.supportingClaimIds.length === 0 || decision.level === null || decision.confidence === "none" || !SUPPORTED_REASONS.has(decision.reasonCode)) issues.push(issue("research_decision_supported_incomplete", "status", "Supported decision claim, level, confidence ve supported reason ister."));
  }
  if (decision.status === "contradicted") {
    if (decision.contradictingClaimIds.length === 0 || decision.confidence === "none" || !CONTRADICTED_REASONS.has(decision.reasonCode)) issues.push(issue("research_decision_contradicted_incomplete", "status", "Contradicted decision explicit claim/citation ister."));
  }
  if (decision.status === "unknown") {
    if (decision.level !== null) issues.push(issue("research_decision_unknown_level_forbidden", "level", "Unknown level null olmalıdır."));
    if (SUPPORTED_REASONS.has(decision.reasonCode) || CONTRADICTED_REASONS.has(decision.reasonCode)) issues.push(issue("research_decision_unknown_reason_invalid", "reasonCode", "Unknown decision unknown reason taşımalıdır."));
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: decision };
}

export function countIndependentResearchSources(input: {
  claimIds: readonly string[];
  claims: readonly PersistedResearchClaim[];
  citations: readonly PersistedResearchCitation[];
}): { sourceCount: number; independentSourceCount: number } {
  const citations = new Map(input.citations.map((citation) => [citation.citationId, citation]));
  const claims = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const urls = new Set<string>();
  const publishers = new Set<string>();
  for (const claimId of input.claimIds) {
    for (const citationId of claims.get(claimId)?.citationIds ?? []) {
      const citation = citations.get(citationId);
      if (!citation) continue;
      urls.add(citation.canonicalUrl);
      publishers.add(citation.sourceId);
    }
  }
  return { sourceCount: urls.size, independentSourceCount: publishers.size };
}

export function canResearchDecisionDriveHardConstraint(input: {
  decision: AspectResearchDecision;
  claims: readonly PersistedResearchClaim[];
  citations: readonly PersistedResearchCitation[];
}): boolean {
  if (input.decision.status === "unknown") return false;
  const claimIds = input.decision.status === "supported" ? input.decision.supportingClaimIds : input.decision.contradictingClaimIds;
  const claims = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const citations = new Map(input.citations.map((citation) => [citation.citationId, citation]));
  const tiers = claimIds.flatMap((id) => (claims.get(id)?.citationIds ?? []).flatMap((citationId) => {
    const source = getResearchSource(citations.get(citationId)?.sourceId ?? "");
    return source ? [source.trustTier] : [];
  }));
  return tiers.length > 0 && (tiers.some((tier) => tier === "high" || tier === "medium") || input.decision.independentSourceCount >= 2);
}

export interface DeterministicResearchSignal {
  primaryEligible: boolean;
  nearMatchEligible: boolean;
  mustSatisfied: boolean;
  preferContribution: boolean;
  avoidTriggered: boolean;
  explicitAbsenceEvidence: boolean;
  reason: string;
}

export function mapResearchDecisionToDeterministicSignal(input: {
  decision: AspectResearchDecision;
  role: ConstraintRole;
  minimumLevel?: Exclude<ResearchClaimLevel, null>;
  hardDecisionAllowed?: boolean;
}): DeterministicResearchSignal {
  const hardAllowed = input.hardDecisionAllowed ?? true;
  const reaches = input.decision.level !== null && (!input.minimumLevel || LEVEL_VALUE[input.decision.level] >= LEVEL_VALUE[input.minimumLevel]);
  if (input.role === "must") {
    const satisfied = hardAllowed && input.decision.status === "supported" && reaches;
    return { primaryEligible: satisfied, nearMatchEligible: !satisfied, mustSatisfied: satisfied, preferContribution: false, avoidTriggered: false, explicitAbsenceEvidence: false, reason: satisfied ? "research_must_supported" : input.decision.status === "unknown" ? "research_must_unknown" : "research_must_not_satisfied" };
  }
  if (input.role === "avoid") {
    const triggered = hardAllowed && input.decision.status === "supported" && reaches;
    const absence = hardAllowed && input.decision.status === "contradicted";
    return { primaryEligible: !triggered, nearMatchEligible: triggered, mustSatisfied: false, preferContribution: false, avoidTriggered: triggered, explicitAbsenceEvidence: absence, reason: triggered ? "research_avoid_triggered" : absence ? "research_explicit_absence" : "research_avoid_unknown" };
  }
  const contributes = input.decision.status === "supported" && reaches;
  return { primaryEligible: true, nearMatchEligible: false, mustSatisfied: false, preferContribution: contributes, avoidTriggered: false, explicitAbsenceEvidence: false, reason: contributes ? "research_prefer_supported" : "research_prefer_no_contribution" };
}

export function buildResearchEvidenceHandoff(input: {
  candidateIdentity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  decisions: readonly AspectResearchDecision[];
  claims: readonly PersistedResearchClaim[];
  citations: readonly PersistedResearchCitation[];
  researchStatus: ResearchRunStatus;
  cacheEntries?: readonly ResearchEvidenceCacheEntry[];
}): ResearchEvidenceHandoff {
  if (!validateResearchVersionScope({ identity: input.candidateIdentity, scope: input.versionScope }).ok) throw new Error("research_handoff_scope_invalid");
  const unresolvedAspects = input.decisions.filter((decision) => decision.status === "unknown").map((decision) => decision.aspectId);
  return {
    candidateIdentity: input.candidateIdentity,
    versionScope: input.versionScope,
    aspectDecisions: [...input.decisions],
    claims: [...input.claims],
    citations: [...input.citations],
    unresolvedAspects: [...new Set<AspectId>(unresolvedAspects)].sort(),
    researchStatus: input.researchStatus,
    cacheMetadata: (input.cacheEntries ?? []).map(({ key, createdAt, expiresAt, cacheStatus, sourceRevisionFingerprint }) => ({ key, createdAt, expiresAt, cacheStatus, sourceRevisionFingerprint })),
  };
}

