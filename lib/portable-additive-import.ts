import {
  aliasesForMediaItems,
  emptyMediaIdentityAliasRegistry,
  mediaIdentityAliasRegistryCodec,
  updateMediaIdentityAliases,
  writeMediaIdentityAliasRegistry,
  type MediaIdentityAliasRecord,
  type MediaIdentityAliasRegistry,
} from "./media-identity-aliases";
import {
  emptyMediaRecordRedirectRegistry,
  mediaRecordRedirectRegistryCodec,
  writeMediaRecordRedirectRegistry,
  type MediaRecordRedirect,
  type MediaRecordRedirectRegistry,
} from "./media-record-redirects";
import {
  inspectScopedLocalData,
  saveScopedLibrarySnapshot,
  type LocalDatasetOrigin,
  type LocalStorageLike,
} from "./local-data-storage";
import {
  decodeMediaItems,
  decodeProgressLogs,
} from "./local-data-codec";
import {
  isLocalOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";
import {
  inspectPersonalData,
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "./personal-data-storage";
import {
  decodePortableBackupForImport,
  type PortableBackupDomain,
  type PortableBackupOwnerType,
} from "./portable-backup";
import {
  inspectRecommendationLinksForScope,
  replaceRecommendationLinksForScope,
  type RecommendationLocalLink,
  type StorageLike as SocialStorageLike,
} from "./social/local-social";
import {
  createSyncQueueItem,
  inspectSyncQueue,
  replaceSyncQueueDurably,
  type SyncQueueStorageLike,
} from "./sync-queue";
import type { MediaItem, ProgressLog, SyncQueueItem } from "./types";

export const PORTABLE_IMPORT_PLAN_VERSION = 1 as const;
export const PORTABLE_IMPORT_JOURNAL_VERSION = 1 as const;

export type PortableImportDecisionStatus =
  | "add"
  | "add-exact-copy"
  | "skip-same"
  | "skip-exact"
  | "excluded"
  | "conflict";

export interface PortableImportMediaDecision {
  sourceRecordId: string;
  targetRecordId?: string;
  status: PortableImportDecisionStatus;
  canonicalIdentityKey?: string;
  hasPersonalNote: boolean;
  reason: string;
}

export interface PortableImportLogDecision {
  sourceLogId: string;
  targetMediaId?: string;
  status: "add" | "skip-same" | "excluded" | "conflict";
  remapped: boolean;
  reason: string;
}

export interface PortableImportBlocker {
  code:
    | "record_id_conflict"
    | "log_id_conflict"
    | "alias_collision"
    | "alias_cycle"
    | "redirect_collision"
    | "redirect_cycle"
    | "missing_relationship_target"
    | "recommendation_link_conflict"
    | "guest_recommendation_unsupported"
    | "owner_mismatch"
    | "state_stale"
    | "backup_stale"
    | "storage_unavailable"
    | "journal_recovery_required";
  domain: PortableBackupDomain | "owner" | "journal";
  recordId?: string;
  message: string;
}

export interface PortableImportPlan {
  version: 1;
  operationId: string;
  ownerScope: string;
  backupChecksum: string;
  backupOwnerType: PortableBackupOwnerType;
  backupFingerprint: string;
  sourceFingerprint: string;
  selectedDomains: PortableBackupDomain[];
  exactDuplicateCopyRecordIds: string[];
  mediaDecisions: PortableImportMediaDecision[];
  logDecisions: PortableImportLogDecision[];
  counts: {
    mediaAdd: number;
    mediaSkip: number;
    mediaExact: number;
    mediaConflict: number;
    logAdd: number;
    logSkip: number;
    logConflict: number;
    aliasesAdd: number;
    redirectsAdd: number;
    recommendationLinksAdd: number;
    relationshipRemaps: number;
  };
  blockers: PortableImportBlocker[];
  hasChanges: boolean;
  personalNotesPresent: boolean;
  cloudOperationCount: number;
}

export interface PortableImportReceipt {
  version: 1;
  operationId: string;
  ownerScope: string;
  mediaAdded: number;
  logsAdded: number;
  aliasesAdded: number;
  redirectsAdded: number;
  recommendationLinksAdded: number;
  relationshipRemaps: number;
  syncStatus: "not-required" | "pending";
  completedAt: string;
  undoneAt?: string;
}

export type PortableImportJournalState =
  | "prepared"
  | "applying"
  | "local-committed"
  | "sync-pending"
  | "completed"
  | "rolling-back"
  | "rolled-back"
  | "recovery-required";

interface PortableImportSnapshot {
  datasetOrigin: LocalDatasetOrigin;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  aliases: MediaIdentityAliasRegistry;
  redirects: MediaRecordRedirectRegistry;
  recommendationLinks: RecommendationLocalLink[];
  syncQueue: SyncQueueItem[];
}

export interface PortableImportJournal {
  version: 1;
  operationId: string;
  ownerScope: string;
  state: PortableImportJournalState;
  plan: PortableImportPlan;
  before: PortableImportSnapshot;
  after: PortableImportSnapshot;
  resultFingerprint?: string;
  appliedStages: string[];
  receipt?: PortableImportReceipt;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortableImportStorage
  extends LocalStorageLike, PersonalStorageLike, SocialStorageLike, SyncQueueStorageLike {
  removeItem(key: string): void;
}

export type PortableImportPreparationResult =
  | { ok: true; plan: PortableImportPlan }
  | {
      ok: false;
      code: "backup_invalid" | "storage_unavailable";
      message: string;
    };

export type PortableImportExecutionResult =
  | {
      ok: true;
      state: "completed" | "sync-pending" | "rolled-back";
      receipt: PortableImportReceipt;
      idempotent?: boolean;
    }
  | {
      ok: false;
      code:
        | PortableImportBlocker["code"]
        | "write_failed"
        | "rollback_failed"
        | "cloud_dispatch_started"
        | "cloud_outcome_unknown";
      message: string;
      recoveryRequired: boolean;
    };

export type PortableImportUndoAvailability =
  | {
      available: true;
      code: "available";
      message: string;
      pendingQueueCount: number;
    }
  | {
      available: false;
      code:
        | "no_import"
        | "journal_recovery_required"
        | "owner_mismatch"
        | "import_not_completed"
        | "state_stale"
        | "cloud_dispatch_started"
        | "cloud_outcome_unknown";
      message: string;
      pendingQueueCount: number;
    };

interface BuiltImport {
  plan: PortableImportPlan;
  after: PortableImportSnapshot;
}

type CaptureResult =
  | { ok: true; snapshot: PortableImportSnapshot }
  | { ok: false; message: string };

function browserStorage(): PortableImportStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function stableValue(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")
  }`;
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function snapshotFingerprint(snapshot: PortableImportSnapshot): string {
  return `portable-import-state:v1:${stableHash(stableValue(snapshot))}`;
}

function mediaContent(item: MediaItem): string {
  return stableValue(item);
}

function sameMedia(current: MediaItem, incoming: MediaItem): boolean {
  if (incoming.personalNotes === undefined) {
    const currentWithoutNote = { ...current };
    const incomingWithoutNote = { ...incoming };
    delete currentWithoutNote.personalNotes;
    delete incomingWithoutNote.personalNotes;
    return mediaContent(currentWithoutNote) === mediaContent(incomingWithoutNote);
  }
  return mediaContent(current) === mediaContent(incoming);
}

function sameLog(left: ProgressLog, right: ProgressLog): boolean {
  return stableValue(left) === stableValue(right);
}

function sameRecommendationLink(
  left: RecommendationLocalLink,
  right: RecommendationLocalLink,
): boolean {
  return left.recommendationId === right.recommendationId
    && left.localMediaId === right.localMediaId
    && left.canonicalMediaKey === right.canonicalMediaKey;
}

function normalizeSelectedDomains(
  available: readonly PortableBackupDomain[],
  selected?: readonly PortableBackupDomain[],
): PortableBackupDomain[] {
  const requested = selected ?? available;
  return available.filter((domain) => requested.includes(domain));
}

function captureSnapshot(
  scope: LocalOwnerScope,
  storage: PortableImportStorage,
): CaptureResult {
  const media = inspectScopedLocalData<MediaItem[]>(
    scope,
    "media-library",
    storage,
  );
  const logs = inspectScopedLocalData<ProgressLog[]>(
    scope,
    "progress-logs",
    storage,
  );
  if (
    !["valid", "empty"].includes(media.status)
    || !["valid", "empty"].includes(logs.status)
    || !media.data
    || !logs.data
  ) {
    return { ok: false, message: "Media veya progress current güvenli biçimde okunamadı." };
  }
  const aliases = inspectPersonalData(
    scope,
    "mediaIdentityAliases",
    mediaIdentityAliasRegistryCodec,
    storage,
  );
  const redirects = inspectPersonalData(
    scope,
    "mediaRecordRedirects",
    mediaRecordRedirectRegistryCodec,
    storage,
  );
  const links = inspectRecommendationLinksForScope(scope, storage);
  const queue = inspectSyncQueue(scope, storage);
  if (
    !["valid", "missing"].includes(aliases.status)
    || !["valid", "missing"].includes(redirects.status)
    || !["valid", "missing"].includes(links.status)
    || !["valid", "missing"].includes(queue.status)
    || links.issues.length > 0
    || queue.issues.length > 0
  ) {
    return { ok: false, message: "Import domain registry/queue recovery gerektiriyor." };
  }
  return {
    ok: true,
    snapshot: {
      datasetOrigin: media.datasetOrigin ?? "user",
      mediaItems: media.data,
      progressLogs: logs.data,
      aliases: aliases.status === "valid"
        ? aliases.data
        : emptyMediaIdentityAliasRegistry(),
      redirects: redirects.status === "valid"
        ? redirects.data
        : emptyMediaRecordRedirectRegistry(),
      recommendationLinks: links.links,
      syncQueue: queue.items,
    },
  };
}

function exactCopyRecordId(checksum: string, sourceRecordId: string): string {
  return `import-${stableHash(`${checksum}:${sourceRecordId}:exact-copy`)}`;
}

function remapAlias(
  alias: MediaIdentityAliasRecord,
  recordIdMap: ReadonlyMap<string, string>,
): MediaIdentityAliasRecord {
  return alias.aliasType === "record-id" && recordIdMap.has(alias.alias)
    ? { ...alias, alias: recordIdMap.get(alias.alias)! }
    : alias;
}

function appendQueueOperations(
  scope: LocalOwnerScope,
  current: readonly SyncQueueItem[],
  operationId: string,
  mediaItems: readonly MediaItem[],
  progressLogs: readonly ProgressLog[],
): SyncQueueItem[] {
  if (scope.kind === "guest") return [...current];
  const operations = [
    ...mediaItems.map((item) => ({
      entity: "media_item" as const,
      payload: item,
      recordId: item.id,
    })),
    ...progressLogs.map((log) => ({
      entity: "progress_log" as const,
      payload: log,
      recordId: log.id,
    })),
  ];
  let queue = [...current];
  operations.forEach((operation, index) => {
    queue = queue.filter((item) => {
      const payload = isRecord(item.payload) ? item.payload : null;
      return !(
        item.ownerScope === scope.key
        && item.entity === operation.entity
        && payload?.id === operation.recordId
      );
    });
    queue.push(createSyncQueueItem(scope, {
      id: `${operationId}:cloud:${index}`,
      entity: operation.entity,
      operation: "upsert",
      payload: operation.payload,
      createdAt: new Date(0).toISOString(),
    }));
  });
  return queue;
}

function buildPlan(
  scope: LocalOwnerScope,
  before: PortableImportSnapshot,
  backup: Awaited<ReturnType<typeof decodePortableBackupForImport>> & { ok: true },
  options: {
    selectedDomains?: readonly PortableBackupDomain[];
    exactDuplicateCopyRecordIds?: readonly string[];
  },
): BuiltImport {
  const selectedDomains = normalizeSelectedDomains(
    backup.manifest.domains,
    options.selectedDomains,
  );
  const exactCopies = new Set(options.exactDuplicateCopyRecordIds ?? []);
  const blockers: PortableImportBlocker[] = [];
  const mediaDecisions: PortableImportMediaDecision[] = [];
  const logDecisions: PortableImportLogDecision[] = [];
  const currentById = new Map(before.mediaItems.map((item) => [item.id, item]));
  const currentByIdentity = new Map<string, MediaItem[]>();
  before.mediaItems.forEach((item) => {
    if (!item.identity) return;
    currentByIdentity.set(
      item.identity.key,
      [...(currentByIdentity.get(item.identity.key) ?? []), item]
        .sort((left, right) => left.id.localeCompare(right.id, "en")),
    );
  });
  const recordIdMap = new Map<string, string>();
  const addedMedia: MediaItem[] = [];
  const importedMedia = backup.data.mediaItems ?? [];
  const mediaSelected = selectedDomains.includes("mediaItems");

  for (const incoming of importedMedia) {
    const hasPersonalNote =
      typeof incoming.personalNotes === "string" && incoming.personalNotes.length > 0;
    const existingById = currentById.get(incoming.id);
    if (existingById) {
      if (sameMedia(existingById, incoming)) {
        recordIdMap.set(incoming.id, existingById.id);
        mediaDecisions.push({
          sourceRecordId: incoming.id,
          targetRecordId: existingById.id,
          status: "skip-same",
          canonicalIdentityKey: incoming.identity?.key,
          hasPersonalNote,
          reason: "Aynı record ID ve aynı içerik mevcut.",
        });
      } else {
        mediaDecisions.push({
          sourceRecordId: incoming.id,
          status: "conflict",
          canonicalIdentityKey: incoming.identity?.key,
          hasPersonalNote,
          reason: "Aynı record ID farklı içerik taşıyor.",
        });
        blockers.push({
          code: "record_id_conflict",
          domain: "mediaItems",
          recordId: incoming.id,
          message: `${incoming.id} mevcut record ile sessizce overwrite edilemez.`,
        });
      }
      continue;
    }
    const exactMatches = incoming.identity
      ? currentByIdentity.get(incoming.identity.key) ?? []
      : [];
    const priorCopyId = exactCopyRecordId(
      backup.manifest.checksum.value,
      incoming.id,
    );
    const priorCopy = currentById.get(priorCopyId);
    if (
      exactMatches.length > 0
      && priorCopy
      && sameMedia(priorCopy, { ...incoming, id: priorCopyId })
    ) {
      recordIdMap.set(incoming.id, priorCopyId);
      mediaDecisions.push({
        sourceRecordId: incoming.id,
        targetRecordId: priorCopyId,
        status: "skip-same",
        canonicalIdentityKey: incoming.identity?.key,
        hasPersonalNote,
        reason: "Daha önce eklenen deterministic exact-copy mevcut.",
      });
      continue;
    }
    const wantsCopy = exactCopies.has(incoming.id);
    if (exactMatches.length > 0 && wantsCopy && mediaSelected) {
      const targetId = priorCopyId;
      const copy = { ...incoming, id: targetId };
      const existingCopy = currentById.get(targetId);
      if (existingCopy) {
        if (sameMedia(existingCopy, copy)) {
          recordIdMap.set(incoming.id, targetId);
          mediaDecisions.push({
            sourceRecordId: incoming.id,
            targetRecordId: targetId,
            status: "skip-same",
            canonicalIdentityKey: incoming.identity?.key,
            hasPersonalNote,
            reason: "Daha önce eklenen deterministic exact-copy mevcut.",
          });
        } else {
          mediaDecisions.push({
            sourceRecordId: incoming.id,
            targetRecordId: targetId,
            status: "conflict",
            canonicalIdentityKey: incoming.identity?.key,
            hasPersonalNote,
            reason: "Deterministic remap ID başka içerik tarafından kullanılıyor.",
          });
          blockers.push({
            code: "record_id_conflict",
            domain: "mediaItems",
            recordId: targetId,
            message: `${targetId} deterministic remap hedefi başka içeriğe ait.`,
          });
        }
      } else {
        recordIdMap.set(incoming.id, targetId);
        addedMedia.push(copy);
        currentById.set(targetId, copy);
        currentByIdentity.set(
          incoming.identity!.key,
          [...exactMatches, copy].sort((left, right) =>
            left.id.localeCompare(right.id, "en")),
        );
        mediaDecisions.push({
          sourceRecordId: incoming.id,
          targetRecordId: targetId,
          status: "add-exact-copy",
          canonicalIdentityKey: incoming.identity?.key,
          hasPersonalNote,
          reason: "Explicit seçimle aynı identity ayrı local record olarak eklenecek.",
        });
      }
      continue;
    }
    if (exactMatches.length > 0) {
      if (exactMatches.length === 1) recordIdMap.set(incoming.id, exactMatches[0].id);
      mediaDecisions.push({
        sourceRecordId: incoming.id,
        targetRecordId: exactMatches.length === 1 ? exactMatches[0].id : undefined,
        status: "skip-exact",
        canonicalIdentityKey: incoming.identity?.key,
        hasPersonalNote,
        reason: exactMatches.length === 1
          ? "Aynı Canonical Identity mevcut; varsayılan olarak atlanacak."
          : "Birden fazla exact identity hedefi var; ilişki hedefi belirsiz.",
      });
      continue;
    }
    if (!mediaSelected) {
      mediaDecisions.push({
        sourceRecordId: incoming.id,
        status: "excluded",
        canonicalIdentityKey: incoming.identity?.key,
        hasPersonalNote,
        reason: "Media domain import seçimine dahil değil.",
      });
      continue;
    }
    recordIdMap.set(incoming.id, incoming.id);
    addedMedia.push(incoming);
    currentById.set(incoming.id, incoming);
    if (incoming.identity) {
      currentByIdentity.set(incoming.identity.key, [incoming]);
    }
    mediaDecisions.push({
      sourceRecordId: incoming.id,
      targetRecordId: incoming.id,
      status: "add",
      canonicalIdentityKey: incoming.identity?.key,
      hasPersonalNote,
      reason: "Çakışmasız yeni local record.",
    });
  }

  const nextMedia = [...before.mediaItems, ...addedMedia];
  const afterMediaIds = new Set(nextMedia.map((item) => item.id));
  const currentLogs = new Map(before.progressLogs.map((entry) => [entry.id, entry]));
  const addedLogs: ProgressLog[] = [];
  if (selectedDomains.includes("progressLogs")) {
    for (const incoming of backup.data.progressLogs ?? []) {
      const targetMediaId = recordIdMap.get(incoming.mediaId)
        ?? (afterMediaIds.has(incoming.mediaId) ? incoming.mediaId : undefined);
      if (!targetMediaId) {
        logDecisions.push({
          sourceLogId: incoming.id,
          status: "conflict",
          remapped: false,
          reason: "Progress log için unique media target bulunamadı.",
        });
        blockers.push({
          code: "missing_relationship_target",
          domain: "progressLogs",
          recordId: incoming.id,
          message: `${incoming.id} log media hedefi tahmin edilemez.`,
        });
        continue;
      }
      const remapped = { ...incoming, mediaId: targetMediaId };
      const existing = currentLogs.get(incoming.id);
      if (existing) {
        if (sameLog(existing, remapped)) {
          logDecisions.push({
            sourceLogId: incoming.id,
            targetMediaId,
            status: "skip-same",
            remapped: targetMediaId !== incoming.mediaId,
            reason: "Aynı log ID ve aynı payload mevcut.",
          });
        } else {
          logDecisions.push({
            sourceLogId: incoming.id,
            targetMediaId,
            status: "conflict",
            remapped: targetMediaId !== incoming.mediaId,
            reason: "Aynı log ID farklı payload taşıyor.",
          });
          blockers.push({
            code: "log_id_conflict",
            domain: "progressLogs",
            recordId: incoming.id,
            message: `${incoming.id} log conflict kullanıcı kararı olmadan uygulanamaz.`,
          });
        }
        continue;
      }
      addedLogs.push(remapped);
      currentLogs.set(remapped.id, remapped);
      logDecisions.push({
        sourceLogId: incoming.id,
        targetMediaId,
        status: "add",
        remapped: targetMediaId !== incoming.mediaId,
        reason: targetMediaId === incoming.mediaId
          ? "Çakışmasız yeni progress log."
          : "Progress log aynı import record-ID remap tablosuyla taşınacak.",
      });
    }
  } else {
    (backup.data.progressLogs ?? []).forEach((entry) => {
      logDecisions.push({
        sourceLogId: entry.id,
        status: "excluded",
        remapped: false,
        reason: "Progress-log domain import seçimine dahil değil.",
      });
    });
  }

  const aliasAdditions: MediaIdentityAliasRecord[] = [];
  if (selectedDomains.includes("identityAliases")) {
    aliasAdditions.push(
      ...(backup.data.identityAliases?.records ?? [])
        .map((entry) => remapAlias(entry, recordIdMap)),
    );
  }
  aliasAdditions.push(...aliasesForMediaItems(addedMedia).records);
  for (const addition of aliasAdditions) {
    const existing = before.aliases.records.find((entry) =>
      entry.alias === addition.alias);
    if (existing && existing.canonicalKey !== addition.canonicalKey) {
      blockers.push({
        code: "alias_collision",
        domain: "identityAliases",
        recordId: addition.alias,
        message: `${addition.alias} alias başka canonical identity'ye ait.`,
      });
    }
  }
  const aliasUpdate = updateMediaIdentityAliases(before.aliases, aliasAdditions);
  const newAliasCollisions = aliasUpdate.issues.filter((entry) =>
    entry.code === "IDENTITY_ALIAS_COLLISION"
    && !before.aliases.issues.some((current) => current.id === entry.id));
  newAliasCollisions.forEach((entry) => blockers.push({
    code: "alias_collision",
    domain: "identityAliases",
    recordId: entry.recordId,
    message: entry.evidence,
  }));
  const aliasesDecoded = mediaIdentityAliasRegistryCodec(aliasUpdate.registry);
  if (!aliasesDecoded.ok) {
    blockers.push({
      code: aliasesDecoded.code === "alias_cycle" ? "alias_cycle" : "alias_collision",
      domain: "identityAliases",
      message: aliasesDecoded.message,
    });
  }
  const nextAliases = aliasesDecoded.ok ? aliasesDecoded.value : before.aliases;
  const identityKeys = new Set(nextMedia.flatMap((item) =>
    item.identity ? [item.identity.key] : []));
  aliasAdditions.forEach((entry) => {
    if (!identityKeys.has(entry.canonicalKey)) {
      blockers.push({
        code: "missing_relationship_target",
        domain: "identityAliases",
        recordId: entry.alias,
        message: `${entry.alias} alias hedefi import sonrası media graph'ında yok.`,
      });
    }
  });

  const importedRedirects: MediaRecordRedirect[] = selectedDomains.includes("recordRedirects")
    ? (backup.data.recordRedirects?.records ?? []).map((entry) => ({
        ...entry,
        fromRecordId: recordIdMap.get(entry.fromRecordId) ?? entry.fromRecordId,
        toRecordId: recordIdMap.get(entry.toRecordId) ?? entry.toRecordId,
      }))
    : [];
  const redirectBySource = new Map(
    before.redirects.records.map((entry) => [entry.fromRecordId, entry]),
  );
  for (const entry of importedRedirects) {
    const existing = redirectBySource.get(entry.fromRecordId);
    if (existing && existing.toRecordId !== entry.toRecordId) {
      blockers.push({
        code: "redirect_collision",
        domain: "recordRedirects",
        recordId: entry.fromRecordId,
        message: `${entry.fromRecordId} redirect hedefi mevcut state ile çakışıyor.`,
      });
    } else if (!existing) {
      redirectBySource.set(entry.fromRecordId, entry);
    }
    if (
      entry.fromRecordId === entry.toRecordId
      || afterMediaIds.has(entry.fromRecordId)
    ) {
      blockers.push({
        code: "redirect_cycle",
        domain: "recordRedirects",
        recordId: entry.fromRecordId,
        message: "Redirect source aktif media record olamaz ve kendine gidemez.",
      });
    }
    if (!afterMediaIds.has(entry.toRecordId)) {
      blockers.push({
        code: "missing_relationship_target",
        domain: "recordRedirects",
        recordId: entry.fromRecordId,
        message: `${entry.fromRecordId} redirect hedefi import sonrası mevcut değil.`,
      });
    }
  }
  const redirectDecoded = mediaRecordRedirectRegistryCodec({
    version: 1,
    records: [...redirectBySource.values()],
  });
  if (!redirectDecoded.ok) {
    blockers.push({
      code: redirectDecoded.code === "redirect_cycle"
        ? "redirect_cycle"
        : "redirect_collision",
      domain: "recordRedirects",
      message: redirectDecoded.message,
    });
  }
  const nextRedirects = redirectDecoded.ok
    ? redirectDecoded.value
    : before.redirects;

  const nextLinks = [...before.recommendationLinks];
  let recommendationLinksAdded = 0;
  let recommendationLinkRemaps = 0;
  if (selectedDomains.includes("recommendationLinks")) {
    const importedLinks = backup.data.recommendationLinks ?? [];
    if (scope.kind === "guest" && importedLinks.length > 0) {
      blockers.push({
        code: "guest_recommendation_unsupported",
        domain: "recommendationLinks",
        message: "Guest scope owner-bound recommendation link saklayamaz; domain dışlanmalıdır.",
      });
    } else if (scope.kind === "user") {
      for (const link of importedLinks) {
        const target = recordIdMap.get(link.localMediaId)
          ?? (afterMediaIds.has(link.localMediaId) ? link.localMediaId : undefined);
        if (!target) {
          blockers.push({
            code: "missing_relationship_target",
            domain: "recommendationLinks",
            recordId: link.recommendationId,
            message: `${link.recommendationId} recommendation media hedefi bulunamadı.`,
          });
          continue;
        }
        const next: RecommendationLocalLink = {
          ...link,
          localMediaId: target,
          userId: scope.userId,
        };
        const existing = nextLinks.find((entry) =>
          entry.recommendationId === link.recommendationId);
        if (existing) {
          if (!sameRecommendationLink(existing, next)) {
            blockers.push({
              code: "recommendation_link_conflict",
              domain: "recommendationLinks",
              recordId: link.recommendationId,
              message: `${link.recommendationId} local link başka media record'a bağlı.`,
            });
          }
          continue;
        }
        nextLinks.push(next);
        recommendationLinksAdded += 1;
        if (target !== link.localMediaId) recommendationLinkRemaps += 1;
      }
    }
  }

  const sourceFingerprint = snapshotFingerprint(before);
  const backupFingerprint =
    `portable-v2:${backup.manifest.checksum.value}`;
  const operationId = `portable-import-${stableHash(stableValue({
    ownerScope: scope.key,
    backupFingerprint,
    sourceFingerprint,
    selectedDomains,
    exactDuplicateCopyRecordIds: sortedUnique([...exactCopies]),
  }))}`;
  const cloudOperationCount = scope.kind === "user"
    ? addedMedia.length + addedLogs.length
    : 0;
  const nextQueue = appendQueueOperations(
    scope,
    before.syncQueue,
    operationId,
    addedMedia,
    addedLogs,
  );
  const after: PortableImportSnapshot = {
    datasetOrigin: addedMedia.length > 0 ? "user" : before.datasetOrigin,
    mediaItems: nextMedia,
    progressLogs: [...before.progressLogs, ...addedLogs],
    aliases: nextAliases,
    redirects: nextRedirects,
    recommendationLinks: nextLinks,
    syncQueue: nextQueue,
  };
  const counts = {
    mediaAdd: mediaDecisions.filter((entry) =>
      entry.status === "add" || entry.status === "add-exact-copy").length,
    mediaSkip: mediaDecisions.filter((entry) =>
      entry.status === "skip-same" || entry.status === "skip-exact").length,
    mediaExact: mediaDecisions.filter((entry) =>
      entry.status === "skip-exact" || entry.status === "add-exact-copy").length,
    mediaConflict: mediaDecisions.filter((entry) => entry.status === "conflict").length,
    logAdd: logDecisions.filter((entry) => entry.status === "add").length,
    logSkip: logDecisions.filter((entry) => entry.status === "skip-same").length,
    logConflict: logDecisions.filter((entry) => entry.status === "conflict").length,
    aliasesAdd: Math.max(0, nextAliases.records.length - before.aliases.records.length),
    redirectsAdd: Math.max(0, nextRedirects.records.length - before.redirects.records.length),
    recommendationLinksAdd: recommendationLinksAdded,
    relationshipRemaps:
      logDecisions.filter((entry) => entry.remapped).length
      + recommendationLinkRemaps,
  };
  return {
    plan: {
      version: PORTABLE_IMPORT_PLAN_VERSION,
      operationId,
      ownerScope: scope.key,
      backupChecksum: backup.manifest.checksum.value,
      backupOwnerType: backup.manifest.ownerType,
      backupFingerprint,
      sourceFingerprint,
      selectedDomains,
      exactDuplicateCopyRecordIds: sortedUnique([...exactCopies]),
      mediaDecisions,
      logDecisions,
      counts,
      blockers: blockers.filter((entry, index, all) =>
        all.findIndex((candidate) =>
          candidate.code === entry.code
          && candidate.domain === entry.domain
          && candidate.recordId === entry.recordId
          && candidate.message === entry.message) === index),
      hasChanges: stableValue(before) !== stableValue(after),
      personalNotesPresent: importedMedia.some((item) =>
        typeof item.personalNotes === "string" && item.personalNotes.length > 0),
      cloudOperationCount,
    },
    after,
  };
}

