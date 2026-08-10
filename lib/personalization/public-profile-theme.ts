import { themeTokensToCssVariables } from "./appearance-runtime";
import { normalizeHexColor, mixHexColors } from "./color-utils";
import { deriveCustomThemeTokens, evaluateThemeContrast } from "./custom-theme-tokens";
import { normalizeCustomThemeDefinition } from "./custom-themes";
import { getBaseThemeDefinition } from "./theme-registry";
import {
  PUBLIC_PROFILE_THEME_TOKEN_KEYS,
  type AppThemeTokens,
  type ProfileThemeSharingInput,
  type ProfileThemeVisibility,
  type PublicProfileThemeSnapshot,
  type PublicProfileThemeTokenKey,
  type ResolvedBaseThemeId,
} from "./types";

const VISIBILITIES = new Set<ProfileThemeVisibility>(["hidden", "preset_only", "current_theme"]);
const PRESETS = new Set<ResolvedBaseThemeId>(["obsidian", "porcelain", "ocean", "dusty_rose", "forest", "lavender", "polar", "sepia"]);
const ROOT_KEYS = new Set(["version", "source", "colorScheme", "tokens", "revision", "updatedAt"]);
const TOKEN_KEYS = new Set<string>(PUBLIC_PROFILE_THEME_TOKEN_KEYS);

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedPublicTokens(tokens: AppThemeTokens): PublicProfileThemeSnapshot["tokens"] | null {
  const values: Partial<Record<PublicProfileThemeTokenKey, string>> = {};
  for (const key of PUBLIC_PROFILE_THEME_TOKEN_KEYS) {
    const fallback = key === "accentSoft"
      ? mixHexColors(tokens.surface1, tokens.accent, 0.16)
      : tokens[key];
    const color = normalizeHexColor(fallback);
    if (!color) return null;
    values[key] = color;
  }
  return values as PublicProfileThemeSnapshot["tokens"];
}

function snapshot(
  source: PublicProfileThemeSnapshot["source"],
  colorScheme: PublicProfileThemeSnapshot["colorScheme"],
  tokens: AppThemeTokens,
  revision: string,
  updatedAt?: string,
): PublicProfileThemeSnapshot | null {
  if (!evaluateThemeContrast(tokens).valid) return null;
  const publicTokens = normalizedPublicTokens(tokens);
  if (!publicTokens) return null;
  return { version: 1, source, colorScheme, tokens: publicTokens, revision, ...(updatedAt ? { updatedAt } : {}) };
}

function publicProfileRuntimeTokens(snapshot: PublicProfileThemeSnapshot): AppThemeTokens {
  const runtimeTokens = deriveCustomThemeTokens({
    colorScheme: snapshot.colorScheme,
    background: snapshot.tokens.background,
    surface: snapshot.tokens.surface1,
    accent: snapshot.tokens.accent,
    secondaryAccent: snapshot.tokens.accentStrong,
    textColorMode: "custom",
    textPrimary: snapshot.tokens.textPrimary,
    textSecondary: snapshot.tokens.textSecondary,
    textMuted: snapshot.tokens.textMuted,
  });
  return { ...runtimeTokens, ...snapshot.tokens };
}

export function normalizeProfileThemeSharingInput(value: unknown): ProfileThemeSharingInput | null {
  const record = recordOf(value);
  if (!record || !VISIBILITIES.has(record.visibility as ProfileThemeVisibility)) return null;
  const visibility = record.visibility as ProfileThemeVisibility;
  if (visibility === "hidden") return { visibility };
  const publicPreset = PRESETS.has(record.publicPreset as ResolvedBaseThemeId)
    ? record.publicPreset as ResolvedBaseThemeId
    : undefined;
  if (visibility === "preset_only") return publicPreset ? { visibility, publicPreset } : null;
  const current = recordOf(record.currentTheme);
  if (!current) return null;
  if (current.kind === "preset" && PRESETS.has(current.id as ResolvedBaseThemeId)) {
    return { visibility, currentTheme: { kind: "preset", id: current.id as ResolvedBaseThemeId } };
  }
  if (current.kind === "custom") {
    const theme = normalizeCustomThemeDefinition(current.theme);
    return theme ? { visibility, currentTheme: { kind: "custom", theme } } : null;
  }
  return null;
}

export function buildPublicProfileThemeSnapshot(
  value: ProfileThemeSharingInput,
): PublicProfileThemeSnapshot | undefined {
  if (value.visibility === "hidden") return undefined;
  if (value.visibility === "preset_only" && value.publicPreset) {
    const theme = getBaseThemeDefinition(value.publicPreset);
    return snapshot("preset", theme.colorScheme, theme.tokens, `preset:${theme.id}:1`) ?? undefined;
  }
  const current = value.currentTheme;
  if (!current) return undefined;
  if (current.kind === "preset") {
    const theme = getBaseThemeDefinition(current.id);
    return snapshot("preset", theme.colorScheme, theme.tokens, `preset:${theme.id}:1`) ?? undefined;
  }
  const theme = normalizeCustomThemeDefinition(current.theme);
  if (!theme) return undefined;
  const tokens = deriveCustomThemeTokens(theme.inputs, theme.corrections);
  return snapshot("custom", theme.inputs.colorScheme, tokens, `custom:${theme.updatedAt}`, theme.updatedAt) ?? undefined;
}

export function decodePublicProfileThemeSnapshot(value: unknown): PublicProfileThemeSnapshot | undefined {
  const record = recordOf(value);
  if (!record || Object.keys(record).some((key) => !ROOT_KEYS.has(key))) return undefined;
  const tokens = recordOf(record.tokens);
  if (!tokens || Object.keys(tokens).length !== PUBLIC_PROFILE_THEME_TOKEN_KEYS.length || Object.keys(tokens).some((key) => !TOKEN_KEYS.has(key))) return undefined;
  if (record.version !== 1 || (record.source !== "preset" && record.source !== "custom") || (record.colorScheme !== "light" && record.colorScheme !== "dark")) return undefined;
  if (typeof record.revision !== "string" || record.revision.length < 1 || record.revision.length > 160) return undefined;
  if (record.updatedAt !== undefined && (typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt)))) return undefined;
  const normalized: Partial<Record<PublicProfileThemeTokenKey, string>> = {};
  for (const key of PUBLIC_PROFILE_THEME_TOKEN_KEYS) {
    const color = normalizeHexColor(tokens[key]);
    if (!color) return undefined;
    normalized[key] = color;
  }
  const candidate: PublicProfileThemeSnapshot = { version: 1, source: record.source, colorScheme: record.colorScheme, tokens: normalized as PublicProfileThemeSnapshot["tokens"], revision: record.revision, ...(record.updatedAt ? { updatedAt: record.updatedAt as string } : {}) };
  return evaluateThemeContrast(publicProfileRuntimeTokens(candidate)).valid ? candidate : undefined;
}

export function publicProfileThemeStyle(snapshotValue: PublicProfileThemeSnapshot | undefined): Record<string, string> {
  const snapshot = decodePublicProfileThemeSnapshot(snapshotValue);
  if (!snapshot) return {};
  return { colorScheme: snapshot.colorScheme, ...themeTokensToCssVariables(publicProfileRuntimeTokens(snapshot)) };
}
