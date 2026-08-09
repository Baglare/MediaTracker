// ============================================
// TMDB Sonuç Kartı Bileşeni
// ============================================
// Online arama sonuçlarından gelen her bir TMDB sonucunu
// gösteren kart. Poster, başlık, tür, yıl, açıklama ve
// "Listeme Ekle" butonu içerir.

"use client";

import Image from "next/image";
import { Plus, Check, Film, Tv } from "lucide-react";
import { TmdbNormalizedResult } from "@/lib/tmdb-types";
import { SearchResultDescription } from "@/components/search-result-description";

interface TmdbResultCardProps {
  result: TmdbNormalizedResult;     // TMDB sonuç verisi
  isAlreadyAdded: boolean;          // Zaten listede mi?
  onAdd: (result: TmdbNormalizedResult) => void;  // "Listeme Ekle" butonuna basılınca
}

export default function TmdbResultCard({
  result,
  isAlreadyAdded,
  onAdd,
}: TmdbResultCardProps) {
  return (
    <div className="flex min-w-0 gap-4 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-4 transition-colors hover:bg-[var(--app-card-hover)]">
      {/* Sol: Poster görseli */}
      <div className="relative w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-[var(--app-border)] bg-[var(--app-surface-2)]">
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt={result.title}
            fill
            unoptimized={true}
            className="object-cover"
          />
        ) : (
          // Poster yoksa ikon göster
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            {result.type === "movie" ? (
              <Film className="w-6 h-6" />
            ) : (
              <Tv className="w-6 h-6" />
            )}
          </div>
        )}
      </div>

      {/* Orta: Bilgiler */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          {/* Başlık */}
          <h4 className="font-semibold text-sm text-[var(--app-text-primary)] truncate">
            {result.title}
          </h4>

          {/* Tür ve yıl */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 ring-1 ring-zinc-700/50">
              {result.type === "movie" ? "Film" : "Dizi"}
            </span>
            {result.releaseYear && (
              <span className="text-[11px] text-zinc-500">
                {result.releaseYear}
              </span>
            )}
          </div>

          {/* Açıklama (varsa, en fazla 2 satır) */}
          <SearchResultDescription value={result.overview} />
        </div>
      </div>

      {/* Sağ: Listeme Ekle butonu */}
      <div className="flex-shrink-0 flex items-center">
        <button
          onClick={() => onAdd(result)}
          disabled={isAlreadyAdded}
          className={`
            flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
            ${
              isAlreadyAdded
                ? "bg-emerald-500/10 text-emerald-500/60 ring-1 ring-emerald-500/20 cursor-not-allowed"
                : "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30 hover:bg-violet-500/25"
            }
          `}
        >
          {isAlreadyAdded ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Listede</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ekle</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
