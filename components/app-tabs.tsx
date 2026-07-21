"use client";

import { LayoutDashboard, Library, Compass, Activity, Settings, Sparkles, Heart, ListChecks, Star, NotebookPen, BarChart3, Calendar, TrendingUp, UserRound } from "lucide-react";
import { Bell, Radio, Send } from "lucide-react";
import Link from "next/link";

export type TabType =
  | "dashboard"
  | "library"
  | "discover"
  | "calendar"
  | "progress"
  | "watchlist"
  | "favorites"
  | "ratings"
  | "notes"
  | "stats"
  | "profile"
  | "ai"
  | "activity"
  | "settings";

interface AppTabsProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export default function AppTabs({ activeTab, onChange }: AppTabsProps) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "library", label: "Kütüphanem", icon: Library },
    { id: "discover", label: "Keşfet", icon: Compass },
    { id: "calendar", label: "Takvim", icon: Calendar },
    { id: "progress", label: "İlerlemem", icon: TrendingUp },
    { id: "watchlist", label: "İzleme Listem", icon: ListChecks },
    { id: "favorites", label: "Favorilerim", icon: Heart },
    { id: "ratings", label: "Puanlamalarım", icon: Star },
    { id: "notes", label: "Notlarım", icon: NotebookPen },
    { id: "stats", label: "İstatistikler", icon: BarChart3 },
    { id: "profile", label: "Profil", icon: UserRound },
    { id: "ai", label: "AI Danışman", icon: Sparkles },
    { id: "activity", label: "Aktivite", icon: Activity },
    { id: "settings", label: "Ayarlar", icon: Settings },
  ] as const;

  return (
    // R20: Mobil/tablet fallback nav.
    //  - Yatay scroll edge fade için negatif margin + padding ile container
    //    kenarı boyunca rahat kaydırma alanı bırakıyoruz.
    //  - touch-pan-x + overscroll-contain mobilde scroll'u dikey gesture'lardan
    //    ayırır.
    //  - Aktif sekme sol kenarda ince accent çubuğu ile net görünür; dokunma
    //    hedefi min 40px (h-10).
    <div
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain touch-pan-x px-1 pb-1 sm:pb-0 scrollbar-hide"
      role="tablist"
      aria-label="Sekmeler"
    >
      <Link href="/feed" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 text-[13px] font-medium text-violet-200"><Radio className="h-4 w-4" aria-hidden="true" />Akış</Link>
      <Link href="/recommendations" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 text-[13px] font-medium text-violet-200"><Send className="h-4 w-4" aria-hidden="true" />Öneriler</Link>
      <Link href="/notifications" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 text-[13px] font-medium text-violet-200"><Bell className="h-4 w-4" aria-hidden="true" />Bildirimler</Link>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id as TabType)}
            className={`
              relative inline-flex items-center gap-2 px-3 sm:px-3.5 h-10 rounded-lg text-[13px] sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40
              ${isActive
                ? "bg-violet-500/20 text-violet-200 border border-violet-500/30 shadow-sm shadow-violet-500/10"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"}
            `}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
