import type { AppAppearancePreferences, WorldThemeKey } from "./types";
import { resolveAppearanceTheme } from "./resolve-appearance";

export interface RootAppearanceAttributes {
  theme: "obsidian" | "porcelain" | "ocean";
  baseTheme: AppAppearancePreferences["baseTheme"];
  accentMode: AppAppearancePreferences["accentMode"];
  resolvedAccent: "theme" | WorldThemeKey;
  effects: AppAppearancePreferences["effectsLevel"];
  density: AppAppearancePreferences["density"];
  colorScheme: "light" | "dark";
}

export interface AppearanceRootTarget {
  dataset: Record<string, string | undefined>;
  style: { colorScheme: string };
}

export interface SystemThemeMediaQuery {
  matches: boolean;
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
}

export function resolveRootAppearanceAttributes(
  preferences: AppAppearancePreferences,
  activeWorld: WorldThemeKey,
  prefersDark: boolean,
): RootAppearanceAttributes {
  const resolved = resolveAppearanceTheme({
    baseTheme: preferences.baseTheme,
    accentMode: preferences.accentMode,
    activeWorld,
    prefersDark,
  });
  return {
    theme: resolved.resolvedBaseTheme,
    baseTheme: preferences.baseTheme,
    accentMode: preferences.accentMode,
    resolvedAccent: resolved.resolvedAccent,
    effects: preferences.effectsLevel,
    density: preferences.density,
    colorScheme: resolved.base.colorScheme,
  };
}

export function applyRootAppearanceAttributes(
  root: AppearanceRootTarget,
  attributes: RootAppearanceAttributes,
): void {
  root.dataset.theme = attributes.theme;
  root.dataset.baseTheme = attributes.baseTheme;
  root.dataset.accentMode = attributes.accentMode;
  root.dataset.resolvedAccent = attributes.resolvedAccent;
  root.dataset.effects = attributes.effects;
  root.dataset.density = attributes.density;
  root.style.colorScheme = attributes.colorScheme;
}

export function subscribeToSystemTheme(
  mediaQuery: SystemThemeMediaQuery,
  onChange: (prefersDark: boolean) => void,
): () => void {
  const listener = (event: { matches: boolean }) => onChange(event.matches);
  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener("change", listener);
}
