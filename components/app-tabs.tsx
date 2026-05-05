"use client";

import { LayoutDashboard, Library, Compass, Activity, Settings, Sparkles } from "lucide-react";

export type TabType = "dashboard" | "library" | "discover" | "ai" | "activity" | "settings";

interface AppTabsProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export default function AppTabs({ activeTab, onChange }: AppTabsProps) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "library", label: "Kütüphanem", icon: Library },
    { id: "discover", label: "Keşfet", icon: Compass },
    { id: "ai", label: "AI Danışman", icon: Sparkles },
    { id: "activity", label: "Aktivite", icon: Activity },
    { id: "settings", label: "Ayarlar", icon: Settings },
  ] as const;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id as TabType)}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer
              ${isActive 
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"}
            `}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
