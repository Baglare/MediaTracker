"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_STARTUP_PREFERENCES,
  readStartupPreferences,
  resetStartupPreferences,
  writeStartupPreferences,
  type DefaultDashboardTab,
  type StartupPreferences,
} from "@/lib/personalization/startup-preferences";

export function useStartupPreferences() {
  const [preferences, setPreferences] = useState<StartupPreferences>(
    DEFAULT_STARTUP_PREFERENCES,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage hydration
    setPreferences(readStartupPreferences(window.localStorage));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeStartupPreferences(window.localStorage, preferences);
  }, [hydrated, preferences]);

  const setDefaultDashboardTab = useCallback((tab: DefaultDashboardTab) => {
    setPreferences((current) => ({ ...current, defaultDashboardTab: tab }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setPreferences(resetStartupPreferences(window.localStorage));
  }, []);

  return {
    preferences,
    hydrated,
    setDefaultDashboardTab,
    resetToDefaults,
  };
}
