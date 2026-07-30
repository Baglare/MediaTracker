import {
  type MediaClassificationType,
  type MediaItem,
  type MediaSource,
  type MediaStatus,
  type MediaSubType,
  type MediaTheme,
  type MediaType,
  type ProgressLog,
  type ProgressLogAction,
  type ProgressLogUnit,
  type SeriesRelationType,
  withMediaClassification,
} from "./types";
import { withInferredSeriesGroup } from "./series-group";
import {
  decodeCanonicalMediaIdentity,
  ensureMediaIdentity,
  findExactIdentityCollisions,
  isMediaIdentityIssueCode,
  type MediaIdentityIssue,
} from "./media-identity";
import { decodeMediaReleaseCalendarData } from "../features/calendar/domain/manual-release-calendar";

export interface RecordCodecIssue {
  code: string;
  path: string;
  message: string;
}

export interface RecordCodecRepair extends RecordCodecIssue {
  previousValue?: unknown;
  nextValue?: unknown;
}

export type RecordDecodeResult<T> =
  | { status: "valid"; value: T; warnings: RecordCodecIssue[] }
  | { status: "repairable"; value: T; repairs: RecordCodecRepair[]; warnings: RecordCodecIssue[] }
  | { status: "invalid"; issues: RecordCodecIssue[] };

export interface RecordCollectionDecodeResult<T> {
  ok: boolean;
  records: T[];
  issues: Array<RecordCodecIssue & { recordIndex: number; recordId?: string }>;
  repairs: Array<RecordCodecRepair & { recordIndex: number; recordId?: string }>;
  warnings: Array<RecordCodecIssue & { recordIndex: number; recordId?: string }>;
}

const MEDIA_TYPES = new Set<MediaType>([
  "movie",
  "tv",
  "anime",
  "manga",
  "manhwa",
  "manhua",
  "book",
  "light_novel",
  "web_novel",
  "visual_novel",
]);
const MEDIA_STATUSES = new Set<MediaStatus>([
  "watching",
  "reading",
  "planning",
  "completed",
  "paused",
  "dropped",
]);
const MEDIA_SOURCES = new Set<MediaSource>([
  "manual",
  "tmdb",
  "tvmaze",
  "openlibrary",
  "anilist",
  "omdb",
]);
const MEDIA_THEMES = new Set<MediaTheme>(["east", "screen", "library"]);
const CLASSIFICATION_TYPES = new Set<MediaClassificationType>([
  "anime",
  "manga",
  "tv",
  "movie",
  "book",
  "novel",
]);
const MEDIA_SUB_TYPES = new Set<MediaSubType>([
  "anime_tv",
  "anime_movie",
  "ova",
  "ona",
  "special",
  "manga",
  "manhwa",
  "manhua",
  "tv_series",
  "movie",
  "book",
  "light_novel",
  "web_novel",
  "visual_novel",
  "serialized_novel",
]);
const SERIES_RELATION_TYPES = new Set<SeriesRelationType>([
  "main",
  "season",
  "movie",
  "ova",
  "ona",
  "special",
  "recap",
  "spin_off",
  "side_story",
  "adaptation",
  "source_material",
  "sequel",
  "prequel",
  "other",
]);
const PROGRESS_ACTIONS = new Set<ProgressLogAction>([
  "increment",
  "complete",
  "manual_adjust",
  "added",
]);
const PROGRESS_UNITS = new Set<ProgressLogUnit>(["episode", "chapter", "page", "movie"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): RecordCodecIssue {
  return { code, path, message };
}

function readRequiredString(
  raw: Record<string, unknown>,
  key: string,
  issues: RecordCodecIssue[],
): string | undefined {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(issue("invalid_required_string", key, `${key} boş olmayan bir metin olmalıdır.`));
    return undefined;
  }
  return value;
}

