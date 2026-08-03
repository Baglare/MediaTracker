import { decodeGoal } from "@/features/goals/domain/codec";
import { approveGoalSuggestion } from "@/features/goals/domain/suggestions";
import { resolveGoalMediaScope, validateResolvedMediaCompatibility } from "@/features/goals/domain/policies";
import type { Goal, GoalMetric, GoalSchedule, GoalScope, GoalSuggestion } from "@/features/goals/domain/types";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import type { MediaItem } from "@/lib/types";
import { publishGoalStoreChange, readGoalStore, writeGoalStore } from "./goal-store";

export interface CreateGoalInput {
  title: string;
  scope: GoalScope;
  metric: GoalMetric;
  schedule: GoalSchedule;
}

export interface UpdateGoalPatch {
  title?: string;
  scope?: GoalScope;
  metric?: GoalMetric;
  schedule?: GoalSchedule;
}

export interface GoalRepositoryOptions {
  storage?: PersonalStorageLike | null;
  mediaItems?: readonly MediaItem[];
  now?: () => Date;
  idFactory?: () => string;
  eventTarget?: EventTarget | null;
}

export class GoalRepositoryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GoalRepositoryError";
  }
}

function nowInstant(options: GoalRepositoryOptions): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

function nextUpdatedAt(goal: Goal, options: GoalRepositoryOptions): string {
  const candidate = nowInstant(options);
  return Date.parse(candidate) > Date.parse(goal.updatedAt)
    ? candidate
    : new Date(Date.parse(goal.updatedAt) + 1).toISOString();
}

function exactScopeSnapshot(scope: GoalScope, mediaItems: readonly MediaItem[]): GoalScope {
  if (scope.kind !== "media") return scope;
  const resolution = resolveGoalMediaScope(scope, mediaItems);
  if (resolution.status !== "resolved") {
    throw new GoalRepositoryError("media_missing", "Bağlanacak medya exact mediaRecordId ile bulunamadı.");
  }
  return {
    kind: "media",
    mediaRecordId: resolution.item.id,
    ...(resolution.item.identity?.key ? { canonicalMediaKey: resolution.item.identity.key } : {}),
    ...(resolution.item.title.trim() ? { title: resolution.item.title.trim() } : {}),
  };
}

function validateGoal(goal: Goal, mediaItems: readonly MediaItem[], requireResolvedMedia: boolean): Goal {
  const decoded = decodeGoal(goal);
  if (!decoded.ok) {
    const first = decoded.issues[0];
    throw new GoalRepositoryError(first?.code ?? "goal_invalid", first?.message ?? "Goal doğrulanamadı.");
  }
  if (requireResolvedMedia || decoded.value.scope.kind !== "media") {
    const policy = validateResolvedMediaCompatibility(decoded.value, mediaItems);
    if (!policy.ok) throw new GoalRepositoryError(policy.code, policy.message);
  }
  return decoded.value;
}

function load(scope: LocalOwnerScope, options: GoalRepositoryOptions) {
  const result = readGoalStore(scope, options.storage);
  if (result.status === "error") throw new GoalRepositoryError("store_read_failed", result.message);
  return result;
}

function persist(scope: LocalOwnerScope, goals: readonly Goal[], recoveryQuarantineKey: string | undefined, options: GoalRepositoryOptions): void {
  const written = writeGoalStore(scope, goals, {
    storage: options.storage,
    now: options.now,
    recoveryQuarantineKey,
  });
  if (!written.ok) throw new GoalRepositoryError(written.code, written.message);
  publishGoalStoreChange(scope, options.eventTarget);
}

function stableId(options: GoalRepositoryOptions): string {
  const id = options.idFactory?.() ?? globalThis.crypto?.randomUUID?.();
  if (!id) throw new GoalRepositoryError("uuid_unavailable", "Stabil Goal UUID üretilemedi.");
  return id;
}

export function listGoals(scope: LocalOwnerScope, options: GoalRepositoryOptions = {}): Goal[] {
  return [...load(scope, options).data.goals];
}

export function getGoal(scope: LocalOwnerScope, id: string, options: GoalRepositoryOptions = {}): Goal | undefined {
  return listGoals(scope, options).find((goal) => goal.id === id);
}

export function createGoal(scope: LocalOwnerScope, input: CreateGoalInput, options: GoalRepositoryOptions = {}): Goal {
  const state = load(scope, options);
  const id = stableId(options);
  if (state.data.goals.some((goal) => goal.id === id)) {
    throw new GoalRepositoryError("goal_id_duplicate", "Goal UUID zaten var; kayıt overwrite edilmedi.");
  }
  const createdAt = nowInstant(options);
  const goal = validateGoal({
    id,
    title: input.title,
    origin: "manual",
    scope: exactScopeSnapshot(input.scope, options.mediaItems ?? []),
    metric: input.metric,
    schedule: input.schedule,
    lifecycle: "active",
    createdAt,
    updatedAt: createdAt,
  }, options.mediaItems ?? [], true);
  persist(scope, [...state.data.goals, goal], state.quarantineKey, options);
  return goal;
}