export async function preparePortableAdditiveImport(
  scope: LocalOwnerScope,
  backupText: string,
  options: {
    selectedDomains?: readonly PortableBackupDomain[];
    exactDuplicateCopyRecordIds?: readonly string[];
    storage?: PortableImportStorage | null;
  } = {},
): Promise<PortableImportPreparationResult> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage || !isLocalOwnerScope(scope)) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Import preflight için aktif owner/storage bulunamadı.",
    };
  }
  const backup = await decodePortableBackupForImport(backupText);
  if (!backup.ok) {
    return { ok: false, code: "backup_invalid", message: backup.error };
  }
  const current = captureSnapshot(scope, storage);
  if (!current.ok) {
    return { ok: false, code: "storage_unavailable", message: current.message };
  }
  return {
    ok: true,
    plan: buildPlan(scope, current.snapshot, backup, options).plan,
  };
}

function isQueueItem(value: unknown, ownerScope: string): value is SyncQueueItem {
  if (!isRecord(value)) return false;
  const expectedUserId = ownerScope.startsWith("user:")
    ? ownerScope.slice("user:".length)
    : undefined;
  return typeof value.id === "string"
    && (value.entity === "media_item" || value.entity === "progress_log")
    && (value.operation === "upsert" || value.operation === "delete")
    && isRecord(value.payload)
    && typeof value.createdAt === "string"
    && typeof value.retryCount === "number"
    && (
      value.dispatchStartedAt === undefined
      || (
        typeof value.dispatchStartedAt === "string"
        && Number.isFinite(Date.parse(value.dispatchStartedAt))
      )
    )
    && value.ownerScope === ownerScope
    && value.userId === expectedUserId;
}

