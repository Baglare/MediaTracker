import { dateOnlyInTimeZone, isValidIanaTimeZone, isValidIsoInstant, resolveGoalPeriod } from "@/features/goals/domain/dates";
import { createGoalEvaluation } from "@/features/goals/domain/read-model";
import { isProgressUnitCompatible } from "@/features/goals/domain/policies";
import type {
  Goal,
  GoalEvaluation,
  GoalEvaluationWarning,
  GoalMetric,
  GoalPeriodWindow,
  GoalProgressUnit,
  GoalScope,
} from "@/features/goals/domain/types";
import { isMovieLike } from "@/lib/progress";
import type { MediaItem, MediaType, ProgressLog, ProgressLogAction, ProgressLogUnit } from "@/lib/types";

const CONTRIBUTING_ACTIONS = new Set<ProgressLogAction>([
  "increment",
  "complete",
  "manual_adjust",
]);
const PROGRESS_UNITS = new Set<ProgressLogUnit>(["episode", "chapter", "page", "movie"]);
const WARNING_ORDER: readonly GoalEvaluationWarning[] = [
  "media_missing",
  "timezone_invalid",
  "conflicting_log_payload",
  "detached_logs_ignored",
  "incompatible_unit",
  "progress_chain_discontinuity",
  "insufficient_history",
];

interface IndexedLog {
  log: ProgressLog;
  timestamp: number;
}

export interface GoalEvaluationSnapshot {
  readonly mediaById: ReadonlyMap<string, MediaItem>;
  readonly mediaIdsByType: ReadonlyMap<MediaType, readonly string[]>;
  readonly logsByMediaId: ReadonlyMap<string, readonly IndexedLog[]>;
  readonly detachedLogs: readonly IndexedLog[];
  readonly conflictingLogs: readonly IndexedLog[];
  /** Snapshot-local cache. It is never shared between owners. */
  readonly localDateCache: Map<string, string | null>;
}

export interface GoalEvaluationContext {
  /** Valid ISO instant, injectable for deterministic tests. */
  now: string;
  /** IANA timezone used by one-time schedules and suggestion orchestration. */
  timeZone: string;
}

export interface GoalWindowAggregate {
  currentValue: number;
  contributingLogIds: string[];
  warnings: GoalEvaluationWarning[];
}

function logFingerprint(log: ProgressLog): string {
  return JSON.stringify([
    log.id,
    log.mediaId,
    log.mediaTitle,
    log.mediaType,
    log.action,
    log.detail ?? null,
    log.amount,
    log.unit,
    log.previousProgress,
    log.newProgress,
    log.createdAt,
  ]);
}

function isStructurallyTrustedLog(log: ProgressLog): boolean {
  return typeof log.id === "string"
    && log.id.trim().length > 0
    && typeof log.mediaId === "string"
    && log.mediaId.trim().length > 0
    && (CONTRIBUTING_ACTIONS.has(log.action) || log.action === "added");
}

function isTrustedProgressPayload(log: ProgressLog): boolean {
  return isStructurallyTrustedLog(log)
    && PROGRESS_UNITS.has(log.unit)
    && Number.isFinite(log.previousProgress)
    && Number.isFinite(log.newProgress)
    && log.previousProgress >= 0
    && log.newProgress >= 0
    && isValidIsoInstant(log.createdAt);
}

function sortIndexedLogs(logs: IndexedLog[]): IndexedLog[] {
  return logs.sort((left, right) => left.timestamp - right.timestamp
    || left.log.id.localeCompare(right.log.id, "en"));
}

function appendToMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

