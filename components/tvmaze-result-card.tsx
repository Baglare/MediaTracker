// ============================================
// TVmaze Sonuç Kartı Bileşeni
// ============================================
// Online arama sonuçlarından gelen her bir TVmaze sonucunu
// gösteren kart. Poster, başlık, yıl, türler, kanal, açıklama
// ve "Listeme Ekle" butonu içerir.

"use client";

import Image from "next/image";
import { Plus, Check, Tv, Loader2 } from "lucide-react";
import { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import { SearchResultDescription } from "@/components/search-result-description";

interface TvmazeResultCardProps {
  result: TvmazeNormalizedResult;
  isAlreadyAdded: boolean;
  isAdding: boolean;            // "Ekleniyor..." durumu
  onAdd: (result: TvmazeNormalizedResult) => void;
}

export default function TvmazeResultCard({
  result,
  isAlreadyAdded,
  isAdding,
  onAdd,
}: TvmazeResultCardProps) {
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
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Tv className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Orta: Bilgiler */}
      <div className="flex-1 min-w-0">
        {/* Başlık */}
        <h4 className="font-semibold text-sm text-[var(--app-text-primary)] truncate">
          {result.title}
        </h4>

        {/* Yıl, durum ve kanal */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20">
            Dizi
          </span>
          {result.releaseYear && (
            <span className="text-[11px] text-zinc-500">
              {result.releaseYear}
            </span>
          )}
          {result.tvmazeStatus && (
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                result.tvmazeStatus === "Running"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : result.tvmazeStatus === "Ended"
                  ? "bg-zinc-700/50 text-zinc-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {result.tvmazeStatus === "Running"
                ? "Devam Ediyor"
                : result.tvmazeStatus === "Ended"
                ? "Final"
                : result.tvmazeStatus}
            </span>
          )}
        </div>

        {/* Türler */}
        {result.genres && result.genres.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {result.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 ring-1 ring-zinc-700/30"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Dil */}
        {result.language && (
          <p className="text-[10px] text-zinc-600 mt-1">
            {result.language}
          </p>
        )}

        {/* Açıklama */}
        <SearchResultDescription value={result.overview} />
      </div>

      {/* Sağ: Listeme Ekle butonu */}
      <div className="flex-shrink-0 flex items-center">
        <button
          onClick={() => onAdd(result)}
          disabled={isAlreadyAdded || isAdding}
          className={`
            flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
            ${
              isAlreadyAdded
                ? "bg-emerald-500/10 text-emerald-500/60 ring-1 ring-emerald-500/20 cursor-not-allowed"
                : isAdding
                ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 cursor-wait"
                : "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30 hover:bg-violet-500/25"
            }
          `}
        >
          {isAlreadyAdded ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Listede</span>
            </>
          ) : isAdding ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Ekleniyor</span>
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
