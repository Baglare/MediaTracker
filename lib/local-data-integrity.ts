import {
  decodeCanonicalMediaIdentity,
  findExactIdentityCollisions,
  getCanonicalMediaKeyV2,
} from "./media-identity";
import type { MediaIdentityAliasRegistry } from "./media-identity-aliases";
import type { MediaRecordRedirectRegistry } from "./media-record-redirects";
import type { DuplicateReviewRegistry } from "./duplicate-review-registry";
import { scanDuplicateCandidates } from "./duplicate-scanner";
import type { DuplicateMergeJournal } from "./duplicate-merge";
import type {
  LocalDataDomain,
  StorageReadResult,
} from "./local-data-storage";
import type {
  PersonalDataReadResult,
} from "./personal-data-storage";
import type { LocalOwnerScope } from "./local-owner-scope";
import type { RecommendationLinkInspectionResult } from "./social/local-social";
import type { SyncQueueInspectionResult } from "./sync-queue";
import type { MediaItem, ProgressLog } from "./types";

export const LOCAL_DATA_INTEGRITY_SCAN_VERSION = 1 as const;

export type IntegritySeverity = "info" | "warning" | "error" | "critical";
export type IntegrityRepairability = "safe" | "requires-confirmation" | "manual-only";
export type IntegrityDomain =
  | "media"
  | "identity"
  | "identity-alias"
  | "record-redirect"
  | "progress-log"
  | "group"
  | "recommendation-link"
  | "duplicate-review"
  | "merge-journal"
  | "cloud-queue"
  | "envelope";

export interface LocalDataIntegrityIssue {
  id: string;
  code: string;
  domain: IntegrityDomain;
  severity: IntegritySeverity;
  affectedRecordIds: string[];
  affectedLogIds: string[];
  evidence: {
    summary: string;
    values?: string[];
  };
  repairability: IntegrityRepairability;
  recommendation: string;
}

export interface LocalDataIntegrityReport {
  version: 1;
  ownerKind: LocalOwnerScope["kind"];
  scannedAt: string;
  sourceFingerprint: string;
  scannedMediaCount: number;
  scannedLogCount: number;
  issues: LocalDataIntegrityIssue[];
  counts: {
    severity: Record<IntegritySeverity, number>;
    domain: Partial<Record<IntegrityDomain, number>>;
  };
}

export interface LocalDataIntegrityInput {
  scope: LocalOwnerScope;
  mediaItems: readonly MediaItem[];
  progressLogs: readonly ProgressLog[];
  mediaEnvelope?: StorageReadResult<MediaItem[]>;
  progressEnvelope?: StorageReadResult<ProgressLog[]>;
  aliases?: PersonalDataReadResult<MediaIdentityAliasRegistry>;
  redirects?: PersonalDataReadResult<MediaRecordRedirectRegistry>;
  duplicateReviews?: PersonalDataReadResult<DuplicateReviewRegistry>;
  mergeJournal?: PersonalDataReadResult<DuplicateMergeJournal>;
  recommendationLinks?: RecommendationLinkInspectionResult;
  syncQueue?: SyncQueueInspectionResult;
  now?: string;
}

interface IssueSeed {
  code: string;
  domain: IntegrityDomain;
  severity: IntegritySeverity;
  recordIds?: readonly string[];
  logIds?: readonly string[];
  summary: string;
  values?: readonly string[];
  repairability: IntegrityRepairability;
  recommendation: string;
}

