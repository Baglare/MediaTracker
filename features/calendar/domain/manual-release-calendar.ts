import {
  decodeReleaseSchedule,
  isReleaseEligible,
  resolveTvSeasonIdentity,
  type ReleaseEvent,
} from "@/features/calendar/domain/release-calendar";
import type {
  ManualReleaseEvent,
  ManualReleaseEventKind,
  MediaItem,
  MediaReleaseCalendarData,
  MediaReleaseSchedule,
} from "@/lib/types";

export const MEDIA_RELEASE_CALENDAR_VERSION = 1 as const;

const MANUAL_EVENT_KINDS = new Set<ManualReleaseEventKind>([
  "episode",
  "season_premiere",
  "movie_release",
  "publication",
  "manual",
]);
const PROVIDER_SOURCES = new Set([
  "tmdb",
  "tvmaze",
  "openlibrary",
  "anilist",
  "omdb",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MANUAL_EVENTS = 200;
const MAX_HIDDEN_KEYS = 500;

export interface MediaReleaseCalendarCodecIssue {
  code: string;
  path: string;
  message: string;
}

export interface MediaReleaseCalendarDecodeResult {
  ok: boolean;
  value: MediaReleaseCalendarData;
  issues: MediaReleaseCalendarCodecIssue[];
}

export interface ManualReleaseEventInput {
  eventKind: ManualReleaseEventKind;
  title: string;
  schedule: MediaReleaseSchedule;
  note?: string;
}

function emptyData(): MediaReleaseCalendarData {
  return {
    version: MEDIA_RELEASE_CALENDAR_VERSION,
    manualEvents: [],
    hiddenProviderEventKeys: [],
  };
}

export function emptyMediaReleaseCalendarData(): MediaReleaseCalendarData {
  return emptyData();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  code: string,
  path: string,
  message: string,
): MediaReleaseCalendarCodecIssue {
  return { code, path, message };
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function decodeManualEvent(
  value: unknown,
  expectedMediaId: string | undefined,
  index: number,
): { value?: ManualReleaseEvent; issues: MediaReleaseCalendarCodecIssue[] } {
  const issues: MediaReleaseCalendarCodecIssue[] = [];
  const basePath = `manualEvents.${index}`;
  if (!isRecord(value)) {
    return { issues: [issue("invalid_manual_event", basePath, "Manuel yayın olayı nesne olmalıdır.")] };
  }
  const allowed = new Set([
    "id",
    "mediaId",
    "eventKind",
    "title",
    "schedule",
    "note",
    "createdAt",
    "updatedAt",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(issue("unknown_manual_event_field", `${basePath}.${key}`, "Bilinmeyen manuel olay alanı."));
    }
  }
  const id = typeof value.id === "string" && UUID_PATTERN.test(value.id)
    ? value.id
    : undefined;
  const mediaId = typeof value.mediaId === "string" && value.mediaId.trim()
    ? value.mediaId
    : undefined;
  const title = typeof value.title === "string" && value.title.trim()
    ? value.title.trim()
    : undefined;
  const eventKind = typeof value.eventKind === "string"
    && MANUAL_EVENT_KINDS.has(value.eventKind as ManualReleaseEventKind)
    ? value.eventKind as ManualReleaseEventKind
    : undefined;
  const schedule = decodeReleaseSchedule(value.schedule);
  const createdAt = validIso(value.createdAt) ? value.createdAt : undefined;
  const updatedAt = validIso(value.updatedAt) ? value.updatedAt : undefined;
  const note = value.note === undefined
    ? undefined
    : typeof value.note === "string"
      ? value.note.trim()
      : null;
  if (!id) issues.push(issue("invalid_manual_event_id", `${basePath}.id`, "Manuel olay stabil UUID taşımalıdır."));
  if (!mediaId) issues.push(issue("invalid_manual_media_id", `${basePath}.mediaId`, "Manuel olay mediaId taşımalıdır."));
  if (expectedMediaId && mediaId && mediaId !== expectedMediaId) {
    issues.push(issue("manual_media_mismatch", `${basePath}.mediaId`, "Manuel olay bağlı MediaItem ile eşleşmiyor."));
  }
  if (!eventKind) issues.push(issue("invalid_manual_event_kind", `${basePath}.eventKind`, "Manuel olay türü desteklenmiyor."));
  if (!title || title.length > 200) {
    issues.push(issue("invalid_manual_title", `${basePath}.title`, "Başlık 1-200 karakter olmalıdır."));
  }
  if (!schedule.ok) {
    issues.push(...schedule.issues.map((entry) => ({
      ...entry,
      path: `${basePath}.schedule.${entry.path.replace(/^date\.?/, "")}`,
    })));
  }
  if (note === null || (note && note.length > 1000)) {
    issues.push(issue("invalid_manual_note", `${basePath}.note`, "Not en fazla 1000 karakter olmalıdır."));
  }
  if (!createdAt) issues.push(issue("invalid_manual_created_at", `${basePath}.createdAt`, "createdAt geçerli ISO tarih olmalıdır."));
  if (!updatedAt) issues.push(issue("invalid_manual_updated_at", `${basePath}.updatedAt`, "updatedAt geçerli ISO tarih olmalıdır."));
  if (createdAt && updatedAt && Date.parse(updatedAt) < Date.parse(createdAt)) {
    issues.push(issue("manual_timestamp_order", `${basePath}.updatedAt`, "updatedAt createdAt değerinden önce olamaz."));
  }
  if (
    issues.length > 0
    || !id
    || !mediaId
    || !eventKind
    || !title
    || !schedule.ok
    || !createdAt
    || !updatedAt
  ) {
    return { issues };
  }
  return {
    value: {
      id,
      mediaId,
      eventKind,
      title,
      schedule: schedule.value,
      note: note || undefined,
      createdAt,
      updatedAt,
    },
    issues,
  };
}

export function parseHiddenProviderEventKey(
  key: string,
): { source: string; sourceEventId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const source = key.slice(0, separator);
  if (!PROVIDER_SOURCES.has(source)) return null;
  try {
    const sourceEventId = decodeURIComponent(key.slice(separator + 1));
    return sourceEventId.trim() ? { source, sourceEventId } : null;
  } catch {
    return null;
  }
}

export function buildHiddenProviderEventKey(event: ReleaseEvent): string | null {
  if (
    event.origin.kind !== "provider"
    || !event.origin.providerEventId.trim()
  ) {
    return null;
  }
  return `${event.origin.provider}:${encodeURIComponent(event.origin.providerEventId)}`;
}

export function decodeMediaReleaseCalendarData(
  value: unknown,
  expectedMediaId?: string,
): MediaReleaseCalendarDecodeResult {
  if (value === undefined) return { ok: true, value: emptyData(), issues: [] };
  if (!isRecord(value)) {
    return {
      ok: false,
      value: emptyData(),
      issues: [issue("invalid_release_calendar", "releaseCalendar", "Release calendar metadata nesne olmalıdır.")],
    };
  }
  const issues: MediaReleaseCalendarCodecIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!["version", "manualEvents", "hiddenProviderEventKeys"].includes(key)) {
      issues.push(issue("unknown_release_calendar_field", `releaseCalendar.${key}`, "Bilinmeyen release calendar alanı."));
    }
  }
  if (value.version !== MEDIA_RELEASE_CALENDAR_VERSION) {
    issues.push(issue("unsupported_release_calendar_version", "releaseCalendar.version", "Release calendar sürümü desteklenmiyor."));
  }
  const rawEvents = Array.isArray(value.manualEvents) ? value.manualEvents : [];
  if (!Array.isArray(value.manualEvents) || rawEvents.length > MAX_MANUAL_EVENTS) {
    issues.push(issue("invalid_manual_events", "releaseCalendar.manualEvents", "Manuel olay listesi geçersiz veya limit üstünde."));
  }
  const manualEvents: ManualReleaseEvent[] = [];
  const eventIds = new Set<string>();
  rawEvents.slice(0, MAX_MANUAL_EVENTS).forEach((entry, index) => {
    const decoded = decodeManualEvent(entry, expectedMediaId, index);
    issues.push(...decoded.issues);
    if (!decoded.value) return;
    if (eventIds.has(decoded.value.id)) {
      issues.push(issue("duplicate_manual_event_id", `releaseCalendar.manualEvents.${index}.id`, "Aynı manuel olay UUID değeri tekrarlandı."));
      return;
    }
    eventIds.add(decoded.value.id);
    manualEvents.push(decoded.value);
  });
  const rawHidden = Array.isArray(value.hiddenProviderEventKeys)
    ? value.hiddenProviderEventKeys
    : [];
  if (!Array.isArray(value.hiddenProviderEventKeys) || rawHidden.length > MAX_HIDDEN_KEYS) {
    issues.push(issue("invalid_hidden_provider_keys", "releaseCalendar.hiddenProviderEventKeys", "Gizlenen provider olay listesi geçersiz veya limit üstünde."));
  }
  const hiddenProviderEventKeys = [...new Set(
    rawHidden
      .slice(0, MAX_HIDDEN_KEYS)
      .filter((entry): entry is string => {
        if (typeof entry === "string" && parseHiddenProviderEventKey(entry)) return true;
        issues.push(issue("invalid_hidden_provider_key", "releaseCalendar.hiddenProviderEventKeys", "Geçersiz provider event key yok sayıldı."));
        return false;
      }),
  )].sort((left, right) => left.localeCompare(right, "en"));
  return {
    ok: issues.length === 0,
    value: {
      version: MEDIA_RELEASE_CALENDAR_VERSION,
      manualEvents: manualEvents.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt, "en") || left.id.localeCompare(right.id, "en")),
      hiddenProviderEventKeys,
    },
    issues,
  };
}

function secureUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((entry) => entry.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("secure_uuid_unavailable");
}

function dataFor(media: MediaItem): MediaReleaseCalendarData {
  return decodeMediaReleaseCalendarData(media.releaseCalendar, media.id).value;
}

export function createManualReleaseEvent(
  media: MediaItem,
  input: ManualReleaseEventInput,
  options: { id?: string; now?: string } = {},
): { ok: true; item: MediaItem; event: ManualReleaseEvent } | {
  ok: false;
  issues: MediaReleaseCalendarCodecIssue[];
} {
  if (!isReleaseEligible(media)) {
    return {
      ok: false,
      issues: [issue("media_not_release_eligible", "media.status", "Completed veya dropped medya için manuel yayın eklenemez.")],
    };
  }
  const now = options.now ?? new Date().toISOString();
  const candidate = {
    id: options.id ?? secureUuid(),
    mediaId: media.id,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  const decoded = decodeManualEvent(candidate, media.id, 0);
  if (!decoded.value) return { ok: false, issues: decoded.issues };
  const current = dataFor(media);
  const existing = current.manualEvents.find((entry) => entry.id === decoded.value!.id);
  if (existing) {
    return JSON.stringify(existing) === JSON.stringify(decoded.value)
      ? { ok: true, item: media, event: existing }
      : { ok: false, issues: [issue("manual_event_id_conflict", "id", "Manuel olay UUID başka içerikle kullanılıyor.")] };
  }
  const releaseCalendar = {
    ...current,
    manualEvents: [...current.manualEvents, decoded.value],
  };
  return { ok: true, item: { ...media, releaseCalendar }, event: decoded.value };
}

export function updateManualReleaseEvent(
  media: MediaItem,
  eventId: string,
  input: ManualReleaseEventInput,
  now = new Date().toISOString(),
): { ok: true; item: MediaItem; event: ManualReleaseEvent } | {
  ok: false;
  issues: MediaReleaseCalendarCodecIssue[];
} {
  const current = dataFor(media);
  const existing = current.manualEvents.find((entry) => entry.id === eventId);
  if (!existing) {
    return { ok: false, issues: [issue("manual_event_missing", "id", "Düzenlenecek manuel olay bulunamadı.")] };
  }
  const decoded = decodeManualEvent({
    ...existing,
    ...input,
    id: existing.id,
    mediaId: existing.mediaId,
    createdAt: existing.createdAt,
    updatedAt: now,
  }, media.id, 0);
  if (!decoded.value) return { ok: false, issues: decoded.issues };
  return {
    ok: true,
    item: {
      ...media,
      releaseCalendar: {
        ...current,
        manualEvents: current.manualEvents.map((entry) =>
          entry.id === eventId ? decoded.value! : entry),
      },
    },
    event: decoded.value,
  };
}

export function deleteManualReleaseEvent(media: MediaItem, eventId: string): MediaItem {
  const current = dataFor(media);
  return {
    ...media,
    releaseCalendar: {
      ...current,
      manualEvents: current.manualEvents.filter((entry) => entry.id !== eventId),
    },
  };
}

export function hideProviderReleaseEvent(
  media: MediaItem,
  event: ReleaseEvent,
): { ok: true; item: MediaItem; key: string } | { ok: false; reason: "unstable_provider_event" } {
  const key = buildHiddenProviderEventKey(event);
  if (!key) return { ok: false, reason: "unstable_provider_event" };
  const current = dataFor(media);
  return {
    ok: true,
    item: {
      ...media,
      releaseCalendar: {
        ...current,
        hiddenProviderEventKeys: [...new Set([
          ...current.hiddenProviderEventKeys,
          key,
        ])].sort((left, right) => left.localeCompare(right, "en")),
      },
    },
    key,
  };
}

export function restoreProviderReleaseEvent(media: MediaItem, key: string): MediaItem {
  const current = dataFor(media);
  return {
    ...media,
    releaseCalendar: {
      ...current,
      hiddenProviderEventKeys: current.hiddenProviderEventKeys.filter((entry) => entry !== key),
    },
  };
}

export function isProviderReleaseEventHidden(media: MediaItem, event: ReleaseEvent): boolean {
  const key = buildHiddenProviderEventKey(event);
  return Boolean(key && dataFor(media).hiddenProviderEventKeys.includes(key));
}

export function manualReleaseEventsForMedia(media: MediaItem): ReleaseEvent[] {
  if (!isReleaseEligible(media)) return [];
  const season = media.type === "tv" ? resolveTvSeasonIdentity(media) : null;
  return dataFor(media).manualEvents.map((entry) => ({
    schemaVersion: 1,
    id: entry.id,
    mediaRecordId: media.id,
    mediaIdentityKey: media.identity?.key,
    type: "manual",
    title: entry.title,
    date: entry.schedule,
    origin: {
      kind: "manual",
      persistence: "persistent_user_data",
    },
    seasonIdentity: season?.status === "resolved" ? season.value : undefined,
  }));
}

export function remapMediaReleaseCalendar(
  data: MediaReleaseCalendarData | undefined,
  mediaId: string,
): MediaReleaseCalendarData | undefined {
  if (!data) return undefined;
  const decoded = decodeMediaReleaseCalendarData(data);
  return {
    ...decoded.value,
    manualEvents: decoded.value.manualEvents.map((entry) => ({ ...entry, mediaId })),
  };
}

