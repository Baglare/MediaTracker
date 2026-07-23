import type { MediaItem } from "@/lib/types";
import { buildSafeMediaState } from "@/lib/xp/progression";
import type { XpSafeMediaState } from "@/lib/xp/types";

export const XP_OUTBOX_KEY = "media-tracker-xp-outbox";
export const XP_OUTBOX_QUARANTINE_KEY = "mediaTracker:quarantine:xp-outbox:ownerless";

export interface XpStorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface XpOutboxItem {
  id: string;
  userId: string;
  canonicalMediaKey: string;
  safeMediaState: XpSafeMediaState;
  deleted: boolean;
  stateHash: string;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError?: string;
}

function storage(): XpStorageLike | null { return typeof window === "undefined" ? null : window.localStorage; }
function isItem(value: unknown): value is XpOutboxItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<XpOutboxItem>;
  return typeof item.id === "string" && typeof item.userId === "string" && typeof item.canonicalMediaKey === "string" && typeof item.deleted === "boolean" && typeof item.stateHash === "string" && typeof item.createdAt === "string" && typeof item.updatedAt === "string" && typeof item.retryCount === "number" && Boolean(item.safeMediaState && typeof item.safeMediaState === "object");
}

export function loadXpOutbox(target: XpStorageLike | null = storage()): XpOutboxItem[] {
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(XP_OUTBOX_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isItem);
    const invalid = parsed.filter((item) => !isItem(item));
    if (invalid.length > 0) {
      try {
        target.setItem(XP_OUTBOX_QUARANTINE_KEY, JSON.stringify({
          version: 1,
          sourceKey: XP_OUTBOX_KEY,
          capturedAt: new Date().toISOString(),
          reason: "owner_missing_or_invalid",
          records: invalid,
        }));
      } catch { /* Original outbox remains untouched when quarantine cannot be written. */ }
    }
    return valid;
  } catch { return []; }
}

export function saveXpOutbox(items: XpOutboxItem[], target: XpStorageLike | null = storage()): void { target?.setItem(XP_OUTBOX_KEY, JSON.stringify(items)); }

export function enqueueXpOutbox(item: XpOutboxItem, target: XpStorageLike | null = storage()): XpOutboxItem[] {
  const current = loadXpOutbox(target);
  const index = current.findIndex((entry) => entry.userId === item.userId && entry.canonicalMediaKey === item.canonicalMediaKey);
  const next = index < 0 ? [...current, item] : current.map((entry, position) => position === index ? { ...item, createdAt: entry.createdAt } : entry);
  saveXpOutbox(next, target);
  return next;
}

export function queueXpMediaState(item: MediaItem, userId: string | null, deleted = false, target: XpStorageLike | null = storage()): XpOutboxItem | null {
  if (!userId || !target) return null;
  const safeMediaState = buildSafeMediaState(item, deleted);
  const now = new Date().toISOString();
  const queued: XpOutboxItem = {
    id: `xp-state-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId,
    canonicalMediaKey: safeMediaState.canonicalMediaKey,
    safeMediaState,
    deleted,
    stateHash: safeMediaState.stateHash,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
  };
  enqueueXpOutbox(queued, target);
  return queued;
}

export async function sendXpOutboxBatch(items: XpOutboxItem[]): Promise<void> {
  if (items.length === 0) return;
  const response = await fetch("/api/xp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync_states", items: items.map((item) => item.safeMediaState), replace: false }),
  });
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "XP state eşitlemesi tamamlanamadı.");
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("media-tracker:xp-changed"));
}

export async function flushXpOutbox(userId: string, send: (items: XpOutboxItem[]) => Promise<void> = sendXpOutboxBatch, target: XpStorageLike | null = storage()): Promise<XpOutboxItem[]> {
  const current = loadXpOutbox(target);
  const own = current.filter((item) => item.userId === userId);
  if (own.length === 0) return current;
  const sentStates = new Map(own.map((item) => [`${item.userId}:${item.canonicalMediaKey}`, item.stateHash]));
  try {
    await send(own);
    const next = loadXpOutbox(target).filter((item) => sentStates.get(`${item.userId}:${item.canonicalMediaKey}`) !== item.stateHash);
    saveXpOutbox(next, target);
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "XP state eşitlemesi tamamlanamadı.";
    const next = loadXpOutbox(target).map((item) => sentStates.get(`${item.userId}:${item.canonicalMediaKey}`) === item.stateHash ? { ...item, retryCount: item.retryCount + 1, lastError: message } : item);
    saveXpOutbox(next, target);
    return next;
  }
}
