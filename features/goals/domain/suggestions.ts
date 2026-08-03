import { decodeGoal, type GoalDecodeResult } from "./codec";
import type { Goal, GoalSuggestion } from "./types";

export interface GoalSuggestionApproval {
  /** New stable Goal UUID chosen during explicit approval. */
  goalId: string;
  /** ISO instant at which the user approved the suggestion. */
  approvedAt: string;
}

/**
 * The only domain conversion from an ephemeral suggestion to an active Goal.
 * Calling this helper is the explicit user-approval boundary; D5-1 has no
 * automatic suggestion activation path.
 */
export function approveGoalSuggestion(
  suggestion: GoalSuggestion,
  approval: GoalSuggestionApproval,
): GoalDecodeResult<Goal> {
  return decodeGoal({
    id: approval.goalId,
    title: suggestion.title,
    origin: "suggested",
    scope: suggestion.scope,
    metric: suggestion.metric,
    schedule: suggestion.schedule,
    lifecycle: "active",
    createdAt: approval.approvedAt,
    updatedAt: approval.approvedAt,
  });
}
