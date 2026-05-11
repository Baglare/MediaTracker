"use client";

// ============================================
// Right Rail (R4: Layout Redesign)
// ============================================
// 5 widget halinde compact dashboard paneli. App shell, Kütüphanem section
// layout, MediaCard/SeriesGroupCard davranışı bozulmuyor — bu component
// salt okuma. Tüm veri parent'tan (app/page.tsx) prop olarak geliyor;
// yeni API/data model eklenmedi. Türetimler memo'lu helper'larda.
//
// xl (≥1280px) altında gizli; main column daha rahat nefes alsın.

import { useMemo } from "react";
import {
  Target,
  Activity,
  Calendar,
  Sparkles,
  PlayCircle,
  CheckCircle2,
  Clock,
  ListTodo,
  TrendingUp,
} from "lucide-react";
import { MediaItem, ProgressLog, ProgressLogAction } from "@/lib/types";
import { DashboardStats } from "@/lib/dashboard-stats";

interface RightRailProps {
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  stats: DashboardStats;
  onOpenDetail?: (item: MediaItem) => void;
}

// --- Helpers ---------------------------------------------------------------

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}g`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}h`;
  return `${Math.floor(d / 30)}ay`;
}

function actionVerb(a: ProgressLogAction): string {
  switch (a) {
    case "increment":
      return "ilerletildi";
    case "complete":
      return "tamamlandı";
    case "manual_adjust":
      return "güncellendi";
    case "added":
      return "eklendi";
  }
}

function actionTone(
  a: ProgressLogAction,
): "violet" | "emerald" | "amber" | "sky" {
  switch (a) {
    case "complete":
      return "emerald";
    case "increment":
      return "violet";
    case "added":
      return "sky";
    case "manual_adjust":
      return "amber";
  }
}

// --- Widget shell ----------------------------------------------------------