function readNumber(
  value: unknown,
  path: string,
  issues: RecordCodecIssue[],
  repairs: RecordCodecRepair[],
  options: { nonNegative?: boolean; integer?: boolean } = {},
): number | undefined {
  let normalized = value;
  if (typeof normalized === "string" && normalized.trim().length > 0) {
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      repairs.push({
        code: "legacy_numeric_string",
        path,
        message: `${path} legacy sayısal metinden sayıya dönüştürüldü.`,
        previousValue: normalized,
        nextValue: parsed,
      });
      normalized = parsed;
    }
  }
  if (typeof normalized !== "number" || !Number.isFinite(normalized)) {
    issues.push(issue("invalid_number", path, `${path} finite bir sayı olmalıdır.`));
    return undefined;
  }
  if (options.nonNegative && normalized < 0) {
    issues.push(issue("negative_number", path, `${path} negatif olamaz.`));
    return undefined;
  }
  if (options.integer && !Number.isInteger(normalized)) {
    issues.push(issue("non_integer_number", path, `${path} tam sayı olmalıdır.`));
    return undefined;
  }
  if (Object.is(normalized, -0)) {
    repairs.push({
      code: "negative_zero",
      path,
      message: `${path} negatif sıfırdan sıfıra normalleştirildi.`,
      previousValue: normalized,
      nextValue: 0,
    });
    return 0;
  }
  return normalized;
}

function copyOptionalString(
  raw: Record<string, unknown>,
  output: Record<string, unknown>,
  key: string,
  issues: RecordCodecIssue[],
): void {
  if (raw[key] === undefined) return;
  if (typeof raw[key] !== "string") {
    issues.push(issue("invalid_optional_string", key, `${key} metin olmalıdır.`));
    return;
  }
  output[key] = raw[key];
}

function copyOptionalNumber(
  raw: Record<string, unknown>,
  output: Record<string, unknown>,
  key: string,
  issues: RecordCodecIssue[],
  repairs: RecordCodecRepair[],
): void {
  if (raw[key] === undefined) return;
  const value = readNumber(raw[key], key, issues, repairs);
  if (value !== undefined) output[key] = value;
}

function copyOptionalStringArray(
  raw: Record<string, unknown>,
  output: Record<string, unknown>,
  key: string,
  issues: RecordCodecIssue[],
): void {
  if (raw[key] === undefined) return;
  if (!Array.isArray(raw[key]) || !(raw[key] as unknown[]).every((value) => typeof value === "string")) {
    issues.push(issue("invalid_string_array", key, `${key} yalnız metinlerden oluşan bir dizi olmalıdır.`));
    return;
  }
  output[key] = [...(raw[key] as string[])];
}

function readRating(
  value: unknown,
  path: string,
  issues: RecordCodecIssue[],
  repairs: RecordCodecRepair[],
): number | null | undefined {
  if (value === undefined || value === null) return value;
  const rating = readNumber(value, path, issues, repairs, { integer: true });
  if (rating === undefined) return undefined;
  if (rating < 0 || rating > 10) {
    issues.push(issue("invalid_rating", path, `${path} 0 ile 10 arasında olmalıdır.`));
    return undefined;
  }
  return rating;
}

