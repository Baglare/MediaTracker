import { decodeGoal } from "@/features/goals/domain/codec";
import type { Goal } from "@/features/goals/domain/types";

const FORBIDDEN_SYNC_FIELDS = new Set([
  "currentValue", "progressPercent", "attainment", "completed", "completedAt",
  "contributingLogIds", "warnings", "suggestions", "revision", "cloudRevision",
]);

export function goalToCloudDefinition(goal: Goal): Record<string, unknown> {
  const decoded = decodeGoal(goal);
  if (!decoded.ok) throw new Error("goal_cloud_definition_invalid");
  return { ...decoded.value };
}

export function goalFromCloudDefinition(value: unknown):
  | { ok: true; goal: Goal }
  | { ok: false; code: "malformed_server_definition" } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Object.keys(value).some((key) => FORBIDDEN_SYNC_FIELDS.has(key))) {
      return { ok: false, code: "malformed_server_definition" };
    }
  }
  const decoded = decodeGoal(value);
  return decoded.ok
    ? { ok: true, goal: decoded.value }
    : { ok: false, code: "malformed_server_definition" };
}

export function sameGoalDefinition(left: Goal, right: Goal): boolean {
  return JSON.stringify(goalToCloudDefinition(left)) === JSON.stringify(goalToCloudDefinition(right));
}
