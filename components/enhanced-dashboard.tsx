"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle,
  Clock,
  Heart,
  LayoutGrid,
  PlayCircle,
  Star,
} from "lucide-react";
import MediaCard from "./media-card";
import { DashboardStats } from "@/lib/dashboard-stats";
import {
  formatProgressLogAction,
  formatProgressLogDateTime,
  formatProgressLogDetail,
  getDisplayProgressLogs,
} from "@/lib/activity-log";
import { MediaItem, ProgressLog, withMediaClassification } from "@/lib/types";

interface EnhancedDashboardProps {
  stats: DashboardStats;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  onSelectMedia: (item: MediaItem) => void;
  onIncrement: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteMedia: (id: string) => void;
  onUpdateRating?: (id: string, rating: number | null) => void;
}

type SegmentTone = "amber" | "emerald" | "violet" | "sky" | "rose" | "zinc";

function progressRatio(item: MediaItem): number {
  return item.totalProgress > 0 ? item.currentProgress / item.totalProgress : -1;
}

function DashboardMetric({
  label,
  value,
  hint,
  tone = "zinc",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: SegmentTone;
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-200"
      : tone === "emerald"
        ? "text-emerald-200"
        : tone === "violet"
          ? "text-violet-200"
          : tone === "sky"
            ? "text-sky-200"
            : tone === "rose"
              ? "text-rose-200"
              : "text-zinc-100";

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/35 px-4 py-3 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold truncate">
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums truncate ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500 truncate">{hint}</div>}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  count,
  hint,
}: {
  icon: typeof Activity;
  title: string;
  count?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-2 border-b border-zinc-800/50">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-amber-400/80 shrink-0" />
        <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight truncate">
          {title}
        </h2>
        {typeof count === "number" && (
          <span className="text-[11px] font-mono tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 shrink-0">
            {count}
          </span>
        )}
      </div>
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </div>
  );
}

function MiniBar({
  label,
  value,
  total,
  tone = "amber",
}: {
  label: string;
  value: number;
  total: number;
  tone?: SegmentTone;
}) {
  const width = total > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / total) * 100)) : 0;
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-400"
      : tone === "violet"
        ? "bg-violet-400"
        : tone === "sky"
          ? "bg-sky-400"
          : tone === "rose"
            ? "bg-rose-400"
            : tone === "zinc"
              ? "bg-zinc-400"
              : "bg-amber-400";

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-xs text-zinc-300 truncate">{label}</span>
        <span className="text-xs font-mono tabular-nums text-zinc-500 shrink-0">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800/70 overflow-hidden">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/25 px-6 py-16 sm:py-20 text-center">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800/80 grid place-items-center mb-4">
        <LayoutGrid className="w-7 h-7 text-amber-400/80" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-100">Dashboard hazır, kütüphane boş</h2>
      <p className="mt-2 max-w-md mx-auto text-sm text-zinc-500 leading-relaxed">
        Medya ekledikçe devam ettiklerin, bitirmeye yakın kayıtların, aktivitelerin ve dağılımların burada görünür.
      </p>
    </div>
  );
}