function isRecommendationLink(value: unknown, ownerScope: string): value is RecommendationLocalLink {
  if (!isRecord(value) || !ownerScope.startsWith("user:")) return false;
  return typeof value.recommendationId === "string"
    && typeof value.localMediaId === "string"
    && typeof value.canonicalMediaKey === "string"
    && typeof value.linkedAt === "string"
    && value.userId === ownerScope.slice("user:".length);
}

function decodeSnapshot(
  value: unknown,
  ownerScope: string,
): PortableImportSnapshot | null {
  if (
    !isRecord(value)
    || !Array.isArray(value.mediaItems)
    || !Array.isArray(value.progressLogs)
    || !Array.isArray(value.recommendationLinks)
    || !Array.isArray(value.syncQueue)
    || !["demo", "user", "legacy"].includes(String(value.datasetOrigin))
  ) return null;
  const media = mediaIdentityAliasRegistryCodec(value.aliases);
  const redirects = mediaRecordRedirectRegistryCodec(value.redirects);
  const decodedMedia = decodeMediaItems(value.mediaItems);
  const decodedLogs = decodeProgressLogs(value.progressLogs);
  const linksValid = ownerScope === "guest"
    ? value.recommendationLinks.length === 0
    : value.recommendationLinks.every((entry) =>
        isRecommendationLink(entry, ownerScope));
  if (
    !decodedMedia.ok
    || !decodedLogs.ok
    || !media.ok
    || !redirects.ok
    || !linksValid
    || !value.syncQueue.every((entry) => isQueueItem(entry, ownerScope))
  ) return null;
  return {
    datasetOrigin: value.datasetOrigin as LocalDatasetOrigin,
    mediaItems: decodedMedia.records,
    progressLogs: decodedLogs.records,
    aliases: media.value,
    redirects: redirects.value,
    recommendationLinks: value.recommendationLinks as RecommendationLocalLink[],
    syncQueue: value.syncQueue as SyncQueueItem[],
  };
}

