import type { User } from "@supabase/supabase-js";

export type AvatarMode = "initials" | "preset" | "image";
export type AvatarAccent = "amber" | "violet" | "cyan" | "rose" | "emerald" | "zinc";
export type PresetAvatar = "default" | "east" | "screen" | "arch" | "mixed";
export type SelectedTitleMode = "auto" | "manual";

export interface ProfilePreferences {
  displayName: string;
  profileTagline: string;
  avatarMode: AvatarMode;
  avatarAccent: AvatarAccent;
  presetAvatar: PresetAvatar;
  avatarImageDataUrl?: string;
  socialAvatarMigrationDismissedFor?: string;
  selectedTitleMode: SelectedTitleMode;
  manualTitle: string;
}

const PROFILE_PREFS_STORAGE_KEY = "mediaTracker:profilePreferences";

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  displayName: "",
  profileTagline: "Kendi medya yolculuğum",
  avatarMode: "initials",
  avatarAccent: "amber",
  presetAvatar: "default",
  selectedTitleMode: "auto",
  manualTitle: "",
};

const AVATAR_MODES = new Set<AvatarMode>(["initials", "preset", "image"]);
const AVATAR_ACCENTS = new Set<AvatarAccent>(["amber", "violet", "cyan", "rose", "emerald", "zinc"]);
const PRESET_AVATARS = new Set<PresetAvatar>(["default", "east", "screen", "arch", "mixed"]);
const TITLE_MODES = new Set<SelectedTitleMode>(["auto", "manual"]);

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeProfilePreferences(raw: unknown): ProfilePreferences {
  const base = { ...DEFAULT_PROFILE_PREFERENCES };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  base.displayName = readString(r.displayName).slice(0, 48);
  base.profileTagline = (readString(r.profileTagline) || readString(r.subtitle)).slice(0, 80);
  base.manualTitle = readString(r.manualTitle).slice(0, 48);

  if (typeof r.avatarMode === "string" && AVATAR_MODES.has(r.avatarMode as AvatarMode)) {
    base.avatarMode = r.avatarMode as AvatarMode;
  }
  if (typeof r.avatarAccent === "string" && AVATAR_ACCENTS.has(r.avatarAccent as AvatarAccent)) {
    base.avatarAccent = r.avatarAccent as AvatarAccent;
  }
  if (typeof r.presetAvatar === "string" && PRESET_AVATARS.has(r.presetAvatar as PresetAvatar)) {
    base.presetAvatar = r.presetAvatar as PresetAvatar;
  }
  if (typeof r.selectedTitleMode === "string" && TITLE_MODES.has(r.selectedTitleMode as SelectedTitleMode)) {
    base.selectedTitleMode = r.selectedTitleMode as SelectedTitleMode;
  }
  if (typeof r.avatarImageDataUrl === "string" && r.avatarImageDataUrl.startsWith("data:image/")) {
    base.avatarImageDataUrl = r.avatarImageDataUrl;
  }
  if (typeof r.socialAvatarMigrationDismissedFor === "string") {
    base.socialAvatarMigrationDismissedFor = r.socialAvatarMigrationDismissedFor.slice(0, 128);
  }

  return base;
}

export function loadProfilePreferences(): ProfilePreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PROFILE_PREFERENCES };
  try {
    const saved = localStorage.getItem(PROFILE_PREFS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_PROFILE_PREFERENCES };
    return normalizeProfilePreferences(JSON.parse(saved));
  } catch {
    return { ...DEFAULT_PROFILE_PREFERENCES };
  }
}

export function saveProfilePreferences(preferences: ProfilePreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PROFILE_PREFS_STORAGE_KEY,
      JSON.stringify(normalizeProfilePreferences(preferences))
    );
  } catch {
    console.warn("localStorage'a profil tercihleri kaydedilemedi.");
  }
}

export function resolveProfileDisplayName(
  preferences: ProfilePreferences,
  user: User | null
): string {
  const preferred = preferences.displayName.trim();
  if (preferred) return preferred;

  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const metadataName = readString(metadata?.display_name).trim() || readString(metadata?.name).trim();
  if (metadataName) return metadataName;

  return "Baglare";
}

export function resolveProfileTagline(preferences: ProfilePreferences): string {
  const tagline = preferences.profileTagline.trim();
  return tagline || DEFAULT_PROFILE_PREFERENCES.profileTagline;
}

export function resolveSelectedTitle(
  preferences: ProfilePreferences,
  automaticTitle: string
): string {
  const manual = preferences.manualTitle.trim();
  if (preferences.selectedTitleMode === "manual" && manual) return manual;
  return automaticTitle;
}
