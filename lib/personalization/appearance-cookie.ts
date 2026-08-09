import { normalizeHexColor } from "./color-utils";
import {
  normalizeCustomThemeInputs,
  normalizeThemeCorrections,
} from "./custom-theme-tokens";
import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "./defaults";
import type {
  AccentMode,
  CustomThemeCorrections,
  CustomThemeInputs,
  PresetThemeId,
  ResolvedBaseThemeId,
  ThemeSelection,
} from "./types";

export const APPEARANCE_COOKIE_NAME = "mediaTrackerAppearance";

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
const RESOLVED_THEME_IDS = new Set<ResolvedBaseThemeId>([
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
const CORRECTION_KEYS = [
  "textPrimary",
  "textSecondary",
  "textMuted",
  "border",
  "borderStrong",
  "focus",
] as const satisfies readonly (keyof CustomThemeCorrections)[];

export interface CustomThemeCookieSnapshot {
  id: string;
  inputs: CustomThemeInputs;
  corrections?: CustomThemeCorrections;
}

export interface AppearanceCookieIdentity {
  theme: ThemeSelection;
  resolvedTheme: ResolvedBaseThemeId | "custom";
  accentMode: AccentMode;
  customTheme?: CustomThemeCookieSnapshot;
}

export const DEFAULT_APPEARANCE_COOKIE_IDENTITY: AppearanceCookieIdentity = {
  theme: { ...DEFAULT_APP_APPEARANCE_PREFERENCES.theme },
  resolvedTheme: "obsidian",
  accentMode: DEFAULT_APP_APPEARANCE_PREFERENCES.accentMode,
};

function isValidPresetPair(baseTheme: PresetThemeId, resolvedTheme: ResolvedBaseThemeId): boolean {
  if (baseTheme === "system") return resolvedTheme === "obsidian" || resolvedTheme === "porcelain";
  return baseTheme === resolvedTheme;
}

function parseLegacyCookie(value: string): AppearanceCookieIdentity | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [baseThemeValue, resolvedThemeValue, accentModeValue] = parts;
  if (
    !PRESET_THEME_IDS.has(baseThemeValue as PresetThemeId)
    || !RESOLVED_THEME_IDS.has(resolvedThemeValue as ResolvedBaseThemeId)
    || !ACCENT_MODES.has(accentModeValue as AccentMode)
  ) {
    return null;
  }
  const preset = baseThemeValue as PresetThemeId;
  const resolved = resolvedThemeValue as ResolvedBaseThemeId;
  if (!isValidPresetPair(preset, resolved)) return null;
  return {
    theme: { kind: "preset", id: preset },
    resolvedTheme: resolved,
    accentMode: accentModeValue as AccentMode,
  };
}

function compactHex(value: string): string {
  return value.slice(1).toLowerCase();
}

function expandCompactHex(value: unknown): string | null {
  return typeof value === "string" ? normalizeHexColor(`#${value}`) : null;
}

function serializeCorrections(corrections?: CustomThemeCorrections): string {
  return CORRECTION_KEYS.map((key) => (
    corrections?.[key] ? compactHex(corrections[key]) : "-"
  )).join("_");
}

function parseCorrections(value: unknown): { valid: boolean; value?: CustomThemeCorrections } {
  if (typeof value !== "string") return { valid: false };
  const parts = value.split("_");
  if (parts.length !== CORRECTION_KEYS.length) return { valid: false };
  const corrections: CustomThemeCorrections = {};
  for (const [index, part] of parts.entries()) {
    const color = part === "-" ? null : expandCompactHex(part);
    if (part !== "-" && !color) return { valid: false };
    if (color) corrections[CORRECTION_KEYS[index]] = color;
  }
  return { valid: true, value: normalizeThemeCorrections(corrections) };
}

export function parseAppearanceCookie(value: unknown): AppearanceCookieIdentity {
  if (typeof value !== "string") return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
  const legacy = parseLegacyCookie(value);
  if (legacy) return legacy;

  const parts = value.split(".");
  if (parts[0] !== "v3" && parts[0] !== "v4") return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
  if (parts[1] === "p" && parts.length === 5) {
    const [, , presetValue, resolvedValue, accentValue] = parts;
    if (
      !PRESET_THEME_IDS.has(presetValue as PresetThemeId)
      || !RESOLVED_THEME_IDS.has(resolvedValue as ResolvedBaseThemeId)
      || !ACCENT_MODES.has(accentValue as AccentMode)
      || !isValidPresetPair(presetValue as PresetThemeId, resolvedValue as ResolvedBaseThemeId)
    ) {
      return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
    }
    return {
      theme: { kind: "preset", id: presetValue as PresetThemeId },
      resolvedTheme: resolvedValue as ResolvedBaseThemeId,
      accentMode: accentValue as AccentMode,
    };
  }
  if (parts[0] === "v3" && parts[1] === "c" && parts.length === 10) {
    const [, , id, colorScheme, background, surface, accent, secondaryAccent, accentMode, corrections] = parts;
    const inputs = normalizeCustomThemeInputs({
      colorScheme,
      background: expandCompactHex(background),
      surface: expandCompactHex(surface),
      accent: expandCompactHex(accent),
      secondaryAccent: expandCompactHex(secondaryAccent),
    });
    const parsedCorrections = parseCorrections(corrections);
    if (
      !/^ct_[a-z0-9_-]{8,80}$/i.test(id)
      || !inputs
      || !ACCENT_MODES.has(accentMode as AccentMode)
      || !parsedCorrections.valid
    ) {
      return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
    }
    return {
      theme: { kind: "custom", id },
      resolvedTheme: "custom",
      accentMode: accentMode as AccentMode,
      customTheme: { id, inputs, ...(parsedCorrections.value ? { corrections: parsedCorrections.value } : {}) },
    };
  }
  if (parts[0] === "v4" && parts[1] === "c" && parts.length === 14) {
    const [, , id, colorScheme, background, surface, accent, secondaryAccent, accentMode, textColorMode, textPrimary, textSecondary, textMuted, corrections] = parts;
    const inputs = normalizeCustomThemeInputs({
      colorScheme,
      background: expandCompactHex(background), surface: expandCompactHex(surface),
      accent: expandCompactHex(accent), secondaryAccent: expandCompactHex(secondaryAccent),
      textColorMode,
      ...(textColorMode === "custom" ? { textPrimary: expandCompactHex(textPrimary), textSecondary: expandCompactHex(textSecondary), textMuted: expandCompactHex(textMuted) } : {}),
    });
    const parsedCorrections = parseCorrections(corrections);
    if (!/^ct_[a-z0-9_-]{8,80}$/i.test(id) || !inputs || !ACCENT_MODES.has(accentMode as AccentMode) || !parsedCorrections.valid) return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
    return { theme: { kind: "custom", id }, resolvedTheme: "custom", accentMode: accentMode as AccentMode, customTheme: { id, inputs, ...(parsedCorrections.value ? { corrections: parsedCorrections.value } : {}) } };
  }
  return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
}

export function serializeAppearanceCookie(identity: AppearanceCookieIdentity): string {
  if (
    identity.theme.kind === "custom"
    && identity.customTheme?.id === identity.theme.id
    && identity.resolvedTheme === "custom"
  ) {
    const inputs = normalizeCustomThemeInputs(identity.customTheme.inputs);
    if (inputs && ACCENT_MODES.has(identity.accentMode)) {
      return [
        "v4",
        "c",
        identity.theme.id,
        inputs.colorScheme,
        compactHex(inputs.background),
        compactHex(inputs.surface),
        compactHex(inputs.accent),
        compactHex(inputs.secondaryAccent),
        identity.accentMode,
        inputs.textColorMode ?? "auto",
        inputs.textColorMode === "custom" ? compactHex(inputs.textPrimary!) : "-",
        inputs.textColorMode === "custom" ? compactHex(inputs.textSecondary!) : "-",
        inputs.textColorMode === "custom" ? compactHex(inputs.textMuted!) : "-",
        serializeCorrections(normalizeThemeCorrections(identity.customTheme.corrections)),
      ].join(".");
    }
  }
  const preset = identity.theme.kind === "preset" && PRESET_THEME_IDS.has(identity.theme.id)
    ? identity.theme.id
    : "obsidian";
  const resolved = identity.resolvedTheme !== "custom" && isValidPresetPair(preset, identity.resolvedTheme)
    ? identity.resolvedTheme
    : preset === "system" ? "obsidian" : preset;
  const accentMode = ACCENT_MODES.has(identity.accentMode) ? identity.accentMode : "auto";
  return `v3.p.${preset}.${resolved}.${accentMode}`;
}

export function appearanceCookieDocumentValue(
  identity: AppearanceCookieIdentity,
  secure: boolean,
): string {
  const secureFlag = secure ? "; Secure" : "";
  return `${APPEARANCE_COOKIE_NAME}=${serializeAppearanceCookie(identity)}; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag}`;
}
