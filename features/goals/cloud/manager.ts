import type { Goal } from "@/features/goals/domain/types";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import { dispatchGoalCloudQueueItem, type GoalCloudRpcClient } from "./client";
import { getGoalCloudRolloutContract } from "./rollout";
import {
  enqueueGoalCloudOperation,
  publishGoalCloudQueueChange,
  readGoalCloudQueue,
  writeGoalCloudQueue,
} from "./queue";
import { writeGoalCloudRecordState } from "./state";
import type { GoalCloudConflict, GoalCloudQueueItem } from "./types";

const MAX_RETRY_COUNT = 5;
type Listener = () => void;
const listeners = new Set<Listener>();
let activeScope: LocalOwnerScope | null = null;
let generation = 0;
let syncing = false;
let lastError: string | null = null;
let cachedSnapshot: GoalCloudSyncSnapshot | null = null;

export interface GoalCloudSyncSnapshot {
  ownerKey: string | null;
  enabled: boolean;
  status: "disabled" | "ready" | "incompatible";
  pending: number;
  retryable: number;
  blocked: number;
  permanent: number;
  syncing: boolean;
  message: string | null;
}

function notify(scope?: LocalOwnerScope) {
  cachedSnapshot = computeGoalCloudSyncSnapshot();
  if (scope) publishGoalCloudQueueChange(scope);
  listeners.forEach((listener) => listener());
}

export function setGoalCloudOwnerScope(scope: LocalOwnerScope | null) {
  if (activeScope?.key === scope?.key) return;
  generation += 1;
  activeScope = scope;
  syncing = false;
  lastError = null;
  notify();
}

function computeGoalCloudSyncSnapshot(): GoalCloudSyncSnapshot {
  const rollout = getGoalCloudRolloutContract();
  const queue = activeScope ? readGoalCloudQueue(activeScope) : [];
  return {
    ownerKey: activeScope?.key ?? null,
    enabled: rollout.enabled,
    status: rollout.status,
    pending: queue.filter((item) => !item.blockedConflict && !item.permanentFailure).length,
    retryable: queue.filter((item) => item.retryCount > 0 && !item.blockedConflict && !item.permanentFailure).length,
    blocked: queue.filter((item) => Boolean(item.blockedConflict)).length,
    permanent: queue.filter((item) => Boolean(item.permanentFailure)).length,
    syncing,
    message: rollout.message ?? lastError,
  };
}

export function getGoalCloudSyncSnapshot(): GoalCloudSyncSnapshot {
  cachedSnapshot ??= computeGoalCloudSyncSnapshot();
  return cachedSnapshot;
}

