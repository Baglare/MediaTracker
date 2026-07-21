// ============================================
// Sync Queue — Offline-first persistence
// ============================================
// Çevrimdışı yapılan değişiklikleri kuyruğa alır, internet gelince
// Supabase'e gönderilmeleri için tutar. Yüksek seviyeli enqueue/flush akışı
// sync-manager üzerinden yürür; bu dosya localStorage erişimini merkezileştirir.

import type { SyncEntity, SyncOperation, SyncQueueItem } from "./types";

const SYNC_QUEUE_KEY = "media-tracker-sync-queue";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function generateId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function isSyncQueueItem(value: unknown): value is SyncQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length === 0) return false;
  if (item.entity !== "media_item" && item.entity !== "progress_log") return false;
  if (item.operation !== "upsert" && item.operation !== "delete") return false;
  if (!item.payload || typeof item.payload !== "object") return false;
  if (typeof item.createdAt !== "string" || item.createdAt.length === 0) return false;
  if (typeof item.retryCount !== "number" || !Number.isInteger(item.retryCount) || item.retryCount < 0) return false;
  if (item.lastError !== undefined && typeof item.lastError !== "string") return false;
  if (item.userId !== undefined && item.userId !== null && typeof item.userId !== "string") return false;
  return true;
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
    return parsed.filter(isSyncQueueItem);
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
 * Doğrudan kullanım için düşük seviyeli helper'dır; uygulama akışı sync-manager
 * helper'larını kullanır.
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
