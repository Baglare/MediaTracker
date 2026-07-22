import type { AppAppearancePreferences, ProfilePresentationPreferences } from "./types";

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
};

export function defaultAppearancePreferences(): AppAppearancePreferences {
  return { ...DEFAULT_APP_APPEARANCE_PREFERENCES };
}

export function defaultProfilePresentationPreferences(): ProfilePresentationPreferences {
  return { ...DEFAULT_PROFILE_PRESENTATION_PREFERENCES };
}