function validPlan(value: unknown, ownerScope: string): value is PortableImportPlan {
  if (!isRecord(value) || !isRecord(value.counts)) return false;
  return value.version === 1
    && typeof value.operationId === "string"
    && value.ownerScope === ownerScope
    && typeof value.backupChecksum === "string"
    && typeof value.backupFingerprint === "string"
    && typeof value.sourceFingerprint === "string"
    && Array.isArray(value.selectedDomains)
    && Array.isArray(value.exactDuplicateCopyRecordIds)
    && Array.isArray(value.mediaDecisions)
    && Array.isArray(value.logDecisions)
    && Array.isArray(value.blockers)
    && typeof value.hasChanges === "boolean"
    && typeof value.personalNotesPresent === "boolean"
    && typeof value.cloudOperationCount === "number";
}

const JOURNAL_STATES = new Set<PortableImportJournalState>([
  "prepared",
  "applying",
  "local-committed",
  "sync-pending",
  "completed",
  "rolling-back",
  "rolled-back",
  "recovery-required",
]);

export const portableImportJournalCodec: PersonalDataCodec<PortableImportJournal> = (
  value,
) => {
  if (
    !isRecord(value)
    || value.version !== 1
    || typeof value.operationId !== "string"
    || typeof value.ownerScope !== "string"
    || typeof value.state !== "string"
    || !JOURNAL_STATES.has(value.state as PortableImportJournalState)
    || !validPlan(value.plan, value.ownerScope)
    || value.plan.operationId !== value.operationId
    || !Array.isArray(value.appliedStages)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
  ) {
    return {
      ok: false,
      code: "portable_import_journal_invalid",
      message: "Portable import journal formatı geçersiz.",
    };
  }
  const before = decodeSnapshot(value.before, value.ownerScope);
  const after = decodeSnapshot(value.after, value.ownerScope);
  if (!before || !after) {
    return {
      ok: false,
      code: "portable_import_snapshot_invalid",
      message: "Portable import journal snapshot doğrulaması başarısız.",
    };
  }
  return {
    ok: true,
    value: {
      ...(value as unknown as PortableImportJournal),
      before,
      after,
    },
  };
};

