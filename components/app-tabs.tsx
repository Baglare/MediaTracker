"use client";

import Link from "next/link";

import {
  APP_NAVIGATION_ITEMS,
  type AppNavigationId,
  type DashboardTabId,
} from "@/components/app-shell/app-navigation";

export type TabType = DashboardTabId;

interface AppTabsProps {
  activeNavigationId: AppNavigationId | DashboardTabId;
  onChange: (tab: DashboardTabId) => void;
}

export default function AppTabs({ activeNavigationId, onChange }: AppTabsProps) {
  return (
    <div className="scrollbar-hide -mx-1 flex touch-pan-x items-center gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 sm:pb-0" aria-label="Mobil navigasyon">
      {APP_NAVIGATION_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeNavigationId === item.id;
        const classes = `relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
          active
            ? "border-[var(--app-accent)] bg-[var(--app-selected)] text-[var(--app-text-primary)]"
            : "border-transparent text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)]"
        }`;
        const content = <><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{item.label}</span></>;
        if (item.destination.kind === "route") {
          return <Link key={item.id} href={item.destination.href} className={classes} aria-current={active ? "page" : undefined}>{content}</Link>;
        }
        const tab = item.destination.tab;
        return <button key={item.id} type="button" onClick={() => onChange(tab)} className={`${classes} cursor-pointer`} aria-current={active ? "page" : undefined}>{content}</button>;
      })}
    </div>
  );
}
