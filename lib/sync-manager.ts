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
import { loadSyncQueue, saveSyncQueue } from "./sync-queue";
import {
  deleteMediaItem,
  uploadMediaItems,
  uploadProgressLogs,
} from "./supabase/cloud-repository";

export interface SyncSnapshot {
  /** Mevcut kullanıcı için flush edilebilecek item sayısı (kendi + anonim). */
  pending: number;
  /** Başka kullanıcıya ait, mevcut kullanıcıyla flush edilemeyecek item sayısı. */
  orphaned: number;
  syncing: boolean;
  online: boolean;
  lastError: string | null;
  lastSyncAt: string | null;
  hasUser: boolean;
}

type Listener = () => void;

// ---- Modül durumu ----
let userId: string | null = null;
let syncing = false;
let lastError: string | null = null;
let lastSyncAt: string | null = null;
let online = typeof navigator !== "undefined" ? navigator.onLine : true;
let onlineListenersAttached = false;

const listeners = new Set<Listener>();
let cachedSnapshot: SyncSnapshot = computeSnapshot();

function isFlushableForCurrentUser(item: SyncQueueItem): boolean {
  // Anonim (login öncesi) → her zaman adopte edilebilir
  if (!item.userId) return true;
  // Kullanıcı yoksa hiçbir şey flush edilmez
  if (!userId) return false;
  return item.userId === userId;
}

function computeSnapshot(): SyncSnapshot {
  const queue = loadSyncQueue();
  let pending = 0;
  let orphaned = 0;
  for (const it of queue) {
    if (!userId) {
      // Login yok → hepsi "bekliyor" sayılır, orphan kavramı uygulanmaz
      pending++;
    } else if (isFlushableForCurrentUser(it)) {
      pending++;
    } else {
      orphaned++;
    }
  }
  return {
    pending,
    orphaned,
    syncing,
    online,
    lastError,
    lastSyncAt,
    hasUser: !!userId,
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
  // SSR sırasında stabil değer
  return {
    pending: 0,
    orphaned: 0,
    syncing: false,
    online: true,
    lastError: null,
    lastSyncAt: null,
    hasUser: false,
  };
}

export function subscribe(l: Listener): () => void {
  attachOnlineListenersOnce();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setUserId(id: string | null): void {
  if (userId === id) return;
  userId = id;
  notify();
  if (userId && online) void flush();
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

function generateQueueId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
    if (existing.entity !== fresh.entity) return true;
    const existingId = payloadId(existing);
    if (existingId !== freshPayloadId) return true;
    return false; // aynı entity + aynı id → eski kayıt drop
  });
  return [...filtered, fresh];
}

function enqueueRaw(input: {
  entity: SyncEntity;
  operation: SyncOperation;
  payload: unknown;
}): void {
  const item: SyncQueueItem = {
    id: generateQueueId(),
    entity: input.entity,
    operation: input.operation,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    // Login varsa kullanıcıya bağla; yoksa anonim — sonradan adopte edilir.
    userId: userId,
  };
  const next = coalesceQueue(loadSyncQueue(), item);
  saveSyncQueue(next);
  notify();
  if (userId && online && !syncing) {
    void flush();
  }
}

export function enqueueMediaUpsert(item: MediaItem): void {
  enqueueRaw({ entity: "media_item", operation: "upsert", payload: item });
}

export function enqueueMediaDelete(id: string): void {
  enqueueRaw({ entity: "media_item", operation: "delete", payload: { id } });
}

export function enqueueProgressLog(log: ProgressLog): void {
  enqueueRaw({ entity: "progress_log", operation: "upsert", payload: log });
}

// ---- Flush ----

async function processItem(
  uid: string,
  item: SyncQueueItem
): Promise<{ ok: true } | { ok: false; error: string }> {
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
  if (!userId) return;
  if (!online) return;

  const snapshot = loadSyncQueue();
  // Yalnızca mevcut kullanıcıya ait + anonim item'ları işle.
  // Başka userId'ye ait item'lar (orphan) bu flush'ta dokunulmaz.
  const eligible = snapshot.filter(isFlushableForCurrentUser);
  if (eligible.length === 0) return;

  syncing = true;
  lastError = null;
  notify();

  const successIds = new Set<string>();
  const failures = new Map<string, { retryCount: number; lastError: string }>();

  for (const item of eligible) {
    try {
      const res = await processItem(userId, item);
      if (res.ok) {
        successIds.add(item.id);
      } else {
        failures.set(item.id, {
          retryCount: item.retryCount + 1,
          lastError: shortenError(res.error),
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

  // Flush sırasında yeni item eklenmiş olabilir → güncel kuyruğu yeniden yükle
  const current = loadSyncQueue();
  const next = current
    .filter((i) => !successIds.has(i.id))
    .map((i) => {
      const f = failures.get(i.id);
      if (f) return { ...i, retryCount: f.retryCount, lastError: f.lastError };
      // Anonim item başarıyla adopte edildiyse userId'sini etiketle
      if (!i.userId && successIds.has(i.id)) return { ...i, userId };
      return i;
    });
  saveSyncQueue(next);

  syncing = false;
  if (failures.size > 0) {
    const last = Array.from(failures.values()).pop();
    lastError = last?.lastError ?? "Senkron hatası.";
  } else {
    lastError = null;
  }
  lastSyncAt = new Date().toISOString();
  notify();
}

/**
 * Mevcut kullanıcıyla flush edilemeyen orphan item'ları kuyruktan siler.
 * Login değişimi sonrası kullanıcı tarafından manuel tetiklenir.
 */
export function clearOrphanedQueue(): number {
  if (!userId) return 0;
  const all = loadSyncQueue();
  const kept = all.filter(isFlushableForCurrentUser);
  const removed = all.length - kept.length;
  if (removed > 0) {
    saveSyncQueue(kept);
    notify();
  }
  return removed;
}

/**
 * UI'dan tetiklenen "Şimdi senkronize et" butonu için.
 */
export async function syncNow(): Promise<void> {
  await flush();
}