export function buildGoalEvaluationSnapshot(
  mediaItems: readonly MediaItem[],
  progressLogs: readonly ProgressLog[],
): GoalEvaluationSnapshot {
  const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
  const mediaIdsByType = new Map<MediaType, string[]>();
  for (const item of mediaItems) appendToMap(mediaIdsByType, item.type, item.id);
  for (const ids of mediaIdsByType.values()) ids.sort((left, right) => left.localeCompare(right, "en"));

  const payloadsById = new Map<string, ProgressLog[]>();
  for (const log of progressLogs) {
    if (typeof log?.id !== "string" || !log.id.trim()) continue;
    appendToMap(payloadsById, log.id, log);
  }

  const logsByMediaId = new Map<string, IndexedLog[]>();
  const detachedLogs: IndexedLog[] = [];
  const conflictingLogs: IndexedLog[] = [];
  for (const payloads of payloadsById.values()) {
    const fingerprints = new Set(payloads.map(logFingerprint));
    if (fingerprints.size > 1) {
      for (const log of payloads) {
        if (!isTrustedProgressPayload(log)) continue;
        conflictingLogs.push({ log, timestamp: Date.parse(log.createdAt) });
      }
      continue;
    }
    const log = payloads[0];
    if (!isTrustedProgressPayload(log)) continue;
    const indexed = { log, timestamp: Date.parse(log.createdAt) };
    if (!mediaById.has(log.mediaId)) detachedLogs.push(indexed);
    else appendToMap(logsByMediaId, log.mediaId, indexed);
  }

  for (const logs of logsByMediaId.values()) sortIndexedLogs(logs);
  sortIndexedLogs(detachedLogs);
  sortIndexedLogs(conflictingLogs);
  return {
    mediaById,
    mediaIdsByType,
    logsByMediaId,
    detachedLogs,
    conflictingLogs,
    localDateCache: new Map(),
  };
}

function localDate(snapshot: GoalEvaluationSnapshot, record: IndexedLog, timeZone: string): string | null {
  const key = `${timeZone}\u0000${record.log.createdAt}`;
  if (snapshot.localDateCache.has(key)) return snapshot.localDateCache.get(key) ?? null;
  const result = dateOnlyInTimeZone(record.log.createdAt, timeZone);
  const value = result.ok ? result.value : null;
  snapshot.localDateCache.set(key, value);
  return value;
}

function isInside(date: string | null, window: GoalPeriodWindow): boolean {
  return date !== null && date >= window.start && date <= window.end;
}

function snapshotLogCouldAffectScope(scope: GoalScope, log: ProgressLog): boolean {
  if (scope.kind === "library") return true;
  if (scope.kind === "media_type") return log.mediaType === scope.mediaType;
  return log.mediaId === scope.mediaRecordId;
}

function targetMedia(
  scope: GoalScope,
  metric: GoalMetric,
  snapshot: GoalEvaluationSnapshot,
): MediaItem[] {
  if (scope.kind === "media") {
    const item = snapshot.mediaById.get(scope.mediaRecordId);
    return item ? [item] : [];
  }
  const ids = scope.kind === "media_type"
    ? snapshot.mediaIdsByType.get(scope.mediaType) ?? []
    : [...snapshot.mediaById.keys()].sort((left, right) => left.localeCompare(right, "en"));
  const items = ids.flatMap((id) => {
    const item = snapshot.mediaById.get(id);
    return item ? [item] : [];
  });
  if (metric.kind !== "progress" || scope.kind !== "library") return items;
  return items.filter((item) => !isMovieLike(item) && isProgressUnitCompatible(item.type, metric.unit));
}

interface ReducedTransition {
  record: IndexedLog;
  delta: number;
}

function reduceTransitions(
  records: readonly IndexedLog[],
  window: GoalPeriodWindow,
  timeZone: string,
  snapshot: GoalEvaluationSnapshot,
  unit?: GoalProgressUnit,
): { transitions: ReducedTransition[]; discontinuity: boolean } {
  const transitions: ReducedTransition[] = [];
  let expectedPrevious: number | undefined;
  let discontinuity = false;
  for (const record of records) {
    const { log } = record;
    if (unit && log.unit !== unit) continue;
    const date = localDate(snapshot, record, timeZone);
    if (date === null || date > window.end) continue;
    if (expectedPrevious !== undefined && log.previousProgress !== expectedPrevious) {
      discontinuity = true;
      continue;
    }
    expectedPrevious = log.newProgress;
    if (log.action === "added" || !isInside(date, window)) continue;
    transitions.push({ record, delta: log.newProgress - log.previousProgress });
  }
  return { transitions, discontinuity };
}

