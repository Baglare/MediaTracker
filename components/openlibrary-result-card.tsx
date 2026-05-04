// ============================================
// Open Library Sonuç Kartı Bileşeni
// ============================================
// Online arama sonuçlarından gelen her bir Open Library sonucunu
// gösteren kart. Kapak, başlık, yazar, yıl, sayfa sayısı, konular
// ve "Listeme Ekle" butonu içerir.

"use client";

import Image from "next/image";
import { Plus, Check, BookOpen, Loader2, User } from "lucide-react";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";

interface OpenLibraryResultCardProps {
  result: OpenLibraryNormalizedResult;
  isAlreadyAdded: boolean;
  isAdding: boolean;
  onAdd: (result: OpenLibraryNormalizedResult) => void;
}

export default function OpenLibraryResultCard({
  result,
  isAlreadyAdded,
  isAdding,
  onAdd,
}: OpenLibraryResultCardProps) {
  return (
    <div className="flex gap-4 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-all">
      {/* Sol: Kapak görseli */}
      <div className="relative w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-zinc-800 bg-zinc-800">
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
            <BookOpen className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Orta: Bilgiler */}
      <div className="flex-1 min-w-0">
        {/* Başlık */}
        <h4 className="font-semibold text-sm text-zinc-100 truncate">
          {result.title}
        </h4>

        {/* Yazar(lar) */}
        {result.authors && result.authors.length > 0 && (
          <p className="text-xs text-zinc-400 mt-0.5 truncate flex items-center gap-1">
            <User className="w-3 h-3 flex-shrink-0" />
            {result.authors.slice(0, 2).join(", ")}
            {result.authors.length > 2 && ` +${result.authors.length - 2}`}
          </p>
        )}

        {/* Yıl ve tür badge */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 ring-1 ring-green-500/20">
            Kitap
          </span>
          {result.releaseYear && (
            <span className="text-[11px] text-zinc-500">
              {result.releaseYear}
            </span>
          )}
          {result.pageCount && (
            <span className="text-[11px] text-zinc-500">
              {result.pageCount} sayfa
            </span>
          )}
        </div>

        {/* Baskı ve dil bilgisi */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {result.editionCount && (
            <span className="text-[10px] text-zinc-600">
              {result.editionCount} baskı
            </span>
          )}
        </div>

        {/* Konular (subjects) — en fazla 3 tane */}
        {result.subjects && result.subjects.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {result.subjects.slice(0, 3).map((subject) => (
              <span
                key={subject}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 ring-1 ring-zinc-700/30"
              >
                {subject}
              </span>
            ))}
          </div>
        )}
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
                : "bg-green-500/15 text-green-300 ring-1 ring-green-500/30 hover:bg-green-500/25"
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
