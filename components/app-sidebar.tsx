"use client";

import {
  Activity,
  BarChart3,
  Calendar,
  Compass,
  Heart,
  LayoutDashboard,
  Library,
  ListChecks,
  NotebookPen,
  Sparkles,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import type { UserProgression, UserProgressionWorld } from "@/lib/user-progression";
import type { TabType } from "./app-tabs";
import SidebarProfileCard from "./sidebar-profile-card";

type NavItem = {
  id: TabType | string;
  label: string;
  icon: LucideIcon;
  ghost?: boolean;
  badge?: string;
  badgeTone?: "soon" | "accent" | "default";
};

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Genel",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "library", label: "Kütüphanem", icon: Library },
      { id: "discover", label: "Keşfet", icon: Compass },
      { id: "calendar", label: "Takvim", icon: Calendar },
    ],
  },
  {
    label: "Kişisel",
    items: [
      { id: "progress", label: "İlerlemem", icon: TrendingUp },
      { id: "watchlist", label: "İzleme Listem", icon: ListChecks },
      { id: "favorites", label: "Favorilerim", icon: Heart },
      { id: "ratings", label: "Puanlamalarım", icon: Star },
      { id: "notes", label: "Notlarım", icon: NotebookPen },
      { id: "stats", label: "İstatistikler", icon: BarChart3 },
    ],
  },
  {
    label: "Yardımcılar",
    items: [
      { id: "ai", label: "AI Danışman", icon: Sparkles, badge: "Beta", badgeTone: "accent" },
      { id: "activity", label: "Aktivite", icon: Activity },
    ],
  },
];

const REAL_TABS = new Set<TabType>([
  "dashboard",
  "library",
  "discover",
  "calendar",
  "progress",
  "watchlist",
  "favorites",
  "ratings",
  "notes",
  "stats",
  "ai",
  "activity",
  "settings",
]);

interface AppSidebarProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
  onOpenSettings: () => void;
  profileName: string;
  profileTagline: string;
  profilePreferences: ProfilePreferences;
  progression: UserProgression;
  journeyTitle: string;
}

const JOURNEY_ACCENTS: Record<
  UserProgressionWorld,
  { panel: string; text: string; fill: string; glow: string }
> = {
  east: {
    panel: "border-amber-500/20 bg-amber-500/[0.06]",
    text: "text-amber-200",
    fill: "from-amber-300 to-yellow-500",
    glow: "shadow-amber-950/20",
  },
  screen: {
    panel: "border-cyan-500/20 bg-cyan-500/[0.06]",
    text: "text-cyan-200",
    fill: "from-cyan-300 to-blue-500",
    glow: "shadow-cyan-950/20",
  },
  arch: {
    panel: "border-red-400/20 bg-red-400/[0.05]",
    text: "text-orange-200",
    fill: "from-orange-300 to-red-500",
    glow: "shadow-red-950/20",
  },
  mixed: {
    panel: "border-violet-500/20 bg-violet-500/[0.06]",
    text: "text-violet-200",
    fill: "from-violet-300 to-zinc-300",
    glow: "shadow-violet-950/20",
  },
};

function NavRow({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const ghost = !!item.ghost;
  const base =
    "group relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors text-left";
  const stateClass = ghost
    ? "text-zinc-600 cursor-not-allowed"
    : isActive
      ? "bg-zinc-800/60 text-zinc-50 cursor-pointer"
      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/30 cursor-pointer";

  let badgeClass = "ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full ";
  if (item.badgeTone === "soon") {
    badgeClass += "border border-dashed border-zinc-700/70 text-zinc-500";
  } else if (item.badgeTone === "accent") {
    badgeClass += "bg-amber-500/15 text-amber-300";
  } else {
    badgeClass += "bg-zinc-800 text-zinc-400";
  }

  return (
    <button
      type="button"
      className={`${base} ${stateClass}`}
      onClick={ghost ? undefined : onClick}
      disabled={ghost}
      aria-disabled={ghost || undefined}
      aria-current={isActive ? "page" : undefined}
      title={ghost ? `${item.label} - yakında` : item.label}
    >
      {isActive && !ghost && (
        <span
          aria-hidden="true"
          className="absolute -left-2.5 top-1.5 bottom-1.5 w-[2px] rounded-r bg-amber-400/70"
        />
      )}
      <Icon className={`w-4 h-4 shrink-0 ${ghost ? "opacity-60" : ""}`} />
      <span className="truncate">{item.label}</span>
      {item.badge && <span className={badgeClass}>{item.badge}</span>}
    </button>
  );
}

function JourneyCard({
  progression,
  journeyTitle,
  active,
  onClick,
}: {
  progression: UserProgression;
  journeyTitle: string;
  active: boolean;
  onClick: () => void;
}) {
  const accent = JOURNEY_ACCENTS[progression.dominantWorld];
  const progressWidth = `${Math.round(progression.progressPercent * 100)}%`;
  const remainingXp = Math.max(0, progression.nextLevelXp - progression.currentLevelXp);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left shadow-sm transition-colors cursor-pointer hover:bg-zinc-900/65 ${accent.panel} ${accent.glow} ${
        active ? "ring-1 ring-amber-400/35" : ""
      }`}
      aria-current={active ? "page" : undefined}
      title="İstatistiklere git"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Yolculuk
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-zinc-50">
            Seviye {progression.level}
          </p>
          <p className={`mt-0.5 truncate text-[11px] font-medium ${accent.text}`}>
            {journeyTitle}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full bg-zinc-950/45 px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1 ring-zinc-800/70 ${accent.text}`}
        >
          Level {progression.level}
        </span>
      </div>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-zinc-950/60 ring-1 ring-zinc-800/80">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${accent.fill}`}
            style={{ width: progressWidth }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-mono tabular-nums text-zinc-500">
          <span>{progression.currentLevelXp} / {progression.nextLevelXp} XP</span>
          <span>{Math.round(progression.progressPercent * 100)}%</span>
        </div>
        <p className="mt-1 text-[10.5px] text-zinc-500">
          Sonraki seviyeye {remainingXp} XP
        </p>
      </div>
    </button>
  );
}

export default function AppSidebar({
  activeTab,
  onChange,
  onOpenSettings,
  profileName,
  profileTagline,
  profilePreferences,
  progression,
  journeyTitle,
}: AppSidebarProps) {
  const handleClick = (id: string) => {
    if (REAL_TABS.has(id as TabType)) onChange(id as TabType);
  };

  return (
    <aside
      className="hidden lg:flex sticky top-0 h-screen w-64 shrink-0 flex-col gap-4 border-r border-zinc-800/60 bg-zinc-950/40 px-4 py-5"
      aria-label="Birincil navigasyon"
    >
      <SidebarProfileCard
        profileName={profileName}
        tagline={profileTagline}
        preferences={profilePreferences}
        onOpenSettings={onOpenSettings}
      />

      <nav className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-3">
        {SECTIONS.map((section) => (
          <div key={section.label} className="flex flex-col gap-px">
            <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.16em] text-zinc-600 uppercase">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                onClick={() => handleClick(item.id)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-1 border-t border-zinc-800/60 pt-3">
        <JourneyCard
          progression={progression}
          journeyTitle={journeyTitle}
          active={activeTab === "stats"}
          onClick={() => handleClick("stats")}
        />
      </div>
    </aside>
  );
}
