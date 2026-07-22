import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "./defaults";
import { getBaseThemeDefinition } from "./theme-registry";
import type {
  AccentMode,
  BaseThemeId,
  ResolvedAppearanceTheme,
  ResolvedBaseThemeId,
  WorldThemeKey,
} from "./types";
import { isWorldThemeKey, WORLD_THEME_REGISTRY } from "./world-theme-registry";

const BASE_THEME_IDS = new Set<BaseThemeId>(["system", "obsidian", "porcelain", "ocean"]);
const ACCENT_MODES = new Set<AccentMode>(["auto", "theme", "east", "screen", "arch", "neutral"]);

export interface ResolveAppearanceThemeInput {
  baseTheme?: unknown;
  accentMode?: unknown;
  activeWorld?: unknown;
  prefersDark?: unknown;
}

function resolveBaseTheme(value: unknown, prefersDark: unknown): ResolvedBaseThemeId {
  const baseTheme = typeof value === "string" && BASE_THEME_IDS.has(value as BaseThemeId)
    ? (value as BaseThemeId)
    : DEFAULT_APP_APPEARANCE_PREFERENCES.baseTheme;
  if (baseTheme === "system") return prefersDark === false ? "porcelain" : "obsidian";
  return baseTheme;
}

function resolveAccent(value: unknown, activeWorld: unknown): "theme" | WorldThemeKey {
  const accentMode = typeof value === "string" && ACCENT_MODES.has(value as AccentMode)
    ? (value as AccentMode)
    : DEFAULT_APP_APPEARANCE_PREFERENCES.accentMode;
  if (accentMode === "theme") return "theme";
  if (accentMode === "auto") return isWorldThemeKey(activeWorld) ? activeWorld : "neutral";
  return accentMode;
}

export function resolveAppearanceTheme(input: ResolveAppearanceThemeInput): ResolvedAppearanceTheme {
  const resolvedBaseTheme = resolveBaseTheme(input.baseTheme, input.prefersDark);
  const resolvedAccent = resolveAccent(input.accentMode, input.activeWorld);
  const worldKey = resolvedAccent === "theme" ? "neutral" : resolvedAccent;

  return {
    resolvedBaseTheme,
    resolvedAccent,
    base: getBaseThemeDefinition(resolvedBaseTheme),
    world: WORLD_THEME_REGISTRY[worldKey],
  };
}
