import type { StorageWriteResult } from "./local-data-storage";
import {
  isLocalOwnerScope,
  type LocalOwnerScope,
} from "./local-owner-scope";

export type PersonalDataDomain =
  | "profilePreferences"
  | "customThemes"
  | "themeSelection"
  | "themeCloudSync"
  | "aiSession"
  | "aiFeedback"
  | "aiPreferences";

export interface PersonalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersonalDataKeySet {
  current: string;
  temp: string;
  backup: string;
}

export interface PersonalDataEnvelope<T> {
  format: "mediatracker-personal-data";
  domain: PersonalDataDomain;
  schemaVersion: 1;
  writerVersion: "D1B.2B";
  ownerScope: string;
  writtenAt: string;
  value: T;
}

export type PersonalDataReadResult<T> =
  | { status: "missing"; sourceKey: string }
  | { status: "valid"; sourceKey: string; data: T; writtenAt: string }
  | { status: "corrupt"; sourceKey: string; quarantineKey?: string; message: string }
  | { status: "owner_mismatch"; sourceKey: string; message: string }
  | { status: "storage_unavailable"; sourceKey: string; message: string };

export type PersonalDataCodec<T> = (
  value: unknown,
) => { ok: true; value: T } | { ok: false; message: string };

const FORMAT = "mediatracker-personal-data" as const;

export function buildPersonalDataKeys(
  domain: PersonalDataDomain,
  scope: LocalOwnerScope,
): PersonalDataKeySet {
  const base = `mediaTracker:personal:v1:${scope.storageKey}:${domain}`;
  return {
    current: base,
    temp: `${base}:temp`,
    backup: `${base}:backup`,
  };
}

function browserStorage(): PersonalStorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeEnvelope<T>(
  raw: string,
  domain: PersonalDataDomain,
  scope: LocalOwnerScope,
  codec: PersonalDataCodec<T>,
):
  | { ok: true; value: T; writtenAt: string }
  | { ok: false; ownerMismatch?: boolean; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "JSON parse edilemedi." };
  }
  if (
    !isRecord(parsed)
    || parsed.format !== FORMAT
    || parsed.domain !== domain
    || parsed.schemaVersion !== 1
    || parsed.writerVersion !== "D1B.2B"
    || typeof parsed.writtenAt !== "string"
    || !Number.isFinite(Date.parse(parsed.writtenAt))
  ) {
    return { ok: false, message: "Kisisel veri envelope formati gecersiz." };
  }
  if (parsed.ownerScope !== scope.key) {
    return {
      ok: false,
      ownerMismatch: true,
      message: "Envelope sahibi aktif local owner ile eslesmiyor.",
    };
  }
  const decoded = codec(parsed.value);
  if (!decoded.ok) return decoded;
  return { ok: true, value: decoded.value, writtenAt: parsed.writtenAt };
}