function orderedWarnings(warnings: Iterable<GoalEvaluationWarning>): GoalEvaluationWarning[] {
  const set = new Set(warnings);
  return WARNING_ORDER.filter((warning) => set.has(warning));
}

function completionEvidencePriority(action: ProgressLogAction): number {
  if (action === "complete") return 0;
  if (action === "manual_adjust") return 1;
  return 2;
}

function evaluateProgressWindow(
  metric: Extract<GoalMetric, { kind: "progress" }>,
  window: GoalPeriodWindow,
  timeZone: string,
  snapshot: GoalEvaluationSnapshot,
  items: readonly MediaItem[],
  warnings: Set<GoalEvaluationWarning>,
): GoalWindowAggregate {
  let currentValue = 0;
  const contributingLogIds: string[] = [];
  for (const item of items) {
    if (isMovieLike(item) || !isProgressUnitCompatible(item.type, metric.unit)) {
      warnings.add("incompatible_unit");
      continue;
    }
    const records = snapshot.logsByMediaId.get(item.id) ?? [];
    if (records.some((record) => record.log.action !== "added"
      && record.log.unit !== metric.unit
      && isInside(localDate(snapshot, record, timeZone), window))) {
      warnings.add("incompatible_unit");
    }
    const reduced = reduceTransitions(records, window, timeZone, snapshot, metric.unit);
    if (reduced.discontinuity) warnings.add("progress_chain_discontinuity");
    for (const transition of reduced.transitions) {
      if (transition.delta === 0) continue;
      currentValue += transition.delta;
      contributingLogIds.push(transition.record.log.id);
    }
  }
  return {
    currentValue: Math.max(0, currentValue),
    contributingLogIds: [...new Set(contributingLogIds)].sort((left, right) => left.localeCompare(right, "en")),
    warnings: orderedWarnings(warnings),
  };
}

function evaluateCompletedMediaWindow(
  window: GoalPeriodWindow,
  timeZone: string,
  snapshot: GoalEvaluationSnapshot,
  items: readonly MediaItem[],
  warnings: Set<GoalEvaluationWarning>,
): GoalWindowAggregate {
  const contributingLogIds: string[] = [];
  for (const item of items) {
    const records = snapshot.logsByMediaId.get(item.id) ?? [];
    const reduced = reduceTransitions(records, window, timeZone, snapshot);
    if (reduced.discontinuity) warnings.add("progress_chain_discontinuity");
    const evidence = reduced.transitions
      .filter(({ record }) => item.totalProgress > 0
        && record.log.previousProgress < item.totalProgress
        && record.log.newProgress >= item.totalProgress)
      .sort((left, right) => completionEvidencePriority(left.record.log.action)
        - completionEvidencePriority(right.record.log.action)
        || left.record.timestamp - right.record.timestamp
        || left.record.log.id.localeCompare(right.record.log.id, "en"));
    if (item.status === "completed" && evidence.length > 0) {
      contributingLogIds.push(evidence[0].record.log.id);
    } else if (item.status === "completed") {
      warnings.add("insufficient_history");
    }
  }
  return {
    currentValue: contributingLogIds.length,
    contributingLogIds: [...new Set(contributingLogIds)].sort((left, right) => left.localeCompare(right, "en")),
    warnings: orderedWarnings(warnings),
  };
}

