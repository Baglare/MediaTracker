// ============================================
// MediaItem ↔ media_items / ProgressLog ↔ progress_logs Mapping
// ============================================
// Yerel uygulama tipleri ile Supabase tablo satırları arasında çevrim.
// Kaynak-spesifik alanlar (TVmaze/AniList/OpenLibrary) `metadata` jsonb içine yazılır,
// okurken yerel objenin üstüne yayılır.

import {
  MediaItem,
  MediaSource,
  MediaStatus,
  MediaType,
  ProgressLog,
  ProgressLogAction,
  ProgressLogUnit,
  withMediaClassification,
} from "../types";
import { withInferredSeriesGroup } from "../series-group";
import type { Database, Json } from "./types";
import { ensureMediaIdentity } from "../media-identity";

type MediaItemRow = Database["public"]["Tables"]["media_items"]["Row"];
type MediaItemInsert = Database["public"]["Tables"]["media_items"]["Insert"];
type ProgressLogRow = Database["public"]["Tables"]["progress_logs"]["Row"];
type ProgressLogInsert = Database["public"]["Tables"]["progress_logs"]["Insert"];

// Metadata'ya yazılacak alanların whitelist'i (raw spread yerine explicit).
// Bilinmeyen/runtime'da gelen alanlar metadata'ya sızmaz.
const METADATA_KEYS = [
  "rating",
  "theme",
  "mediaType",
  "subType",
  "runtime",
  "numberOfSeasons",
  "numberOfEpisodes",
  "seasonBreakdown",
  "seriesGroupId",
  "seriesGroupTitle",
  "seriesRelationType",
  "seasonNumber",
  "orderIndex",
  "tvmazeStatus",
  "tmdbStatus",
  "lastAirDate",
  "nextAirDate",
  "genres",
  "networkName",
  "language",
  "authors",
  "pageCount",
  "editionCount",
  "languages",
  "subjects",
  "isbn",
  "imdbId",
  "originalTitle",
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
  "anilistRelations",
  "releaseCalendar",
] as const satisfies readonly (keyof MediaItem)[];

// ---- MediaItem → media_items row ----
export function toMediaRow(userId: string, item: MediaItem): MediaItemInsert {
  const classifiedItem = withMediaClassification(withInferredSeriesGroup(item));

  // Sadece whitelist'teki alanları metadata'ya kopyala
  const metadata: Record<string, unknown> = {};
  for (const key of METADATA_KEYS) {
    const value = classifiedItem[key];
    if (value === undefined) continue;
    metadata[key] = value;
  }

  return {
    id: classifiedItem.id,
    user_id: userId,
    title: classifiedItem.title,
    type: classifiedItem.type,
    status: classifiedItem.status,
    current_progress: classifiedItem.currentProgress,
    total_progress: classifiedItem.totalProgress,
    external_source: classifiedItem.externalSource ?? null,
    external_id: classifiedItem.externalId ?? null,
    cover_url: classifiedItem.coverImage || null,
    backdrop_url: classifiedItem.backdropUrl ?? null,
    overview: classifiedItem.overview ?? null,
    release_year: classifiedItem.releaseYear ?? null,
    favorite: !!classifiedItem.favorite,
    user_rating: classifiedItem.userRating ?? null,
    tags: classifiedItem.tags ?? [],
    personal_notes: classifiedItem.personalNotes ?? null,
    metadata: metadata as Json,
  };
}

// ---- media_items row → MediaItem ----
export function fromMediaRow(row: MediaItemRow): MediaItem {
  const rawMeta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  // Sadece whitelist'teki metadata alanlarını al (yabancı alanlar sızmasın)
  const meta: Partial<MediaItem> = {};
  for (const key of METADATA_KEYS) {
    if (key in rawMeta) {
      // güvenli atama: explicit cast
      (meta as Record<string, unknown>)[key] = rawMeta[key];
    }
  }

  // coverImage zorunlu alan: cover_url null ise placeholder kullan
  const coverImage =
    row.cover_url && row.cover_url.length > 0
      ? row.cover_url
      : `/placeholders/${row.type}.svg`;

  const item = withMediaClassification(withInferredSeriesGroup({
    id: row.id,
    title: row.title,
    type: row.type as MediaType,
    status: row.status as MediaStatus,
    coverImage,
    currentProgress: row.current_progress,
    totalProgress: row.total_progress,
    favorite: row.favorite,
    userRating: row.user_rating,
    tags: row.tags,
    personalNotes: row.personal_notes ?? undefined,
    externalSource: (row.external_source as MediaSource | null) ?? undefined,
    externalId: row.external_id ?? undefined,
    backdropUrl: row.backdrop_url ?? undefined,
    overview: row.overview ?? undefined,
    releaseYear: row.release_year ?? undefined,
    ...meta,
  }));
  return ensureMediaIdentity(item, {
    legacyRecordId: !item.externalSource && !item.externalId ? row.id : undefined,
  }).item;
}

// ---- ProgressLog → progress_logs row ----
// `detail` kolonu progress_logs'a gönderilmez (tabloda yok).
export function toProgressLogRow(userId: string, log: ProgressLog): ProgressLogInsert {
  return {
    id: log.id,
    user_id: userId,
    media_id: log.mediaId || null,
    media_title: log.mediaTitle,
    media_type: log.mediaType,
    action: log.action,
    amount: log.amount,
    unit: log.unit,
    previous_progress: log.previousProgress,
    new_progress: log.newProgress,
    created_at: log.createdAt,
  };
}

// ---- progress_logs row → ProgressLog ----
// `detail` cloud'dan gelmez; yerel-only alandır.
export function fromProgressLogRow(row: ProgressLogRow): ProgressLog {
  return {
    id: row.id,
    mediaId: row.media_id ?? "",
    mediaTitle: row.media_title,
    mediaType: row.media_type as MediaType,
    action: row.action as ProgressLogAction,
    amount: row.amount,
    unit: row.unit as ProgressLogUnit,
    previousProgress: row.previous_progress,
    newProgress: row.new_progress,
    createdAt: row.created_at,
  };
}
