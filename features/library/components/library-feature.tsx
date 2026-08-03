"use client";

import type { ComponentType } from "react";
import { ChevronDown, Layers, Library as LibraryIcon, PlayCircle } from "lucide-react";
import LibraryControlBar, {
  LibrarySectionControls,
  type LibrarySort,
  type LibraryView,
} from "@/components/library-control-bar";
import MediaCard from "@/components/media-card";
import { StatusFilterRow, type EastSubFilter, type ThemeFilter } from "@/components/media-filters";
import SeriesGroupCard from "@/components/series-group-card";
import WorldHero from "@/components/world-hero";
import type { MediaCommands } from "@/features/library/hooks/use-media-commands";
import type { LibraryReadModel } from "@/features/library/domain/selectors";
import type { MediaItem, MediaStatus, MediaType } from "@/lib/types";

export interface RelatedMediaAction {
  canAdd: boolean;
  label: string;
}

interface LibraryFeatureProps {
  mediaList: MediaItem[];
  model: LibraryReadModel;
  commands: MediaCommands;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  themeFilter: ThemeFilter;
  onThemeChange: (value: ThemeFilter) => void;
  eastSubFilter: EastSubFilter;
  onEastSubChange: (value: EastSubFilter) => void;
  typeFilter: MediaType | "all";
  onTypeChange: (value: MediaType | "all") => void;
  statusFilter: MediaStatus | "active" | "all";
  onStatusChange: (value: MediaStatus | "active" | "all") => void;
  librarySort: LibrarySort;
  onSortChange: (value: LibrarySort) => void;
  libraryView: LibraryView;
  onViewChange: (value: LibraryView) => void;
  continueSectionOpen: boolean;
  onContinueSectionOpenChange: (value: boolean) => void;
  seriesSectionOpen: boolean;
  onSeriesSectionOpenChange: (value: boolean) => void;
  resolveRelatedAction: (item: MediaItem) => RelatedMediaAction;
  onAddRelatedParts: (item: MediaItem) => void;
}

interface SectionHeadingProps {
  title: string;
  count: number;
  icon: ComponentType<{ className?: string }>;
  hint?: string;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
  actions?: React.ReactNode;
}

function SectionHeading({
  title,
  count,
  icon: Icon,
  hint,
  open,
  onOpenChange,
  actions,
}: SectionHeadingProps) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {onOpenChange && (
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-[var(--app-text-muted)] transition-transform ${
              open ? "rotate-0" : "-rotate-90"
            }`}
          />
        )}
        <Icon className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
        <span className="truncate text-[15px] font-semibold tracking-tight text-[var(--app-text-primary)]">
          {title}
        </span>
        <span className="shrink-0 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-2)] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[var(--app-text-muted)]">
          {count}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-3">
        {hint && <span className="text-[11px] text-[var(--app-text-muted)]">{hint}</span>}
        {actions}
      </span>
    </>
  );

  const className =
    "mb-3 flex w-full flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-[var(--app-border)] pb-2 text-left";

  return onOpenChange ? (
    <button
      type="button"
      className={className}
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export default function LibraryFeature({
  mediaList,
  model,
  commands,
  searchQuery,
  onSearchChange,
  themeFilter,
  onThemeChange,
  eastSubFilter,
  onEastSubChange,
  typeFilter,
  onTypeChange,
  statusFilter,
  onStatusChange,
  librarySort,
  onSortChange,
  libraryView,
  onViewChange,
  continueSectionOpen,
  onContinueSectionOpenChange,
  seriesSectionOpen,
  onSeriesSectionOpenChange,
  resolveRelatedAction,
  onAddRelatedParts,
}: LibraryFeatureProps) {
  const gridClass =
    libraryView === "list"
      ? "grid grid-cols-1 gap-3 items-start"
      : "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 items-start";

  const renderCard = (item: MediaItem) => {
    const related = resolveRelatedAction(item);
    return (
      <MediaCard
        key={item.id}
        item={item}
        onIncrement={commands.mutations.increment}
        onComplete={commands.mutations.complete}
        onEdit={commands.openEdit}
        onDelete={commands.requestDelete}
        onToggleFavorite={commands.mutations.toggleFavorite}
        onOpenDetail={commands.openDetail}
        onAddRelatedParts={onAddRelatedParts}
        relatedPartsLabel={related.label}
        canAddRelatedParts={related.canAdd}
        onOpenGroupEdit={commands.openGroup}
        onUpdateRating={commands.mutations.updateRating}
      />
    );
  };

  return (
    <div className="space-y-[var(--app-section-gap)]">
      <LibraryControlBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        themeFilter={themeFilter}
        onThemeChange={onThemeChange}
        onAddMedia={commands.openAdd}
        resultCount={model.filtered.length}
      />
      <WorldHero
        themeFilter={themeFilter}
        eastSub={eastSubFilter}
        onEastSubChange={onEastSubChange}
        typeFilter={typeFilter}
        onTypeChange={onTypeChange}
      />
      <StatusFilterRow
        activeStatus={statusFilter}
        onStatusChange={onStatusChange}
      />

      {model.filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--app-surface-2)]">
            <span className="text-3xl" aria-hidden="true">🔍</span>
          </div>
          <p className="text-sm text-[var(--app-text-secondary)]">Sonuç bulunamadı</p>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
            Arama veya filtrelerini değiştirerek tekrar dene.
          </p>
        </div>
      ) : (
        <div className="space-y-[var(--app-section-gap)]">
          {model.continueItems.length > 0 && (
            <section aria-label="Devam Ettiklerim">
              <SectionHeading
                title="Devam Ettiklerim"
                count={model.continueItems.length}
                icon={PlayCircle}
                hint="Son aktiviteye göre"
                open={continueSectionOpen}
                onOpenChange={onContinueSectionOpenChange}
              />
              {continueSectionOpen && (
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {model.continueItems.map(renderCard)}
                </div>
              )}
            </section>
          )}

          {model.seriesGroups.length > 0 && (
            <section aria-label="Seri Koleksiyonlarım">
              <SectionHeading
                title="Seri Koleksiyonlarım"
                count={model.seriesGroups.length}
                icon={Layers}
                open={seriesSectionOpen}
                onOpenChange={onSeriesSectionOpenChange}
              />
              {seriesSectionOpen && (
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {model.seriesGroups.map((group) => (
                    <SeriesGroupCard
                      key={group.key}
                      group={group}
                      onIncrement={commands.mutations.increment}
                      onComplete={commands.mutations.complete}
                      onEdit={commands.openEdit}
                      onDelete={commands.requestDelete}
                      onToggleFavorite={commands.mutations.toggleFavorite}
                      onOpenDetail={commands.openDetail}
                      onAddRelatedParts={onAddRelatedParts}
                      resolveRelatedAction={resolveRelatedAction}
                      onOpenGroupEdit={commands.openGroup}
                      onUpdateRating={commands.mutations.updateRating}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <section aria-label="Kütüphanem">
            <SectionHeading
              title="Kütüphanem"
              count={model.singletonItems.length}
              icon={LibraryIcon}
              actions={
                <span onClick={(event) => event.stopPropagation()}>
                  <LibrarySectionControls
                    sortBy={librarySort}
                    onSortChange={onSortChange}
                    viewMode={libraryView}
                    onViewChange={onViewChange}
                  />
                </span>
              }
            />
            <div className={gridClass}>{model.singletonItems.map(renderCard)}</div>
          </section>
        </div>
      )}
      <span className="sr-only">{mediaList.length} toplam medya</span>
    </div>
  );
}
