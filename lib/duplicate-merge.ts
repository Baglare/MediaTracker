import {
  buildDuplicateEvidence,
  classifyDuplicateGroup,
  scanDuplicateCandidates,
  type DuplicateCandidateGroup,
  type DuplicateClassification,
} from "./duplicate-scanner";
import {
  buildMergedIdentityAliases,
  emptyMediaIdentityAliasRegistry,
  mediaIdentityAliasRegistryCodec,
  readMediaIdentityAliasRegistry,
  writeMediaIdentityAliasRegistry,
  type MediaIdentityAliasRegistry,
} from "./media-identity-aliases";
import {
  getCanonicalMediaIdentity,
  getLegacyCanonicalMediaKey,
  parseCanonicalMediaKeyV2,
  type CanonicalMediaIdentityV2,
} from "./media-identity";
import {
  decodeMediaItems,
  decodeProgressLogs,
} from "./local-data-codec";
import {
  loadScopedMediaList,
  loadScopedProgressLogs,
  saveScopedLibrarySnapshot,
  type LocalDatasetOrigin,
  type LocalStorageLike,
  type StorageWriteResult,
} from "./local-data-storage";
import {
  isLocalOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";
import {
  buildMergedRecordRedirects,
  emptyMediaRecordRedirectRegistry,
  mediaRecordRedirectRegistryCodec,
  readMediaRecordRedirectRegistry,
  writeMediaRecordRedirectRegistry,
  type MediaRecordRedirectRegistry,
} from "./media-record-redirects";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "./personal-data-storage";
import {
  buildRecommendationLinksKeyForScope,
  loadRecommendationLinksForScope,
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

export const DUPLICATE_MERGE_PLAN_VERSION = 1 as const;
export const DUPLICATE_MERGE_JOURNAL_VERSION = 1 as const;

export type DuplicateMergeJournalState =
  | "prepared"
  | "applying"
  | "local-committed"
  | "sync-pending"
  | "completed"
  | "rolling-back"
  | "rolled-back"
  | "recovery-required";

export type FieldMergeSelection =
  | { kind: "record"; recordId: string }
  | { kind: "union"; recordIds: string[] };

export interface MergeFieldConflict {
  field: keyof MediaItem;
  recordIds: string[];
  sensitive: boolean;
  collection: boolean;
  summaries: Record<string, string>;
}

export interface MergeRelationshipSummary {
  progressLogCounts: Record<string, number>;
  progressLogCountBefore: number;
  progressLogCountAfter: number;
  groupMemberships: Record<string, string[]>;
  recommendationLinkCounts: Record<string, number>;
  xpCompatibilityKeys: Record<string, string>;
}

export interface PlannedCloudOperation {
  entity: "media_item" | "progress_log";
  operation: "upsert" | "delete";
  recordId: string;
  payload: MediaItem | ProgressLog | { id: string };
}

export interface DuplicateMergePlan {
  version: 1;
  operationId: string;
  ownerScope: string;
  candidateFingerprint: string;
  candidateEvidenceFingerprint: string;
  classification: DuplicateClassification;
  selectedRecordIds: string[];
  survivorRecordId: string;
  canonicalIdentityKey: string;
  fieldSelections: Record<string, FieldMergeSelection>;
  sourceFingerprint: string;
  relationshipSummary: MergeRelationshipSummary;
  cloudOperations: PlannedCloudOperation[];
  probableConfirmed: boolean;
  explicitMergeConfirmed: boolean;
  createdAt: string;
}

export type DuplicateMergeBlockerCode =
  | "owner_mismatch"
  | "candidate_stale"
  | "record_missing"
  | "selection_too_small"
  | "survivor_not_selected"
  | "canonical_identity_invalid"
  | "canonical_identity_not_selected"
  | "hard_conflict"
  | "group_membership_conflict"
  | "probable_confirmation_required"
  | "merge_confirmation_required"
  | "alias_collision"
  | "redirect_collision"
  | "log_id_conflict"
  | "field_conflict_unresolved"
  | "field_selection_invalid"
  | "xp_compatibility_key_changed"
  | "storage_unavailable"
  | "journal_recovery_required";

export interface DuplicateMergeBlocker {
  code: DuplicateMergeBlockerCode;
  message: string;
  field?: string;
  recordIds?: string[];
}

export interface DuplicateMergePreparation {
  candidate: DuplicateCandidateGroup;
  selectedRecordIds: string[];
  survivorOptions: MediaItem[];
  canonicalIdentityOptions: CanonicalMediaIdentityV2[];
  suggestedCanonicalIdentityKey: string | null;
  fieldConflicts: MergeFieldConflict[];
  relationshipSummary: MergeRelationshipSummary;
  blockers: DuplicateMergeBlocker[];
}

export type DuplicateMergePlanResult =
  | {
      ok: true;
      plan: DuplicateMergePlan;
      mergedItem: MediaItem;
      nextMediaItems: MediaItem[];
      nextProgressLogs: ProgressLog[];
      nextAliases: MediaIdentityAliasRegistry;
      nextRedirects: MediaRecordRedirectRegistry;
      nextRecommendationLinks: RecommendationLocalLink[];
    }
  | { ok: false; blockers: DuplicateMergeBlocker[] };

export interface DuplicateMergeReceipt {
  version: 1;
  operationId: string;
  ownerScope: string;
  survivorRecordId: string;
  removedRecordIds: string[];
  canonicalIdentityKey: string;
  mediaCountBefore: number;
  mediaCountAfter: number;
  logCountBefore: number;
  logCountAfter: number;
  remappedLogCount: number;
  recommendationLinksRemapped: number;
  xpCompatibilityKeys: string[];
  cloudOperationCount: number;
  syncStatus: "not-required" | "pending";
  completedAt: string;
  undoneAt?: string;
}

export interface DuplicateMergeDomainSnapshot {
  datasetOrigin: LocalDatasetOrigin;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  aliases: MediaIdentityAliasRegistry;
  redirects: MediaRecordRedirectRegistry;
  recommendationLinks: RecommendationLocalLink[];
  syncQueue: SyncQueueItem[];
}

export interface DuplicateMergeJournal {
  version: 1;
  operationId: string;
  ownerScope: string;
  state: DuplicateMergeJournalState;
  sourceFingerprint: string;
  resultFingerprint?: string;
  plan: DuplicateMergePlan;
  before: DuplicateMergeDomainSnapshot;
  after: DuplicateMergeDomainSnapshot;
  appliedStages: string[];
  receipt?: DuplicateMergeReceipt;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateMergeStorage
  extends LocalStorageLike, PersonalStorageLike, SyncQueueStorageLike, SocialStorageLike {
  removeItem(key: string): void;
}

export type DuplicateMergeExecutionResult =
  | {
      ok: true;
      state: "completed" | "sync-pending" | "rolled-back";
      receipt: DuplicateMergeReceipt;
      idempotent?: boolean;
    }
  | {
      ok: false;
      code: DuplicateMergeBlockerCode | "write_failed" | "rollback_failed";
      message: string;
      recoveryRequired: boolean;
    };

export type CurrentDuplicateMergePreparationResult =
  | { ok: true; preparation: DuplicateMergePreparation }
  | { ok: false; blocker: DuplicateMergeBlocker };

const SCALAR_FIELDS: readonly (keyof MediaItem)[] = [
  "title",
  "type",
  "theme",
  "mediaType",
  "subType",
  "status",
  "coverImage",
  "currentProgress",
  "totalProgress",
  "rating",
  "userRating",
  "favorite",
  "personalNotes",
  "imdbId",
  "originalTitle",
  "overview",
  "releaseYear",
  "backdropUrl",
  "runtime",
  "numberOfSeasons",
  "numberOfEpisodes",
  "tvmazeStatus",
  "tmdbStatus",
  "lastAirDate",
  "nextAirDate",
  "networkName",
  "language",
  "seriesGroupId",
  "seriesGroupTitle",
  "seriesRelationType",
  "seasonNumber",
  "orderIndex",
  "pageCount",
  "editionCount",
  "nativeTitle",
  "episodes",
  "chapters",
  "volumes",
  "countryOfOrigin",
  "anilistStatus",
  "format",
  "averageScore",
  "popularity",
  "siteUrl",
  "nextAiringEpisode",
] as const;

const COLLECTION_FIELDS: readonly (keyof MediaItem)[] = [
  "tags",
  "genres",
  "seasonBreakdown",
  "authors",
  "languages",
  "subjects",
  "isbn",
  "anilistRelations",
] as const;

const SENSITIVE_FIELDS = new Set<keyof MediaItem>(["personalNotes"]);

function browserStorage(): DuplicateMergeStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right, "en")),
      ),
    );
  }
  return JSON.stringify(value);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function generateOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return `merge-${cryptoApi.randomUUID()}`;
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("secure_merge_operation_id_unavailable");
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `merge-${Array.from(bytes, (entry) => entry.toString(16).padStart(2, "0")).join("")}`;
}

