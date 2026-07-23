import type { MediaItem, ProgressLog } from "./types";
import {
  decodeMediaItems,
  decodeProgressLogs,
  type RecordCodecIssue,
} from "./local-data-codec";

export type LocalDataDomain = "media-library" | "progress-logs";
export type StorageReadStatus =
  | "missing"
  | "valid"
  | "empty"
  | "corrupt"
  | "unsupported_version"
  | "migration_failed"
  | "storage_unavailable";

export interface StorageReadIssue {
  code: string;
  message: string;
  recordIndex?: number;
  recordId?: string;
  path?: string;
}

export interface StorageReadResult<T> {
  status: StorageReadStatus;
  data?: T;
  sourceKey: string;
  schemaVersion?: number;
  issues: StorageReadIssue[];
  rawBackupKey?: string;
}

export interface LocalDataEnvelope<T> {
  format: "mediatracker-local-data";
  domain: LocalDataDomain;
  schemaVersion: 1;
  writerVersion: "D1B.1";
  writtenAt: string;
  recordCount: number;
  records: T[];
}

export type StorageWriteErrorCode =
  | "quota_exceeded"
  | "serialization_failed"
  | "verification_failed"
  | "storage_unavailable";

export type StorageWriteResult =
  | {
      ok: true;
      writtenAt: string;
      backupCreated: boolean;
    }
  | {
      ok: false;
      code: StorageWriteErrorCode;
      message: string;
      recoverable: boolean;
    };

export interface LocalDataKeySet {
  current: string;
  temp: string;
  backup: string;
  legacy: string;
  legacyRawBackup: string;
}

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LOCAL_DATA_FORMAT = "mediatracker-local-data" as const;
export const LOCAL_DATA_SCHEMA_VERSION = 1 as const;

/**
 * D1B.2 kullanıcı namespace'i bu builder'a eklenecek. D1B.1 anahtarlarında
 * bilinçli olarak user id bulunmaz.
 */
export function buildLocalDataKeys(domain: LocalDataDomain): LocalDataKeySet {
  if (domain === "media-library") {
    return {
      current: "mediaTracker:data:media:v1",
      temp: "mediaTracker:data:media:v1:temp",
      backup: "mediaTracker:data:media:v1:backup",
      legacy: "media-tracker-list",
      legacyRawBackup: "mediaTracker:legacyBackup:media-library:v1",
    };
  }
  return {
    current: "mediaTracker:data:progressLogs:v1",
    temp: "mediaTracker:data:progressLogs:v1:temp",
    backup: "mediaTracker:data:progressLogs:v1:backup",
    legacy: "media-tracker-logs",
    legacyRawBackup: "mediaTracker:legacyBackup:progress-logs:v1",
  };
}

export const MEDIA_DATA_KEYS = buildLocalDataKeys("media-library");
export const PROGRESS_LOG_DATA_KEYS = buildLocalDataKeys("progress-logs");

function browserStorage(): LocalStorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorCode(error: unknown): StorageWriteErrorCode {
  if (
    error instanceof DOMException
    && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  ) {
    return "quota_exceeded";
  }
  if (
    error
    && typeof error === "object"
    && "name" in error
    && ((error as { name?: unknown }).name === "QuotaExceededError"
      || (error as { name?: unknown }).name === "NS_ERROR_DOM_QUOTA_REACHED")
  ) {
    return "quota_exceeded";
  }
  return "storage_unavailable";
}

function writeFailure(error: unknown, fallback: string): StorageWriteResult {
  const code = errorCode(error);
  return {
    ok: false,
    code,
    message: code === "quota_exceeded"
      ? "Tarayıcı depolama kotası dolu; mevcut veri korundu."
      : fallback,
    recoverable: true,
  };
}

function createEnvelope<T>(
  domain: LocalDataDomain,
  records: T[],
  writtenAt = new Date().toISOString(),
): LocalDataEnvelope<T> {
  return {
    format: LOCAL_DATA_FORMAT,
    domain,
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    writerVersion: "D1B.1",
    writtenAt,
    recordCount: records.length,
    records,
  };
}