export function readPortableImportJournal(
  scope: LocalOwnerScope,
  storage: PersonalStorageLike | null = browserStorage(),
): PersonalDataReadResult<PortableImportJournal> {
  return readPersonalData(
    scope,
    "portableImportJournal",
    portableImportJournalCodec,
    storage,
  );
}

function writePortableImportJournal(
  scope: LocalOwnerScope,
  journal: PortableImportJournal,
  storage: PersonalStorageLike,
) {
  return writePersonalData(
    scope,
    "portableImportJournal",
    journal,
    portableImportJournalCodec,
    storage,
  );
}

function journalState(
  journal: PortableImportJournal,
  state: PortableImportJournalState,
  additions: Partial<PortableImportJournal> = {},
): PortableImportJournal {
  return {
    ...journal,
    ...additions,
    state,
    updatedAt: new Date().toISOString(),
  };
}

function applySnapshot(
  scope: LocalOwnerScope,
  snapshot: PortableImportSnapshot,
  storage: PortableImportStorage,
): { ok: true } | { ok: false; message: string } {
  const library = saveScopedLibrarySnapshot(
    scope,
    snapshot.mediaItems,
    snapshot.progressLogs,
    snapshot.datasetOrigin,
    storage,
  );
  if (!library.ok) return { ok: false, message: library.message };
  const aliases = writeMediaIdentityAliasRegistry(scope, snapshot.aliases, storage);
  if (!aliases.ok) return { ok: false, message: aliases.message };
  const redirects = writeMediaRecordRedirectRegistry(scope, snapshot.redirects, storage);
  if (!redirects.ok) return { ok: false, message: redirects.message };
  if (!replaceRecommendationLinksForScope(scope, snapshot.recommendationLinks, storage)) {
    return { ok: false, message: "Recommendation link durable write başarısız." };
  }
  if (!replaceSyncQueueDurably(scope, snapshot.syncQueue, storage)) {
    return { ok: false, message: "Cloud queue durable write başarısız." };
  }
  const verified = captureSnapshot(scope, storage);
  return verified.ok
    && snapshotFingerprint(verified.snapshot) === snapshotFingerprint(snapshot)
    ? { ok: true }
    : { ok: false, message: "Import multi-domain read-back verification başarısız." };
}

function notifyLibraryChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("media-tracker:local-library-changed"));
  }
}

function receiptFor(plan: PortableImportPlan): PortableImportReceipt {
  return {
    version: 1,
    operationId: plan.operationId,
    ownerScope: plan.ownerScope,
    mediaAdded: plan.counts.mediaAdd,
    logsAdded: plan.counts.logAdd,
    aliasesAdded: plan.counts.aliasesAdd,
    redirectsAdded: plan.counts.redirectsAdd,
    recommendationLinksAdded: plan.counts.recommendationLinksAdd,
    relationshipRemaps: plan.counts.relationshipRemaps,
    syncStatus: plan.cloudOperationCount > 0 ? "pending" : "not-required",
    completedAt: new Date().toISOString(),
  };
}

export async function executePortableAdditiveImport(
  scope: LocalOwnerScope,
  backupText: string,
  inputPlan: PortableImportPlan,
  options: {
    storage?: PortableImportStorage | null;
    triggerSync?: () => void;
    isOwnerActive?: (scope: LocalOwnerScope) => boolean;
  } = {},
): Promise<PortableImportExecutionResult> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage || !isLocalOwnerScope(scope)) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Import için owner/storage bulunamadı.",
      recoveryRequired: false,
    };
  }
  if (
    inputPlan.ownerScope !== scope.key
    || (options.isOwnerActive && !options.isOwnerActive(scope))
  ) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Import plan aktif owner'a ait değil.",
      recoveryRequired: false,
    };
  }
  const existingJournal = readPortableImportJournal(scope, storage);
  if (
    existingJournal.status === "valid"
    && existingJournal.data.operationId === inputPlan.operationId
    && existingJournal.data.receipt
    && ["completed", "sync-pending"].includes(existingJournal.data.state)
  ) {
    return {
      ok: true,
      state: existingJournal.data.state as "completed" | "sync-pending",
      receipt: existingJournal.data.receipt,
      idempotent: true,
    };
  }
  if (
    existingJournal.status === "valid"
    && !["completed", "sync-pending", "rolled-back"].includes(existingJournal.data.state)
  ) {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Önceki portable import journal recovery gerektiriyor.",
      recoveryRequired: true,
    };
  }
  if (existingJournal.status !== "missing" && existingJournal.status !== "valid") {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Portable import journal doğrulanamadı.",
      recoveryRequired: true,
    };
  }
  const backup = await decodePortableBackupForImport(backupText);
  if (options.isOwnerActive && !options.isOwnerActive(scope)) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Import sırasında aktif owner değişti; işlem uygulanmadı.",
      recoveryRequired: false,
    };
  }
  if (!backup.ok || backup.manifest.checksum.value !== inputPlan.backupChecksum) {
    return {
      ok: false,
      code: "backup_stale",
      message: "Backup içeriği preview sonrasında değişti.",
      recoveryRequired: false,
    };
  }
  const current = captureSnapshot(scope, storage);
  if (!current.ok) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: current.message,
      recoveryRequired: false,
    };
  }
  if (snapshotFingerprint(current.snapshot) !== inputPlan.sourceFingerprint) {
    return {
      ok: false,
      code: "state_stale",
      message: "Aktif owner state'i preview sonrasında değişti.",
      recoveryRequired: false,
    };
  }
  const rebuilt = buildPlan(scope, current.snapshot, backup, {
    selectedDomains: inputPlan.selectedDomains,
    exactDuplicateCopyRecordIds: inputPlan.exactDuplicateCopyRecordIds,
  });
  if (stableValue(rebuilt.plan) !== stableValue(inputPlan)) {
    return {
      ok: false,
      code: "state_stale",
      message: "Import plan güncel state ile deterministik biçimde yeniden üretilemedi.",
      recoveryRequired: false,
    };
  }
  if (rebuilt.plan.blockers.length > 0) {
    const blocker = rebuilt.plan.blockers[0];
    return {
      ok: false,
      code: blocker.code,
      message: rebuilt.plan.blockers.map((entry) => entry.message).join(" "),
      recoveryRequired: false,
    };
  }
  const receipt = receiptFor(rebuilt.plan);
  if (!rebuilt.plan.hasChanges) {
    return {
      ok: true,
      state: receipt.syncStatus === "pending" ? "sync-pending" : "completed",
      receipt,
      idempotent: true,
    };
  }
  let journal: PortableImportJournal = {
    version: PORTABLE_IMPORT_JOURNAL_VERSION,
    operationId: rebuilt.plan.operationId,
    ownerScope: scope.key,
    state: "prepared",
    plan: rebuilt.plan,
    before: current.snapshot,
    after: rebuilt.after,
    appliedStages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const prepared = writePortableImportJournal(scope, journal, storage);
  if (!prepared.ok) {
    return {
      ok: false,
      code: "write_failed",
      message: prepared.message,
      recoveryRequired: false,
    };
  }
  journal = journalState(journal, "applying", { appliedStages: ["journal"] });
  if (!writePortableImportJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "write_failed",
      message: "Import applying journal yazılamadı; domain state değiştirilmedi.",
      recoveryRequired: false,
    };
  }
  const applied = applySnapshot(scope, rebuilt.after, storage);
  if (!applied.ok) {
    const rollback = applySnapshot(scope, current.snapshot, storage);
    journal = journalState(
      journal,
      rollback.ok ? "rolled-back" : "recovery-required",
      { error: applied.message, appliedStages: ["journal", "local-domains"] },
    );
    const journalWrite = writePortableImportJournal(scope, journal, storage);
    const recoveryRequired = !rollback.ok || !journalWrite.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? `${applied.message} Rollback doğrulanamadı.`
        : `${applied.message} Before snapshot geri yüklendi.`,
      recoveryRequired,
    };
  }
  journal = journalState(journal, "local-committed", {
    resultFingerprint: snapshotFingerprint(rebuilt.after),
    receipt,
    appliedStages: [
      "journal",
      "library",
      "aliases",
      "redirects",
      "recommendation-links",
      "cloud-queue",
      "read-back",
    ],
  });
  if (!writePortableImportJournal(scope, journal, storage).ok) {
    const rollback = applySnapshot(scope, current.snapshot, storage);
    const recovery = journalState(
      journal,
      rollback.ok ? "rolled-back" : "recovery-required",
      { error: "Import commit receipt yazılamadı." },
    );
    const journalWrite = writePortableImportJournal(scope, recovery, storage);
    const recoveryRequired = !rollback.ok || !journalWrite.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? "Import receipt ve rollback doğrulanamadı."
        : "Import receipt yazılamadı; before snapshot geri yüklendi.",
      recoveryRequired,
    };
  }
  const finalState = receipt.syncStatus === "pending" ? "sync-pending" : "completed";
  journal = journalState(journal, finalState, { receipt });
  if (!writePortableImportJournal(scope, journal, storage).ok) {
    const rollback = applySnapshot(scope, current.snapshot, storage);
    const recovery = journalState(
      journal,
      rollback.ok ? "rolled-back" : "recovery-required",
      { error: "Final import journal yazılamadı." },
    );
    const journalWrite = writePortableImportJournal(scope, recovery, storage);
    const recoveryRequired = !rollback.ok || !journalWrite.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? "Final journal ve rollback doğrulanamadı."
        : "Final journal yazılamadı; before snapshot geri yüklendi.",
      recoveryRequired,
    };
  }
  notifyLibraryChanged();
  if (finalState === "sync-pending") {
    try {
      options.triggerSync?.();
    } catch {
      // Durable queue is the source of truth; a network trigger failure stays pending.
    }
  }
  return { ok: true, state: finalState, receipt };
}

