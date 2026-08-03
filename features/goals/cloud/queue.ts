import { decodeGoal } from "@/features/goals/domain/codec";
import type { Goal } from "@/features/goals/domain/types";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalStorageLike,
} from "@/lib/personal-data-storage";
import { getGoalCloudRecordState } from "./state";
import type { GoalCloudConflict, GoalCloudOperationKind, GoalCloudQueueItem } from "./types";

export interface GoalCloudQueueEnvelope { version: 1; owner: string; items: GoalCloudQueueItem[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validConflict(value: unknown): value is GoalCloudConflict {
  if (!isRecord(value)
    || !["local_update_vs_newer_cloud", "local_update_vs_remote_tombstone", "local_delete_vs_newer_cloud", "operation_id_reused", "malformed_server_definition"].includes(String(value.kind))
    || !Number.isSafeInteger(value.serverRevision)
    || (value.serverRevision as number) < 0
    || (value.serverDeletedAt !== null && (typeof value.serverDeletedAt !== "string" || !Number.isFinite(Date.parse(value.serverDeletedAt))))
    || typeof value.detectedAt !== "string" || !Number.isFinite(Date.parse(value.detectedAt))) return false;
  if (value.serverDefinition !== undefined) {
    const decoded = decodeGoal(value.serverDefinition);
    if (!decoded.ok) return value.kind === "malformed_server_definition";
  }
  return true;
}

export function createGoalCloudQueueCodec(scope: LocalOwnerScope): PersonalDataCodec<GoalCloudQueueEnvelope> {
  return (value) => {
    if (!isRecord(value) || value.version !== 1 || value.owner !== scope.key || !Array.isArray(value.items)) {
      return { ok: false, message: "Goal Cloud queue envelope geçersiz." };
    }
    const items: GoalCloudQueueItem[] = [];
    const operationIds = new Set<string>();
    for (const entry of value.items) {
      if (!isRecord(entry)
        || entry.schemaVersion !== 1
        || typeof entry.operationId !== "string" || entry.operationId.length < 8 || operationIds.has(entry.operationId)
        || entry.ownerScope !== scope.key || scope.kind !== "user" || entry.userId !== scope.userId
        || typeof entry.goalId !== "string"
        || (entry.operation !== "upsert" && entry.operation !== "tombstone")
        || !Number.isSafeInteger(entry.expectedRevision) || (entry.expectedRevision as number) < 0
        || typeof entry.enqueuedAt !== "string" || !Number.isFinite(Date.parse(entry.enqueuedAt))
        || !Number.isSafeInteger(entry.retryCount) || (entry.retryCount as number) < 0
        || (entry.lastError !== undefined && typeof entry.lastError !== "string")
        || (entry.dispatchStartedAt !== undefined && (typeof entry.dispatchStartedAt !== "string" || !Number.isFinite(Date.parse(entry.dispatchStartedAt))))
        || (entry.blockedConflict !== undefined && !validConflict(entry.blockedConflict))) {
        return { ok: false, message: "Goal Cloud queue kaydı geçersiz." };
      }
      if (entry.permanentFailure !== undefined && (!isRecord(entry.permanentFailure)
        || !["invalid_payload", "retry_exhausted"].includes(String(entry.permanentFailure.code))
        || typeof entry.permanentFailure.detectedAt !== "string"
        || !Number.isFinite(Date.parse(entry.permanentFailure.detectedAt)))) {
        return { ok: false, message: "Goal Cloud permanent failure kaydı geçersiz." };
      }
      let definition: Goal | undefined;
      if (entry.operation === "upsert" || entry.definition !== undefined) {
        const decoded = decodeGoal(entry.definition);
        if (!decoded.ok || decoded.value.id !== entry.goalId) return { ok: false, message: "Goal Cloud definition geçersiz." };
        definition = decoded.value;
      }
      operationIds.add(entry.operationId);
      items.push(entry as unknown as GoalCloudQueueItem);
      if (definition) items[items.length - 1].definition = definition;
    }
    return { ok: true, value: { version: 1, owner: scope.key, items } };
  };
}

export function readGoalCloudQueue(scope: LocalOwnerScope, storage?: PersonalStorageLike | null): GoalCloudQueueItem[] {
  const result = readPersonalData(scope, "goalCloudQueue", createGoalCloudQueueCodec(scope), storage);
  return result.status === "valid" ? result.data.items : [];
}

export function writeGoalCloudQueue(scope: LocalOwnerScope, items: readonly GoalCloudQueueItem[], storage?: PersonalStorageLike | null): boolean {
  return writePersonalData(scope, "goalCloudQueue", { version: 1, owner: scope.key, items: [...items] }, createGoalCloudQueueCodec(scope), storage).ok;
}

function uuid(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value) throw new Error("goal_cloud_operation_uuid_unavailable");
  return value;
}

export function enqueueGoalCloudOperation(
  scope: LocalOwnerScope,
  operation: GoalCloudOperationKind,
  goalId: string,
  definition?: Goal,
  options: { storage?: PersonalStorageLike | null; now?: () => Date; operationId?: string } = {},
): GoalCloudQueueItem | null {
  if (scope.kind !== "user") return null;
  const current = readGoalCloudQueue(scope, options.storage);
  const revision = getGoalCloudRecordState(scope, goalId, options.storage)?.revision ?? 0;
  const item: GoalCloudQueueItem = {
    schemaVersion: 1,
    operationId: options.operationId ?? uuid(),
    ownerScope: scope.key,
    userId: scope.userId,
    goalId,
    operation,
    expectedRevision: revision,
    ...(definition ? { definition } : {}),
    enqueuedAt: (options.now ?? (() => new Date()))().toISOString(),
    retryCount: 0,
  };
  const retained = current.filter((prior) =>
    prior.goalId !== goalId || prior.dispatchStartedAt !== undefined || prior.blockedConflict !== undefined);
  return writeGoalCloudQueue(scope, [...retained, item], options.storage) ? item : null;
}

export function goalCloudQueueEventName(scope: LocalOwnerScope) {
  return `media-tracker:goal-cloud-queue:${scope.storageKey}`;
}

export function publishGoalCloudQueueChange(scope: LocalOwnerScope, target?: EventTarget | null) {
  (target ?? (typeof window === "undefined" ? null : window))?.dispatchEvent(new Event(goalCloudQueueEventName(scope)));
}
