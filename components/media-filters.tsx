// ============================================
// Medya Filtreleme Bileşeni
// ============================================
// Dünya Mode (Doğu/Kadraj/Arşiv), medya türü ve durum filtreleri.
//
// R6.1: Görsel yerleşim kompakt yatay filtre rail'ine taşındı.
// R9: Eski "Tema" konsepti "Dünya" olarak yeniden isimlendirildi; sekmeler
// "Ekran"→"Kadraj", "Kütüphane"→"Arşiv" oldu. Filtre eşleşme mantığı
// (anime/manga/novel ailesi Doğu, tv+movie Kadraj, book Arşiv) aynı kaldı.
// State adı `themeFilter` ve değerler ("east"/"screen"/"library") şimdilik
// korundu — büyük refactor bu turun kapsamı dışı.

"use client";

import { MediaType, MediaStatus } from "@/lib/types";

// V5A.1 / R9: Üst seviye "Dünya" filtresi.
// "all"     — Tümü
// "east"    — Doğu (anime + manga + novel; light/web/visual novel dahil)
// "screen"  — Kadraj (tv + movie + miniseries/documentary benzeri ekran medyaları)
// "library" — Arşiv (book — klasik kitap/okuma)
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
// R9: "Dünya" sekmeleri. Değerler internal (themeFilter state) için aynı kalıyor,
// sadece görünen etiketler yeniden isimlendirildi.
const themeFilters: { label: string; value: ThemeFilter; icon: string }[] = [
  { label: "Tümü", value: "all", icon: "🌐" },
  { label: "Doğu", value: "east", icon: "🏯" },
  { label: "Kadraj", value: "screen", icon: "🎞️" },
  { label: "Arşiv", value: "library", icon: "📚" },
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

// Kompakt pill stilleri — accent farklılaşması için tone parametresi.
type PillTone = "amber" | "violet" | "fuchsia";

function pillClasses(active: boolean, tone: PillTone): string {
  if (active) {
    if (tone === "amber") {
      return "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40";
    }
    if (tone === "violet") {
      return "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/40";
    }
    return "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-500/40";
  }
  return "bg-zinc-900/50 text-zinc-400 ring-1 ring-zinc-800 hover:bg-zinc-800/60 hover:text-zinc-200";
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1 flex-wrap">{children}</div>
    </div>
  );
}

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
  const visibleTypeFilters =
    activeTheme === "east"
      ? []
      : typeFilters.filter((f) =>
          TYPE_VALUES_BY_THEME[activeTheme].includes(f.value),
        );

  return (
    // R6.1: Kompakt yatay rail. Geniş ekranlarda gruplar yan yana; dar
    // ekranlarda flex-wrap ile alt satıra geçer. Dikey yığılma kalktı.
    <div className="flex items-center flex-wrap gap-x-5 gap-y-2">
      {/* Dünya (R9: eski "Tema") */}
      <FilterGroup label="Dünya">
        {themeFilters.map((filter) => {
          const isActive = activeTheme === filter.value;
          return (
            <button
              key={filter.value}
              onClick={() => onThemeChange(filter.value)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${pillClasses(isActive, "amber")}`}
            >
              <span className="text-xs leading-none">{filter.icon}</span>
              <span>{filter.label}</span>
            </button>
          );
        })}
      </FilterGroup>

      {/* Tür — sadece doğu dışında */}
      {showTypeBlock && (
        <>
          <span aria-hidden="true" className="hidden md:block w-px h-5 bg-zinc-800/70" />
          <FilterGroup label="Tür">
            {visibleTypeFilters.map((filter) => {
              const isActive = activeType === filter.value;
              return (
                <button
                  key={filter.value}
                  onClick={() => onTypeChange(filter.value)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${pillClasses(isActive, "violet")}`}
                >
                  <span className="text-xs leading-none">{filter.icon}</span>
                  <span>{filter.label}</span>
                </button>
              );
            })}
          </FilterGroup>
        </>
      )}

      {/* Durum */}
      <span aria-hidden="true" className="hidden md:block w-px h-5 bg-zinc-800/70" />
      <FilterGroup label="Durum">
        {statusFilters.map((filter) => {
          const isActive = activeStatus === filter.value;
          return (
            <button
              key={filter.value}
              onClick={() => onStatusChange(filter.value)}
              className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${pillClasses(isActive, "fuchsia")}`}
            >
              {filter.label}
            </button>
          );
        })}
      </FilterGroup>
    </div>
  );
}
