"use client";

import { useMemo } from "react";
import { Calendar } from "lucide-react";
import MediaCard from "@/components/media-card";
import PageHeader from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ReleaseCalendarPanel } from "@/features/calendar/components/release-calendar-panel";
import { useReleaseCalendar } from "@/features/calendar/hooks/use-release-calendar";
import { selectCalendarReadModel } from "@/features/calendar/domain/selectors";
import type { RelatedMediaAction } from "@/features/library/components/library-feature";
import type { MediaCommands } from "@/features/library/hooks/use-media-commands";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { MediaItem, ProgressLog } from "@/lib/types";

interface CalendarFeatureProps {
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  commands: MediaCommands;
  resolveRelatedAction: (item: MediaItem) => RelatedMediaAction;
  onAddRelatedParts: (item: MediaItem) => void;
  ownerScope: LocalOwnerScope | null;
  libraryReady: boolean;
}

function CalendarSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-[var(--app-text-primary)]">{title}</h2>
        {count !== undefined && (
          <span className="shrink-0 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-2)] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[var(--app-text-muted)]">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export default function CalendarFeature({
  mediaList,
  progressLogs,
  commands,
  resolveRelatedAction,
  onAddRelatedParts,
  ownerScope,
  libraryReady,
}: CalendarFeatureProps) {
  const model = useMemo(
    () => selectCalendarReadModel(mediaList, progressLogs),
    [mediaList, progressLogs],
  );
  const releases = useReleaseCalendar({ ownerScope, mediaList, libraryReady });
  const releaseCount = releases.items.length;
  const today = new Date().toLocaleDateString("tr-TR");
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
    <div>
      <PageHeader
        icon={Calendar}
        title="Takvim"
        subtitle="Kütüphanendeki gerçek aktivite ve takip durumlarını ajanda olarak gör."
      />
      {model.recentLogs.length
        + model.plannedItems.length
        + model.activeItems.length
        + releaseCount === 0
        && !releases.loading ? (
        <EmptyState
          title="Takvimde gösterilecek veri yok"
          description="İlerleme kaydı oluştuğunda, planlanan veya devam eden medyalar eklendiğinde ajanda burada görünür."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <CalendarSection title="Bugünkü / son aktiviteler" count={model.recentLogs.length}>
              {model.recentLogs.length === 0 ? (
                <p className="text-sm text-[var(--app-text-muted)]">Henüz aktivite kaydı yok.</p>
              ) : (
                <div className="space-y-4">
                  {[...model.logsByDate.entries()].map(([date, logs]) => (
                    <div key={date}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                        {date === today ? "Bugün" : date}
                      </p>
                      <div className="space-y-2">
                        {logs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-[12.5px] font-medium text-[var(--app-text-primary)]">
                                {log.mediaTitle}
                              </span>
                              <span className="shrink-0 text-[11px] text-[var(--app-accent)]">
                                {log.action === "complete" ? "Tamamlandı" : "İlerleme"}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-[var(--app-text-muted)]">
                              {new Date(log.createdAt).toLocaleTimeString("tr-TR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {log.detail ? ` · ${log.detail}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CalendarSection>
            <CalendarSection title="Yaklaşan yayınlar" count={releaseCount}>
              <ReleaseCalendarPanel
                key={ownerScope?.key ?? "owner-pending"}
                releases={releases}
                libraryReady={libraryReady}
                onOpen={commands.openDetail}
              />
            </CalendarSection>
          </div>
          <CalendarSection title="Planlanan içerikler" count={model.plannedItems.length}>
            {model.plannedItems.length === 0 ? (
              <p className="text-sm text-[var(--app-text-muted)]">Planlanan içerik yok.</p>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {model.plannedItems.map(renderCard)}
              </div>
            )}
          </CalendarSection>
          <CalendarSection title="Devam eden içerikler" count={model.activeItems.length}>
            {model.activeItems.length === 0 ? (
              <p className="text-sm text-[var(--app-text-muted)]">Devam eden içerik yok.</p>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {model.activeItems.map(renderCard)}
              </div>
            )}
          </CalendarSection>
        </div>
      )}
    </div>
  );
}
