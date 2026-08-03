"use client";

import { useMemo, useState } from "react";

import {
  buildGoalEvaluationSnapshot,
  evaluateGoals,
  generateGoalSuggestions,
} from "@/features/goals/evaluation";
import type { Goal, GoalEvaluation } from "@/features/goals/domain/types";
import type { MediaItem, ProgressLog } from "@/lib/types";

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "browser-timezone-unavailable";
  } catch {
    return "browser-timezone-unavailable";
  }
}

export function useGoalEvaluations(args: {
  ownerKey: string | null;
  ready: boolean;
  goals: readonly Goal[];
  mediaItems: readonly MediaItem[];
  progressLogs: readonly ProgressLog[];
}) {
  const [context] = useState(() => ({
    now: new Date().toISOString(),
    timeZone: browserTimeZone(),
  }));
  const snapshot = useMemo(
    () => buildGoalEvaluationSnapshot(
      args.ready && args.ownerKey ? args.mediaItems : [],
      args.ready && args.ownerKey ? args.progressLogs : [],
    ),
    [args.mediaItems, args.progressLogs, args.ready, args.ownerKey],
  );
  const evaluations = useMemo(
    () => args.ready ? evaluateGoals(args.goals, snapshot, context) : [],
    [args.goals, args.ready, context, snapshot],
  );
  const suggestions = useMemo(
    () => args.ready ? generateGoalSuggestions(args.goals, snapshot, context) : [],
    [args.goals, args.ready, context, snapshot],
  );
  const byGoalId = useMemo(
    () => new Map<string, GoalEvaluation>(evaluations.map((evaluation) => [evaluation.goalId, evaluation])),
    [evaluations],
  );
  return { context, evaluations, byGoalId, suggestions };
}
