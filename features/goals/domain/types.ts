import type { MediaType } from "@/lib/types";

export const GOAL_DOMAIN_VERSION = 1 as const;
export const GOAL_TITLE_MAX_LENGTH = 200;

export type GoalOrigin = "manual" | "suggested";
export type GoalLifecycle = "active" | "cancelled" | "archived";

export type GoalScope =
  | { kind: "library" }
  | { kind: "media_type"; mediaType: MediaType }
  | {
      kind: "media";
      mediaRecordId: string;
      canonicalMediaKey?: string;
      /** Display-only snapshot. It must never be used to resolve the media. */
      title?: string;
    };

export type GoalProgressUnit = "episode" | "chapter" | "page";

export type GoalMetric =
  | {
      kind: "progress";
      unit: GoalProgressUnit;
      targetValue: number;
    }
  | {
      kind: "completed_media";
      targetValue: number;
    };

export type GoalSchedule =
  | {
      kind: "one_time";
      startsOn: string;
      endsOn: string;
    }
  | {
      kind: "weekly";
      startsOn: string;
      weekStartsOn: "monday";
      timeZone: string;
      endsOn?: string;
    }
  | {
      kind: "monthly";
      startsOn: string;
      timeZone: string;
      endsOn?: string;
    };

export interface Goal {
  id: string;
  title: string;
  origin: GoalOrigin;
  scope: GoalScope;
  metric: GoalMetric;
  schedule: GoalSchedule;
  lifecycle: GoalLifecycle;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ephemeral recommendation output. It is deliberately not a Goal and has no
 * lifecycle, so it cannot become an active persisted target by itself.
 */
export interface GoalSuggestion {
  suggestionId: string;
  title: string;
  scope: GoalScope;
  metric: GoalMetric;
  schedule: GoalSchedule;
  generatedAt: string;
}

export interface GoalDocument {
  version: typeof GOAL_DOMAIN_VERSION;
  goals: Goal[];
}

export type GoalAttainment =
  | "not_started"
  | "in_progress"
  | "reached"
  | "expired"
  | "inactive_target";

export type GoalEvaluationWarning =
  | "media_missing"
  | "detached_logs_ignored"
  | "incompatible_unit"
  | "insufficient_history"
  | "timezone_invalid";

export interface GoalEvaluation {
  goalId: string;
  periodStart: string;
  periodEnd: string;
  currentValue: number;
  targetValue: number;
  remainingValue: number;
  progressPercent: number;
  attainment: GoalAttainment;
  contributingLogIds: string[];
  warnings: GoalEvaluationWarning[];
}

export interface GoalPeriodWindow {
  /** Inclusive date-only boundary. */
  start: string;
  /** Inclusive date-only boundary. */
  end: string;
}