function summarizeFieldValue(field: keyof MediaItem, value: unknown): string {
  if (SENSITIVE_FIELDS.has(field)) {
    return typeof value === "string" && value.length > 0 ? "Gizli içerik mevcut" : "Boş";
  }
  if (value === undefined || value === null || value === "") return "Boş";
  if (Array.isArray(value)) return `${value.length} değer`;
  if (typeof value === "object") return "Yapılandırılmış metadata";
  return String(value).slice(0, 120);
}

function fieldConflicts(items: readonly MediaItem[]): MergeFieldConflict[] {
  const fields = [...SCALAR_FIELDS, ...COLLECTION_FIELDS];
  const conflicts: MergeFieldConflict[] = [];
  for (const field of fields) {
    const values = new Map<string, string[]>();
    const summaries: Record<string, string> = {};
    for (const item of items) {
      const value = item[field];
      const key = stableValue(value);
      values.set(key, [...(values.get(key) ?? []), item.id]);
      summaries[item.id] = summarizeFieldValue(field, value);
    }
    if (values.size < 2) continue;
    conflicts.push({
      field,
      recordIds: sortedUnique(items.map((item) => item.id)),
      sensitive: SENSITIVE_FIELDS.has(field),
      collection: COLLECTION_FIELDS.includes(field),
      summaries,
    });
  }
  return conflicts;
}

function identityRank(identity: CanonicalMediaIdentityV2): number {
  if (identity.source === "legacy") return 0;
  if (identity.source === "manual") return 1;
  return 2;
}

function identityOptions(items: readonly MediaItem[]): CanonicalMediaIdentityV2[] {
  const byKey = new Map<string, CanonicalMediaIdentityV2>();
  for (const item of items) {
    const identity = getCanonicalMediaIdentity(item);
    if (identity) byKey.set(identity.key, identity);
  }
  return [...byKey.values()].sort((left, right) =>
    identityRank(right) - identityRank(left)
    || left.key.localeCompare(right.key, "en"));
}

function logConflict(logs: readonly ProgressLog[]): DuplicateMergeBlocker | null {
  const byId = new Map<string, string>();
  for (const log of logs) {
    const value = stableValue(log);
    const existing = byId.get(log.id);
    if (existing !== undefined && existing !== value) {
      return {
        code: "log_id_conflict",
        message: `Ayni log ID farkli payload tasiyor: ${log.id}`,
      };
    }
    byId.set(log.id, value);
  }
  return null;
}

