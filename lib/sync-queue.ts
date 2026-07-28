import {
  isLocalOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";
import type { SyncEntity, SyncOperation, SyncQueueItem } from "./types";
import {
  getCloudMediaV2RecordState,
} from "./cloud-media-v2-state";
import { isCloudMediaV2Enabled } from "./cloud-media-v2-client";

export const LEGACY_SYNC_QUEUE_KEY = "media-tracker-sync-queue";
export const SYNC_QUEUE_SCHEMA_VERSION = 2 as const;
const LEGACY_QUEUE_REVIEW_KEY = "mediaTracker:queueMigration:v1:ownerless-reviewed";
const CLOUD_MEDIA_V2_CONFLICT_REASONS = new Set([
  "revision_mismatch",
  "tombstoned",
  "record_id_unavailable",
  "media_target_unavailable",
  "not_found",
  "already_tombstoned",
  "not_tombstoned",
  "immutable_log_conflict",
  "unknown",
]);

export interface SyncQueueStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SyncQueueInspectionIssue {
  code: "queue_owner_mismatch" | "queue_item_invalid";
  index: number;
  recordId?: string;
}

export type SyncQueueInspectionResult =
  | { status: "missing"; items: SyncQueueItem[]; issues: SyncQueueInspectionIssue[] }
  | { status: "valid"; items: SyncQueueItem[]; issues: SyncQueueInspectionIssue[] }
  | { status: "corrupt" | "storage_unavailable"; items: []; issues: SyncQueueInspectionIssue[] };

function browserStorage(): SyncQueueStorageLike | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function buildSyncQueueKey(scope: LocalOwnerScope): string {
  if (!isLocalOwnerScope(scope)) throw new Error("invalid_local_owner_scope");
  return `mediaTracker:queue:v2:${scope.storageKey}:cloudSync`;
}

export function buildLegacyScopedSyncQueueKey(
  scope: LocalOwnerScope,
): string {
  if (!isLocalOwnerScope(scope)) throw new Error("invalid_local_owner_scope");
  return `mediaTracker:queue:v1:${scope.storageKey}:cloudSync`;
}

function generateId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSyncQueueItem(
  value: unknown,
  scope: LocalOwnerScope,
): SyncQueueItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length === 0) return null;
  if (item.entity !== "media_item" && item.entity !== "progress_log") return null;
  if (
    item.operation !== "upsert"
    && item.operation !== "delete"
    && item.operation !== "restore"
  ) return null;
  if (!isRecord(item.payload)) return null;
  if (
    typeof item.createdAt !== "string"
    || !Number.isFinite(Date.parse(item.createdAt))
  ) return null;
  if (
    typeof item.retryCount !== "number"
    || !Number.isInteger(item.retryCount)
    || item.retryCount < 0
  ) return null;
  if (item.lastError !== undefined && typeof item.lastError !== "string") return null;
  if (
    item.dispatchStartedAt !== undefined
    && (
      typeof item.dispatchStartedAt !== "string"
      || !Number.isFinite(Date.parse(item.dispatchStartedAt))
    )
  ) return null;
  if (item.ownerScope !== scope.key) return null;
  if (scope.kind === "user" && item.userId !== scope.userId) return null;
  if (scope.kind === "guest" && item.userId !== undefined) return null;

  const transport = item.transport === "cloud-v2" ? "cloud-v2" : "legacy";
  if (transport === "cloud-v2" && scope.kind !== "user") return null;
  if (item.operation === "restore" && transport !== "cloud-v2") return null;
  const operationId = typeof item.operationId === "string"
    && item.operationId.length >= 8
    ? item.operationId
    : item.id;
  const expectedRevision = typeof item.expectedRevision === "number"
    && Number.isSafeInteger(item.expectedRevision)
    && item.expectedRevision >= 0
    ? item.expectedRevision
    : 0;
  let blockedConflict: SyncQueueItem["blockedConflict"];
  if (item.blockedConflict !== undefined) {
    if (
      !isRecord(item.blockedConflict)
      || typeof item.blockedConflict.reason !== "string"
      || !CLOUD_MEDIA_V2_CONFLICT_REASONS.has(item.blockedConflict.reason)
      || typeof item.blockedConflict.serverRevision !== "number"
      || !Number.isSafeInteger(item.blockedConflict.serverRevision)
      || item.blockedConflict.serverRevision < 0
      || (
        item.blockedConflict.serverDeletedAt !== null
        && (
          typeof item.blockedConflict.serverDeletedAt !== "string"
          || !Number.isFinite(Date.parse(item.blockedConflict.serverDeletedAt))
        )
      )
      || typeof item.blockedConflict.detectedAt !== "string"
      || !Number.isFinite(Date.parse(item.blockedConflict.detectedAt))
    ) return null;
    blockedConflict = {
      reason: item.blockedConflict.reason as NonNullable<
        SyncQueueItem["blockedConflict"]
      >["reason"],
      serverRevision: item.blockedConflict.serverRevision,
      serverDeletedAt: item.blockedConflict.serverDeletedAt,
      detectedAt: item.blockedConflict.detectedAt,
    };
  }
  return {
    ...item,
    schemaVersion: SYNC_QUEUE_SCHEMA_VERSION,
    operationId,
    transport,
    expectedRevision,
    ...(blockedConflict ? { blockedConflict } : {}),
  } as SyncQueueItem;
}