export function decodeMediaItem(rawValue: unknown): RecordDecodeResult<MediaItem> {
  if (!isRecord(rawValue)) {
    return { status: "invalid", issues: [issue("not_an_object", "$", "Media kaydı bir obje olmalıdır.")] };
  }

  const raw = rawValue;
  const issues: RecordCodecIssue[] = [];
  const repairs: RecordCodecRepair[] = [];
  const warnings: RecordCodecIssue[] = [];
  const output: Record<string, unknown> = {};
  let invalidExternalSource = false;
  const persistedUnresolved = raw.identityStatus === "unresolved";
  if (persistedUnresolved) {
    output.identityStatus = "unresolved";
    output.identityIssueCodes = Array.isArray(raw.identityIssueCodes)
      ? raw.identityIssueCodes.filter(isMediaIdentityIssueCode)
      : ["IDENTITY_UNRESOLVED"];
  }

  const id = readRequiredString(raw, "id", issues);
  const title = readRequiredString(raw, "title", issues);
  const type = typeof raw.type === "string" && MEDIA_TYPES.has(raw.type as MediaType)
    ? raw.type as MediaType
    : undefined;
  if (!type) issues.push(issue("invalid_media_type", "type", "Bilinmeyen media type değeri."));
  const status = typeof raw.status === "string" && MEDIA_STATUSES.has(raw.status as MediaStatus)
    ? raw.status as MediaStatus
    : undefined;
  if (!status) issues.push(issue("invalid_media_status", "status", "Bilinmeyen media status değeri."));

  const currentSource = raw.currentProgress !== undefined ? "currentProgress" : "progress";
  const totalSource = raw.totalProgress !== undefined ? "totalProgress" : "total";
  if (currentSource === "progress" && raw.progress !== undefined) {
    repairs.push({
      code: "legacy_field_rename",
      path: "progress",
      message: "Legacy progress alanı currentProgress alanına taşındı.",
    });
  }
  if (totalSource === "total" && raw.total !== undefined) {
    repairs.push({
      code: "legacy_field_rename",
      path: "total",
      message: "Legacy total alanı totalProgress alanına taşındı.",
    });
  }
  const currentProgress = readNumber(
    raw[currentSource],
    "currentProgress",
    issues,
    repairs,
    { nonNegative: true },
  );
  const totalProgress = readNumber(
    raw[totalSource],
    "totalProgress",
    issues,
    repairs,
    { nonNegative: true },
  );

  if (id !== undefined) output.id = id;
  if (title !== undefined) output.title = title;
  if (type !== undefined) output.type = type;
  if (status !== undefined) output.status = status;
  if (currentProgress !== undefined) output.currentProgress = currentProgress;
  if (totalProgress !== undefined) output.totalProgress = totalProgress;

  if (typeof raw.coverImage === "string") {
    output.coverImage = raw.coverImage;
  } else if (type) {
    output.coverImage = `/placeholders/${type}.svg`;
    repairs.push({
      code: "missing_cover_fallback",
      path: "coverImage",
      message: "Eksik coverImage güvenli placeholder ile tamamlandı.",
      nextValue: output.coverImage,
    });
  } else {
    issues.push(issue("invalid_cover_image", "coverImage", "coverImage metin olmalıdır."));
  }

  if (raw.favorite === undefined) {
    output.favorite = false;
    repairs.push({
      code: "missing_optional_default",
      path: "favorite",
      message: "Eksik favorite alanı false olarak tamamlandı.",
      nextValue: false,
    });
  } else if (typeof raw.favorite === "boolean") {
    output.favorite = raw.favorite;
  } else {
    issues.push(issue("invalid_boolean", "favorite", "favorite boolean olmalıdır."));
  }

  const rating = readRating(raw.rating, "rating", issues, repairs);
  if (rating !== undefined) output.rating = rating;
  let userRating = readRating(raw.userRating, "userRating", issues, repairs);
  if (raw.userRating === undefined && typeof rating === "number") {
    userRating = rating;
    repairs.push({
      code: "legacy_rating_alias",
      path: "rating",
      message: "Legacy rating değeri userRating alanına taşındı.",
      previousValue: rating,
      nextValue: rating,
    });
  }
  if (userRating !== undefined) output.userRating = userRating;

  copyOptionalString(raw, output, "personalNotes", issues);
  copyOptionalString(raw, output, "externalId", issues);
  copyOptionalString(raw, output, "imdbId", issues);
  copyOptionalString(raw, output, "originalTitle", issues);
  copyOptionalString(raw, output, "overview", issues);
  copyOptionalString(raw, output, "backdropUrl", issues);
  copyOptionalString(raw, output, "tvmazeStatus", issues);
  copyOptionalString(raw, output, "tmdbStatus", issues);
  copyOptionalString(raw, output, "lastAirDate", issues);
  copyOptionalString(raw, output, "nextAirDate", issues);
  copyOptionalString(raw, output, "networkName", issues);
  copyOptionalString(raw, output, "language", issues);
  copyOptionalString(raw, output, "nativeTitle", issues);
  copyOptionalString(raw, output, "countryOfOrigin", issues);
  copyOptionalString(raw, output, "anilistStatus", issues);
  copyOptionalString(raw, output, "format", issues);
  copyOptionalString(raw, output, "siteUrl", issues);
  copyOptionalString(raw, output, "seriesGroupId", issues);
  copyOptionalString(raw, output, "seriesGroupTitle", issues);

  copyOptionalNumber(raw, output, "releaseYear", issues, repairs);
  copyOptionalNumber(raw, output, "runtime", issues, repairs);
  copyOptionalNumber(raw, output, "numberOfSeasons", issues, repairs);
  copyOptionalNumber(raw, output, "numberOfEpisodes", issues, repairs);
  copyOptionalNumber(raw, output, "pageCount", issues, repairs);
  copyOptionalNumber(raw, output, "editionCount", issues, repairs);
  copyOptionalNumber(raw, output, "episodes", issues, repairs);
  copyOptionalNumber(raw, output, "chapters", issues, repairs);
  copyOptionalNumber(raw, output, "volumes", issues, repairs);
  copyOptionalNumber(raw, output, "averageScore", issues, repairs);
  copyOptionalNumber(raw, output, "popularity", issues, repairs);
  copyOptionalNumber(raw, output, "seasonNumber", issues, repairs);
  copyOptionalNumber(raw, output, "orderIndex", issues, repairs);

  copyOptionalStringArray(raw, output, "tags", issues);
  copyOptionalStringArray(raw, output, "genres", issues);
  copyOptionalStringArray(raw, output, "authors", issues);
  copyOptionalStringArray(raw, output, "languages", issues);
  copyOptionalStringArray(raw, output, "subjects", issues);
  copyOptionalStringArray(raw, output, "isbn", issues);

  if (raw.externalSource !== undefined) {
    if (typeof raw.externalSource === "string" && MEDIA_SOURCES.has(raw.externalSource as MediaSource)) {
      output.externalSource = raw.externalSource;
    } else {
      invalidExternalSource = true;
      output.identityStatus = "unresolved";
      output.identityIssueCodes = ["IDENTITY_INVALID_SOURCE"];
      warnings.push(issue(
        "IDENTITY_INVALID_SOURCE",
        "externalSource",
        "Bilinmeyen externalSource korundu; sahte V2 identity uretilmedi.",
      ));
    }
  }
  if (raw.theme !== undefined) {
    if (typeof raw.theme === "string" && MEDIA_THEMES.has(raw.theme as MediaTheme)) output.theme = raw.theme;
    else issues.push(issue("invalid_theme", "theme", "Bilinmeyen theme değeri."));
  }
  if (raw.mediaType !== undefined) {
    if (typeof raw.mediaType === "string" && CLASSIFICATION_TYPES.has(raw.mediaType as MediaClassificationType)) {
      output.mediaType = raw.mediaType;
    } else {
      issues.push(issue("invalid_classification_type", "mediaType", "Bilinmeyen mediaType değeri."));
    }
  }
  if (raw.subType !== undefined) {
    if (typeof raw.subType === "string" && MEDIA_SUB_TYPES.has(raw.subType as MediaSubType)) {
      output.subType = raw.subType;
    } else {
      issues.push(issue("invalid_sub_type", "subType", "Bilinmeyen subType değeri."));
    }
  }
  if (raw.seriesRelationType !== undefined) {
    if (
      typeof raw.seriesRelationType === "string"
      && SERIES_RELATION_TYPES.has(raw.seriesRelationType as SeriesRelationType)
    ) {
      output.seriesRelationType = raw.seriesRelationType;
    } else {
      issues.push(issue("invalid_series_relation", "seriesRelationType", "Bilinmeyen seri ilişki tipi."));
    }
  }

  if (raw.metadata !== undefined) {
    if (isRecord(raw.metadata)) output.metadata = { ...raw.metadata };
    else issues.push(issue("invalid_metadata", "metadata", "metadata bir obje olmalıdır."));
  }
  if (raw.releaseCalendar !== undefined) {
    const decodedReleaseCalendar = decodeMediaReleaseCalendarData(
      raw.releaseCalendar,
      id,
    );
    output.releaseCalendar = decodedReleaseCalendar.value;
    const mappedIssues = decodedReleaseCalendar.issues.map((entry) => ({
      code: entry.code,
      path: entry.path,
      message: entry.message,
    }));
    warnings.push(...mappedIssues.filter((entry) =>
      entry.code === "invalid_hidden_provider_key"
      || entry.code === "invalid_hidden_provider_keys"));
    issues.push(...mappedIssues.filter((entry) =>
      entry.code !== "invalid_hidden_provider_key"
      && entry.code !== "invalid_hidden_provider_keys"));
  }
  if (raw.seasonBreakdown !== undefined) {
    if (
      Array.isArray(raw.seasonBreakdown)
      && raw.seasonBreakdown.every((entry) =>
        isRecord(entry)
        && Number.isInteger(entry.season)
        && (entry.season as number) >= 0
        && Number.isInteger(entry.episodes)
        && (entry.episodes as number) >= 0
      )
    ) {
      output.seasonBreakdown = raw.seasonBreakdown.map((entry) => ({ ...entry }));
    } else {
      issues.push(issue("invalid_season_breakdown", "seasonBreakdown", "Geçersiz sezon kırılımı."));
    }
  }
  if (raw.nextAiringEpisode !== undefined) {
    if (
      isRecord(raw.nextAiringEpisode)
      && (raw.nextAiringEpisode.episode === undefined || Number.isFinite(raw.nextAiringEpisode.episode))
      && (raw.nextAiringEpisode.airingAt === undefined || Number.isFinite(raw.nextAiringEpisode.airingAt))
    ) {
      output.nextAiringEpisode = { ...raw.nextAiringEpisode };
    } else {
      issues.push(issue("invalid_next_airing_episode", "nextAiringEpisode", "Geçersiz sonraki bölüm bilgisi."));
    }
  }
  if (raw.anilistRelations !== undefined) {
    if (Array.isArray(raw.anilistRelations) && raw.anilistRelations.every(isRecord)) {
      output.anilistRelations = raw.anilistRelations.map((entry) => ({ ...entry }));
    } else {
      issues.push(issue("invalid_anilist_relations", "anilistRelations", "AniList relations dizi olmalıdır."));
    }
  }

  if (issues.length > 0) return { status: "invalid", issues };

  const identityRecord = output as unknown as MediaItem;
  if (raw.identity !== undefined) {
    const decodedIdentity = decodeCanonicalMediaIdentity(raw.identity, id);
    if (decodedIdentity.status === "valid") {
      identityRecord.identity = decodedIdentity.value;
      delete identityRecord.identityStatus;
      delete identityRecord.identityIssueCodes;
    } else if (decodedIdentity.status === "repairable") {
      identityRecord.identity = decodedIdentity.value;
      delete identityRecord.identityStatus;
      delete identityRecord.identityIssueCodes;
      repairs.push({
        code: decodedIdentity.issue.code,
        path: "identity.key",
        message: decodedIdentity.issue.evidence,
        previousValue: decodedIdentity.issue.currentIdentity,
        nextValue: decodedIdentity.issue.expectedIdentity,
      });
    } else if (!invalidExternalSource) {
      warnings.push(identityIssueToCodec(decodedIdentity.issue));
      identityRecord.identityStatus = "unresolved";
      identityRecord.identityIssueCodes = [decodedIdentity.issue.code];
    } else {
      warnings.push(identityIssueToCodec(decodedIdentity.issue));
    }
  } else if (!invalidExternalSource && !persistedUnresolved) {
    const repaired = ensureMediaIdentity(identityRecord);
    if (repaired.item.identity) {
      identityRecord.identity = repaired.item.identity;
      repairs.push(...repaired.issues.map((entry) => ({
        code: entry.code,
        path: "identity",
        message: entry.evidence,
        nextValue: repaired.item.identity,
      })));
    } else {
      warnings.push(...repaired.issues.map(identityIssueToCodec));
      identityRecord.identityStatus = "unresolved";
      identityRecord.identityIssueCodes = repaired.issues.map((entry) => entry.code);
    }
  }

  const classified = withMediaClassification(identityRecord);
  if (output.theme === undefined || output.mediaType === undefined || output.subType === undefined) {
    repairs.push({
      code: "classification_inferred",
      path: "classification",
      message: "Eksik media classification mevcut saf helper ile türetildi.",
    });
  }
  const grouped = withInferredSeriesGroup(classified);
  if (classified.seriesGroupId === undefined && grouped.seriesGroupId !== undefined) {
    repairs.push({
      code: "legacy_series_group_inferred",
      path: "seriesGroupId",
      message: "Legacy seri grubu mevcut saf helper ile türetildi.",
    });
  }

  return repairs.length > 0
    ? { status: "repairable", value: grouped, repairs, warnings }
    : { status: "valid", value: grouped, warnings };
}

