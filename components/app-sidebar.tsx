"use client";

// ============================================
// App Sidebar (R1: Layout Redesign)
// ============================================
// Sol dikey navigasyon. Mevcut TabType'ların hepsini koruyor; ek olarak
// henüz implement edilmemiş sayfalar (Takvim, İlerlemem, İzleme Listem,
// Puanlamalarım, Notlarım, İstatistikler) "ghost / Yakında" olarak görünüyor
// — tıklanabilir değiller, mevcut sekmeyi değiştirmiyorlar. R24'te Favorilerim
// ghost listesinden çıkarıldı; gerçek bir sekme oldu.
//
// Aktif/ghost stilleri Tailwind ile zinc + amber accent paletinde kurulu.
// Referans: design_references/layout-redesign-v1/sidebar.jsx + styles.css.

import {
  LayoutDashboard,
  Library,
  Compass,
  Calendar,
  TrendingUp,
  ListChecks,
  Heart,
  Star,
  NotebookPen,
  BarChart3,
  Sparkles,
  Activity,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { TabType } from "./app-tabs";

type NavItem = {
  id: TabType | string;
  label: string;
  icon: LucideIcon;
  // Ghost: ileride gelecek sayfalar — disabled görünüm, tıklanamaz.
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
      { id: "calendar", label: "Takvim", icon: Calendar, ghost: true, badge: "Yakında", badgeTone: "soon" },
    ],
  },
  {
    label: "Kişisel",
    items: [
      { id: "progress", label: "İlerlemem", icon: TrendingUp, ghost: true, badge: "Yakında", badgeTone: "soon" },
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

const FOOT: NavItem[] = [{ id: "settings", label: "Ayarlar", icon: Settings }];

const REAL_TABS = new Set<TabType>([
  "dashboard",
  "library",
  "discover",
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
}

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

  // Active item: subtle zinc panel + gold left bar.
  // Ghost: faded text, no hover state, cursor disabled.
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
      title={ghost ? `${item.label} — yakında` : item.label}
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

export default function AppSidebar({ activeTab, onChange }: AppSidebarProps) {
  const handleClick = (id: string) => {
    if (REAL_TABS.has(id as TabType)) onChange(id as TabType);
  };

  return (
    <aside
      className="hidden lg:flex sticky top-0 h-screen w-64 shrink-0 flex-col gap-4 border-r border-zinc-800/60 bg-zinc-950/40 px-4 py-5"
      aria-label="Birincil navigasyon"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-1.5 pb-4 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 grid place-items-center text-zinc-950 font-bold text-sm shadow-sm shadow-amber-900/30">
          M
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-zinc-50 tracking-tight leading-tight">
            MediaTracker
          </div>
          <div className="text-[10.5px] text-zinc-500 leading-tight mt-0.5">
            izle · oku · takip et
          </div>
        </div>
      </div>

      {/* Sections */}
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

      {/* Foot — Settings.
          R7.1: Foot bölümüne hafif breathing room ve eyebrow benzeri ayrım
          eklendi; nav listesiyle aynı density'de ama görsel olarak
          ayrıştırılmış görünüyor. */}
      <div className="mt-1 pt-3 border-t border-zinc-800/60">
        {FOOT.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            isActive={activeTab === item.id}
            onClick={() => handleClick(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}
