"use client";

import Image from "next/image";
import Link from "next/link";

import {
  APP_NAVIGATION_ITEMS,
  APP_NAVIGATION_SECTIONS,
  APP_NAVIGATION_SECTION_LABELS,
  type AppNavigationId,
  type AppNavigationItem,
  type DashboardTabId,
} from "@/components/app-shell/app-navigation";
import { NotificationBadge } from "@/components/social/notification-badge";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import type { ImageTransform } from "@/lib/personalization/image-transform";
import type { UserProgression, UserProgressionTier, UserProgressionWorld } from "@/lib/user-progression";
import SidebarProfileCard from "./sidebar-profile-card";

interface AppSidebarProps {
  activeNavigationId: AppNavigationId | DashboardTabId;
  onChange: (tab: DashboardTabId) => void;
  profileName: string;
  profileTagline: string;
  profilePreferences: ProfilePreferences;
  socialAvatarUrl?: string;
  avatarTransform?: ImageTransform;
  progression: UserProgression;
  journeyTitle: string;
}

const JOURNEY_ACCENTS: Record<
  UserProgressionWorld,
  { panel: string; text: string; fill: string; glow: string; tierGlow: string }
> = {
  east: { panel: "border-amber-500/20 bg-amber-500/[0.06]", text: "text-amber-200", fill: "from-amber-300 to-yellow-500", glow: "shadow-amber-950/20", tierGlow: "shadow-amber-500/10" },
  screen: { panel: "border-cyan-500/20 bg-cyan-500/[0.06]", text: "text-cyan-200", fill: "from-cyan-300 to-blue-500", glow: "shadow-cyan-950/20", tierGlow: "shadow-cyan-500/10" },
  arch: { panel: "border-red-400/20 bg-red-400/[0.05]", text: "text-orange-200", fill: "from-orange-300 to-red-500", glow: "shadow-red-950/20", tierGlow: "shadow-orange-500/10" },
  mixed: { panel: "border-violet-500/20 bg-violet-500/[0.06]", text: "text-violet-200", fill: "from-violet-300 to-zinc-300", glow: "shadow-violet-950/20", tierGlow: "shadow-violet-500/10" },
};

const TIER_LABELS: Record<UserProgressionTier, string> = {
  basic: "Basic",
  refined: "Refined",
  elite: "Elite",
  master: "Master",
};

const TIER_CLASSES: Record<UserProgressionTier, string> = {
  basic: "ring-zinc-800/70",
  refined: "ring-zinc-700/90 shadow-md",
  elite: "ring-zinc-600/90 shadow-md",
  master: "ring-zinc-500/90 shadow-lg",
};

const TIER_CARD_CLASSES: Record<UserProgressionTier, string> = {
  basic: "",
  refined: "shadow-md",
  elite: "shadow-md ring-1 ring-zinc-700/60",
  master: "shadow-lg ring-1 ring-zinc-600/70",
};

function NavigationRow({ item, active, onNavigateTab }: { item: AppNavigationItem; active: boolean; onNavigateTab: (tab: DashboardTabId) => void }) {
  const Icon = item.icon;
  const classes = `group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
    active
      ? "bg-[var(--app-selected)] text-[var(--app-text-primary)]"
      : "text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)]"
  }`;
  const content = (
    <>
      {active && <span aria-hidden="true" className="absolute -left-2.5 bottom-1.5 top-1.5 w-[2px] rounded-r bg-[var(--app-accent)]" />}
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {item.badge && <span className="ml-auto rounded-full bg-[var(--app-accent-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--app-accent-strong)]">{item.badge}</span>}
      {item.unread && <span className="ml-auto"><NotificationBadge /></span>}
    </>
  );

  if (item.destination.kind === "route") {
    return <Link href={item.destination.href} className={classes} aria-current={active ? "page" : undefined} title={item.label}>{content}</Link>;
  }
  const tab = item.destination.tab;
  return <button type="button" className={`${classes} cursor-pointer`} onClick={() => onNavigateTab(tab)} aria-current={active ? "page" : undefined} title={item.label}>{content}</button>;
}

function JourneyCard({ progression, journeyTitle, active, onClick }: { progression: UserProgression; journeyTitle: string; active: boolean; onClick: () => void }) {
  const accent = JOURNEY_ACCENTS[progression.dominantWorld];
  const remainingXp = Math.max(0, progression.nextLevelXp - progression.currentLevelXp);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full cursor-pointer rounded-xl border p-3 text-left shadow-sm transition-colors hover:bg-[var(--app-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${accent.panel} ${accent.glow} ${TIER_CARD_CLASSES[progression.tier]} ${active ? "ring-1 ring-[var(--app-focus)]" : ""}`}
      aria-current={active ? "page" : undefined}
      title="İstatistiklere git"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Yolculuk</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[var(--app-text-primary)]">Seviye {progression.level}</p>
          <p className={`mt-0.5 truncate text-[11px] font-medium ${accent.text}`}>{journeyTitle}</p>
        </div>
        <span className={`shrink-0 rounded-full bg-[var(--app-surface-3)] px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1 ${TIER_CLASSES[progression.tier]} ${accent.text} ${accent.tierGlow}`}>Level {progression.level}</span>
      </div>
      <span className={`mt-2 inline-flex rounded-full bg-[var(--app-surface-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-[var(--app-border)] ${accent.text}`}>{TIER_LABELS[progression.tier]}</span>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--app-surface-3)] ring-1 ring-[var(--app-border)]">
        <div className={`h-full rounded-full bg-gradient-to-r ${accent.fill}`} style={{ width: `${Math.round(progression.progressPercent * 100)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-mono tabular-nums text-[var(--app-text-muted)]">
        <span>{progression.currentLevelXp} / {progression.nextLevelXp} XP</span><span>{Math.round(progression.progressPercent * 100)}%</span>
      </div>
      <p className="mt-1 text-[10.5px] text-[var(--app-text-muted)]">Sonraki seviyeye {remainingXp} XP</p>
    </button>
  );
}

export default function AppSidebar({ activeNavigationId, onChange, profileName, profileTagline, profilePreferences, socialAvatarUrl, avatarTransform, progression, journeyTitle }: AppSidebarProps) {
  return (
    <aside className="app-panel hidden h-screen w-64 shrink-0 flex-col gap-3 border-r px-4 py-4 shadow-none lg:sticky lg:top-0 lg:flex" aria-label="Birincil navigasyon">
      <Link href="/" className="flex h-9 min-w-0 items-center gap-2 rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
        <Image src="/brand/media-tracker-mark.svg" alt="" aria-hidden="true" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
        <span className="truncate text-base font-semibold tracking-tight text-[var(--app-text-primary)]">MediaTracker</span>
      </Link>

      <SidebarProfileCard profileName={profileName} tagline={profileTagline} preferences={profilePreferences} socialAvatarUrl={socialAvatarUrl} avatarTransform={avatarTransform} />

      <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
        {APP_NAVIGATION_SECTIONS.map((section) => (
          <div key={section} className="flex flex-col gap-px">
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">{APP_NAVIGATION_SECTION_LABELS[section]}</div>
            {APP_NAVIGATION_ITEMS.filter((item) => item.section === section).map((item) => (
              <NavigationRow key={item.id} item={item} active={activeNavigationId === item.id} onNavigateTab={onChange} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-1 border-t border-[var(--app-border)] pt-3">
        <JourneyCard progression={progression} journeyTitle={journeyTitle} active={activeNavigationId === "stats"} onClick={() => onChange("stats")} />
      </div>
    </aside>
  );
}