function Widget({
  title,
  icon: Icon,
  eyebrow,
  iconTone = "amber",
  children,
}: {
  title: string;
  icon: typeof Target;
  eyebrow?: string;
  iconTone?: "amber" | "violet" | "emerald";
  children?: React.ReactNode;
}) {
  const iconClass =
    iconTone === "violet"
      ? "text-violet-300"
      : iconTone === "emerald"
        ? "text-emerald-300"
        : "text-amber-400/90";
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-200 tracking-tight">
          <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
          {title}
        </div>
        {eyebrow && (
          <span className="text-[9.5px] font-mono tracking-[0.14em] text-zinc-600 uppercase">
            {eyebrow}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// --- 1) Genel İlerleme -----------------------------------------------------

function OverallWidget({ stats }: { stats: DashboardStats }) {
  const total = stats.totalItems;
  const completed = stats.completedItems;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Compact SVG ring
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - percent / 100);

  return (
    <Widget title="Genel İlerleme" icon={Target} eyebrow="Kütüphane">
      {total === 0 ? (
        <p className="text-xs text-zinc-500">
          Kütüphane boş. Medya ekledikçe burada özet görünür.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                className="stroke-zinc-800"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={offset}
                className="stroke-amber-400 transition-[stroke-dashoffset] duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-semibold text-zinc-100 tabular-nums leading-none">
                {percent}%
              </span>
              <span className="text-[9px] text-zinc-500 mt-0.5 leading-none">
                Tamamlandı
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5 text-xs">
            <StatRow
              icon={ListTodo}
              label="Toplam"
              value={total}
              tone="zinc"
            />
            <StatRow
              icon={CheckCircle2}
              label="Tamamlanan"
              value={completed}
              tone="emerald"
            />
            <StatRow
              icon={PlayCircle}
              label="Devam Eden"
              value={stats.inProgressItems}
              tone="violet"
            />
            <StatRow
              icon={Clock}
              label="Planlanan"
              value={stats.planningItems}
              tone="sky"
            />
          </div>
        </div>
      )}
    </Widget>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ListTodo;
  label: string;
  value: number;
  tone: "zinc" | "emerald" | "violet" | "sky";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "violet"
        ? "text-violet-300"
        : tone === "sky"
          ? "text-sky-300"
          : "text-zinc-300";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-zinc-500">
        <Icon className="w-3 h-3 opacity-70" />
        {label}
      </span>
      <span className={`font-mono tabular-nums font-medium ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

// --- 2) Günlük Hedef (gerçek hedef yok; 7-gün aktivite sparkbar) -----------

function DailyGoalWidget({
  progressLogs,
  thisWeekTotal,
}: {
  progressLogs: ProgressLog[];
  thisWeekTotal: number;
}) {
  // Hedef sistemi henüz yok — bu blokta yalnızca SON 7 GÜN gerçek aktivite
  // sayısını gün gün gösteriyoruz. Sayılar gerçek progressLogs sayımıdır,
  // uydurma değil.
  const days = useMemo(() => {
    const out: { label: string; count: number; isToday: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const count = progressLogs.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t >= day.getTime() && t < next.getTime();
      }).length;
      const labels = ["PZR", "PZT", "SAL", "ÇRŞ", "PER", "CUM", "CMT"];
      out.push({
        label: labels[day.getDay()],
        count,
        isToday: i === 0,
      });
    }
    return out;
  }, [progressLogs]);

  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <Widget title="Günlük Hedef" icon={Activity} eyebrow="7 Gün">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] text-zinc-500">
          Hedef sistemi <span className="text-zinc-600">yakında</span>
        </span>
        <span className="text-[11px] font-mono tabular-nums text-zinc-300">
          {thisWeekTotal} aktivite
        </span>
      </div>

      <div className="flex items-end gap-1 h-12">
        {days.map((d, i) => {
          const h = d.count === 0 ? 6 : Math.round((d.count / max) * 100);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1"
              title={`${d.label}: ${d.count} aktivite`}
            >
              <div
                className={`w-full rounded ${
                  d.count === 0
                    ? "bg-zinc-800/60"
                    : d.isToday
                      ? "bg-amber-400/80"
                      : "bg-amber-500/40"
                } transition-all`}
                style={{ height: `${h}%`, minHeight: 4 }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] font-mono tracking-widest text-zinc-600">
        {days.map((d, i) => (
          <span
            key={i}
            className={d.isToday ? "text-amber-400/80" : ""}
            style={{ flex: 1, textAlign: "center" }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </Widget>
  );
}

// --- 3) Yaklaşan Bölümler (placeholder) ------------------------------------

function UpcomingWidget() {
  // Yayın takvimi sistemi henüz yok. Tarih uydurmuyoruz; sadece neye
  // bağlanacağını anlatan bir açıklama döndürüyoruz.
  return (
    <Widget title="Yaklaşan Bölümler" icon={Calendar} eyebrow="Yakında">
      <div className="rounded-lg border border-dashed border-zinc-800/80 bg-zinc-950/40 px-3 py-3">
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          TVMaze yayın takvimi ve AniList airing burada listelenecek.
        </p>
        <p className="text-[10px] text-zinc-600 mt-1.5">
          Bu widget sonraki turda bağlanacak.
        </p>
      </div>
    </Widget>
  );
}

// --- 4) Önerilen Devam -----------------------------------------------------

function SuggestionWidget({
  items,
  onOpenDetail,
}: {
  items: MediaItem[];
  onOpenDetail?: (item: MediaItem) => void;
}) {
  if (items.length === 0) {
    return (
      <Widget title="Önerilen Devam" icon={Sparkles} iconTone="violet">
        <p className="text-[11px] text-zinc-500">
          Devam ettiğin bir medya yok. İlerleme kaydettikçe burada görünür.
        </p>
      </Widget>
    );
  }
  return (
    <Widget title="Önerilen Devam" icon={Sparkles} iconTone="violet" eyebrow="Kütüphane">
      <div className="flex flex-col gap-1.5">
        {items.map((item) => {
          const t = item.totalProgress;
          const c = item.currentProgress;
          const pct = t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenDetail?.(item)}
              className="group w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 transition-colors text-left cursor-pointer"
              title={item.title}
            >
              <div className="w-1 self-stretch rounded-full bg-violet-500/60 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-200 truncate group-hover:text-zinc-50">
                  {item.title}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="h-1 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                    {t > 0 ? (
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        style={{ width: `${pct}%` }}
                      />
                    ) : (
                      <div className="h-full w-1/2 bg-zinc-700/60" />
                    )}
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-zinc-500 min-w-[34px] text-right">
                    {t > 0 ? `${pct}%` : "—"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Widget>
  );
}

// --- 5) Son Aktiviteler ----------------------------------------------------

function ActivityWidget({ logs }: { logs: ProgressLog[] }) {
  if (logs.length === 0) {
    return (
      <Widget title="Son Aktiviteler" icon={TrendingUp}>
        <p className="text-[11px] text-zinc-500">
          Henüz aktivite yok. İlerleme kaydettikçe burada görünür.
        </p>
      </Widget>
    );
  }
  return (
    <Widget title="Son Aktiviteler" icon={TrendingUp} eyebrow="Akış">
      <ul className="flex flex-col gap-2">
        {logs.map((log) => {
          const tone = actionTone(log.action);
          const dotClass =
            tone === "emerald"
              ? "bg-emerald-400"
              : tone === "violet"
                ? "bg-violet-400"
                : tone === "sky"
                  ? "bg-sky-400"
                  : "bg-amber-400";
          return (
            <li key={log.id} className="flex items-start gap-2">
              <span
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 text-[11px]">
                <div className="text-zinc-300 truncate">
                  <span className="text-zinc-100 font-medium">{log.mediaTitle}</span>{" "}
                  <span className="text-zinc-500">{actionVerb(log.action)}</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono tabular-nums">
                  {relativeTime(log.createdAt)}
                  {log.action === "increment" && log.amount > 0 && (
                    <span className="ml-1.5">+{log.amount}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

// --- RightRail container ---------------------------------------------------

export default function RightRail({
  mediaList,
  progressLogs,
  stats,
  onOpenDetail,
}: RightRailProps) {
  // "Önerilen Devam" türetimi: currentProgress > 0 ve tamamlanmamış. Son
  // progress log timestamp'ine göre sırala, en fazla 3 göster. Yoksa
  // status "watching"/"reading" olanlardan fallback.
  const suggestions = useMemo(() => {
    const lastLogAt = new Map<string, number>();
    for (const log of progressLogs) {
      const t = new Date(log.createdAt).getTime();
      const prev = lastLogAt.get(log.mediaId) ?? 0;
      if (t > prev) lastLogAt.set(log.mediaId, t);
    }
    const withProgress = mediaList.filter(
      (it) =>
        (it.currentProgress ?? 0) > 0 &&
        it.status !== "completed" &&
        it.status !== "dropped",
    );
    const pool =
      withProgress.length > 0
        ? withProgress
        : mediaList.filter(
            (it) => it.status === "watching" || it.status === "reading",
          );
    return pool
      .slice()
      .sort((a, b) => (lastLogAt.get(b.id) ?? 0) - (lastLogAt.get(a.id) ?? 0))
      .slice(0, 3);
  }, [mediaList, progressLogs]);

  const recentLogs = useMemo(
    () => stats.recentLogs.slice(0, 5),
    [stats.recentLogs],
  );

  return (
    <aside
      className="hidden xl:flex sticky top-0 h-screen w-[18rem] shrink-0 flex-col gap-3 border-l border-zinc-800/60 bg-zinc-950/40 px-4 py-5 overflow-y-auto"
      aria-label="Sağ panel"
    >
      <div className="text-[10px] font-semibold tracking-[0.16em] text-zinc-600 uppercase px-1">
        Bakış
      </div>

      <OverallWidget stats={stats} />
      <DailyGoalWidget
        progressLogs={progressLogs}
        thisWeekTotal={stats.logsThisWeek}
      />
      <SuggestionWidget items={suggestions} onOpenDetail={onOpenDetail} />
      <ActivityWidget logs={recentLogs} />
      <UpcomingWidget />
    </aside>
  );
}
