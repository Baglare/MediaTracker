import {
  isLocalOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";
import type { SyncEntity, SyncOperation, SyncQueueItem } from "./types";

export const LEGACY_SYNC_QUEUE_KEY = "media-tracker-sync-queue";
const LEGACY_QUEUE_REVIEW_KEY = "mediaTracker:queueMigration:v1:ownerless-reviewed";

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
  return `mediaTracker:queue:v1:${scope.storageKey}:cloudSync`;
}

function generateId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function isSyncQueueItem(value: unknown, scope: LocalOwnerScope): value is SyncQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length === 0) return false;
  if (item.entity !== "media_item" && item.entity !== "progress_log") return false;
  if (item.operation !== "upsert" && item.operation !== "delete") return false;
  if (!item.payload || typeof item.payload !== "object") return false;
  if (typeof item.createdAt !== "string" || item.createdAt.length === 0) return false;
  if (typeof item.retryCount !== "number" || !Number.isInteger(item.retryCount) || item.retryCount < 0) return false;
  if (item.lastError !== undefined && typeof item.lastError !== "string") return false;
  if (
    item.dispatchStartedAt !== undefined
    && (
      typeof item.dispatchStartedAt !== "string"
      || !Number.isFinite(Date.parse(item.dispatchStartedAt))
    )
  ) return false;
  if (item.ownerScope !== scope.key) return false;
  if (scope.kind === "user" && item.userId !== scope.userId) return false;
  if (scope.kind === "guest" && item.userId !== undefined) return false;
  return true;
}

export function loadSyncQueue(
  scope: LocalOwnerScope,
  storage: SyncQueueStorageLike | null = browserStorage(),
): SyncQueueItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(buildSyncQueueKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => isSyncQueueItem(item, scope)) : [];
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
  if (raw === null) return { status: "missing", items: [], issues: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt", items: [], issues: [] };
  }
  if (!Array.isArray(parsed)) return { status: "corrupt", items: [], issues: [] };
  const items: SyncQueueItem[] = [];
  const issues: SyncQueueInspectionIssue[] = [];
  parsed.forEach((value, index) => {
    const rawItem = value && typeof value === "object"
      ? value as Record<string, unknown>
      : null;
    const payload = rawItem?.payload && typeof rawItem.payload === "object"
      ? rawItem.payload as Record<string, unknown>
      : null;
    const recordId = typeof payload?.id === "string" ? payload.id : undefined;
    const ownerMismatch = Boolean(
      rawItem
      && (
        rawItem.ownerScope !== scope.key
        || (scope.kind === "user" && rawItem.userId !== scope.userId)
        || (scope.kind === "guest" && rawItem.userId !== undefined)
      ),
    );
    if (ownerMismatch) {
      issues.push({ code: "queue_owner_mismatch", index, recordId });
      return;
    }
    if (!isSyncQueueItem(value, scope)) {
      issues.push({ code: "queue_item_invalid", index, recordId });
      return;
    }
    items.push(value);
  });
  return { status: "valid", items, issues };
}

export function saveSyncQueue(
  scope: LocalOwnerScope,
  queue: SyncQueueItem[],
  storage: SyncQueueStorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  const safe = queue.filter((item) => isSyncQueueItem(item, scope));
  storage.setItem(buildSyncQueueKey(scope), JSON.stringify(safe));
}

export function replaceSyncQueueDurably(
  scope: LocalOwnerScope,
  queue: SyncQueueItem[],
  storage: SyncQueueStorageLike | null = browserStorage(),
): boolean {
  if (!storage) return false;
  const safe = queue.filter((item) => isSyncQueueItem(item, scope));
  try {
    const serialized = JSON.stringify(safe);
    storage.setItem(buildSyncQueueKey(scope), serialized);
    if (storage.getItem(buildSyncQueueKey(scope)) !== serialized) return false;
    return JSON.stringify(loadSyncQueue(scope, storage)) === serialized;
  } catch {
    return false;
  }
}

export function enqueueSyncOperation(
  scope: LocalOwnerScope,
  input: {
    entity: SyncEntity;
    operation: SyncOperation;
    payload: unknown;
  },
): SyncQueueItem[] {
  const item: SyncQueueItem = {
    id: generateId(),
    entity: input.entity,
    operation: input.operation,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    ownerScope: scope.key,
    userId: scope.kind === "user" ? scope.userId : undefined,
  };
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
