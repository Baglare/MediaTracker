"use client";

import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { Settings as SettingsIcon } from "lucide-react";
import AuthPanel from "@/components/auth-panel";
import CloudDataStatusCard from "@/components/cloud-data-status-card";
import CloudSyncStatusCard from "@/components/cloud-sync-status-card";
import DataManagementPanel from "@/components/data-management-panel";
import DuplicateReviewPanel from "@/components/duplicate-review-panel";
import LocalDataIntegrityPanel from "@/components/local-data-integrity-panel";
import PageHeader from "@/components/page-header";
import AppearanceSettingsCard from "@/components/personalization/appearance-settings-card";
import LayoutSettingsCard from "@/components/personalization/layout-settings-card";
import StartupSettingsCard from "@/components/personalization/startup-settings-card";
import { PersonalDataOwnershipPanel } from "@/components/personal-data-ownership-panel";
import type { useLayoutPreferences } from "@/hooks/use-layout-preferences";
import type { MediaItem, ProgressLog } from "@/lib/types";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";

type LayoutController = ReturnType<typeof useLayoutPreferences>;

interface SettingsFeatureProps {
  user: User | null;
  configured: boolean;
  ownerScope: LocalOwnerScope | null;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  layout: LayoutController;
  onReplaceData: (items: MediaItem[], logs: ProgressLog[]) => boolean;
  onApplyCloudConflictResolution: (
    items: MediaItem[],
    logs: ProgressLog[],
  ) => boolean;
  onReset: () => void;
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

export default function SettingsFeature({
  user,
  configured,
  ownerScope,
  mediaList,
  progressLogs,
  layout,
  onReplaceData,
  onApplyCloudConflictResolution,
  onReset,
  onConfirm,
}: SettingsFeatureProps) {
  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Ayarlar"
        subtitle="Hesap, cloud sync, veri yönetimi ve uygulama bilgisi"
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <PersonalDataOwnershipPanel />
        <AppearanceSettingsCard onConfirm={onConfirm} />
        <LayoutSettingsCard
          preferences={layout.preferences}
          isHydrated={layout.isHydrated}
          statusMessage={layout.statusMessage}
          onVisibilityChange={layout.updateVisibility}
          onMove={layout.moveWidget}
          onResetDashboard={layout.resetDashboard}
          onResetRightRail={layout.resetRightRail}
          onResetAll={() => onConfirm(
            "Tüm düzeni sıfırla",
            "Dashboard ve sağ panel görünürlüğü ile sırası varsayılana dönecek.",
            layout.resetAll,
          )}
        />
        <StartupSettingsCard />
        <div className="space-y-4 lg:space-y-5">
          <AuthPanel />
          <CloudSyncStatusCard
            ownerScope={ownerScope}
            mediaItems={mediaList}
            progressLogs={progressLogs}
            onApplyResolution={onApplyCloudConflictResolution}
            onConfirm={onConfirm}
          />
        </div>
        <div className="space-y-4 lg:space-y-5">
          <CloudDataStatusCard
            user={user}
            configured={configured}
            mediaItems={mediaList}
            progressLogs={progressLogs}
            onReplaceData={onReplaceData}
            onConfirm={onConfirm}
          />
          <DataManagementPanel
            ownerScope={ownerScope}
            mediaList={mediaList}
            progressLogs={progressLogs}
            onImport={onReplaceData}
            onReset={onReset}
            onConfirm={onConfirm}
          />
          <LocalDataIntegrityPanel
            ownerScope={ownerScope}
            mediaList={mediaList}
            progressLogs={progressLogs}
          />
          <DuplicateReviewPanel
            ownerScope={ownerScope}
            mediaList={mediaList}
            progressLogs={progressLogs}
          />
        </div>
        <div className="app-panel rounded-2xl border p-[var(--app-panel-padding)] lg:col-span-2">
          <div className="mb-4 flex items-center gap-2.5">
            <Image
              src="/brand/media-tracker-mark.svg"
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 object-contain"
            />
            <h3 className="text-base font-semibold tracking-tight text-[var(--app-text-primary)]">
              Uygulama Bilgisi
            </h3>
          </div>
          <div className="space-y-4 text-sm text-[var(--app-text-secondary)]">
            <p>
              <strong>MediaTracker</strong> verilerini tarayıcının yerel depolama alanında
              tutar. Cloud eşitleme yalnız kullanıcı tarafından etkinleştirildiğinde mevcut
              hesap üzerinden yürütülür.
            </p>
            <div className="my-4 h-px bg-[var(--app-border)]" />
            <h4 className="font-medium text-[var(--app-text-primary)]">Veri Kaynakları (APIs)</h4>
            <ul className="grid list-disc grid-cols-1 gap-x-6 gap-y-2 pl-5 lg:grid-cols-2">
              <li>
                TV show data powered by{" "}
                <a href="https://www.tvmaze.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--app-accent)]">
                  TVmaze
                </a>.
              </li>
              <li>
                Anime and manga data from{" "}
                <a href="https://anilist.co/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--app-accent)]">
                  AniList
                </a>.
              </li>
              <li>
                Book data from{" "}
                <a href="https://openlibrary.org/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--app-accent)]">
                  Open Library
                </a>.
              </li>
              <li>
                This product uses the{" "}
                <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--app-accent)]">
                  TMDB API
                </a>{" "}
                but is not endorsed or certified by TMDB.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