function identityIssueToCodec(entry: MediaIdentityIssue): RecordCodecIssue {
  return issue(entry.code, "identity", entry.evidence);
}

function defaultUnit(mediaType: MediaType): ProgressLogUnit {
  if (mediaType === "movie" || mediaType === "visual_novel") return "movie";
  if (mediaType === "book") return "page";
  if (
    mediaType === "manga"
    || mediaType === "manhwa"
    || mediaType === "manhua"
    || mediaType === "light_novel"
    || mediaType === "web_novel"
  ) return "chapter";
  return "episode";
}

function mediaTypeFromUnit(unit: ProgressLogUnit): MediaType {
  if (unit === "movie") return "movie";
  if (unit === "page") return "book";
  if (unit === "chapter") return "manga";
  return "tv";
}

export function decodeProgressLog(rawValue: unknown): RecordDecodeResult<ProgressLog> {
  if (!isRecord(rawValue)) {
    return { status: "invalid", issues: [issue("not_an_object", "$", "Progress log bir obje olmalıdır.")] };
  }
  const raw = rawValue;
  const issues: RecordCodecIssue[] = [];
  const repairs: RecordCodecRepair[] = [];
  const id = readRequiredString(raw, "id", issues);
  const mediaId = readRequiredString(raw, "mediaId", issues);

  const action = typeof raw.action === "string" && PROGRESS_ACTIONS.has(raw.action as ProgressLogAction)
    ? raw.action as ProgressLogAction
    : undefined;
  if (!action) issues.push(issue("invalid_progress_action", "action", "Bilinmeyen progress action değeri."));

  let unit = typeof raw.unit === "string" && PROGRESS_UNITS.has(raw.unit as ProgressLogUnit)
    ? raw.unit as ProgressLogUnit
    : undefined;
  let mediaType = typeof raw.mediaType === "string" && MEDIA_TYPES.has(raw.mediaType as MediaType)
    ? raw.mediaType as MediaType
    : undefined;
  if (!mediaType && unit) {
    mediaType = mediaTypeFromUnit(unit);
    repairs.push({
      code: "missing_snapshot_type",
      path: "mediaType",
      message: "Eksik snapshot mediaType, progress unit üzerinden tamamlandı.",
      nextValue: mediaType,
    });
  }
  if (!mediaType) issues.push(issue("invalid_media_type", "mediaType", "Progress log mediaType geçersiz."));
  if (!unit && mediaType) {
    unit = defaultUnit(mediaType);
    repairs.push({
      code: "missing_progress_unit",
      path: "unit",
      message: "Eksik progress unit mediaType üzerinden tamamlandı.",
      nextValue: unit,
    });
  }
  if (!unit) issues.push(issue("invalid_progress_unit", "unit", "Progress log unit geçersiz."));

  let mediaTitle: string;
  if (typeof raw.mediaTitle === "string" && raw.mediaTitle.trim().length > 0) {
    mediaTitle = raw.mediaTitle;
  } else {
    mediaTitle = "Bilinmeyen medya";
    repairs.push({
      code: "missing_snapshot_title",
      path: "mediaTitle",
      message: "Eksik snapshot başlığı güvenli fallback ile tamamlandı.",
      nextValue: mediaTitle,
    });
  }

  const previousProgress = readNumber(
    raw.previousProgress,
    "previousProgress",
    issues,
    repairs,
    { nonNegative: true },
  );
  const newProgress = readNumber(
    raw.newProgress,
    "newProgress",
    issues,
    repairs,
    { nonNegative: true },
  );
  let amount: number | undefined;
  if (raw.amount === undefined && previousProgress !== undefined && newProgress !== undefined) {
    amount = Math.abs(newProgress - previousProgress);
    repairs.push({
      code: "missing_progress_amount",
      path: "amount",
      message: "Eksik amount ilerleme farkından türetildi.",
      nextValue: amount,
    });
  } else {
    amount = readNumber(raw.amount, "amount", issues, repairs, { nonNegative: true });
  }

  const createdAt = typeof raw.createdAt === "string" && Number.isFinite(Date.parse(raw.createdAt))
    ? raw.createdAt
    : undefined;
  if (!createdAt) issues.push(issue("invalid_created_at", "createdAt", "createdAt geçerli bir tarih olmalıdır."));
  if (raw.detail !== undefined && typeof raw.detail !== "string") {
    issues.push(issue("invalid_detail", "detail", "detail metin olmalıdır."));
  }

  if (issues.length > 0 || !id || !mediaId || !mediaType || !unit || !action
    || previousProgress === undefined || newProgress === undefined || amount === undefined || !createdAt) {
    return { status: "invalid", issues };
  }

  const value: ProgressLog = {
    id,
    mediaId,
    mediaTitle,
    mediaType,
    action,
    amount,
    unit,
    previousProgress,
    newProgress,
    createdAt,
  };
  if (typeof raw.detail === "string") value.detail = raw.detail;
  return repairs.length > 0
    ? { status: "repairable", value, repairs, warnings: [] }
    : { status: "valid", value, warnings: [] };
}

