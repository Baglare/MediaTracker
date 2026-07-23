"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultLayoutPreferences,
  loadLayoutPreferences,
  moveLayoutWidget,
  resetLayoutSurface,
  saveLayoutPreferences,
  setLayoutWidgetVisibility,
} from "@/lib/personalization/layout-preferences";
import type {
  DashboardWidgetId,
  LayoutMove,
  LayoutPreferences,
  LayoutSurface,
  RightRailWidgetId,
} from "@/lib/personalization/layout-types";

export function useLayoutPreferences() {
  const [preferences, setPreferences] = useState<LayoutPreferences>(defaultLayoutPreferences);
  const [isHydrated, setIsHydrated] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage hydration
    setPreferences(loadLayoutPreferences());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveLayoutPreferences(preferences);
  }, [isHydrated, preferences]);

  const updateVisibility = useCallback((
    surface: LayoutSurface,
    id: DashboardWidgetId | RightRailWidgetId,
    visible: boolean,
  ) => {
    setPreferences((current) => setLayoutWidgetVisibility(current, surface, id, visible));
    setStatusMessage(visible ? "Panel gösteriliyor. Kaydedildi." : "Panel gizlendi. Kaydedildi.");
  }, []);

  const moveWidget = useCallback((
    surface: LayoutSurface,
    id: DashboardWidgetId | RightRailWidgetId,
    move: LayoutMove,
    label: string,
  ) => {
    setPreferences((current) => moveLayoutWidget(current, surface, id, move));
    setStatusMessage(`${label} sırası güncellendi. Kaydedildi.`);
  }, []);

  const resetSurface = useCallback((surface: LayoutSurface) => {
    setPreferences((current) => resetLayoutSurface(current, surface));
    setStatusMessage(
      surface === "dashboard"
        ? "Dashboard düzeni varsayılana döndü."
        : "Sağ panel düzeni varsayılana döndü.",
    );
  }, []);

  const resetAll = useCallback(() => {
    setPreferences(defaultLayoutPreferences());
    setStatusMessage("Tüm düzen tercihleri varsayılana döndü.");
  }, []);

  return {
    preferences,
    isHydrated,
    statusMessage,
    updateVisibility,
    moveWidget,
    resetDashboard: () => resetSurface("dashboard"),
    resetRightRail: () => resetSurface("rightRail"),
    resetAll,
  };
}
