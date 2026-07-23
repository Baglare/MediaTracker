import {
  bestContrastingText,
  mixHexColors,
} from "./color-utils";
import {
  deriveCustomThemeTokens,
  evaluateThemeContrast,
} from "./custom-theme-tokens";
import type {
  AppAppearancePreferences,
  AppThemeTokens,
  CustomThemeDefinition,
  ResolvedBaseThemeId,
  ThemeSelection,
  WorldThemeKey,
} from "./types";
import { resolveAppearanceTheme } from "./resolve-appearance";
import { WORLD_THEME_REGISTRY } from "./world-theme-registry";

export const APP_THEME_TOKEN_CSS_VARIABLES: Readonly<Record<keyof AppThemeTokens, `--app-${string}`>> = {
  background: "--app-bg",
  surface1: "--app-surface-1",
  surface2: "--app-surface-2",
  surface3: "--app-surface-3",
  elevated: "--app-surface-elevated",
  textPrimary: "--app-text-primary",
  textSecondary: "--app-text-secondary",
  textMuted: "--app-text-muted",
  border: "--app-border",
  borderStrong: "--app-border-strong",
  scrollbarThumbHover: "--app-scrollbar-thumb-hover",
  shadow: "--app-shadow",
  overlay: "--app-overlay",
  focus: "--app-focus",
  accent: "--app-accent",
  accentStrong: "--app-accent-strong",
  accentSoft: "--app-accent-soft",
  accentContrast: "--app-accent-contrast",
  danger: "--app-danger",
  dangerSoft: "--app-danger-soft",
  success: "--app-success",
  successSoft: "--app-success-soft",
  warning: "--app-warning",
  warningSoft: "--app-warning-soft",
  inputBackground: "--app-input-bg",
  hover: "--app-hover",
  selected: "--app-selected",
  secondaryAccent: "--app-secondary-accent",
  disabledText: "--app-disabled-text",
  disabledBackground: "--app-disabled-bg",
  disabledBorder: "--app-disabled-border",
  actionSuccessText: "--app-action-success-text",
  actionSuccessBackground: "--app-action-success-bg",
  actionSuccessBorder: "--app-action-success-border",
  actionAccentText: "--app-action-accent-text",
  actionAccentBackground: "--app-action-accent-bg",
  actionAccentBorder: "--app-action-accent-border",
  selectedText: "--app-selected-text",
  selectedBackground: "--app-selected-bg",
  selectedBorder: "--app-selected-border",
  heroBackground: "--app-hero-bg",
  panelBackground: "--app-panel-bg",
  cardBackground: "--app-card-bg",
  cardHover: "--app-card-hover",
  sectionDivider: "--app-section-divider",
  subtleHighlight: "--app-subtle-highlight",
};

export interface RootAppearanceAttributes {
  theme: ResolvedBaseThemeId | "custom";
  themeSource: "preset" | "custom";
  themeSelection: ThemeSelection;
  customThemeId?: string;
  accentMode: AppAppearancePreferences["accentMode"];
  resolvedAccent: "theme" | WorldThemeKey;
  effects: AppAppearancePreferences["effectsLevel"];
  density: AppAppearancePreferences["density"];
  colorScheme: "light" | "dark";
  inlineTokens?: AppThemeTokens;
}

export interface AppearanceRootStyle {
  colorScheme: string;
  setProperty(name: string, value: string): void;
  removeProperty(name: string): void;
}

export interface AppearanceRootTarget {
  dataset: Record<string, string | undefined>;
  style: AppearanceRootStyle;
}

export interface SystemThemeMediaQuery {
  matches: boolean;
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
}

function customTokensForAccent(
  tokens: AppThemeTokens,
  resolvedAccent: "theme" | WorldThemeKey,
): AppThemeTokens {
  if (resolvedAccent === "theme") return tokens;
  const world = WORLD_THEME_REGISTRY[resolvedAccent];
  const selectedBackground = mixHexColors(tokens.surface2, world.primary, 0.18);
  return {
    ...tokens,
    accent: world.primary,
    accentStrong: world.primaryStrong,
    accentSoft: world.soft,
    accentContrast: bestContrastingText(world.primary),
    focus: world.primary,
    selected: world.soft,
    selectedText: bestContrastingText(selectedBackground),
    selectedBackground,
    selectedBorder: world.primaryStrong,
    actionAccentText: world.primaryStrong,
    actionAccentBackground: world.soft,
    actionAccentBorder: world.border,
    secondaryAccent: world.secondary,
  };
}

