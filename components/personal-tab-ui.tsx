"use client";

import { Search, type LucideIcon } from "lucide-react";

export function PersonalEmptyState({
  icon: Icon,
  title,
  description,
  tone = "text-amber-400/80",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 sm:py-24 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 min-w-0">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800/80 grid place-items-center mb-4 shadow-sm shadow-black/30">
        <Icon className={`w-7 h-7 ${tone}`} />
      </div>
      <p className="text-zinc-200 text-sm font-medium text-center">{title}</p>
      <p className="text-zinc-500 text-xs mt-1.5 max-w-xs text-center leading-relaxed">{description}</p>
    </div>
  );
}

export function PersonalControls({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  sortValue,
  onSortChange,
  sortOptions,
  countLabel,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions: { value: string; label: string }[];
  countLabel: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center min-w-0">
      <div className="relative flex-1 min-w-0">
        <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-zinc-900/40 border border-zinc-800/70 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40"
        />
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <label className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold shrink-0">Sırala</label>
        <select
          value={sortValue}
          onChange={(event) => onSortChange(event.target.value)}
          className="h-10 min-w-0 max-w-full px-3 rounded-xl bg-zinc-900/40 border border-zinc-800/70 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 cursor-pointer"
        >
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="text-[12px] text-zinc-500 sm:ml-2 shrink-0">{countLabel}</div>
    </div>
  );
}

export function PersonalMetricCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/35 p-4 min-w-0">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold truncate">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums truncate ${accent ? "text-amber-200" : "text-zinc-100"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500 truncate">{hint}</p>}
    </div>
  );
}

export function DistributionBar({
  label,
  count,
  max,
  tone = "amber",
}: {
  label: string;
  count: number;
  max: number;
  tone?: "amber" | "violet" | "emerald" | "rose" | "sky";
}) {
  const toneClass =
    tone === "violet" ? "bg-violet-400"
    : tone === "emerald" ? "bg-emerald-400"
    : tone === "rose" ? "bg-rose-400"
    : tone === "sky" ? "bg-sky-400"
    : "bg-amber-400";
  const width = count > 0 && max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-[12px] text-zinc-300 truncate">{label}</span>
        <span className="text-[12px] font-mono tabular-nums text-zinc-500 shrink-0">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800/70 overflow-hidden">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
