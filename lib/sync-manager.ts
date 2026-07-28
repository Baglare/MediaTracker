// ============================================
// Sync Manager — Otomatik flush orchestration
// ============================================
// - Mutasyonları syncQueue'ya yazar (coalescing'le).
// - Online + giriş yapılmış + queue doluysa otomatik flush eder.
// - Başarılı item kuyruktan silinir; başarısız item retryCount/lastError ile kalır.
// - subscribe() ile dinlenebilir; useSyncStatus hook'u bunun üzerine kurulu.

import type {
  MediaItem,
  ProgressLog,
  SyncEntity,
  SyncOperation,
  SyncQueueItem,
} from "./types";
import {
  createSyncQueueItem,
  loadSyncQueue,
  quarantineLegacyOwnerlessQueue,
  replaceSyncQueueDurably,
  saveSyncQueue,
} from "./sync-queue";
import {
  createUserOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";
import {
  deleteMediaItem,
  uploadMediaItems,
  uploadProgressLogs,
} from "./supabase/cloud-repository";
import {
  dispatchCloudMediaV2QueueItem,
  isCloudMediaV2Enabled,
} from "./cloud-media-v2-client";
import {
  getCloudMediaV2RecordState,
  writeCloudMediaV2ServerResult,
} from "./cloud-media-v2-state";

export interface SyncSnapshot {
  /** Aktif owner scope'taki bekleyen item sayısı. Guest öğeleri flush edilmez. */
  pending: number;
  inFlight: number;
  retryable: number;
  blocked: number;
  synced: boolean;
  adapter: "legacy" | "v2";
  /** Aktif scoped key içinde owner doğrulamasını geçemeyen öğe sayısı. */
  orphaned: number;
  syncing: boolean;
  online: boolean;
  lastError: string | null;
  lastSyncAt: string | null;
  hasUser: boolean;
}

type Listener = () => void;

// ---- Modül durumu ----
let ownerScope: LocalOwnerScope | null = null;
let ownerGeneration = 0;
let syncing = false;
let lastError: string | null = null;
let lastSyncAt: string | null = null;
let online = typeof navigator !== "undefined" ? navigator.onLine : true;
let onlineListenersAttached = false;

const listeners = new Set<Listener>();
let cachedSnapshot: SyncSnapshot = computeSnapshot();
const serverSnapshot: SyncSnapshot = {
  pending: 0,
  inFlight: 0,
  retryable: 0,
  blocked: 0,
  synced: true,
  adapter: "legacy",
  orphaned: 0,
  syncing: false,
  online: true,
  lastError: null,
  lastSyncAt: null,
  hasUser: false,
};

function isFlushableForCurrentUser(item: SyncQueueItem): boolean {
  // Anonim (login öncesi) → her zaman adopte edilebilir
  if (!ownerScope || ownerScope.kind !== "user") return false;
  // Kullanıcı yoksa hiçbir şey flush edilmez
  return item.ownerScope === ownerScope.key && item.userId === ownerScope.userId;
}

function computeSnapshot(): SyncSnapshot {
  const queue = ownerScope ? loadSyncQueue(ownerScope) : [];
  let pending = 0;
  let inFlight = 0;
  let retryable = 0;
  let blocked = 0;
  let orphaned = 0;
  for (const it of queue) {
    if (!ownerScope || ownerScope.kind === "guest") {
      // Login yok → hepsi "bekliyor" sayılır, orphan kavramı uygulanmaz
      pending++;
    } else if (isFlushableForCurrentUser(it)) {
      pending++;
      if (it.blockedConflict) {
        blocked++;
      } else {
        if (it.dispatchStartedAt) inFlight++;
        if (it.retryCount > 0) retryable++;
      }
    } else {
      orphaned++;
    }
  }
  return {
    pending,
    inFlight,
    retryable,
    blocked,
    synced: pending === 0 && !syncing && lastError === null,
    adapter: ownerScope?.kind === "user" && isCloudMediaV2Enabled()
      ? "v2"
      : "legacy",
    orphaned,
    syncing,
    online,
    lastError,
    lastSyncAt,
    hasUser: ownerScope?.kind === "user",
  };
}

function notify() {
  cachedSnapshot = computeSnapshot();
  for (const l of listeners) l();
}

function attachOnlineListenersOnce() {
  if (onlineListenersAttached) return;
  if (typeof window === "undefined") return;
  onlineListenersAttached = true;
  window.addEventListener("online", () => {
    online = true;
    notify();
    void flush();
  });
  window.addEventListener("offline", () => {
    online = false;
    notify();
  });
}

// ============================================
// Public API
// ============================================

export function getSnapshot(): SyncSnapshot {
  return cachedSnapshot;
}

export function getServerSnapshot(): SyncSnapshot {
  // useSyncExternalStore, hydration boyunca aynı referansı bekler.
  return serverSnapshot;
}

export function subscribe(l: Listener): () => void {
  attachOnlineListenersOnce();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setUserId(id: string | null): void {
  setOwnerScope(id ? createUserOwnerScope(id) : null);
}

export function setOwnerScope(scope: LocalOwnerScope | null): void {
  if (ownerScope?.key === scope?.key) return;
  ownerScope = scope;
  ownerGeneration += 1;
  quarantineLegacyOwnerlessQueue();
  notify();
  if (ownerScope?.kind === "user" && online) void flush();
}

// ---- Enqueue helpers (coalescing'le) ----

function payloadId(item: SyncQueueItem): string | null {
  const p = item.payload;
  if (p && typeof p === "object" && "id" in p) {
    const v = (p as { id?: unknown }).id;
    return typeof v === "string" ? v : null;
  }
  return null;
}

/**
 * Aynı entity + aynı payload-id için bekleyen kayıtları yenisiyle değiştirir.
 * - upsert(X) gelirse: X için bekleyen upsert/delete'leri sil, yeni upsert'i ekle.
 * - delete(X) gelirse: X için bekleyen upsert/delete'leri sil, yeni delete'i ekle.
 */
function coalesceQueue(queue: SyncQueueItem[], fresh: SyncQueueItem): SyncQueueItem[] {
  const freshPayloadId = payloadId(fresh);
  if (!freshPayloadId) return [...queue, fresh];

  const filtered = queue.filter((existing) => {
    if (existing.ownerScope !== fresh.ownerScope) return true;
    if (existing.entity !== fresh.entity) return true;
    const existingId = payloadId(existing);
    if (existingId !== freshPayloadId) return true;
    if (
      fresh.transport === "cloud-v2"
      && existing.transport === "cloud-v2"
      && existing.dispatchStartedAt
      && !existing.blockedConflict
    ) return true;
    return false; // aynı entity + aynı id → eski kayıt drop
  });
  return [...filtered, fresh];
}

function enqueueRaw(input: {
  entity: SyncEntity;
  operation: SyncOperation;
  payload: unknown;
}): void {
  if (!ownerScope) return;
  const item = createSyncQueueItem(ownerScope, input);
  const next = coalesceQueue(loadSyncQueue(ownerScope), item);
  saveSyncQueue(ownerScope, next);
  notify();
  if (ownerScope.kind === "user" && online && !syncing) {
    void flush();
  }
}

export function enqueueMediaUpsert(item: MediaItem): void {
  enqueueRaw({ entity: "media_item", operation: "upsert", payload: item });
}

export function enqueueMediaDelete(id: string): void {
  enqueueRaw({ entity: "media_item", operation: "delete", payload: { id } });
}

export function enqueueMediaRestore(id: string): boolean {
  if (!isCloudMediaV2Enabled()) return false;
  enqueueRaw({ entity: "media_item", operation: "restore", payload: { id } });
  return true;
}

export function enqueueProgressLog(log: ProgressLog): void {
  enqueueRaw({ entity: "progress_log", operation: "upsert", payload: log });
}

export type CloudV2ResolutionResult =
  | { ok: true; operationId?: string }
  | {
      ok: false;
      code:
        | "owner_mismatch"
        | "adapter_unavailable"
        | "conflict_missing"
        | "invalid_resolution"
        | "queue_write_failed";
      message: string;
    };

function validateResolutionOwner(
  scope: LocalOwnerScope,
): CloudV2ResolutionResult | null {
  if (scope.kind !== "user" || ownerScope?.key !== scope.key) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Conflict çözümü aktif hesaba ait değil.",
    };
  }
  if (!isCloudMediaV2Enabled()) {
    return {
      ok: false,
      code: "adapter_unavailable",
      message: "Cloud V2 adapter aktif değil.",
    };
  }
  return null;
}

