"use client";

import Image from "next/image";
import { BookOpen, Check, Clapperboard, ExternalLink, Languages, Library, Loader2, Plus, Sparkles, Tv } from "lucide-react";

import { MediaCardShell } from "@/components/media-card-shell";
import { SearchResultDescription } from "@/components/search-result-description";
import { ThemeSubBadge } from "@/components/theme-accent";
import { getGlobalSearchTitleDisplay } from "@/lib/global-search-title-display";
import type { GlobalSearchLibraryStatus, GlobalSearchResult } from "@/lib/global-search-types";
import { getMediaTypeLabel } from "@/lib/progress";

interface Props {
  result: GlobalSearchResult;
  libraryStatus: GlobalSearchLibraryStatus;
  isAdding: boolean;
  onAdd: (result: GlobalSearchResult, options?: { relatedOnly?: boolean }) => void;
}

function sourceBadge(source: GlobalSearchResult["source"]) {
  switch (source) {
    case "tvmaze": return { label: "TVMaze", cls: "bg-sky-500/15 text-sky-300 ring-sky-500/30" };
    case "anilist": return { label: "AniList", cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30" };
    case "openlibrary": return { label: "Open Library", cls: "bg-lime-500/15 text-lime-300 ring-lime-500/30" };
    case "tmdb": return { label: "TMDB", cls: "bg-teal-500/15 text-teal-200 ring-teal-500/30" };
    case "omdb": return { label: "OMDb", cls: "bg-amber-500/15 text-amber-200 ring-amber-500/30" };
  }
}

function TypeGlyph({ type, className }: { type: string; className?: string }) {
  if (type === "movie") return <Clapperboard className={className} />;
  if (type === "tv") return <Tv className={className} />;
  if (type === "anime") return <Sparkles className={className} />;
  if (["light_novel", "web_novel", "visual_novel"].includes(type)) return <Languages className={className} />;
  return <BookOpen className={className} />;
}

export default function GlobalSearchResultCard({ result, libraryStatus, isAdding, onAdd }: Props) {
  const badge = sourceBadge(result.source);
  const tags = (result.genres ?? result.subjects ?? []).slice(0, 3);
  const titleDisplay = getGlobalSearchTitleDisplay(result);
  const rawFormat = result.raw && typeof result.raw === "object" && "format" in result.raw
    ? (result.raw as { format?: unknown }).format
    : undefined;
  const classifiableLite = {
    type: result.type,
    externalSource: result.source,
    format: typeof rawFormat === "string" ? rawFormat : undefined,
  };

  return (
    <MediaCardShell className="min-w-0 h-full">
      <div className="flex min-w-0 flex-1 gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--app-surface-2)] ring-1 ring-[var(--app-border)] shadow-sm shadow-[var(--app-shadow)]">
          {result.coverUrl ? (
            <Image src={result.coverUrl} alt={result.title} fill unoptimized className="object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-[var(--app-text-muted)]">
              <TypeGlyph type={result.type} className="h-6 w-6" />
            </div>
          )}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-black/60 to-transparent" />
          <span className={`absolute left-1 top-1 inline-flex max-w-[calc(100%-0.5rem)] truncate rounded-md px-1.5 py-0.5 text-[9px] font-semibold ring-1 backdrop-blur-sm ${badge.cls}`}>
            {badge.label}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-start gap-2">
            <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--app-text-primary)] [overflow-wrap:anywhere] [word-break:normal]">
              {result.title}
            </h3>
            {result.releaseYear && <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--app-text-muted)]">{result.releaseYear}</span>}
          </div>
          {titleDisplay.secondary && <p className="truncate text-[11.5px] text-[var(--app-text-secondary)]">{titleDisplay.secondary}</p>}
          {titleDisplay.native && <p className="truncate text-[10.5px] text-[var(--app-text-muted)]">{titleDisplay.native}</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--app-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-text-secondary)] ring-1 ring-[var(--app-border)]">
              <TypeGlyph type={result.type} className="h-3 w-3 shrink-0" />
              <span className="truncate">{getMediaTypeLabel(result.type)}</span>
            </span>
            <ThemeSubBadge item={classifiableLite} compact />
          </div>
          {result.authors?.length ? <p className="truncate text-[11px] text-[var(--app-text-muted)]">{result.authors.slice(0, 2).join(", ")}</p> : null}
          {tags.length > 0 && (
            <div className="flex min-w-0 gap-1 overflow-hidden">
              {tags.map((tag) => <span key={tag} className="min-w-0 max-w-[9rem] truncate rounded bg-[var(--app-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--app-text-secondary)] ring-1 ring-[var(--app-border)]">{tag}</span>)}
            </div>
          )}
          <SearchResultDescription value={result.overview} className="text-[11.5px]" />
        </div>
      </div>

      <div className="mt-auto flex min-h-12 flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2.5 sm:px-4">
        {result.sourceUrl ? (
          <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-[11px] font-medium text-[var(--app-text-muted)] hover:text-[var(--app-accent)]" aria-label={`${badge.label} kaynak sayfasını aç`}>
            <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">Kaynak: {badge.label}</span>
          </a>
        ) : <span className="text-[11px] text-[var(--app-text-muted)]">{badge.label}</span>}
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {libraryStatus.isInLibrary ? (
            <>
              <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 text-[11px] font-semibold text-emerald-300/80 ring-1 ring-emerald-500/25"><Check className="h-3 w-3" />Listede</span>
              {libraryStatus.hasAddableParts && (
                <button type="button" onClick={() => onAdd(result, { relatedOnly: true })} disabled={isAdding} className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-500/15 px-2.5 text-[11px] font-semibold text-violet-200 ring-1 ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50">
                  {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  <span className="whitespace-nowrap">{libraryStatus.actionLabel ?? "Parça Ekle"}{libraryStatus.missingCount ? ` (${libraryStatus.missingCount})` : ""}</span>
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => onAdd(result)} disabled={isAdding} className="app-primary-action inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-50">
              {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Library className="h-3.5 w-3.5" />}
              {isAdding ? "Ekleniyor" : "Ekle"}
            </button>
          )}
        </div>
      </div>
    </MediaCardShell>
  );
}
