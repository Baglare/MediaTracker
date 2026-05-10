// ============================================
// Medya Filtreleme Bileşeni
// ============================================
// Theme Mode (Doğu/Ekran/Kütüphane), medya türü ve durum filtreleri.

"use client";

import { MediaType, MediaStatus } from "@/lib/types";

// V5A.1: Üst seviye theme mode filtresi.
// "all" — tüm temalar
// "east" — Doğu (anime + manga + novel mediaType'ları)
// "screen" — Ekran (tv + movie)
// "library" — Kütüphane (book)
export type ThemeFilter = "all" | "east" | "screen" | "library";

// V5A.1: Doğu seçiliyken aktifleşen ikinci seviye alt filtre.
export type EastSubFilter = "all" | "anime" | "manga" | "novel";

// Filtre bileşeninin dışarıdan aldığı değerler
// V5A.2: Doğu alt filtresi artık EastThemeHeader içinde yönetiliyor;
// MediaFilters yalnızca üst seviye theme + tür + durum filtrelerinden sorumlu.
interface MediaFiltersProps {
  activeTheme: ThemeFilter;                              // Seçili theme mode
  activeType: MediaType | "all";                        // Seçili medya türü
  activeStatus: MediaStatus | "active" | "all";         // Seçili durum
  onThemeChange: (theme: ThemeFilter) => void;
  onTypeChange: (type: MediaType | "all") => void;      // Tür değişince çağrılır
  onStatusChange: (status: MediaStatus | "active" | "all") => void; // Durum değişince çağrılır
}

// V5A.1: Theme mode filtre butonlarının listesi
const themeFilters: { label: string; value: ThemeFilter; icon: string }[] = [
  { label: "Tümü", value: "all", icon: "🌐" },
  { label: "Doğu", value: "east", icon: "🏯" },
  { label: "Ekran", value: "screen", icon: "🎞️" },
  { label: "Kütüphane", value: "library", icon: "📚" },
];

// Medya türü filtre butonlarının listesi
const typeFilters: { label: string; value: MediaType | "all"; icon: string }[] = [
  { label: "Hepsi", value: "all", icon: "🎯" },
  { label: "Film", value: "movie", icon: "🎬" },
  { label: "Dizi", value: "tv", icon: "📺" },
  { label: "Anime", value: "anime", icon: "🌸" },
  { label: "Manga", value: "manga", icon: "📖" },
  { label: "Manhwa", value: "manhwa", icon: "📚" },
  { label: "Manhua", value: "manhua", icon: "🀄" },
  { label: "Kitap", value: "book", icon: "📕" },
];

// V5A.2: Aktif theme mode'a göre Medya Türü bloğunda hangi türler görünür?
// "east" → blok tamamen gizleniyor (alt ayrım EastThemeHeader'ın işi).
// "screen" → Film / Dizi
// "library" → Kitap
// "all" → tüm türler
const TYPE_VALUES_BY_THEME: Record<
  Exclude<ThemeFilter, "east">,
  ReadonlyArray<MediaType | "all">
> = {
  all: ["all", "movie", "tv", "anime", "manga", "manhwa", "manhua", "book"],
  screen: ["all", "movie", "tv"],
  library: ["all", "book"],
};

// Durum filtre butonlarının listesi
const statusFilters: { label: string; value: MediaStatus | "active" | "all" }[] = [
  { label: "Tümü", value: "all" },
  { label: "Devam Ediyor", value: "active" },
  { label: "Planlandı", value: "planning" },
  { label: "Tamamlandı", value: "completed" },
  { label: "Duraklatıldı", value: "paused" },
  { label: "Bırakıldı", value: "dropped" },
];

export default function MediaFilters({
  activeTheme,
  activeType,
  activeStatus,
  onThemeChange,
  onTypeChange,
  onStatusChange,
}: MediaFiltersProps) {
  // V5A.2: Doğu seçiliyken type bloğu tamamen gizlenir (header alt-ayrımı üstlenir).
  const showTypeBlock = activeTheme !== "east";
  // Görünen tür listesini theme'e göre filtrele.
  const visibleTypeFilters =
    activeTheme === "east"
      ? []
      : typeFilters.filter((f) =>
          TYPE_VALUES_BY_THEME[activeTheme].includes(f.value),
        );
  return (
    <div className="space-y-4">
      {/* V5A.1: Theme Mode (üst seviye) */}
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Tema
        </p>
        <div className="flex flex-wrap gap-2">
          {themeFilters.map((filter) => {
            const isActive = activeTheme === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => onThemeChange(filter.value)}
                className={`
                  flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium
                  transition-all duration-200 cursor-pointer
                  ${
                    isActive
                      ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10"
                      : "bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-300 ring-1 ring-zinc-800"
                  }
                `}
              >
                <span className="text-base">{filter.icon}</span>
                <span>{filter.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* V5A.2: Doğu alt filtresi artık EastThemeHeader içinde; burada render edilmez. */}

      {/* Medya türü filtreleri — Doğu aktifken gizli */}
      {showTypeBlock && (
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Medya Türü
        </p>
        <div className="flex flex-wrap gap-2">
          {visibleTypeFilters.map((filter) => {
            const isActive = activeType === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => onTypeChange(filter.value)}
                className={`
                  flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium
                  transition-all duration-200 cursor-pointer
                  ${
                    isActive
                      ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40 shadow-lg shadow-violet-500/10"
                      : "bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-300 ring-1 ring-zinc-800"
                  }
                `}
              >
                <span className="text-base">{filter.icon}</span>
                <span>{filter.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Durum filtreleri */}
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Durum
        </p>
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => {
            const isActive = activeStatus === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => onStatusChange(filter.value)}
                className={`
                  px-3.5 py-2 rounded-xl text-sm font-medium
                  transition-all duration-200 cursor-pointer
                  ${
                    isActive
                      ? "bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-500/40 shadow-lg shadow-fuchsia-500/10"
                      : "bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-300 ring-1 ring-zinc-800"
                  }
                `}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
