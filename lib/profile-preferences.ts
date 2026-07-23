import type { User } from "@supabase/supabase-js";
import type { StorageWriteResult } from "./local-data-storage";
import type { LocalOwnerScope } from "./local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "./personal-data-storage";

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

export const PROFILE_PREFS_STORAGE_KEY = "mediaTracker:profilePreferences";

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

export function normalizeProfilePreferences(raw: unknown): ProfilePreferences {
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
  if (
    typeof r.avatarImageDataUrl === "string"
    && r.avatarImageDataUrl.startsWith("data:image/")
    && r.avatarImageDataUrl.length <= 2_000_000
  ) {
    base.avatarImageDataUrl = r.avatarImageDataUrl;
  }
  if (typeof r.socialAvatarMigrationDismissedFor === "string") {
    base.socialAvatarMigrationDismissedFor = r.socialAvatarMigrationDismissedFor.slice(0, 128);
  }

  return base;
}

export const profilePreferencesCodec: PersonalDataCodec<ProfilePreferences> = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Profil tercihleri object olmali." };
  }
  return { ok: true, value: normalizeProfilePreferences(value) };
};

export function readScopedProfilePreferences(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike,
): PersonalDataReadResult<ProfilePreferences> {
  return readPersonalData(scope, "profilePreferences", profilePreferencesCodec, storage);
}

export function writeScopedProfilePreferences(
  scope: LocalOwnerScope,
  preferences: ProfilePreferences,
  storage?: PersonalStorageLike,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "profilePreferences",
    preferences,
    profilePreferencesCodec,
    storage,
  );
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
