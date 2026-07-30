import {
  getCanonicalMediaIdentity,
  parseCanonicalMediaKeyV2,
  type CanonicalMediaIdentityV2,
} from "@/lib/media-identity";
import {
  getTvmazeSeasonNumber,
  getTvmazeShowExternalId,
} from "@/lib/series-group";
import type {
  MediaItem,
  MediaReleaseSchedule,
  MediaSource,
  MediaStatus,
} from "@/lib/types";

export const RELEASE_EVENT_SCHEMA_VERSION = 1 as const;

export type ReleaseEventType =
  | "episode"
  | "season_premiere"
  | "movie_release"
  | "publication"
  | "manual";

export type ReleaseDatePrecision = MediaReleaseSchedule;

type AutomaticReleaseProvider = Exclude<MediaSource, "manual">;

export type ReleaseEventOrigin =
  | {
      kind: "provider";
      provider: AutomaticReleaseProvider;
      providerEventId: string;
      persistence: "reproducible_cache";
    }
  | {
      kind: "manual";
      persistence: "persistent_user_data";
    };

export type MovieReleaseType = "theatrical" | "digital" | "general";

export interface ReleaseEventMetadata {
  releaseType?: MovieReleaseType;
  region?: string;
  episodeName?: string;
}

export type TvSeasonIdentityBasis =
  | "explicit_season_number"
  | "canonical_provider_identity"
  | "series_group"
  | "tvmaze_external_id";

export interface TvSeasonIdentity {
  key: string;
  seasonNumber: number;
  basis: TvSeasonIdentityBasis;
  canonicalKey?: string;
  seriesGroupId?: string;
  providerSource?: AutomaticReleaseProvider;
  providerShowId?: string;
}

export interface ReleaseEvent {
  schemaVersion: 1;
  id: string;
  mediaRecordId: string;
  mediaIdentityKey?: string;
  type: ReleaseEventType;
  title: string;
  date: ReleaseDatePrecision;
  origin: ReleaseEventOrigin;
  seasonIdentity?: TvSeasonIdentity;
  episodeNumber?: number;
  metadata?: ReleaseEventMetadata;
}

export type ReleaseEligibilityReason =
  | "tracked"
  | "completed"
  | "dropped"
  | "unsupported_status";

export interface ReleaseEligibilityResult {
  eligible: boolean;
  reason: ReleaseEligibilityReason;
}

export interface ReleaseEligibilityPolicy {
  readonly trackedStatuses: ReadonlySet<MediaStatus>;
  evaluate(item: Pick<MediaItem, "status">): ReleaseEligibilityResult;
}

const TRACKED_RELEASE_STATUSES = new Set<MediaStatus>([
  "watching",
  "reading",
  "planning",
  "paused",
]);

export const releaseEligibilityPolicy: ReleaseEligibilityPolicy = {
  trackedStatuses: TRACKED_RELEASE_STATUSES,
  evaluate(item) {
    if (TRACKED_RELEASE_STATUSES.has(item.status)) {
      return { eligible: true, reason: "tracked" };
    }
    if (item.status === "completed") {
      return { eligible: false, reason: "completed" };
    }
    if (item.status === "dropped") {
      return { eligible: false, reason: "dropped" };
    }
    return { eligible: false, reason: "unsupported_status" };
  },
};

export function isReleaseEligible(
  item: Pick<MediaItem, "status">,
): boolean {
  return releaseEligibilityPolicy.evaluate(item).eligible;
}

export function selectReleaseEligibleMedia(
  items: readonly MediaItem[],
): MediaItem[] {
  return items.filter(isReleaseEligible);
}

export type TvSeasonIdentityResolution =
  | { status: "resolved"; value: TvSeasonIdentity }
  | {
      status: "unresolved";
      reason:
        | "not_tv"
        | "season_number_missing"
        | "season_number_conflict"
        | "structured_identity_missing";
    };

