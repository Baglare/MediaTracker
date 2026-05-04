"use client";

import AppTabs, { TabType } from "./app-tabs";
import CloudModeBadge from "./cloud-mode-badge";

interface AppHeaderProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export default function AppHeader({ activeTab, onChangeTab }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-zinc-950/95 border-b border-zinc-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <div className="flex flex-col gap-4">
          {/* Logo ve Başlık */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <span className="text-white text-lg font-bold">M</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white tracking-tight">
                MediaTracker
              </h1>
              <p className="text-xs text-zinc-500">
                Film, dizi, anime ve daha fazlasını takip et
              </p>
            </div>
            <CloudModeBadge />
          </div>

          {/* Sekmeler */}
          <AppTabs activeTab={activeTab} onChange={onChangeTab} />
        </div>
      </div>
    </header>
  );
}
