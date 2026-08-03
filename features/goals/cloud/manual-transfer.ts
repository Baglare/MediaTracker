import type { Goal } from "@/features/goals/domain/types";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import { sameGoalDefinition } from "./mapping";
import { enqueueGoalCloudOperation } from "./queue";
import { publishGoalStoreChange, readGoalStore, writeGoalStore } from "@/features/goals/data/goal-store";
import { readGoalCloudQueue, writeGoalCloudQueue } from "./queue";
import { readGoalCloudState, writeGoalCloudState } from "./state";

export interface RemoteGoalSnapshot {
  goal: Goal | null;
  goalId: string;
  revision: number;
  deletedAt: string | null;
}

export interface GoalManualTransferPlan {
  additions: Goal[];
  sameIds: string[];
  conflicts: { local: Goal; remote: RemoteGoalSnapshot }[];
  remoteTombstones: RemoteGoalSnapshot[];
}

export function planCloudGoalsToLocalMerge(localGoals: readonly Goal[], remote: readonly RemoteGoalSnapshot[]): GoalManualTransferPlan {
  const localById = new Map(localGoals.map((goal) => [goal.id, goal]));
  const additions: Goal[] = [];
  const sameIds: string[] = [];
  const conflicts: GoalManualTransferPlan["conflicts"] = [];
  const remoteTombstones: RemoteGoalSnapshot[] = [];
  for (const snapshot of [...remote].sort((a, b) => a.goalId.localeCompare(b.goalId, "en"))) {
    const local = localById.get(snapshot.goalId);
    if (snapshot.deletedAt) {
      if (local) conflicts.push({ local, remote: snapshot });
      else remoteTombstones.push(snapshot);
      continue;
    }
    if (!snapshot.goal) continue;
    if (!local) additions.push(snapshot.goal);
    else if (sameGoalDefinition(local, snapshot.goal)) sameIds.push(snapshot.goalId);
    else conflicts.push({ local, remote: snapshot });
  }
  return { additions, sameIds, conflicts, remoteTombstones };
}

export function applyCloudGoalsToLocalMerge(
  scope: LocalOwnerScope,
  remote: readonly RemoteGoalSnapshot[],
  storage?: PersonalStorageLike | null,
): { ok: true; added: number } | { ok: false; code: "conflict" | "write_failed" } {
  const local = readGoalStore(scope, storage);
  if (local.status === "error") return { ok: false, code: "write_failed" };
  const plan = planCloudGoalsToLocalMerge(local.data.goals, remote);
  if (plan.conflicts.length > 0) return { ok: false, code: "conflict" };
  const written = writeGoalStore(scope, [...local.data.goals, ...plan.additions], { storage });
  if (!written.ok) return { ok: false, code: "write_failed" };
  publishGoalStoreChange(scope);
  return { ok: true, added: plan.additions.length };
}

export function replaceLocalGoalsFromCloud(
  scope: LocalOwnerScope,
  remote: readonly RemoteGoalSnapshot[],
  confirmation: { confirmed: true },
  storage?: PersonalStorageLike | null,
): { ok: true; goals: number } | { ok: false; code: "confirmation_required" | "dispatch_started" | "write_failed" } {
  if (confirmation.confirmed !== true) return { ok: false, code: "confirmation_required" };
  const queue = readGoalCloudQueue(scope, storage);
  if (queue.some((item) => item.dispatchStartedAt)) return { ok: false, code: "dispatch_started" };
  const beforeStore = readGoalStore(scope, storage);
  if (beforeStore.status === "error") return { ok: false, code: "write_failed" };
  const beforeState = readGoalCloudState(scope, storage);
  const goals = remote.flatMap((entry) => entry.deletedAt === null && entry.goal ? [entry.goal] : []);
  const records = remote.map((entry) => ({
    goalId: entry.goalId,
    revision: entry.revision,
    deletedAt: entry.deletedAt,
    lastOperationId: "manual-cloud-replace",
    ...(entry.goal ? { lastSyncedDefinition: entry.goal } : {}),
    updatedAt: new Date().toISOString(),
  }));
  if (!writeGoalStore(scope, goals, { storage }).ok) return { ok: false, code: "write_failed" };
  if (!writeGoalCloudQueue(scope, [], storage) || !writeGoalCloudState(scope, records, storage)) {
    writeGoalStore(scope, beforeStore.data.goals, { storage });
    writeGoalCloudQueue(scope, queue, storage);
    writeGoalCloudState(scope, beforeState.records, storage);
    return { ok: false, code: "write_failed" };
  }
  publishGoalStoreChange(scope);
  return { ok: true, goals: goals.length };
}

export function enqueueLocalGoalsToCloud(
  scope: LocalOwnerScope,
  goals: readonly Goal[],
  storage?: PersonalStorageLike | null,
): number {
  if (scope.kind !== "user") return 0;
  return goals.reduce((count, goal) =>
    count + (enqueueGoalCloudOperation(scope, "upsert", goal.id, goal, { storage }) ? 1 : 0), 0);
}
