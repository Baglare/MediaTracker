// ============================================
// Global Search Sonuç Kartı — R23 (Premium polish)
// ============================================
// R23'te tamamen yenilendi. Prop arayüzü ve davranış sözleşmesi (onAdd,
// libraryStatus consume etme, isAdding spinner) birebir korunur — sadece
// görsel dil MediaCard + DetailModal + Add/Edit modal ile aynı premium
// premium dashboard'a hizalandı:
//   - Daha geniş kapak (w-16 mobil / w-20 sm+), `ring-1 + soft shadow`.
//   - data-world scope altında hover'da `--w-primary` tonuna hafif kayma.
//   - Title + yıl satırı net hiyerarşi (year font-mono).
//   - Kaynak rozetleri kompakt + ikonlu; TMDB primary (teal), OMDb fallback
//     (amber + küçük "fallback" eyebrow), TVmaze (sky), AniList (rose),
//     OpenLibrary (lime).
//   - Tür + ThemeSubBadge + kaynak rozeti tek satırda; yıl ayrı bir
//     "tabular-nums" pill.
//   - Açıklama 2-satır clamp ile sm+'da görünür.
//   - "Listede" / "Ekle" / "Sezon Ekle" butonları h-8 touch hedefi.
//   - Mobilde action grubu içerik altına wrap eder; sm+'da sağ kenarda
//     dikey duruyor. Yatay taşma yok.

"use client";

import Image from "next/image";
import {
  Plus,
  Check,
  Loader2,
  Library,
  Tv,
  Clapperboard,
  BookOpen,
  Sparkles,
  Languages,
} from "lucide-react";
import { GlobalSearchLibraryStatus, GlobalSearchResult } from "@/lib/global-search-types";
import { getMediaTypeLabel } from "@/lib/progress";
import { ThemeSubBadge } from "@/components/theme-accent";

interface Props {
  result: GlobalSearchResult;
  libraryStatus: GlobalSearchLibraryStatus;
  isAdding: boolean;
  onAdd: (result: GlobalSearchResult, options?: { relatedOnly?: boolean }) => void;
}