export function createGoalFromApprovedSuggestion(
  scope: LocalOwnerScope,
  suggestion: GoalSuggestion,
  options: GoalRepositoryOptions = {},
): Goal {
  const state = load(scope, options);
  const goalId = stableId(options);
  if (state.data.goals.some((goal) => goal.id === goalId)) {
    throw new GoalRepositoryError("goal_id_duplicate", "Goal UUID zaten var; kayıt overwrite edilmedi.");
  }
  const approved = approveGoalSuggestion(suggestion, { goalId, approvedAt: nowInstant(options) });
  if (!approved.ok) throw new GoalRepositoryError(approved.issues[0]?.code ?? "goal_invalid", approved.issues[0]?.message ?? "Öneri onaylanamadı.");
  const goal = validateGoal(approved.value, options.mediaItems ?? [], true);
  persist(scope, [...state.data.goals, goal], state.quarantineKey, options);
  return goal;
}

export function updateGoal(
  scope: LocalOwnerScope,
  id: string,
  patch: UpdateGoalPatch,
  options: GoalRepositoryOptions = {},
): Goal {
  const state = load(scope, options);
  const index = state.data.goals.findIndex((goal) => goal.id === id);
  if (index < 0) throw new GoalRepositoryError("goal_not_found", "Goal bulunamadı.");
  const previous = state.data.goals[index];
  const scopeChanged = patch.scope !== undefined
    && (patch.scope.kind !== previous.scope.kind
      || (patch.scope.kind === "media" && previous.scope.kind === "media" && patch.scope.mediaRecordId !== previous.scope.mediaRecordId));
  const scopeValue = patch.scope === undefined || !scopeChanged
    ? previous.scope
    : exactScopeSnapshot(patch.scope, options.mediaItems ?? []);
  const metricChanged = patch.metric !== undefined
    && JSON.stringify(patch.metric) !== JSON.stringify(previous.metric);
  const goal = validateGoal({
    ...previous,
    ...patch,
    scope: scopeValue,
    id: previous.id,
    origin: previous.origin,
    lifecycle: previous.lifecycle,
    createdAt: previous.createdAt,
    updatedAt: nextUpdatedAt(previous, options),
  }, options.mediaItems ?? [], scopeChanged || metricChanged);
  const goals = [...state.data.goals];
  goals[index] = goal;
  persist(scope, goals, state.quarantineKey, options);
  return goal;
}

function changeLifecycle(
  scope: LocalOwnerScope,
  id: string,
  lifecycle: Goal["lifecycle"],
  options: GoalRepositoryOptions,
): Goal {
  const state = load(scope, options);
  const index = state.data.goals.findIndex((goal) => goal.id === id);
  if (index < 0) throw new GoalRepositoryError("goal_not_found", "Goal bulunamadı.");
  const previous = state.data.goals[index];
  const goal = validateGoal({ ...previous, lifecycle, updatedAt: nextUpdatedAt(previous, options) }, options.mediaItems ?? [], false);
  const goals = [...state.data.goals];
  goals[index] = goal;
  persist(scope, goals, state.quarantineKey, options);
  return goal;
}

export function cancelGoal(scope: LocalOwnerScope, id: string, options: GoalRepositoryOptions = {}): Goal {
  return changeLifecycle(scope, id, "cancelled", options);
}

export function archiveGoal(scope: LocalOwnerScope, id: string, options: GoalRepositoryOptions = {}): Goal {
  return changeLifecycle(scope, id, "archived", options);
}

export function reactivateGoal(scope: LocalOwnerScope, id: string, options: GoalRepositoryOptions = {}): Goal {
  return changeLifecycle(scope, id, "active", options);
}

export function deleteGoal(
  scope: LocalOwnerScope,
  id: string,
  confirmation: { confirmed: true },
  options: GoalRepositoryOptions = {},
): void {
  if (confirmation.confirmed !== true) throw new GoalRepositoryError("confirmation_required", "Fiziksel silme açık onay gerektirir.");
  const state = load(scope, options);
  const goals = state.data.goals.filter((goal) => goal.id !== id);
  if (goals.length === state.data.goals.length) throw new GoalRepositoryError("goal_not_found", "Goal bulunamadı.");
  persist(scope, goals, state.quarantineKey, options);
}