export function recoverPendingPortableImport(
  scope: LocalOwnerScope,
  storage: PortableImportStorage | null = browserStorage(),
): PortableImportExecutionResult | null {
  if (!storage) return null;
  const read = readPortableImportJournal(scope, storage);
  if (read.status === "missing") return null;
  if (read.status !== "valid") {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Portable import journal corrupt veya foreign-owner.",
      recoveryRequired: true,
    };
  }
  let journal = read.data;
  if (["completed", "sync-pending", "rolled-back"].includes(journal.state)) return null;
  const rollback = applySnapshot(scope, journal.before, storage);
  journal = journalState(
    journal,
    rollback.ok ? "rolled-back" : "recovery-required",
    { error: rollback.ok ? journal.error : "Import recovery rollback başarısız." },
  );
  writePortableImportJournal(scope, journal, storage);
  if (rollback.ok && journal.receipt) {
    notifyLibraryChanged();
    return { ok: true, state: "rolled-back", receipt: journal.receipt };
  }
  return rollback.ok
    ? null
    : {
        ok: false,
        code: "rollback_failed",
        message: "Portable import before snapshot geri yüklenemedi.",
        recoveryRequired: true,
      };
}

export function inspectPortableImportUndo(
  scope: LocalOwnerScope,
  storage: PortableImportStorage | null = browserStorage(),
): PortableImportUndoAvailability {
  if (!storage) {
    return {
      available: false,
      code: "journal_recovery_required",
      message: "Undo durumu için local storage kullanılamıyor.",
      pendingQueueCount: 0,
    };
  }
  const read = readPortableImportJournal(scope, storage);
  if (read.status === "missing") {
    return {
      available: false,
      code: "no_import",
      message: "Geri alınabilecek tamamlanmış additive import bulunmuyor.",
      pendingQueueCount: 0,
    };
  }
  if (read.status !== "valid" || !read.data.receipt) {
    return {
      available: false,
      code: "journal_recovery_required",
      message: "Import journal doğrulanamadığı için undo kullanılamıyor.",
      pendingQueueCount: 0,
    };
  }
  const journal = read.data;
  if (journal.ownerScope !== scope.key) {
    return {
      available: false,
      code: "owner_mismatch",
      message: "Son import başka local owner scope'una ait.",
      pendingQueueCount: 0,
    };
  }
  if (!["completed", "sync-pending"].includes(journal.state)) {
    return {
      available: false,
      code: "import_not_completed",
      message: journal.state === "rolled-back"
        ? "Son import zaten geri alındı."
        : "Import tamamlanmadığı için undo kullanılamıyor.",
      pendingQueueCount: 0,
    };
  }
  const current = captureSnapshot(scope, storage);
  if (!current.ok || !journal.resultFingerprint) {
    return {
      available: false,
      code: "state_stale",
      message: "Import sonrası local state güvenli biçimde doğrulanamadı.",
      pendingQueueCount: 0,
    };
  }
  const beforeQueueIds = new Set(journal.before.syncQueue.map((item) => item.id));
  const importQueue = journal.after.syncQueue.filter((item) =>
    !beforeQueueIds.has(item.id)
    && item.id.startsWith(`${journal.operationId}:cloud:`));
  if (scope.kind === "user" && journal.plan.cloudOperationCount > 0) {
    const currentQueue = new Map(
      current.snapshot.syncQueue.map((item) => [item.id, item]),
    );
    if (
      importQueue.length !== journal.plan.cloudOperationCount
      || importQueue.some((item) => !currentQueue.has(item.id))
    ) {
      return {
        available: false,
        code: "cloud_outcome_unknown",
        message:
          "Import cloud queue işlemlerinden biri dispatch edilmiş, tamamlanmış veya sonucu belirsiz. Local undo uygulanamaz.",
        pendingQueueCount: importQueue.length,
      };
    }
    if (importQueue.some((item) =>
      Boolean(currentQueue.get(item.id)?.dispatchStartedAt))) {
      return {
        available: false,
        code: "cloud_dispatch_started",
        message:
          "Import upsert işlemlerinden en az biri cloud'a gönderilmeye başladı. Local undo uygulanamaz.",
        pendingQueueCount: importQueue.length,
      };
    }
  }
  if (snapshotFingerprint(current.snapshot) !== journal.resultFingerprint) {
    return {
      available: false,
      code: "state_stale",
      message: "Import sonrası local state değişti; mevcut veriyi korumak için undo bloke edildi.",
      pendingQueueCount: importQueue.length,
    };
  }
  return {
    available: true,
    code: "available",
    message: scope.kind === "guest"
      ? "Guest import local snapshot üzerinden güvenle geri alınabilir."
      : "Import queue işlemleri henüz dispatch edilmedi; undo bunları iptal edebilir.",
    pendingQueueCount: importQueue.length,
  };
}

