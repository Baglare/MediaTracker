"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { ManualReleaseEventDialog } from "@/features/calendar/components/manual-release-event-dialog";
import {
  deleteManualReleaseEvent,
  hideProviderReleaseEvent,
  restoreProviderReleaseEvent,
} from "@/features/calendar/domain/manual-release-calendar";
import type { ReleaseEvent } from "@/features/calendar/domain/release-calendar";
import {
  addReleaseCalendarDays,
  buildReleaseMonthGrid,
  canNavigateReleaseMonth,
  releaseMonthNavigationBounds,
  shiftReleaseMonth,
} from "@/features/calendar/domain/release-month";
import type { UseReleaseCalendarResult } from "@/features/calendar/hooks/use-release-calendar";
import {
  buildReleaseAgendaFromViewItems,
  filterReleaseCalendarViewItems,
  type ReleaseAgendaViewItem,
  type ReleaseMediaFilter,
} from "@/features/calendar/services/release-calendar-service";
import type { MediaItem } from "@/lib/types";
import type { ManualReleaseEvent } from "@/lib/types";

type CalendarView = "agenda" | "month";
const FILTERS: Array<{ value: ReleaseMediaFilter; label: string }> = [
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "movie", label: "Film" },
];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function fallbackToday(): string {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
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
  onHide,
  onEditManual,
  onDeleteManual,
}: {
  title: string;
  items: ReleaseAgendaViewItem[];
  onOpen: (item: MediaItem) => void;
  onHide?: (item: ReleaseAgendaViewItem) => void;
  onEditManual?: (media: MediaItem, event: ManualReleaseEvent) => void;
  onDeleteManual?: (media: MediaItem, event: ManualReleaseEvent) => void;
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
        {items.map((viewItem) => {
          const { event, media, stale } = viewItem;
          const manualEvent = event.origin.kind === "manual"
            ? media.releaseCalendar?.manualEvents.find((entry) => entry.id === event.id)
            : undefined;
          return (
          <div
            key={`${media.id}:${event.origin.kind}:${event.id}`}
            className="flex w-full gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-2.5 text-left motion-safe:transition-colors hover:border-[var(--app-border-strong)]"
          >
            <button
              type="button"
              onClick={() => onOpen(media)}
              className="flex min-w-0 flex-1 gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
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
                {event.origin.kind === "manual" && (
                  <span className="rounded bg-sky-500/10 px-1 py-0.5 text-sky-300">
                    Kalıcı manuel olay
                  </span>
                )}
              </span>
              </span>
            </button>
            <span className="flex shrink-0 flex-col gap-1">
              {event.origin.kind === "provider" && onHide && (
                <button
                  type="button"
                  aria-label={`${media.title} provider yayınını gizle`}
                  onClick={() => onHide(viewItem)}
                  className="rounded-lg border border-[var(--app-border)] p-1.5 text-[var(--app-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {manualEvent && onEditManual && (
                <button
                  type="button"
                  aria-label={`${manualEvent.title} manuel yayınını düzenle`}
                  onClick={() => onEditManual(media, manualEvent)}
                  className="rounded-lg border border-[var(--app-border)] p-1.5 text-[var(--app-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {manualEvent && onDeleteManual && (
                <button
                  type="button"
                  aria-label={`${manualEvent.title} manuel yayınını sil`}
                  onClick={() => onDeleteManual(media, manualEvent)}
                  className="rounded-lg border border-[var(--app-border)] p-1.5 text-[var(--app-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </span>
          </div>
        )})}
      </div>
    </div>
  );
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
  });
}

