import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { WorldThemeKey } from "@/lib/personalization/types";

export type PageHeroTone =
  | "neutral"
  | "east"
  | "screen"
  | "arch"
  | "social"
  | "progression";

const WORLD_BY_TONE: Readonly<Record<PageHeroTone, WorldThemeKey>> = {
  neutral: "neutral",
  east: "east",
  screen: "screen",
  arch: "arch",
  social: "neutral",
  progression: "neutral",
};

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: ReactNode;
  actions?: ReactNode;
  summary?: ReactNode;
  tone?: PageHeroTone;
  breadcrumbLabel?: string;
}

export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  actions,
  summary,
  tone = "neutral",
  breadcrumbLabel = title,
}: PageHeroProps) {
  return (
    <header
      data-page-hero-tone={tone}
      data-world={WORLD_BY_TONE[tone]}
      className="page-hero relative overflow-hidden rounded-3xl border border-[var(--app-border)] shadow-[0_16px_42px_var(--app-shadow)]"
    >
      <span className="page-hero-motif pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10">
        <nav aria-label="İçerik yolu" className="mb-4 flex items-center gap-1.5 text-xs text-[var(--app-text-muted)]">
          <Link href="/" className="inline-flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            MediaTracker
          </Link>
          <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
          <span aria-current="page">{breadcrumbLabel}</span>
        </nav>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            {eyebrow && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--w-primary-strong)]">
                {eyebrow}
              </p>
            )}
            <div className="flex items-center gap-3">
              {icon && (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--w-border)] bg-[var(--w-soft)] text-[var(--w-primary-strong)]">
                  {icon}
                </span>
              )}
              <h1 className="text-2xl font-bold tracking-tight text-[var(--app-text-primary)] sm:text-3xl">{title}</h1>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-text-secondary)]">{description}</p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {summary && <div className="mt-5 border-t border-[var(--app-section-divider)] pt-4">{summary}</div>}
      </div>
    </header>
  );
}
