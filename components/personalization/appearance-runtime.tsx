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
import { useCustomThemesRuntime } from "./custom-themes-runtime";
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
  CustomThemeDefinition,
  ThemeSelection,
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
  setThemeSelection: (selection: ThemeSelection) => void;
  previewCustomTheme: (theme: CustomThemeDefinition) => void;
  clearThemePreview: () => void;
  previewingCustomTheme: boolean;
  activeWorld: WorldThemeKey;
  resolvedTheme: ReturnType<typeof resolveRootAppearanceAttributes>["theme"];
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
    theme: initialIdentity.theme,
    accentMode: initialIdentity.accentMode,
  }), [initialIdentity.accentMode, initialIdentity.theme]);
  const {
    preferences,
    hydrated,
    updatePreference,
    resetToDefaults,
  } = useAppearancePreferences(initialPreferences);
  const customThemes = useCustomThemesRuntime();
  const [activeWorld, setActiveWorldState] = useState<WorldThemeKey>("neutral");
  const [prefersDark, setPrefersDark] = useState(initialIdentity.resolvedTheme !== "porcelain");
  const [previewTheme, setPreviewTheme] = useState<CustomThemeDefinition | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize the system theme after hydration
    setPrefersDark(mediaQuery.matches);
    return subscribeToSystemTheme(mediaQuery, setPrefersDark);
  }, []);

  const cookieTheme = useMemo<CustomThemeDefinition | undefined>(() => (
    initialIdentity.customTheme
      ? {
          version: 1,
          id: initialIdentity.customTheme.id,
          name: "Aktif özel tema",
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
          inputs: initialIdentity.customTheme.inputs,
          corrections: initialIdentity.customTheme.corrections,
        }
      : undefined
  ), [initialIdentity.customTheme]);
  const persistedCustomTheme = preferences.theme.kind === "custom"
    ? customThemes.themes.find((theme) => theme.id === preferences.theme.id)
    : undefined;
  const runtimeCustomTheme = previewTheme
    ?? persistedCustomTheme
    ?? (!customThemes.hydrated && preferences.theme.kind === "custom"
      && cookieTheme?.id === preferences.theme.id ? cookieTheme : undefined);
  const runtimePreferences = useMemo<AppAppearancePreferences>(() => (
    previewTheme
      ? { ...preferences, theme: { kind: "custom", id: previewTheme.id } }
      : preferences
  ), [preferences, previewTheme]);
  const attributes = useMemo(() => resolveRootAppearanceAttributes(
    runtimePreferences,
    activeWorld,
    prefersDark,
    runtimeCustomTheme,
  ), [activeWorld, prefersDark, runtimeCustomTheme, runtimePreferences]);

  useEffect(() => {
    if (
      !hydrated
      || !customThemes.hydrated
      || preferences.theme.kind !== "custom"
      || persistedCustomTheme
    ) return;
    updatePreference("theme", { kind: "preset", id: "obsidian" });
  }, [
    customThemes.hydrated,
    hydrated,
    persistedCustomTheme,
    preferences.theme,
    updatePreference,
  ]);

  useEffect(() => {
    applyRootAppearanceAttributes(document.documentElement, attributes);
  }, [attributes]);

  useEffect(() => {
    if (previewTheme) return;
    document.cookie = appearanceCookieDocumentValue({
      theme: attributes.themeSelection,
      resolvedTheme: attributes.theme,
      accentMode: preferences.accentMode,
      customTheme: attributes.themeSource === "custom" && runtimeCustomTheme
        ? {
            id: runtimeCustomTheme.id,
            inputs: runtimeCustomTheme.inputs,
            corrections: runtimeCustomTheme.corrections,
          }
        : undefined,
    }, window.location.protocol === "https:");
  }, [
    attributes.theme,
    attributes.themeSelection,
    attributes.themeSource,
    preferences.accentMode,
    previewTheme,
    runtimeCustomTheme,
  ]);

  const setActiveWorld = useCallback((world: WorldThemeKey) => {
    setActiveWorldState(world);
  }, []);

  const setThemeSelection = useCallback((selection: ThemeSelection) => {
    setPreviewTheme(null);
    updatePreference("theme", selection);
  }, [updatePreference]);

  const previewCustomTheme = useCallback((theme: CustomThemeDefinition) => {
    setPreviewTheme(theme);
  }, []);

  const clearThemePreview = useCallback(() => {
    setPreviewTheme(null);
  }, []);

  const resetAppearance = useCallback(() => {
    setPreviewTheme(null);
    resetToDefaults();
  }, [resetToDefaults]);

  const value = useMemo<AppearanceRuntimeValue>(() => ({
    preferences,
    hydrated,
    updatePreference,
    resetToDefaults: resetAppearance,
    setThemeSelection,
    previewCustomTheme,
    clearThemePreview,
    previewingCustomTheme: Boolean(previewTheme),
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
    resetAppearance,
    setThemeSelection,
    previewCustomTheme,
    clearThemePreview,
    previewTheme,
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