export function subscribeGoalCloudSync(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function queueGoalCloudMutation(
  scope: LocalOwnerScope,
  input: { operation: "upsert"; goal: Goal } | { operation: "tombstone"; goalId: string; goal?: Goal },
  options: { storage?: PersonalStorageLike | null; now?: () => Date; operationId?: string } = {},
): GoalCloudQueueItem | null {
  const rollout = getGoalCloudRolloutContract();
  if (!rollout.enabled || scope.kind !== "user") return null;
  const item = input.operation === "upsert"
    ? enqueueGoalCloudOperation(scope, "upsert", input.goal.id, input.goal, options)
    : enqueueGoalCloudOperation(scope, "tombstone", input.goalId, input.goal, options);
  if (item) notify(scope);
  if (item && rollout.status === "ready" && activeScope?.key === scope.key) void flushGoalCloudQueue();
  return item;
}

function conflictFor(item: GoalCloudQueueItem, status: "revision_conflict" | "deleted_conflict" | "operation_id_reused", snapshot: { revision: number; deletedAt: string | null; definition?: Goal }): GoalCloudConflict {
  return {
    kind: status === "operation_id_reused"
      ? "operation_id_reused"
      : status === "deleted_conflict"
        ? "local_update_vs_remote_tombstone"
        : item.operation === "tombstone"
          ? "local_delete_vs_newer_cloud"
          : "local_update_vs_newer_cloud",
    serverRevision: snapshot.revision,
    serverDeletedAt: snapshot.deletedAt,
    ...(snapshot.definition ? { serverDefinition: snapshot.definition } : {}),
    detectedAt: new Date().toISOString(),
  };
}

export async function flushGoalCloudQueue(options: {
  storage?: PersonalStorageLike | null;
  client?: GoalCloudRpcClient | null;
  isOwnerActive?: (scope: LocalOwnerScope) => boolean;
} = {}): Promise<void> {
  if (syncing || !activeScope || activeScope.kind !== "user") return;
  const rollout = getGoalCloudRolloutContract();
  if (rollout.status !== "ready") { lastError = rollout.message; notify(); return; }
  const scope = activeScope;
  const runGeneration = generation;
  const eligible = readGoalCloudQueue(scope, options.storage).filter((item) =>
    !item.blockedConflict && !item.permanentFailure && item.retryCount < MAX_RETRY_COUNT);
  if (eligible.length === 0) return;
  syncing = true;
  lastError = null;
  const startedAt = new Date().toISOString();
  const startedIds = new Set(eligible.map((item) => item.operationId));
  const marked = readGoalCloudQueue(scope, options.storage).map((item) =>
    startedIds.has(item.operationId) && !item.dispatchStartedAt ? { ...item, dispatchStartedAt: startedAt } : item);
  if (!writeGoalCloudQueue(scope, marked, options.storage)) {
    syncing = false; lastError = "Hedef kuyruğu gönderim işareti yazılamadı."; notify(scope); return;
  }
  for (const original of eligible) {
    if (runGeneration !== generation || activeScope?.key !== scope.key || (options.isOwnerActive && !options.isOwnerActive(scope))) break;
    const result = await dispatchGoalCloudQueueItem({ ...original, dispatchStartedAt: startedAt }, options.client);
    if (runGeneration !== generation || activeScope?.key !== scope.key) break;
    let queue = readGoalCloudQueue(scope, options.storage);
    const current = queue.find((item) => item.operationId === original.operationId);
    if (!current) continue;
    if (result.kind === "result" && ["applied", "idempotent_replay"].includes(result.snapshot.status)) {
      const stored = writeGoalCloudRecordState(scope, {
        goalId: original.goalId,
        revision: result.snapshot.revision,
        deletedAt: result.snapshot.deletedAt,
        lastOperationId: original.operationId,
        ...(result.snapshot.definition ? { lastSyncedDefinition: result.snapshot.definition } : original.definition ? { lastSyncedDefinition: original.definition } : {}),
        updatedAt: new Date().toISOString(),
      }, options.storage);
      if (stored) queue = queue.filter((item) => item.operationId !== original.operationId);
      else lastError = "Hedef Cloud revision sidecar kaydedilemedi.";
    } else if (result.kind === "result" && ["revision_conflict", "deleted_conflict", "operation_id_reused"].includes(result.snapshot.status)) {
      queue = queue.map((item) => item.operationId === original.operationId
        ? { ...item, blockedConflict: conflictFor(item, result.snapshot.status as "revision_conflict" | "deleted_conflict" | "operation_id_reused", result.snapshot) }
        : item);
    } else if (result.kind === "invalid" && result.code === "malformed_server_definition") {
      queue = queue.map((item) => item.operationId === original.operationId
        ? { ...item, blockedConflict: { kind: "malformed_server_definition", serverRevision: item.expectedRevision, serverDeletedAt: null, detectedAt: new Date().toISOString() } }
        : item);
    } else if ((result.kind === "result" && result.snapshot.status === "invalid_payload") || result.kind === "invalid") {
      const code = result.kind === "invalid" && result.code === "malformed_server_definition"
        ? "invalid_payload" as const : "invalid_payload" as const;
      queue = queue.map((item) => item.operationId === original.operationId
        ? { ...item, permanentFailure: { code, detectedAt: new Date().toISOString() } }
        : item);
    } else {
      queue = queue.map((item) => item.operationId === original.operationId
        ? {
            ...item,
            retryCount: item.retryCount + 1,
            lastError: result.kind === "retryable" ? "Hedef Cloud işlemi yeniden denenecek." : "Hedef Cloud yanıtı doğrulanamadı.",
            ...(item.retryCount + 1 >= MAX_RETRY_COUNT
              ? { permanentFailure: { code: "retry_exhausted" as const, detectedAt: new Date().toISOString() } }
              : {}),
          }
        : item);
    }
    writeGoalCloudQueue(scope, queue, options.storage);
    notify(scope);
  }
  syncing = false;
  notify(scope);
}