function relationshipSummary(
  selected: readonly MediaItem[],
  logs: readonly ProgressLog[],
  links: readonly RecommendationLocalLink[],
): MergeRelationshipSummary {
  const ids = new Set(selected.map((item) => item.id));
  const relatedLogs = logs.filter((log) => ids.has(log.mediaId));
  const progressLogCounts: Record<string, number> = {};
  const groupMemberships: Record<string, string[]> = {};
  const recommendationLinkCounts: Record<string, number> = {};
  const xpCompatibilityKeys: Record<string, string> = {};
  for (const item of selected) {
    progressLogCounts[item.id] = relatedLogs.filter((log) => log.mediaId === item.id).length;
    groupMemberships[item.id] = [
      item.seriesGroupId,
      item.seriesGroupTitle,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    recommendationLinkCounts[item.id] = links.filter(
      (link) => link.localMediaId === item.id,
    ).length;
    xpCompatibilityKeys[item.id] = getLegacyCanonicalMediaKey(item);
  }
  return {
    progressLogCounts,
    progressLogCountBefore: relatedLogs.length,
    progressLogCountAfter: new Set(relatedLogs.map((log) => log.id)).size,
    groupMemberships,
    recommendationLinkCounts,
    xpCompatibilityKeys,
  };
}

function sourceFingerprint(args: {
  selectedItems: readonly MediaItem[];
  logs: readonly ProgressLog[];
  aliases: MediaIdentityAliasRegistry;
  redirects: MediaRecordRedirectRegistry;
  links: readonly RecommendationLocalLink[];
}): string {
  const selectedIds = new Set(args.selectedItems.map((item) => item.id));
  return `merge-source:v1:${stableHash(JSON.stringify({
    media: [...args.selectedItems].sort((left, right) => left.id.localeCompare(right.id, "en")),
    logs: args.logs
      .filter((log) => selectedIds.has(log.mediaId))
      .sort((left, right) => left.id.localeCompare(right.id, "en")),
    aliases: args.aliases,
    redirects: args.redirects,
    links: args.links
      .filter((link) => selectedIds.has(link.localMediaId))
      .sort((left, right) => left.recommendationId.localeCompare(right.recommendationId, "en")),
  }))}`;
}

function snapshotFingerprint(
  snapshot: DuplicateMergeDomainSnapshot,
  includeQueue = false,
): string {
  return `merge-state:v1:${stableHash(JSON.stringify({
    datasetOrigin: snapshot.datasetOrigin,
    mediaItems: snapshot.mediaItems,
    progressLogs: snapshot.progressLogs,
    aliases: snapshot.aliases,
    redirects: snapshot.redirects,
    recommendationLinks: snapshot.recommendationLinks,
    ...(includeQueue ? { syncQueue: snapshot.syncQueue } : {}),
  }))}`;
}

function isHardConflict(
  left: MediaItem,
  right: MediaItem,
  aliases: MediaIdentityAliasRegistry,
): boolean {
  return classifyDuplicateGroup(buildDuplicateEvidence(left, right, aliases)).classification
    === "suppressed";
}

function findFreshCandidate(
  scope: LocalOwnerScope,
  candidate: DuplicateCandidateGroup,
  items: readonly MediaItem[],
  aliases: MediaIdentityAliasRegistry,
): DuplicateCandidateGroup | null {
  return scanDuplicateCandidates(items, aliases, { ownerScope: scope.key })
    .candidates
    .find((entry) =>
      entry.fingerprint === candidate.fingerprint
      && entry.evidenceFingerprint === candidate.evidenceFingerprint)
    ?? null;
}

export function prepareDuplicateMerge(args: {
  scope: LocalOwnerScope;
  candidate: DuplicateCandidateGroup;
  selectedRecordIds: readonly string[];
  mediaItems: readonly MediaItem[];
  progressLogs: readonly ProgressLog[];
  aliases: MediaIdentityAliasRegistry;
  redirects: MediaRecordRedirectRegistry;
  recommendationLinks: readonly RecommendationLocalLink[];
}): DuplicateMergePreparation {
  const blockers: DuplicateMergeBlocker[] = [];
  if (args.candidate.ownerScope !== args.scope.key) {
    blockers.push({ code: "owner_mismatch", message: "Candidate aktif owner'a ait degil." });
  }
  const fresh = findFreshCandidate(args.scope, args.candidate, args.mediaItems, args.aliases);
  if (!fresh) {
    blockers.push({ code: "candidate_stale", message: "Candidate veya evidence fingerprint degisti." });
  }
  const candidateIds = new Set(args.candidate.recordIds);
  const selectedRecordIds = sortedUnique(args.selectedRecordIds);
  if (selectedRecordIds.length < 2) {
    blockers.push({
      code: "selection_too_small",
      message: "Merge icin en az iki kayit acikca secilmelidir.",
    });
  }
  const selected = selectedRecordIds
    .map((recordId) => args.mediaItems.find((item) => item.id === recordId))
    .filter((item): item is MediaItem => Boolean(item));
  if (
    selected.length !== selectedRecordIds.length
    || selectedRecordIds.some((recordId) => !candidateIds.has(recordId))
  ) {
    blockers.push({
      code: "record_missing",
      message: "Secilen kayitlardan biri artik mevcut degil veya candidate disinda.",
    });
  }
  for (let left = 0; left < selected.length; left += 1) {
    for (let right = left + 1; right < selected.length; right += 1) {
      if (isHardConflict(selected[left], selected[right], args.aliases)) {
        blockers.push({
          code: "hard_conflict",
          message: "Secilen alt kumede type, namespace, show/season veya yil conflict'i var.",
          recordIds: [selected[left].id, selected[right].id],
        });
      }
    }
  }
  const groupIds = sortedUnique(
    selected
      .map((item) => item.seriesGroupId)
      .filter((groupId): groupId is string => Boolean(groupId)),
  );
  if (groupIds.length > 1) {
    blockers.push({
      code: "group_membership_conflict",
      message: "Secilen kayitlar farkli series group'larinda; mevcut tek-group modeli iliski kaybetmeden merge edemez.",
      recordIds: selected.map((item) => item.id),
    });
  }
  const logBlocker = logConflict(args.progressLogs);
  if (logBlocker) blockers.push(logBlocker);
  const options = identityOptions(selected);
  return {
    candidate: fresh ?? args.candidate,
    selectedRecordIds,
    survivorOptions: selected,
    canonicalIdentityOptions: options,
    suggestedCanonicalIdentityKey: options[0]?.key ?? null,
    fieldConflicts: fieldConflicts(selected),
    relationshipSummary: relationshipSummary(
      selected,
      args.progressLogs,
      args.recommendationLinks,
    ),
    blockers,
  };
}

function applyFieldSelections(args: {
  selected: readonly MediaItem[];
  survivor: MediaItem;
  identity: CanonicalMediaIdentityV2;
  selections: Record<string, FieldMergeSelection>;
}): { item?: MediaItem; blockers: DuplicateMergeBlocker[] } {
  const blockers: DuplicateMergeBlocker[] = [];
  const byId = new Map(args.selected.map((item) => [item.id, item]));
  const output = { ...args.survivor } as MediaItem;
  for (const field of [...SCALAR_FIELDS, ...COLLECTION_FIELDS]) {
    const values = new Set(args.selected.map((item) => stableValue(item[field])));
    if (values.size < 2) continue;
    const selection = args.selections[String(field)];
    if (!selection) {
      blockers.push({
        code: "field_conflict_unresolved",
        field: String(field),
        message: `${String(field)} alan conflict'i cozulmedi.`,
      });
      continue;
    }
    if (selection.kind === "record") {
      const source = byId.get(selection.recordId);
      if (!source) {
        blockers.push({
          code: "field_selection_invalid",
          field: String(field),
          message: `${String(field)} icin secilen kaynak kayit gecersiz.`,
        });
        continue;
      }
      (output as unknown as Record<string, unknown>)[String(field)] = source[field];
      continue;
    }
    if (!COLLECTION_FIELDS.includes(field)) {
      blockers.push({
        code: "field_selection_invalid",
        field: String(field),
        message: `${String(field)} scalar alani union edilemez.`,
      });
      continue;
    }
    const sources = selection.recordIds.map((recordId) => byId.get(recordId));
    if (sources.some((source) => !source)) {
      blockers.push({
        code: "field_selection_invalid",
        field: String(field),
        message: `${String(field)} union kaynaklari gecersiz.`,
      });
      continue;
    }
    const union = new Map<string, unknown>();
    for (const source of sources as MediaItem[]) {
      const value = source[field];
      if (!Array.isArray(value)) continue;
      for (const entry of value) union.set(stableValue(entry), entry);
    }
    (output as unknown as Record<string, unknown>)[String(field)] = [...union.values()];
  }
  output.id = args.survivor.id;
  output.identity = args.identity;
  const identityOwner = args.selected.find(
    (item) => getCanonicalMediaIdentity(item)?.key === args.identity.key,
  );
  output.externalSource = identityOwner?.externalSource;
  output.externalId = identityOwner?.externalId;
  delete output.identityStatus;
  delete output.identityIssueCodes;
  return blockers.length > 0 ? { blockers } : { item: output, blockers: [] };
}

function remapProgressLogs(
  logs: readonly ProgressLog[],
  selectedRecordIds: readonly string[],
  survivorRecordId: string,
): { logs: ProgressLog[]; remappedCount: number } {
  const selected = new Set(selectedRecordIds);
  const byId = new Map<string, ProgressLog>();
  let remappedCount = 0;
  for (const log of logs) {
    const remapped = selected.has(log.mediaId) && log.mediaId !== survivorRecordId
      ? { ...log, mediaId: survivorRecordId }
      : log;
    if (remapped !== log) remappedCount += 1;
    const existing = byId.get(remapped.id);
    if (!existing) byId.set(remapped.id, remapped);
    else if (stableValue(existing) !== stableValue(remapped)) {
      throw new Error(`log_id_conflict:${remapped.id}`);
    }
  }
  return { logs: [...byId.values()], remappedCount };
}

function remapRecommendationLinks(
  links: readonly RecommendationLocalLink[],
  selectedRecordIds: readonly string[],
  survivorRecordId: string,
): { links: RecommendationLocalLink[]; remappedCount: number } {
  const selected = new Set(selectedRecordIds);
  let remappedCount = 0;
  const byRecommendation = new Map<string, RecommendationLocalLink>();
  for (const link of links) {
    const remapped = selected.has(link.localMediaId) && link.localMediaId !== survivorRecordId
      ? { ...link, localMediaId: survivorRecordId }
      : link;
    if (remapped !== link) remappedCount += 1;
    byRecommendation.set(remapped.recommendationId, remapped);
  }
  return { links: [...byRecommendation.values()], remappedCount };
}

function cloudOperations(
  scope: LocalOwnerScope,
  mergedItem: MediaItem,
  losingRecordIds: readonly string[],
  remappedLogs: readonly ProgressLog[],
): PlannedCloudOperation[] {
  if (scope.kind === "guest") return [];
  return [
    {
      entity: "media_item",
      operation: "upsert",
      recordId: mergedItem.id,
      payload: mergedItem,
    },
    ...remappedLogs.map((log) => ({
      entity: "progress_log" as const,
      operation: "upsert" as const,
      recordId: log.id,
      payload: log,
    })),
    ...losingRecordIds.map((recordId) => ({
      entity: "media_item" as const,
      operation: "delete" as const,
      recordId,
      payload: { id: recordId },
    })),
  ];
}

export function buildDuplicateMergePlan(args: {
  scope: LocalOwnerScope;
  candidate: DuplicateCandidateGroup;
  selectedRecordIds: readonly string[];
  survivorRecordId: string;
  canonicalIdentityKey: string;
  fieldSelections: Record<string, FieldMergeSelection>;
  probableConfirmed: boolean;
  explicitMergeConfirmed: boolean;
  mediaItems: readonly MediaItem[];
  progressLogs: readonly ProgressLog[];
  aliases: MediaIdentityAliasRegistry;
  redirects: MediaRecordRedirectRegistry;
  recommendationLinks: readonly RecommendationLocalLink[];
  operationId?: string;
  createdAt?: string;
}): DuplicateMergePlanResult {
  const preparation = prepareDuplicateMerge(args);
  const blockers = [...preparation.blockers];
  const selected = preparation.selectedRecordIds
    .map((recordId) => args.mediaItems.find((item) => item.id === recordId))
    .filter((item): item is MediaItem => Boolean(item));
  const survivor = selected.find((item) => item.id === args.survivorRecordId);
  if (!survivor) {
    blockers.push({
      code: "survivor_not_selected",
      message: "Survivor secilen alt kumede bulunmuyor.",
    });
  }
  const identity = preparation.canonicalIdentityOptions.find(
    (entry) => entry.key === args.canonicalIdentityKey,
  );
  if (!parseCanonicalMediaKeyV2(args.canonicalIdentityKey)) {
    blockers.push({
      code: "canonical_identity_invalid",
      message: "Canonical identity key runtime dogrulamasini gecemedi.",
    });
  } else if (!identity) {
    blockers.push({
      code: "canonical_identity_not_selected",
      message: "Canonical identity secilen kayitlardan birine ait olmali.",
    });
  }
  if (args.candidate.classification === "probable" && !args.probableConfirmed) {
    blockers.push({
      code: "probable_confirmation_required",
      message: "Probable merge icin ayni medyayi temsil ettigi acikca onaylanmali.",
    });
  }
  if (!args.explicitMergeConfirmed) {
    blockers.push({
      code: "merge_confirmation_required",
      message: "Veri silme ve iliski tasima islemi acikca onaylanmali.",
    });
  }
  if (blockers.length > 0 || !survivor || !identity) return { ok: false, blockers };

  const merged = applyFieldSelections({
    selected,
    survivor,
    identity,
    selections: args.fieldSelections,
  });
  blockers.push(...merged.blockers);
  if (!merged.item) return { ok: false, blockers };
  const preMergeXpKeys = new Set(selected.map(getLegacyCanonicalMediaKey));
  if (!preMergeXpKeys.has(getLegacyCanonicalMediaKey(merged.item))) {
    blockers.push({
      code: "xp_compatibility_key_changed",
      message: "Merged survivor yeni bir legacy XP key uretiyor; mevcut entitlement semantigi korunamiyor.",
    });
  }
  const losingRecordIds = selected
    .map((item) => item.id)
    .filter((recordId) => recordId !== survivor.id);
  const aliasResult = buildMergedIdentityAliases({
    current: args.aliases,
    selectedItems: selected,
    canonicalKey: identity.key,
  });
  if (!aliasResult.ok) {
    blockers.push({
      code: "alias_collision",
      message: aliasResult.message,
    });
  }
  const operationId = args.operationId ?? generateOperationId();
  const redirectResult = buildMergedRecordRedirects({
    current: args.redirects,
    losingRecordIds,
    survivorRecordId: survivor.id,
    operationId,
  });
  if (!redirectResult.ok) {
    blockers.push({
      code: "redirect_collision",
      message: redirectResult.message,
    });
  }
  let remapped: ReturnType<typeof remapProgressLogs>;
  try {
    remapped = remapProgressLogs(args.progressLogs, preparation.selectedRecordIds, survivor.id);
  } catch (error) {
    blockers.push({
      code: "log_id_conflict",
      message: error instanceof Error ? error.message : "Progress log ID conflict.",
    });
    return { ok: false, blockers };
  }
  if (blockers.length > 0 || !aliasResult.ok || !redirectResult.ok) {
    return { ok: false, blockers };
  }
  const linkResult = remapRecommendationLinks(
    args.recommendationLinks,
    preparation.selectedRecordIds,
    survivor.id,
  );
  const selectedSet = new Set(preparation.selectedRecordIds);
  const nextMediaItems = args.mediaItems
    .filter((item) => !selectedSet.has(item.id) || item.id === survivor.id)
    .map((item) => item.id === survivor.id ? merged.item! : item);
  const relatedRemappedLogs = remapped.logs.filter((log) => log.mediaId === survivor.id);
  const plannedCloud = cloudOperations(
    args.scope,
    merged.item,
    losingRecordIds,
    relatedRemappedLogs,
  );
  const createdAt = args.createdAt ?? new Date().toISOString();
  const plan: DuplicateMergePlan = {
    version: DUPLICATE_MERGE_PLAN_VERSION,
    operationId,
    ownerScope: args.scope.key,
    candidateFingerprint: args.candidate.fingerprint,
    candidateEvidenceFingerprint: args.candidate.evidenceFingerprint,
    classification: args.candidate.classification,
    selectedRecordIds: preparation.selectedRecordIds,
    survivorRecordId: survivor.id,
    canonicalIdentityKey: identity.key,
    fieldSelections: args.fieldSelections,
    sourceFingerprint: sourceFingerprint({
      selectedItems: selected,
      logs: args.progressLogs,
      aliases: args.aliases,
      redirects: args.redirects,
      links: args.recommendationLinks,
    }),
    relationshipSummary: {
      ...preparation.relationshipSummary,
      progressLogCountAfter: relatedRemappedLogs.length,
    },
    cloudOperations: plannedCloud,
    probableConfirmed: args.probableConfirmed,
    explicitMergeConfirmed: args.explicitMergeConfirmed,
    createdAt,
  };
  return {
    ok: true,
    plan,
    mergedItem: merged.item,
    nextMediaItems,
    nextProgressLogs: remapped.logs,
    nextAliases: aliasResult.registry,
    nextRedirects: redirectResult.registry,
    nextRecommendationLinks: linkResult.links,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJournalState(value: unknown): value is DuplicateMergeJournalState {
  return [
    "prepared",
    "applying",
    "local-committed",
    "sync-pending",
    "completed",
    "rolling-back",
    "rolled-back",
    "recovery-required",
  ].includes(String(value));
}

function isRecommendationLinkSnapshot(
  value: unknown,
  ownerScope: string,
): value is RecommendationLocalLink {
  if (!isRecord(value) || ownerScope === "guest") return false;
  const userId = ownerScope.startsWith("user:") ? ownerScope.slice(5) : null;
  return Boolean(
    userId
    && value.userId === userId
    && typeof value.recommendationId === "string"
    && value.recommendationId.length > 0
    && typeof value.localMediaId === "string"
    && value.localMediaId.length > 0
    && typeof value.canonicalMediaKey === "string"
    && value.canonicalMediaKey.length > 0
    && typeof value.linkedAt === "string"
    && Number.isFinite(Date.parse(value.linkedAt)),
  );
}

function isSyncQueueSnapshot(value: unknown, ownerScope: string): value is SyncQueueItem {
  if (!isRecord(value) || value.ownerScope !== ownerScope) return false;
  const userId = ownerScope.startsWith("user:") ? ownerScope.slice(5) : null;
  return (
    typeof value.id === "string"
    && value.id.length > 0
    && (value.entity === "media_item" || value.entity === "progress_log")
    && (value.operation === "upsert" || value.operation === "delete")
    && isRecord(value.payload)
    && typeof value.createdAt === "string"
    && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.retryCount === "number"
    && Number.isInteger(value.retryCount)
    && value.retryCount >= 0
    && (userId ? value.userId === userId : value.userId === undefined)
  );
}

function decodeSnapshot(
  value: unknown,
  ownerScope: string,
): DuplicateMergeDomainSnapshot | null {
  if (
    !isRecord(value)
    || !Array.isArray(value.mediaItems)
    || !Array.isArray(value.progressLogs)
    || !Array.isArray(value.recommendationLinks)
    || !Array.isArray(value.syncQueue)
    || !["demo", "user", "legacy"].includes(String(value.datasetOrigin))
  ) return null;
  const media = decodeMediaItems(value.mediaItems);
  const logs = decodeProgressLogs(value.progressLogs);
  const alias = mediaIdentityAliasRegistryCodec(value.aliases);
  const redirects = mediaRecordRedirectRegistryCodec(value.redirects);
  if (
    !media.ok
    || !logs.ok
    || !alias.ok
    || !redirects.ok
    || (
      ownerScope === "guest"
        ? value.recommendationLinks.length > 0
        : !value.recommendationLinks.every((entry) =>
            isRecommendationLinkSnapshot(entry, ownerScope))
    )
    || !value.syncQueue.every((entry) => isSyncQueueSnapshot(entry, ownerScope))
  ) return null;
  return {
    datasetOrigin: value.datasetOrigin as LocalDatasetOrigin,
    mediaItems: media.records,
    progressLogs: logs.records,
    aliases: alias.value,
    redirects: redirects.value,
    recommendationLinks: value.recommendationLinks as RecommendationLocalLink[],
    syncQueue: value.syncQueue as SyncQueueItem[],
  };
}

export const duplicateMergeJournalCodec: PersonalDataCodec<DuplicateMergeJournal> = (
  value,
) => {
  if (
    !isRecord(value)
    || value.version !== 1
    || typeof value.operationId !== "string"
    || typeof value.ownerScope !== "string"
    || !isJournalState(value.state)
    || typeof value.sourceFingerprint !== "string"
    || !isRecord(value.plan)
    || value.plan.version !== 1
    || value.plan.operationId !== value.operationId
    || value.plan.ownerScope !== value.ownerScope
    || !Array.isArray(value.appliedStages)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || !Number.isFinite(Date.parse(value.createdAt))
    || !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return {
      ok: false,
      code: "merge_journal_invalid",
      message: "Duplicate merge journal formati gecersiz.",
    };
  }
  const before = decodeSnapshot(value.before, value.ownerScope);
  const after = decodeSnapshot(value.after, value.ownerScope);
  if (!before || !after) {
    return {
      ok: false,
      code: "merge_journal_snapshot_invalid",
      message: "Duplicate merge journal snapshot'i gecersiz.",
    };
  }
  return {
    ok: true,
    value: {
      ...(value as unknown as DuplicateMergeJournal),
      before,
      after,
    },
  };
};

export function readDuplicateMergeJournal(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike | null,
): PersonalDataReadResult<DuplicateMergeJournal> {
  return readPersonalData(
    scope,
    "duplicateMergeJournal",
    duplicateMergeJournalCodec,
    storage,
  );
}

export function writeDuplicateMergeJournal(
  scope: LocalOwnerScope,
  journal: DuplicateMergeJournal,
  storage?: PersonalStorageLike | null,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "duplicateMergeJournal",
    journal,
    duplicateMergeJournalCodec,
    storage,
  );
}

function captureSnapshot(
  scope: LocalOwnerScope,
  storage: DuplicateMergeStorage,
): { ok: true; snapshot: DuplicateMergeDomainSnapshot } | { ok: false; message: string } {
  const media = loadScopedMediaList(scope, storage);
  const logs = loadScopedProgressLogs(scope, storage);
  if (
    (media.status !== "valid" && media.status !== "empty")
    || (logs.status !== "valid" && logs.status !== "empty")
  ) {
    return { ok: false, message: "Library media/log snapshot guvenli bicimde okunamadi." };
  }
  const aliasRead = readMediaIdentityAliasRegistry(scope, storage);
  const redirectRead = readMediaRecordRedirectRegistry(scope, storage);
  if (
    aliasRead.status !== "missing" && aliasRead.status !== "valid"
    || redirectRead.status !== "missing" && redirectRead.status !== "valid"
  ) {
    return { ok: false, message: "Alias veya redirect registry recovery gerektiriyor." };
  }
  const linkKey = buildRecommendationLinksKeyForScope(scope);
  const queueInspection = inspectSyncQueue(scope, storage);
  if (
    queueInspection.status !== "missing"
    && queueInspection.status !== "valid"
  ) {
    return { ok: false, message: "Cloud sync queue formati gecersiz." };
  }
  try {
    const rawLinks = storage.getItem(linkKey);
    if (rawLinks !== null) {
      const parsedLinks = JSON.parse(rawLinks) as unknown;
      if (
        !Array.isArray(parsedLinks)
        || (
          scope.kind === "guest"
            ? parsedLinks.length > 0
            : !parsedLinks.every((entry) => isRecommendationLinkSnapshot(entry, scope.key))
        )
      ) {
        return { ok: false, message: "Recommendation link cache formati gecersiz." };
      }
    }
  } catch {
    return { ok: false, message: "Merge domain snapshot JSON dogrulamasi basarisiz." };
  }
  return {
    ok: true,
    snapshot: {
      datasetOrigin: media.datasetOrigin ?? "user",
      mediaItems: media.data ?? [],
      progressLogs: logs.data ?? [],
      aliases: aliasRead.status === "valid"
        ? aliasRead.data
        : emptyMediaIdentityAliasRegistry(),
      redirects: redirectRead.status === "valid"
        ? redirectRead.data
        : emptyMediaRecordRedirectRegistry(),
      recommendationLinks: loadRecommendationLinksForScope(scope, storage),
      syncQueue: queueInspection.items,
    },
  };
}

export function prepareDuplicateMergeForCurrentState(
  scope: LocalOwnerScope,
  candidate: DuplicateCandidateGroup,
  selectedRecordIds: readonly string[],
  storage: DuplicateMergeStorage | null = browserStorage(),
): CurrentDuplicateMergePreparationResult {
  if (!storage) {
    return {
      ok: false,
      blocker: {
        code: "storage_unavailable",
        message: "Merge preview icin local storage kullanilamiyor.",
      },
    };
  }
  const current = captureSnapshot(scope, storage);
  if (!current.ok) {
    return {
      ok: false,
      blocker: {
        code: "storage_unavailable",
        message: current.message,
      },
    };
  }
  return {
    ok: true,
    preparation: prepareDuplicateMerge({
      scope,
      candidate,
      selectedRecordIds,
      mediaItems: current.snapshot.mediaItems,
      progressLogs: current.snapshot.progressLogs,
      aliases: current.snapshot.aliases,
      redirects: current.snapshot.redirects,
      recommendationLinks: current.snapshot.recommendationLinks,
    }),
  };
}

export function buildDuplicateMergePlanForCurrentState(
  scope: LocalOwnerScope,
  candidate: DuplicateCandidateGroup,
  input: {
    selectedRecordIds: readonly string[];
    survivorRecordId: string;
    canonicalIdentityKey: string;
    fieldSelections: Record<string, FieldMergeSelection>;
    probableConfirmed: boolean;
    explicitMergeConfirmed: boolean;
  },
  storage: DuplicateMergeStorage | null = browserStorage(),
): DuplicateMergePlanResult {
  if (!storage) {
    return {
      ok: false,
      blockers: [{
        code: "storage_unavailable",
        message: "Merge plan icin local storage kullanilamiyor.",
      }],
    };
  }
  const current = captureSnapshot(scope, storage);
  if (!current.ok) {
    return {
      ok: false,
      blockers: [{
        code: "storage_unavailable",
        message: current.message,
      }],
    };
  }
  return buildDuplicateMergePlan({
    scope,
    candidate,
    ...input,
    mediaItems: current.snapshot.mediaItems,
    progressLogs: current.snapshot.progressLogs,
    aliases: current.snapshot.aliases,
    redirects: current.snapshot.redirects,
    recommendationLinks: current.snapshot.recommendationLinks,
  });
}

function queuePayloadId(item: SyncQueueItem): string | null {
  if (!isRecord(item.payload)) return null;
  return typeof item.payload.id === "string" ? item.payload.id : null;
}

function appendCloudOperations(
  scope: LocalOwnerScope,
  current: readonly SyncQueueItem[],
  operations: readonly PlannedCloudOperation[],
  operationId: string,
  createdAt: string,
): SyncQueueItem[] {
  let queue = [...current];
  operations.forEach((operation, index) => {
    const fresh = createSyncQueueItem(scope, {
      id: `${operationId}:cloud:${index}`,
      entity: operation.entity,
      operation: operation.operation,
      payload: operation.payload,
      createdAt,
    });
    queue = queue.filter((item) =>
      !(
        item.ownerScope === scope.key
        && item.entity === fresh.entity
        && queuePayloadId(item) === operation.recordId
      ));
    queue.push(fresh);
  });
  return queue;
}

function verifySnapshot(
  scope: LocalOwnerScope,
  expected: DuplicateMergeDomainSnapshot,
  storage: DuplicateMergeStorage,
  includeQueue = true,
): boolean {
  const current = captureSnapshot(scope, storage);
  return current.ok
    && snapshotFingerprint(current.snapshot, includeQueue)
      === snapshotFingerprint(expected, includeQueue);
}

function applySnapshot(
  scope: LocalOwnerScope,
  snapshot: DuplicateMergeDomainSnapshot,
  storage: DuplicateMergeStorage,
): { ok: true } | { ok: false; message: string } {
  const library = saveScopedLibrarySnapshot(
    scope,
    snapshot.mediaItems,
    snapshot.progressLogs,
    snapshot.datasetOrigin,
    storage,
  );
  if (!library.ok) return { ok: false, message: library.message };
  const alias = writeMediaIdentityAliasRegistry(scope, snapshot.aliases, storage);
  if (!alias.ok) return { ok: false, message: alias.message };
  const redirects = writeMediaRecordRedirectRegistry(scope, snapshot.redirects, storage);
  if (!redirects.ok) return { ok: false, message: redirects.message };
  if (!replaceRecommendationLinksForScope(scope, snapshot.recommendationLinks, storage)) {
    return { ok: false, message: "Recommendation link read-back dogrulamasi basarisiz." };
  }
  if (!replaceSyncQueueDurably(scope, snapshot.syncQueue, storage)) {
    return { ok: false, message: "Cloud sync queue durable write basarisiz." };
  }
  return verifySnapshot(scope, snapshot, storage)
    ? { ok: true }
    : { ok: false, message: "Multi-domain read-back verification basarisiz." };
}

function journalWithState(
  journal: DuplicateMergeJournal,
  state: DuplicateMergeJournalState,
  additions: Partial<DuplicateMergeJournal> = {},
): DuplicateMergeJournal {
  return {
    ...journal,
    ...additions,
    state,
    updatedAt: new Date().toISOString(),
  };
}

function notifyLibraryChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("media-tracker:local-library-changed"));
  }
}

