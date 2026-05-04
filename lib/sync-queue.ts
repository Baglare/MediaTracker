// ============================================
// Sync Queue — Offline-first Hazırlık
// ============================================
// Çevrimdışı yapılan değişiklikleri kuyruğa alır, internet gelince
// Supabase'e gönderilmeleri için tutar. Bu aşamada yalnızca tip ve
// localStorage erişim altyapısı; kuyruğa **hiçbir yerden yazılmıyor**.

import type { SyncEntity, SyncOperation, SyncQueueItem } from "./types";

const SYNC_QUEUE_KEY = "media-tracker-sync-queue";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function generateId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sync queue'yu localStorage'dan okur. Yoksa veya bozuksa boş dizi döner.
 */
export function loadSyncQueue(): SyncQueueItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SyncQueueItem[];
  } catch {
    return [];
  }
}

/**
 * Sync queue'yu localStorage'a yazar. SSR'da no-op.
 */
export function saveSyncQueue(queue: SyncQueueItem[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Quota dolu veya storage erişimi yok — sessizce yut
  }
}

/**
 * Yeni bir sync işlemini kuyruğa ekler ve güncel kuyruğu döner.
 * Şu anda hiçbir yerden çağrılmıyor; ileride storage kaydetme akışına bağlanacak.
 */
export function enqueueSyncOperation(input: {
  entity: SyncEntity;
  operation: SyncOperation;
  payload: unknown;
}): SyncQueueItem[] {
  const item: SyncQueueItem = {
    id: generateId(),
    entity: input.entity,
    operation: input.operation,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  const next = [...loadSyncQueue(), item];
  saveSyncQueue(next);
  return next;
}

/**
 * Kuyruğu temizler (örn. başarılı senkronizasyon sonrası).
 */
export function clearSyncQueue(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(SYNC_QUEUE_KEY);
  } catch {
    // sessizce yut
  }
}

/**
 * Bekleyen sync işlemi sayısı. UI rozetleri için kullanılabilir.
 */
export function getPendingSyncCount(): number {
  return loadSyncQueue().length;
}
