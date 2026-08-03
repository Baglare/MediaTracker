"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { getReleaseEventCalendarDate } from "@/features/calendar/domain/release-calendar";
import type { UseReleaseCalendarResult } from "@/features/calendar/hooks/use-release-calendar";
import type { ReleaseAgendaViewItem } from "@/features/calendar/services/release-calendar-service";

export interface UpcomingReleaseSummaryItem {
  id: string;
  relativeDate: string;
  title: string;
  detail: string;
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function releaseDetail(item: ReleaseAgendaViewItem): string {
  const parts: string[] = [];
  if (item.event.seasonIdentity) parts.push(`Sezon ${item.event.seasonIdentity.seasonNumber}`);
  if (item.event.episodeNumber) parts.push(`Bölüm ${item.event.episodeNumber}`);
  if (item.event.metadata?.episodeName) parts.push(item.event.metadata.episodeName);
  if (parts.length === 0) parts.push("Yeni yayın");
  return parts.join(" · ");
}

export function selectUpcomingReleaseSummary(
  releases: Pick<UseReleaseCalendarResult, "agenda" | "today" | "timeZone">,
): UpcomingReleaseSummaryItem[] {
  if (!releases.today) return [];
  return [
    ...releases.agenda.today,
    ...releases.agenda.next7Days,
    ...releases.agenda.next30Days,
  ]
    .filter(({ media }) => media.status !== "completed" && media.status !== "dropped")
    .flatMap((item) => {
      const date = getReleaseEventCalendarDate(item.event, { timeZone: releases.timeZone });
      if (!date) return [];
      const difference = dayNumber(date) - dayNumber(releases.today);
      const relativeDate = difference === 0
        ? "Bugün"
        : difference === 1
          ? "Yarın"
          : `${difference} gün sonra`;
      return [{
        id: item.event.id,
        relativeDate,
        title: item.media.title,
        detail: releaseDetail(item),
      }];
    })
    .slice(0, 3);
}

export function UpcomingReleaseSummary({
  releases,
  compact = false,
  className = "",
}: {
  releases: UseReleaseCalendarResult;
  compact?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const items = selectUpcomingReleaseSummary(releases);
  return (
    <section
      className={`rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] ${compact ? "p-3" : "p-4"} ${className}`}
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text-primary)]">
          <CalendarDays className="h-4 w-4 text-[var(--app-accent-strong)]" aria-hidden="true" />
          Yakında
        </h2>
        <Link href="/?tab=calendar" className="text-xs font-medium text-[var(--app-accent-strong)] hover:underline">
          Takvime git
        </Link>
      </div>
      {releases.loading && items.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--app-text-muted)]" aria-live="polite">Yayın takvimi yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--app-text-muted)]">Önümüzdeki 30 gün için görünür yayın yok.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="min-w-0 rounded-lg bg-[var(--app-surface-2)] px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <span className="line-clamp-2 min-w-0 text-xs font-medium text-[var(--app-text-primary)]">{item.title}</span>
                <span className="shrink-0 text-[10px] font-semibold text-[var(--app-accent-strong)]">{item.relativeDate}</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-[var(--app-text-muted)]">{item.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