export function executeDuplicateMerge(
  scope: LocalOwnerScope,
  inputPlan: DuplicateMergePlan,
  options: {
    storage?: DuplicateMergeStorage | null;
    triggerSync?: () => void;
  } = {},
): DuplicateMergeExecutionResult {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage || !isLocalOwnerScope(scope)) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Merge icin gecerli owner/storage bulunamadi.",
      recoveryRequired: false,
    };
  }
  if (inputPlan.ownerScope !== scope.key) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Merge plan aktif owner'a ait degil.",
      recoveryRequired: false,
    };
  }
  const existingJournal = readDuplicateMergeJournal(scope, storage);
  if (existingJournal.status === "valid") {
    if (
      existingJournal.data.operationId === inputPlan.operationId
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
    if (existingJournal.data.state === "recovery-required") {
      return {
        ok: false,
        code: "journal_recovery_required",
        message: "Onceki merge journal recovery gerektiriyor.",
        recoveryRequired: true,
      };
    }
  } else if (existingJournal.status !== "missing") {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Merge journal guvenli bicimde okunamadi.",
      recoveryRequired: true,
    };
  }
  const captured = captureSnapshot(scope, storage);
  if (!captured.ok) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: captured.message,
      recoveryRequired: false,
    };
  }
  const before = captured.snapshot;
  const candidate = scanDuplicateCandidates(before.mediaItems, before.aliases, {
    ownerScope: scope.key,
  }).candidates.find((entry) =>
    entry.fingerprint === inputPlan.candidateFingerprint
    && entry.evidenceFingerprint === inputPlan.candidateEvidenceFingerprint);
  if (!candidate) {
    return {
      ok: false,
      code: "candidate_stale",
      message: "Merge candidate artik guncel degil.",
      recoveryRequired: false,
    };
  }
  const rebuilt = buildDuplicateMergePlan({
    scope,
    candidate,
    selectedRecordIds: inputPlan.selectedRecordIds,
    survivorRecordId: inputPlan.survivorRecordId,
    canonicalIdentityKey: inputPlan.canonicalIdentityKey,
    fieldSelections: inputPlan.fieldSelections,
    probableConfirmed: inputPlan.probableConfirmed,
    explicitMergeConfirmed: inputPlan.explicitMergeConfirmed,
    mediaItems: before.mediaItems,
    progressLogs: before.progressLogs,
    aliases: before.aliases,
    redirects: before.redirects,
    recommendationLinks: before.recommendationLinks,
    operationId: inputPlan.operationId,
    createdAt: inputPlan.createdAt,
  });
  if (!rebuilt.ok) {
    return {
      ok: false,
      code: rebuilt.blockers[0]?.code ?? "candidate_stale",
      message: rebuilt.blockers.map((entry) => entry.message).join(" "),
      recoveryRequired: false,
    };
  }
  if (
    rebuilt.plan.sourceFingerprint !== inputPlan.sourceFingerprint
    || stableValue(rebuilt.plan) !== stableValue(inputPlan)
  ) {
    return {
      ok: false,
      code: "candidate_stale",
      message: "Preview sonrasi kaynak veya plan degisti.",
      recoveryRequired: false,
    };
  }
  const linkRemapped = before.recommendationLinks.filter((link) =>
    inputPlan.selectedRecordIds.includes(link.localMediaId)
    && link.localMediaId !== inputPlan.survivorRecordId).length;
  const remappedLogs = before.progressLogs.filter((log) =>
    inputPlan.selectedRecordIds.includes(log.mediaId)
    && log.mediaId !== inputPlan.survivorRecordId).length;
  const queue = appendCloudOperations(
    scope,
    before.syncQueue,
    rebuilt.plan.cloudOperations,
    rebuilt.plan.operationId,
    rebuilt.plan.createdAt,
  );
  const after: DuplicateMergeDomainSnapshot = {
    ...before,
    mediaItems: rebuilt.nextMediaItems,
    progressLogs: rebuilt.nextProgressLogs,
    aliases: rebuilt.nextAliases,
    redirects: rebuilt.nextRedirects,
    recommendationLinks: rebuilt.nextRecommendationLinks,
    syncQueue: queue,
  };
  const receipt: DuplicateMergeReceipt = {
    version: 1,
    operationId: rebuilt.plan.operationId,
    ownerScope: scope.key,
    survivorRecordId: rebuilt.plan.survivorRecordId,
    removedRecordIds: rebuilt.plan.selectedRecordIds.filter(
      (recordId) => recordId !== rebuilt.plan.survivorRecordId,
    ),
    canonicalIdentityKey: rebuilt.plan.canonicalIdentityKey,
    mediaCountBefore: before.mediaItems.length,
    mediaCountAfter: after.mediaItems.length,
    logCountBefore: before.progressLogs.length,
    logCountAfter: after.progressLogs.length,
    remappedLogCount: remappedLogs,
    recommendationLinksRemapped: linkRemapped,
    xpCompatibilityKeys: sortedUnique(
      Object.values(rebuilt.plan.relationshipSummary.xpCompatibilityKeys),
    ),
    cloudOperationCount: rebuilt.plan.cloudOperations.length,
    syncStatus: rebuilt.plan.cloudOperations.length > 0 ? "pending" : "not-required",
    completedAt: new Date().toISOString(),
  };
  let journal: DuplicateMergeJournal = {
    version: DUPLICATE_MERGE_JOURNAL_VERSION,
    operationId: rebuilt.plan.operationId,
    ownerScope: scope.key,
    state: "prepared",
    sourceFingerprint: rebuilt.plan.sourceFingerprint,
    plan: rebuilt.plan,
    before,
    after,
    appliedStages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const preparedWrite = writeDuplicateMergeJournal(scope, journal, storage);
  if (!preparedWrite.ok) {
    return {
      ok: false,
      code: "write_failed",
      message: preparedWrite.message,
      recoveryRequired: false,
    };
  }
  journal = journalWithState(journal, "applying", { appliedStages: ["journal"] });
  if (!writeDuplicateMergeJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "write_failed",
      message: "Merge applying journal yazilamadi; domain verisi degistirilmedi.",
      recoveryRequired: false,
    };
  }
  const applied = applySnapshot(scope, after, storage);
  if (!applied.ok) {
    const rolledBack = applySnapshot(scope, before, storage);
    journal = journalWithState(
      journal,
      rolledBack.ok ? "rolled-back" : "recovery-required",
      {
        appliedStages: ["journal", "local-domains"],
        error: applied.message,
      },
    );
    const rollbackJournal = writeDuplicateMergeJournal(scope, journal, storage);
    const recoveryRequired = !rolledBack.ok || !rollbackJournal.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: rolledBack.ok && rollbackJournal.ok
        ? `${applied.message} Degisiklikler before snapshot'tan geri alindi.`
        : `${applied.message} Rollback da dogrulanamadi; recovery gerekiyor.`,
      recoveryRequired,
    };
  }
  journal = journalWithState(journal, "local-committed", {
    resultFingerprint: snapshotFingerprint(after),
    appliedStages: ["journal", "library", "aliases", "redirects", "links", "cloud-queue"],
    receipt,
  });
  if (!writeDuplicateMergeJournal(scope, journal, storage).ok) {
    const rolledBack = applySnapshot(scope, before, storage);
    const rollbackJournal = writeDuplicateMergeJournal(
      scope,
      journalWithState(journal, rolledBack.ok ? "rolled-back" : "recovery-required", {
        error: "Local commit journal read-back verification basarisiz.",
      }),
      storage,
    );
    const recoveryRequired = !rolledBack.ok || !rollbackJournal.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? "Local commit journal dogrulanamadi; rollback/recovery kaydi tamamlanamadi."
        : "Local commit journal dogrulanamadi; rollback uygulandi.",
      recoveryRequired,
    };
  }
  const finalState = rebuilt.plan.cloudOperations.length > 0 ? "sync-pending" : "completed";
  journal = journalWithState(journal, finalState, { receipt });
  if (!writeDuplicateMergeJournal(scope, journal, storage).ok) {
    const rolledBack = applySnapshot(scope, before, storage);
    const rollbackJournal = writeDuplicateMergeJournal(
      scope,
      journalWithState(journal, rolledBack.ok ? "rolled-back" : "recovery-required", {
        error: "Final merge receipt read-back verification basarisiz.",
      }),
      storage,
    );
    const recoveryRequired = !rolledBack.ok || !rollbackJournal.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? "Final merge receipt yazilamadi; rollback/recovery kaydi tamamlanamadi."
        : "Final merge receipt yazilamadi; local rollback uygulandi.",
      recoveryRequired,
    };
  }
  notifyLibraryChanged();
  if (finalState === "sync-pending") options.triggerSync?.();
  return { ok: true, state: finalState, receipt };
}

