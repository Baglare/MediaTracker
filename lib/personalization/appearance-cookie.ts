import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "./defaults";
import type { AccentMode, BaseThemeId, ResolvedBaseThemeId } from "./types";

export const APPEARANCE_COOKIE_NAME = "mediaTrackerAppearance";

const BASE_THEME_IDS = new Set<BaseThemeId>(["system", "obsidian", "porcelain", "ocean"]);
const RESOLVED_THEME_IDS = new Set<ResolvedBaseThemeId>(["obsidian", "porcelain", "ocean"]);
const ACCENT_MODES = new Set<AccentMode>(["auto", "theme", "east", "screen", "arch", "neutral"]);

export interface AppearanceCookieIdentity {
  baseTheme: BaseThemeId;
  resolvedTheme: ResolvedBaseThemeId;
  accentMode: AccentMode;
}

export const DEFAULT_APPEARANCE_COOKIE_IDENTITY: AppearanceCookieIdentity = {
  baseTheme: DEFAULT_APP_APPEARANCE_PREFERENCES.baseTheme,
  resolvedTheme: "obsidian",
  accentMode: DEFAULT_APP_APPEARANCE_PREFERENCES.accentMode,
};

function isValidPair(baseTheme: BaseThemeId, resolvedTheme: ResolvedBaseThemeId): boolean {
  if (baseTheme === "system") return resolvedTheme === "obsidian" || resolvedTheme === "porcelain";
  return baseTheme === resolvedTheme;
}

export function parseAppearanceCookie(value: unknown): AppearanceCookieIdentity {
  if (typeof value !== "string") return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
  const parts = value.split(".");
  if (parts.length !== 3) return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
  const [baseThemeValue, resolvedThemeValue, accentModeValue] = parts;
  if (
    !BASE_THEME_IDS.has(baseThemeValue as BaseThemeId)
    || !RESOLVED_THEME_IDS.has(resolvedThemeValue as ResolvedBaseThemeId)
    || !ACCENT_MODES.has(accentModeValue as AccentMode)
  ) {
    return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
  }

  const baseTheme = baseThemeValue as BaseThemeId;
  const resolvedTheme = resolvedThemeValue as ResolvedBaseThemeId;
  if (!isValidPair(baseTheme, resolvedTheme)) return { ...DEFAULT_APPEARANCE_COOKIE_IDENTITY };
  return { baseTheme, resolvedTheme, accentMode: accentModeValue as AccentMode };
}

export function serializeAppearanceCookie(identity: AppearanceCookieIdentity): string {
  const normalized = parseAppearanceCookie(
    `${identity.baseTheme}.${identity.resolvedTheme}.${identity.accentMode}`,
  );
  return `${normalized.baseTheme}.${normalized.resolvedTheme}.${normalized.accentMode}`;
}

export function appearanceCookieDocumentValue(
  identity: AppearanceCookieIdentity,
  secure: boolean,
): string {
  const secureFlag = secure ? "; Secure" : "";
  return `${APPEARANCE_COOKIE_NAME}=${serializeAppearanceCookie(identity)}; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag}`;
}
