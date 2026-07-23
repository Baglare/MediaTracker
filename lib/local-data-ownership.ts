import { mockMediaList } from "./mock-media";
import { decodeMediaItems } from "./local-data-codec";
import {
  buildLocalDataKeys,
  loadMediaList,
  loadProgressLogs,
  loadScopedMediaList,
  loadScopedProgressLogs,
  saveScopedLibrarySnapshot,
  type LocalDatasetOrigin,
  type LocalStorageLike,
  type StorageReadResult,
  type StorageWriteResult,
} from "./local-data-storage";
import {
  GUEST_OWNER_SCOPE,
  type LocalOwnerScope,
} from "./local-owner-scope";
import type { MediaItem, ProgressLog } from "./types";

export type LocalOwnershipDecision =
  | "assigned_to_guest"
  | "assigned_to_user"
  | "deferred"
  | "kept_existing_user_data";

export interface LocalOwnershipMigrationRecord {
  version: 1;
  sourceKey: string;
  sourceFingerprint: string;
  decision: LocalOwnershipDecision;
  targetScope?: string;
  decidedAt: string;
}

export interface LocalOwnershipCandidate {
  sourceKey: string;
  sourceFingerprint: string;
  mediaCount: number;
  progressLogCount: number;
  datasetOrigin: LocalDatasetOrigin;
  destinationHasData: boolean;
  guestDestinationHasData: boolean;
  deferred: boolean;
}

export interface ScopedLibraryPreparation {
  media: StorageReadResult<MediaItem[]>;
  progressLogs: StorageReadResult<ProgressLog[]>;
  ownershipCandidate?: LocalOwnershipCandidate;
  deferredCandidate?: LocalOwnershipCandidate;
}

export type OwnershipActionResult =
  | {
      ok: true;
      decision: LocalOwnershipDecision;
      mediaItems: MediaItem[];
      progressLogs: ProgressLog[];
      syncPlan?: { mediaItems: MediaItem[]; progressLogs: ProgressLog[] };
    }
  | { ok: false; message: string; writeResult?: StorageWriteResult };

const DECISION_PREFIX = "mediaTracker:ownershipDecision:v1";
const BACKUP_PREFIX = "mediaTracker:ownershipBackup:v1";

function browserStorage(): LocalStorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isReadable(status: StorageReadResult<unknown>["status"]): boolean {
  return status === "valid" || status === "empty" || status === "missing";
}

