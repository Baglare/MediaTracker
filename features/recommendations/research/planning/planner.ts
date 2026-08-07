import { ASPECT_REGISTRY } from "../../domain/aspect-registry";
import { decodeResearchCandidateInput } from "../domain/codec";
import { getAspectResearchCapability } from "../domain/aspect-capability";
import type { ResearchBudget, ResearchCandidateInput, ResearchJob, ResearchPlan, ResearchPlanSkippedItem } from "../domain/types";
import { validateResearchVersionScope } from "../domain/version-scope";
import { buildResearchEvidenceCacheKey, RESEARCH_POLICY_VERSION } from "../cache/key";
import { DEFAULT_RESEARCH_BUDGET, jobBudget, validateResearchBudget } from "./budgets";
import { compareResearchPriorities, researchConstraintPriority } from "./prioritization";

export function planResearch(input: {
  candidates: readonly ResearchCandidateInput[];
  budget?: ResearchBudget;
}): ResearchPlan {
  const budget = input.budget ?? DEFAULT_RESEARCH_BUDGET;
  if (!validateResearchBudget(budget)) throw new Error("research_budget_invalid");
  const skipped: ResearchPlanSkippedItem[] = [];
  const candidates = [...input.candidates].sort((a, b) => a.preResearchRank - b.preResearchRank || a.versionScope.scopeKey.localeCompare(b.versionScope.scopeKey));
  const acceptedCandidates = candidates.slice(0, budget.maxCandidates);
  for (const candidate of candidates.slice(budget.maxCandidates)) skipped.push({ scopeKey: candidate.versionScope.scopeKey, reason: "candidate_budget_exceeded", detail: "Candidate top-N research bütçesi dışında." });

  const requests: Array<{ candidate: ResearchCandidateInput; constraint: ResearchCandidateInput["unresolvedConstraints"][number]; preResearchRank: number; scopeKey: string }> = [];
  for (const candidate of acceptedCandidates) {
    const decoded = decodeResearchCandidateInput(candidate);
    const scope = validateResearchVersionScope({ identity: candidate.identity, scope: candidate.versionScope });
    if (!decoded.ok || !scope.ok) {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, reason: "invalid_identity_scope", detail: "Exact identity/version scope doğrulanamadı." });
      continue;
    }
    if (!candidate.hardObjectiveEligible) {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, reason: "hard_objective_rejected", detail: "Candidate objective hard filter'da elendi." });
      continue;
    }
    for (const constraint of candidate.unresolvedConstraints) requests.push({ candidate, constraint, preResearchRank: candidate.preResearchRank, scopeKey: candidate.versionScope.scopeKey });
  }
  requests.sort(compareResearchPriorities);

  const jobs: ResearchJob[] = [];
  const seen = new Set<string>();
  const perCandidate = new Map<string, number>();
  let reservedSearchOperations = 0;
  for (const request of requests) {
    const { candidate, constraint } = request;
    const pairKey = `${candidate.versionScope.scopeKey}:${constraint.aspectId}`;
    if (seen.has(pairKey)) {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, aspectId: constraint.aspectId, reason: "duplicate_candidate_aspect", detail: "Aynı candidate/aspect research job coalesce edildi." });
      continue;
    }
    seen.add(pairKey);
    if (constraint.currentStructuredDecision === "decisive_supported" || constraint.currentStructuredDecision === "decisive_contradicted") {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, aspectId: constraint.aspectId, reason: "structured_evidence_decisive", detail: "Structured evidence zaten karar verdi." });
      continue;
    }
    if (constraint.source === "profile") {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, aspectId: constraint.aspectId, reason: "profile_research_disabled", detail: "Profile kaynaklı constraint varsayılan research planına girmez." });
      continue;
    }
    const capability = getAspectResearchCapability(constraint.aspectId);
    const supportedMediaTypes: readonly string[] = ASPECT_REGISTRY[constraint.aspectId].supportedMediaTypes;
    const targetSupported = supportedMediaTypes.includes(candidate.mediaType);
    const roleAllowed = constraint.role === "must" ? capability.canResearchMust : constraint.role === "avoid" ? capability.canResearchAvoid : capability.canResearchPrefer;
    if (!targetSupported || capability.researchMode === "unsupported" || capability.researchMode === "none" || !roleAllowed) {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, aspectId: constraint.aspectId, reason: "unsupported_capability", detail: "Aspect/media/role research capability uygun değil." });
      continue;
    }
    const count = perCandidate.get(candidate.versionScope.scopeKey) ?? 0;
    if (count >= budget.maxAspectsPerCandidate) {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, aspectId: constraint.aspectId, reason: "aspect_budget_exceeded", detail: "Candidate aspect bütçesi aşıldı." });
      continue;
    }
    if (jobs.length >= budget.maxResearchJobs) {
      skipped.push({ scopeKey: candidate.versionScope.scopeKey, aspectId: constraint.aspectId, reason: "job_budget_exceeded", detail: "Global research job bütçesi aşıldı." });
      continue;
    }
    const searchReserved = reservedSearchOperations < budget.maxExternalSearchOperations;
    if (searchReserved) reservedSearchOperations += 1;
    const cacheKey = buildResearchEvidenceCacheKey({ versionScope: candidate.versionScope, aspectId: constraint.aspectId });
    jobs.push({
      jobId: `research-job:v1:${encodeURIComponent(candidate.versionScope.scopeKey)}:${constraint.aspectId}:${constraint.role}`,
      candidateScope: candidate.versionScope,
      aspectId: constraint.aspectId,
      role: constraint.role,
      minimumLevel: constraint.minimumLevel,
      priority: researchConstraintPriority(constraint, candidate.preResearchRank),
      sourceClasses: capability.allowedSourceClasses,
      budget: jobBudget(searchReserved, budget.totalTimeoutMs),
      cacheKey,
      researchPolicyVersion: RESEARCH_POLICY_VERSION,
    });
    perCandidate.set(candidate.versionScope.scopeKey, count + 1);
  }
  return {
    version: 1,
    jobs,
    skipped,
    budget: { ...budget },
    estimatedOperations: reservedSearchOperations,
    warnings: jobs.length === 0 ? ["research_plan_empty"] : [],
    policyVersion: RESEARCH_POLICY_VERSION,
  };
}
