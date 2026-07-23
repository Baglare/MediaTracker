import type { ImageTransform } from "./image-transform";

export type BaseThemeId = "system" | "obsidian" | "porcelain" | "ocean";

export type ResolvedBaseThemeId = Exclude<BaseThemeId, "system">;

export type AccentMode = "auto" | "theme" | "east" | "screen" | "arch" | "neutral";

export type EffectsLevel = "off" | "subtle" | "full";
export type AppDensity = "comfortable" | "compact";

export interface AppAppearancePreferences {
  version: 1;
  baseTheme: BaseThemeId;
  accentMode: AccentMode;
  effectsLevel: EffectsLevel;
  density: AppDensity;
}

export interface BaseThemeTokens {
  background: string;
  surface1: string;
  surface2: string;
  surface3: string;
  elevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  scrollbarThumbHover: string;
  shadow: string;
  overlay: string;
  focus: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentContrast: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  inputBackground: string;
  hover: string;
  selected: string;
}

export interface BaseThemeDefinition {
  id: ResolvedBaseThemeId;
  label: string;
  description: string;
  colorScheme: "light" | "dark";
  tokens: BaseThemeTokens;
}

export interface SystemThemeDefinition {
  id: "system";
  label: string;
  description: string;
  colorScheme: "system";
}

export type BaseThemeRegistryEntry = BaseThemeDefinition | SystemThemeDefinition;

export type WorldThemeKey = "neutral" | "east" | "screen" | "arch";

export interface WorldThemeDefinition {
  key: WorldThemeKey;
  label: string;
  shortDescription: string;
  primary: string;
  primaryStrong: string;
  secondary: string;
  soft: string;
  ink: string;
  border: string;
  glow: string;
  chartPrimary: string;
  iconKey: string;
  heroMotifKey: string;
}

export interface ResolvedAppearanceTheme {
  resolvedBaseTheme: ResolvedBaseThemeId;
  resolvedAccent: "theme" | WorldThemeKey;
  base: BaseThemeDefinition;
  world: WorldThemeDefinition;
}

export type ProfilePaletteId = "neutral" | "east" | "screen" | "arch" | "ocean";
export type ProfileBannerMode = "none" | "gradient" | "world" | "image";
export type ProfileBannerPosition = "top" | "center" | "bottom";
export type ProfileOverlayStrength = "low" | "medium" | "high";
export type ProfileAvatarFrame = "none" | "subtle" | "world" | "tier";
export type ProfileSurfaceStyle = "solid" | "soft_glass" | "textured";
export type ProfileMotifIntensity = "none" | "subtle" | "full";

export interface ProfilePresentationPreferences {
  version: 1;
  paletteId: ProfilePaletteId;
  bannerMode: ProfileBannerMode;
  bannerPosition: ProfileBannerPosition;
  overlayStrength: ProfileOverlayStrength;
  avatarFrame: ProfileAvatarFrame;
  surfaceStyle: ProfileSurfaceStyle;
  motifIntensity: ProfileMotifIntensity;
  bannerTransform: ImageTransform;
  avatarTransform: ImageTransform;
}

export type ChartPaletteId =
  | "standard"
  | "ocean"
  | "pastel"
  | "high_contrast"
  | "monochrome"
  | "world_aware";

export type ChartStatusKey = "completed" | "inProgress" | "planning" | "paused" | "dropped";

export interface ChartStatusPresentation {
  label: string;
  description: string;
  segmentColor: string;
  rowActiveSurface: string;
  textTone: string;
  dotTone: string;
}

export interface ChartPaletteDefinition {
  id: ChartPaletteId;
  label: string;
  followWorldCompletedColor: boolean;
  statuses: Record<ChartStatusKey, ChartStatusPresentation>;
}
