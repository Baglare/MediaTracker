"use client";

// ============================================
// App Topbar (R1: Layout Redesign)
// ============================================
// Slim üst çubuk: breadcrumb + cloud durumu rozeti.
// Eski `AppHeader`'ın yerini tutar; ana navigasyon `AppSidebar`'a taşındı.
// Mobil/tablet altında (lg<) sidebar gizli; bunun yerine yatay scroll'lu
// `AppTabs` döndürürüz ki TabType erişimi kaybolmasın.

import { ChevronRight } from "lucide-react";
import CloudModeBadge from "./cloud-mode-badge";
import AppTabs, { type TabType } from "./app-tabs";

const TAB_LABELS: Record<TabType, string> = {
  dashboard: "Dashboard",
  library: "Kütüphanem",
  discover: "Keşfet",
  watchlist: "İzleme Listem",
  favorites: "Favorilerim",
  ratings: "Puanlamalarım",
  ai: "AI Danışman",
  activity: "Aktivite",
  settings: "Ayarlar",
};

interface AppTopbarProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export default function AppTopbar({ activeTab, onChangeTab }: AppTopbarProps) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-md"
      role="banner"
    >
      <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-6 h-14">
        {/* Mobil marka (sidebar gizliyken yerine geçer) */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-400 to-amber-600 grid place-items-center text-zinc-950 font-bold text-xs">
            M
          </div>
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">MediaTracker</span>
        </div>

        {/* Breadcrumb — lg+ sidebar var, marka tekrar etmeyelim */}
        <div className="hidden lg:flex items-center gap-1.5 text-[13px] text-zinc-500 min-w-0">
          <span>MediaTracker</span>
          <ChevronRight className="w-3 h-3 opacity-50 shrink-0" aria-hidden="true" />
          <strong className="text-zinc-100 font-semibold truncate">
            {TAB_LABELS[activeTab]}
          </strong>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <CloudModeBadge />
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