function replaceBlockedOperation(
  scope: Extract<LocalOwnerScope, { kind: "user" }>,
  itemId: string,
  operation: SyncOperation,
  expectedRevision: number,
): CloudV2ResolutionResult {
  const queue = loadSyncQueue(scope);
  const blocked = queue.find(
    (item) => item.id === itemId && item.blockedConflict,
  );
  if (!blocked) {
    return {
      ok: false,
      code: "conflict_missing",
      message: "Çözülecek blocked işlem artık mevcut değil.",
    };
  }
  const fresh = createSyncQueueItem(scope, {
    entity: blocked.entity,
    operation,
    payload: operation === "restore"
      ? { id: payloadId(blocked) }
      : blocked.payload,
  });
  fresh.expectedRevision = expectedRevision;
  const next = queue.filter((item) => item.id !== itemId).concat(fresh);
  if (!replaceSyncQueueDurably(scope, next)) {
    return {
      ok: false,
      code: "queue_write_failed",
      message: "Conflict çözüm işlemi güvenli biçimde kuyruğa yazılamadı.",
    };
  }
  notify();
  if (online && !syncing) void flush();
  return { ok: true, operationId: fresh.operationId };
}

export function retryCloudV2Conflict(
  scope: LocalOwnerScope,
  itemId: string,
  expectedRevision: number,
): CloudV2ResolutionResult {
  const ownerError = validateResolutionOwner(scope);
  if (ownerError) return ownerError;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return {
      ok: false,
      code: "invalid_resolution",
      message: "Remote revision geçersiz.",
    };
  }
  return replaceBlockedOperation(
    scope as Extract<LocalOwnerScope, { kind: "user" }>,
    itemId,
    "upsert",
    expectedRevision,
  );
}

