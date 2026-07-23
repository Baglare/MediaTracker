"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AppearanceWorldScope,
  useAppearanceRuntime,
} from "@/components/personalization/appearance-runtime";
import { useStartupRuntime } from "@/components/personalization/startup-runtime";
import RightRail from "@/components/right-rail";
import WorldTransition from "@/components/world-transition";
import {
  dashboardTabHref,
  parseDashboardTab,
  type DashboardTabId,
} from "@/components/app-shell/app-navigation";
import DashboardFeature from "@/features/dashboard/components/dashboard-feature";
import { MediaCommandHost } from "@/features/library/components/media-command-host";
import { resolveWorldScope, shouldShowDashboardRightRail } from "@/features/library/domain/selectors";
import { useLibraryViewModel } from "@/features/library/hooks/use-library-view-model";
import { useMediaCommands } from "@/features/library/hooks/use-media-commands";
import { useDiscoveryController } from "@/features/discovery/hooks/use-discovery-controller";
import { useAuth } from "@/hooks/use-auth";
import { useMediaLibrary } from "@/hooks/use-media-library";
import { useLayoutPreferences } from "@/hooks/use-layout-preferences";
import { usePersistedPreferences } from "@/hooks/use-persisted-preferences";
import { useXpProgression } from "@/hooks/use-xp-progression";
import { calculateDashboardStats } from "@/lib/dashboard-stats";
import type { GlobalSearchCategory } from "@/lib/global-search-types";
import { calculateUserProgression } from "@/lib/user-progression";
import type { MediaType } from "@/lib/types";

const LibraryFeature = dynamic(
  () => import("@/features/library/components/library-feature"),
);
const DiscoveryFeature = dynamic(
  () => import("@/features/discovery/components/discovery-feature"),
);
const CalendarFeature = dynamic(
  () => import("@/features/calendar/components/calendar-feature"),
);
const PersonalLibraryFeature = dynamic(
  () => import("@/features/library/components/personal-library-feature"),
);
const AdvisorFeature = dynamic(
  () => import("@/features/discovery/components/advisor-feature"),
);
const ActivityFeature = dynamic(
  () => import("@/features/dashboard/components/activity-feature"),
);
const SettingsFeature = dynamic(
  () => import("@/features/settings/components/settings-feature"),
);

