"use client";

// ============================================
// Library Control Bar (R5 + R5.1)
// ============================================
// Üst global control panel: arama, "Medya Ekle" + altta mevcut MediaFilters.
//
// R5.1 değişikliği: sort dropdown ve grid/list toggle bu üst bar'dan
// taşındı. Çünkü sort/view yalnızca "Kütüphanem" (singleton) bölümünü
// etkiliyor; kontrolün etkilediği bölüme yakın olması daha sezgisel.
// Bu kontrolleri `LibrarySectionControls` adlı küçük bir export olarak
// dışarı veriyoruz; app/page.tsx onu Kütüphanem SectionHead'inin sağına
// yerleştiriyor.

import { Search, Plus, ArrowUpDown, LayoutGrid, List } from "lucide-react";
import MediaFilters, {
  type ThemeFilter,
  type EastSubFilter,
} from "@/components/media-filters";
import type { MediaType, MediaStatus } from "@/lib/types";

export type LibrarySort = "recent" | "lastActivity" | "title" | "progress" | "rating";
export type LibraryView = "grid" | "list";

export const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "recent", label: "Son Eklenen" },
  { value: "lastActivity", label: "Son Aktivite" },
  { value: "title", label: "Başlık A–Z" },
  { value: "progress", label: "İlerleme" },
  { value: "rating", label: "Puan" },
];

interface LibraryControlBarProps {
  // Arama
  searchQuery: string;
  onSearchChange: (q: string) => void;

  // Filtreler (MediaFilters'a aynen aktarılıyor)
  themeFilter: ThemeFilter;
  typeFilter: MediaType | "all";
  statusFilter: MediaStatus | "active" | "all";
  onThemeChange: (theme: ThemeFilter) => void;
  onTypeChange: (type: MediaType | "all") => void;
  onStatusChange: (status: MediaStatus | "active" | "all") => void;

  // Üst aksiyon
  onAddMedia: () => void;

  // Sayım göstergesi (opsiyonel)
  resultCount?: number;

  // R5'te tutulmuştu; bu prop artık control bar tarafından kullanılmıyor
  // ama tip stabilitesi için opsiyonel bıraktım.
  eastSubFilter?: EastSubFilter;
}

export default function LibraryControlBar({
  searchQuery,
  onSearchChange,
  themeFilter,
  typeFilter,
  statusFilter,
  onThemeChange,
  onTypeChange,
  onStatusChange,
  onAddMedia,
  resultCount,
}: LibraryControlBarProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 ring-1 ring-zinc-800/40 shadow-lg shadow-black/10">
      {/* Üst satır: search · medya ekle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 border-b border-zinc-800/60">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Kütüphanende ara…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-colors"
          />
          {typeof resultCount === "number" && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono tabular-nums text-zinc-500 pointer-events-none">
              {resultCount}
            </span>
          )}
        </div>

        {/* Add */}
        <button
          type="button"
          onClick={onAddMedia}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-500/25 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Medya Ekle</span>
        </button>
      </div>

      {/* Filtre bloğu (mevcut MediaFilters reuse) */}
      <div className="p-3 sm:p-4">
        <MediaFilters
          activeTheme={themeFilter}
          activeType={typeFilter}
          activeStatus={statusFilter}
          onThemeChange={onThemeChange}
          onTypeChange={onTypeChange}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  );
}

// ============================================
// LibrarySectionControls (R5.1)
// ============================================
// Sort dropdown + grid/list toggle. Yalnızca "Kütüphanem" singleton
// bölümünü etkilediği için section header'ın yanına yerleştiriliyor.

interface LibrarySectionControlsProps {
  sortBy: LibrarySort;
  onSortChange: (s: LibrarySort) => void;
  viewMode: LibraryView;
  onViewChange: (v: LibraryView) => void;
}

export function LibrarySectionControls({
  sortBy,
  onSortChange,
  viewMode,
  onViewChange,
}: LibrarySectionControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Sort */}
      <label className="relative inline-flex items-center" title="Sıralama">
        <ArrowUpDown className="absolute left-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as LibrarySort)}
          className="appearance-none pl-7 pr-7 py-1.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs font-medium text-zinc-200 cursor-pointer hover:bg-zinc-800/60 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40 transition-colors"
          aria-label="Sıralama"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          className="absolute right-2 w-3 h-3 text-zinc-500 pointer-events-none"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </label>

      {/* View toggle */}
      <div
        className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5"
        role="group"
        aria-label="Görünüm"
      >
        <button
          type="button"
          onClick={() => onViewChange("grid")}
          className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            viewMode === "grid"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="Grid görünüm"
          aria-pressed={viewMode === "grid"}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onViewChange("list")}
          className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            viewMode === "list"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="Liste görünüm"
          aria-pressed={viewMode === "list"}
        >
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