export function restoreCloudV2Tombstone(
  scope: LocalOwnerScope,
  itemId: string,
): CloudV2ResolutionResult {
  const ownerError = validateResolutionOwner(scope);
  if (ownerError) return ownerError;
  const blocked = loadSyncQueue(scope).find((item) => item.id === itemId);
  if (blocked?.blockedConflict?.reason !== "tombstoned") {
    return {
      ok: false,
      code: "invalid_resolution",
      message: "Bu işlem restore edilebilir tombstone conflict'i değil.",
    };
  }
  return replaceBlockedOperation(
    scope as Extract<LocalOwnerScope, { kind: "user" }>,
    itemId,
    "restore",
    blocked.blockedConflict.serverRevision,
  );
}

export function retryProgressAfterParent(
  scope: LocalOwnerScope,
  itemId: string,
  parent: MediaItem,
): CloudV2ResolutionResult {
  const ownerError = validateResolutionOwner(scope);
  if (ownerError) return ownerError;
  const userScope = scope as Extract<LocalOwnerScope, { kind: "user" }>;
  const queue = loadSyncQueue(userScope);
  const blocked = queue.find((item) => item.id === itemId);
  const progressPayload = blocked?.payload as { mediaId?: unknown } | undefined;
  if (
    blocked?.entity !== "progress_log"
    || blocked.blockedConflict?.reason !== "media_target_unavailable"
    || progressPayload?.mediaId !== parent.id
  ) {
    return {
      ok: false,
      code: "invalid_resolution",
      message: "Progress işlemi için doğrulanmış parent media bulunamadı.",
    };
  }
  const parentOperation = createSyncQueueItem(userScope, {
    entity: "media_item",
    operation: "upsert",
    payload: parent,
  });
  const progressOperation = createSyncQueueItem(userScope, {
    entity: "progress_log",
    operation: "upsert",
    payload: blocked.payload,
  });
  progressOperation.expectedRevision = blocked.blockedConflict.serverRevision;
  const next = queue
    .filter((item) => item.id !== itemId)
    .concat(parentOperation, progressOperation);
  if (!replaceSyncQueueDurably(userScope, next)) {
    return {
      ok: false,
      code: "queue_write_failed",
      message: "Parent/progress sync planı güvenli biçimde yazılamadı.",
    };
  }
  notify();
  if (online && !syncing) void flush();
  return { ok: true, operationId: progressOperation.operationId };
}

