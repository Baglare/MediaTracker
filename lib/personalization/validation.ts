import {
  defaultAppearancePreferences,
  defaultProfilePresentationPreferences,
} from "./defaults";
import type {
  AccentMode,
  AppAppearancePreferences,
  AppDensity,
  BaseThemeId,
  EffectsLevel,
  ProfileAvatarFrame,
  ProfileBannerMode,
  ProfileBannerPosition,
  ProfileMotifIntensity,
  ProfileOverlayStrength,
  ProfilePaletteId,
  ProfilePresentationPreferences,
  ProfileSurfaceStyle,
} from "./types";

const BASE_THEMES = new Set<BaseThemeId>(["system", "obsidian", "porcelain", "ocean"]);
const ACCENT_MODES = new Set<AccentMode>(["auto", "theme", "east", "screen", "arch", "neutral"]);
const EFFECTS_LEVELS = new Set<EffectsLevel>(["off", "subtle", "full"]);
const DENSITIES = new Set<AppDensity>(["comfortable", "compact"]);
export const PROFILE_PALETTE_IDS = ["neutral", "east", "screen", "arch", "ocean"] as const satisfies readonly ProfilePaletteId[];
const PROFILE_PALETTES = new Set<ProfilePaletteId>(PROFILE_PALETTE_IDS);
const BANNER_MODES = new Set<ProfileBannerMode>(["none", "gradient", "world", "image"]);
const BANNER_POSITIONS = new Set<ProfileBannerPosition>(["top", "center", "bottom"]);
const OVERLAY_STRENGTHS = new Set<ProfileOverlayStrength>(["low", "medium", "high"]);
const AVATAR_FRAMES = new Set<ProfileAvatarFrame>(["none", "subtle", "world", "tier"]);
const SURFACE_STYLES = new Set<ProfileSurfaceStyle>(["solid", "soft_glass", "textured"]);
const MOTIF_INTENSITIES = new Set<ProfileMotifIntensity>(["none", "subtle", "full"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readKnown<T extends string>(value: unknown, known: ReadonlySet<T>, fallback: T): T {
  return typeof value === "string" && known.has(value as T) ? (value as T) : fallback;
}

export function normalizeAppearancePreferences(value: unknown): AppAppearancePreferences {
  const fallback = defaultAppearancePreferences();
  if (!isRecord(value) || value.version !== 1) return fallback;

  return {
    version: 1,
    baseTheme: readKnown(value.baseTheme, BASE_THEMES, fallback.baseTheme),
    accentMode: readKnown(value.accentMode, ACCENT_MODES, fallback.accentMode),
    effectsLevel: readKnown(value.effectsLevel, EFFECTS_LEVELS, fallback.effectsLevel),
    density: readKnown(value.density, DENSITIES, fallback.density),
  };
}

export function normalizeProfilePresentationPreferences(value: unknown): ProfilePresentationPreferences {
  const fallback = defaultProfilePresentationPreferences();
  if (!isRecord(value) || value.version !== 1) return fallback;

  return {
    version: 1,
    paletteId: readKnown(value.paletteId, PROFILE_PALETTES, fallback.paletteId),
    bannerMode: readKnown(value.bannerMode, BANNER_MODES, fallback.bannerMode),
    bannerPosition: readKnown(value.bannerPosition, BANNER_POSITIONS, fallback.bannerPosition),
    overlayStrength: readKnown(value.overlayStrength, OVERLAY_STRENGTHS, fallback.overlayStrength),
    avatarFrame: readKnown(value.avatarFrame, AVATAR_FRAMES, fallback.avatarFrame),
    surfaceStyle: readKnown(value.surfaceStyle, SURFACE_STYLES, fallback.surfaceStyle),
    motifIntensity: readKnown(value.motifIntensity, MOTIF_INTENSITIES, fallback.motifIntensity),
  };
}
