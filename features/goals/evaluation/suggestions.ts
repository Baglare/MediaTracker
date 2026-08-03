import { addGoalCalendarDays, dateOnlyInTimeZone, isValidIsoInstant, resolveGoalPeriod } from "@/features/goals/domain/dates";
import { progressUnitsForMediaType } from "@/features/goals/domain/policies";
import type {
  Goal,
  GoalMetric,
  GoalPeriodWindow,
  GoalProgressUnit,
  GoalSchedule,
  GoalScope,
  GoalSuggestion,
} from "@/features/goals/domain/types";
import { isMovieLike } from "@/lib/progress";
import type { MediaType } from "@/lib/types";
import { evaluateGoalWindow, type GoalEvaluationContext, type GoalEvaluationSnapshot } from "./engine";

export interface GeneratedGoalSuggestion {
  suggestion: GoalSuggestion;
  reason: string;
  historyPeriods: number;
}

interface SuggestionCandidate {
  scope: GoalScope;
  metric: Omit<Extract<GoalMetric, { kind: "progress" }>, "targetValue">
    | Omit<Extract<GoalMetric, { kind: "completed_media" }>, "targetValue">;
  scheduleKind: "weekly" | "monthly";
}

const MEDIA_TYPES: readonly MediaType[] = [
  "movie", "tv", "anime", "manga", "manhwa", "manhua", "book",
  "light_novel", "web_novel", "visual_novel",
];
const UNIT_LABELS: Record<GoalProgressUnit, string> = {
  episode: "bölüm",
  chapter: "chapter",
  page: "sayfa",
};