function codecForDomain(domain: LocalDataDomain, values: unknown[]) {
  return domain === "media-library" ? decodeMediaItems(values) : decodeProgressLogs(values);
}

function codecIssues(
  issues: Array<RecordCodecIssue & { recordIndex: number; recordId?: string }>,
): StorageReadIssue[] {
  return issues.map((entry) => ({
    code: entry.code,
    message: entry.message,
    recordIndex: entry.recordIndex,
    recordId: entry.recordId,
    path: entry.path,
  }));
}

type EnvelopeDecode =
  | {
      ok: true;
      records: MediaItem[] | ProgressLog[];
      writtenAt: string;
      issues: StorageReadIssue[];
    }
  | {
      ok: false;
      status: Exclude<StorageReadStatus, "missing" | "valid" | "empty" | "storage_unavailable">;
      issues: StorageReadIssue[];
    };

function decodeEnvelopeRaw(raw: string, expectedDomain: LocalDataDomain): EnvelopeDecode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "json_parse_failed", message: "Local data JSON olarak ayrıştırılamadı." }],
    };
  }
  if (!isRecord(parsed)) {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "invalid_envelope", message: "Local data envelope bir obje olmalıdır." }],
    };
  }
  if (parsed.format !== LOCAL_DATA_FORMAT) {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "invalid_format", message: "Local data envelope formatı tanınmıyor." }],
    };
  }
  if (parsed.domain !== expectedDomain) {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "domain_mismatch", message: "Local data envelope yanlış domain içeriyor." }],
    };
  }
  if (typeof parsed.schemaVersion !== "number" || !Number.isInteger(parsed.schemaVersion)) {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "invalid_schema_version", message: "Local data schemaVersion geçersiz." }],
    };
  }
  if (parsed.schemaVersion > LOCAL_DATA_SCHEMA_VERSION) {
    return {
      ok: false,
      status: "unsupported_version",
      issues: [{
        code: "unsupported_schema_version",
        message: `Local data schema v${parsed.schemaVersion} bu sürüm tarafından desteklenmiyor.`,
      }],
    };
  }
  if (parsed.schemaVersion < LOCAL_DATA_SCHEMA_VERSION) {
    return {
      ok: false,
      status: "migration_failed",
      issues: [{
        code: "missing_envelope_migration",
        message: `Local data schema v${parsed.schemaVersion} için migration bulunamadı.`,
      }],
    };
  }
  if (!Array.isArray(parsed.records)) {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "records_not_array", message: "Local data records alanı dizi olmalıdır." }],
    };
  }
  if (typeof parsed.writtenAt !== "string" || !Number.isFinite(Date.parse(parsed.writtenAt))) {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "invalid_written_at", message: "Local data writtenAt değeri geçersiz." }],
    };
  }
  if (parsed.recordCount !== undefined && parsed.recordCount !== parsed.records.length) {
    return {
      ok: false,
      status: "corrupt",
      issues: [{ code: "record_count_mismatch", message: "Envelope recordCount kayıt sayısıyla uyuşmuyor." }],
    };
  }
  const decoded = codecForDomain(expectedDomain, parsed.records);
  if (!decoded.ok) {
    return { ok: false, status: "corrupt", issues: codecIssues(decoded.issues) };
  }
  return {
    ok: true,
    records: decoded.records,
    writtenAt: parsed.writtenAt,
    issues: decoded.repairs.map((entry) => ({
      code: entry.code,
      message: entry.message,
      recordIndex: entry.recordIndex,
      recordId: entry.recordId,
      path: entry.path,
    })),
  };
}

interface QuarantineEnvelope {
  format: "mediatracker-local-quarantine";
  domain: LocalDataDomain;
  sourceKey: string;
  capturedAt: string;
  errorCodes: string[];
  rawPayload: string;
}