function dayLabel(date: string, eventCount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${label}, ${eventCount} yayın`;
}

export function ReleaseCalendarPanel({
  releases,
  mediaList,
  libraryReady,
  onOpen,
  onSave,
  onConfirm,
}: {
  releases: UseReleaseCalendarResult;
  mediaList: MediaItem[];
  libraryReady: boolean;
  onOpen: (item: MediaItem) => void;
  onSave: (item: MediaItem) => boolean;
  onConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmLabel?: string,
  ) => void;
}) {
  const [view, setView] = useState<CalendarView>("agenda");
  const [filters, setFilters] = useState<ReleaseMediaFilter[]>([
    "tv",
    "anime",
    "movie",
  ]);
  const initialToday = releases.today || fallbackToday();
  const [visibleMonth, setVisibleMonth] = useState(initialToday.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [editing, setEditing] = useState<{
    media?: MediaItem;
    event?: ManualReleaseEvent;
  } | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const filteredItems = useMemo(
    () => filterReleaseCalendarViewItems(releases.items, filters),
    [filters, releases.items],
  );
  const filteredAgenda = useMemo(
    () => buildReleaseAgendaFromViewItems({
      items: filteredItems,
      today: releases.today || initialToday,
      timeZone: releases.timeZone,
    }),
    [filteredItems, initialToday, releases.timeZone, releases.today],
  );
  const monthGrid = useMemo(
    () => buildReleaseMonthGrid({
      events: filteredItems.map(({ event }) => event),
      month: visibleMonth,
      today: releases.today || initialToday,
      selectedDate,
      options: { timeZone: releases.timeZone },
    }),
    [filteredItems, initialToday, releases.timeZone, releases.today, selectedDate, visibleMonth],
  );
  const itemByEvent = useMemo(
    () => new Map(filteredItems.map((item) => [item.event, item])),
    [filteredItems],
  );
  const selectedItems = monthGrid.days
    .find((day) => day.date === selectedDate)?.events
    .flatMap((event) => {
      const item = itemByEvent.get(event);
      return item ? [item] : [];
    }) ?? [];
  const releaseCount = filteredItems.length;
  const today = releases.today || initialToday;
  const bounds = releaseMonthNavigationBounds(today);

  const toggleFilter = (filter: ReleaseMediaFilter) => {
    setFilters((current) =>
      current.includes(filter)
        ? current.filter((value) => value !== filter)
        : [...current, filter]);
  };
  const navigateMonth = (direction: -1 | 1) => {
    if (!canNavigateReleaseMonth(visibleMonth, direction, today)) return;
    const target = shiftReleaseMonth(visibleMonth, direction);
    setVisibleMonth(target);
    const firstDay = `${target}-01`;
    setSelectedDate(firstDay < today ? today : firstDay > bounds.horizonDate
      ? bounds.horizonDate
      : firstDay);
  };
  const selectDay = (date: string) => {
    if (date < today || date > bounds.horizonDate) return;
    setSelectedDate(date);
    setVisibleMonth(date.slice(0, 7));
  };
  const moveSelectedDay = (amount: number) => {
    const target = addReleaseCalendarDays(selectedDate, amount);
    selectDay(target);
  };
  const hideProvider = (item: ReleaseAgendaViewItem) => {
    const hidden = hideProviderReleaseEvent(item.media, item.event);
    if (hidden.ok) onSave(hidden.item);
  };
  const deleteManual = (media: MediaItem, event: ManualReleaseEvent) => {
    onConfirm(
      "Manuel yayını sil",
      `"${event.title}" manuel yayın olayı silinecek. Emin misin?`,
      () => { onSave(deleteManualReleaseEvent(media, event.id)); },
      "Sil",
    );
  };
  const agendaActions = {
    onHide: hideProvider,
    onEditManual: (media: MediaItem, event: ManualReleaseEvent) =>
      setEditing({ media, event }),
    onDeleteManual: deleteManual,
  };

  return (
    <>
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
          aria-label="Yayın verilerini yenile"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--app-text-secondary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 motion-reduce:animate-none ${releases.refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Yayınları yenile
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] p-0.5">
          {(["agenda", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option === "agenda" ? "Ajanda görünümünü göster" : "Aylık görünümü göster"}
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
                view === option
                  ? "bg-[var(--app-accent)] text-white"
                  : "text-[var(--app-text-secondary)]"
              }`}
            >
              {option === "agenda" ? "Ajanda" : "Ay"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Medya türü filtreleri">
          {FILTERS.map((filter) => {
            const active = filters.includes(filter.value);
            return (
              <button
                key={filter.value}
                type="button"
                aria-label={`${filter.label} yayınlarını ${active ? "gizle" : "göster"}`}
                aria-pressed={active}
                onClick={() => toggleFilter(filter.value)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
                  active
                    ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                    : "border-[var(--app-border)] text-[var(--app-text-muted)]"
                }`}
              >
                {filter.label} {active ? "açık" : "kapalı"}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing({})}
          disabled={!libraryReady || mediaList.every((media) =>
            media.status === "completed" || media.status === "dropped")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Manuel yayın ekle
        </button>
        <button
          type="button"
          aria-expanded={showHidden}
          onClick={() => setShowHidden((current) => !current)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 py-1.5 text-[11px] text-[var(--app-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Gizlenen yayınları yönet ({releases.hiddenItems.length})
        </button>
      </div>
      {showHidden && (
        <div className="mb-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3">
          <h3 className="text-xs font-semibold text-[var(--app-text-primary)]">Gizlenen provider yayınları</h3>
          {releases.hiddenItems.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--app-text-muted)]">Gizlenen yayın yok.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {releases.hiddenItems.map((item) => (
                <div
                  key={`${item.media.id}:${item.key}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] p-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-[var(--app-text-primary)]">
                      {item.media.title}
                    </span>
                    <span className="block truncate text-[10px] text-[var(--app-text-muted)]">
                      {item.event?.title ?? "Provider cache’inde artık bulunmayan olay"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSave(restoreProviderReleaseEvent(item.media, item.key))}
                    className="shrink-0 rounded-lg border border-[var(--app-border)] px-2 py-1 text-[10px] text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                  >
                    Geri getir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
            Seçili filtrelerde yayın yok. Provider sonuç döndürmediğinde tahmini TBA üretilmez.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {releases.refreshing && (
            <p className="text-[11px] text-[var(--app-text-muted)]">
              Mevcut sonuçlar gösterilirken yenileniyor…
            </p>
          )}
          {view === "agenda" ? (
            <>
              <AgendaGroup title="Bugün" items={filteredAgenda.today} onOpen={onOpen} {...agendaActions} />
              <AgendaGroup title="Önümüzdeki 7 gün" items={filteredAgenda.next7Days} onOpen={onOpen} {...agendaActions} />
              <AgendaGroup title="Önümüzdeki 30 gün" items={filteredAgenda.next30Days} onOpen={onOpen} {...agendaActions} />
              <AgendaGroup title="Daha sonra" items={filteredAgenda.later} onOpen={onOpen} {...agendaActions} />
              <AgendaGroup title="Tarihi açıklanmadı" items={filteredAgenda.tba} onOpen={onOpen} {...agendaActions} />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold capitalize text-[var(--app-text-primary)]">
                    {monthLabel(visibleMonth)}
                  </h3>
                  <p className="text-[10px] text-[var(--app-text-muted)]">
                    Pazartesi başlayan yerel takvim · 90 günlük yayın ufku
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Önceki aya git"
                    onClick={() => navigateMonth(-1)}
                    disabled={!canNavigateReleaseMonth(visibleMonth, -1, today)}
                    className="rounded-lg border border-[var(--app-border)] p-1.5 text-[var(--app-text-secondary)] disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Bugünün ayına dön"
                    onClick={() => {
                      setVisibleMonth(today.slice(0, 7));
                      setSelectedDate(today);
                    }}
                    className="rounded-lg border border-[var(--app-border)] px-2 py-1.5 text-[10px] font-medium text-[var(--app-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                  >
                    Bugün
                  </button>
                  <button
                    type="button"
                    aria-label="Sonraki aya git"
                    onClick={() => navigateMonth(1)}
                    disabled={!canNavigateReleaseMonth(visibleMonth, 1, today)}
                    className="rounded-lg border border-[var(--app-border)] p-1.5 text-[var(--app-text-secondary)] disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="min-w-0 overflow-hidden" role="grid" aria-label={`${monthLabel(visibleMonth)} yayın takvimi`}>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day) => (
                    <div
                      key={day}
                      role="columnheader"
                      className="py-1 text-center text-[9px] font-semibold uppercase text-[var(--app-text-muted)] sm:text-[10px]"
                    >
                      {day}
                    </div>
                  ))}
                  {monthGrid.days.map((day) => (
                    <div
                      key={day.date}
                      role="gridcell"
                      aria-selected={day.isSelected}
                      onClick={() => selectDay(day.date)}
                      className={`min-h-20 min-w-0 overflow-hidden rounded-lg border p-1 text-left align-top motion-safe:transition-colors sm:min-h-24 ${
                        day.isSelected
                          ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                          : day.inCurrentMonth
                            ? "border-[var(--app-border)] bg-[var(--app-surface-2)]"
                            : "border-transparent bg-[var(--app-surface-1)] opacity-45"
                      } ${day.inHorizon ? "" : "cursor-not-allowed opacity-30"}`}
                    >
                      <button
                        type="button"
                        aria-label={dayLabel(day.date, day.events.length)}
                        aria-current={day.isToday ? "date" : undefined}
                        disabled={!day.inHorizon}
                        onClick={() => selectDay(day.date)}
                        onKeyDown={(event) => {
                          const moves: Partial<Record<string, number>> = {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                            ArrowDown: 7,
                          };
                          const amount = moves[event.key];
                          if (amount === undefined) return;
                          event.preventDefault();
                          moveSelectedDay(amount);
                        }}
                        className="flex w-full items-center justify-between gap-1 rounded text-[10px] font-semibold text-[var(--app-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                      >
                        <span>{day.dayNumber}</span>
                        {day.isToday && <span className="truncate text-[8px] text-[var(--app-accent)]">Bugün</span>}
                        {day.isSelected && !day.isToday && (
                          <span className="truncate text-[8px] text-[var(--app-accent)]">Seçili</span>
                        )}
                      </button>
                      <div className="mt-1 space-y-1">
                        {day.visibleEvents.map((event) => {
                          const item = itemByEvent.get(event);
                          return (
                            <button
                              type="button"
                              key={`${event.mediaRecordId}:${event.id}`}
                              aria-label={`${item?.media.title ?? event.title} medya detayını aç`}
                              onClick={() => {
                                selectDay(day.date);
                                if (item) onOpen(item.media);
                              }}
                              className="block w-full truncate rounded bg-[var(--app-accent-soft)] px-1 py-0.5 text-left text-[8px] text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] sm:text-[9px]"
                            >
                              {item?.media.title ?? event.title}
                            </button>
                          );
                        })}
                        {day.overflowCount > 0 && (
                          <span className="block text-[8px] font-semibold text-[var(--app-text-muted)]">
                            +{day.overflowCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-3">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-muted)]">
                  Seçili gün · {selectedDate}
                </h3>
                {selectedItems.length > 0 ? (
                  <AgendaGroup title="Yayınlar" items={selectedItems} onOpen={onOpen} {...agendaActions} />
                ) : (
                  <p className="text-xs text-[var(--app-text-muted)]">Bu günde yayın yok.</p>
                )}
              </div>
              <AgendaGroup title="Tarihi açıklanmadı" items={filteredAgenda.tba} onOpen={onOpen} {...agendaActions} />
            </>
          )}
        </div>
      )}
      {editing && (
        <ManualReleaseEventDialog
          key={`${editing.media?.id ?? "new"}:${editing.event?.id ?? "create"}`}
          mediaList={mediaList}
          initialMedia={editing.media}
          editingEvent={editing.event}
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
