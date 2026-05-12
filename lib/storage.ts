// ============================================
// localStorage Yardımcı Fonksiyonları
// ============================================
// Medya listesini tarayıcının yerel deposuna (localStorage) kaydeder
// ve oradan okur. Böylece sayfa yenilenince veriler kaybolmaz.

import { MediaItem, MediaStatus, MediaType, ProgressLog, withMediaClassification } from "./types";
import { withInferredSeriesGroup } from "./series-group";
import type { ThemeFilter, EastSubFilter } from "@/components/media-filters";
import type { LibrarySort, LibraryView } from "@/components/library-control-bar";

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

// ============================================
// UI Preferences (R18)
// ============================================
// Kullanıcının filtre + görünüm tercihlerini tek bir JSON objesi olarak
// saklar. Sadece UI niyetini hatırlar; data/cloud sync'e yazılmaz, kullanıcı
// kimliğine bağlı değildir. Hidrasyon `app/page.tsx`'in mount effect'inde
// yapılır; effect içinde uygulanan setState'ler `handleThemeFilterChange`
// üzerinden geçmediği için R13.2 WorldTransition tetiklenmez.

const UI_PREFS_STORAGE_KEY = "mediaTracker:uiPreferences";

export interface UIPreferences {
  themeFilter: ThemeFilter;
  eastSubFilter: EastSubFilter;
  typeFilter: MediaType | "all";
  statusFilter: MediaStatus | "active" | "all";
  librarySort: LibrarySort;
  libraryView: LibraryView;
}

export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  themeFilter: "all",
  eastSubFilter: "all",
  typeFilter: "all",
  statusFilter: "all",
  librarySort: "recent",
  libraryView: "grid",
};

const THEME_FILTER_VALUES = new Set<ThemeFilter>(["all", "east", "screen", "library"]);
const EAST_SUB_VALUES = new Set<EastSubFilter>(["all", "anime", "manga", "novel"]);
const MEDIA_TYPE_VALUES = new Set<MediaType | "all">([
  "all",
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
const STATUS_VALUES = new Set<MediaStatus | "active" | "all">([
  "all",
  "active",
  "watching",
  "reading",
  "planning",
  "completed",
  "paused",
  "dropped",
]);
const SORT_VALUES = new Set<LibrarySort>([
  "recent",
  "lastActivity",
  "title",
  "progress",
  "rating",
]);
const VIEW_VALUES = new Set<LibraryView>(["grid", "list"]);

/**
 * Ham obje üzerinden alan-alan validate edip güvenli `UIPreferences`
 * türetir. Geçersiz/eksik alanlar default'a düşer. themeFilter ile
 * typeFilter arasındaki tutarlılık (`MediaFilters` TYPE_VALUES_BY_THEME
 * haritasıyla aynı kurallar) burada da uygulanır — kullanıcı eski bir
 * snapshot ile geri dönerse (örn. Kadraj + anime) görmediği bir filtreye
 * sabitlenmiş kalmasın.
 */
function normalizeUIPreferences(raw: unknown): UIPreferences {
  const base = { ...DEFAULT_UI_PREFERENCES };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  if (typeof r.themeFilter === "string" && THEME_FILTER_VALUES.has(r.themeFilter as ThemeFilter)) {
    base.themeFilter = r.themeFilter as ThemeFilter;
  }
  if (typeof r.eastSubFilter === "string" && EAST_SUB_VALUES.has(r.eastSubFilter as EastSubFilter)) {
    base.eastSubFilter = r.eastSubFilter as EastSubFilter;
  }
  if (typeof r.typeFilter === "string" && MEDIA_TYPE_VALUES.has(r.typeFilter as MediaType | "all")) {
    base.typeFilter = r.typeFilter as MediaType | "all";
  }
  if (typeof r.statusFilter === "string" && STATUS_VALUES.has(r.statusFilter as MediaStatus | "active" | "all")) {
    base.statusFilter = r.statusFilter as MediaStatus | "active" | "all";
  }
  if (typeof r.librarySort === "string" && SORT_VALUES.has(r.librarySort as LibrarySort)) {
    base.librarySort = r.librarySort as LibrarySort;
  }
  if (typeof r.libraryView === "string" && VIEW_VALUES.has(r.libraryView as LibraryView)) {
    base.libraryView = r.libraryView as LibraryView;
  }

  // Theme ↔ Type tutarlılığı (handleThemeFilterChange ile aynı kurallar):
  // - Doğu seçiliyken eastSubFilter anlamlı; typeFilter all'a sabitlenir.
  // - Doğu dışındaki dünyalarda eastSubFilter all'a düşer.
  // - Kadraj sadece movie/tv/all; Arşiv sadece book/all kabul eder.
  if (base.themeFilter === "east") {
    base.typeFilter = "all";
  } else {
    base.eastSubFilter = "all";
    if (base.themeFilter === "screen") {
      if (base.typeFilter !== "all" && base.typeFilter !== "movie" && base.typeFilter !== "tv") {
        base.typeFilter = "all";
      }
    } else if (base.themeFilter === "library") {
      if (base.typeFilter !== "all" && base.typeFilter !== "book") {
        base.typeFilter = "all";
      }
    }
  }

  return base;
}

/**
 * UI tercihlerini localStorage'dan okur. SSR'da veya kayıt yoksa default
 * obje döner — çağıran taraf "bir snapshot vardı mı?" ayrımına ihtiyaç
 * duymaz; her zaman geçerli bir obje alır.
 */
export function loadUIPreferences(): UIPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_UI_PREFERENCES };
  try {
    const saved = localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_UI_PREFERENCES };
    const parsed = JSON.parse(saved);
    return normalizeUIPreferences(parsed);
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

/**
 * UI tercihlerini kaydeder. mediaList/progressLogs gibi cloud sync'e
 * giren akışlardan tamamen ayrı; sadece localStorage yazar.
 */
export function saveUIPreferences(prefs: UIPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    console.warn("localStorage'a UI tercihleri kaydedilemedi.");
  }
}
