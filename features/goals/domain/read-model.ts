import { isValidDateOnly } from "./dates";
import type {
  Goal,
  GoalAttainment,
  GoalEvaluation,
  GoalEvaluationWarning,
  GoalPeriodWindow,
} from "./types";

const WARNINGS = new Set<GoalEvaluationWarning>([
  "media_missing",
  "detached_logs_ignored",
  "incompatible_unit",
  "insufficient_history",
  "timezone_invalid",
  "conflicting_log_payload",
  "progress_chain_discontinuity",
]);

export interface GoalEvaluationInput {
  goal: Goal;
  period: GoalPeriodWindow;
  currentValue: number;
  referenceDate: string;
  contributingLogIds?: readonly string[];
  warnings?: readonly GoalEvaluationWarning[];
  inactiveTarget?: boolean;
}

export type GoalEvaluationResult =
  | { ok: true; value: GoalEvaluation }
  | { ok: false; code: string; message: string };

export function deriveGoalAttainment(
  goal: Goal,
  currentValue: number,
  referenceDate: string,
  inactiveTarget = false,
): GoalAttainment {
  if (inactiveTarget) return "inactive_target";
  if (referenceDate < goal.schedule.startsOn) return "not_started";
  if (currentValue >= goal.metric.targetValue) return "reached";
  if (goal.schedule.endsOn && referenceDate > goal.schedule.endsOn) return "expired";
  return "in_progress";
}

export function createGoalEvaluation(input: GoalEvaluationInput): GoalEvaluationResult {
  if (!isValidDateOnly(input.period.start) || !isValidDateOnly(input.period.end)
    || input.period.end < input.period.start || !isValidDateOnly(input.referenceDate)) {
    return { ok: false, code: "evaluation_date_invalid", message: "Evaluation tarih aralığı geçersiz." };
  }
  if (!Number.isFinite(input.currentValue) || input.currentValue < 0) {
    return { ok: false, code: "current_value_invalid", message: "currentValue negatif olmayan sonlu sayı olmalıdır." };
  }
  const ids = [...(input.contributingLogIds ?? [])];
  if (ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
    return { ok: false, code: "contributing_log_ids_invalid", message: "contributingLogIds benzersiz ve dolu olmalıdır." };
  }
  const sortedIds = [...ids].sort((left, right) => left.localeCompare(right, "en"));
  const warnings = [...new Set(input.warnings ?? [])];
  if (warnings.some((warning) => !WARNINGS.has(warning))) {
    return { ok: false, code: "evaluation_warning_invalid", message: "Evaluation warning desteklenmiyor." };
  }
  const targetValue = input.goal.metric.targetValue;
  return {
    ok: true,
    value: {
      goalId: input.goal.id,
      periodStart: input.period.start,
      periodEnd: input.period.end,
      currentValue: input.currentValue,
      targetValue,
      remainingValue: Math.max(0, targetValue - input.currentValue),
      progressPercent: Math.min(100, Math.max(0, (input.currentValue / targetValue) * 100)),
      attainment: deriveGoalAttainment(
        input.goal,
        input.currentValue,
        input.referenceDate,
        input.inactiveTarget,
      ),
      contributingLogIds: sortedIds,
      warnings,
    },
  };
}