export function recoverPendingDuplicateMerge(
  scope: LocalOwnerScope,
  storage: DuplicateMergeStorage | null = browserStorage(),
): DuplicateMergeExecutionResult | null {
  if (!storage) return null;
  const read = readDuplicateMergeJournal(scope, storage);
  if (read.status === "missing") return null;
  if (read.status !== "valid") {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Merge journal corrupt veya foreign-owner durumda.",
      recoveryRequired: true,
    };
  }
  const journal = read.data;
  if (["completed", "sync-pending", "rolled-back"].includes(journal.state)) return null;
  const rolledBack = applySnapshot(scope, journal.before, storage);
  const next = journalWithState(
    journal,
    rolledBack.ok ? "rolled-back" : "recovery-required",
    { error: rolledBack.ok ? journal.error : "Startup rollback verification basarisiz." },
  );
  writeDuplicateMergeJournal(scope, next, storage);
  if (rolledBack.ok) {
    notifyLibraryChanged();
    return journal.receipt
      ? { ok: true, state: "rolled-back", receipt: journal.receipt }
      : null;
  }
  return {
    ok: false,
    code: "rollback_failed",
    message: "Startup recovery before snapshot'i geri yukleyemedi.",
    recoveryRequired: true,
  };
}

function compensationOperations(
  scope: LocalOwnerScope,
  journal: DuplicateMergeJournal,
): PlannedCloudOperation[] {
  if (scope.kind === "guest") return [];
  const selected = new Set(journal.plan.selectedRecordIds);
  return [
    ...journal.before.mediaItems
      .filter((item) => selected.has(item.id))
      .map((item) => ({
        entity: "media_item" as const,
        operation: "upsert" as const,
        recordId: item.id,
        payload: item,
      })),
    ...journal.before.progressLogs
      .filter((log) => selected.has(log.mediaId))
      .map((log) => ({
        entity: "progress_log" as const,
        operation: "upsert" as const,
        recordId: log.id,
        payload: log,
      })),
  ];
}