function quarantineRaw(
  target: LocalStorageLike,
  domain: LocalDataDomain,
  sourceKey: string,
  rawPayload: string,
  issues: StorageReadIssue[],
): string | undefined {
  const capturedAt = new Date().toISOString();
  const key = `mediaTracker:quarantine:${domain}:${Date.now()}`;
  const envelope: QuarantineEnvelope = {
    format: "mediatracker-local-quarantine",
    domain,
    sourceKey,
    capturedAt,
    errorCodes: issues.map((entry) => entry.code),
    rawPayload,
  };
  try {
    target.setItem(key, JSON.stringify(envelope));
    return key;
  } catch {
    return undefined;
  }
}

function readCurrent<T>(
  domain: LocalDataDomain,
  raw: string,
  sourceKey: string,
  target: LocalStorageLike,
): StorageReadResult<T> {
  const decoded = decodeEnvelopeRaw(raw, domain);
  if (!decoded.ok) {
    const rawBackupKey = decoded.status === "corrupt"
      ? quarantineRaw(target, domain, sourceKey, raw, decoded.issues)
      : undefined;
    return {
      status: decoded.status,
      sourceKey,
      schemaVersion: decoded.status === "unsupported_version" ? undefined : LOCAL_DATA_SCHEMA_VERSION,
      issues: decoded.issues,
      rawBackupKey,
    };
  }
  const data = decoded.records as T;
  return {
    status: decoded.records.length === 0 ? "empty" : "valid",
    data,
    sourceKey,
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    issues: decoded.issues,
  };
}

function readDomain<T>(
  domain: LocalDataDomain,
  target: LocalStorageLike | null,
): StorageReadResult<T> {
  const keys = buildLocalDataKeys(domain);
  if (!target) {
    return {
      status: "storage_unavailable",
      sourceKey: keys.current,
      issues: [{ code: "storage_unavailable", message: "Tarayıcı local storage kullanılamıyor." }],
    };
  }

  let currentRaw: string | null;
  try {
    currentRaw = target.getItem(keys.current);
  } catch {
    return {
      status: "storage_unavailable",
      sourceKey: keys.current,
      issues: [{ code: "storage_read_failed", message: "Local data okunamadı." }],
    };
  }
  if (currentRaw !== null) return readCurrent<T>(domain, currentRaw, keys.current, target);

  let legacyRaw: string | null;
  try {
    legacyRaw = target.getItem(keys.legacy);
  } catch {
    return {
      status: "storage_unavailable",
      sourceKey: keys.legacy,
      issues: [{ code: "storage_read_failed", message: "Legacy local data okunamadı." }],
    };
  }
  if (legacyRaw === null) {
    return { status: "missing", sourceKey: keys.current, issues: [] };
  }

  let legacyParsed: unknown;
  try {
    legacyParsed = JSON.parse(legacyRaw);
  } catch {
    const issues = [{ code: "legacy_json_parse_failed", message: "Legacy local data JSON olarak ayrıştırılamadı." }];
    return {
      status: "corrupt",
      sourceKey: keys.legacy,
      issues,
      rawBackupKey: quarantineRaw(target, domain, keys.legacy, legacyRaw, issues),
    };
  }
  if (!Array.isArray(legacyParsed)) {
    const issues = [{ code: "legacy_not_array", message: "Legacy local data bir kayıt dizisi değil." }];
    return {
      status: "corrupt",
      sourceKey: keys.legacy,
      issues,
      rawBackupKey: quarantineRaw(target, domain, keys.legacy, legacyRaw, issues),
    };
  }
  const decoded = codecForDomain(domain, legacyParsed);
  if (!decoded.ok) {
    const issues = codecIssues(decoded.issues);
    return {
      status: "corrupt",
      sourceKey: keys.legacy,
      issues,
      rawBackupKey: quarantineRaw(target, domain, keys.legacy, legacyRaw, issues),
    };
  }

  try {
    if (target.getItem(keys.legacyRawBackup) === null) {
      target.setItem(keys.legacyRawBackup, legacyRaw);
    }
  } catch (error) {
    return {
      status: "migration_failed",
      sourceKey: keys.legacy,
      issues: [{
        code: errorCode(error),
        message: "Legacy raw backup oluşturulamadığı için migration durduruldu.",
      }],
    };
  }

  const normalizedRecords = decoded.records as Array<MediaItem | ProgressLog>;
  const write = writeDomain<MediaItem | ProgressLog>(domain, normalizedRecords, target);
  if (!write.ok) {
    return {
      status: "migration_failed",
      sourceKey: keys.legacy,
      issues: [{ code: write.code, message: write.message }],
      rawBackupKey: keys.legacyRawBackup,
    };
  }
  return {
    status: decoded.records.length === 0 ? "empty" : "valid",
    data: decoded.records as T,
    sourceKey: keys.current,
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    issues: decoded.repairs.map((entry) => ({
      code: entry.code,
      message: entry.message,
      recordIndex: entry.recordIndex,
      recordId: entry.recordId,
      path: entry.path,
    })),
    rawBackupKey: keys.legacyRawBackup,
  };
}

