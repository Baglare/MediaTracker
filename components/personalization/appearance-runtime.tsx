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
import { useOwnerThemeSelection } from "@/hooks/use-owner-theme-selection";
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
    theme: initialIdentity.theme.kind === "preset"
      ? initialIdentity.theme
      : { kind: "preset", id: "obsidian" },
    accentMode: initialIdentity.accentMode,
  }), [initialIdentity.accentMode, initialIdentity.theme]);
  const {
    preferences,
    hydrated,
    updatePreference,
    resetToDefaults,
  } = useAppearancePreferences(initialPreferences);
  const customThemes = useCustomThemesRuntime();
  const ownerTheme = useOwnerThemeSelection();
  const [activeWorld, setActiveWorldState] = useState<WorldThemeKey>("neutral");
  const [prefersDark, setPrefersDark] = useState(initialIdentity.resolvedTheme !== "porcelain");
  const [previewTheme, setPreviewTheme] = useState<CustomThemeDefinition | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize system preference
    setPrefersDark(mediaQuery.matches);
    return subscribeToSystemTheme(mediaQuery, setPrefersDark);
  }, []);

  const effectiveTheme = ownerTheme.hydrated && ownerTheme.selection?.kind === "custom"
    ? ownerTheme.selection
    : preferences.theme;
  const effectivePreferences = useMemo<AppAppearancePreferences>(() => ({
    ...preferences,
    theme: effectiveTheme,
  }), [effectiveTheme, preferences]);
  const persistedCustomTheme = effectiveTheme.kind === "custom"
    ? customThemes.themes.find((theme) => theme.id === effectiveTheme.id)
    : undefined;
  const runtimeCustomTheme = previewTheme ?? persistedCustomTheme;
  const runtimePreferences = useMemo<AppAppearancePreferences>(() => (
    previewTheme
      ? { ...effectivePreferences, theme: { kind: "custom", id: previewTheme.id } }
      : effectivePreferences
  ), [effectivePreferences, previewTheme]);
  const attributes = useMemo(() => resolveRootAppearanceAttributes(
    runtimePreferences,
    activeWorld,
    prefersDark,
    runtimeCustomTheme,
  ), [activeWorld, prefersDark, runtimeCustomTheme, runtimePreferences]);

  useEffect(() => {
    if (
      !hydrated
      || !ownerTheme.hydrated
      || !customThemes.hydrated
      || effectiveTheme.kind !== "custom"
      || persistedCustomTheme
    ) return;
    ownerTheme.setSelection(null);
  }, [
    customThemes.hydrated,
    effectiveTheme,
    hydrated,
    ownerTheme,
    persistedCustomTheme,
  ]);

  useEffect(() => {
    applyRootAppearanceAttributes(document.documentElement, attributes);
  }, [attributes]);

  useEffect(() => {
    if (previewTheme) return;
    const cookieResolved = attributes.theme === "custom"
      ? preferences.theme.kind === "preset" && preferences.theme.id !== "system"
        ? preferences.theme.id
        : "obsidian"
      : attributes.theme;
    document.cookie = appearanceCookieDocumentValue({
      theme: preferences.theme,
      resolvedTheme: cookieResolved,
      accentMode: preferences.accentMode,
    }, window.location.protocol === "https:");
  }, [attributes.theme, preferences.accentMode, preferences.theme, previewTheme]);

  const setActiveWorld = useCallback((world: WorldThemeKey) => {
    setActiveWorldState(world);
  }, []);

  const setThemeSelection = useCallback((selection: ThemeSelection) => {
    setPreviewTheme(null);
    if (selection.kind === "custom") {
      ownerTheme.setSelection(selection);
      return;
    }
    if (ownerTheme.setSelection(null)) updatePreference("theme", selection);
  }, [ownerTheme, updatePreference]);

  const previewCustomTheme = useCallback((theme: CustomThemeDefinition) => {
    setPreviewTheme(theme);
  }, []);

  const clearThemePreview = useCallback(() => {
    setPreviewTheme(null);
  }, []);

  const resetAppearance = useCallback(() => {
    setPreviewTheme(null);
    ownerTheme.setSelection(null);
    resetToDefaults();
  }, [ownerTheme, resetToDefaults]);

  const value = useMemo<AppearanceRuntimeValue>(() => ({
    preferences: runtimePreferences,
    hydrated: hydrated && ownerTheme.hydrated && customThemes.hydrated,
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
    clearThemePreview,
    customThemes.hydrated,
    hydrated,
    ownerTheme.hydrated,
    previewCustomTheme,
    previewTheme,
    resetAppearance,
    runtimePreferences,
    setActiveWorld,
    setThemeSelection,
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