export function undoLastDuplicateMerge(
  scope: LocalOwnerScope,
  options: {
    storage?: DuplicateMergeStorage | null;
    triggerSync?: () => void;
  } = {},
): DuplicateMergeExecutionResult {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Undo icin storage kullanilamiyor.",
      recoveryRequired: false,
    };
  }
  const read = readDuplicateMergeJournal(scope, storage);
  if (read.status !== "valid") {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Undo edilebilir merge journal bulunamadi.",
      recoveryRequired: read.status !== "missing",
    };
  }
  let journal = read.data;
  if (journal.ownerScope !== scope.key) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Merge journal aktif owner'a ait degil.",
      recoveryRequired: false,
    };
  }
  if (journal.state === "rolled-back" && journal.receipt) {
    return { ok: true, state: "rolled-back", receipt: journal.receipt, idempotent: true };
  }
  if (!["completed", "sync-pending"].includes(journal.state) || !journal.receipt) {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Merge tamamlanmadan undo uygulanamaz.",
      recoveryRequired: journal.state === "recovery-required",
    };
  }
  const currentReceipt = journal.receipt;
  const current = captureSnapshot(scope, storage);
  if (!current.ok) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: current.message,
      recoveryRequired: false,
    };
  }
  if (snapshotFingerprint(current.snapshot) !== journal.resultFingerprint) {
    return {
      ok: false,
      code: "candidate_stale",
      message: "Merge sonrasi ilgili local state degisti; undo koruma nedeniyle bloke edildi.",
      recoveryRequired: false,
    };
  }
  const compensating = compensationOperations(scope, journal);
  const beforeWithQueue: DuplicateMergeDomainSnapshot = {
    ...journal.before,
    syncQueue: appendCloudOperations(
      scope,
      current.snapshot.syncQueue,
      compensating,
      `${journal.operationId}:undo`,
      new Date().toISOString(),
    ),
  };
  journal = journalWithState(journal, "rolling-back");
  if (!writeDuplicateMergeJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "write_failed",
      message: "Undo journal yazilamadi; domain verisi degistirilmedi.",
      recoveryRequired: false,
    };
  }
  const restored = applySnapshot(scope, beforeWithQueue, storage);
  if (!restored.ok) {
    const mergeRestored = applySnapshot(scope, current.snapshot, storage);
    journal = journalWithState(
      journal,
      mergeRestored.ok ? "sync-pending" : "recovery-required",
      { error: restored.message },
    );
    writeDuplicateMergeJournal(scope, journal, storage);
    return {
      ok: false,
      code: mergeRestored.ok ? "write_failed" : "rollback_failed",
      message: mergeRestored.ok
        ? "Undo basarisiz; merge sonrasi state geri yuklendi."
        : "Undo ve undo rollback basarisiz; recovery gerekiyor.",
      recoveryRequired: !mergeRestored.ok,
    };
  }
  const receipt = {
    ...currentReceipt,
    syncStatus: compensating.length > 0 ? "pending" as const : "not-required" as const,
    undoneAt: new Date().toISOString(),
  };
  journal = journalWithState(journal, "rolled-back", {
    receipt,
    resultFingerprint: snapshotFingerprint(beforeWithQueue),
  });
  if (!writeDuplicateMergeJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "journal_recovery_required",
      message: "Undo uygulandi fakat receipt yazilamadi; recovery gerekiyor.",
      recoveryRequired: true,
    };
  }
  notifyLibraryChanged();
  if (compensating.length > 0) options.triggerSync?.();
  return { ok: true, state: "rolled-back", receipt };
}
