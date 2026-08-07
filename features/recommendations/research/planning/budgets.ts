import type { ResearchBudget, ResearchJobBudget } from "../domain/types";

export const DEFAULT_RESEARCH_BUDGET: Readonly<ResearchBudget> = Object.freeze({
  maxCandidates: 8,
  maxAspectsPerCandidate: 3,
  maxResearchJobs: 12,
  maxExternalSearchOperations: 6,
  maxConcurrentOperations: 2,
  totalTimeoutMs: 8_000,
});

export function validateResearchBudget(budget: ResearchBudget): boolean {
  return Number.isInteger(budget.maxCandidates) && budget.maxCandidates > 0 && budget.maxCandidates <= 8
    && Number.isInteger(budget.maxAspectsPerCandidate) && budget.maxAspectsPerCandidate > 0 && budget.maxAspectsPerCandidate <= 3
    && Number.isInteger(budget.maxResearchJobs) && budget.maxResearchJobs > 0 && budget.maxResearchJobs <= 12
    && Number.isInteger(budget.maxExternalSearchOperations) && budget.maxExternalSearchOperations >= 0 && budget.maxExternalSearchOperations <= 6
    && Number.isInteger(budget.maxConcurrentOperations) && budget.maxConcurrentOperations > 0 && budget.maxConcurrentOperations <= 2
    && Number.isInteger(budget.totalTimeoutMs) && budget.totalTimeoutMs > 0 && budget.totalTimeoutMs <= 8_000;
}

export function jobBudget(searchOperationReserved: boolean, totalTimeoutMs: number): ResearchJobBudget {
  return {
    maxExternalSearchOperations: searchOperationReserved ? 1 : 0,
    maxDirectSources: 3,
    timeoutMs: Math.min(4_000, totalTimeoutMs),
  };
}

