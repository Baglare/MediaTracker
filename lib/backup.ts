// ============================================
// Yedekleme (Backup) Yardımcı Fonksiyonları
// ============================================
// Medya listesini JSON olarak dışa aktarma (export)
// ve içe aktarma (import) işlemlerini yönetir.

import { MediaItem, ProgressLog, withMediaClassification } from "./types";
import { withInferredSeriesGroup } from "./series-group";

const VALID_MEDIA_TYPES = new Set<MediaItem["type"]>([
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

const VALID_MEDIA_STATUSES = new Set<MediaItem["status"]>([
  "watching",
  "reading",
  "planning",
  "completed",
  "paused",
  "dropped",
]);

// ---- Export Yapısı ----

/** Backup JSON dosyasının yapısı */
export interface BackupPayload {
  appName: string;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  data: {
    mediaItems: MediaItem[];
    progressLogs?: ProgressLog[];
  };
}

/**
 * Medya listesinden export edilecek backup objesi oluşturur.
 */
export function createBackupPayload(mediaItems: MediaItem[], progressLogs: ProgressLog[] = []): BackupPayload {
  return {
    appName: "MediaTracker",
    appVersion: "0.1.0",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: {
      mediaItems: mediaItems.map((item) => withMediaClassification(withInferredSeriesGroup(item))),
      progressLogs,
    },
  };
}

// ---- Import Doğrulama ----

/** Import sonucu */
export interface ImportResult {
  success: boolean;
  message: string;
  items?: MediaItem[];
  logs?: ProgressLog[];
  addedCount?: number;
  skippedCount?: number;
}

export type BackupImportMode = "merge" | "replace";

export interface ResolvedBackupImport {
  items: MediaItem[];
  logs: ProgressLog[];
  message: string;
  addedCount: number;
  skippedCount: number;
}

export function parseBackupJson(
  text: string
): { valid: true; items: MediaItem[]; logs: ProgressLog[] } | { valid: false; error: string } {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { valid: false, error: "Geçersiz JSON dosyası. Dosya bozuk olabilir." };
  }
  return validateBackupPayload(payload);
}

/**
 * Backup JSON'ının geçerli olup olmadığını kontrol eder.
 * Geçerliyse mediaItems dizisini döner, değilse hata mesajı döner.
 */
export function validateBackupPayload(
  payload: unknown
): { valid: true; items: MediaItem[]; logs: ProgressLog[] } | { valid: false; error: string } {
  // null/undefined kontrolü
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Geçersiz JSON verisi." };
  }

  const obj = payload as Record<string, unknown>;

  // appName kontrolü (opsiyonel ama faydalı)
  if (obj.appName && obj.appName !== "MediaTracker") {
    return { valid: false, error: "Bu dosya MediaTracker backup formatında değil." };
  }

  // data objesi kontrolü
  if (!obj.data || typeof obj.data !== "object") {
    return { valid: false, error: "Backup dosyasında 'data' alanı bulunamadı." };
  }

  const data = obj.data as Record<string, unknown>;

  // mediaItems array kontrolü
  if (!Array.isArray(data.mediaItems)) {
    return { valid: false, error: "Backup dosyasında 'mediaItems' dizisi bulunamadı." };
  }

  // Her item'ın en azından id ve title alanına sahip olduğunu kontrol et
  const normalizedItems = data.mediaItems
    .filter((item): item is Partial<MediaItem> => {
      if (!item || typeof item !== "object") return false;
      const title = (item as { title?: unknown }).title;
      return typeof title === "string" && title.trim().length > 0;
    })
    .map(normalizeImportedMediaItem);

  // progressLogs array kontrolü
  let normalizedLogs: ProgressLog[] = [];
  if (Array.isArray(data.progressLogs)) {
    normalizedLogs = data.progressLogs as ProgressLog[];
  }

  return { valid: true, items: normalizedItems, logs: normalizedLogs };
}

