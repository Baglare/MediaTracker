import {
  decodeReleaseEvents,
  resolveTvSeasonIdentity,
  type ReleaseEvent,
} from "@/features/calendar/domain/release-calendar";
import { getCanonicalMediaIdentity } from "@/lib/media-identity";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import {
  buildPersonalDataKeys,
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "@/lib/personal-data-storage";
import type { StorageWriteResult } from "@/lib/local-data-storage";
import type { MediaItem, MediaSource } from "@/lib/types";

export const RELEASE_CACHE_VERSION = 1 as const;
export const RELEASE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const RELEASE_CACHE_MAX_ENTRIES = 2_000;
export const RELEASE_CACHE_MAX_EVENTS_PER_MEDIA = 256;

type ReleaseCacheProvider = Exclude<MediaSource, "manual" | "openlibrary" | "omdb">;

export interface ReleaseCacheEntry {
  mediaRecordId: string;
  mediaFingerprint: string;
  provider: ReleaseCacheProvider;
  fetchedAt: string;
  expiresAt: string;
  events: ReleaseEvent[];
}

export interface ReleaseCalendarCache {
  version: 1;
  entries: ReleaseCacheEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export const releaseCalendarCacheCodec: PersonalDataCodec<ReleaseCalendarCache> = (
  value,
) => {
  if (
    !isRecord(value)
    || value.version !== RELEASE_CACHE_VERSION
    || !Array.isArray(value.entries)
    || value.entries.length > RELEASE_CACHE_MAX_ENTRIES
  ) {
    return {
      ok: false,
      code: "release_cache_invalid",
      message: "Release calendar cache formatı geçersiz.",
    };
  }
  const entries: ReleaseCacheEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value.entries) {
    if (
      !isRecord(raw)
      || typeof raw.mediaRecordId !== "string"
      || raw.mediaRecordId.trim().length === 0
      || typeof raw.mediaFingerprint !== "string"
      || raw.mediaFingerprint.length === 0
      || (raw.provider !== "tvmaze" && raw.provider !== "anilist" && raw.provider !== "tmdb")
      || !validIso(raw.fetchedAt)
      || !validIso(raw.expiresAt)
      || !Array.isArray(raw.events)
      || raw.events.length > RELEASE_CACHE_MAX_EVENTS_PER_MEDIA
      || seen.has(raw.mediaRecordId)
    ) {
      return {
        ok: false,
        code: "release_cache_entry_invalid",
        message: "Release calendar cache entry geçersiz veya duplicate.",
      };
    }
    const decoded = decodeReleaseEvents(raw.events);
    if (
      !decoded.ok
      || decoded.records.some((event) =>
        event.mediaRecordId !== raw.mediaRecordId
        || event.origin.kind !== "provider"
        || event.origin.provider !== raw.provider)
    ) {
      return {
        ok: false,
        code: "release_cache_event_invalid",
        message: "Release calendar cache event codec doğrulamasını geçemedi.",
      };
    }
    seen.add(raw.mediaRecordId);
    entries.push({
      mediaRecordId: raw.mediaRecordId,
      mediaFingerprint: raw.mediaFingerprint,
      provider: raw.provider,
      fetchedAt: raw.fetchedAt,
      expiresAt: raw.expiresAt,
      events: decoded.records,
    });
  }
  entries.sort((left, right) =>
    left.mediaRecordId < right.mediaRecordId ? -1 : left.mediaRecordId > right.mediaRecordId ? 1 : 0);
  return { ok: true, value: { version: RELEASE_CACHE_VERSION, entries } };
};

export function emptyReleaseCalendarCache(): ReleaseCalendarCache {
  return { version: RELEASE_CACHE_VERSION, entries: [] };
}

export function buildReleaseMediaFingerprint(item: MediaItem): string {
  const identity = getCanonicalMediaIdentity(item)?.key ?? "unresolved";
  const season = item.type === "tv" ? resolveTvSeasonIdentity(item) : null;
  const seasonKey = season?.status === "resolved" ? season.value.key : "none";
  return JSON.stringify([
    item.id,
    item.type,
    identity,
    seasonKey,
  ]);
}

export function isReleaseCacheEntryStale(
  entry: ReleaseCacheEntry,
  nowMs = Date.now(),
): boolean {
  return Date.parse(entry.expiresAt) <= nowMs;
}

export function currentReleaseCacheEntry(
  cache: ReleaseCalendarCache,
  item: MediaItem,
): ReleaseCacheEntry | null {
  const fingerprint = buildReleaseMediaFingerprint(item);
  return cache.entries.find((entry) =>
    entry.mediaRecordId === item.id && entry.mediaFingerprint === fingerprint) ?? null;
}

export function upsertReleaseCacheEntry(
  cache: ReleaseCalendarCache,
  entry: ReleaseCacheEntry,
): ReleaseCalendarCache {
  return {
    version: RELEASE_CACHE_VERSION,
    entries: [
      ...cache.entries.filter((candidate) => candidate.mediaRecordId !== entry.mediaRecordId),
      entry,
    ].sort((left, right) =>
      left.mediaRecordId < right.mediaRecordId ? -1 : left.mediaRecordId > right.mediaRecordId ? 1 : 0),
  };
}

export function createReleaseCacheEntry(input: {
  item: MediaItem;
  provider: ReleaseCacheProvider;
  events: ReleaseEvent[];
  fetchedAtMs?: number;
}): ReleaseCacheEntry {
  const fetchedAtMs = input.fetchedAtMs ?? Date.now();
  return {
    mediaRecordId: input.item.id,
    mediaFingerprint: buildReleaseMediaFingerprint(input.item),
    provider: input.provider,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    expiresAt: new Date(fetchedAtMs + RELEASE_CACHE_TTL_MS).toISOString(),
    events: input.events.slice(0, RELEASE_CACHE_MAX_EVENTS_PER_MEDIA),
  };
}

export function readReleaseCalendarCache(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike,
): PersonalDataReadResult<ReleaseCalendarCache> {
  return readPersonalData(
    scope,
    "releaseCalendarCache",
    releaseCalendarCacheCodec,
    storage,
  );
}

export function writeReleaseCalendarCache(
  scope: LocalOwnerScope,
  cache: ReleaseCalendarCache,
  storage?: PersonalStorageLike,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "releaseCalendarCache",
    cache,
    releaseCalendarCacheCodec,
    storage,
  );
}

/**
 * Release cache yeniden üretilebilir veridir. Canonical reader raw payload'ı
 * quarantine ettikten sonra yalnız doğrulanmış quarantine kanıtına bağlı corrupt
 * current slot kaldırılabilir; backup ve quarantine korunur.
 */
export function discardQuarantinedReleaseCacheCurrent(
  scope: LocalOwnerScope,
  quarantineKey: string,
  storage?: PersonalStorageLike,
): boolean {
  const target = storage
    ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (
    !target
    || !quarantineKey.startsWith("mediaTracker:quarantine:personal:releaseCalendarCache:")
  ) return false;
  const keys = buildPersonalDataKeys("releaseCalendarCache", scope);
  try {
    const raw = target.getItem(quarantineKey);
    if (!raw) return false;
    const evidence = JSON.parse(raw) as unknown;
    if (
      !isRecord(evidence)
      || evidence.format !== "mediatracker-personal-quarantine"
      || evidence.domain !== "releaseCalendarCache"
      || evidence.sourceKey !== keys.current
      || typeof evidence.raw !== "string"
      || target.getItem(keys.current) !== evidence.raw
    ) return false;
    target.removeItem(keys.current);
    return target.getItem(keys.current) === null;
  } catch {
    return false;
  }
}
