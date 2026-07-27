import {
  decodeCanonicalMediaIdentity,
  type CanonicalMediaIdentityV2,
} from "./media-identity";
import {
  duplicateMergeJournalCodec,
  recoverPendingDuplicateMerge,
  type DuplicateMergeJournal,
  type DuplicateMergeStorage,
} from "./duplicate-merge";
import {
  duplicateReviewRegistryCodec,
  emptyDuplicateReviewRegistry,
  writeDuplicateReviewRegistry,
  type DuplicateReviewDecision,
  type DuplicateReviewRegistry,
} from "./duplicate-review-registry";
import {
  buildLocalDataGraphFingerprint,
  scanLocalDataIntegrity,
  type LocalDataIntegrityInput,
  type LocalDataIntegrityIssue,
  type LocalDataIntegrityReport,
} from "./local-data-integrity";
import {
  inspectScopedLocalData,
  saveScopedLibrarySnapshotForIntegrityRollback,
  saveScopedLibrarySnapshotForIntegrityRepair,
  type LocalDatasetOrigin,
  type LocalStorageLike,
} from "./local-data-storage";
import {
  emptyMediaIdentityAliasRegistry,
  mediaIdentityAliasRecoveryCodec,
  mediaIdentityAliasRegistryCodec,
  type MediaIdentityAliasRegistry,
} from "./media-identity-aliases";
import {
  emptyMediaRecordRedirectRegistry,
  mediaRecordRedirectRecoveryCodec,
  mediaRecordRedirectRegistryCodec,
  type MediaRecordRedirectRegistry,
} from "./media-record-redirects";
import {
  isLocalOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";
import {
  inspectPersonalData,
  readPersonalData,
  writePersonalData,
  writeRepairedPersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "./personal-data-storage";
import {
  inspectRecommendationLinksForScope,
  replaceRecommendationLinksForScope,
  type RecommendationLocalLink,
  type StorageLike as SocialStorageLike,
} from "./social/local-social";
import {
  inspectSyncQueue,
  type SyncQueueStorageLike,
} from "./sync-queue";
import type { MediaItem, ProgressLog } from "./types";

export const INTEGRITY_REPAIR_PLAN_VERSION = 1 as const;
export const INTEGRITY_REPAIR_JOURNAL_VERSION = 1 as const;

export type IntegrityRepairKind =
  | "stale-duplicate-review"
  | "flatten-identity-aliases"
  | "flatten-record-redirects"
  | "dedupe-group-order"
  | "remap-recommendation-link"
  | "remap-progress-log"
  | "repair-identity-key"
  | "recover-merge-journal";

export type IntegrityRepairJournalState =
  | "prepared"
  | "applying"
  | "completed"
  | "rolling-back"
  | "rolled-back"
  | "recovery-required";

export interface IntegrityRepairPreviewChange {
  domain: string;
  entityId: string;
  field: string;
  before: string;
  after: string;
}

export interface IntegrityRepairPreview {
  title: string;
  description: string;
  affectedRecordCount: number;
  affectedLogCount: number;
  affectedGroupCount: number;
  changes: IntegrityRepairPreviewChange[];
}

type IntegrityRepairAction =
  | {
      kind: "remove-duplicate-review";
      decision: DuplicateReviewDecision;
    }
  | {
      kind: "flatten-identity-aliases";
      before: MediaIdentityAliasRegistry;
      after: MediaIdentityAliasRegistry;
    }
  | {
      kind: "flatten-record-redirects";
      before: MediaRecordRedirectRegistry;
      after: MediaRecordRedirectRegistry;
    }
  | {
      kind: "clear-group-order";
      recordId: string;
      groupId: string;
      beforeOrderIndex: number;
    }
  | {
      kind: "remap-recommendation-link";
      recommendationId: string;
      beforeRecordId: string;
      afterRecordId: string;
    }
  | {
      kind: "remap-progress-log";
      logId: string;
      beforeRecordId: string;
      afterRecordId: string;
    }
  | {
      kind: "repair-identity-key";
      recordId: string;
      beforeIdentity: CanonicalMediaIdentityV2;
      afterIdentity: CanonicalMediaIdentityV2;
    }
  | {
      kind: "recover-merge-journal";
      mergeOperationId: string;
    };

export interface IntegrityRepairPlan {
  version: 1;
  operationId: string;
  ownerScope: string;
  issueId: string;
  issueCode: string;
  kind: IntegrityRepairKind;
  sourceFingerprint: string;
  actions: IntegrityRepairAction[];
  preview: IntegrityRepairPreview;
  createdAt: string;
}

export interface IntegrityRepairJournal {
  version: 1;
  operationId: string;
  ownerScope: string;
  state: IntegrityRepairJournalState;
  plan: IntegrityRepairPlan;
  sourceFingerprint: string;
  resultFingerprint?: string;
  appliedStages: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrityRepairStorage
  extends LocalStorageLike, PersonalStorageLike, SocialStorageLike, SyncQueueStorageLike {
  removeItem(key: string): void;
}

export type IntegrityRepairPreparationResult =
  | { ok: true; plan: IntegrityRepairPlan }
  | {
      ok: false;
      code:
        | "storage_unavailable"
        | "issue_stale"
        | "owner_mismatch"
        | "manual_only"
        | "unsafe_repair";
      message: string;
    };

export type IntegrityRepairExecutionResult =
  | {
      ok: true;
      state: "completed" | "rolled-back";
      journal: IntegrityRepairJournal;
      idempotent?: boolean;
    }
  | {
      ok: false;
      code:
        | "storage_unavailable"
        | "issue_stale"
        | "owner_mismatch"
        | "manual_only"
        | "unsafe_repair"
        | "write_failed"
        | "rollback_failed"
        | "recovery_required";
      message: string;
      recoveryRequired: boolean;
    };

interface CapturedIntegrityState {
  datasetOrigin: LocalDatasetOrigin;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  aliases: MediaIdentityAliasRegistry;
  redirects: MediaRecordRedirectRegistry;
  duplicateReviews: DuplicateReviewRegistry;
  recommendationLinks: RecommendationLocalLink[];
  mergeJournal: PersonalDataReadResult<DuplicateMergeJournal>;
  input: LocalDataIntegrityInput;
  report: LocalDataIntegrityReport;
}

type CaptureResult =
  | { ok: true; state: CapturedIntegrityState }
  | { ok: false; message: string };

function browserStorage(): IntegrityRepairStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
    .join(",")}}`;
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableValue(left) === stableValue(right);
}

function randomOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `integrity-repair-${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("secure_integrity_repair_operation_id_unavailable");
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `integrity-repair-${Array.from(
    bytes,
    (entry) => entry.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function captureIntegrityState(
  scope: LocalOwnerScope,
  storage: IntegrityRepairStorage | null,
): CaptureResult {
  if (!storage) return { ok: false, message: "Local storage kullanılamıyor." };
  const mediaEnvelope = inspectScopedLocalData<MediaItem[]>(
    scope,
    "media-library",
    storage,
  );
  const progressEnvelope = inspectScopedLocalData<ProgressLog[]>(
    scope,
    "progress-logs",
    storage,
  );
  if (
    !["valid", "empty"].includes(mediaEnvelope.status)
    || !["valid", "empty"].includes(progressEnvelope.status)
    || !mediaEnvelope.data
    || !progressEnvelope.data
  ) {
    return {
      ok: false,
      message: "Media veya progress envelope repair için valid/empty durumda değil.",
    };
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
  const duplicateReviews = inspectPersonalData(
    scope,
    "duplicateReviewDecisions",
    duplicateReviewRegistryCodec,
    storage,
  );
  const mergeJournal = inspectPersonalData(
    scope,
    "duplicateMergeJournal",
    duplicateMergeJournalCodec,
    storage,
  );
  const recommendationLinks = inspectRecommendationLinksForScope(scope, storage);
  const syncQueue = inspectSyncQueue(scope, storage);

  const aliasData = aliases.status === "valid"
    ? aliases.data
    : aliases.status === "missing"
      ? emptyMediaIdentityAliasRegistry()
      : aliases.status === "corrupt" && aliases.repairData
        ? aliases.repairData.current
        : null;
  const redirectData = redirects.status === "valid"
    ? redirects.data
    : redirects.status === "missing"
      ? emptyMediaRecordRedirectRegistry()
      : redirects.status === "corrupt" && redirects.repairData
        ? redirects.repairData.current
        : null;
  const reviewData = duplicateReviews.status === "valid"
    ? duplicateReviews.data
    : duplicateReviews.status === "missing"
      ? emptyDuplicateReviewRegistry()
      : null;
  if (!aliasData || !redirectData || !reviewData) {
    return { ok: false, message: "Repair dışındaki registry recovery gerektiriyor." };
  }
  if (
    recommendationLinks.status !== "valid"
    && recommendationLinks.status !== "missing"
  ) {
    return { ok: false, message: "Recommendation link cache recovery gerektiriyor." };
  }
  if (syncQueue.status !== "valid" && syncQueue.status !== "missing") {
    return { ok: false, message: "Cloud queue recovery gerektiriyor; repair başlatılmadı." };
  }

  const input: LocalDataIntegrityInput = {
    scope,
    mediaItems: mediaEnvelope.data,
    progressLogs: progressEnvelope.data,
    mediaEnvelope,
    progressEnvelope,
    aliases,
    redirects,
    duplicateReviews,
    mergeJournal,
    recommendationLinks,
    syncQueue,
  };
  return {
    ok: true,
    state: {
      datasetOrigin: mediaEnvelope.datasetOrigin ?? "user",
      mediaItems: mediaEnvelope.data,
      progressLogs: progressEnvelope.data,
      aliases: aliasData,
      redirects: redirectData,
      duplicateReviews: reviewData,
      recommendationLinks: recommendationLinks.links,
      mergeJournal,
      input,
      report: scanLocalDataIntegrity(input),
    },
  };
}

function preview(
  title: string,
  description: string,
  changes: IntegrityRepairPreviewChange[],
  actions: readonly IntegrityRepairAction[],
): IntegrityRepairPreview {
  const recordIds = new Set<string>();
  const logIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const action of actions) {
    if ("recordId" in action) recordIds.add(action.recordId);
    if (action.kind === "remap-recommendation-link") {
      recordIds.add(action.beforeRecordId);
      recordIds.add(action.afterRecordId);
    }
    if (action.kind === "remap-progress-log") {
      logIds.add(action.logId);
      recordIds.add(action.beforeRecordId);
      recordIds.add(action.afterRecordId);
    }
    if (action.kind === "clear-group-order") groupIds.add(action.groupId);
  }
  return {
    title,
    description,
    affectedRecordCount: recordIds.size,
    affectedLogCount: logIds.size,
    affectedGroupCount: groupIds.size,
    changes,
  };
}

function issueAction(
  issue: LocalDataIntegrityIssue,
  state: CapturedIntegrityState,
): {
  kind: IntegrityRepairKind;
  actions: IntegrityRepairAction[];
  preview: IntegrityRepairPreview;
} | null {
  if (issue.code === "DUPLICATE_REVIEW_DECISION_STALE") {
    const fingerprints = new Set(issue.evidence.values ?? []);
    const decision = state.duplicateReviews.decisions.find((entry) =>
      fingerprints.has(entry.candidateFingerprint)
      && fingerprints.has(entry.evidenceFingerprint));
    if (!decision) return null;
    const actions: IntegrityRepairAction[] = [{
      kind: "remove-duplicate-review",
      decision,
    }];
    return {
      kind: "stale-duplicate-review",
      actions,
      preview: preview(
        "Stale duplicate kararını temizle",
        "Artık güncel candidate/evidence ile eşleşmeyen tek karar kaldırılacak.",
        [{
          domain: "duplicate-review",
          entityId: decision.candidateFingerprint,
          field: "decision",
          before: decision.decision,
          after: "removed",
        }],
        actions,
      ),
    };
  }
  if (
    issue.code === "ALIAS_CHAIN"
    && state.input.aliases?.status === "corrupt"
    && state.input.aliases.repairData
  ) {
    const { current, repaired } = state.input.aliases.repairData;
    const actions: IntegrityRepairAction[] = [{
      kind: "flatten-identity-aliases",
      before: current,
      after: repaired,
    }];
    return {
      kind: "flatten-identity-aliases",
      actions,
      preview: preview(
        "Identity alias chain'ini flatten et",
        "Her alias doğrulanmış unique terminal Canonical Identity V2 hedefe bağlanacak.",
        repaired.records.map((entry) => {
          const before = current.records.find((item) => item.alias === entry.alias);
          return {
            domain: "identity-alias",
            entityId: entry.alias,
            field: "canonicalKey",
            before: before?.canonicalKey ?? "missing",
            after: entry.canonicalKey,
          };
        }).filter((entry) => entry.before !== entry.after),
        actions,
      ),
    };
  }
  if (
    issue.code === "REDIRECT_CHAIN"
    && state.input.redirects?.status === "corrupt"
    && state.input.redirects.repairData
  ) {
    const { current, repaired } = state.input.redirects.repairData;
    const actions: IntegrityRepairAction[] = [{
      kind: "flatten-record-redirects",
      before: current,
      after: repaired,
    }];
    return {
      kind: "flatten-record-redirects",
      actions,
      preview: preview(
        "Record redirect chain'ini flatten et",
        "Her eski record ID doğrulanmış unique terminal record hedefe bağlanacak.",
        repaired.records.map((entry) => {
          const before = current.records.find(
            (item) => item.fromRecordId === entry.fromRecordId,
          );
          return {
            domain: "record-redirect",
            entityId: entry.fromRecordId,
            field: "toRecordId",
            before: before?.toRecordId ?? "missing",
            after: entry.toRecordId,
          };
        }).filter((entry) => entry.before !== entry.after),
        actions,
      ),
    };
  }
  if (issue.code === "GROUP_MEMBER_DUPLICATE_SLOT") {
    const members = issue.affectedRecordIds
      .map((recordId) => state.mediaItems.find((item) => item.id === recordId))
      .filter((item): item is MediaItem => Boolean(item))
      .sort((left, right) => left.id.localeCompare(right.id, "en"));
    const keeper = members[0];
    if (
      !keeper?.seriesGroupId
      || typeof keeper.orderIndex !== "number"
      || members.some((item) =>
        item.seriesGroupId !== keeper.seriesGroupId
        || item.orderIndex !== keeper.orderIndex)
    ) return null;
    const actions: IntegrityRepairAction[] = members.slice(1).map((item) => ({
      kind: "clear-group-order",
      recordId: item.id,
      groupId: keeper.seriesGroupId!,
      beforeOrderIndex: keeper.orderIndex!,
    }));
    return {
      kind: "dedupe-group-order",
      actions,
      preview: preview(
        "Duplicate grup sırasını temizle",
        `${keeper.id} kaydının sıra değeri korunacak; diğer üyeler grupta kalacak.`,
        actions.map((action) => ({
          domain: "group",
          entityId: action.kind === "clear-group-order" ? action.recordId : "",
          field: "orderIndex",
          before: action.kind === "clear-group-order"
            ? String(action.beforeOrderIndex)
            : "",
          after: "unset",
        })),
        actions,
      ),
    };
  }
  if (issue.code === "RECOMMENDATION_LINK_REDIRECT_PENDING") {
    const redirects = new Map(
      state.redirects.records.map((entry) => [entry.fromRecordId, entry.toRecordId]),
    );
    const recordIds = new Set(state.mediaItems.map((item) => item.id));
    const actions: IntegrityRepairAction[] = state.recommendationLinks
      .filter((link) => issue.affectedRecordIds.includes(link.localMediaId))
      .map((link) => ({
        link,
        target: redirects.get(link.localMediaId),
      }))
      .filter((entry): entry is { link: RecommendationLocalLink; target: string } =>
        Boolean(entry.target && recordIds.has(entry.target)))
      .map(({ link, target }) => ({
        kind: "remap-recommendation-link",
        recommendationId: link.recommendationId,
        beforeRecordId: link.localMediaId,
        afterRecordId: target,
      }));
    if (actions.length === 0) return null;
    return {
      kind: "remap-recommendation-link",
      actions,
      preview: preview(
        "Recommendation bağlantısını remap et",
        "Yalnız local projection valid record redirect hedefiyle güncellenecek.",
        actions.map((action) => ({
          domain: "recommendation-link",
          entityId: action.kind === "remap-recommendation-link"
            ? action.recommendationId
            : "",
          field: "localMediaId",
          before: action.kind === "remap-recommendation-link"
            ? action.beforeRecordId
            : "",
          after: action.kind === "remap-recommendation-link"
            ? action.afterRecordId
            : "",
        })),
        actions,
      ),
    };
  }
  if (issue.code === "PROGRESS_LOG_REDIRECT_PENDING") {
    const redirects = new Map(
      state.redirects.records.map((entry) => [entry.fromRecordId, entry.toRecordId]),
    );
    const recordIds = new Set(state.mediaItems.map((item) => item.id));
    const actions: IntegrityRepairAction[] = state.progressLogs
      .filter((entry) => issue.affectedLogIds.includes(entry.id))
      .map((entry) => ({ entry, target: redirects.get(entry.mediaId) }))
      .filter((entry): entry is { entry: ProgressLog; target: string } =>
        Boolean(entry.target && recordIds.has(entry.target)))
      .map(({ entry, target }) => ({
        kind: "remap-progress-log",
        logId: entry.id,
        beforeRecordId: entry.mediaId,
        afterRecordId: target,
      }));
    if (actions.length === 0) return null;
    return {
      kind: "remap-progress-log",
      actions,
      preview: preview(
        "Progress log bağlantısını remap et",
        "Log ID, timestamp ve payload korunarak yalnız mediaId redirect hedefiyle değişecek.",
        actions.map((action) => ({
          domain: "progress-log",
          entityId: action.kind === "remap-progress-log" ? action.logId : "",
          field: "mediaId",
          before: action.kind === "remap-progress-log" ? action.beforeRecordId : "",
          after: action.kind === "remap-progress-log" ? action.afterRecordId : "",
        })),
        actions,
      ),
    };
  }
  if (issue.code === "IDENTITY_KEY_MISMATCH") {
    const recordId = issue.affectedRecordIds[0];
    const item = state.mediaItems.find((entry) => entry.id === recordId);
    if (!item?.identity) return null;
    const codecIssue = state.input.mediaEnvelope?.issues.find((entry) =>
      entry.code === "IDENTITY_KEY_MISMATCH"
      && entry.recordId === item.id
      && typeof entry.previousValue === "string"
      && typeof entry.nextValue === "string");
    if (!codecIssue || typeof codecIssue.previousValue !== "string") {
      return null;
    }
    const beforeIdentity = { ...item.identity, key: codecIssue.previousValue };
    const decoded = decodeCanonicalMediaIdentity(beforeIdentity, item.id);
    if (
      decoded.status !== "repairable"
      || decoded.issue.code !== "IDENTITY_KEY_MISMATCH"
      || decoded.value.key !== item.identity.key
    ) return null;
    const actions: IntegrityRepairAction[] = [{
      kind: "repair-identity-key",
      recordId: item.id,
      beforeIdentity,
      afterIdentity: item.identity,
    }];
    return {
      kind: "repair-identity-key",
      actions,
      preview: preview(
        "Canonical identity key'ini düzelt",
        "Source, namespace ve stable ID korunarak yalnız deterministik key yeniden üretilecek.",
        [{
          domain: "identity",
          entityId: item.id,
          field: "identity.key",
          before: beforeIdentity.key,
          after: item.identity.key,
        }],
        actions,
      ),
    };
  }
  if (issue.code === "MERGE_JOURNAL_IN_PROGRESS") {
    if (state.mergeJournal.status !== "valid") return null;
    const actions: IntegrityRepairAction[] = [{
      kind: "recover-merge-journal",
      mergeOperationId: state.mergeJournal.data.operationId,
    }];
    return {
      kind: "recover-merge-journal",
      actions,
      preview: preview(
        "Yarım merge journal'ını geri al",
        "Mevcut merge coordinator before snapshot'ı doğrulayıp güvenli rollback uygulayacak.",
        [{
          domain: "merge-journal",
          entityId: state.mergeJournal.data.operationId,
          field: "state",
          before: state.mergeJournal.data.state,
          after: "rolled-back",
        }],
        actions,
      ),
    };
  }
  return null;
}

export function prepareIntegrityRepair(
  scope: LocalOwnerScope,
  issueId: string,
  sourceFingerprint: string,
  storage: IntegrityRepairStorage | null = browserStorage(),
): IntegrityRepairPreparationResult {
  if (!isLocalOwnerScope(scope) || !storage) {
    return { ok: false, code: "storage_unavailable", message: "Owner/storage bulunamadı." };
  }
  const captured = captureIntegrityState(scope, storage);
  if (!captured.ok) {
    return { ok: false, code: "storage_unavailable", message: captured.message };
  }
  if (captured.state.report.sourceFingerprint !== sourceFingerprint) {
    return {
      ok: false,
      code: "issue_stale",
      message: "Tarama sonrası local veri değişti; yeniden tara.",
    };
  }
  const issue = captured.state.report.issues.find((entry) => entry.id === issueId);
  if (!issue) {
    return { ok: false, code: "issue_stale", message: "Issue artık güncel değil." };
  }
  if (issue.repairability !== "safe") {
    return {
      ok: false,
      code: "manual_only",
      message: "Bu issue deterministik safe repair kapsamı dışında.",
    };
  }
  const repair = issueAction(issue, captured.state);
  if (!repair || repair.actions.length === 0) {
    return {
      ok: false,
      code: "unsafe_repair",
      message: "Unique ve doğrulanabilir repair hedefi üretilemedi.",
    };
  }
  let operationId: string;
  try {
    operationId = randomOperationId();
  } catch {
    return {
      ok: false,
      code: "unsafe_repair",
      message: "Güvenli repair operation ID üretilemedi.",
    };
  }
  return {
    ok: true,
    plan: {
      version: INTEGRITY_REPAIR_PLAN_VERSION,
      operationId,
      ownerScope: scope.key,
      issueId: issue.id,
      issueCode: issue.code,
      kind: repair.kind,
      sourceFingerprint,
      actions: repair.actions,
      preview: repair.preview,
      createdAt: new Date().toISOString(),
    },
  };
}

function applyActions(
  source: CapturedIntegrityState,
  actions: readonly IntegrityRepairAction[],
  direction: "forward" | "reverse",
): CapturedIntegrityState | null {
  const next: CapturedIntegrityState = {
    ...source,
    mediaItems: source.mediaItems.map((item) => ({ ...item })),
    progressLogs: source.progressLogs.map((entry) => ({ ...entry })),
    aliases: source.aliases,
    redirects: source.redirects,
    duplicateReviews: {
      ...source.duplicateReviews,
      decisions: [...source.duplicateReviews.decisions],
    },
    recommendationLinks: source.recommendationLinks.map((link) => ({ ...link })),
  };
  for (const action of actions) {
    if (action.kind === "remove-duplicate-review") {
      const exists = next.duplicateReviews.decisions.some((entry) =>
        entry.candidateFingerprint === action.decision.candidateFingerprint);
      if (direction === "forward") {
        if (!exists) continue;
        next.duplicateReviews.decisions = next.duplicateReviews.decisions.filter(
          (entry) => entry.candidateFingerprint !== action.decision.candidateFingerprint,
        );
      } else if (!exists) {
        next.duplicateReviews.decisions.push(action.decision);
        next.duplicateReviews.decisions.sort((left, right) =>
          left.candidateFingerprint.localeCompare(right.candidateFingerprint, "en"));
      }
      continue;
    }
    if (action.kind === "flatten-identity-aliases") {
      const expected = direction === "forward" ? action.before : action.after;
      const target = direction === "forward" ? action.after : action.before;
      if (!sameValue(next.aliases, expected) && !sameValue(next.aliases, target)) return null;
      next.aliases = target;
      continue;
    }
    if (action.kind === "flatten-record-redirects") {
      const expected = direction === "forward" ? action.before : action.after;
      const target = direction === "forward" ? action.after : action.before;
      if (!sameValue(next.redirects, expected) && !sameValue(next.redirects, target)) return null;
      next.redirects = target;
      continue;
    }
    if (action.kind === "clear-group-order") {
      const index = next.mediaItems.findIndex((item) => item.id === action.recordId);
      if (index < 0 || next.mediaItems[index].seriesGroupId !== action.groupId) return null;
      const current = next.mediaItems[index].orderIndex;
      if (direction === "forward") {
        if (current !== action.beforeOrderIndex && current !== undefined) return null;
        const updated = { ...next.mediaItems[index] };
        delete updated.orderIndex;
        next.mediaItems[index] = updated;
      } else {
        if (current !== undefined && current !== action.beforeOrderIndex) return null;
        next.mediaItems[index] = {
          ...next.mediaItems[index],
          orderIndex: action.beforeOrderIndex,
        };
      }
      continue;
    }
    if (action.kind === "remap-recommendation-link") {
      const index = next.recommendationLinks.findIndex(
        (link) => link.recommendationId === action.recommendationId,
      );
      if (index < 0) return null;
      const expected = direction === "forward"
        ? action.beforeRecordId
        : action.afterRecordId;
      const target = direction === "forward"
        ? action.afterRecordId
        : action.beforeRecordId;
      const current = next.recommendationLinks[index].localMediaId;
      if (current !== expected && current !== target) return null;
      next.recommendationLinks[index] = {
        ...next.recommendationLinks[index],
        localMediaId: target,
      };
      continue;
    }
    if (action.kind === "remap-progress-log") {
      const index = next.progressLogs.findIndex((entry) => entry.id === action.logId);
      if (index < 0) return null;
      const expected = direction === "forward"
        ? action.beforeRecordId
        : action.afterRecordId;
      const target = direction === "forward"
        ? action.afterRecordId
        : action.beforeRecordId;
      const current = next.progressLogs[index].mediaId;
      if (current !== expected && current !== target) return null;
      next.progressLogs[index] = { ...next.progressLogs[index], mediaId: target };
      continue;
    }
    if (action.kind === "repair-identity-key") {
      const index = next.mediaItems.findIndex((item) => item.id === action.recordId);
      if (index < 0) return null;
      const expected = direction === "forward"
        ? action.beforeIdentity
        : action.afterIdentity;
      const target = direction === "forward"
        ? action.afterIdentity
        : action.beforeIdentity;
      const current = next.mediaItems[index].identity;
      if (!sameValue(current, expected) && !sameValue(current, target)) return null;
      next.mediaItems[index] = { ...next.mediaItems[index], identity: target };
    }
  }
  return next;
}

function touched(actions: readonly IntegrityRepairAction[], kind: string): boolean {
  return actions.some((action) => action.kind === kind);
}

function persistActions(
  scope: LocalOwnerScope,
  target: CapturedIntegrityState,
  actions: readonly IntegrityRepairAction[],
  direction: "forward" | "reverse",
  storage: IntegrityRepairStorage,
): { ok: true } | { ok: false; message: string } {
  if (
    touched(actions, "clear-group-order")
    || touched(actions, "remap-progress-log")
    || touched(actions, "repair-identity-key")
  ) {
    const write = direction === "reverse"
      ? saveScopedLibrarySnapshotForIntegrityRollback(
          scope,
          target.mediaItems,
          target.progressLogs,
          target.datasetOrigin,
          storage,
        )
      : saveScopedLibrarySnapshotForIntegrityRepair(
          scope,
          target.mediaItems,
          target.progressLogs,
          target.datasetOrigin,
          storage,
        );
    if (!write.ok) return { ok: false, message: write.message };
  }
  if (touched(actions, "flatten-identity-aliases")) {
    const write = direction === "forward"
      ? writeRepairedPersonalData(
          scope,
          "mediaIdentityAliases",
          target.aliases,
          mediaIdentityAliasRegistryCodec,
          mediaIdentityAliasRecoveryCodec,
          storage,
        )
      : writePersonalData(
          scope,
          "mediaIdentityAliases",
          target.aliases,
          mediaIdentityAliasRecoveryCodec,
          storage,
        );
    if (!write.ok) return { ok: false, message: write.message };
  }
  if (touched(actions, "flatten-record-redirects")) {
    const write = direction === "forward"
      ? writeRepairedPersonalData(
          scope,
          "mediaRecordRedirects",
          target.redirects,
          mediaRecordRedirectRegistryCodec,
          mediaRecordRedirectRecoveryCodec,
          storage,
        )
      : writePersonalData(
          scope,
          "mediaRecordRedirects",
          target.redirects,
          mediaRecordRedirectRecoveryCodec,
          storage,
        );
    if (!write.ok) return { ok: false, message: write.message };
  }
  if (touched(actions, "remove-duplicate-review")) {
    const write = writeDuplicateReviewRegistry(scope, target.duplicateReviews, storage);
    if (!write.ok) return { ok: false, message: write.message };
  }
  if (touched(actions, "remap-recommendation-link")) {
    if (!replaceRecommendationLinksForScope(scope, target.recommendationLinks, storage)) {
      return { ok: false, message: "Recommendation link read-back doğrulaması başarısız." };
    }
  }
  return { ok: true };
}

function repairActionValid(value: unknown): value is IntegrityRepairAction {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "remove-duplicate-review") {
    return duplicateReviewRegistryCodec({
      version: 1,
      decisions: [value.decision],
    }).ok;
  }
  if (value.kind === "flatten-identity-aliases") {
    const before = mediaIdentityAliasRecoveryCodec(value.before);
    const after = mediaIdentityAliasRegistryCodec(value.after);
    return before.ok && after.ok;
  }
  if (value.kind === "flatten-record-redirects") {
    const before = mediaRecordRedirectRecoveryCodec(value.before);
    const after = mediaRecordRedirectRegistryCodec(value.after);
    return before.ok && after.ok;
  }
  if (value.kind === "clear-group-order") {
    return typeof value.recordId === "string"
      && typeof value.groupId === "string"
      && typeof value.beforeOrderIndex === "number"
      && Number.isFinite(value.beforeOrderIndex);
  }
  if (
    value.kind === "remap-recommendation-link"
    || value.kind === "remap-progress-log"
  ) {
    const entityField = value.kind === "remap-recommendation-link"
      ? "recommendationId"
      : "logId";
    return typeof value[entityField] === "string"
      && typeof value.beforeRecordId === "string"
      && typeof value.afterRecordId === "string";
  }
  if (value.kind === "repair-identity-key") {
    const before = decodeCanonicalMediaIdentity(value.beforeIdentity, value.recordId as string);
    const after = decodeCanonicalMediaIdentity(value.afterIdentity, value.recordId as string);
    return typeof value.recordId === "string"
      && before.status === "repairable"
      && before.issue.code === "IDENTITY_KEY_MISMATCH"
      && after.status === "valid";
  }
  return value.kind === "recover-merge-journal"
    && typeof value.mergeOperationId === "string";
}

function planValid(value: unknown): value is IntegrityRepairPlan {
  if (!isRecord(value) || !Array.isArray(value.actions) || !isRecord(value.preview)) {
    return false;
  }
  return value.version === 1
    && typeof value.operationId === "string"
    && typeof value.ownerScope === "string"
    && typeof value.issueId === "string"
    && typeof value.issueCode === "string"
    && typeof value.kind === "string"
    && typeof value.sourceFingerprint === "string"
    && typeof value.createdAt === "string"
    && Number.isFinite(Date.parse(value.createdAt))
    && value.actions.length > 0
    && value.actions.every(repairActionValid)
    && typeof value.preview.title === "string"
    && typeof value.preview.description === "string"
    && Array.isArray(value.preview.changes);
}

const JOURNAL_STATES = new Set<IntegrityRepairJournalState>([
  "prepared",
  "applying",
  "completed",
  "rolling-back",
  "rolled-back",
  "recovery-required",
]);

export const integrityRepairJournalCodec: PersonalDataCodec<IntegrityRepairJournal> = (
  value,
) => {
  if (
    !isRecord(value)
    || value.version !== 1
    || typeof value.operationId !== "string"
    || typeof value.ownerScope !== "string"
    || typeof value.state !== "string"
    || !JOURNAL_STATES.has(value.state as IntegrityRepairJournalState)
    || !planValid(value.plan)
    || value.operationId !== value.plan.operationId
    || value.ownerScope !== value.plan.ownerScope
    || typeof value.sourceFingerprint !== "string"
    || value.sourceFingerprint !== value.plan.sourceFingerprint
    || !Array.isArray(value.appliedStages)
    || value.appliedStages.some((entry) => typeof entry !== "string")
    || typeof value.createdAt !== "string"
    || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.updatedAt !== "string"
    || !Number.isFinite(Date.parse(value.updatedAt))
    || (value.resultFingerprint !== undefined
      && typeof value.resultFingerprint !== "string")
    || (value.error !== undefined && typeof value.error !== "string")
  ) {
    return {
      ok: false,
      code: "integrity_repair_journal_invalid",
      message: "Integrity repair journal formatı geçersiz.",
    };
  }
  return { ok: true, value: value as unknown as IntegrityRepairJournal };
};

export function readIntegrityRepairJournal(
  scope: LocalOwnerScope,
  storage: PersonalStorageLike | null = browserStorage(),
): PersonalDataReadResult<IntegrityRepairJournal> {
  return readPersonalData(
    scope,
    "integrityRepairJournal",
    integrityRepairJournalCodec,
    storage,
  );
}

export function writeIntegrityRepairJournal(
  scope: LocalOwnerScope,
  journal: IntegrityRepairJournal,
  storage: PersonalStorageLike | null = browserStorage(),
) {
  return writePersonalData(
    scope,
    "integrityRepairJournal",
    journal,
    integrityRepairJournalCodec,
    storage,
  );
}

function journalState(
  journal: IntegrityRepairJournal,
  state: IntegrityRepairJournalState,
  additions: Partial<IntegrityRepairJournal> = {},
): IntegrityRepairJournal {
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

function currentFingerprint(state: CapturedIntegrityState): string {
  return state.report.sourceFingerprint
    || buildLocalDataGraphFingerprint(state.input);
}

export function executeIntegrityRepair(
  scope: LocalOwnerScope,
  plan: IntegrityRepairPlan,
  storage: IntegrityRepairStorage | null = browserStorage(),
): IntegrityRepairExecutionResult {
  if (!storage || !isLocalOwnerScope(scope)) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Repair için owner/storage bulunamadı.",
      recoveryRequired: false,
    };
  }
  if (plan.ownerScope !== scope.key) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Repair plan aktif owner'a ait değil.",
      recoveryRequired: false,
    };
  }
  const existing = readIntegrityRepairJournal(scope, storage);
  if (
    existing.status === "valid"
    && existing.data.operationId === plan.operationId
    && existing.data.state === "completed"
  ) {
    return {
      ok: true,
      state: "completed",
      journal: existing.data,
      idempotent: true,
    };
  }
  if (
    existing.status === "valid"
    && existing.data.state === "recovery-required"
  ) {
    return {
      ok: false,
      code: "recovery_required",
      message: "Önceki integrity repair journal recovery gerektiriyor.",
      recoveryRequired: true,
    };
  }
  if (existing.status !== "missing" && existing.status !== "valid") {
    return {
      ok: false,
      code: "recovery_required",
      message: "Integrity repair journal güvenli biçimde okunamadı.",
      recoveryRequired: true,
    };
  }

  const captured = captureIntegrityState(scope, storage);
  if (!captured.ok) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: captured.message,
      recoveryRequired: false,
    };
  }
  if (captured.state.report.sourceFingerprint !== plan.sourceFingerprint) {
    return {
      ok: false,
      code: "issue_stale",
      message: "Preview sonrası local veri değişti; repair uygulanmadı.",
      recoveryRequired: false,
    };
  }
  const issue = captured.state.report.issues.find((entry) => entry.id === plan.issueId);
  if (!issue || issue.code !== plan.issueCode || issue.repairability !== "safe") {
    return {
      ok: false,
      code: "issue_stale",
      message: "Issue veya repairability artık güncel değil.",
      recoveryRequired: false,
    };
  }
  const rebuilt = issueAction(issue, captured.state);
  if (
    !rebuilt
    || rebuilt.kind !== plan.kind
    || !sameValue(rebuilt.actions, plan.actions)
    || !sameValue(rebuilt.preview, plan.preview)
  ) {
    return {
      ok: false,
      code: "issue_stale",
      message: "Repair preview güncel kaynakla yeniden üretilemedi.",
      recoveryRequired: false,
    };
  }

  let journal: IntegrityRepairJournal = {
    version: INTEGRITY_REPAIR_JOURNAL_VERSION,
    operationId: plan.operationId,
    ownerScope: scope.key,
    state: "prepared",
    plan,
    sourceFingerprint: plan.sourceFingerprint,
    appliedStages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const prepared = writeIntegrityRepairJournal(scope, journal, storage);
  if (!prepared.ok) {
    return {
      ok: false,
      code: "write_failed",
      message: prepared.message,
      recoveryRequired: false,
    };
  }
  journal = journalState(journal, "applying", { appliedStages: ["journal"] });
  if (!writeIntegrityRepairJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "write_failed",
      message: "Applying journal yazılamadı; domain verisi değiştirilmedi.",
      recoveryRequired: false,
    };
  }

  if (plan.kind === "recover-merge-journal") {
    const action = plan.actions[0];
    if (
      action.kind !== "recover-merge-journal"
      || captured.state.mergeJournal.status !== "valid"
      || captured.state.mergeJournal.data.operationId !== action.mergeOperationId
    ) {
      return {
        ok: false,
        code: "issue_stale",
        message: "Merge journal operation değişti.",
        recoveryRequired: false,
      };
    }
    const recovery = recoverPendingDuplicateMerge(
      scope,
      storage as DuplicateMergeStorage,
    );
    if (recovery && !recovery.ok) {
      journal = journalState(journal, "recovery-required", {
        error: recovery.message,
        appliedStages: ["journal", "merge-recovery"],
      });
      writeIntegrityRepairJournal(scope, journal, storage);
      return {
        ok: false,
        code: "rollback_failed",
        message: recovery.message,
        recoveryRequired: true,
      };
    }
    const afterRecovery = captureIntegrityState(scope, storage);
    if (!afterRecovery.ok) {
      return {
        ok: false,
        code: "recovery_required",
        message: afterRecovery.message,
        recoveryRequired: true,
      };
    }
    journal = journalState(journal, "completed", {
      resultFingerprint: currentFingerprint(afterRecovery.state),
      appliedStages: ["journal", "merge-recovery", "read-back"],
    });
    if (!writeIntegrityRepairJournal(scope, journal, storage).ok) {
      return {
        ok: false,
        code: "recovery_required",
        message: "Merge recovery tamamlandı fakat repair receipt yazılamadı.",
        recoveryRequired: true,
      };
    }
    notifyLibraryChanged();
    return { ok: true, state: "completed", journal };
  }

  const after = applyActions(captured.state, plan.actions, "forward");
  if (!after) {
    return {
      ok: false,
      code: "issue_stale",
      message: "Repair action güncel state'e güvenle uygulanamadı.",
      recoveryRequired: false,
    };
  }
  const applied = persistActions(scope, after, plan.actions, "forward", storage);
  if (!applied.ok) {
    const rollback = persistActions(
      scope,
      captured.state,
      plan.actions,
      "reverse",
      storage,
    );
    journal = journalState(
      journal,
      rollback.ok ? "rolled-back" : "recovery-required",
      {
        error: applied.message,
        appliedStages: ["journal", "domain-write"],
      },
    );
    const journalWrite = writeIntegrityRepairJournal(scope, journal, storage);
    const recoveryRequired = !rollback.ok || !journalWrite.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? `${applied.message} Rollback doğrulanamadı; recovery gerekiyor.`
        : `${applied.message} Before state geri yüklendi.`,
      recoveryRequired,
    };
  }
  const verified = captureIntegrityState(scope, storage);
  if (
    !verified.ok
    || verified.state.report.issues.some((entry) => entry.id === plan.issueId)
  ) {
    const rollback = persistActions(
      scope,
      captured.state,
      plan.actions,
      "reverse",
      storage,
    );
    journal = journalState(
      journal,
      rollback.ok ? "rolled-back" : "recovery-required",
      {
        error: "Repair read-back doğrulaması veya rescan başarısız.",
        appliedStages: ["journal", "domain-write", "read-back"],
      },
    );
    const journalWrite = writeIntegrityRepairJournal(scope, journal, storage);
    const recoveryRequired = !rollback.ok || !journalWrite.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? "Repair doğrulanamadı ve rollback recovery gerektiriyor."
        : "Repair doğrulanamadı; before state geri yüklendi.",
      recoveryRequired,
    };
  }
  journal = journalState(journal, "completed", {
    resultFingerprint: currentFingerprint(verified.state),
    appliedStages: ["journal", "domain-write", "read-back", "rescan"],
  });
  if (!writeIntegrityRepairJournal(scope, journal, storage).ok) {
    const rollback = persistActions(
      scope,
      captured.state,
      plan.actions,
      "reverse",
      storage,
    );
    const recoveryJournal = journalState(
      journal,
      rollback.ok ? "rolled-back" : "recovery-required",
      { error: "Repair receipt yazılamadı." },
    );
    const journalWrite = writeIntegrityRepairJournal(scope, recoveryJournal, storage);
    const recoveryRequired = !rollback.ok || !journalWrite.ok;
    return {
      ok: false,
      code: recoveryRequired ? "rollback_failed" : "write_failed",
      message: recoveryRequired
        ? "Receipt yazımı ve rollback recovery gerektiriyor."
        : "Receipt yazılamadı; before state geri yüklendi.",
      recoveryRequired,
    };
  }
  notifyLibraryChanged();
  return { ok: true, state: "completed", journal };
}

export function undoLastIntegrityRepair(
  scope: LocalOwnerScope,
  storage: IntegrityRepairStorage | null = browserStorage(),
): IntegrityRepairExecutionResult {
  if (!storage) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Undo için storage kullanılamıyor.",
      recoveryRequired: false,
    };
  }
  const read = readIntegrityRepairJournal(scope, storage);
  if (read.status !== "valid") {
    return {
      ok: false,
      code: "recovery_required",
      message: "Undo edilebilir integrity repair journal bulunamadı.",
      recoveryRequired: read.status !== "missing",
    };
  }
  let journal = read.data;
  if (journal.ownerScope !== scope.key) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "Repair journal aktif owner'a ait değil.",
      recoveryRequired: false,
    };
  }
  if (journal.state === "rolled-back") {
    return { ok: true, state: "rolled-back", journal, idempotent: true };
  }
  if (
    journal.state !== "completed"
    || !journal.resultFingerprint
    || journal.plan.kind === "recover-merge-journal"
  ) {
    return {
      ok: false,
      code: "manual_only",
      message: "Bu repair tamamlanmış ve güvenli undo destekleyen bir işlem değil.",
      recoveryRequired: journal.state === "recovery-required",
    };
  }
  const current = captureIntegrityState(scope, storage);
  if (!current.ok) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: current.message,
      recoveryRequired: false,
    };
  }
  if (current.state.report.sourceFingerprint !== journal.resultFingerprint) {
    return {
      ok: false,
      code: "issue_stale",
      message: "Repair sonrası ilgili local state değişti; undo bloke edildi.",
      recoveryRequired: false,
    };
  }
  const before = applyActions(current.state, journal.plan.actions, "reverse");
  if (!before) {
    return {
      ok: false,
      code: "issue_stale",
      message: "Undo patch'i current state ile eşleşmiyor.",
      recoveryRequired: false,
    };
  }
  journal = journalState(journal, "rolling-back");
  if (!writeIntegrityRepairJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "write_failed",
      message: "Undo journal yazılamadı; domain verisi değiştirilmedi.",
      recoveryRequired: false,
    };
  }
  const restored = persistActions(
    scope,
    before,
    journal.plan.actions,
    "reverse",
    storage,
  );
  if (!restored.ok) {
    const repairRestored = persistActions(
      scope,
      current.state,
      journal.plan.actions,
      "forward",
      storage,
    );
    journal = journalState(
      journal,
      repairRestored.ok ? "completed" : "recovery-required",
      { error: restored.message },
    );
    writeIntegrityRepairJournal(scope, journal, storage);
    return {
      ok: false,
      code: repairRestored.ok ? "write_failed" : "rollback_failed",
      message: repairRestored.ok
        ? "Undo başarısız; repair sonucu geri yüklendi."
        : "Undo ve rollback başarısız; recovery gerekiyor.",
      recoveryRequired: !repairRestored.ok,
    };
  }
  const verified = captureIntegrityState(scope, storage);
  if (
    !verified.ok
    || verified.state.report.sourceFingerprint !== journal.sourceFingerprint
  ) {
    const repairRestored = persistActions(
      scope,
      current.state,
      journal.plan.actions,
      "forward",
      storage,
    );
    journal = journalState(
      journal,
      repairRestored.ok ? "completed" : "recovery-required",
      { error: "Undo read-back fingerprint eşleşmedi." },
    );
    writeIntegrityRepairJournal(scope, journal, storage);
    return {
      ok: false,
      code: repairRestored.ok ? "write_failed" : "rollback_failed",
      message: repairRestored.ok
        ? "Undo doğrulanamadı; repair sonucu geri yüklendi."
        : "Undo doğrulanamadı ve rollback recovery gerektiriyor.",
      recoveryRequired: !repairRestored.ok,
    };
  }
  journal = journalState(journal, "rolled-back", {
    resultFingerprint: verified.state.report.sourceFingerprint,
    appliedStages: [...journal.appliedStages, "undo", "undo-read-back"],
  });
  if (!writeIntegrityRepairJournal(scope, journal, storage).ok) {
    return {
      ok: false,
      code: "recovery_required",
      message: "Undo uygulandı fakat journal receipt yazılamadı.",
      recoveryRequired: true,
    };
  }
  notifyLibraryChanged();
  return { ok: true, state: "rolled-back", journal };
}

export function recoverPendingIntegrityRepair(
  scope: LocalOwnerScope,
  storage: IntegrityRepairStorage | null = browserStorage(),
): IntegrityRepairExecutionResult | null {
  if (!storage) return null;
  const read = readIntegrityRepairJournal(scope, storage);
  if (read.status === "missing") return null;
  if (read.status !== "valid") {
    return {
      ok: false,
      code: "recovery_required",
      message: "Integrity repair journal corrupt veya foreign-owner durumda.",
      recoveryRequired: true,
    };
  }
  let journal = read.data;
  if (["completed", "rolled-back"].includes(journal.state)) return null;
  if (journal.plan.kind === "recover-merge-journal") {
    return {
      ok: false,
      code: "recovery_required",
      message: "Merge recovery journal manuel inceleme gerektiriyor.",
      recoveryRequired: true,
    };
  }
  const current = captureIntegrityState(scope, storage);
  if (!current.ok) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: current.message,
      recoveryRequired: true,
    };
  }
  const before = applyActions(current.state, journal.plan.actions, "reverse");
  if (!before) {
    journal = journalState(journal, "recovery-required", {
      error: "Startup rollback patch'i current state ile eşleşmedi.",
    });
    writeIntegrityRepairJournal(scope, journal, storage);
    return {
      ok: false,
      code: "rollback_failed",
      message: journal.error!,
      recoveryRequired: true,
    };
  }
  const restored = persistActions(
    scope,
    before,
    journal.plan.actions,
    "reverse",
    storage,
  );
  journal = journalState(
    journal,
    restored.ok ? "rolled-back" : "recovery-required",
    { error: restored.ok ? journal.error : restored.message },
  );
  const journalWrite = writeIntegrityRepairJournal(scope, journal, storage);
  if (!restored.ok || !journalWrite.ok) {
    return {
      ok: false,
      code: "rollback_failed",
      message: "Startup integrity rollback doğrulanamadı.",
      recoveryRequired: true,
    };
  }
  notifyLibraryChanged();
  return { ok: true, state: "rolled-back", journal };
}

export function integrityRepairSourceFingerprint(
  input: LocalDataIntegrityInput,
): string {
  return buildLocalDataGraphFingerprint(input);
}