/**
 * Benzersiz bir kimlik (ID) oluşturur.
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Import edilen bir MediaItem'ı güvenli hale getirir.
 * Eksik veya hatalı alanlar için varsayılan değerler atar.
 */
export function normalizeImportedMediaItem(item: Partial<MediaItem>): MediaItem {
  const type = typeof item.type === "string" && VALID_MEDIA_TYPES.has(item.type)
    ? item.type
    : "movie";
  const status = typeof item.status === "string" && VALID_MEDIA_STATUSES.has(item.status)
    ? item.status
    : "planning";

  // userRating doğrulama: 0-10 arası tam sayı olmalı
  let userRating: number | null | undefined = item.userRating;
  if (userRating !== null && userRating !== undefined) {
    userRating = Math.round(userRating);
    if (isNaN(userRating) || userRating < 0 || userRating > 10) {
      userRating = null;
    }
  }

  // tags: boş stringleri ve duplicate'leri temizle
  const tags: string[] = [];
  if (Array.isArray(item.tags)) {
    const seen = new Set<string>();
    for (const tag of item.tags) {
      const trimmed = String(tag).trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !seen.has(lower)) {
        seen.add(lower);
        tags.push(trimmed);
      }
    }
  }

  // Array alanlarını temizle (boş stringleri kaldır)
  const cleanStringArray = (arr?: unknown[]): string[] | undefined => {
    if (!Array.isArray(arr)) return undefined;
    const cleaned = arr.map((v) => String(v).trim()).filter((v) => v.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  };

  // totalProgress güvenliği
  const totalProgress = Math.max(1, Number(item.totalProgress) || 1);
  const currentProgress = Math.max(0, Math.min(Number(item.currentProgress) || 0, totalProgress));

  return withMediaClassification({
    id: typeof item.id === "string" && item.id.trim().length > 0 ? item.id : generateId(),
    title: typeof item.title === "string" ? item.title.trim() : "İsimsiz",
    type,
    theme: item.theme,
    mediaType: item.mediaType,
    subType: item.subType,
    status,
    coverImage: typeof item.coverImage === "string" && item.coverImage.length > 0
      ? item.coverImage
      : `/placeholders/${type}.svg`,
    currentProgress,
    totalProgress,

    // Kişisel alanlar
    userRating: userRating ?? null,
    favorite: Boolean(item.favorite),
    tags,
    personalNotes: item.personalNotes ? String(item.personalNotes) : "",

    // Eski alanları koru
    rating: item.rating,
    externalSource: item.externalSource,
    externalId: item.externalId,
    overview: item.overview,
    releaseYear: item.releaseYear,
    backdropUrl: item.backdropUrl,
    runtime: item.runtime,
    numberOfSeasons: item.numberOfSeasons,
    numberOfEpisodes: item.numberOfEpisodes,
    tvmazeStatus: item.tvmazeStatus,
    tmdbStatus: item.tmdbStatus,
    lastAirDate: item.lastAirDate,
    nextAirDate: item.nextAirDate,
    genres: cleanStringArray(item.genres),
    networkName: item.networkName,
    language: item.language,
    authors: cleanStringArray(item.authors),
    pageCount: item.pageCount,
    editionCount: item.editionCount,
    languages: cleanStringArray(item.languages),
    subjects: cleanStringArray(item.subjects),
    isbn: cleanStringArray(item.isbn),
    nativeTitle: item.nativeTitle,
    episodes: item.episodes,
    chapters: item.chapters,
    volumes: item.volumes,
    countryOfOrigin: item.countryOfOrigin,
    anilistStatus: item.anilistStatus,
    format: item.format,
    averageScore: item.averageScore,
    popularity: item.popularity,
    siteUrl: item.siteUrl,
    nextAiringEpisode: item.nextAiringEpisode,
    seriesGroupId: item.seriesGroupId,
    seriesGroupTitle: item.seriesGroupTitle,
    seriesRelationType: item.seriesRelationType,
    seasonNumber: item.seasonNumber,
    orderIndex: item.orderIndex,
  });
}

