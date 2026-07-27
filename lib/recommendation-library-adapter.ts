import { getProgressUnit } from "./progress";
import {
  loadScopedMediaList,
  loadScopedProgressLogs,
  saveScopedLibrarySnapshot,
  type StorageWriteResult,
} from "./storage";
import { createUserOwnerScope } from "./local-owner-scope";
import type { MediaItem, ProgressLog } from "./types";
import { enqueueMediaUpsert, enqueueProgressLog, setOwnerScope } from "./sync-manager";
import {
  flushSocialOutbox,
  queueMediaSocialEvents,
  sendSocialOutboxItem,
} from "./social/local-social";
import { flushXpOutbox, queueXpMediaState, sendXpOutboxBatch } from "./xp/outbox";
import { ensureMediaIdentity, getCanonicalMediaKeyV2 } from "./media-identity";

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
  const identifiedItem = ensureMediaIdentity(item).item;
  const scope = createUserOwnerScope(userId);
  const mediaRead = loadScopedMediaList(scope);
  const logsRead = loadScopedProgressLogs(scope);
  if (!readable(mediaRead) || !readable(logsRead)) {
    return { ok: false, message: "Yerel kütüphane recovery gerektirdiği için öneri eklenemedi." };
  }
  const currentMedia = mediaRead.data ?? [];
  const currentLogs = logsRead.data ?? [];
  const existing = currentMedia.find((candidate) =>
    candidate.id === identifiedItem.id
    || (
      Boolean(getCanonicalMediaKeyV2(candidate))
      && getCanonicalMediaKeyV2(candidate) === getCanonicalMediaKeyV2(identifiedItem)
    )
    || (
      Boolean(candidate.externalSource)
      && candidate.externalSource === identifiedItem.externalSource
      && candidate.externalId === identifiedItem.externalId
    )
  );
  if (existing) return { ok: true, item: existing, alreadyPresent: true };
  const addedLog: ProgressLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    mediaId: identifiedItem.id,
    mediaTitle: identifiedItem.title,
    mediaType: identifiedItem.type,
    action: "added",
    detail: "Öneriden kütüphaneye eklendi",
    amount: identifiedItem.currentProgress,
    unit: getProgressUnit(identifiedItem.type),
    previousProgress: 0,
    newProgress: identifiedItem.currentProgress,
    createdAt: new Date().toISOString(),
  };
  const writeResult = saveScopedLibrarySnapshot(
    scope,
    [...currentMedia, identifiedItem],
    [...currentLogs, addedLog],
    "user",
  );
  if (!writeResult.ok) {
    return { ok: false, message: writeResult.message, writeResult };
  }

  setOwnerScope(scope);
  enqueueMediaUpsert(identifiedItem);
  enqueueProgressLog(addedLog);
  queueXpMediaState(identifiedItem, userId);
  queueMediaSocialEvents(undefined, identifiedItem, userId);
  void flushXpOutbox(userId, sendXpOutboxBatch);
  void flushSocialOutbox(userId, sendSocialOutboxItem);
  window.dispatchEvent(new CustomEvent("media-tracker:local-library-changed"));
  return { ok: true, item: identifiedItem, alreadyPresent: false };
}
