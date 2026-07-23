import type { AppAppearancePreferences, ProfilePresentationPreferences } from "./types";
import { DEFAULT_IMAGE_TRANSFORM } from "./image-transform";

export const DEFAULT_APP_APPEARANCE_PREFERENCES: AppAppearancePreferences = {
  version: 1,
  baseTheme: "obsidian",
  accentMode: "auto",
  effectsLevel: "subtle",
  density: "comfortable",
};

export const DEFAULT_PROFILE_PRESENTATION_PREFERENCES: ProfilePresentationPreferences = {
  version: 1,
  paletteId: "neutral",
  bannerMode: "gradient",
  bannerPosition: "center",
  overlayStrength: "medium",
  avatarFrame: "subtle",
  surfaceStyle: "solid",
  motifIntensity: "none",
  bannerTransform: { ...DEFAULT_IMAGE_TRANSFORM },
  avatarTransform: { ...DEFAULT_IMAGE_TRANSFORM },
};

export function defaultAppearancePreferences(): AppAppearancePreferences {
  return { ...DEFAULT_APP_APPEARANCE_PREFERENCES };
}

export function defaultProfilePresentationPreferences(): ProfilePresentationPreferences {
  return {
    ...DEFAULT_PROFILE_PRESENTATION_PREFERENCES,
    bannerTransform: { ...DEFAULT_PROFILE_PRESENTATION_PREFERENCES.bannerTransform },
    avatarTransform: { ...DEFAULT_PROFILE_PRESENTATION_PREFERENCES.avatarTransform },
  };
}