export function undoLastPortableImport(
  scope: LocalOwnerScope,
  storage: PortableImportStorage | null = browserStorage(),
): PortableImportExecutionResult {
  const availability = inspectPortableImportUndo(scope, storage);
  if (!availability.available) {
    return {
      ok: false,
      code: availability.code === "cloud_dispatch_started"
        || availability.code === "cloud_outcome_unknown"
        ? availability.code
        : availability.code === "owner_mismatch"
          ? "owner_mismatch"
          : availability.code === "state_stale"
            ? "state_stale"
            : "journal_recovery_required",
      message: availability.message,
      recoveryRequired: availability.code === "journal_recovery_required",
    };
  }
  if (!storage) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Import undo için storage bulunamadı.",
      recoveryRequired: false,
    };
  }
  const read = readPortableImportJournal(scope, storage);
  if (read.status !== "valid" || !read.data.receipt) {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Undo edilebilir portable import journal bulunamadı.",
      recoveryRequired: read.status !== "missing",
    };
  }
  const importReceipt = read.data.receipt;
  let journal = read.data;
  if (journal.ownerScope !== scope.key) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Import journal aktif owner'a ait değil.",
      recoveryRequired: false,
    };
  }
  if (journal.state === "rolled-back") {
    return {
      ok: true,
      state: "rolled-back",
      receipt: importReceipt,
      idempotent: true,
    };
  }
  if (!["completed", "sync-pending"].includes(journal.state)) {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Import tamamlanmadan undo uygulanamaz.",
      recoveryRequired: journal.state === "recovery-required",
    };
  }
  const current = captureSnapshot(scope, storage);
  if (
    !current.ok
    || !journal.resultFingerprint
    || snapshotFingerprint(current.snapshot) !== journal.resultFingerprint
  ) {
    return {
      ok: false,
      code: "state_stale",
      message: "Import sonrası owner state değişti; undo mevcut veriyi korumak için bloke edildi.",
      recoveryRequired: false,
    };
  }
  journal = journalState(journal, "rolling-back");
  if (!writePortableImportJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "write_failed",
      message: "Undo journal yazılamadı; state değiştirilmedi.",
      recoveryRequired: false,
    };
  }
  const rollback = applySnapshot(scope, journal.before, storage);
  if (!rollback.ok) {
    const restoreImport = applySnapshot(scope, current.snapshot, storage);
    journal = journalState(
      journal,
      restoreImport.ok
        ? (importReceipt.syncStatus === "pending" ? "sync-pending" : "completed")
        : "recovery-required",
      { error: rollback.message },
    );
    writePortableImportJournal(scope, journal, storage);
    return {
      ok: false,
      code: restoreImport.ok ? "write_failed" : "rollback_failed",
      message: restoreImport.ok
        ? "Undo başarısız; import sonucu geri yüklendi."
        : "Undo ve rollback başarısız; recovery gerekiyor.",
      recoveryRequired: !restoreImport.ok,
    };
  }
  const receipt = {
    ...importReceipt,
    syncStatus: "not-required" as const,
    undoneAt: new Date().toISOString(),
  };
  journal = journalState(journal, "rolled-back", {
    receipt,
    resultFingerprint: snapshotFingerprint(journal.before),
  });
  if (!writePortableImportJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Undo uygulandı fakat journal receipt yazılamadı.",
      recoveryRequired: true,
    };
  }
  notifyLibraryChanged();
  return { ok: true, state: "rolled-back", receipt };
}