// Kaynak rozetleri — etiket + renk + opsiyonel mini ikon.
// R23: TMDB / OMDb fallback / TVmaze / AniList / OpenLibrary için kararlı renk
// kimliği. "fallback" eyebrow OMDb'de küçük bir alt satır olarak görünür.
function getSourceBadge(source: string): {
  label: string;
  cls: string;
  hint?: string;
} {
  switch (source) {
    case "tvmaze":
      // R23.2: Görünür yazım "TVMaze" olsun (PageHeader/copy ile uyumlu).
      return { label: "TVMaze", cls: "bg-sky-500/15 text-sky-300 ring-sky-500/30" };
    case "anilist":
      return { label: "AniList", cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30" };
    case "openlibrary":
      return { label: "Open Library", cls: "bg-lime-500/15 text-lime-300 ring-lime-500/30" };
    case "omdb":
      // R21.2/R23: Fallback durumunda eyebrow "fallback" ile ikincilliği
      // hissettir; rozetin kendisi sade kalsın diye etiket sadece "OMDb".
      return {
        label: "OMDb",
        cls: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
        hint: "fallback",
      };
    case "tmdb":
      return { label: "TMDB", cls: "bg-teal-500/15 text-teal-200 ring-teal-500/30" };
    default:
      return { label: source, cls: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30" };
  }
}

// Type → küçük ikon (badge yanına). MediaCard ile aynı dil; sadece görsel.
// R23: `react-hooks/static-components` lint kuralı render içinde "Component"
// türünde değişken oluşturmayı yasakladığı için ikon JSX'i bir helper'la
// render edilir; component referansı dışarıda exposed edilmez.
function TypeGlyph({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "movie":
      return <Clapperboard className={className} />;
    case "tv":
      return <Tv className={className} />;
    case "anime":
      return <Sparkles className={className} />;
    case "book":
      return <BookOpen className={className} />;
    case "light_novel":
    case "web_novel":
    case "visual_novel":
      return <Languages className={className} />;
    default:
      return <BookOpen className={className} />;
  }
}

export default function GlobalSearchResultCard({
  result,
  libraryStatus,
  isAdding,
  onAdd,
}: Props) {
  const sourceBadge = getSourceBadge(result.source);
  const tags = result.genres || result.subjects || [];

  // V5A.5: AniList raw'ındaki `format` ThemeSubBadge'i besler (Anime · Film/OVA,
  // Manga/Manhwa/Light Novel vb.). Diğer kaynaklarda format yoksa rozet bastırılır.
  const rawFormat =
    result.raw && typeof result.raw === "object" && "format" in result.raw
      ? (result.raw as { format?: unknown }).format
      : undefined;
  const classifiableLite = {
    type: result.type,
    externalSource: result.source,
    format: typeof rawFormat === "string" ? rawFormat : undefined,
  };

  const inLibrary = libraryStatus.isInLibrary;
  const hasAddableParts = libraryStatus.hasAddableParts;

  return (
    <div
      className="
        group relative flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 sm:p-4
        bg-zinc-900/40 rounded-2xl ring-1 ring-zinc-800/60 overflow-hidden
        hover:ring-[color-mix(in_srgb,var(--w-primary)_38%,#3f3f46)]
        hover:bg-zinc-900/55
        transition-colors min-w-0
      "
    >
      {/* Top accent — hover'da silik dünya gradient çizgisi. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-80 transition-opacity"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--w-primary), transparent)",
        }}
      />

      {/* === Kapak === */}
      <div className="relative w-16 h-24 sm:w-20 sm:h-28 shrink-0 rounded-xl overflow-hidden ring-1 ring-zinc-800 bg-zinc-900 shadow-sm shadow-black/40">
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt={result.title}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <TypeGlyph type={result.type} className="w-6 h-6" />
          </div>
        )}
        {/* Üst vignette — kaynak rozeti kapağın üstünde okunsun diye */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/55 to-transparent"
        />
        <span
          className={`absolute top-1 left-1 inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-sm ring-1 ${sourceBadge.cls}`}
          title={sourceBadge.hint ? `${sourceBadge.label} · ${sourceBadge.hint}` : sourceBadge.label}
        >
          {sourceBadge.label}
        </span>
      </div>

      {/* === Bilgi === */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h4 className="text-[13.5px] sm:text-sm font-semibold text-zinc-100 leading-tight break-words line-clamp-2 min-w-0">
            {result.title}
          </h4>
          {result.releaseYear && (
            <span className="shrink-0 text-[11px] font-mono tabular-nums text-zinc-500">
              {result.releaseYear}
            </span>
          )}
        </div>

        {result.subtitle && (
          <p className="text-[11.5px] text-zinc-400 truncate">{result.subtitle}</p>
        )}

        {/* Badge satırı: tür + Doğu subType + (mobilde kaynak fallback eyebrow) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-800/70 text-zinc-300 ring-1 ring-zinc-700/50">
            <TypeGlyph type={result.type} className="w-3 h-3" />
            {getMediaTypeLabel(result.type)}
          </span>
          <ThemeSubBadge item={classifiableLite} compact />
          {sourceBadge.hint && (
            <span className="text-[9.5px] uppercase tracking-[0.16em] font-semibold text-amber-300/70">
              · {sourceBadge.hint}
            </span>
          )}
        </div>

        {result.authors && result.authors.length > 0 && (
          <p className="text-[11px] text-zinc-500 truncate">
            {result.authors.slice(0, 2).join(", ")}
            {result.authors.length > 2 && ` +${result.authors.length - 2}`}
          </p>
        )}

        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-400 ring-1 ring-zinc-700/30"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {result.overview && (
          // Açıklama yalnızca sm+'da görünür — mobilde başlık + badge + tags
          // zaten dolu, ek satır gürültü yaratıyor. line-clamp-2 ile kontrollü.
          <p className="hidden sm:block text-[11.5px] text-zinc-500 leading-relaxed line-clamp-2 break-words">
            {result.overview}
          </p>
        )}
      </div>

      {/* === Aksiyonlar ===
          Mobilde sol-aligned alt satır; sm+'da sağ kenarda dikey. */}
      <div className="flex sm:flex-col items-center sm:items-end justify-start sm:justify-center gap-2 shrink-0 mt-1 sm:mt-0 sm:ml-2">
        {inLibrary ? (
          <>
            <span className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-300/80 ring-1 ring-emerald-500/25">
              <Check className="w-3 h-3" />
              Listede
            </span>
            {hasAddableParts && (
              <button
                type="button"
                onClick={() => onAdd(result, { relatedOnly: true })}
                disabled={isAdding}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30 hover:bg-violet-500/25 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={libraryStatus.actionLabel ?? "Parça Ekle"}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Açılıyor
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span className="whitespace-nowrap">
                      {libraryStatus.actionLabel ?? "Parça Ekle"}
                    </span>
                    {typeof libraryStatus.missingCount === "number" &&
                      libraryStatus.missingCount > 0 && (
                        <span className="ml-0.5 font-mono tabular-nums text-violet-300/70">
                          ({libraryStatus.missingCount})
                        </span>
                      )}
                  </>
                )}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(result)}
            disabled={isAdding}
            className="inline-flex items-center gap-1 h-8 sm:h-9 px-3 rounded-lg text-[12px] font-semibold ring-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-zinc-50"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--w-primary) 28%, transparent), color-mix(in srgb, var(--w-secondary) 20%, transparent))",
              boxShadow:
                "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 45%, transparent)",
            }}
          >
            {isAdding ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Ekleniyor
              </>
            ) : (
              <>
                <Library className="w-3.5 h-3.5" /> Ekle
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