function removeQuietly(target: LocalStorageLike, key: string): void {
  try {
    target.removeItem(key);
  } catch {
    // Temp cleanup başarısızlığı doğrulanmış current veriyi geçersiz kılmaz.
  }
}

function restoreRaw(
  target: LocalStorageLike,
  key: string,
  raw: string | null,
): boolean {
  try {
    if (raw === null) target.removeItem(key);
    else target.setItem(key, raw);
    return target.getItem(key) === raw;
  } catch {
    return false;
  }
}

function writeDomain<T>(
  domain: LocalDataDomain,
  records: T[],
  target: LocalStorageLike | null,
): StorageWriteResult {
  if (!target) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Tarayıcı local storage kullanılamıyor.",
      recoverable: true,
    };
  }
  const keys = buildLocalDataKeys(domain);
  const writtenAt = new Date().toISOString();
  let serialized: string;
  try {
    serialized = JSON.stringify(createEnvelope(domain, records, writtenAt));
  } catch {
    return {
      ok: false,
      code: "serialization_failed",
      message: "Local data envelope serialize edilemedi.",
      recoverable: true,
    };
  }

  try {
    target.setItem(keys.temp, serialized);
  } catch (error) {
    return writeFailure(error, "Temp local data yazılamadı; mevcut veri korundu.");
  }
  let tempRaw: string | null;
  try {
    tempRaw = target.getItem(keys.temp);
  } catch (error) {
    removeQuietly(target, keys.temp);
    return writeFailure(error, "Temp local data doğrulanamadı; mevcut veri korundu.");
  }
  if (tempRaw === null || !decodeEnvelopeRaw(tempRaw, domain).ok) {
    removeQuietly(target, keys.temp);
    return {
      ok: false,
      code: "verification_failed",
      message: "Temp local data read-back doğrulamasını geçemedi.",
      recoverable: true,
    };
  }

  let previousCurrent: string | null;
  try {
    previousCurrent = target.getItem(keys.current);
  } catch (error) {
    removeQuietly(target, keys.temp);
    return writeFailure(error, "Mevcut local data okunamadı.");
  }
  let backupCreated = false;
  if (previousCurrent !== null) {
    if (!decodeEnvelopeRaw(previousCurrent, domain).ok) {
      removeQuietly(target, keys.temp);
      return {
        ok: false,
        code: "verification_failed",
        message: "Mevcut current slot geçersiz; recovery kararı olmadan üzerine yazılmadı.",
        recoverable: true,
      };
    }
    try {
      target.setItem(keys.backup, previousCurrent);
      const backupRaw = target.getItem(keys.backup);
      if (backupRaw !== previousCurrent || !decodeEnvelopeRaw(backupRaw, domain).ok) {
        removeQuietly(target, keys.temp);
        return {
          ok: false,
          code: "verification_failed",
          message: "Backup slot doğrulanamadı; current değiştirilmedi.",
          recoverable: true,
        };
      }
      backupCreated = true;
    } catch (error) {
      removeQuietly(target, keys.temp);
      return writeFailure(error, "Backup slot oluşturulamadı; current değiştirilmedi.");
    }
  }

  try {
    target.setItem(keys.current, serialized);
    const currentRaw = target.getItem(keys.current);
    if (currentRaw !== serialized || !decodeEnvelopeRaw(currentRaw, domain).ok) {
      if (!restoreRaw(target, keys.current, previousCurrent)) {
        return {
          ok: false,
          code: "verification_failed",
          message: "Current doğrulaması ve otomatik geri dönüş başarısız oldu; backup slot korundu.",
          recoverable: true,
        };
      }
      return {
        ok: false,
        code: "verification_failed",
        message: "Current read-back doğrulaması başarısız; önceki current geri yüklendi.",
        recoverable: true,
      };
    }
  } catch (error) {
    restoreRaw(target, keys.current, previousCurrent);
    return writeFailure(error, "Current local data yazılamadı; önceki veri korundu.");
  } finally {
    removeQuietly(target, keys.temp);
  }

  return { ok: true, writtenAt, backupCreated };
}

