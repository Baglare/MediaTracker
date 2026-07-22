"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { useAppearancePreferences } from "@/hooks/use-appearance-preferences";
import {
  appearanceCookieDocumentValue,
  type AppearanceCookieIdentity,
} from "@/lib/personalization/appearance-cookie";
import {
  applyRootAppearanceAttributes,
  resolveRootAppearanceAttributes,
  subscribeToSystemTheme,
} from "@/lib/personalization/appearance-runtime";
import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "@/lib/personalization/defaults";
import type {
  AppAppearancePreferences,
  WorldThemeKey,
} from "@/lib/personalization/types";

interface AppearanceRuntimeValue {
  preferences: AppAppearancePreferences;
  hydrated: boolean;
  updatePreference: <K extends keyof AppAppearancePreferences>(
    key: K,
    value: AppAppearancePreferences[K],
  ) => void;
  resetToDefaults: () => void;
  activeWorld: WorldThemeKey;
  resolvedTheme: "obsidian" | "porcelain" | "ocean";
  resolvedAccent: "theme" | WorldThemeKey;
  setActiveWorld: (world: WorldThemeKey) => void;
}

const AppearanceRuntimeContext = createContext<AppearanceRuntimeValue | null>(null);

export function AppearanceRuntime({
  initialIdentity,
  children,
}: {
  initialIdentity: AppearanceCookieIdentity;
  children: ReactNode;
}) {
  const initialPreferences = useMemo<AppAppearancePreferences>(() => ({
    ...DEFAULT_APP_APPEARANCE_PREFERENCES,
    baseTheme: initialIdentity.baseTheme,
    accentMode: initialIdentity.accentMode,
  }), [initialIdentity.accentMode, initialIdentity.baseTheme]);
  const {
    preferences,
    hydrated,
    updatePreference,
    resetToDefaults,
  } = useAppearancePreferences(initialPreferences);
  const [activeWorld, setActiveWorldState] = useState<WorldThemeKey>("neutral");
  const [prefersDark, setPrefersDark] = useState(initialIdentity.resolvedTheme !== "porcelain");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize the system theme after hydration
    setPrefersDark(mediaQuery.matches);
    return subscribeToSystemTheme(mediaQuery, setPrefersDark);
  }, []);

  const attributes = useMemo(() => resolveRootAppearanceAttributes(
    preferences,
    activeWorld,
    prefersDark,
  ), [activeWorld, preferences, prefersDark]);

  useEffect(() => {
    applyRootAppearanceAttributes(document.documentElement, attributes);
    document.cookie = appearanceCookieDocumentValue({
      baseTheme: preferences.baseTheme,
      resolvedTheme: attributes.theme,
      accentMode: preferences.accentMode,
    }, window.location.protocol === "https:");
  }, [attributes, preferences.accentMode, preferences.baseTheme]);

  const setActiveWorld = useCallback((world: WorldThemeKey) => {
    setActiveWorldState(world);
  }, []);

  const value = useMemo<AppearanceRuntimeValue>(() => ({
    preferences,
    hydrated,
    updatePreference,
    resetToDefaults,
    activeWorld,
    resolvedTheme: attributes.theme,
    resolvedAccent: attributes.resolvedAccent,
    setActiveWorld,
  }), [
    activeWorld,
    attributes.resolvedAccent,
    attributes.theme,
    hydrated,
    preferences,
    resetToDefaults,
    setActiveWorld,
    updatePreference,
  ]);

  return (
    <AppearanceRuntimeContext.Provider value={value}>
      {children}
    </AppearanceRuntimeContext.Provider>
  );
}

export function useAppearanceRuntime(): AppearanceRuntimeValue {
  const value = useContext(AppearanceRuntimeContext);
  if (!value) throw new Error("useAppearanceRuntime must be used inside AppearanceRuntime.");
  return value;
}

export function AppearanceWorldScope({
  world,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { world: WorldThemeKey }) {
  const { setActiveWorld } = useAppearanceRuntime();

  useEffect(() => {
    setActiveWorld(world);
    return () => setActiveWorld("neutral");
  }, [setActiveWorld, world]);

  return <div data-world={world} {...props}>{children}</div>;
}
