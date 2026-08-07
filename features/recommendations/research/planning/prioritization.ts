import type { ResearchConstraintRequest } from "../domain/types";

const ROLE_SOURCE_PRIORITY: Readonly<Record<string, number>> = {
  "explicit:must": 500,
  "explicit:avoid": 400,
  "explicit:prefer": 300,
  "inferred:must": 220,
  "inferred:avoid": 210,
  "inferred:prefer": 200,
  "profile:avoid": 100,
  "profile:prefer": 90,
};

export function researchConstraintPriority(constraint: ResearchConstraintRequest, preResearchRank: number): number {
  const base = ROLE_SOURCE_PRIORITY[`${constraint.source}:${constraint.role}`] ?? 0;
  return base * 10_000 - Math.min(9_999, Math.max(0, preResearchRank));
}

export function compareResearchPriorities(
  left: { constraint: ResearchConstraintRequest; preResearchRank: number; scopeKey: string },
  right: { constraint: ResearchConstraintRequest; preResearchRank: number; scopeKey: string },
): number {
  const priority = researchConstraintPriority(right.constraint, right.preResearchRank) - researchConstraintPriority(left.constraint, left.preResearchRank);
  if (priority !== 0) return priority;
  const scope = left.scopeKey.localeCompare(right.scopeKey);
  return scope !== 0 ? scope : left.constraint.aspectId.localeCompare(right.constraint.aspectId);
}

