import { getProgressUnit } from "./progress";
import {
  loadMediaList,
  loadProgressLogs,
  saveLibrarySnapshot,
  type StorageWriteResult,
} from "./storage";
import type { MediaItem, ProgressLog } from "./types";
import { enqueueMediaUpsert, enqueueProgressLog } from "./sync-manager";
import {
  flushSocialOutbox,
  queueMediaSocialEvents,
  sendSocialOutboxItem,
} from "./social/local-social";
import { flushXpOutbox, queueXpMediaState, sendXpOutboxBatch } from "./xp/outbox";

export type RecommendationLibraryWriteResult =
  | { ok: true; item: MediaItem; alreadyPresent: boolean }
  | { ok: false; message: string; writeResult?: StorageWriteResult };

function readable<T>(
  result: { status: string; data?: T },
): result is { status: "missing" | "valid" | "empty"; data?: T } {
  return result.status === "missing" || result.status === "valid" || result.status === "empty";
}

/**
 * Recommendation sayfasının eski doğrudan media key yazımını kapatan küçük
 * domain adapter'ı. Tam command bus refactor'ı yapmadan aynı envelope, codec,
 * snapshot ve "önce local persist, sonra side-effect" sırasını uygular.
 */
export function addRecommendationToLocalLibrary(
  item: MediaItem,
  userId: string,
): RecommendationLibraryWriteResult {
  const mediaRead = loadMediaList();
  const logsRead = loadProgressLogs();
  if (!readable(mediaRead) || !readable(logsRead)) {
    return { ok: false, message: "Yerel kütüphane recovery gerektirdiği için öneri eklenemedi." };
  }
  const currentMedia = mediaRead.data ?? [];
  const currentLogs = logsRead.data ?? [];
  const existing = currentMedia.find((candidate) =>
    candidate.id === item.id
    || (
      Boolean(candidate.externalSource)
      && candidate.externalSource === item.externalSource
      && candidate.externalId === item.externalId
    )
  );
  if (existing) return { ok: true, item: existing, alreadyPresent: true };
  const addedLog: ProgressLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    mediaId: item.id,
    mediaTitle: item.title,
    mediaType: item.type,
    action: "added",
    detail: "Öneriden kütüphaneye eklendi",
    amount: item.currentProgress,
    unit: getProgressUnit(item.type),
    previousProgress: 0,
    newProgress: item.currentProgress,
    createdAt: new Date().toISOString(),
  };
  const writeResult = saveLibrarySnapshot(
    [...currentMedia, item],
    [...currentLogs, addedLog],
  );
  if (!writeResult.ok) {
    return { ok: false, message: writeResult.message, writeResult };
  }

  enqueueMediaUpsert(item);
  enqueueProgressLog(addedLog);
  queueXpMediaState(item, userId);
  queueMediaSocialEvents(undefined, item, userId);
  void flushXpOutbox(userId, sendXpOutboxBatch);
  void flushSocialOutbox(userId, sendSocialOutboxItem);
  window.dispatchEvent(new CustomEvent("media-tracker:local-library-changed"));
  return { ok: true, item, alreadyPresent: false };
}