export function resolveRootAppearanceAttributes(
  preferences: AppAppearancePreferences,
  activeWorld: WorldThemeKey,
  prefersDark: boolean,
  customTheme?: CustomThemeDefinition,
): RootAppearanceAttributes {
  let customTokens: AppThemeTokens | undefined;
  if (preferences.theme.kind === "custom" && customTheme?.id === preferences.theme.id) {
    const derived = deriveCustomThemeTokens(customTheme.inputs, customTheme.corrections);
    if (evaluateThemeContrast(derived).valid) customTokens = derived;
  }

  const effectiveSelection: ThemeSelection = customTokens
    ? preferences.theme
    : preferences.theme.kind === "custom"
      ? { kind: "preset", id: "obsidian" }
      : preferences.theme;
  const resolved = resolveAppearanceTheme({
    theme: effectiveSelection,
    accentMode: preferences.accentMode,
    activeWorld,
    prefersDark,
    customThemeTokens: customTokens,
    customColorScheme: customTheme?.inputs.colorScheme,
  });
  const customActive = resolved.resolvedBaseTheme === "custom" && Boolean(customTokens);
  return {
    theme: resolved.resolvedBaseTheme,
    themeSource: customActive ? "custom" : "preset",
    themeSelection: effectiveSelection,
    customThemeId: customActive && preferences.theme.kind === "custom"
      ? preferences.theme.id
      : undefined,
    accentMode: preferences.accentMode,
    resolvedAccent: resolved.resolvedAccent,
    effects: preferences.effectsLevel,
    density: preferences.density,
    colorScheme: resolved.base.colorScheme,
    inlineTokens: customActive && customTokens
      ? customTokensForAccent(customTokens, resolved.resolvedAccent)
      : undefined,
  };
}

export function themeTokensToCssVariables(
  tokens?: AppThemeTokens,
): Record<`--app-${string}`, string> {
  if (!tokens) return {};
  const variables: Record<`--app-${string}`, string> = {};
  for (const [key, cssVariable] of Object.entries(APP_THEME_TOKEN_CSS_VARIABLES) as Array<
    [keyof AppThemeTokens, `--app-${string}`]
  >) {
    variables[cssVariable] = tokens[key];
  }
  return variables;
}

export function applyRootAppearanceAttributes(
  root: AppearanceRootTarget,
  attributes: RootAppearanceAttributes,
): void {
  root.dataset.theme = attributes.theme;
  root.dataset.themeSource = attributes.themeSource;
  root.dataset.themeSelection = attributes.themeSelection.kind === "preset"
    ? attributes.themeSelection.id
    : "custom";
  root.dataset.baseTheme = attributes.themeSelection.kind === "preset"
    ? attributes.themeSelection.id
    : "custom";
  if (attributes.customThemeId) root.dataset.customThemeId = attributes.customThemeId;
  else delete root.dataset.customThemeId;
  root.dataset.accentMode = attributes.accentMode;
  root.dataset.resolvedAccent = attributes.resolvedAccent;
  root.dataset.effects = attributes.effects;
  root.dataset.density = attributes.density;
  root.style.colorScheme = attributes.colorScheme;
  for (const [key, cssVariable] of Object.entries(APP_THEME_TOKEN_CSS_VARIABLES) as Array<
    [keyof AppThemeTokens, `--app-${string}`]
  >) {
    if (attributes.inlineTokens) {
      root.style.setProperty(cssVariable, attributes.inlineTokens[key]);
    } else {
      root.style.removeProperty(cssVariable);
    }
  }
}

export function clearCustomThemeCookieValue(secure: boolean, cookieName: string): string {
  const secureFlag = secure ? "; Secure" : "";
  return `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax${secureFlag}`;
}

export function subscribeToSystemTheme(
  mediaQuery: SystemThemeMediaQuery,
  onChange: (prefersDark: boolean) => void,
): () => void {
  const listener = (event: { matches: boolean }) => onChange(event.matches);
  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener("change", listener);
}
