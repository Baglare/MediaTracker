// ============================================
// AniList Sonuç Kartı Bileşeni
// ============================================
// Arama sonuçlarındaki her bir AniList medyasını gösterir.
// Kapak, başlık, tür, format, yıl, bölüm/chapter, genre
// ve "Listeme Ekle" butonu içerir.

"use client";

import Image from "next/image";
import { Plus, Check, Loader2, Tv, BookOpen, Star } from "lucide-react";
import { AniListNormalizedResult } from "@/lib/anilist-types";
import { getMediaTypeLabel } from "@/lib/progress";
import { SearchResultDescription } from "@/components/search-result-description";

interface AniListResultCardProps {
  result: AniListNormalizedResult;
  isAlreadyAdded: boolean;
  isAdding: boolean;
  onAdd: (result: AniListNormalizedResult) => void;
}

/**
 * AniList durumunun kısa Türkçe karşılığı
 */
function getAniListStatusLabel(status?: string): string | undefined {
  switch (status) {
    case "FINISHED":
      return "Tamamlandı";
    case "RELEASING":
      return "Yayınlanıyor";
    case "NOT_YET_RELEASED":
      return "Henüz Yayınlanmadı";
    case "CANCELLED":
      return "İptal Edildi";
    case "HIATUS":
      return "Ara Verildi";
    default:
      return undefined;
  }
}

/**
 * Medya türüne göre tür badge rengi
 */
function getTypeBadgeColor(type: string): string {
  switch (type) {
    case "anime":
      return "bg-pink-500/10 text-pink-400 ring-pink-500/20";
    case "manga":
      return "bg-orange-500/10 text-orange-400 ring-orange-500/20";
    case "manhwa":
      return "bg-teal-500/10 text-teal-400 ring-teal-500/20";
    case "manhua":
      return "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20";
  }
}

export default function AniListResultCard({
  result,
  isAlreadyAdded,
  isAdding,
  onAdd,
}: AniListResultCardProps) {
  const statusLabel = getAniListStatusLabel(result.anilistStatus);

  return (
    <div className="flex min-w-0 gap-4 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-4 transition-colors hover:bg-[var(--app-card-hover)]">
      {/* Sol: Kapak */}
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
            {result.type === "anime" ? (
              <Tv className="w-6 h-6" />
            ) : (
              <BookOpen className="w-6 h-6" />
            )}
          </div>
        )}
      </div>

      {/* Orta: Bilgiler */}
      <div className="flex-1 min-w-0">
        {/* Başlık */}
        <h4 className="font-semibold text-sm text-[var(--app-text-primary)] truncate">
          {result.title}
        </h4>

        {/* Orijinal / native başlık */}
        {result.nativeTitle && result.nativeTitle !== result.title && (
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
            {result.nativeTitle}
          </p>
        )}

        {/* Tür, yıl, format */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-md ring-1 ${getTypeBadgeColor(
              result.type
            )}`}
          >
            {getMediaTypeLabel(result.type)}
          </span>
          {result.releaseYear && (
            <span className="text-[11px] text-zinc-500">
              {result.releaseYear}
            </span>
          )}
          {result.format && (
            <span className="text-[11px] text-zinc-600">
              {result.format}
            </span>
          )}
        </div>

        {/* Bölüm / chapter / puan bilgisi */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {result.type === "anime" && result.episodes && (
            <span className="text-[10px] text-zinc-500">
              {result.episodes} bölüm
            </span>
          )}
          {result.type !== "anime" && result.chapters && (
            <span className="text-[10px] text-zinc-500">
              {result.chapters} bölüm
            </span>
          )}
          {result.type !== "anime" && result.volumes && (
            <>
              <span className="text-[10px] text-zinc-700">•</span>
              <span className="text-[10px] text-zinc-600">
                {result.volumes} cilt
              </span>
            </>
          )}
          {statusLabel && (
            <>
              <span className="text-[10px] text-zinc-700">•</span>
              <span className="text-[10px] text-zinc-600">{statusLabel}</span>
            </>
          )}
          {result.averageScore && (
            <>
              <span className="text-[10px] text-zinc-700">•</span>
              <span className="text-[10px] text-amber-500/70 flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" />
                {result.averageScore}%
              </span>
            </>
          )}
        </div>

        {/* Genre badge'leri — en fazla 3 tane */}
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

        {/* Kısa açıklama (en fazla 120 karakter) */}
        <SearchResultDescription value={result.overview} className="text-[10px]" />
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
                : "bg-pink-500/15 text-pink-300 ring-1 ring-pink-500/30 hover:bg-pink-500/25"
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