function isKnownDemoDataset(items: MediaItem[]): boolean {
  const decoded = decodeMediaItems(mockMediaList);
  return decoded.ok && JSON.stringify(items) === JSON.stringify(decoded.records);
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprint(
  media: StorageReadResult<MediaItem[]>,
  logs: StorageReadResult<ProgressLog[]>,
  target: LocalStorageLike,
): string {
  try {
    const mediaKeys = buildLocalDataKeys("media-library");
    const logKeys = buildLocalDataKeys("progress-logs");
    const mediaRaw = target.getItem(mediaKeys.current) ?? target.getItem(mediaKeys.legacy) ?? "";
    const logsRaw = target.getItem(logKeys.current) ?? target.getItem(logKeys.legacy) ?? "";
    return `fnv1a:${hashText(`${mediaRaw}\u0000${logsRaw}`)}`;
  } catch {
    return `fnv1a:${hashText(JSON.stringify([media.data ?? [], logs.data ?? []]))}`;
  }
}

function decisionKey(scope: LocalOwnerScope): string {
  return `${DECISION_PREFIX}:${scope.storageKey}`;
}

function readDecision(
  scope: LocalOwnerScope,
  target: LocalStorageLike,
): LocalOwnershipMigrationRecord | null {
  try {
    const parsed = JSON.parse(target.getItem(decisionKey(scope)) ?? "null") as
      | Partial<LocalOwnershipMigrationRecord>
      | null;
    if (
      parsed?.version !== 1
      || typeof parsed.sourceKey !== "string"
      || typeof parsed.sourceFingerprint !== "string"
      || typeof parsed.decidedAt !== "string"
      || ![
        "assigned_to_guest",
        "assigned_to_user",
        "deferred",
        "kept_existing_user_data",
      ].includes(String(parsed.decision))
    ) {
      return null;
    }
    return parsed as LocalOwnershipMigrationRecord;
  } catch {
    return null;
  }
}

function writeDecision(
  scope: LocalOwnerScope,
  candidate: LocalOwnershipCandidate,
  decision: LocalOwnershipDecision,
  targetScope: string | undefined,
  target: LocalStorageLike,
): boolean {
  const record: LocalOwnershipMigrationRecord = {
    version: 1,
    sourceKey: candidate.sourceKey,
    sourceFingerprint: candidate.sourceFingerprint,
    decision,
    targetScope,
    decidedAt: new Date().toISOString(),
  };
  try {
    target.setItem(decisionKey(scope), JSON.stringify(record));
    return target.getItem(decisionKey(scope)) === JSON.stringify(record);
  } catch {
    return false;
  }
}

function backUpUnscopedRaw(target: LocalStorageLike): boolean {
  try {
    for (const domain of ["media-library", "progress-logs"] as const) {
      const keys = buildLocalDataKeys(domain);
      const raw = target.getItem(keys.current) ?? target.getItem(keys.legacy);
      if (raw === null) continue;
      const backupKey = `${BACKUP_PREFIX}:${domain}`;
      if (target.getItem(backupKey) === null) target.setItem(backupKey, raw);
      if (target.getItem(backupKey) !== raw) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function unscopedSnapshot(target: LocalStorageLike): {
  media: StorageReadResult<MediaItem[]>;
  logs: StorageReadResult<ProgressLog[]>;
  candidate: Omit<LocalOwnershipCandidate, "destinationHasData" | "guestDestinationHasData" | "deferred">;
} | null {
  const media = loadMediaList(target);
  const logs = loadProgressLogs(target);
  if (!isReadable(media.status) || !isReadable(logs.status)) return null;
  const sourceExists = media.status !== "missing" || logs.status !== "missing";
  if (!sourceExists) return null;
  const items = media.data ?? [];
  return {
    media,
    logs,
    candidate: {
      sourceKey: media.sourceKey,
      sourceFingerprint: fingerprint(media, logs, target),
      mediaCount: items.length,
      progressLogCount: logs.data?.length ?? 0,
      datasetOrigin: isKnownDemoDataset(items) ? "demo" : "legacy",
    },
  };
}

function hasRealData(read: StorageReadResult<unknown[]>): boolean {
  return read.status === "valid" && (read.data?.length ?? 0) > 0;
}

export function prepareScopedLibrary(
  scope: LocalOwnerScope,
  target: LocalStorageLike | null = browserStorage(),
): ScopedLibraryPreparation {
  const media = loadScopedMediaList(scope, target);
  const progressLogs = loadScopedProgressLogs(scope, target);
  if (!target) return { media, progressLogs };

  const unscoped = unscopedSnapshot(target);
  if (scope.kind === "guest") {
    if (
      unscoped
      && media.status === "missing"
      && progressLogs.status === "missing"
      && backUpUnscopedRaw(target)
    ) {
      const write = saveScopedLibrarySnapshot(
        scope,
        unscoped.media.data ?? [],
        unscoped.logs.data ?? [],
        unscoped.candidate.datasetOrigin,
        target,
      );
      if (write.ok) {
        const candidate: LocalOwnershipCandidate = {
          ...unscoped.candidate,
          destinationHasData: false,
          guestDestinationHasData: false,
          deferred: false,
        };
        writeDecision(scope, candidate, "assigned_to_guest", scope.key, target);
        return {
          media: loadScopedMediaList(scope, target),
          progressLogs: loadScopedProgressLogs(scope, target),
        };
      }
    }
    return { media, progressLogs };
  }

  if (!unscoped || unscoped.candidate.datasetOrigin === "demo") {
    return { media, progressLogs };
  }
  const guestMedia = loadScopedMediaList(GUEST_OWNER_SCOPE, target);
  const candidate: LocalOwnershipCandidate = {
    ...unscoped.candidate,
    destinationHasData: hasRealData(media),
    guestDestinationHasData: hasRealData(guestMedia),
    deferred: false,
  };
  const decision = readDecision(scope, target);
  if (decision?.sourceFingerprint === candidate.sourceFingerprint) {
    if (decision.decision === "deferred") {
      return {
        media,
        progressLogs,
        deferredCandidate: { ...candidate, deferred: true },
      };
    }
    return { media, progressLogs };
  }
  return { media, progressLogs, ownershipCandidate: candidate };
}

function currentUnscopedCandidate(
  scope: LocalOwnerScope,
  expectedFingerprint: string,
  target: LocalStorageLike,
): {
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  candidate: LocalOwnershipCandidate;
} | null {
  const source = unscopedSnapshot(target);
  if (!source || source.candidate.sourceFingerprint !== expectedFingerprint) return null;
  const destination = loadScopedMediaList(scope, target);
  const guest = loadScopedMediaList(GUEST_OWNER_SCOPE, target);
  return {
    mediaItems: source.media.data ?? [],
    progressLogs: source.logs.data ?? [],
    candidate: {
      ...source.candidate,
      destinationHasData: hasRealData(destination),
      guestDestinationHasData: hasRealData(guest),
      deferred: false,
    },
  };
}

export function assignUnscopedLibraryToUser(
  scope: LocalOwnerScope,
  expectedFingerprint: string,
  target: LocalStorageLike | null = browserStorage(),
): OwnershipActionResult {
  if (!target || scope.kind !== "user") {
    return { ok: false, message: "Authenticated local owner scope gerekli." };
  }
  const source = currentUnscopedCandidate(scope, expectedFingerprint, target);
  if (!source) return { ok: false, message: "Eski yerel veri degisti; yeniden kontrol edilmeli." };
  if (source.candidate.destinationHasData) {
    return { ok: false, message: "Hedef hesap kutuphanesi dolu; otomatik merge yapilmadi." };
  }
  if (!backUpUnscopedRaw(target)) {
    return { ok: false, message: "Eski yerel verinin raw backup'i olusturulamadi." };
  }
  const write = saveScopedLibrarySnapshot(
    scope,
    source.mediaItems,
    source.progressLogs,
    "legacy",
    target,
  );
  if (!write.ok) return { ok: false, message: write.message, writeResult: write };
  if (!writeDecision(scope, source.candidate, "assigned_to_user", scope.key, target)) {
    return { ok: false, message: "Sahiplik karar kaydi dogrulanamadi." };
  }
  return {
    ok: true,
    decision: "assigned_to_user",
    mediaItems: source.mediaItems,
    progressLogs: source.progressLogs,
    syncPlan: { mediaItems: source.mediaItems, progressLogs: source.progressLogs },
  };
}

export function keepUnscopedLibraryAsGuest(
  decidingScope: LocalOwnerScope,
  expectedFingerprint: string,
  target: LocalStorageLike | null = browserStorage(),
): OwnershipActionResult {
  if (!target) return { ok: false, message: "Local storage kullanilamiyor." };
  const source = currentUnscopedCandidate(decidingScope, expectedFingerprint, target);
  if (!source) return { ok: false, message: "Eski yerel veri degisti; yeniden kontrol edilmeli." };
  if (source.candidate.guestDestinationHasData) {
    return { ok: false, message: "Guest kutuphanesi dolu; otomatik merge yapilmadi." };
  }
  if (!backUpUnscopedRaw(target)) {
    return { ok: false, message: "Eski yerel verinin raw backup'i olusturulamadi." };
  }
  const write = saveScopedLibrarySnapshot(
    GUEST_OWNER_SCOPE,
    source.mediaItems,
    source.progressLogs,
    source.candidate.datasetOrigin,
    target,
  );
  if (!write.ok) return { ok: false, message: write.message, writeResult: write };
  if (!writeDecision(
    decidingScope,
    source.candidate,
    "assigned_to_guest",
    GUEST_OWNER_SCOPE.key,
    target,
  )) {
    return { ok: false, message: "Sahiplik karar kaydi dogrulanamadi." };
  }
  return {
    ok: true,
    decision: "assigned_to_guest",
    mediaItems: source.mediaItems,
    progressLogs: source.progressLogs,
  };
}

export function deferUnscopedOwnership(
  scope: LocalOwnerScope,
  candidate: LocalOwnershipCandidate,
  target: LocalStorageLike | null = browserStorage(),
): OwnershipActionResult {
  if (!target || !writeDecision(scope, candidate, "deferred", undefined, target)) {
    return { ok: false, message: "Ertelenen sahiplik karari kaydedilemedi." };
  }
  return {
    ok: true,
    decision: "deferred",
    mediaItems: [],
    progressLogs: [],
  };
}

export function keepExistingUserLibrary(
  scope: LocalOwnerScope,
  candidate: LocalOwnershipCandidate,
  target: LocalStorageLike | null = browserStorage(),
): OwnershipActionResult {
  if (!target || !writeDecision(
    scope,
    candidate,
    "kept_existing_user_data",
    scope.key,
    target,
  )) {
    return { ok: false, message: "Mevcut hesap verisi karari kaydedilemedi." };
  }
  return {
    ok: true,
    decision: "kept_existing_user_data",
    mediaItems: [],
    progressLogs: [],
  };
}