function quarantineRaw(
  storage: PersonalStorageLike,
  domain: PersonalDataDomain,
  sourceKey: string,
  raw: string,
  message: string,
): string | undefined {
  const key = `mediaTracker:quarantine:personal:${domain}:${Date.now()}`;
  try {
    storage.setItem(key, JSON.stringify({
      format: "mediatracker-personal-quarantine",
      version: 1,
      domain,
      sourceKey,
      capturedAt: new Date().toISOString(),
      message,
      raw,
    }));
    return storage.getItem(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

function removeQuietly(storage: PersonalStorageLike, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Recovery slots remain best-effort; current is never removed here.
  }
}

function writeFailure(error: unknown, message: string): StorageWriteResult {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name)
    : "";
  const quota = name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
  return {
    ok: false,
    code: quota ? "quota_exceeded" : "storage_unavailable",
    message: quota
      ? "Tarayici depolama kotasi dolu; mevcut kisisel veri korundu."
      : message,
    recoverable: true,
  };
}

export function readPersonalData<T>(
  scope: LocalOwnerScope,
  domain: PersonalDataDomain,
  codec: PersonalDataCodec<T>,
  storage: PersonalStorageLike | null = browserStorage(),
): PersonalDataReadResult<T> {
  const keys = buildPersonalDataKeys(domain, scope);
  if (!storage) {
    return {
      status: "storage_unavailable",
      sourceKey: keys.current,
      message: "Tarayici local storage kullanilamiyor.",
    };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(keys.current);
  } catch {
    return {
      status: "storage_unavailable",
      sourceKey: keys.current,
      message: "Kisisel veri current slotu okunamadi.",
    };
  }
  if (raw === null) return { status: "missing", sourceKey: keys.current };
  const decoded = decodeEnvelope(raw, domain, scope, codec);
  if (decoded.ok) {
    return {
      status: "valid",
      sourceKey: keys.current,
      data: decoded.value,
      writtenAt: decoded.writtenAt,
    };
  }
  if (decoded.ownerMismatch) {
    return {
      status: "owner_mismatch",
      sourceKey: keys.current,
      message: decoded.message,
    };
  }
  return {
    status: "corrupt",
    sourceKey: keys.current,
    quarantineKey: quarantineRaw(storage, domain, keys.current, raw, decoded.message),
    message: decoded.message,
  };
}

export function writePersonalData<T>(
  scope: LocalOwnerScope,
  domain: PersonalDataDomain,
  value: T,
  codec: PersonalDataCodec<T>,
  storage: PersonalStorageLike | null = browserStorage(),
): StorageWriteResult {
  if (!storage || !isLocalOwnerScope(scope)) {
    return {
      ok: false,
      code: "storage_unavailable",
      message: "Kisisel veri icin gecerli owner veya storage bulunamadi.",
      recoverable: true,
    };
  }
  const normalized = codec(value);
  if (!normalized.ok) {
    return {
      ok: false,
      code: "verification_failed",
      message: normalized.message,
      recoverable: true,
    };
  }
  const keys = buildPersonalDataKeys(domain, scope);
  const writtenAt = new Date().toISOString();
  let serialized: string;
  try {
    serialized = JSON.stringify({
      format: FORMAT,
      domain,
      schemaVersion: 1,
      writerVersion: "D1B.2B",
      ownerScope: scope.key,
      writtenAt,
      value: normalized.value,
    } satisfies PersonalDataEnvelope<T>);
  } catch {
    return {
      ok: false,
      code: "serialization_failed",
      message: "Kisisel veri envelope serialize edilemedi.",
      recoverable: true,
    };
  }

  try {
    storage.setItem(keys.temp, serialized);
    const tempRaw = storage.getItem(keys.temp);
    if (
      tempRaw !== serialized
      || !decodeEnvelope(tempRaw, domain, scope, codec).ok
    ) {
      removeQuietly(storage, keys.temp);
      return {
        ok: false,
        code: "verification_failed",
        message: "Kisisel veri temp slotu read-back dogrulamasini gecemedi.",
        recoverable: true,
      };
    }
  } catch (error) {
    removeQuietly(storage, keys.temp);
    return writeFailure(error, "Kisisel veri temp slotuna yazilamadi.");
  }

  let previous: string | null;
  try {
    previous = storage.getItem(keys.current);
  } catch (error) {
    removeQuietly(storage, keys.temp);
    return writeFailure(error, "Kisisel veri current slotu okunamadi.");
  }
  let backupCreated = false;
  if (previous !== null) {
    if (!decodeEnvelope(previous, domain, scope, codec).ok) {
      removeQuietly(storage, keys.temp);
      return {
        ok: false,
        code: "verification_failed",
        message: "Gecersiz current slot recovery karari olmadan overwrite edilmedi.",
        recoverable: true,
      };
    }
    try {
      storage.setItem(keys.backup, previous);
      if (
        storage.getItem(keys.backup) !== previous
        || !decodeEnvelope(previous, domain, scope, codec).ok
      ) {
        removeQuietly(storage, keys.temp);
        return {
          ok: false,
          code: "verification_failed",
          message: "Kisisel veri backup slotu dogrulanamadi.",
          recoverable: true,
        };
      }
      backupCreated = true;
    } catch (error) {
      removeQuietly(storage, keys.temp);
      return writeFailure(error, "Kisisel veri backup slotu olusturulamadi.");
    }
  }

  try {
    storage.setItem(keys.current, serialized);
    const currentRaw = storage.getItem(keys.current);
    if (
      currentRaw !== serialized
      || !decodeEnvelope(currentRaw, domain, scope, codec).ok
    ) {
      if (previous === null) storage.removeItem(keys.current);
      else storage.setItem(keys.current, previous);
      return {
        ok: false,
        code: "verification_failed",
        message: "Current read-back dogrulamasi basarisiz; onceki current geri yuklendi.",
        recoverable: true,
      };
    }
  } catch (error) {
    try {
      if (previous === null) storage.removeItem(keys.current);
      else storage.setItem(keys.current, previous);
    } catch {
      // Backup remains available for a later recovery decision.
    }
    return writeFailure(error, "Kisisel veri current slotuna yazilamadi.");
  } finally {
    removeQuietly(storage, keys.temp);
  }
  return { ok: true, writtenAt, backupCreated };
}