export function acknowledgeCloudV2Conflict(
  scope: LocalOwnerScope,
  itemId: string,
): CloudV2ResolutionResult {
  const ownerError = validateResolutionOwner(scope);
  if (ownerError) return ownerError;
  const queue = loadSyncQueue(scope);
  const blocked = queue.find(
    (item) => item.id === itemId && item.blockedConflict,
  );
  if (!blocked) {
    return {
      ok: false,
      code: "conflict_missing",
      message: "Blocked işlem artık mevcut değil.",
    };
  }
  if (!replaceSyncQueueDurably(
    scope,
    queue.filter((item) => item.id !== itemId),
  )) {
    return {
      ok: false,
      code: "queue_write_failed",
      message: "Blocked işlem güvenli biçimde kaldırılamadı.",
    };
  }
  const recordId = payloadId(blocked);
  const currentState = recordId
    ? getCloudMediaV2RecordState(scope, blocked.entity, recordId)
    : undefined;
  if (
    !recordId
    || !currentState
    || !writeCloudMediaV2ServerResult(scope, {
      entity: blocked.entity,
      recordId,
      operationId: currentState.lastOperationId,
      revision: currentState.revision,
      deletedAt: currentState.deletedAt,
    }).ok
  ) {
    replaceSyncQueueDurably(scope, queue);
    notify();
    return {
      ok: false,
      code: "queue_write_failed",
      message: "Conflict state temizlenemedi; blocked işlem geri yüklendi.",
    };
  }
  notify();
  return { ok: true };
}

export function enqueueOwnedSnapshotSyncPlan(
  scope: LocalOwnerScope,
  mediaItems: MediaItem[],
  progressLogs: ProgressLog[],
): boolean {
  if (
    scope.kind !== "user"
    || ownerScope?.key !== scope.key
  ) {
    return false;
  }
  mediaItems.forEach(enqueueMediaUpsert);
  progressLogs.forEach(enqueueProgressLog);
  return true;
}

// ---- Flush ----

async function processItem(
  scope: Extract<LocalOwnerScope, { kind: "user" }>,
  item: SyncQueueItem,
  generation: number,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      conflict?: SyncQueueItem["blockedConflict"];
      stale?: boolean;
    }
