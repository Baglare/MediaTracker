// ============================================
// Global Search Sonuç Kartı
// ============================================

"use client";

import Image from "next/image";
import { Plus, Check, Loader2 } from "lucide-react";
import { GlobalSearchResult } from "@/lib/global-search-types";
import { getMediaTypeLabel } from "@/lib/progress";

interface Props {
  result: GlobalSearchResult;
  isInLibrary: boolean;
  isAdding: boolean;
  onAdd: (result: GlobalSearchResult) => void;
}

/** Kaynağa göre badge rengi */
function getSourceBadge(source: string) {
  switch (source) {
    case "tvmaze":
      return { label: "TVmaze", cls: "bg-sky-500/15 text-sky-400 ring-sky-500/25" };
    case "anilist":
      return { label: "AniList", cls: "bg-rose-500/15 text-rose-400 ring-rose-500/25" };
    case "openlibrary":
      return { label: "Open Library", cls: "bg-lime-500/15 text-lime-400 ring-lime-500/25" };
    case "omdb":
      return { label: "OMDb", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/25" };
    default:
      return { label: source, cls: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/25" };
  }
}

export default function GlobalSearchResultCard({
  result,
  isInLibrary,
  isAdding,
  onAdd,
}: Props) {
  const sourceBadge = getSourceBadge(result.source);
  const tags = result.genres || result.subjects || [];

  return (
    <div className="flex gap-3 p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/40 hover:border-zinc-700/40 transition-colors">
      {/* Kapak */}
      <div className="relative w-14 h-20 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-zinc-800 bg-zinc-800">
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt={result.title}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-lg">
            📺
          </div>
        )}
      </div>

      {/* Bilgi */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h4 className="text-sm font-medium text-zinc-200 truncate leading-tight">
            {result.title}
          </h4>
          {result.subtitle && (
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">
              {result.subtitle}
            </p>
          )}
          {/* Badges */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 ring-1 ring-zinc-700/50">
              {getMediaTypeLabel(result.type)}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${sourceBadge.cls}`}>
              {sourceBadge.label}
            </span>
            {result.releaseYear && (
              <span className="text-[10px] text-zinc-600">{result.releaseYear}</span>
            )}
          </div>
          {/* Authors (book) */}
          {result.authors && result.authors.length > 0 && (
            <p className="text-[10px] text-zinc-500 mt-1 truncate">
              {result.authors.slice(0, 2).join(", ")}
            </p>
          )}
          {/* Genre/subject tags */}
          {tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {tags.slice(0, 3).map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/40 text-zinc-600 ring-1 ring-zinc-700/20">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ekle butonu */}
      <div className="flex items-center flex-shrink-0">
        {isInLibrary ? (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-500/60 ring-1 ring-emerald-500/20">
            <Check className="w-3 h-3" /> Listede
          </span>
        ) : (
          <button
            onClick={() => onAdd(result)}
            disabled={isAdding}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30 hover:bg-violet-500/25 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Ekleniyor</>
            ) : (
              <><Plus className="w-3 h-3" /> Ekle</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
