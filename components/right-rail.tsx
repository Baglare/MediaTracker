"use client";

// ============================================
// Right Rail — R4 + R12 (world tints) + R15 (world-aware)
// ============================================
// 5 widget halinde compact dashboard paneli. App shell, Kütüphanem section
// layout, MediaCard/SeriesGroupCard davranışı bozulmuyor — bu component
// salt okuma. Tüm veri parent'tan (app/page.tsx) prop olarak geliyor.
//
// R15 değişiklikleri:
//   - `themeFilter` prop'u eklendi; Genel İlerleme, Önerilen Devam ve Son
//     Aktiviteler artık seçili Dünya'ya göre scope'lanıyor (lib/world-scope).
//   - OverallWidget yeniden yazıldı: 5 segmentli donut (completed/inProgress/
//     planning/paused/dropped), 6 metrik, hover/active highlight + alt
//     detay paneli (statü adı, sayı, yüzde, açıklama, ilk 3 örnek başlık).
//     Tamamlanan dilimi aktif dünyanın --w-primary tonunda + ekstra glow.
//   - SuggestionWidget'a "neden önerildi" deterministic etiketi eklendi.
//   - ActivityWidget logları scope'lanmış item id setine göre filtreliyor.
//   - DailyGoal widget kasıtlı olarak global (genel haftalık aktivite); brief
//     onu world-scope kapsamında saymadı.
//
// xl (≥1280px) altında gizli; main column daha rahat nefes alsın.

import { useMemo, useState } from "react";
import {
  Target,
  Activity,
  Calendar,
  Sparkles,
  ListTodo,
  TrendingUp,
} from "lucide-react";
import { MediaItem, ProgressLog, ProgressLogAction } from "@/lib/types";
import { DashboardStats } from "@/lib/dashboard-stats";
import {
  scopeMediaListByWorld,
  scopeProgressLogsByWorld,
  type WorldScope,
} from "@/lib/world-scope";
import {
  formatProgressLogAction,
  formatProgressLogDetail,
  formatProgressLogRelativeTime,
  getDisplayProgressLogs,
} from "@/lib/activity-log";

interface RightRailProps {
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  stats: DashboardStats;
  // R15: Aktif Dünya. Bu component için tek scope sinyali; type/status/search
  // filtrelerine bilinçli olarak duyarsızız.
  themeFilter: WorldScope;
  onOpenDetail?: (item: MediaItem) => void;
}

// --- Helpers ---------------------------------------------------------------

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
  // R12: "amber" tone aktif dünyanın primary tonuna bağlı.
  const iconClass =
    iconTone === "violet"
      ? "text-violet-300"
      : iconTone === "emerald"
        ? "text-emerald-300"
        : "text-[var(--w-primary-strong)]";
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

// ===========================================================================
// 1) GENEL İLERLEME (R15: çok-segmentli donut + hover detay)
// ===========================================================================

type StatusSlice =
  | "completed"
  | "inProgress"
  | "planning"
  | "paused"
  | "dropped";

interface SliceMeta {
  label: string;
  description: string;
  // Renk: completed → world primary; diğerleri semantik sabit.
  color: string;
  // Tailwind nokta sınıfı (sağdaki satır ikonu için).
  dotClass: string;
  // Aktif satır highlight rengi (text + bg).
  rowActiveClass: string;
  rowTextClass: string;
}

const SLICE_META: Record<StatusSlice, SliceMeta> = {
  completed: {
    label: "Tamamlanan",
    description: "Bitirdiğin medyalar.",
    color: "var(--w-primary)",
    dotClass: "bg-[var(--w-primary)]",
    rowActiveClass: "bg-[color-mix(in_srgb,var(--w-primary)_14%,transparent)]",
    rowTextClass: "text-[var(--w-primary-strong)]",
  },
  inProgress: {
    label: "Devam Eden",
    description: "Şu anda izlediğin/okuduğun.",
    color: "#a78bfa", // violet-400
    dotClass: "bg-violet-400",
    rowActiveClass: "bg-violet-500/12",
    rowTextClass: "text-violet-300",
  },
  planning: {
    label: "Planlanan",
    description: "İleride başlamayı düşündüğün.",
    color: "#7dd3fc", // sky-300
    dotClass: "bg-sky-400",
    rowActiveClass: "bg-sky-500/12",
    rowTextClass: "text-sky-300",
  },
  paused: {
    label: "Duraklatılan",
    description: "Şimdilik ara verdiğin.",
    color: "#fb923c", // orange-400
    dotClass: "bg-orange-400",
    rowActiveClass: "bg-orange-500/12",
    rowTextClass: "text-orange-300",
  },
  dropped: {
    label: "Bırakılan",
    description: "Vazgeçtiğin kayıtlar.",
    color: "#f87171", // red-400
    dotClass: "bg-red-400",
    rowActiveClass: "bg-red-500/12",
    rowTextClass: "text-red-300",
  },
};