interface SyncQueueEnvelope {
  format: "mediatracker-cloud-sync-queue";
  schemaVersion: 2;
  ownerScope: string;
  writtenAt: string;
  items: SyncQueueItem[];
}

function decodeEnvelope(
  raw: string,
  scope: LocalOwnerScope,
): SyncQueueItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed)
    || parsed.format !== "mediatracker-cloud-sync-queue"
    || parsed.schemaVersion !== SYNC_QUEUE_SCHEMA_VERSION
    || parsed.ownerScope !== scope.key
    || typeof parsed.writtenAt !== "string"
    || !Number.isFinite(Date.parse(parsed.writtenAt))
    || !Array.isArray(parsed.items)
  ) return null;
  const items = parsed.items.map((entry) => normalizeSyncQueueItem(entry, scope));
  return items.every((entry): entry is SyncQueueItem => entry !== null)
    ? items
    : null;
}

function decodeLegacyArray(
  raw: string,
  scope: LocalOwnerScope,
): SyncQueueItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const items = parsed.map((entry) => normalizeSyncQueueItem(entry, scope));
  return items.every((entry): entry is SyncQueueItem => entry !== null)
    ? items.map((item) => ({
        ...item,
        schemaVersion: 2,
        operationId: item.operationId ?? item.id,
        transport: "legacy",
        expectedRevision: 0,
      }))
    : null;
}

function serializeQueue(
  scope: LocalOwnerScope,
  queue: SyncQueueItem[],
): string {
  const items = queue
    .map((item) => normalizeSyncQueueItem(item, scope))
    .filter((item): item is SyncQueueItem => item !== null);
  return JSON.stringify({
    format: "mediatracker-cloud-sync-queue",
    schemaVersion: SYNC_QUEUE_SCHEMA_VERSION,
    ownerScope: scope.key,
    writtenAt: new Date().toISOString(),
    items,
  } satisfies SyncQueueEnvelope);
}

export function loadSyncQueue(
  scope: LocalOwnerScope,
  storage: SyncQueueStorageLike | null = browserStorage(),
): SyncQueueItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(buildSyncQueueKey(scope));
    if (raw !== null) return decodeEnvelope(raw, scope) ?? [];
    const legacyRaw = storage.getItem(buildLegacyScopedSyncQueueKey(scope));
    if (legacyRaw === null) return [];
    const migrated = decodeLegacyArray(legacyRaw, scope);
    if (!migrated) return [];
    storage.setItem(buildSyncQueueKey(scope), serializeQueue(scope, migrated));
    return migrated;
  } catch {
    return [];
  }
}

