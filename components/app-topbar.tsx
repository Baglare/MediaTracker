"use client";

// ============================================
// App Topbar (R1: Layout Redesign)
// ============================================
// Slim üst çubuk: breadcrumb + cloud durumu rozeti.
// Eski `AppHeader`'ın yerini tutar; ana navigasyon `AppSidebar`'a taşındı.
// Mobil/tablet altında (lg<) sidebar gizli; bunun yerine yatay scroll'lu
// `AppTabs` döndürürüz ki TabType erişimi kaybolmasın.

import { ChevronRight, Settings } from "lucide-react";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import CloudModeBadge from "./cloud-mode-badge";
import AppTabs, { type TabType } from "./app-tabs";
import { ProfileAvatar } from "./sidebar-profile-card";

const TAB_LABELS: Record<TabType, string> = {
  dashboard: "Dashboard",
  library: "Kütüphanem",
  discover: "Keşfet",
  calendar: "Takvim",
  progress: "İlerlemem",
  watchlist: "İzleme Listem",
  favorites: "Favorilerim",
  ratings: "Puanlamalarım",
  notes: "Notlarım",
  stats: "İstatistikler",
  profile: "Profil",
  ai: "AI Danışman",
  activity: "Aktivite",
  settings: "Ayarlar",
};

interface AppTopbarProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onOpenProfile: () => void;
  profileName: string;
  profilePreferences: ProfilePreferences;
}

export default function AppTopbar({
  activeTab,
  onChangeTab,
  onOpenProfile,
  profileName,
  profilePreferences,
}: AppTopbarProps) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-md"
      role="banner"
    >
      <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-6 h-14">
        {/* Mobil marka (sidebar gizliyken yerine geçer) */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex min-w-0 items-center gap-2 rounded-lg text-left lg:hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
          aria-label="Profili aç"
          title="Profili aç"
        >
          <ProfileAvatar profileName={profileName} preferences={profilePreferences} size="sm" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-100 tracking-tight">
              MediaTracker
            </span>
            <span className="block max-w-[8rem] truncate text-[10px] text-zinc-500 sm:max-w-[12rem]">
              {profileName}
            </span>
          </div>
        </button>

        {/* Breadcrumb — lg+ sidebar var, marka tekrar etmeyelim */}
        <div className="hidden lg:flex items-center gap-1.5 text-[13px] text-zinc-500 min-w-0">
          <span>MediaTracker</span>
          <ChevronRight className="w-3 h-3 opacity-50 shrink-0" aria-hidden="true" />
          <strong className="text-zinc-100 font-semibold truncate">
            {TAB_LABELS[activeTab]}
          </strong>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <CloudModeBadge />
          </div>
          <button
            type="button"
            onClick={() => onChangeTab("settings")}
            className={`lg:hidden grid h-8 w-8 place-items-center rounded-lg border transition-colors cursor-pointer ${
              activeTab === "settings"
                ? "border-amber-500/35 bg-amber-500/15 text-amber-200"
                : "border-zinc-800/70 bg-zinc-900/35 text-zinc-400 hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-amber-200"
            } focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40`}
            aria-label="Ayarları aç"
            title="Ayarları aç"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Mobil/tablet fallback tab bar (lg altı). Sidebar gizliyken kullanıcıya
          sekmeleri kaybolmuş hissi vermemek için mevcut AppTabs'i kullanıyoruz.
          R20: Mobilde edge padding sıkılaştı, sekmeler full-bleed yatay scroll'a
          yaslanır; gradient edge fade ile scroll'un devam ettiği ipucu verir. */}
      <div className="lg:hidden relative border-t border-zinc-800/60 px-3 sm:px-6 py-1.5 sm:py-2">
        <AppTabs activeTab={activeTab} onChange={onChangeTab} />
        {/* Sağ kenar fade — taşan tab olduğunda kullanıcıya kaydırma sinyali */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-full w-6 bg-gradient-to-l from-zinc-950/80 to-transparent"
        />
      </div>
    </header>
  );
}
