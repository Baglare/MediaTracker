// ============================================
// Medya Filtreleme Bileşeni
// ============================================
// Medya türüne ve izleme/okuma durumuna göre filtreleme butonları.

"use client";

import { MediaType, MediaStatus } from "@/lib/types";

// Filtre bileşeninin dışarıdan aldığı değerler
interface MediaFiltersProps {
  activeType: MediaType | "all";                        // Seçili medya türü
  activeStatus: MediaStatus | "active" | "all";         // Seçili durum
  onTypeChange: (type: MediaType | "all") => void;      // Tür değişince çağrılır
  onStatusChange: (status: MediaStatus | "active" | "all") => void; // Durum değişince çağrılır
}

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
  activeType,
  activeStatus,
  onTypeChange,
  onStatusChange,
}: MediaFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Medya türü filtreleri */}
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Medya Türü
        </p>
        <div className="flex flex-wrap gap-2">
          {typeFilters.map((filter) => {
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
