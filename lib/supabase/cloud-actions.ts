// ============================================
// Cloud Actions — UI bağımsız aktarım fonksiyonları
// ============================================
// CloudTransferPanel ve CloudDataStatusCard tarafından paylaşılır.
// UI tarafı confirm/banner/busy state'i kendi yönetir;
// burada sadece veri akışı + hesaplama var.

import { MediaItem, ProgressLog, withMediaClassification } from "../types";
import {
  fetchCloudMediaItems,
  fetchCloudProgressLogs,
  uploadMediaItems,
  uploadProgressLogs,
} from "./cloud-repository";

export type CloudActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type CloudDownloadResult =
  | { ok: true; message: string; mediaItems: MediaItem[]; progressLogs: ProgressLog[] }
  | { ok: false; message: string };

export type CloudMergeResult =
  | {
      ok: true;
      message: string;
      mediaItems: MediaItem[];
      progressLogs: ProgressLog[];
      stats: { mediaAdded: number; mediaSkipped: number; logsAdded: number; logsSkipped: number };
    }
  | { ok: false; message: string };

function dedupKey(item: MediaItem): string {
  if (item.externalSource && item.externalId) {
    return `ext:${item.externalSource}:${item.externalId}`;
  }
  return `id:${item.id}`;
}

// ---- Upload (Yerel → Cloud) ----
export async function performCloudUpload(
  userId: string,
  mediaItems: MediaItem[],
  progressLogs: ProgressLog[]
): Promise<CloudActionResult> {
  const m = await uploadMediaItems(userId, mediaItems.map((item) => withMediaClassification(item)));
  if (!m.ok) return { ok: false, message: m.error };
  const p = await uploadProgressLogs(userId, progressLogs);
  if (!p.ok) return { ok: false, message: p.error };
  return {
    ok: true,
    message: `${m.data.count} içerik ve ${p.data.count} aktivite kaydı cloud'a aktarıldı.`,
  };
}

// ---- Download (Cloud → Yerel, replace) ----
export async function performCloudDownload(userId: string): Promise<CloudDownloadResult> {
  const m = await fetchCloudMediaItems(userId);
  if (!m.ok) return { ok: false, message: m.error };
  const p = await fetchCloudProgressLogs(userId);
  if (!p.ok) return { ok: false, message: p.error };
  return {
    ok: true,
    mediaItems: m.data.map((item) => withMediaClassification(item)),
    progressLogs: p.data,
    message: `Aktarım tamamlandı. ${m.data.length} içerik ve ${p.data.length} aktivite kaydı yerele alındı.`,
  };
}

// ---- Merge (Cloud + Yerel) ----
export async function performCloudMerge(
  userId: string,
  localMedia: MediaItem[],
  localLogs: ProgressLog[]
): Promise<CloudMergeResult> {
  const m = await fetchCloudMediaItems(userId);
  if (!m.ok) return { ok: false, message: m.error };
  const p = await fetchCloudProgressLogs(userId);
  if (!p.ok) return { ok: false, message: p.error };

  // ---- Media merge: yerel öncelikli, cloud-only olanları ekle ----
  const normalizedLocalMedia = localMedia.map((item) => withMediaClassification(item));
  const normalizedCloudMedia = m.data.map((item) => withMediaClassification(item));
  const localKeys = new Set(normalizedLocalMedia.map(dedupKey));
  const localIds = new Set(normalizedLocalMedia.map((it) => it.id));
  let mediaAdded = 0;
  let mediaSkipped = 0;
  const mergedMedia = [...normalizedLocalMedia];
  for (const cloudItem of normalizedCloudMedia) {
    const key = dedupKey(cloudItem);
    if (localKeys.has(key) || localIds.has(cloudItem.id)) {
      mediaSkipped++;
      continue;
    }
    mergedMedia.push(cloudItem);
    localKeys.add(key);
    localIds.add(cloudItem.id);
    mediaAdded++;
  }

  // ---- Log merge: id bazlı dedup ----
  const localLogIds = new Set(localLogs.map((l) => l.id));
  let logsAdded = 0;
  let logsSkipped = 0;
  const mergedLogs = [...localLogs];
  for (const cloudLog of p.data) {
    if (localLogIds.has(cloudLog.id)) {
      logsSkipped++;
      continue;
    }
    mergedLogs.push(cloudLog);
    localLogIds.add(cloudLog.id);
    logsAdded++;
  }
  mergedLogs.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return {
    ok: true,
    mediaItems: mergedMedia,
    progressLogs: mergedLogs,
    stats: { mediaAdded, mediaSkipped, logsAdded, logsSkipped },
    message:
      `Birleştirme tamamlandı. ` +
      `İçerik: +${mediaAdded} eklendi, ${mediaSkipped} atlandı. ` +
      `Aktivite: +${logsAdded} eklendi, ${logsSkipped} atlandı.`,
  };
}