export function loadMediaList(
  target: LocalStorageLike | null = browserStorage(),
): StorageReadResult<MediaItem[]> {
  return readDomain<MediaItem[]>("media-library", target);
}

export function loadProgressLogs(
  target: LocalStorageLike | null = browserStorage(),
): StorageReadResult<ProgressLog[]> {
  return readDomain<ProgressLog[]>("progress-logs", target);
}

export function saveMediaList(
  list: MediaItem[],
  target: LocalStorageLike | null = browserStorage(),
): StorageWriteResult {
  const decoded = decodeMediaItems(list);
  if (!decoded.ok) {
    return {
      ok: false,
      code: "verification_failed",
      message: `Media kayıtları runtime codec doğrulamasını geçemedi (${decoded.issues.length} sorun).`,
      recoverable: true,
    };
  }
  return writeDomain("media-library", decoded.records, target);
}

export function saveProgressLogs(
  logs: ProgressLog[],
  target: LocalStorageLike | null = browserStorage(),
): StorageWriteResult {
  const decoded = decodeProgressLogs(logs);
  if (!decoded.ok) {
    return {
      ok: false,
      code: "verification_failed",
      message: `Progress log kayıtları runtime codec doğrulamasını geçemedi (${decoded.issues.length} sorun).`,
      recoverable: true,
    };
  }
  return writeDomain("progress-logs", decoded.records, target);
}

export function saveLibrarySnapshot(
  mediaItems: MediaItem[],
  progressLogs: ProgressLog[],
  target: LocalStorageLike | null = browserStorage(),
): StorageWriteResult {
  if (!target) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Tarayıcı local storage kullanılamıyor.",
      recoverable: true,
    };
  }
  const mediaDecoded = decodeMediaItems(mediaItems);
  const logsDecoded = decodeProgressLogs(progressLogs);
  if (!mediaDecoded.ok || !logsDecoded.ok) {
    return {
      ok: false,
      code: "verification_failed",
      message: `Library snapshot runtime doğrulamasını geçemedi (${mediaDecoded.issues.length + logsDecoded.issues.length} sorun).`,
      recoverable: true,
    };
  }

  let previousMedia: string | null;
  try {
    previousMedia = target.getItem(MEDIA_DATA_KEYS.current);
  } catch (error) {
    return writeFailure(error, "Mevcut media current slot okunamadı.");
  }
  const mediaWrite = writeDomain("media-library", mediaDecoded.records, target);
  if (!mediaWrite.ok) return mediaWrite;

  const logsWrite = writeDomain("progress-logs", logsDecoded.records, target);
  if (!logsWrite.ok) {
    if (!restoreRaw(target, MEDIA_DATA_KEYS.current, previousMedia)) {
      return {
        ok: false,
        code: "verification_failed",
        message: "Progress log yazımı başarısız oldu ve media current otomatik geri alınamadı; backup korundu.",
        recoverable: true,
      };
    }
    return logsWrite;
  }
  return {
    ok: true,
    writtenAt: logsWrite.writtenAt,
    backupCreated: mediaWrite.backupCreated || logsWrite.backupCreated,
  };
}

export function clearMediaList(
  target: LocalStorageLike | null = browserStorage(),
): StorageWriteResult {
  return saveMediaList([], target);
}