export function evaluateGoalWindow(
  scope: GoalScope,
  metric: GoalMetric,
  window: GoalPeriodWindow,
  timeZone: string,
  snapshot: GoalEvaluationSnapshot,
): GoalWindowAggregate {
  if (!isValidIanaTimeZone(timeZone)) {
    return { currentValue: 0, contributingLogIds: [], warnings: ["timezone_invalid"] };
  }
  const warnings = new Set<GoalEvaluationWarning>();
  const items = targetMedia(scope, metric, snapshot);
  if (scope.kind === "media" && items.length === 0) warnings.add("media_missing");

  if (snapshot.conflictingLogs.some((record) => snapshotLogCouldAffectScope(scope, record.log)
    && isInside(localDate(snapshot, record, timeZone), window))) {
    warnings.add("conflicting_log_payload");
  }
  if (snapshot.detachedLogs.some((record) => snapshotLogCouldAffectScope(scope, record.log)
    && isInside(localDate(snapshot, record, timeZone), window))) {
    warnings.add("detached_logs_ignored");
  }

  if (metric.kind === "progress") {
    if (scope.kind === "media" && items[0]
      && (isMovieLike(items[0]) || !isProgressUnitCompatible(items[0].type, metric.unit))) {
      warnings.add("incompatible_unit");
    }
    return evaluateProgressWindow(metric, window, timeZone, snapshot, items, warnings);
  }
  return evaluateCompletedMediaWindow(window, timeZone, snapshot, items, warnings);
}

function goalTimeZone(goal: Goal, context: GoalEvaluationContext): string {
  return goal.schedule.kind === "one_time" ? context.timeZone : goal.schedule.timeZone;
}

function periodForReference(goal: Goal, referenceDate: string): GoalPeriodWindow {
  if (goal.schedule.kind === "one_time") {
    return { start: goal.schedule.startsOn, end: goal.schedule.endsOn };
  }
  const boundedReference = referenceDate < goal.schedule.startsOn
    ? goal.schedule.startsOn
    : goal.schedule.endsOn && referenceDate > goal.schedule.endsOn
      ? goal.schedule.endsOn
      : referenceDate;
  const resolved = resolveGoalPeriod(goal.schedule, boundedReference);
  if (!resolved.ok || !resolved.value) {
    return { start: goal.schedule.startsOn, end: goal.schedule.endsOn ?? goal.schedule.startsOn };
  }
  return resolved.value;
}

export function evaluateGoal(
  goal: Goal,
  snapshot: GoalEvaluationSnapshot,
  context: GoalEvaluationContext,
): GoalEvaluation {
  if (!isValidIsoInstant(context.now)) throw new Error("goal_evaluation_now_invalid");
  const timeZone = goalTimeZone(goal, context);
  const reference = dateOnlyInTimeZone(context.now, timeZone);
  const referenceDate = reference.ok ? reference.value : goal.schedule.startsOn;
  const period = periodForReference(goal, referenceDate);
  const evidenceWindow = referenceDate >= period.start
    ? { start: period.start, end: referenceDate < period.end ? referenceDate : period.end }
    : null;
  const aggregate = reference.ok && evidenceWindow
    ? evaluateGoalWindow(goal.scope, goal.metric, evidenceWindow, timeZone, snapshot)
    : reference.ok
      ? {
          currentValue: 0,
          contributingLogIds: [],
          warnings: goal.scope.kind === "media" && !snapshot.mediaById.has(goal.scope.mediaRecordId)
            ? ["media_missing"] as GoalEvaluationWarning[]
            : [],
        }
    : { currentValue: 0, contributingLogIds: [], warnings: ["timezone_invalid"] as GoalEvaluationWarning[] };
  const result = createGoalEvaluation({
    goal,
    period,
    referenceDate,
    currentValue: aggregate.currentValue,
    contributingLogIds: aggregate.contributingLogIds,
    warnings: aggregate.warnings,
    inactiveTarget: goal.scope.kind === "media" && !snapshot.mediaById.has(goal.scope.mediaRecordId),
  });
  if (!result.ok) throw new Error(result.code);
  return result.value;
}

export function evaluateGoals(
  goals: readonly Goal[],
  snapshot: GoalEvaluationSnapshot,
  context: GoalEvaluationContext,
): GoalEvaluation[] {
  return [...goals]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt, "en")
      || left.id.localeCompare(right.id, "en"))
    .map((goal) => evaluateGoal(goal, snapshot, context));
}