export default function EnhancedDashboard({
  stats,
  mediaList,
  progressLogs,
  onSelectMedia,
  onIncrement,
  onComplete,
  onEdit,
  onToggleFavorite,
  onDeleteMedia,
  onUpdateRating,
}: EnhancedDashboardProps) {
  if (mediaList.length === 0) return <EmptyDashboard />;

  const lastLogAt = new Map<string, number>();
  for (const log of progressLogs) {
    const t = new Date(log.createdAt).getTime();
    const prev = lastLogAt.get(log.mediaId) ?? 0;
    if (t > prev) lastLogAt.set(log.mediaId, t);
  }

  const startedOpenItems = mediaList
    .filter((item) => {
      if (item.status === "watching" || item.status === "reading") return true;
      return (
        item.currentProgress > 0 &&
        item.status !== "completed" &&
        item.status !== "dropped"
      );
    })
    .slice()
    .sort((a, b) => (lastLogAt.get(b.id) ?? 0) - (lastLogAt.get(a.id) ?? 0));

  const nearCompletion = mediaList
    .filter(
      (item) =>
        item.status !== "completed" &&
        item.status !== "dropped" &&
        item.totalProgress > 0 &&
        progressRatio(item) >= 0.75,
    )
    .slice()
    .sort((a, b) => progressRatio(b) - progressRatio(a));

  const ratedItems = mediaList.filter(
    (item) => typeof item.userRating === "number" && Number.isFinite(item.userRating),
  );
  const averageRating =
    ratedItems.length > 0
      ? (ratedItems.reduce((sum, item) => sum + (item.userRating ?? 0), 0) / ratedItems.length).toFixed(1)
      : "—";
  const highRated = ratedItems
    .slice()
    .sort((a, b) => (b.userRating ?? -1) - (a.userRating ?? -1))
    .slice(0, 6);
  const favoritePick = mediaList
    .filter((item) => item.favorite)
    .slice()
    .sort((a, b) => (lastLogAt.get(b.id) ?? 0) - (lastLogAt.get(a.id) ?? 0))
    .slice(0, 3);
  const recentLogs = getDisplayProgressLogs(progressLogs, 8);

  const statusRows = [
    { label: "Devam", value: stats.inProgressItems, tone: "amber" as const },
    { label: "Tamam", value: stats.completedItems, tone: "emerald" as const },
    { label: "Plan", value: stats.planningItems, tone: "sky" as const },
    { label: "Durak", value: stats.pausedItems, tone: "violet" as const },
    { label: "Bırak", value: stats.droppedItems, tone: "rose" as const },
  ];

  const worldCounts = mediaList.reduce(
    (acc, item) => {
      const cls = withMediaClassification(item);
      if (cls.theme === "east") acc.east += 1;
      else if (cls.theme === "screen") acc.screen += 1;
      else if (cls.theme === "library") acc.library += 1;
      else acc.other += 1;
      return acc;
    },
    { east: 0, screen: 0, library: 0, other: 0 },
  );

  const completionPct =
    stats.totalItems > 0 ? Math.round((stats.completedItems / stats.totalItems) * 100) : 0;

  const renderCard = (item: MediaItem, key?: string) => (
    <MediaCard
      key={key ?? item.id}
      item={item}
      onIncrement={onIncrement}
      onComplete={onComplete}
      onEdit={onEdit}
      onDelete={onDeleteMedia}
      onToggleFavorite={onToggleFavorite}
      onOpenDetail={onSelectMedia}
      onUpdateRating={onUpdateRating}
    />
  );

  return (
    <div className="space-y-8 min-w-0">
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
        <div className="p-5 sm:p-6 lg:p-7">
          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-amber-300/80 font-semibold">
                <BarChart3 className="w-4 h-4" />
                Kütüphane özeti
              </div>
              <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-4">
                <div>
                  <div className="text-5xl sm:text-6xl font-semibold tracking-tight text-zinc-50 tabular-nums">
                    {completionPct}%
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    Tamamlanan oranı · {stats.completedItems} / {stats.totalItems}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-3 rounded-full bg-zinc-800/80 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-sky-400"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-zinc-500">
                    <span>{stats.inProgressItems} devam</span>
                    <span>{nearCompletion.length} bitmeye yakın</span>
                    <span>{stats.logsThisWeek} aktivite / 7 gün</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DashboardMetric label="Toplam medya" value={stats.totalItems} tone="amber" />
              <DashboardMetric label="Devam eden" value={startedOpenItems.length} tone="violet" />
              <DashboardMetric label="Tamamlanan" value={stats.completedItems} tone="emerald" />
              <DashboardMetric label="Planlanan" value={stats.planningItems} tone="sky" />
              <DashboardMetric label="Son 7 gün" value={stats.logsThisWeek} hint="aktivite" />
              <DashboardMetric label="Ortalama puan" value={averageRating} tone="amber" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.45fr)] 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)] gap-8">
        <div className="space-y-8 min-w-0">
          {startedOpenItems.length > 0 && (
            <section className="space-y-3">
              <SectionTitle icon={PlayCircle} title="Devam Ettiklerin" count={startedOpenItems.length} hint="Son aktiviteye göre" />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {startedOpenItems.slice(0, 6).map((item) => renderCard(item, `continue-${item.id}`))}
              </div>
            </section>
          )}

          {nearCompletion.length > 0 && (
            <section className="space-y-3">
              <SectionTitle icon={CheckCircle} title="Bitirmeye Yakın" count={nearCompletion.length} hint="%75 ve üzeri" />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {nearCompletion.slice(0, 6).map((item) => renderCard(item, `near-${item.id}`))}
              </div>
            </section>
          )}

          {highRated.length > 0 && (
            <section className="space-y-3">
              <SectionTitle icon={Star} title="Puanı Yüksekler" count={highRated.length} hint="En yüksek puanlar" />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {highRated.map((item) => renderCard(item, `rated-${item.id}`))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6 min-w-0">
          <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4">
            <SectionTitle icon={Activity} title="Son Aktiviteler" count={recentLogs.length} />
            {recentLogs.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Henüz aktivite kaydı yok.</p>
            ) : (
              <div className="mt-4 divide-y divide-zinc-800/60">
                {recentLogs.map((log) => (
                  <div key={log.id} className="py-3 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{log.mediaTitle}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          <span className="text-zinc-300">{formatProgressLogAction(log)}</span>
                          <span className="mx-1.5 text-zinc-700">•</span>
                          {formatProgressLogDetail(log)}
                        </p>
                      </div>
                      <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">
                        {formatProgressLogDateTime(log.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4">
            <SectionTitle icon={BookOpen} title="Dünya Dağılımı" count={stats.totalItems} />
            <div className="mt-4 space-y-3">
              <MiniBar label="Doğu" value={worldCounts.east} total={stats.totalItems} tone="rose" />
              <MiniBar label="Kadraj" value={worldCounts.screen} total={stats.totalItems} tone="violet" />
              <MiniBar label="Arşiv" value={worldCounts.library} total={stats.totalItems} tone="emerald" />
              {worldCounts.other > 0 && (
                <MiniBar label="Diğer" value={worldCounts.other} total={stats.totalItems} tone="zinc" />
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4">
            <SectionTitle icon={Clock} title="Durum Dağılımı" count={stats.totalItems} />
            <div className="mt-4 space-y-3">
              {statusRows.map((row) => (
                <MiniBar key={row.label} label={row.label} value={row.value} total={stats.totalItems} tone={row.tone} />
              ))}
            </div>
          </section>

          {favoritePick.length > 0 && (
            <section className="space-y-3">
              <SectionTitle icon={Heart} title="Favorilerden Seçki" count={favoritePick.length} />
              <div className="grid grid-cols-1 gap-4 items-start">
                {favoritePick.map((item) => renderCard(item, `favorite-${item.id}`))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