function decodeCollection<T>(
  values: unknown[],
  decode: (value: unknown) => RecordDecodeResult<T>,
): RecordCollectionDecodeResult<T> {
  const records: T[] = [];
  const issues: RecordCollectionDecodeResult<T>["issues"] = [];
  const repairs: RecordCollectionDecodeResult<T>["repairs"] = [];
  const warnings: RecordCollectionDecodeResult<T>["warnings"] = [];
  values.forEach((value, recordIndex) => {
    const result = decode(value);
    const recordId = isRecord(value) && typeof value.id === "string" ? value.id : undefined;
    if (result.status === "invalid") {
      issues.push(...result.issues.map((entry) => ({ ...entry, recordIndex, recordId })));
      return;
    }
    records.push(result.value);
    warnings.push(...result.warnings.map((entry) => ({ ...entry, recordIndex, recordId })));
    if (result.status === "repairable") {
      repairs.push(...result.repairs.map((entry) => ({ ...entry, recordIndex, recordId })));
    }
  });
  return { ok: issues.length === 0, records, issues, repairs, warnings };
}

export function decodeMediaItems(values: unknown[]): RecordCollectionDecodeResult<MediaItem> {
  const decoded = decodeCollection(values, decodeMediaItem);
  const recordIndexes = new Map(decoded.records.map((entry, index) => [entry.id, index]));
  decoded.warnings.push(...findExactIdentityCollisions(decoded.records).map((entry) => ({
    ...identityIssueToCodec(entry),
    recordIndex: recordIndexes.get(entry.recordId ?? "") ?? 0,
    recordId: entry.recordId,
  })));
  return decoded;
}

export function decodeProgressLogs(values: unknown[]): RecordCollectionDecodeResult<ProgressLog> {
  return decodeCollection(values, decodeProgressLog);
}