function previousMonth(date: string): GoalPeriodWindow {
  const [yearValue, monthValue] = date.split("-").map(Number);
  const monthIndex = yearValue * 12 + monthValue - 2;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12 + 1;
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12
    ? `${String(year + 1).padStart(4, "0")}-01-01`
    : `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end: addGoalCalendarDays(nextMonth, -1) };
}

function completedWindows(
  kind: "weekly" | "monthly",
  referenceDate: string,
  timeZone: string,
): GoalPeriodWindow[] {
  if (kind === "monthly") {
    const windows: GoalPeriodWindow[] = [];
    let cursor = referenceDate;
    for (let index = 0; index < 3; index += 1) {
      const window = previousMonth(cursor);
      windows.push(window);
      cursor = window.start;
    }
    return windows.reverse();
  }
  const current = resolveGoalPeriod({
    kind: "weekly",
    startsOn: "0001-01-01",
    weekStartsOn: "monday",
    timeZone,
  }, referenceDate);
  if (!current.ok || !current.value) return [];
  const windows: GoalPeriodWindow[] = [];
  let end = addGoalCalendarDays(current.value.start, -1);
  for (let index = 0; index < 4; index += 1) {
    const start = addGoalCalendarDays(end, -6);
    windows.push({ start, end });
    end = addGoalCalendarDays(start, -1);
  }
  return windows.reverse();
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function targetBounds(metric: SuggestionCandidate["metric"], scheduleKind: "weekly" | "monthly") {
  if (metric.kind === "completed_media") return { min: 1, max: scheduleKind === "weekly" ? 12 : 40 };
  if (metric.unit === "page") return { min: 10, max: scheduleKind === "weekly" ? 1000 : 4000 };
  if (metric.unit === "chapter") return { min: 1, max: scheduleKind === "weekly" ? 100 : 400 };
  return { min: 1, max: scheduleKind === "weekly" ? 50 : 200 };
}

function conservativeTarget(values: readonly number[], candidate: SuggestionCandidate): number {
  const bounds = targetBounds(candidate.metric, candidate.scheduleKind);
  return Math.min(bounds.max, Math.max(bounds.min, Math.floor(median(values))));
}

function stableHash(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUuid(value: string): string {
  const hex = [2166136261, 2246822519, 3266489917, 668265263]
    .map((seed) => stableHash(value, seed).toString(16).padStart(8, "0"))
    .join("")
    .split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function scopeKey(scope: GoalScope): string {
  if (scope.kind === "library") return "library";
  if (scope.kind === "media_type") return `media_type:${scope.mediaType}`;
  return `media:${scope.mediaRecordId}`;
}

function candidateKey(candidate: SuggestionCandidate): string {
  const metric = candidate.metric.kind === "progress"
    ? `progress:${candidate.metric.unit}`
    : "completed_media";
  return `${scopeKey(candidate.scope)}|${metric}|${candidate.scheduleKind}`;
}

function goalDedupeKey(goal: Goal): string {
  const metric = goal.metric.kind === "progress"
    ? `progress:${goal.metric.unit}`
    : "completed_media";
  return `${scopeKey(goal.scope)}|${metric}|${goal.schedule.kind}`;
}

function scheduleFor(
  kind: "weekly" | "monthly",
  referenceDate: string,
  timeZone: string,
): GoalSchedule {
  if (kind === "weekly") {
    const current = resolveGoalPeriod({
      kind: "weekly",
      startsOn: "0001-01-01",
      weekStartsOn: "monday",
      timeZone,
    }, referenceDate);
    if (!current.ok || !current.value) throw new Error("suggestion_period_invalid");
    return { kind: "weekly", startsOn: current.value.start, weekStartsOn: "monday", timeZone };
  }
  return { kind: "monthly", startsOn: `${referenceDate.slice(0, 7)}-01`, timeZone };
}

function titleFor(candidate: SuggestionCandidate, targetValue: number): string {
  const period = candidate.scheduleKind === "weekly" ? "Haftalık" : "Aylık";
  if (candidate.metric.kind === "completed_media") return `${period} ${targetValue} medya tamamla`;
  return `${period} ${targetValue} ${UNIT_LABELS[candidate.metric.unit]}`;
}

function buildCandidates(snapshot: GoalEvaluationSnapshot): SuggestionCandidate[] {
  const media = [...snapshot.mediaById.values()];
  const candidates: SuggestionCandidate[] = [];
  for (const scheduleKind of ["weekly", "monthly"] as const) {
    for (const unit of ["episode", "chapter", "page"] as const) {
      if (media.some((item) => !isMovieLike(item) && progressUnitsForMediaType(item.type).includes(unit))) {
        candidates.push({ scope: { kind: "library" }, metric: { kind: "progress", unit }, scheduleKind });
      }
    }
    candidates.push({ scope: { kind: "library" }, metric: { kind: "completed_media" }, scheduleKind });
    for (const mediaType of MEDIA_TYPES) {
      const typeItems = media.filter((item) => item.type === mediaType);
      if (typeItems.length === 0) continue;
      for (const unit of progressUnitsForMediaType(mediaType)) {
        if (typeItems.some((item) => !isMovieLike(item))) {
          candidates.push({ scope: { kind: "media_type", mediaType }, metric: { kind: "progress", unit }, scheduleKind });
        }
      }
      candidates.push({ scope: { kind: "media_type", mediaType }, metric: { kind: "completed_media" }, scheduleKind });
    }
  }
  return candidates;
}

export function generateGoalSuggestions(
  goals: readonly Goal[],
  snapshot: GoalEvaluationSnapshot,
  context: GoalEvaluationContext,
): GeneratedGoalSuggestion[] {
  if (!isValidIsoInstant(context.now)) throw new Error("goal_suggestion_now_invalid");
  const reference = dateOnlyInTimeZone(context.now, context.timeZone);
  if (!reference.ok) return [];
  const activeKeys = new Set(goals.filter((goal) => goal.lifecycle === "active").map(goalDedupeKey));
  const output: Array<GeneratedGoalSuggestion & { key: string; evidenceCount: number }> = [];

  for (const candidate of buildCandidates(snapshot)) {
    const key = candidateKey(candidate);
    if (activeKeys.has(key)) continue;
    const windows = completedWindows(candidate.scheduleKind, reference.value, context.timeZone);
    const aggregates = windows.map((window) => evaluateGoalWindow(
      candidate.scope,
      candidate.metric.kind === "progress"
        ? { ...candidate.metric, targetValue: 1 }
        : { kind: "completed_media", targetValue: 1 },
      window,
      context.timeZone,
      snapshot,
    ));
    const positive = aggregates.filter((aggregate) => aggregate.currentValue > 0
      && aggregate.contributingLogIds.length > 0);
    if (windows.length < 3 || positive.length < 3) continue;
    const targetValue = conservativeTarget(positive.map((aggregate) => aggregate.currentValue), candidate);
    const metric: GoalMetric = candidate.metric.kind === "progress"
      ? { ...candidate.metric, targetValue }
      : { kind: "completed_media", targetValue };
    const suggestion: GoalSuggestion = {
      suggestionId: deterministicUuid(`${key}|${reference.value}|${targetValue}`),
      title: titleFor(candidate, targetValue),
      scope: candidate.scope,
      metric,
      schedule: scheduleFor(candidate.scheduleKind, reference.value, context.timeZone),
      generatedAt: context.now,
    };
    output.push({
      key,
      evidenceCount: positive.reduce((sum, aggregate) => sum + aggregate.contributingLogIds.length, 0),
      suggestion,
      historyPeriods: positive.length,
      reason: `Son ${positive.length} tamamlanmış dönemdeki medya hızına göre makul öneri.`,
    });
  }

  return output
    .sort((left, right) => right.evidenceCount - left.evidenceCount || left.key.localeCompare(right.key, "en"))
    .slice(0, 3)
    .map(({ suggestion, reason, historyPeriods }) => ({ suggestion, reason, historyPeriods }));
}