export function inspectSyncQueue(
  scope: LocalOwnerScope,
  storage: Pick<SyncQueueStorageLike, "getItem"> | null = browserStorage(),
): SyncQueueInspectionResult {
  if (!storage) return { status: "storage_unavailable", items: [], issues: [] };
  let raw: string | null;
  try {
    raw = storage.getItem(buildSyncQueueKey(scope));
  } catch {
    return { status: "storage_unavailable", items: [], issues: [] };
  }
  if (raw !== null) {
    const items = decodeEnvelope(raw, scope);
    return items
      ? { status: "valid", items, issues: [] }
      : { status: "corrupt", items: [], issues: [] };
  }
  let legacyRaw: string | null;
  try {
    legacyRaw = storage.getItem(buildLegacyScopedSyncQueueKey(scope));
  } catch {
    return { status: "storage_unavailable", items: [], issues: [] };
  }
  if (legacyRaw === null) return { status: "missing", items: [], issues: [] };
  const items = decodeLegacyArray(legacyRaw, scope);
  return items
    ? { status: "valid", items, issues: [] }
    : { status: "corrupt", items: [], issues: [] };
}

export function saveSyncQueue(
  scope: LocalOwnerScope,
  queue: SyncQueueItem[],
  storage: SyncQueueStorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  storage.setItem(buildSyncQueueKey(scope), serializeQueue(scope, queue));
}

export function replaceSyncQueueDurably(
  scope: LocalOwnerScope,
  queue: SyncQueueItem[],
  storage: SyncQueueStorageLike | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    const serialized = serializeQueue(scope, queue);
    storage.setItem(buildSyncQueueKey(scope), serialized);
    if (storage.getItem(buildSyncQueueKey(scope)) !== serialized) return false;
    return decodeEnvelope(serialized, scope) !== null;
  } catch {
    return false;
  }
}

export function createSyncQueueItem(
  scope: LocalOwnerScope,
  input: {
    entity: SyncEntity;
    operation: SyncOperation;
    payload: unknown;
    id?: string;
    createdAt?: string;
  },
): SyncQueueItem {
  const id = input.id ?? generateId();
  const payload = isRecord(input.payload) ? input.payload : {};
  const recordId = typeof payload.id === "string" ? payload.id : "";
  const v2 = scope.kind === "user" && isCloudMediaV2Enabled();
  const state = v2 && recordId
    ? getCloudMediaV2RecordState(scope, input.entity, recordId)
    : undefined;
  return {
    schemaVersion: 2,
    id,
    operationId: id,
    transport: v2 ? "cloud-v2" : "legacy",
    entity: input.entity,
    operation: input.operation,
    expectedRevision: v2 ? state?.revision ?? 0 : 0,
    payload: input.payload,
    createdAt: input.createdAt ?? new Date().toISOString(),
    retryCount: 0,
    ownerScope: scope.key,
    userId: scope.kind === "user" ? scope.userId : undefined,
  };
}

export function enqueueSyncOperation(
  scope: LocalOwnerScope,
  input: {
    entity: SyncEntity;
    operation: SyncOperation;
    payload: unknown;
  },
): SyncQueueItem[] {
  const item = createSyncQueueItem(scope, input);
  const next = [...loadSyncQueue(scope), item];
  saveSyncQueue(scope, next);
  return next;
}

export function clearSyncQueue(scope: LocalOwnerScope): void {
  const storage = browserStorage();
  if (!storage) return;
  storage.removeItem(buildSyncQueueKey(scope));
}

export function getPendingSyncCount(scope: LocalOwnerScope): number {
  return loadSyncQueue(scope).length;
}

/**
 * D1B.1 ownerless queue is preserved as raw quarantine evidence. It is never
 * copied into a guest or authenticated queue.
 */
export function quarantineLegacyOwnerlessQueue(): string | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    if (storage.getItem(LEGACY_QUEUE_REVIEW_KEY)) return null;
    const raw = storage.getItem(LEGACY_SYNC_QUEUE_KEY);
    if (raw === null) return null;
    const key = `mediaTracker:quarantine:cloud-sync-queue:${Date.now()}`;
    storage.setItem(key, JSON.stringify({
      format: "mediatracker-local-quarantine",
      domain: "cloud-sync-queue",
      sourceKey: LEGACY_SYNC_QUEUE_KEY,
      capturedAt: new Date().toISOString(),
      errorCodes: ["owner_scope_missing"],
      rawPayload: raw,
    }));
    storage.setItem(LEGACY_QUEUE_REVIEW_KEY, JSON.stringify({
      version: 1,
      sourceKey: LEGACY_SYNC_QUEUE_KEY,
      quarantineKey: key,
      reviewedAt: new Date().toISOString(),
    }));
    return key;
  } catch {
    return null;
  }
}
