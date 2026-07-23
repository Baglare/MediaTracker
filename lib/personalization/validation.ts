import {
  defaultAppearancePreferences,
  defaultProfilePresentationPreferences,
} from "./defaults";
import type {
  AccentMode,
  AppAppearancePreferences,
  AppDensity,
  ChartPaletteId,
  EffectsLevel,
  ProfileAvatarFrame,
  ProfileBannerMode,
  ProfileBannerPosition,
  ProfileMotifIntensity,
  ProfileOverlayStrength,
  ProfilePaletteId,
  ProfilePresentationPreferences,
  ProfileSurfaceStyle,
  PresetThemeId,
  ThemeSelection,
} from "./types";
import { bannerPositionFallback, normalizeImageTransform } from "./image-transform";

const PRESET_THEMES = new Set<PresetThemeId>([
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
const EFFECTS_LEVELS = new Set<EffectsLevel>(["off", "subtle", "full"]);
const DENSITIES = new Set<AppDensity>(["comfortable", "compact"]);
const CHART_PALETTES = new Set<ChartPaletteId>([
  "standard",
  "ocean",
  "pastel",
  "high_contrast",
  "monochrome",
  "world_aware",
]);
export const PROFILE_PALETTE_IDS = ["neutral", "east", "screen", "arch", "ocean"] as const satisfies readonly ProfilePaletteId[];
export const PROFILE_BANNER_MODES = ["none", "gradient", "world", "image"] as const satisfies readonly ProfileBannerMode[];
export const PROFILE_BANNER_POSITIONS = ["top", "center", "bottom"] as const satisfies readonly ProfileBannerPosition[];
export const PROFILE_OVERLAY_STRENGTHS = ["low", "medium", "high"] as const satisfies readonly ProfileOverlayStrength[];
export const PROFILE_AVATAR_FRAMES = ["none", "subtle", "world", "tier"] as const satisfies readonly ProfileAvatarFrame[];
export const PROFILE_SURFACE_STYLES = ["solid", "soft_glass", "textured"] as const satisfies readonly ProfileSurfaceStyle[];
export const PROFILE_MOTIF_INTENSITIES = ["none", "subtle", "full"] as const satisfies readonly ProfileMotifIntensity[];
const PROFILE_PALETTES = new Set<ProfilePaletteId>(PROFILE_PALETTE_IDS);
const BANNER_MODES = new Set<ProfileBannerMode>(PROFILE_BANNER_MODES);
const BANNER_POSITIONS = new Set<ProfileBannerPosition>(PROFILE_BANNER_POSITIONS);
const OVERLAY_STRENGTHS = new Set<ProfileOverlayStrength>(PROFILE_OVERLAY_STRENGTHS);
const AVATAR_FRAMES = new Set<ProfileAvatarFrame>(PROFILE_AVATAR_FRAMES);
const SURFACE_STYLES = new Set<ProfileSurfaceStyle>(PROFILE_SURFACE_STYLES);
const MOTIF_INTENSITIES = new Set<ProfileMotifIntensity>(PROFILE_MOTIF_INTENSITIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readKnown<T extends string>(value: unknown, known: ReadonlySet<T>, fallback: T): T {
  return typeof value === "string" && known.has(value as T) ? (value as T) : fallback;
}

export function normalizeAppearancePreferences(value: unknown): AppAppearancePreferences {
  const fallback = defaultAppearancePreferences();
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3)) return fallback;

  return {
    version: 3,
    theme: value.version === 3
      ? normalizeThemeSelection(value.theme)
      : {
          kind: "preset",
          id: readKnown(value.baseTheme, PRESET_THEMES, "obsidian"),
        },
    accentMode: readKnown(value.accentMode, ACCENT_MODES, fallback.accentMode),
    effectsLevel: readKnown(value.effectsLevel, EFFECTS_LEVELS, fallback.effectsLevel),
    density: readKnown(value.density, DENSITIES, fallback.density),
    chartPaletteId: readKnown(value.chartPaletteId, CHART_PALETTES, fallback.chartPaletteId),
    followWorldCompletedColor: typeof value.followWorldCompletedColor === "boolean"
      ? value.followWorldCompletedColor
      : fallback.followWorldCompletedColor,
  };
}

export function normalizeThemeSelection(value: unknown): ThemeSelection {
  if (!isRecord(value)) return { kind: "preset", id: "obsidian" };
  if (value.kind === "preset") {
    return {
      kind: "preset",
      id: readKnown(value.id, PRESET_THEMES, "obsidian"),
    };
  }
  if (
    value.kind === "custom"
    && typeof value.id === "string"
    && /^ct_[a-z0-9_-]{8,80}$/i.test(value.id)
  ) {
    return { kind: "custom", id: value.id };
  }
  return { kind: "preset", id: "obsidian" };
}

export function normalizeProfilePresentationPreferences(value: unknown): ProfilePresentationPreferences {
  const fallback = defaultProfilePresentationPreferences();
  if (!isRecord(value) || value.version !== 1) return fallback;

  const bannerPosition = readKnown(value.bannerPosition, BANNER_POSITIONS, fallback.bannerPosition);
  return {
    version: 1,
    paletteId: readKnown(value.paletteId, PROFILE_PALETTES, fallback.paletteId),
    bannerMode: readKnown(value.bannerMode, BANNER_MODES, fallback.bannerMode),
    bannerPosition,
    overlayStrength: readKnown(value.overlayStrength, OVERLAY_STRENGTHS, fallback.overlayStrength),
    avatarFrame: readKnown(value.avatarFrame, AVATAR_FRAMES, fallback.avatarFrame),
    surfaceStyle: readKnown(value.surfaceStyle, SURFACE_STYLES, fallback.surfaceStyle),
    motifIntensity: readKnown(value.motifIntensity, MOTIF_INTENSITIES, fallback.motifIntensity),
    bannerTransform: normalizeImageTransform(value.bannerTransform, bannerPositionFallback(bannerPosition)),
    avatarTransform: normalizeImageTransform(value.avatarTransform, fallback.avatarTransform),
  };
}
