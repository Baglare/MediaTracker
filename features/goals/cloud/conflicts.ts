import { decodeGoal } from "@/features/goals/domain/codec";
import type { Goal } from "@/features/goals/domain/types";
import { publishGoalStoreChange, readGoalStore, writeGoalStore } from "@/features/goals/data/goal-store";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import { enqueueGoalCloudOperation, publishGoalCloudQueueChange, readGoalCloudQueue, writeGoalCloudQueue } from "./queue";
import { readGoalCloudState, writeGoalCloudRecordState, writeGoalCloudState } from "./state";

export function listGoalCloudConflicts(scope: LocalOwnerScope, storage?: PersonalStorageLike | null) {
  return readGoalCloudQueue(scope, storage).filter((item) => item.blockedConflict);
}

function writeGoals(scope: LocalOwnerScope, goals: Goal[], storage?: PersonalStorageLike | null): boolean {
  return writeGoalStore(scope, goals, { storage }).ok;
}

function restoreConflictState(
  scope: LocalOwnerScope,
  goals: readonly Goal[],
  queue: ReturnType<typeof readGoalCloudQueue>,
  cloudState: ReturnType<typeof readGoalCloudState>,
  storage?: PersonalStorageLike | null,
): void {
  writeGoalStore(scope, goals, { storage });
  writeGoalCloudQueue(scope, queue, storage);
  writeGoalCloudState(scope, cloudState.records, storage);
}

export function acceptCloudGoalVersion(scope: LocalOwnerScope, operationId: string, storage?: PersonalStorageLike | null): boolean {
  const queue = readGoalCloudQueue(scope, storage);
  const item = queue.find((entry) => entry.operationId === operationId && entry.blockedConflict);
  if (!item?.blockedConflict) return false;
  if (item.blockedConflict.kind === "malformed_server_definition"
    || (!item.blockedConflict.serverDefinition && !item.blockedConflict.serverDeletedAt)) return false;
  const store = readGoalStore(scope, storage);
  if (store.status === "error") return false;
  const cloudState = readGoalCloudState(scope, storage);
  const remote = item.blockedConflict.serverDeletedAt
    ? undefined
    : item.blockedConflict.serverDefinition;
  const goals = remote
    ? store.data.goals.filter((goal) => goal.id !== item.goalId).concat(remote)
    : store.data.goals.filter((goal) => goal.id !== item.goalId);
  if (!writeGoals(scope, goals, storage)) return false;
  if (!writeGoalCloudRecordState(scope, {
    goalId: item.goalId,
    revision: item.blockedConflict.serverRevision,
    deletedAt: item.blockedConflict.serverDeletedAt,
    lastOperationId: item.operationId,
    ...(item.blockedConflict.serverDefinition
      ? { lastSyncedDefinition: item.blockedConflict.serverDefinition }
      : {}),
    updatedAt: new Date().toISOString(),
  }, storage)) {
    restoreConflictState(scope, store.data.goals, queue, cloudState, storage);
    return false;
  }
  const written = writeGoalCloudQueue(scope, queue.filter((entry) => entry.operationId !== operationId), storage);
  if (!written) {
    restoreConflictState(scope, store.data.goals, queue, cloudState, storage);
    return false;
  }
  publishGoalStoreChange(scope);
  publishGoalCloudQueueChange(scope);
  return written;
}

export function overwriteCloudGoalWithLocal(scope: LocalOwnerScope, operationId: string, storage?: PersonalStorageLike | null): boolean {
  const queue = readGoalCloudQueue(scope, storage);
  const blocked = queue.find((entry) => entry.operationId === operationId && entry.blockedConflict);
  if (!blocked?.blockedConflict) return false;
  const local = readGoalStore(scope, storage).data.goals.find((goal) => goal.id === blocked.goalId);
  const fresh = blocked.operation === "tombstone"
    ? enqueueGoalCloudOperation(scope, "tombstone", blocked.goalId, blocked.definition, { storage })
    : local
      ? enqueueGoalCloudOperation(scope, "upsert", local.id, local, { storage })
      : null;
  if (!fresh) return false;
  const latest = readGoalCloudQueue(scope, storage).map((entry) => entry.operationId === fresh.operationId
    ? { ...entry, expectedRevision: blocked.blockedConflict!.serverRevision }
    : entry).filter((entry) => entry.operationId !== operationId);
  const written = writeGoalCloudQueue(scope, latest, storage);
  if (!written) {
    writeGoalCloudQueue(scope, queue, storage);
    return false;
  }
  publishGoalCloudQueueChange(scope);
  return written;
}

export function saveConflictingGoalAsCopy(
  scope: LocalOwnerScope,
  operationId: string,
  options: { id: string; now: string; storage?: PersonalStorageLike | null },
): Goal | null {
  const queue = readGoalCloudQueue(scope, options.storage);
  const blocked = queue.find((entry) => entry.operationId === operationId && entry.blockedConflict);
  const store = readGoalStore(scope, options.storage);
  const local = store.data.goals.find((goal) => goal.id === blocked?.goalId) ?? blocked?.definition;
  if (!blocked || !local || store.status === "error") return null;
  const decoded = decodeGoal({ ...local, id: options.id, createdAt: options.now, updatedAt: options.now });
  if (!decoded.ok) return null;
  if (!writeGoals(scope, [...store.data.goals, decoded.value], options.storage)) return null;
  const enqueued = enqueueGoalCloudOperation(scope, "upsert", decoded.value.id, decoded.value, { storage: options.storage });
  if (!enqueued) {
    writeGoalStore(scope, store.data.goals, { storage: options.storage });
    writeGoalCloudQueue(scope, queue, options.storage);
    return null;
  }
  const withCopy = readGoalCloudQueue(scope, options.storage);
  if (!writeGoalCloudQueue(scope, withCopy.filter((entry) => entry.operationId !== operationId), options.storage)) {
    writeGoalStore(scope, store.data.goals, { storage: options.storage });
    writeGoalCloudQueue(scope, queue, options.storage);
    return null;
  }
  publishGoalStoreChange(scope);
  publishGoalCloudQueueChange(scope);
  return decoded.value;
}
