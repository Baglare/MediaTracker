import {
  isLocalOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";
import type { SyncEntity, SyncOperation, SyncQueueItem } from "./types";

export const LEGACY_SYNC_QUEUE_KEY = "media-tracker-sync-queue";
const LEGACY_QUEUE_REVIEW_KEY = "mediaTracker:queueMigration:v1:ownerless-reviewed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
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
  if (item.ownerScope !== scope.key) return false;
  if (scope.kind === "user" && item.userId !== scope.userId) return false;
  if (scope.kind === "guest" && item.userId !== undefined) return false;
  return true;
}

export function loadSyncQueue(scope: LocalOwnerScope): SyncQueueItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(buildSyncQueueKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => isSyncQueueItem(item, scope)) : [];
  } catch {
    return [];
  }
}

export function saveSyncQueue(scope: LocalOwnerScope, queue: SyncQueueItem[]): void {
  if (!isBrowser()) return;
  const safe = queue.filter((item) => isSyncQueueItem(item, scope));
  localStorage.setItem(buildSyncQueueKey(scope), JSON.stringify(safe));
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
  if (!isBrowser()) return;
  localStorage.removeItem(buildSyncQueueKey(scope));
}

export function getPendingSyncCount(scope: LocalOwnerScope): number {
  return loadSyncQueue(scope).length;
}

/**
 * D1B.1 ownerless queue is preserved as raw quarantine evidence. It is never
 * copied into a guest or authenticated queue.
 */
export function quarantineLegacyOwnerlessQueue(): string | null {
  if (!isBrowser()) return null;
  try {
    if (localStorage.getItem(LEGACY_QUEUE_REVIEW_KEY)) return null;
    const raw = localStorage.getItem(LEGACY_SYNC_QUEUE_KEY);
    if (raw === null) return null;
    const key = `mediaTracker:quarantine:cloud-sync-queue:${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({
      format: "mediatracker-local-quarantine",
      domain: "cloud-sync-queue",
      sourceKey: LEGACY_SYNC_QUEUE_KEY,
      capturedAt: new Date().toISOString(),
      errorCodes: ["owner_scope_missing"],
      rawPayload: raw,
    }));
    localStorage.setItem(LEGACY_QUEUE_REVIEW_KEY, JSON.stringify({
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
