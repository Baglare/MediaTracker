"use client";

import { useCallback, useEffect, useState } from "react";
import type { EastSubFilter, ThemeFilter } from "@/components/media-filters";
import type { LibrarySort, LibraryView } from "@/components/library-control-bar";
import {
  DEFAULT_PROFILE_PREFERENCES,
  loadProfilePreferences,
  saveProfilePreferences,
  type ProfilePreferences,
} from "@/lib/profile-preferences";
import {
  DEFAULT_UI_PREFERENCES,
  loadUIPreferences,
  saveUIPreferences,
} from "@/lib/storage";
import type { MediaStatus, MediaType } from "@/lib/types";

export type WorldTransitionState = {
  token: number;
  world: "east" | "screen" | "arch" | "neutral";
} | null;

export function usePersistedPreferences() {
  const [uiPrefsLoaded, setUiPrefsLoaded] = useState(false);
  const [profilePrefsLoaded, setProfilePrefsLoaded] = useState(false);
  const [profilePreferences, setProfilePreferences] = useState<ProfilePreferences>(
    DEFAULT_PROFILE_PREFERENCES
  );
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">(
    DEFAULT_UI_PREFERENCES.typeFilter
  );
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "active" | "all">(
    DEFAULT_UI_PREFERENCES.statusFilter
  );
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>(
    DEFAULT_UI_PREFERENCES.themeFilter
  );
  const [eastSubFilter, setEastSubFilter] = useState<EastSubFilter>(
    DEFAULT_UI_PREFERENCES.eastSubFilter
  );
  const [librarySort, setLibrarySort] = useState<LibrarySort>(
    DEFAULT_UI_PREFERENCES.librarySort
  );
  const [libraryView, setLibraryView] = useState<LibraryView>(
    DEFAULT_UI_PREFERENCES.libraryView
  );
  const [continueSectionOpen, setContinueSectionOpen] = useState(
    DEFAULT_UI_PREFERENCES.continueSectionOpen
  );
  const [seriesSectionOpen, setSeriesSectionOpen] = useState(
    DEFAULT_UI_PREFERENCES.seriesSectionOpen
  );
  const [worldTransition, setWorldTransition] = useState<WorldTransitionState>(null);

  const handleThemeFilterChange = useCallback((next: ThemeFilter) => {
    setThemeFilter(next);
    if (next !== "east") setEastSubFilter("all");
    if (next === "east") {
      setTypeFilter("all");
    } else if (next === "screen") {
      if (typeFilter !== "all" && typeFilter !== "movie" && typeFilter !== "tv") {
        setTypeFilter("all");
      }
    } else if (next === "library") {
      if (typeFilter !== "all" && typeFilter !== "book") setTypeFilter("all");
    }

    const targetWorld =
      next === "east" ? "east"
      : next === "screen" ? "screen"
      : next === "library" ? "arch"
      : "neutral";
    setWorldTransition((previous) => ({
      token: (previous?.token ?? 0) + 1,
      world: targetWorld,
    }));
  }, [typeFilter]);

  useEffect(() => {
    const preferences = loadUIPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage hydration
    setThemeFilter(preferences.themeFilter);
    setEastSubFilter(preferences.eastSubFilter);
    setTypeFilter(preferences.typeFilter);
    setStatusFilter(preferences.statusFilter);
    setLibrarySort(preferences.librarySort);
    setLibraryView(preferences.libraryView);
    setContinueSectionOpen(preferences.continueSectionOpen);
    setSeriesSectionOpen(preferences.seriesSectionOpen);
    setUiPrefsLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage hydration
    setProfilePreferences(loadProfilePreferences());
    setProfilePrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!uiPrefsLoaded) return;
    saveUIPreferences({
      themeFilter,
      eastSubFilter,
      typeFilter,
      statusFilter,
      librarySort,
      libraryView,
      continueSectionOpen,
      seriesSectionOpen,
    });
  }, [
    uiPrefsLoaded,
    themeFilter,
    eastSubFilter,
    typeFilter,
    statusFilter,
    librarySort,
    libraryView,
    continueSectionOpen,
    seriesSectionOpen,
  ]);

  useEffect(() => {
    if (profilePrefsLoaded) saveProfilePreferences(profilePreferences);
  }, [profilePrefsLoaded, profilePreferences]);

  return {
    profilePreferences,
    setProfilePreferences,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    themeFilter,
    eastSubFilter,
    setEastSubFilter,
    librarySort,
    setLibrarySort,
    libraryView,
    setLibraryView,
    continueSectionOpen,
    setContinueSectionOpen,
    seriesSectionOpen,
    setSeriesSectionOpen,
    worldTransition,
    handleThemeFilterChange,
  };
}
