"use client";

import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { Activity as ActivityIcon, LayoutDashboard, Settings as SettingsIcon, Sparkles } from "lucide-react";
import ActivityLogPanel from "@/components/activity-log-panel";
import AiAdvisor from "@/components/ai-advisor";
import AuthPanel from "@/components/auth-panel";
import CloudDataStatusCard from "@/components/cloud-data-status-card";
import CloudSyncStatusCard from "@/components/cloud-sync-status-card";
import DataManagementPanel from "@/components/data-management-panel";
import EnhancedDashboard from "@/components/enhanced-dashboard";
import PageHeader from "@/components/page-header";
import RightRailSettingsCard from "@/components/right-rail-settings-card";
import type { TabType } from "@/components/app-tabs";
import type { DashboardStats } from "@/lib/dashboard-stats";
import type { GlobalSearchResult } from "@/lib/global-search-types";
import type { RightRailPreferences } from "@/lib/right-rail-preferences";
import type { MediaItem, MediaType, ProgressLog } from "@/lib/types";

interface MediaActions {
  onSelectMedia: (item: MediaItem) => void;
  onIncrement: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteMedia: (id: string) => void;
  onUpdateRating: (id: string, rating: number | null) => void;
}

interface SettingsContent {
  user: User | null;
  configured: boolean;
  rightRailPreferences: RightRailPreferences;
  onRightRailPreferencesChange: (preferences: RightRailPreferences) => void;
  onReplaceData: (items: MediaItem[], logs: ProgressLog[]) => void;
  onReset: () => void;
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

interface AppTabContentProps {
  activeTab: TabType;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  dashboardStats: DashboardStats;
  mediaActions: MediaActions;
  onAddFromGlobalSearch: (result: GlobalSearchResult) => void | Promise<void>;
  onOpenAiDiscover: (title: string, mediaType: MediaType) => void;
  settings: SettingsContent;
}

export default function AppTabContent({
  activeTab,
  mediaList,
  progressLogs,
  dashboardStats,
  mediaActions,
  onAddFromGlobalSearch,
  onOpenAiDiscover,
  settings,
}: AppTabContentProps) {
  if (activeTab === "dashboard") {
    return (
      <div>
        <PageHeader icon={LayoutDashboard} title="Dashboard" subtitle="Genel istatistikler ve son aktiviteler" />
        <EnhancedDashboard
          stats={dashboardStats}
          mediaList={mediaList}
          progressLogs={progressLogs}
          {...mediaActions}
        />
      </div>
    );
  }

  if (activeTab === "ai") {
    return (
      <div>
        <PageHeader icon={Sparkles} title="AI Danışman" subtitle="Kütüphanenden yola çıkarak öneriler ve analizler" />
        <AiAdvisor
          mediaList={mediaList}
          progressLogs={progressLogs}
          resetSignal={0}
          onAddToLibrary={onAddFromGlobalSearch}
          onOpenDiscover={(recommendation) => onOpenAiDiscover(recommendation.title, recommendation.mediaType)}
        />
      </div>
    );
  }

  if (activeTab === "activity") {
    return (
      <div>
        <PageHeader icon={ActivityIcon} title="Aktivite" subtitle="İlerleme ve durum kayıtlarının zaman çizelgesi" />
        <ActivityLogPanel progressLogs={progressLogs} />
      </div>
    );
  }

  if (activeTab !== "settings") return null;

  return (
    <div>
      <PageHeader icon={SettingsIcon} title="Ayarlar" subtitle="Hesap, cloud sync, veri yönetimi ve uygulama bilgisi" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start">
        <div className="space-y-4 lg:space-y-5">
          <AuthPanel />
          <CloudSyncStatusCard />
          <RightRailSettingsCard
            preferences={settings.rightRailPreferences}
            onChange={settings.onRightRailPreferencesChange}
          />
        </div>

        <div className="space-y-4 lg:space-y-5">
          <CloudDataStatusCard
            user={settings.user}
            configured={settings.configured}
            mediaItems={mediaList}
            progressLogs={progressLogs}
            onReplaceData={settings.onReplaceData}
            onConfirm={settings.onConfirm}
          />
          <DataManagementPanel
            mediaList={mediaList}
            progressLogs={progressLogs}
            onImport={settings.onReplaceData}
            onReset={settings.onReset}
            onConfirm={settings.onConfirm}
          />
        </div>

        <div className="lg:col-span-2 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <Image
              src="/brand/media-tracker-mark.svg"
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 object-contain"
            />
            <h3 className="text-base font-semibold text-zinc-100 tracking-tight">Uygulama Bilgisi</h3>
          </div>
          <div className="space-y-4 text-sm text-zinc-400">
            <p><strong>MediaTracker</strong> tüm verileri tarayıcınızın yerel depolama alanında (localStorage) tutar. Verileriniz hiçbir dış sunucuya gönderilmez veya bir veritabanına kaydedilmez.</p>
            <div className="h-px bg-zinc-800/60 my-4" />
            <h4 className="font-medium text-zinc-300">Veri Kaynakları (APIs)</h4>
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2 list-disc pl-5">
              <li>TV show data powered by <a href="https://www.tvmaze.com/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">TVmaze</a>.</li>
              <li>Anime and manga data from <a href="https://anilist.co/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">AniList</a>.</li>
              <li>Book data from <a href="https://openlibrary.org/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">Open Library</a>.</li>
              <li>
                This product uses the <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">TMDB API</a> but is not endorsed or certified by TMDB.
                <br/><span className="text-xs text-zinc-500 italic">Not: Film araması geçici olarak devre dışı. TMDB erişimi düzeldiğinde aktif edilebilir.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