/**
 * Import edilen öğeleri mevcut listeyle birleştirir (merge).
 * Duplicate kontrolü: externalSource+externalId veya id ile yapılır.
 */
export function mergeImportedMediaItems(
  currentItems: MediaItem[],
  importedItems: MediaItem[],
  currentLogs: ProgressLog[] = [],
  importedLogs: ProgressLog[] = []
): ImportResult {
  const normalizedCurrentItems = currentItems.map((item) =>
    withMediaClassification(withInferredSeriesGroup(item))
  );
  const normalizedImportedItems = importedItems.map((item) =>
    withMediaClassification(withInferredSeriesGroup(item))
  );

  // Mevcut ID ve externalId'leri topla
  const existingIds = new Set(normalizedCurrentItems.map((m) => m.id));
  const existingExternalKeys = new Set(
    normalizedCurrentItems
      .filter((m) => m.externalSource && m.externalId)
      .map((m) => `${m.externalSource}:${m.externalId}`)
  );

  const toAdd: MediaItem[] = [];
  let skippedCount = 0;

  for (const item of normalizedImportedItems) {
    // externalSource+externalId ile duplicate kontrolü
    if (item.externalSource && item.externalId) {
      const key = `${item.externalSource}:${item.externalId}`;
      if (existingExternalKeys.has(key)) {
        skippedCount++;
        continue;
      }
    }

    // id ile duplicate kontrolü
    if (existingIds.has(item.id)) {
      // Aynı ID varsa yeni bir ID ata
      item.id = generateId();
    }

    toAdd.push(item);
    existingIds.add(item.id);
    if (item.externalSource && item.externalId) {
      existingExternalKeys.add(`${item.externalSource}:${item.externalId}`);
    }
  }

  const merged = [...normalizedCurrentItems, ...toAdd];

  // Merge logs
  const existingLogIds = new Set(currentLogs.map((l) => l.id));
  const toAddLogs: ProgressLog[] = [];

  for (const log of importedLogs) {
    if (!existingLogIds.has(log.id)) {
      toAddLogs.push(log);
      existingLogIds.add(log.id);
    }
  }

  const mergedLogs = [...currentLogs, ...toAddLogs];

  return {
    success: true,
    message: `${toAdd.length} içerik içe aktarıldı${skippedCount > 0 ? `, ${skippedCount} tekrar atlandı` : ""}. ${toAddLogs.length} aktivite eklendi.`,
    items: merged,
    logs: mergedLogs,
    addedCount: toAdd.length,
    skippedCount,
  };
}

/**
 * Doğrulanmış import verisini seçilen moda göre saf biçimde hazırlar.
 * localStorage'a yazmaz; çağıran UI mevcut onay akışını koruyarak sonucu uygular.
 */
export function resolveBackupImport(args: {
  mode: BackupImportMode;
  currentItems: MediaItem[];
  importedItems: MediaItem[];
  currentLogs?: ProgressLog[];
  importedLogs?: ProgressLog[];
}): ResolvedBackupImport {
  const currentLogs = args.currentLogs ?? [];
  const importedLogs = args.importedLogs ?? [];

  if (args.mode === "replace") {
    return {
      items: args.importedItems,
      logs: importedLogs,
      message: `${args.importedItems.length} içerik ile liste değiştirildi.`,
      addedCount: args.importedItems.length,
      skippedCount: 0,
    };
  }

  const merged = mergeImportedMediaItems(
    args.currentItems,
    args.importedItems,
    currentLogs,
    importedLogs
  );
  return {
    items: merged.items ?? args.currentItems,
    logs: merged.logs ?? currentLogs,
    message: merged.message,
    addedCount: merged.addedCount ?? 0,
    skippedCount: merged.skippedCount ?? 0,
  };
}
