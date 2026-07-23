// ============================================
// Yedekleme (Backup) Yardımcı Fonksiyonları
// ============================================
// Medya listesini JSON olarak dışa aktarma (export)
// ve içe aktarma (import) işlemlerini yönetir.

import { MediaItem, ProgressLog, withMediaClassification } from "./types";
import { withInferredSeriesGroup } from "./series-group";
import { decodeMediaItem, decodeMediaItems, decodeProgressLogs } from "./local-data-codec";

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

  const decodedItems = decodeMediaItems(data.mediaItems);
  if (!decodedItems.ok) {
    const first = decodedItems.issues[0];
    return {
      valid: false,
      error: `Backup media kaydı doğrulanamadı (kayıt ${first.recordIndex + 1}, ${first.path}).`,
    };
  }

  if (data.progressLogs !== undefined && !Array.isArray(data.progressLogs)) {
    return { valid: false, error: "Backup dosyasında 'progressLogs' dizi olmalıdır." };
  }
  const decodedLogs = decodeProgressLogs(Array.isArray(data.progressLogs) ? data.progressLogs : []);
  if (!decodedLogs.ok) {
    const first = decodedLogs.issues[0];
    return {
      valid: false,
      error: `Backup progress log doğrulanamadı (kayıt ${first.recordIndex + 1}, ${first.path}).`,
    };
  }

  return { valid: true, items: decodedItems.records, logs: decodedLogs.records };
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
  const decoded = decodeMediaItem(item);
  if (decoded.status === "invalid") {
    throw new Error(`Geçersiz MediaItem: ${decoded.issues.map((entry) => entry.path).join(", ")}`);
  }
  return decoded.value;
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