function positiveInteger(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value > 0
    ? value
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function encodeIdentityPart(value: string): string {
  return encodeURIComponent(value);
}

function tvmazeSeasonFromIdentity(
  identity: CanonicalMediaIdentityV2 | null,
): { showId: string; seasonNumber: number } | null {
  if (
    !identity
    || identity.source !== "tvmaze"
    || identity.namespace !== "season"
    || !identity.externalId
  ) {
    return null;
  }
  const match = identity.externalId.match(/^([1-9]\d*)-season-([1-9]\d*)$/);
  if (!match) return null;
  return {
    showId: match[1],
    seasonNumber: Number.parseInt(match[2], 10),
  };
}

function tvmazeSeasonFromExternalId(
  item: Pick<MediaItem, "externalSource" | "externalId">,
): { showId: string; seasonNumber: number } | null {
  if (item.externalSource !== "tvmaze" || typeof item.externalId !== "string") {
    return null;
  }
  const match = item.externalId.trim().match(/^([1-9]\d*)-season-([1-9]\d*)$/i);
  if (!match) return null;
  return {
    showId: match[1],
    seasonNumber: Number.parseInt(match[2], 10),
  };
}

/**
 * Takvim sezon kimliği yalnız yapılandırılmış alanlardan çözülür.
 * Bu fonksiyon title/originalTitle veya serbest metin regex'i kullanmaz.
 */
export function resolveTvSeasonIdentity(
  item: Pick<
    MediaItem,
    | "id"
    | "type"
    | "identity"
    | "externalSource"
    | "externalId"
    | "seriesGroupId"
    | "seasonNumber"
  >,
): TvSeasonIdentityResolution {
  if (item.type !== "tv") {
    return { status: "unresolved", reason: "not_tv" };
  }

  const identity = getCanonicalMediaIdentity(item);
  const canonicalTvmazeSeason = tvmazeSeasonFromIdentity(identity);
  const externalTvmazeSeason = tvmazeSeasonFromExternalId(item);
  const explicitSeason = positiveInteger(item.seasonNumber);
  const tvmazeSeason = positiveInteger(getTvmazeSeasonNumber(item));

  if (
    explicitSeason !== null
    && canonicalTvmazeSeason
    && explicitSeason !== canonicalTvmazeSeason.seasonNumber
  ) {
    return { status: "unresolved", reason: "season_number_conflict" };
  }
  if (
    explicitSeason !== null
    && externalTvmazeSeason
    && explicitSeason !== externalTvmazeSeason.seasonNumber
  ) {
    return { status: "unresolved", reason: "season_number_conflict" };
  }

  const seasonNumber =
    explicitSeason
    ?? canonicalTvmazeSeason?.seasonNumber
    ?? externalTvmazeSeason?.seasonNumber
    ?? tvmazeSeason;
  if (seasonNumber === null || seasonNumber === undefined) {
    return { status: "unresolved", reason: "season_number_missing" };
  }

  const canonicalKey = identity?.key;
  const seriesGroupId = nonEmpty(item.seriesGroupId) ?? undefined;
  const tvmazeShowId =
    canonicalTvmazeSeason?.showId
    ?? externalTvmazeSeason?.showId
    ?? getTvmazeShowExternalId(item);

  if (tvmazeShowId) {
    return {
      status: "resolved",
      value: {
        key: `tv-season:tvmaze:${encodeIdentityPart(tvmazeShowId)}:${seasonNumber}`,
        seasonNumber,
        basis: "tvmaze_external_id",
        canonicalKey,
        seriesGroupId,
        providerSource: "tvmaze",
        providerShowId: tvmazeShowId,
      },
    };
  }

  if (identity && identity.source !== "manual" && identity.source !== "legacy") {
    return {
      status: "resolved",
      value: {
        key: `tv-season:canonical:${encodeIdentityPart(identity.key)}:${seasonNumber}`,
        seasonNumber,
        basis: "canonical_provider_identity",
        canonicalKey: identity.key,
        seriesGroupId,
        providerSource: identity.source,
        providerShowId: identity.externalId,
      },
    };
  }

  if (seriesGroupId) {
    return {
      status: "resolved",
      value: {
        key: `tv-season:group:${encodeIdentityPart(seriesGroupId)}:${seasonNumber}`,
        seasonNumber,
        basis: "series_group",
        canonicalKey,
        seriesGroupId,
      },
    };
  }

  if (explicitSeason !== null) {
    return {
      status: "resolved",
      value: {
        key: `tv-season:record:${encodeIdentityPart(item.id)}:${seasonNumber}`,
        seasonNumber,
        basis: "explicit_season_number",
        canonicalKey,
      },
    };
  }

  return { status: "unresolved", reason: "structured_identity_missing" };
}

export interface ReleaseProviderContext {
  media: MediaItem;
  seasonIdentity?: TvSeasonIdentity;
}

export interface ReleaseProviderFetchRequest {
  mediaRecordId: string;
  mediaIdentityKey?: string;
  seasonIdentity?: TvSeasonIdentity;
}

export interface ReleaseProvider<TPayload = unknown> {
  readonly id: AutomaticReleaseProvider;
  supports(context: ReleaseProviderContext): boolean;
  fetchEvents(request: ReleaseProviderFetchRequest): Promise<TPayload>;
  normalize(
    payload: TPayload,
    context: ReleaseProviderContext,
  ): ReleaseEventDecodeResult[];
}

export interface ReleaseEventCodecIssue {
  code: string;
  path: string;
  message: string;
}

export type ReleaseEventDecodeResult =
  | { status: "valid"; value: ReleaseEvent }
  | { status: "invalid"; issues: ReleaseEventCodecIssue[] };

export interface ReleaseEventCollectionDecodeResult {
  ok: boolean;
  records: ReleaseEvent[];
  issues: Array<ReleaseEventCodecIssue & { recordIndex: number; recordId?: string }>;
}

const RELEASE_EVENT_TYPES = new Set<ReleaseEventType>([
  "episode",
  "season_premiere",
  "movie_release",
  "publication",
  "manual",
]);
const AUTOMATIC_PROVIDERS = new Set<AutomaticReleaseProvider>([
  "tmdb",
  "tvmaze",
  "openlibrary",
  "anilist",
  "omdb",
]);
const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "id",
  "mediaRecordId",
  "mediaIdentityKey",
  "type",
  "title",
  "date",
  "origin",
  "seasonIdentity",
  "episodeNumber",
  "metadata",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codecIssue(
  code: string,
  path: string,
  message: string,
): ReleaseEventCodecIssue {
  return { code, path, message };
}

function isTvSeasonIdentityBasis(value: unknown): value is TvSeasonIdentityBasis {
  return value === "explicit_season_number"
    || value === "canonical_provider_identity"
    || value === "series_group"
    || value === "tvmaze_external_id";
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDateOnly(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (
    year < 1
    || year > 9999
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
  ) {
    return null;
  }
  return { year, month, day };
}

function decodeReleaseDate(
  value: unknown,
  issues: ReleaseEventCodecIssue[],
): ReleaseDatePrecision | null {
  if (!isRecord(value) || typeof value.precision !== "string") {
    issues.push(codecIssue("invalid_date", "date", "Yayın tarihi precision nesnesi olmalıdır."));
    return null;
  }
  switch (value.precision) {
    case "exact_datetime": {
      if (
        typeof value.dateTime !== "string"
        || !/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.dateTime)
        || !parseDateOnly(value.dateTime.slice(0, 10))
        || !Number.isFinite(Date.parse(value.dateTime))
      ) {
        issues.push(codecIssue(
          "invalid_exact_datetime",
          "date.dateTime",
          "Kesin tarih saat, timezone içeren geçerli ISO-8601 olmalıdır.",
        ));
        return null;
      }
      return { precision: "exact_datetime", dateTime: value.dateTime };
    }
    case "date_only":
      if (!parseDateOnly(value.date)) {
        issues.push(codecIssue(
          "invalid_date_only",
          "date.date",
          "Date-only değer geçerli YYYY-MM-DD olmalıdır.",
        ));
        return null;
      }
      return { precision: "date_only", date: value.date as string };
    case "month_only":
      if (
        typeof value.month !== "string"
        || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
      ) {
        issues.push(codecIssue(
          "invalid_month_only",
          "date.month",
          "Month-only değer geçerli YYYY-MM olmalıdır.",
        ));
        return null;
      }
      return { precision: "month_only", month: value.month };
    case "year_only":
      if (
        typeof value.year !== "number"
        || !Number.isInteger(value.year)
        || value.year < 1
        || value.year > 9999
      ) {
        issues.push(codecIssue(
          "invalid_year_only",
          "date.year",
          "Year-only değer geçerli bir takvim yılı olmalıdır.",
        ));
        return null;
      }
      return { precision: "year_only", year: value.year };
    case "tba":
      return { precision: "tba" };
    default:
      issues.push(codecIssue(
        "unknown_date_precision",
        "date.precision",
        "Yayın tarihi precision değeri desteklenmiyor.",
      ));
      return null;
  }
}

export function decodeReleaseSchedule(
  value: unknown,
): { ok: true; value: ReleaseDatePrecision } | {
  ok: false;
  issues: ReleaseEventCodecIssue[];
} {
  const issues: ReleaseEventCodecIssue[] = [];
  const decoded = decodeReleaseDate(value, issues);
  return decoded && issues.length === 0
    ? { ok: true, value: decoded }
    : { ok: false, issues };
}

function decodeOrigin(
  value: unknown,
  issues: ReleaseEventCodecIssue[],
): ReleaseEventOrigin | null {
  if (!isRecord(value)) {
    issues.push(codecIssue("invalid_origin", "origin", "Event origin nesnesi gereklidir."));
    return null;
  }
  if (value.kind === "manual") {
    if (value.persistence !== "persistent_user_data") {
      issues.push(codecIssue(
        "invalid_manual_persistence",
        "origin.persistence",
        "Manuel olay kalıcı kullanıcı verisi olarak işaretlenmelidir.",
      ));
      return null;
    }
    return { kind: "manual", persistence: "persistent_user_data" };
  }
  if (
    value.kind === "provider"
    && typeof value.provider === "string"
    && AUTOMATIC_PROVIDERS.has(value.provider as AutomaticReleaseProvider)
    && typeof value.providerEventId === "string"
    && value.providerEventId.trim().length > 0
    && value.persistence === "reproducible_cache"
  ) {
    return {
      kind: "provider",
      provider: value.provider as AutomaticReleaseProvider,
      providerEventId: value.providerEventId,
      persistence: "reproducible_cache",
    };
  }
  issues.push(codecIssue(
    "invalid_provider_origin",
    "origin",
    "Provider olayları allowlist provider ve reproducible_cache semantiği taşımalıdır.",
  ));
  return null;
}

function decodeSeasonIdentity(
  value: unknown,
  issues: ReleaseEventCodecIssue[],
): TvSeasonIdentity | null {
  if (!isRecord(value)) {
    issues.push(codecIssue(
      "invalid_season_identity",
      "seasonIdentity",
      "TV sezon kimliği yapılandırılmış bir nesne olmalıdır.",
    ));
    return null;
  }
  const seasonNumber = positiveInteger(value.seasonNumber);
  const key = nonEmpty(value.key);
  if (!seasonNumber || !key || !isTvSeasonIdentityBasis(value.basis)) {
    issues.push(codecIssue(
      "invalid_season_identity",
      "seasonIdentity",
      "TV sezon kimliği key, pozitif seasonNumber ve geçerli basis taşımalıdır.",
    ));
    return null;
  }
  const basis = value.basis;
  const keySeason = key.match(/:(\d+)$/)?.[1];
  if (
    !/^tv-season:(?:tvmaze|canonical|group|record):.+:\d+$/.test(key)
    || keySeason !== String(seasonNumber)
  ) {
    issues.push(codecIssue(
      "season_identity_key_mismatch",
      "seasonIdentity.key",
      "TV sezon key değeri seasonNumber ile eşleşen yapılandırılmış formatta olmalıdır.",
    ));
    return null;
  }
  const canonicalKey = nonEmpty(value.canonicalKey) ?? undefined;
  if (canonicalKey && !parseCanonicalMediaKeyV2(canonicalKey)) {
    issues.push(codecIssue(
      "invalid_season_canonical_key",
      "seasonIdentity.canonicalKey",
      "Sezon canonical key değeri geçerli Canonical Identity V2 olmalıdır.",
    ));
    return null;
  }
  const providerSource =
    typeof value.providerSource === "string"
    && AUTOMATIC_PROVIDERS.has(value.providerSource as AutomaticReleaseProvider)
      ? value.providerSource as AutomaticReleaseProvider
      : undefined;
  return {
    key,
    seasonNumber,
    basis,
    canonicalKey,
    seriesGroupId: nonEmpty(value.seriesGroupId) ?? undefined,
    providerSource,
    providerShowId: nonEmpty(value.providerShowId) ?? undefined,
  };
}

function decodeMetadata(
  value: unknown,
  issues: ReleaseEventCodecIssue[],
): ReleaseEventMetadata | null {
  if (!isRecord(value)) {
    issues.push(codecIssue(
      "invalid_metadata",
      "metadata",
      "Release event metadata nesne olmalıdır.",
    ));
    return null;
  }
  const allowed = new Set(["releaseType", "region", "episodeName"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(codecIssue(
        "unknown_metadata_field",
        `metadata.${key}`,
        `Bilinmeyen release metadata alanı: ${key}`,
      ));
    }
  }
  const releaseType =
    value.releaseType === "theatrical"
    || value.releaseType === "digital"
    || value.releaseType === "general"
      ? value.releaseType
      : undefined;
  if (value.releaseType !== undefined && releaseType === undefined) {
    issues.push(codecIssue(
      "invalid_release_type",
      "metadata.releaseType",
      "Film yayın türü desteklenmiyor.",
    ));
  }
  const region = nonEmpty(value.region)?.toUpperCase();
  if (region && !/^[A-Z]{2}$/.test(region)) {
    issues.push(codecIssue(
      "invalid_release_region",
      "metadata.region",
      "Film yayın bölgesi iki harfli ISO region olmalıdır.",
    ));
  }
  const episodeName = nonEmpty(value.episodeName) ?? undefined;
  if (episodeName && episodeName.length > 200) {
    issues.push(codecIssue(
      "invalid_episode_name",
      "metadata.episodeName",
      "Episode adı 200 karakteri aşamaz.",
    ));
  }
  return {
    releaseType,
    region: region && /^[A-Z]{2}$/.test(region) ? region : undefined,
    episodeName: episodeName?.slice(0, 200),
  };
}

export function decodeReleaseEvent(value: unknown): ReleaseEventDecodeResult {
  const issues: ReleaseEventCodecIssue[] = [];
  if (!isRecord(value)) {
    return {
      status: "invalid",
      issues: [codecIssue("invalid_event", "", "Release event bir nesne olmalıdır.")],
    };
  }
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      issues.push(codecIssue("unknown_field", key, `Bilinmeyen release event alanı: ${key}`));
    }
  }
  const id = nonEmpty(value.id);
  const mediaRecordId = nonEmpty(value.mediaRecordId);
  const title = nonEmpty(value.title);
  if (!id) issues.push(codecIssue("invalid_id", "id", "Event id boş olmayan metin olmalıdır."));
  if (!mediaRecordId) {
    issues.push(codecIssue(
      "invalid_media_record_id",
      "mediaRecordId",
      "Event media record id taşımalıdır.",
    ));
  }
  if (!title) {
    issues.push(codecIssue("invalid_title", "title", "Event title boş olmayan metin olmalıdır."));
  }
  if (
    typeof value.type !== "string"
    || !RELEASE_EVENT_TYPES.has(value.type as ReleaseEventType)
  ) {
    issues.push(codecIssue("invalid_event_type", "type", "Event türü desteklenmiyor."));
  }
  if (value.schemaVersion !== RELEASE_EVENT_SCHEMA_VERSION) {
    issues.push(codecIssue(
      "unsupported_event_version",
      "schemaVersion",
      "Release event schema version desteklenmiyor.",
    ));
  }
  const date = decodeReleaseDate(value.date, issues);
  const origin = decodeOrigin(value.origin, issues);
  const mediaIdentityKey = nonEmpty(value.mediaIdentityKey) ?? undefined;
  if (mediaIdentityKey && !parseCanonicalMediaKeyV2(mediaIdentityKey)) {
    issues.push(codecIssue(
      "invalid_media_identity",
      "mediaIdentityKey",
      "Event media identity geçerli Canonical Identity V2 olmalıdır.",
    ));
  }
  const episodeNumber = value.episodeNumber === undefined
    ? undefined
    : positiveInteger(value.episodeNumber) ?? undefined;
  if (value.episodeNumber !== undefined && episodeNumber === undefined) {
    issues.push(codecIssue(
      "invalid_episode_number",
      "episodeNumber",
      "Episode number pozitif tam sayı olmalıdır.",
    ));
  }
  const seasonIdentity = value.seasonIdentity === undefined
    ? undefined
    : decodeSeasonIdentity(value.seasonIdentity, issues) ?? undefined;
  const metadata = value.metadata === undefined
    ? undefined
    : decodeMetadata(value.metadata, issues) ?? undefined;
  if (
    typeof value.type === "string"
    && RELEASE_EVENT_TYPES.has(value.type as ReleaseEventType)
    && origin
    && ((value.type === "manual") !== (origin.kind === "manual"))
  ) {
    issues.push(codecIssue(
      "event_origin_type_mismatch",
      "origin",
      "Manual event türü yalnız persistent manual origin ile kullanılabilir.",
    ));
  }

  if (issues.length > 0 || !id || !mediaRecordId || !title || !date || !origin) {
    return { status: "invalid", issues };
  }
  return {
    status: "valid",
    value: {
      schemaVersion: RELEASE_EVENT_SCHEMA_VERSION,
      id,
      mediaRecordId,
      mediaIdentityKey,
      type: value.type as ReleaseEventType,
      title,
      date,
      origin,
      seasonIdentity,
      episodeNumber,
      metadata,
    },
  };
}