> {
  if (item.transport === "cloud-v2") {
    const result = await dispatchCloudMediaV2QueueItem(scope.userId, item);
    if (generation !== ownerGeneration || ownerScope?.key !== scope.key) {
      return { ok: false, error: "stale_owner_response", stale: true };
    }
    if (result.kind === "applied") {
      const stored = writeCloudMediaV2ServerResult(scope, {
        entity: item.entity,
        recordId: payloadId(item) ?? "",
        operationId: item.operationId ?? item.id,
        revision: result.revision,
        deletedAt: result.deletedAt,
      });
      return stored.ok
        ? { ok: true }
        : { ok: false, error: "Cloud revision local olarak kaydedilemedi." };
    }
    if (result.kind === "conflict") {
      const detectedAt = new Date().toISOString();
      const stored = writeCloudMediaV2ServerResult(scope, {
        entity: item.entity,
        recordId: payloadId(item) ?? "",
        operationId: item.operationId ?? item.id,
        revision: result.revision,
        deletedAt: result.deletedAt,
        conflict: result.reason,
      });
      if (!stored.ok) {
        return { ok: false, error: "Cloud conflict local olarak kaydedilemedi." };
      }
      return {
        ok: false,
        error: `Cloud conflict: ${result.reason}`,
        conflict: {
          reason: result.reason,
          serverRevision: result.revision,
          serverDeletedAt: result.deletedAt,
          detectedAt,
        },
      };
    }
    return { ok: false, error: result.error };
  }
  const uid = scope.userId;
  if (item.entity === "media_item" && item.operation === "upsert") {
    const res = await uploadMediaItems(uid, [item.payload as MediaItem]);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  if (item.entity === "media_item" && item.operation === "delete") {
    const id = (item.payload as { id?: unknown }).id;
    if (typeof id !== "string") return { ok: false, error: "Geçersiz silme payload'ı." };
    const res = await deleteMediaItem(uid, id);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  if (item.entity === "progress_log" && item.operation === "upsert") {
    const res = await uploadProgressLogs(uid, [item.payload as ProgressLog]);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  return { ok: false, error: "Bilinmeyen sync işlemi." };
}

function shortenError(msg: string): string {
  // Postgres mesajları uzun olabiliyor; kısa Türkçe varyant göster.
  const m = msg.toLowerCase();
  if (m.includes("network") || m.includes("fetch")) return "Ağ hatası.";
  if (m.includes("invalid input syntax")) return "Geçersiz veri biçimi.";
  if (m.includes("violates row-level security")) return "Yetki hatası.";
  if (m.includes("duplicate key")) return "Yinelenen kayıt.";
  if (m.includes("permission denied")) return "İzin reddedildi.";
  if (m.includes("rate limit")) return "Çok fazla istek.";
  return msg.length > 80 ? msg.slice(0, 77) + "…" : msg;
}

export async function flush(): Promise<void> {
  if (syncing) return;
  if (!ownerScope || ownerScope.kind !== "user") return;
  if (!online) return;

  const flushScope = ownerScope;
  const flushGeneration = ownerGeneration;
  const snapshot = loadSyncQueue(flushScope);
  const eligible = snapshot.filter((item) =>
    item.ownerScope === flushScope.key
    && item.userId === flushScope.userId
    && !item.blockedConflict
  );
  if (eligible.length === 0) return;

  syncing = true;
  lastError = null;
  notify();

  const eligibleIds = new Set(eligible.map((item) => item.id));
  const dispatchStartedAt = new Date().toISOString();
  const queueBeforeDispatch = loadSyncQueue(flushScope);
  const markedQueue = queueBeforeDispatch.map((item) =>
    eligibleIds.has(item.id) && !item.dispatchStartedAt
      ? { ...item, dispatchStartedAt }
      : item);
  try {
    saveSyncQueue(flushScope, markedQueue);
    const verified = new Map(
      loadSyncQueue(flushScope).map((item) => [item.id, item]),
    );
    if ([...eligibleIds].some((id) => !verified.get(id)?.dispatchStartedAt)) {
      throw new Error("dispatch_marker_verification_failed");
    }
  } catch {
    syncing = false;
    lastError = "Cloud gönderim işareti kaydedilemedi.";
    notify();
    return;
  }
  notify();

  const successIds = new Set<string>();
  const failures = new Map<string, {
    retryCount: number;
    lastError: string;
    conflict?: SyncQueueItem["blockedConflict"];
  }>();
  let staleResponse = false;

  for (const item of eligible) {
    try {
      const res = await processItem(flushScope, item, flushGeneration);
      if (!res.ok && res.stale) {
        staleResponse = true;
        break;
      }
      if (res.ok) {
        successIds.add(item.id);
      } else {
        failures.set(item.id, {
          retryCount: res.conflict ? item.retryCount : item.retryCount + 1,
          lastError: shortenError(res.error),
          ...(res.conflict ? { conflict: res.conflict } : {}),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      failures.set(item.id, {
        retryCount: item.retryCount + 1,
        lastError: shortenError(msg),
      });
    }
  }

  if (staleResponse) {
    syncing = false;
    notify();
    if (ownerScope?.kind === "user" && online) void flush();
    return;
  }

  // Flush sırasında yeni item eklenmiş olabilir → güncel kuyruğu yeniden yükle
  const current = loadSyncQueue(flushScope);
  const next = current
    .filter((i) => !successIds.has(i.id))
    .map((i) => {
      const f = failures.get(i.id);
      if (f) {
        return {
          ...i,
          retryCount: f.retryCount,
          lastError: f.lastError,
          ...(f.conflict ? { blockedConflict: f.conflict } : {}),
        };
      }
      return i;
    });
  try {
    saveSyncQueue(flushScope, next);
  } catch {
    failures.set("queue-write", { retryCount: 1, lastError: "Sync queue kaydedilemedi." });
  }

  syncing = false;
  if (flushGeneration !== ownerGeneration) {
    notify();
    if (ownerScope?.kind === "user" && online) void flush();
    return;
  }
  if (failures.size > 0) {
    const last = Array.from(failures.values()).pop();
    lastError = last?.lastError ?? "Senkron hatası.";
  } else {
    lastError = null;
  }
  lastSyncAt = new Date().toISOString();
  notify();
}

/** Scoped queue modeli foreign kayıt silmez; legacy ownerless veri quarantine'de korunur. */
export function clearOrphanedQueue(): number {
  return 0;
}

/**
 * UI'dan tetiklenen "Şimdi senkronize et" butonu için.
 */
export async function syncNow(): Promise<void> {
  await flush();
}