const PERSONAL_TABS = new Set<DashboardTabId>([
  "progress",
  "watchlist",
  "favorites",
  "ratings",
  "notes",
  "stats",
]);

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startup = useStartupRuntime();
  const appearance = useAppearanceRuntime();
  const explicitTab = searchParams.get("tab");
  const activeTab = parseDashboardTab(
    explicitTab,
    startup.preferences.defaultDashboardTab,
  );
  const { user, configured } = useAuth();
  const library = useMediaLibrary(user?.id ?? null);
  const preferences = usePersistedPreferences();
  const layout = useLayoutPreferences();
  const [searchQuery, setSearchQuery] = useState("");
  const [discoverPrefill, setDiscoverPrefill] = useState<{
    query: string;
    category: GlobalSearchCategory;
    token: number;
  } | null>(null);

  const mutationApi = useMemo(
    () => ({
      saveMedia: library.saveMedia,
      deleteMedia: library.deleteMedia,
      incrementMedia: library.incrementMedia,
      completeMedia: library.completeMedia,
      toggleFavorite: library.toggleFavorite,
      updateRating: library.updateRating,
      commitMediaChanges: library.commitMediaChanges,
      resetMedia: library.resetMedia,
    }),
    [
      library.commitMediaChanges,
      library.completeMedia,
      library.deleteMedia,
      library.incrementMedia,
      library.resetMedia,
      library.saveMedia,
      library.toggleFavorite,
      library.updateRating,
    ],
  );
  const commands = useMediaCommands({
    mediaList: library.mediaList,
    progressLogs: library.progressLogs,
    mutations: mutationApi,
  });
  const discovery = useDiscoveryController({
    mediaList: library.mediaList,
    commands,
    commitMediaChanges: library.commitMediaChanges,
    preloadRelatedParts:
      activeTab === "library" ||
      activeTab === "calendar" ||
      PERSONAL_TABS.has(activeTab),
  });
  const libraryModel = useLibraryViewModel({
    media: library.mediaList,
    logs: library.progressLogs,
    query: searchQuery,
    type: preferences.typeFilter,
    status: preferences.statusFilter,
    world: preferences.themeFilter,
    eastSubtype: preferences.eastSubFilter,
    sort: preferences.librarySort,
  });
  const dashboardStats = useMemo(
    () => calculateDashboardStats(library.mediaList, library.progressLogs),
    [library.mediaList, library.progressLogs],
  );
  const legacyProgression = useMemo(
    () => calculateUserProgression(library.mediaList, library.progressLogs),
    [library.mediaList, library.progressLogs],
  );
  const { progression } = useXpProgression(user?.id ?? null, legacyProgression);

  const navigateToTab = useCallback(
    (tab: DashboardTabId) => {
      commands.closeOverlay();
      router.push(dashboardTabHref(tab));
    },
    [commands, router],
  );
  const openDiscoveryFromAdvisor = useCallback(
    (title: string, mediaType: MediaType) => {
      const category: GlobalSearchCategory =
        mediaType === "movie"
          ? "movie"
          : mediaType === "tv"
            ? "tv"
            : mediaType === "anime"
              ? "anime"
              : mediaType === "manga" || mediaType === "manhwa" || mediaType === "manhua"
                ? "manga"
                : mediaType === "light_novel" ||
                    mediaType === "web_novel" ||
                    mediaType === "visual_novel"
                  ? "novel"
                  : mediaType === "book"
                    ? "book"
                    : "all";
      setDiscoverPrefill((current) => ({
        query: title,
        category,
        token: (current?.token ?? 0) + 1,
      }));
      navigateToTab("discover");
    },
    [navigateToTab],
  );

  if (!library.isLoaded || (!startup.hydrated && explicitTab === null)) {
    return (
      <div className="grid min-h-64 place-items-center" aria-busy="true">
        <p className="text-sm text-[var(--app-text-muted)]">
          {!library.isLoaded ? "Kütüphane yükleniyor..." : "Başlangıç tercihi yükleniyor..."}
        </p>
      </div>
    );
  }

  const world = resolveWorldScope(activeTab, preferences.themeFilter);
  const showRightRail = shouldShowDashboardRightRail(activeTab);
  const content = (() => {
    if (activeTab === "dashboard") {
      return (
        <DashboardFeature
          stats={dashboardStats}
          mediaList={library.mediaList}
          progressLogs={library.progressLogs}
          onSelectMedia={commands.openDetail}
          onIncrement={commands.mutations.increment}
          onComplete={commands.mutations.complete}
          onEdit={commands.openEdit}
          onToggleFavorite={commands.mutations.toggleFavorite}
          onDeleteMedia={commands.requestDelete}
          onUpdateRating={commands.mutations.updateRating}
          widgetPreferences={layout.preferences.dashboard}
          isLayoutHydrated={layout.isHydrated}
          chartPaletteId={appearance.preferences.chartPaletteId}
          followWorldCompletedColor={appearance.preferences.followWorldCompletedColor}
          chartWorld={world}
        />
      );
    }
    if (activeTab === "library") {
      return (
        <LibraryFeature
          mediaList={library.mediaList}
          model={libraryModel}
          commands={commands}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          themeFilter={preferences.themeFilter}
          onThemeChange={preferences.handleThemeFilterChange}
          eastSubFilter={preferences.eastSubFilter}
          onEastSubChange={preferences.setEastSubFilter}
          typeFilter={preferences.typeFilter}
          onTypeChange={preferences.setTypeFilter}
          statusFilter={preferences.statusFilter}
          onStatusChange={preferences.setStatusFilter}
          librarySort={preferences.librarySort}
          onSortChange={preferences.setLibrarySort}
          libraryView={preferences.libraryView}
          onViewChange={preferences.setLibraryView}
          continueSectionOpen={preferences.continueSectionOpen}
          onContinueSectionOpenChange={preferences.setContinueSectionOpen}
          seriesSectionOpen={preferences.seriesSectionOpen}
          onSeriesSectionOpenChange={preferences.setSeriesSectionOpen}
          resolveRelatedAction={discovery.resolveRelatedAction}
          onAddRelatedParts={discovery.addMissingTvmazeParts}
        />
      );
    }
    if (activeTab === "discover") {
      return <DiscoveryFeature controller={discovery} prefill={discoverPrefill} />;
    }
    if (activeTab === "calendar") {
      return (
        <CalendarFeature
          mediaList={library.mediaList}
          progressLogs={library.progressLogs}
          commands={commands}
          resolveRelatedAction={discovery.resolveRelatedAction}
          onAddRelatedParts={discovery.addMissingTvmazeParts}
        />
      );
    }
    if (PERSONAL_TABS.has(activeTab)) {
      return (
        <PersonalLibraryFeature
          activeTab={activeTab as "progress" | "watchlist" | "favorites" | "ratings" | "notes" | "stats"}
          mediaList={library.mediaList}
          progressLogs={library.progressLogs}
          dashboardStats={dashboardStats}
          commands={commands}
          resolveRelatedAction={discovery.resolveRelatedAction}
          onAddRelatedParts={discovery.addMissingTvmazeParts}
        />
      );
    }
    if (activeTab === "ai") {
      return (
        <AdvisorFeature
          mediaList={library.mediaList}
          progressLogs={library.progressLogs}
          onAddToLibrary={discovery.addFromGlobalSearch}
          onOpenDiscover={openDiscoveryFromAdvisor}
        />
      );
    }
    if (activeTab === "activity") {
      return <ActivityFeature progressLogs={library.progressLogs} />;
    }
    if (activeTab === "settings") {
      return (
        <SettingsFeature
          user={user}
          configured={configured}
          mediaList={library.mediaList}
          progressLogs={library.progressLogs}
          layout={layout}
          onReplaceData={library.importMedia}
          onReset={commands.requestReset}
          onConfirm={commands.openConfirmation}
        />
      );
    }
    return null;
  })();

  return (
    <AppearanceWorldScope world={world} className="flex min-w-0 overflow-x-clip">
      <div
        className={`relative w-full min-w-0 px-4 py-[var(--app-page-gap)] sm:px-6 lg:px-8 ${
          showRightRail ? "xl:px-6" : "xl:px-8 2xl:px-10"
        }`}
      >
        <WorldTransition
          trigger={preferences.worldTransition}
          effectsLevel={appearance.preferences.effectsLevel}
        />
        {content}
        <MediaCommandHost commands={commands} mediaList={library.mediaList} />
      </div>
      {showRightRail && (
        <RightRail
          mediaList={library.mediaList}
          progressLogs={library.progressLogs}
          stats={dashboardStats}
          preferences={layout.preferences.rightRail}
          isLayoutHydrated={layout.isHydrated}
          progression={progression}
          themeFilter={preferences.themeFilter}
          chartPaletteId={appearance.preferences.chartPaletteId}
          followWorldCompletedColor={appearance.preferences.followWorldCompletedColor}
          chartWorld={world}
          onOpenDetail={commands.openDetail}
        />
      )}
    </AppearanceWorldScope>
  );
}