export function decodeReleaseEvents(
  value: unknown,
): ReleaseEventCollectionDecodeResult {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      records: [],
      issues: [{
        ...codecIssue("invalid_event_collection", "", "Release event listesi array olmalıdır."),
        recordIndex: -1,
      }],
    };
  }
  const records: ReleaseEvent[] = [];
  const issues: ReleaseEventCollectionDecodeResult["issues"] = [];
  value.forEach((entry, recordIndex) => {
    const decoded = decodeReleaseEvent(entry);
    if (decoded.status === "valid") {
      records.push(decoded.value);
      return;
    }
    const recordId = isRecord(entry) && typeof entry.id === "string"
      ? entry.id
      : undefined;
    issues.push(...decoded.issues.map((entryIssue) => ({
      ...entryIssue,
      recordIndex,
      recordId,
    })));
  });
  return { ok: issues.length === 0, records, issues };
}

export interface ReleaseAgenda {
  today: ReleaseEvent[];
  next7Days: ReleaseEvent[];
  next30Days: ReleaseEvent[];
  later: ReleaseEvent[];
  tba: ReleaseEvent[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function releaseSortKey(event: ReleaseEvent): string {
  switch (event.date.precision) {
    case "exact_datetime":
      return `${event.date.dateTime.slice(0, 10)}:0:${event.date.dateTime}`;
    case "date_only":
      return `${event.date.date}:1`;
    case "month_only":
      return `${event.date.month}-00:2`;
    case "year_only":
      return `${String(event.date.year).padStart(4, "0")}-00-00:3`;
    case "tba":
      return "~~~~:4";
  }
}

export function compareReleaseEvents(
  left: ReleaseEvent,
  right: ReleaseEvent,
): number {
  return compareText(releaseSortKey(left), releaseSortKey(right))
    || compareText(left.mediaRecordId, right.mediaRecordId)
    || compareText(left.type, right.type)
    || compareText(left.id, right.id);
}

export function sortReleaseEvents(
  events: readonly ReleaseEvent[],
): ReleaseEvent[] {
  return [...events].sort(compareReleaseEvents);
}

export interface ReleaseCalendarSelectorOptions {
  timeZone?: string;
}

function exactDateInTimeZone(dateTime: string, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(dateTime));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function getReleaseEventCalendarDate(
  event: ReleaseEvent,
  options: ReleaseCalendarSelectorOptions = {},
): string | null {
  if (event.date.precision === "date_only") return event.date.date;
  if (event.date.precision === "exact_datetime") {
    return options.timeZone
      ? exactDateInTimeZone(event.date.dateTime, options.timeZone)
      : event.date.dateTime.slice(0, 10);
  }
  return null;
}

// Sivil takvim tarihini Date/UTC dönüşümü yapmadan monoton gün sayısına çevirir.
function civilDayNumber(value: string): number | null {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const adjustedYear = parsed.month <= 2 ? parsed.year - 1 : parsed.year;
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const monthPrime = parsed.month + (parsed.month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + parsed.day - 1;
  const dayOfEra =
    yearOfEra * 365
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
    + dayOfYear;
  return era * 146097 + dayOfEra;
}

export function selectReleaseAgenda(
  events: readonly ReleaseEvent[],
  today: string,
  options: ReleaseCalendarSelectorOptions = {},
): ReleaseAgenda {
  const todayDay = civilDayNumber(today);
  if (todayDay === null) {
    throw new RangeError("today geçerli YYYY-MM-DD olmalıdır.");
  }
  const agenda: ReleaseAgenda = {
    today: [],
    next7Days: [],
    next30Days: [],
    later: [],
    tba: [],
  };
  for (const event of sortReleaseEvents(events)) {
    const calendarDate = getReleaseEventCalendarDate(event, options);
    if (!calendarDate) {
      agenda.tba.push(event);
      continue;
    }
    const eventDay = civilDayNumber(calendarDate);
    if (eventDay === null) continue;
    const difference = eventDay - todayDay;
    if (difference === 0) agenda.today.push(event);
    else if (difference >= 1 && difference <= 7) agenda.next7Days.push(event);
    else if (difference >= 8 && difference <= 30) agenda.next30Days.push(event);
    else if (difference >= 31 && difference <= 90) agenda.later.push(event);
  }
  return agenda;
}

export function isReleaseEventForMedia(
  item: MediaItem,
  event: ReleaseEvent,
): boolean {
  if (!isReleaseEligible(item) || event.mediaRecordId !== item.id) return false;
  if (item.type !== "tv") return true;
  const season = resolveTvSeasonIdentity(item);
  return season.status === "resolved"
    && event.seasonIdentity?.key === season.value.key
    && event.seasonIdentity.seasonNumber === season.value.seasonNumber;
}

export function selectReleaseEventsForMedia(
  item: MediaItem,
  events: readonly ReleaseEvent[],
): ReleaseEvent[] {
  return sortReleaseEvents(events.filter((event) => isReleaseEventForMedia(item, event)));
}

export function selectTodayReleaseEvents(
  events: readonly ReleaseEvent[],
  today: string,
  options: ReleaseCalendarSelectorOptions = {},
): ReleaseEvent[] {
  return selectReleaseAgenda(events, today, options).today;
}

export function selectNext7DayReleaseEvents(
  events: readonly ReleaseEvent[],
  today: string,
  options: ReleaseCalendarSelectorOptions = {},
): ReleaseEvent[] {
  return selectReleaseAgenda(events, today, options).next7Days;
}

export function selectNext30DayReleaseEvents(
  events: readonly ReleaseEvent[],
  today: string,
  options: ReleaseCalendarSelectorOptions = {},
): ReleaseEvent[] {
  return selectReleaseAgenda(events, today, options).next30Days;
}

export function selectLaterReleaseEvents(
  events: readonly ReleaseEvent[],
  today: string,
  options: ReleaseCalendarSelectorOptions = {},
): ReleaseEvent[] {
  return selectReleaseAgenda(events, today, options).later;
}

export function selectTbaReleaseEvents(
  events: readonly ReleaseEvent[],
): ReleaseEvent[] {
  return sortReleaseEvents(events).filter(
    (event) => getReleaseEventCalendarDate(event) === null,
  );
}

export function selectReleaseEventsForMonth(
  events: readonly ReleaseEvent[],
  month: string,
  options: ReleaseCalendarSelectorOptions = {},
): ReleaseEvent[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError("month geçerli YYYY-MM olmalıdır.");
  }
  return sortReleaseEvents(events).filter((event) => {
    if (event.date.precision === "month_only") return event.date.month === month;
    const calendarDate = getReleaseEventCalendarDate(event, options);
    return calendarDate?.slice(0, 7) === month;
  });
}
