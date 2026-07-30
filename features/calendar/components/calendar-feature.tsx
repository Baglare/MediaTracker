"use client";

import Image from "next/image";
import { useMemo } from "react";
import { AlertTriangle, Calendar, RefreshCw } from "lucide-react";
import MediaCard from "@/components/media-card";
import PageHeader from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReleaseEvent } from "@/features/calendar/domain/release-calendar";
import { useReleaseCalendar } from "@/features/calendar/hooks/use-release-calendar";
import type { ReleaseAgendaViewItem } from "@/features/calendar/services/release-calendar-service";
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

function formatReleaseDate(event: ReleaseEvent): string {
  switch (event.date.precision) {
    case "exact_datetime":
      return new Date(event.date.dateTime).toLocaleString("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    case "date_only": {
      const [year, month, day] = event.date.date.split("-");
      return `${day}.${month}.${year}`;
    }
    case "month_only": {
      const [year, month] = event.date.month.split("-");
      return `${month}.${year}`;
    }
    case "year_only":
      return String(event.date.year);
    case "tba":
      return "Tarih açıklanmadı";
  }
}

function releaseDetail(event: ReleaseEvent): string {
  const parts: string[] = [];
  if (event.seasonIdentity) parts.push(`Sezon ${event.seasonIdentity.seasonNumber}`);
  if (event.episodeNumber) parts.push(`Bölüm ${event.episodeNumber}`);
  if (event.metadata?.releaseType) {
    parts.push(event.metadata.releaseType === "theatrical"
      ? "Sinema"
      : event.metadata.releaseType === "digital"
        ? "Dijital"
        : "Genel yayın");
  }
  return parts.join(" · ");
}

function providerLabel(event: ReleaseEvent): string {
  if (event.origin.kind === "manual") return "Manuel";
  if (event.origin.provider === "tvmaze") return "TVMaze";
  if (event.origin.provider === "anilist") return "AniList";
  if (event.origin.provider === "tmdb") return "TMDB";
  return event.origin.provider;
}

function AgendaGroup({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: ReleaseAgendaViewItem[];
  onOpen: (item: MediaItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
          {title}
        </h3>
        <span className="font-mono text-[10px] text-[var(--app-text-muted)]">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map(({ event, media, stale }) => (
          <button
            key={`${event.origin.kind}:${event.id}`}
            type="button"
            onClick={() => onOpen(media)}
            className="flex w-full gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-2.5 text-left transition-colors hover:border-[var(--app-border-strong)]"
          >
            <Image
              src={media.coverImage}
              alt=""
              width={44}
              height={64}
              unoptimized
              className="h-16 w-11 shrink-0 rounded-md object-cover"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-[var(--app-text-primary)]">
                {media.title}
              </span>
              {releaseDetail(event) && (
                <span className="mt-0.5 block truncate text-[11px] text-[var(--app-text-secondary)]">
                  {releaseDetail(event)}
                </span>
              )}
              <span className="mt-1 block text-[11px] text-[var(--app-accent)]">
                {formatReleaseDate(event)}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--app-text-muted)]">
                <span>{providerLabel(event)}</span>
                {event.metadata?.region && <span>· {event.metadata.region}</span>}
                {stale && (
                  <span className="rounded bg-amber-500/10 px-1 py-0.5 text-amber-400">
                    Eski cache
                  </span>
                )}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
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
  const releaseCount = Object.values(releases.agenda)
    .reduce((sum, items) => sum + items.length, 0);
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-[var(--app-text-muted)]">
                  {releases.lastUpdated
                    ? `Son yenileme: ${new Date(releases.lastUpdated).toLocaleString("tr-TR")}`
                    : "Henüz yenilenmedi"}
                </div>
                <button
                  type="button"
                  onClick={() => void releases.refresh()}
                  disabled={releases.refreshing || !libraryReady}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--app-text-secondary)] disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${releases.refreshing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  Yayınları yenile
                </button>
              </div>
              {releases.partialError && (
                <div className="mb-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Bazı yayın kaynakları yenilenemedi. Diğer kaynakların geçerli sonuçları gösteriliyor.
                </div>
              )}
              {releases.stale && (
                <p className="mb-3 text-[11px] text-amber-400">
                  Eski cache gösteriliyor; arka planda güncelleme deneniyor.
                </p>
              )}
              {releases.loading ? (
                <div className="rounded-xl border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface-2)] p-4 text-sm text-[var(--app-text-muted)]">
                  Yayın takvimi yükleniyor…
                </div>
              ) : releaseCount === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface-2)] p-4">
                  <p className="text-sm font-medium text-[var(--app-text-primary)]">
                    Yaklaşan yayın bulunamadı
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-text-muted)]">
                    Provider sonuç döndürmediğinde tahmini veya otomatik TBA olayı üretilmez.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {releases.refreshing && (
                    <p className="text-[11px] text-[var(--app-text-muted)]">
                      Mevcut sonuçlar gösterilirken yenileniyor…
                    </p>
                  )}
                  <AgendaGroup title="Bugün" items={releases.agenda.today} onOpen={commands.openDetail} />
                  <AgendaGroup title="Önümüzdeki 7 gün" items={releases.agenda.next7Days} onOpen={commands.openDetail} />
                  <AgendaGroup title="Önümüzdeki 30 gün" items={releases.agenda.next30Days} onOpen={commands.openDetail} />
                  <AgendaGroup title="Daha sonra" items={releases.agenda.later} onOpen={commands.openDetail} />
                  <AgendaGroup title="Tarihi açıklanmadı" items={releases.agenda.tba} onOpen={commands.openDetail} />
                </div>
              )}
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
