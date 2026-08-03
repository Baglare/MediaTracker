import { decodeGoal } from "@/features/goals/domain/codec";
import type { Goal } from "@/features/goals/domain/types";
import { publishGoalStoreChange, readGoalStore, writeGoalStore } from "@/features/goals/data/goal-store";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import { enqueueGoalCloudOperation, publishGoalCloudQueueChange, readGoalCloudQueue, writeGoalCloudQueue } from "./queue";
import { writeGoalCloudRecordState } from "./state";

export function listGoalCloudConflicts(scope: LocalOwnerScope, storage?: PersonalStorageLike | null) {
  return readGoalCloudQueue(scope, storage).filter((item) => item.blockedConflict);
}

function writeGoals(scope: LocalOwnerScope, goals: Goal[], storage?: PersonalStorageLike | null): boolean {
  const result = writeGoalStore(scope, goals, { storage });
  if (result.ok) publishGoalStoreChange(scope);
  return result.ok;
}

export function acceptCloudGoalVersion(scope: LocalOwnerScope, operationId: string, storage?: PersonalStorageLike | null): boolean {
  const queue = readGoalCloudQueue(scope, storage);
  const item = queue.find((entry) => entry.operationId === operationId && entry.blockedConflict);
  if (!item?.blockedConflict) return false;
  const store = readGoalStore(scope, storage);
  if (store.status === "error") return false;
  const remote = item.blockedConflict.serverDefinition;
  const goals = remote
    ? store.data.goals.filter((goal) => goal.id !== item.goalId).concat(remote)
    : store.data.goals.filter((goal) => goal.id !== item.goalId);
  if (!writeGoals(scope, goals, storage)) return false;
  if (!writeGoalCloudRecordState(scope, {
    goalId: item.goalId,
    revision: item.blockedConflict.serverRevision,
    deletedAt: item.blockedConflict.serverDeletedAt,
    lastOperationId: item.operationId,
    ...(remote ? { lastSyncedDefinition: remote } : {}),
    updatedAt: new Date().toISOString(),
  }, storage)) return false;
  const written = writeGoalCloudQueue(scope, queue.filter((entry) => entry.operationId !== operationId), storage);
  if (written) publishGoalCloudQueueChange(scope);
  return written;
}

export function overwriteCloudGoalWithLocal(scope: LocalOwnerScope, operationId: string, storage?: PersonalStorageLike | null): boolean {
  const queue = readGoalCloudQueue(scope, storage);
  const blocked = queue.find((entry) => entry.operationId === operationId && entry.blockedConflict);
  const local = readGoalStore(scope, storage).data.goals.find((goal) => goal.id === blocked?.goalId);
  if (!blocked?.blockedConflict || !local) return false;
  const fresh = enqueueGoalCloudOperation(scope, "upsert", local.id, local, { storage });
  if (!fresh) return false;
  const latest = readGoalCloudQueue(scope, storage).map((entry) => entry.operationId === fresh.operationId
    ? { ...entry, expectedRevision: blocked.blockedConflict!.serverRevision }
    : entry).filter((entry) => entry.operationId !== operationId);
  const written = writeGoalCloudQueue(scope, latest, storage);
  if (written) publishGoalCloudQueueChange(scope);
  return written;
}

export function saveConflictingGoalAsCopy(
  scope: LocalOwnerScope,
  operationId: string,
  options: { id: string; now: string; storage?: PersonalStorageLike | null },
): Goal | null {
  const queue = readGoalCloudQueue(scope, options.storage);
  const blocked = queue.find((entry) => entry.operationId === operationId && entry.blockedConflict);
  const local = readGoalStore(scope, options.storage).data.goals.find((goal) => goal.id === blocked?.goalId);
  if (!blocked || !local) return null;
  const decoded = decodeGoal({ ...local, id: options.id, createdAt: options.now, updatedAt: options.now });
  if (!decoded.ok) return null;
  const store = readGoalStore(scope, options.storage);
  if (!writeGoals(scope, [...store.data.goals, decoded.value], options.storage)) return null;
  const next = queue.filter((entry) => entry.operationId !== operationId);
  if (!writeGoalCloudQueue(scope, next, options.storage)) return null;
  enqueueGoalCloudOperation(scope, "upsert", decoded.value.id, decoded.value, { storage: options.storage });
  publishGoalCloudQueueChange(scope);
  return decoded.value;
}