const SEVERITY_ORDER: Record<IntegritySeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function uniqueSorted(values: readonly string[] = []): string[] {
  return [...new Set(values.filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function createIssue(seed: IssueSeed): LocalDataIntegrityIssue {
  const affectedRecordIds = uniqueSorted(seed.recordIds);
  const affectedLogIds = uniqueSorted(seed.logIds);
  const values = seed.values ? uniqueSorted(seed.values) : undefined;
  const fingerprint = stableHash(stableSerialize({
    code: seed.code,
    domain: seed.domain,
    affectedRecordIds,
    affectedLogIds,
    values,
  }));
  return {
    id: `integrity:v1:${seed.domain}:${seed.code}:${fingerprint}`,
    code: seed.code,
    domain: seed.domain,
    severity: seed.severity,
    affectedRecordIds,
    affectedLogIds,
    evidence: {
      summary: seed.summary,
      ...(values && values.length > 0 ? { values } : {}),
    },
    repairability: seed.repairability,
    recommendation: seed.recommendation,
  };
}

function addIssue(
  issues: Map<string, LocalDataIntegrityIssue>,
  seed: IssueSeed,
): void {
  const issue = createIssue(seed);
  if (!issues.has(issue.id)) issues.set(issue.id, issue);
}

function envelopeIssue(
  issues: Map<string, LocalDataIntegrityIssue>,
  domain: LocalDataDomain,
  result: StorageReadResult<MediaItem[] | ProgressLog[]>,
): void {
  if (result.status === "missing" || result.status === "valid" || result.status === "empty") {
    if (
      (result.status === "valid" || result.status === "empty")
      && result.schemaVersion !== 3
    ) {
      addIssue(issues, {
        code: "ENVELOPE_VERSION_MISMATCH",
        domain: "envelope",
        severity: "error",
        summary: `${domain} envelope beklenen local schema sürümünde değil.`,
        values: [`schema:${result.schemaVersion ?? "unknown"}`],
        repairability: "manual-only",
        recommendation: "Migration/recovery akışını incele; scanner veri yazmaz.",
      });
    }
    for (const codecIssue of result.issues) {
      addIssue(issues, {
        code: `ENVELOPE_CODEC_${codecIssue.code.toUpperCase()}`,
        domain: "envelope",
        severity: "warning",
        recordIds: codecIssue.recordId ? [codecIssue.recordId] : [],
        summary: `${domain} runtime codec uyarısı bildirdi.`,
        values: [codecIssue.code],
        repairability: "requires-confirmation",
        recommendation: "İlgili kaydı Data Integrity repair aşamasında incele.",
      });
    }
    return;
  }
  const severity: IntegritySeverity = result.status === "storage_unavailable"
    ? "error"
    : "critical";
  addIssue(issues, {
    code: `ENVELOPE_${result.status.toUpperCase()}`,
    domain: "envelope",
    severity,
    summary: `${domain} envelope ${result.status} durumunda.`,
    values: result.issues.map((entry) => entry.code),
    repairability: "manual-only",
    recommendation: "Current/backup slotlarını değiştirmeden recovery kararı ver.",
  });
}

function personalSourceIssue<T>(
  issues: Map<string, LocalDataIntegrityIssue>,
  domain: IntegrityDomain,
  label: string,
  result: PersonalDataReadResult<T> | undefined,
): boolean {
  if (!result || result.status === "missing" || result.status === "valid") return false;
  const diagnostic = result.status === "corrupt" ? result.diagnosticCode : undefined;
  const code = diagnostic?.toUpperCase()
    ?? `${label.toUpperCase().replaceAll("-", "_")}_${result.status.toUpperCase()}`;
  addIssue(issues, {
    code,
    domain,
    severity: result.status === "storage_unavailable" ? "error" : "critical",
    summary: `${label} owner envelope veya runtime codec doğrulamasını geçemedi.`,
    values: diagnostic ? [diagnostic] : [result.status],
    repairability: "manual-only",
    recommendation: "Registry current/backup durumunu recovery ekranında incele.",
  });
  return true;
}

function scanMedia(
  issues: Map<string, LocalDataIntegrityIssue>,
  mediaItems: readonly MediaItem[],
): void {
  const byId = new Map<string, MediaItem[]>();
  for (const item of mediaItems) {
    if (typeof item.id !== "string" || item.id.trim().length === 0 || item.id.length > 220) {
      addIssue(issues, {
        code: "MEDIA_ID_INVALID",
        domain: "media",
        severity: "critical",
        summary: "Media record ID boş veya desteklenen sınırların dışında.",
        repairability: "manual-only",
        recommendation: "Record ilişkilerini koruyan kontrollü ID recovery uygula.",
      });
    } else {
      byId.set(item.id, [...(byId.get(item.id) ?? []), item]);
    }

    const decoded = decodeCanonicalMediaIdentity(item.identity, item.id);
    if (decoded.status === "invalid") {
      const unresolved = item.identityStatus === "unresolved"
        || decoded.issue.code === "IDENTITY_UNRESOLVED";
      addIssue(issues, {
        code: unresolved ? "IDENTITY_UNRESOLVED" : decoded.issue.code,
        domain: "identity",
        severity: unresolved ? "warning" : "error",
        recordIds: [item.id],
        summary: decoded.issue.evidence,
        values: item.identityIssueCodes ?? [decoded.issue.code],
        repairability: decoded.issue.repairable ? "requires-confirmation" : "manual-only",
        recommendation: "Kaydı görünür tut; identity repair kararı ayrıca verilmelidir.",
      });
    } else if (decoded.status === "repairable") {
      addIssue(issues, {
        code: decoded.issue.code,
        domain: "identity",
        severity: "warning",
        recordIds: [item.id],
        summary: decoded.issue.evidence,
        repairability: "safe",
        recommendation: "Persisted key canonical identity alanlarından yeniden üretilebilir.",
      });
    }

    const hasGroupMetadata = Boolean(
      item.seriesGroupTitle
      || item.seriesRelationType
      || item.seasonNumber !== undefined
      || item.orderIndex !== undefined,
    );
    if (hasGroupMetadata && !item.seriesGroupId) {
      addIssue(issues, {
        code: "GROUP_MEMBER_MISSING_GROUP_ID",
        domain: "group",
        severity: "error",
        recordIds: [item.id],
        summary: "Series metadata taşıyan kayıt group ID içermiyor.",
        repairability: "requires-confirmation",
        recommendation: "Group ilişkisini provider/manuel kanıtla yeniden doğrula.",
      });
    }
  }

  for (const [recordId, records] of byId) {
    if (records.length < 2) continue;
    addIssue(issues, {
      code: "MEDIA_ID_DUPLICATE",
      domain: "media",
      severity: "critical",
      recordIds: [recordId],
      summary: "Aynı local MediaItem.id birden fazla record tarafından kullanılıyor.",
      values: [`count:${records.length}`],
      repairability: "requires-confirmation",
      recommendation: "İlişkileri incelemeden record silme veya ID değiştirme.",
    });
  }

  const exactGroups = new Map<string, string[]>();
  for (const identityIssue of findExactIdentityCollisions(mediaItems)) {
    if (!identityIssue.currentIdentity || !identityIssue.recordId) continue;
    exactGroups.set(identityIssue.currentIdentity, [
      ...(exactGroups.get(identityIssue.currentIdentity) ?? []),
      identityIssue.recordId,
    ]);
  }
  for (const [identityKey, recordIds] of exactGroups) {
    addIssue(issues, {
      code: "IDENTITY_EXACT_COLLISION",
      domain: "identity",
      severity: "warning",
      recordIds,
      summary: "Aynı Canonical Identity V2 birden fazla local record tarafından kullanılıyor.",
      values: [identityKey],
      repairability: "requires-confirmation",
      recommendation: "Duplicate review/merge akışında kullanıcı kararı al.",
    });
  }

  const groupSlots = new Map<string, string[]>();
  for (const item of mediaItems) {
    if (!item.seriesGroupId) continue;
    const slot = item.orderIndex ?? item.seasonNumber;
    if (typeof slot !== "number") continue;
    const key = `${item.seriesGroupId}:${slot}`;
    groupSlots.set(key, [...(groupSlots.get(key) ?? []), item.id]);
  }
  for (const [slot, recordIds] of groupSlots) {
    if (recordIds.length < 2) continue;
    addIssue(issues, {
      code: "GROUP_MEMBER_DUPLICATE_SLOT",
      domain: "group",
      severity: "warning",
      recordIds,
      summary: "Aynı series group sırası birden fazla üyeye atanmış.",
      values: [slot, `count:${recordIds.length}`],
      repairability: "requires-confirmation",
      recommendation: "Seri sırasını kullanıcı/provider kanıtıyla incele.",
    });
  }
}

function scanAliases(
  issues: Map<string, LocalDataIntegrityIssue>,
  source: PersonalDataReadResult<MediaIdentityAliasRegistry> | undefined,
  canonicalKeys: Set<string>,
): MediaIdentityAliasRegistry {
  if (!source || source.status !== "valid") return { version: 1, records: [], issues: [] };
  for (const registryIssue of source.data.issues) {
    if (registryIssue.code !== "IDENTITY_ALIAS_COLLISION") continue;
    addIssue(issues, {
      code: "ALIAS_COLLISION",
      domain: "identity-alias",
      severity: "critical",
      recordIds: registryIssue.recordId ? [registryIssue.recordId] : [],
      summary: "Identity alias birden fazla canonical hedefle çakışıyor.",
      repairability: "manual-only",
      recommendation: "Alias hedefi kullanıcı kararı olmadan overwrite edilmemelidir.",
    });
  }
  for (const alias of source.data.records) {
    if (canonicalKeys.has(alias.canonicalKey)) continue;
    addIssue(issues, {
      code: "ALIAS_ORPHAN_TARGET",
      domain: "identity-alias",
      severity: "error",
      summary: "Identity alias mevcut kütüphanede bulunmayan canonical hedefe gidiyor.",
      repairability: "requires-confirmation",
      recommendation: "Hedefin backup/redirect geçmişini incele.",
    });
  }
  return source.data;
}

function scanRedirects(
  issues: Map<string, LocalDataIntegrityIssue>,
  source: PersonalDataReadResult<MediaRecordRedirectRegistry> | undefined,
  recordIds: Set<string>,
): MediaRecordRedirectRegistry {
  if (!source || source.status !== "valid") return { version: 1, records: [] };
  for (const redirect of source.data.records) {
    if (!recordIds.has(redirect.toRecordId)) {
      addIssue(issues, {
        code: "REDIRECT_MISSING_TARGET",
        domain: "record-redirect",
        severity: "critical",
        recordIds: [redirect.fromRecordId, redirect.toRecordId],
        summary: "Record redirect mevcut olmayan survivor hedefe gidiyor.",
        repairability: "manual-only",
        recommendation: "Merge journal/backup ile hedef record'u doğrula.",
      });
    }
    if (recordIds.has(redirect.fromRecordId)) {
      addIssue(issues, {
        code: "REDIRECT_SOURCE_STILL_PRESENT",
        domain: "record-redirect",
        severity: "warning",
        recordIds: [redirect.fromRecordId, redirect.toRecordId],
        summary: "Redirect kaynağı kütüphanede hâlâ aktif record olarak bulunuyor.",
        repairability: "requires-confirmation",
        recommendation: "Record ve redirect sahipliğini merge receipt ile karşılaştır.",
      });
    }
  }
  return source.data;
}

function scanProgressLogs(
  issues: Map<string, LocalDataIntegrityIssue>,
  logs: readonly ProgressLog[],
  recordIds: Set<string>,
  redirects: MediaRecordRedirectRegistry,
): void {
  const byId = new Map<string, ProgressLog[]>();
  const redirectBySource = new Map(
    redirects.records.map((entry) => [entry.fromRecordId, entry]),
  );
  for (const log of logs) {
    byId.set(log.id, [...(byId.get(log.id) ?? []), log]);
    if (recordIds.has(log.mediaId)) continue;
    const redirect = redirectBySource.get(log.mediaId);
    addIssue(issues, {
      code: redirect && recordIds.has(redirect.toRecordId)
        ? "PROGRESS_LOG_REDIRECT_PENDING"
        : "PROGRESS_LOG_MEDIA_MISSING",
      domain: "progress-log",
      severity: redirect ? "warning" : "error",
      recordIds: [log.mediaId, ...(redirect ? [redirect.toRecordId] : [])],
      logIds: [log.id],
      summary: redirect
        ? "Progress log eski record ID kullanıyor fakat güvenli redirect hedefi var."
        : "Progress log mevcut olmayan media record'a bağlı.",
      repairability: redirect ? "safe" : "requires-confirmation",
      recommendation: redirect
        ? "D1D repair aşamasında mediaId redirect hedefiyle doğrulanabilir."
        : "Log'u silmeden önce media backup/redirect geçmişini incele.",
    });
  }
  for (const [logId, entries] of byId) {
    if (entries.length < 2) continue;
    const payloads = new Set(entries.map(stableSerialize));
    addIssue(issues, {
      code: payloads.size === 1
        ? "PROGRESS_LOG_ID_DUPLICATE"
        : "PROGRESS_LOG_ID_CONFLICT",
      domain: "progress-log",
      severity: payloads.size === 1 ? "warning" : "critical",
      recordIds: entries.map((entry) => entry.mediaId),
      logIds: [logId],
      summary: payloads.size === 1
        ? "Aynı progress log payload'ı birden fazla kez saklanmış."
        : "Aynı progress log ID farklı payload'lar taşıyor.",
      values: [`count:${entries.length}`],
      repairability: payloads.size === 1 ? "safe" : "manual-only",
      recommendation: payloads.size === 1
        ? "Tek mantıksal log D1D repair aşamasında korunabilir."
        : "Conflicting log payload'ları kullanıcı kararı olmadan değiştirme.",
    });
  }
}

function scanRecommendations(
  issues: Map<string, LocalDataIntegrityIssue>,
  source: RecommendationLinkInspectionResult | undefined,
  recordIds: Set<string>,
): void {
  if (!source) return;
  if (source.status === "corrupt" || source.status === "storage_unavailable") {
    addIssue(issues, {
      code: `RECOMMENDATION_LINK_${source.status.toUpperCase()}`,
      domain: "recommendation-link",
      severity: source.status === "corrupt" ? "error" : "warning",
      summary: "Recommendation local link cache okunamadı.",
      repairability: "manual-only",
      recommendation: "Cache'i otomatik değiştirmeden recovery durumunu incele.",
    });
    return;
  }
  for (const inspectionIssue of source.issues) {
    addIssue(issues, {
      code: inspectionIssue.code.toUpperCase(),
      domain: "recommendation-link",
      severity: inspectionIssue.code.endsWith("owner_mismatch") ? "critical" : "error",
      recordIds: inspectionIssue.localMediaId ? [inspectionIssue.localMediaId] : [],
      summary: inspectionIssue.code.endsWith("owner_mismatch")
        ? "Recommendation local link başka owner'a ait."
        : "Recommendation local link runtime formatı geçersiz.",
      repairability: "manual-only",
      recommendation: "Owner/cache kaydını otomatik adopt etme.",
    });
  }
  for (const link of source.links) {
    if (recordIds.has(link.localMediaId)) continue;
    addIssue(issues, {
      code: "RECOMMENDATION_LINK_MEDIA_MISSING",
      domain: "recommendation-link",
      severity: "warning",
      recordIds: [link.localMediaId],
      summary: "Recommendation local link mevcut olmayan media record'a bağlı.",
      repairability: "safe",
      recommendation: "Remote snapshot'ı değiştirmeden stale local projection temizlenebilir.",
    });
  }
}

function scanDuplicateReviews(
  issues: Map<string, LocalDataIntegrityIssue>,
  source: PersonalDataReadResult<DuplicateReviewRegistry> | undefined,
  mediaItems: readonly MediaItem[],
  aliases: MediaIdentityAliasRegistry,
  ownerScope: string,
): void {
  if (!source || source.status !== "valid") return;
  const candidates = scanDuplicateCandidates(mediaItems, aliases, { ownerScope }).candidates;
  const fingerprints = new Set(candidates.map((candidate) =>
    `${candidate.fingerprint}:${candidate.evidenceFingerprint}:${candidate.recordIds.join(",")}`));
  for (const decision of source.data.decisions) {
    const key = `${decision.candidateFingerprint}:${decision.evidenceFingerprint}:${decision.recordIds.join(",")}`;
    if (fingerprints.has(key)) continue;
    addIssue(issues, {
      code: "DUPLICATE_REVIEW_DECISION_STALE",
      domain: "duplicate-review",
      severity: "info",
      recordIds: decision.recordIds,
      summary: "Duplicate review kararı artık güncel candidate/evidence ile eşleşmiyor.",
      repairability: "safe",
      recommendation: "Stale karar gelecekteki repair aşamasında kaldırılabilir.",
    });
  }
}

function scanMergeJournal(
  issues: Map<string, LocalDataIntegrityIssue>,
  source: PersonalDataReadResult<DuplicateMergeJournal> | undefined,
  scope: LocalOwnerScope,
  now: string,
): void {
  if (!source || source.status !== "valid") return;
  const journal = source.data;
  if (journal.ownerScope !== scope.key) {
    addIssue(issues, {
      code: "MERGE_JOURNAL_OWNER_MISMATCH",
      domain: "merge-journal",
      severity: "critical",
      summary: "Merge journal aktif owner ile eşleşmiyor.",
      repairability: "manual-only",
      recommendation: "Başka owner journal'ını uygulama veya rollback etme.",
    });
    return;
  }
  if (journal.state === "recovery-required") {
    addIssue(issues, {
      code: "MERGE_JOURNAL_RECOVERY_REQUIRED",
      domain: "merge-journal",
      severity: "critical",
      recordIds: journal.plan.selectedRecordIds,
      summary: "Önceki merge rollback/recovery tamamlanamadı.",
      repairability: "manual-only",
      recommendation: "Yeni merge başlatmadan before/after snapshot'ı incele.",
    });
    return;
  }
  if (!["prepared", "applying", "local-committed", "rolling-back"].includes(journal.state)) {
    return;
  }
  const age = Date.parse(now) - Date.parse(journal.updatedAt);
  addIssue(issues, {
    code: age >= 5 * 60 * 1000 ? "MERGE_JOURNAL_STUCK" : "MERGE_JOURNAL_IN_PROGRESS",
    domain: "merge-journal",
    severity: age >= 5 * 60 * 1000 ? "critical" : "info",
    recordIds: journal.plan.selectedRecordIds,
    summary: age >= 5 * 60 * 1000
      ? "Merge journal ara durumda takılı kalmış görünüyor."
      : "Merge journal henüz terminal duruma ulaşmadı.",
    values: [journal.state],
    repairability: age >= 5 * 60 * 1000 ? "manual-only" : "safe",
    recommendation: age >= 5 * 60 * 1000
      ? "Startup recovery/rollback durumunu incele."
      : "Aktif işlem tamamlanmadan veri değiştirme.",
  });
}

function scanQueue(
  issues: Map<string, LocalDataIntegrityIssue>,
  source: SyncQueueInspectionResult | undefined,
  recordIds: Set<string>,
  logIds: Set<string>,
): void {
  if (!source) return;
  if (source.status === "corrupt" || source.status === "storage_unavailable") {
    addIssue(issues, {
      code: `CLOUD_QUEUE_${source.status.toUpperCase()}`,
      domain: "cloud-queue",
      severity: source.status === "corrupt" ? "critical" : "error",
      summary: "Cloud sync queue güvenli biçimde okunamadı.",
      repairability: "manual-only",
      recommendation: "Queue current'ını otomatik flush veya overwrite etme.",
    });
    return;
  }
  for (const inspectionIssue of source.issues) {
    addIssue(issues, {
      code: inspectionIssue.code.toUpperCase(),
      domain: "cloud-queue",
      severity: inspectionIssue.code === "queue_owner_mismatch" ? "critical" : "error",
      recordIds: inspectionIssue.recordId ? [inspectionIssue.recordId] : [],
      summary: inspectionIssue.code === "queue_owner_mismatch"
        ? "Cloud queue operasyonu aktif owner'a ait değil."
        : "Cloud queue operasyonu runtime formatını geçemedi.",
      repairability: "manual-only",
      recommendation: "Ownerless/foreign operasyonu otomatik adopt veya flush etme.",
    });
  }
  for (const item of source.items) {
    if (item.operation !== "upsert" || !item.payload || typeof item.payload !== "object") continue;
    const payloadId = "id" in item.payload && typeof item.payload.id === "string"
      ? item.payload.id
      : null;
    const orphan = item.entity === "media_item"
      ? !payloadId || !recordIds.has(payloadId)
      : !payloadId || !logIds.has(payloadId);
    if (!orphan) continue;
    addIssue(issues, {
      code: "CLOUD_QUEUE_ORPHAN_UPSERT",
      domain: "cloud-queue",
      severity: "error",
      recordIds: item.entity === "media_item" && payloadId ? [payloadId] : [],
      logIds: item.entity === "progress_log" && payloadId ? [payloadId] : [],
      summary: "Cloud upsert operasyonunun local kaynak kaydı bulunamıyor.",
      repairability: "requires-confirmation",
      recommendation: "Queue operasyonunu silmeden önce merge/undo receipt'ini incele.",
    });
  }
}

export function buildLocalDataGraphFingerprint(
  input: Pick<
    LocalDataIntegrityInput,
    | "mediaItems"
    | "progressLogs"
    | "mediaEnvelope"
    | "progressEnvelope"
    | "aliases"
    | "redirects"
    | "duplicateReviews"
    | "mergeJournal"
    | "recommendationLinks"
    | "syncQueue"
  >,
): string {
  return `graph:v1:${stableHash(stableSerialize(input))}`;
}

export function scanLocalDataIntegrity(
  input: LocalDataIntegrityInput,
): LocalDataIntegrityReport {
  const issues = new Map<string, LocalDataIntegrityIssue>();
  const mediaItems = [...input.mediaItems];
  const progressLogs = [...input.progressLogs];
  const recordIds = new Set(mediaItems.map((item) => item.id));
  const logIds = new Set(progressLogs.map((log) => log.id));
  const canonicalKeys = new Set(
    mediaItems
      .map(getCanonicalMediaKeyV2)
      .filter((key): key is string => Boolean(key)),
  );

  if (input.mediaEnvelope) envelopeIssue(
    issues,
    "media-library",
    input.mediaEnvelope,
  );
  if (input.progressEnvelope) envelopeIssue(
    issues,
    "progress-logs",
    input.progressEnvelope,
  );

  scanMedia(issues, mediaItems);

  personalSourceIssue(issues, "identity-alias", "alias-registry", input.aliases);
  const aliases = scanAliases(issues, input.aliases, canonicalKeys);

  personalSourceIssue(issues, "record-redirect", "redirect-registry", input.redirects);
  const redirects = scanRedirects(issues, input.redirects, recordIds);

  scanProgressLogs(issues, progressLogs, recordIds, redirects);
  scanRecommendations(issues, input.recommendationLinks, recordIds);

  personalSourceIssue(
    issues,
    "duplicate-review",
    "duplicate-review-registry",
    input.duplicateReviews,
  );
  scanDuplicateReviews(
    issues,
    input.duplicateReviews,
    mediaItems,
    aliases,
    input.scope.key,
  );

  personalSourceIssue(issues, "merge-journal", "merge-journal", input.mergeJournal);
  scanMergeJournal(
    issues,
    input.mergeJournal,
    input.scope,
    input.now ?? new Date().toISOString(),
  );
  scanQueue(issues, input.syncQueue, recordIds, logIds);

  const ordered = [...issues.values()].sort((left, right) =>
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || left.domain.localeCompare(right.domain, "en")
    || left.code.localeCompare(right.code, "en")
    || left.id.localeCompare(right.id, "en"));
  const severity = {
    info: 0,
    warning: 0,
    error: 0,
    critical: 0,
  } satisfies Record<IntegritySeverity, number>;
  const domain: Partial<Record<IntegrityDomain, number>> = {};
  for (const issue of ordered) {
    severity[issue.severity] += 1;
    domain[issue.domain] = (domain[issue.domain] ?? 0) + 1;
  }
  return {
    version: LOCAL_DATA_INTEGRITY_SCAN_VERSION,
    ownerKind: input.scope.kind,
    scannedAt: input.now ?? new Date().toISOString(),
    sourceFingerprint: buildLocalDataGraphFingerprint(input),
    scannedMediaCount: mediaItems.length,
    scannedLogCount: progressLogs.length,
    issues: ordered,
    counts: { severity, domain },
  };
}