const STATUS_ORDER: StatusSlice[] = [
  "completed",
  "inProgress",
  "planning",
  "paused",
  "dropped",
];

// MediaItem.status → StatusSlice eşlemesi.
function itemSlice(item: MediaItem): StatusSlice | null {
  switch (item.status) {
    case "completed":
      return "completed";
    case "watching":
    case "reading":
      return "inProgress";
    case "planning":
      return "planning";
    case "paused":
      return "paused";
    case "dropped":
      return "dropped";
    default:
      return null;
  }
}

interface SliceBucket {
  key: StatusSlice;
  count: number;
  items: MediaItem[];
}

function bucketByStatus(items: MediaItem[]): Record<StatusSlice, SliceBucket> {
  const out: Record<StatusSlice, SliceBucket> = {
    completed: { key: "completed", count: 0, items: [] },
    inProgress: { key: "inProgress", count: 0, items: [] },
    planning: { key: "planning", count: 0, items: [] },
    paused: { key: "paused", count: 0, items: [] },
    dropped: { key: "dropped", count: 0, items: [] },
  };
  for (const it of items) {
    const slice = itemSlice(it);
    if (!slice) continue;
    out[slice].count += 1;
    out[slice].items.push(it);
  }
  return out;
}

function OverallWidget({
  scopedItems,
  worldLabel,
}: {
  scopedItems: MediaItem[];
  worldLabel: string;
}) {
  const buckets = useMemo(() => bucketByStatus(scopedItems), [scopedItems]);
  const total = scopedItems.length;
  const completed = buckets.completed.count;
  const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const [hovered, setHovered] = useState<StatusSlice | null>(null);

  // SVG ring ölçüleri.
  const size = 78;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  // Segmentleri tek geçişte hesapla — her segment kendi dasharray + offset
  // alır. Rotate -90deg → 12 yönünden başla. Görsel ayrım için 1px gap.
  const segments = useMemo(() => {
    if (total === 0) return [] as Array<{
      key: StatusSlice;
      arc: number;
      offset: number;
      color: string;
    }>;
    let cumulative = 0;
    const GAP = total > 1 ? 1 : 0; // birden fazla dilim varsa minik ayrım
    return STATUS_ORDER.map((key) => {
      const count = buckets[key].count;
      if (count === 0) return null;
      const fullArc = (count / total) * c;
      const arc = Math.max(0, fullArc - GAP);
      const offset = -cumulative;
      cumulative += fullArc;
      return { key, arc, offset, color: SLICE_META[key].color };
    }).filter((s): s is NonNullable<typeof s> => s !== null);
  }, [buckets, c, total]);

  return (
    <Widget title="Genel İlerleme" icon={Target} eyebrow={worldLabel}>
      {total === 0 ? (
        <p className="text-xs text-zinc-500">
          Bu dünyada henüz medya yok. Eklediklerin burada özetlenir.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            {/* Multi-segment donut */}
            <div
              className="relative"
              style={{ width: size, height: size }}
              onMouseLeave={() => setHovered(null)}
            >
              <svg
                width={size}
                height={size}
                className="-rotate-90"
                aria-hidden="true"
              >
                {/* Track */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  strokeWidth={stroke}
                  className="stroke-zinc-800"
                />
                {/* Segments */}
                {segments.map((seg) => {
                  const isActive = hovered === seg.key;
                  const isCompleted = seg.key === "completed";
                  // Aktif segment biraz kalın + opacity tam; pasifte hafif soluk.
                  const sw =
                    isActive
                      ? stroke + 3
                      : isCompleted
                        ? stroke + 1   // R15: completed her zaman bir tık daha kalın
                        : stroke;
                  const opacity = hovered && !isActive ? 0.45 : 1;
                  // Completed dilimine ekstra glow (drop-shadow var(--w-primary)).
                  const filter = isCompleted
                    ? `drop-shadow(0 0 ${isActive ? 6 : 4}px var(--w-primary))`
                    : isActive
                      ? `drop-shadow(0 0 5px ${seg.color})`
                      : undefined;
                  return (
                    <circle
                      key={seg.key}
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      fill="none"
                      strokeWidth={sw}
                      strokeLinecap="butt"
                      strokeDasharray={`${seg.arc} ${c - seg.arc}`}
                      strokeDashoffset={seg.offset}
                      style={{
                        stroke: seg.color,
                        opacity,
                        filter,
                        transition:
                          "stroke-width 180ms ease-out, opacity 180ms ease-out, filter 180ms ease-out",
                        cursor: "pointer",
                      }}
                      onMouseEnter={() => setHovered(seg.key)}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-sm font-semibold text-zinc-100 tabular-nums leading-none">
                  {completedPct}%
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 leading-none">
                  Tamamlandı
                </span>
              </div>
            </div>

            {/* 6 metrik (Toplam üstte, sonra 5 status). Tamamlanan satırı +
                hover'lı satır vurgulu görünür. */}
            <div className="flex-1 min-w-0 space-y-1 text-xs">
              <StatRow
                icon={ListTodo}
                label="Toplam"
                value={total}
                tone="zinc"
              />
              {STATUS_ORDER.map((key) => {
                const meta = SLICE_META[key];
                const count = buckets[key].count;
                const isActive = hovered === key;
                return (
                  <SliceRow
                    key={key}
                    sliceKey={key}
                    label={meta.label}
                    count={count}
                    active={isActive}
                    meta={meta}
                    onHover={setHovered}
                  />
                );
              })}
            </div>
          </div>

          {/* R15: Hover detay paneli — statü adı, sayı, yüzde, kısa açıklama,
              ilk 3 örnek başlık. Hover yokken slot boş kalmasın diye sade
              bir ipucu satırı gösteriyoruz. */}
          <SliceDetail
            hovered={hovered}
            buckets={buckets}
            total={total}
          />
        </>
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
    <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
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

function SliceRow({
  sliceKey,
  label,
  count,
  active,
  meta,
  onHover,
}: {
  sliceKey: StatusSlice;
  label: string;
  count: number;
  active: boolean;
  meta: SliceMeta;
  onHover: (k: StatusSlice | null) => void;
}) {
  // R15: Tamamlanan satırı her zaman vurgulu (font-semibold + world primary
  // tonu). Diğer satırlar count===0 durumunda zinc-700'e düşer.
  const isCompleted = sliceKey === "completed";
  const dim = count === 0 && !active;
  const valueClass = active
    ? meta.rowTextClass
    : isCompleted
      ? "text-[var(--w-primary-strong)] font-semibold"
      : dim
        ? "text-zinc-700"
        : "text-zinc-300";
  return (
    <div
      onMouseEnter={() => onHover(sliceKey)}
      className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded transition-colors cursor-default ${
        active ? meta.rowActiveClass : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-zinc-500">
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`}
        />
        {label}
      </span>
      <span className={`font-mono tabular-nums font-medium ${valueClass}`}>
        {count}
      </span>
    </div>
  );
}

function SliceDetail({
  hovered,
  buckets,
  total,
}: {
  hovered: StatusSlice | null;
  buckets: Record<StatusSlice, SliceBucket>;
  total: number;
}) {
  if (!hovered) {
    return (
      <div className="mt-3 pt-2.5 border-t border-zinc-800/60">
        <p className="text-[10.5px] text-zinc-500 leading-relaxed">
          Halkadaki dilime veya satıra gel — detay buradan açılır.
        </p>
      </div>
    );
  }
  const meta = SLICE_META[hovered];
  const bucket = buckets[hovered];
  const pct = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
  const samples = bucket.items.slice(0, 3);
  return (
    <div className="mt-3 pt-2.5 border-t border-zinc-800/60">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`}
          />
          <span className={`text-[11px] font-semibold ${meta.rowTextClass}`}>
            {meta.label}
          </span>
        </div>
        <span className="text-[10.5px] font-mono tabular-nums text-zinc-500">
          {bucket.count} • {pct}%
        </span>
      </div>
      <p className="text-[10.5px] text-zinc-500 leading-relaxed mb-1.5">
        {meta.description}
      </p>
      {samples.length > 0 ? (
        <ul className="space-y-0.5">
          {samples.map((it) => (
            <li
              key={it.id}
              className="text-[10.5px] text-zinc-300 truncate"
              title={it.title}
            >
              · {it.title}
            </li>
          ))}
          {bucket.count > samples.length && (
            <li className="text-[9.5px] text-zinc-600">
              + {bucket.count - samples.length} diğer
            </li>
          )}
        </ul>
      ) : (
        <p className="text-[10.5px] text-zinc-600">Bu dünyada henüz örnek yok.</p>
      )}
    </div>
  );
}

// ===========================================================================
// 2) Günlük Hedef (kasıtlı global — tüm aktivite, dünya skoplaması yok)
// ===========================================================================

function DailyGoalWidget({
  progressLogs,
  thisWeekTotal,
}: {
  progressLogs: ProgressLog[];
  thisWeekTotal: number;
}) {
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
                      ? "bg-[var(--w-primary)]"
                      : "bg-[color-mix(in_srgb,var(--w-primary)_45%,transparent)]"
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
            className={d.isToday ? "text-[var(--w-primary-strong)]" : ""}
            style={{ flex: 1, textAlign: "center" }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </Widget>
  );
}

// ===========================================================================
// 3) Yaklaşan Bölümler (placeholder)
// ===========================================================================

function UpcomingWidget() {
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

// ===========================================================================
// 4) Önerilen Devam (R15: dünya bazlı + reason etiketi)
// ===========================================================================

interface SuggestionEntry {
  item: MediaItem;
  reason: string;
}

function deriveSuggestionReason(
  item: MediaItem,
  lastLogAt: number | undefined,
): string {
  // Deterministic — fallback'a kadar düş, asla boş bırakma. Date.now() kullanmadan
  // (react-hooks/components-must-be-pure kuralı render içinde impure çağrıları
  // engelliyor). Son log varsa, o satırı "aktiviteye göre" sayıyoruz; saat
  // hassasiyeti suggestion sıralamasını lastLogAt sort'u zaten veriyor.
  if (lastLogAt) return "Son aktiviteye göre";
  const inProgress = item.status === "watching" || item.status === "reading";
  const hasProgress = (item.currentProgress ?? 0) > 0;
  const hasKnownTotal = (item.totalProgress ?? 0) > 0;
  if (
    hasProgress &&
    hasKnownTotal &&
    item.currentProgress < item.totalProgress &&
    !inProgress
  ) {
    return "Yarım bırakılmış ilerleme";
  }
  if (inProgress) return "Durumuna göre";
  if (hasProgress) return "İlerlemesi başlamış";
  return "Devam eden listende";
}

function SuggestionWidget({
  entries,
  onOpenDetail,
}: {
  entries: SuggestionEntry[];
  onOpenDetail?: (item: MediaItem) => void;
}) {
  if (entries.length === 0) {
    return (
      <Widget title="Önerilen Devam" icon={Sparkles} iconTone="violet">
        <p className="text-[11px] text-zinc-500">
          Bu dünyada devam ettiğin bir medya yok. İlerleme kaydettikçe burada
          görünür.
        </p>
      </Widget>
    );
  }
  return (
    <Widget title="Önerilen Devam" icon={Sparkles} iconTone="violet" eyebrow="Dünya">
      <div className="flex flex-col gap-1.5">
        {entries.map(({ item, reason }) => {
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
              <div className="w-1 self-stretch rounded-full bg-[color-mix(in_srgb,var(--w-primary)_60%,transparent)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-200 truncate group-hover:text-zinc-50">
                  {item.title}
                </div>
                {/* R15: Reason etiketi — küçük, sessiz, ama her zaman dolu */}
                <div className="text-[9.5px] text-zinc-500 truncate">
                  {reason}
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

// ===========================================================================
// 5) Son Aktiviteler (R15: dünya bazlı log filtreleme)
// ===========================================================================

function ActivityWidget({ logs }: { logs: ProgressLog[] }) {
  if (logs.length === 0) {
    return (
      <Widget title="Son Aktiviteler" icon={TrendingUp}>
        <p className="text-[11px] text-zinc-500">
          Bu dünyada henüz aktivite yok. İlerleme kaydettikçe burada görünür.
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
                  <span className="text-zinc-500">{formatProgressLogAction(log)}</span>
                </div>
                <div
                  className="text-[10px] text-zinc-500 font-mono tabular-nums truncate"
                  title={formatProgressLogDetail(log)}
                >
                  {formatProgressLogRelativeTime(log.createdAt)}
                  <span className="ml-1.5">{formatProgressLogDetail(log)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

// ===========================================================================
// RightRail container
// ===========================================================================

const WORLD_LABEL: Record<WorldScope, string> = {
  all: "Tüm Dünyalar",
  east: "Doğu",
  screen: "Kadraj",
  library: "Arşiv",
};

export default function RightRail({
  mediaList,
  progressLogs,
  stats,
  themeFilter,
  onOpenDetail,
}: RightRailProps) {
  // R15: Dünya scope'lu türetimler. Tek hesap noktası; tüm widget'lar bu
  // listeleri tüketir. matchesWorldScope SADECE classification'a bakar
  // (eastSubFilter / typeFilter / statusFilter / searchQuery'ye duyarsız).
  const scopedItems = useMemo(
    () => scopeMediaListByWorld(mediaList, themeFilter),
    [mediaList, themeFilter],
  );
  const scopedLogs = useMemo(
    () => scopeProgressLogsByWorld(progressLogs, mediaList, themeFilter),
    [progressLogs, mediaList, themeFilter],
  );

  // "Önerilen Devam" türetimi — scoped listeden + reason. currentProgress > 0
  // ve tamamlanmamış. Yoksa watching/reading'e fallback. Son log timestamp'ine
  // göre sırala, en fazla 3.
  const suggestions = useMemo<SuggestionEntry[]>(() => {
    const lastLogAt = new Map<string, number>();
    for (const log of scopedLogs) {
      const t = new Date(log.createdAt).getTime();
      const prev = lastLogAt.get(log.mediaId) ?? 0;
      if (t > prev) lastLogAt.set(log.mediaId, t);
    }
    const withProgress = scopedItems.filter(
      (it) =>
        (it.currentProgress ?? 0) > 0 &&
        it.status !== "completed" &&
        it.status !== "dropped",
    );
    const pool =
      withProgress.length > 0
        ? withProgress
        : scopedItems.filter(
            (it) => it.status === "watching" || it.status === "reading",
          );
    const sorted = pool
      .slice()
      .sort((a, b) => (lastLogAt.get(b.id) ?? 0) - (lastLogAt.get(a.id) ?? 0))
      .slice(0, 3);
    return sorted.map((item) => ({
      item,
      reason: deriveSuggestionReason(item, lastLogAt.get(item.id)),
    }));
  }, [scopedItems, scopedLogs]);

  const recentLogs = useMemo(
    () => getDisplayProgressLogs(scopedLogs, 5),
    [scopedLogs],
  );

  return (
    <aside
      className="hidden xl:flex sticky top-0 h-screen w-[18rem] shrink-0 flex-col gap-3 border-l border-zinc-800/60 bg-zinc-950/40 px-4 py-5 overflow-y-auto"
      aria-label="Sağ panel"
    >
      <div className="text-[10px] font-semibold tracking-[0.16em] text-zinc-600 uppercase px-1">
        Bakış · {WORLD_LABEL[themeFilter]}
      </div>

      <OverallWidget
        scopedItems={scopedItems}
        worldLabel={WORLD_LABEL[themeFilter]}
      />
      {/* DailyGoal kasıtlı global — tüm aktiviteyi gösterir, dünya scope dışı. */}
      <DailyGoalWidget
        progressLogs={progressLogs}
        thisWeekTotal={stats.logsThisWeek}
      />
      <SuggestionWidget entries={suggestions} onOpenDetail={onOpenDetail} />
      <ActivityWidget logs={recentLogs} />
      <UpcomingWidget />
    </aside>
  );
}
