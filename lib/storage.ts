// ============================================
// localStorage Yardımcı Fonksiyonları
// ============================================
// Medya listesini tarayıcının yerel deposuna (localStorage) kaydeder
// ve oradan okur. Böylece sayfa yenilenince veriler kaybolmaz.

import { MediaItem, ProgressLog, withMediaClassification } from "./types";
import { withInferredSeriesGroup } from "./series-group";

// localStorage'da kullanılan anahtar ismi
const STORAGE_KEY = "media-tracker-list";

/**
 * localStorage'dan medya listesini okur.
 * Eğer kayıtlı veri yoksa null döner.
 * Eğer veri bozuksa (parse edilemezse) null döner.
 */
export function loadMediaList(): MediaItem[] | null {
  // Sunucu tarafında (SSR) çalışıyorsa localStorage yoktur
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Kayıtlı veri yoksa null dön
    if (!saved) return null;
    // JSON metnini diziye çevir ve döndür
    const parsed = JSON.parse(saved) as MediaItem[];
    // Geçerli bir dizi mi kontrol et
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => withMediaClassification(withInferredSeriesGroup(item)));
  } catch {
    // Veri bozuksa veya parse hatası olursa null dön
    return null;
  }
}

/**
 * Medya listesini localStorage'a kaydeder.
 */
export function saveMediaList(list: MediaItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.map((item) => withMediaClassification(withInferredSeriesGroup(item))))
    );
  } catch {
    // localStorage dolu veya erişilemezse sessizce geç
    console.warn("localStorage'a kaydedilemedi.");
  }
}

/**
 * localStorage'daki medya verisini tamamen siler.
 * "Mock verilere sıfırla" fonksiyonunda kullanılır.
 */
export function clearMediaList(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================
// Progress Logs Yardımcı Fonksiyonları
// ============================================

const LOGS_STORAGE_KEY = "media-tracker-logs";

/**
 * localStorage'dan logları okur.
 */
export function loadProgressLogs(): ProgressLog[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(LOGS_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed as ProgressLog[];
  } catch {
    return [];
  }
}

/**
 * Logları localStorage'a kaydeder.
 */
export function saveProgressLogs(logs: ProgressLog[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    console.warn("localStorage'a loglar kaydedilemedi.");
  }
}
