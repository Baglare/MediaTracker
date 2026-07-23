import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "./defaults";
import { getBaseThemeDefinition } from "./theme-registry";
import type {
  AccentMode,
  AppThemeTokens,
  PresetThemeId,
  ResolvedAppearanceTheme,
  ResolvedBaseThemeId,
  ThemeSelection,
  WorldThemeKey,
} from "./types";
import { isWorldThemeKey, WORLD_THEME_REGISTRY } from "./world-theme-registry";

const PRESET_THEME_IDS = new Set<PresetThemeId>([
  "system",
  "obsidian",
  "porcelain",
  "ocean",
  "dusty_rose",
  "forest",
  "lavender",
  "polar",
  "sepia",
]);
const ACCENT_MODES = new Set<AccentMode>(["auto", "theme", "east", "screen", "arch", "neutral"]);

export interface ResolveAppearanceThemeInput {
  theme?: unknown;
  customThemeTokens?: AppThemeTokens;
  customColorScheme?: "light" | "dark";
  /** P0-P5B compatibility input. */
  baseTheme?: unknown;
  accentMode?: unknown;
  activeWorld?: unknown;
  prefersDark?: unknown;
}

function resolveThemeSelection(theme: unknown, legacyBaseTheme: unknown): ThemeSelection {
  if (typeof theme === "object" && theme !== null && !Array.isArray(theme)) {
    const selection = theme as { kind?: unknown; id?: unknown };
    if (
      selection.kind === "preset"
      && typeof selection.id === "string"
      && PRESET_THEME_IDS.has(selection.id as PresetThemeId)
    ) {
      return { kind: "preset", id: selection.id as PresetThemeId };
    }
    if (
      selection.kind === "custom"
      && typeof selection.id === "string"
      && /^ct_[a-z0-9_-]{8,80}$/i.test(selection.id)
    ) {
      return { kind: "custom", id: selection.id };
    }
  }
  if (typeof legacyBaseTheme === "string" && PRESET_THEME_IDS.has(legacyBaseTheme as PresetThemeId)) {
    return { kind: "preset", id: legacyBaseTheme as PresetThemeId };
  }
  return DEFAULT_APP_APPEARANCE_PREFERENCES.theme;
}

function resolvePresetTheme(value: PresetThemeId, prefersDark: unknown): ResolvedBaseThemeId {
  if (value === "system") return prefersDark === false ? "porcelain" : "obsidian";
  return value;
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
  const selection = resolveThemeSelection(input.theme, input.baseTheme);
  const resolvedAccent = resolveAccent(input.accentMode, input.activeWorld);
  const worldKey = resolvedAccent === "theme" ? "neutral" : resolvedAccent;

  if (selection.kind === "custom" && input.customThemeTokens && input.customColorScheme) {
    return {
      resolvedBaseTheme: "custom",
      resolvedAccent,
      base: {
        id: "custom",
        label: "Özel tema",
        description: "Kullanıcının yerel Tema Stüdyosu teması.",
        colorScheme: input.customColorScheme,
        tokens: input.customThemeTokens,
      },
      world: WORLD_THEME_REGISTRY[worldKey],
    };
  }

  const resolvedBaseTheme = resolvePresetTheme(
    selection.kind === "preset" ? selection.id : "obsidian",
    input.prefersDark,
  );
  return {
    resolvedBaseTheme,
    resolvedAccent,
    base: getBaseThemeDefinition(resolvedBaseTheme),
    world: WORLD_THEME_REGISTRY[worldKey],
  };
}
