import {
  DEFAULT_PROFILE_PREFERENCES,
  type ProfilePreferences,
} from "@/lib/profile-preferences";

export interface SocialProfileIdentityInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  selectedTitle?: string;
}

export interface ResolveProfileIdentityInput {
  authenticated: boolean;
  localPreferences?: Partial<ProfilePreferences>;
  socialProfile?: SocialProfileIdentityInput;
  fallbackName?: string;
  automaticTitle?: string;
}

export interface ResolvedProfileIdentity {
  displayName: string;
  tagline: string;
  avatarUrl?: string;
  localAvatarDataUrl?: string;
  bannerUrl?: string;
  selectedTitle: string;
  source: "social" | "local" | "fallback";
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeDataImage(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("data:image/") ? value : undefined;
}

function safeUrl(value: unknown): string | undefined {
  const cleaned = cleanText(value, 2048);
  if (!cleaned) return undefined;
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === "https:" ? cleaned : undefined;
  } catch {
    return undefined;
  }
}

export function resolveProfileIdentity(input: ResolveProfileIdentityInput): ResolvedProfileIdentity {
  const local = input.localPreferences;
  const social = input.authenticated ? input.socialProfile : undefined;
  const localName = cleanText(local?.displayName, 48);
  const localTagline = cleanText(local?.profileTagline, 80);
  const fallbackName = cleanText(input.fallbackName, 60) || "Baglare";
  const automaticTitle = cleanText(input.automaticTitle, 48);
  const manualTitle = local?.selectedTitleMode === "manual" ? cleanText(local.manualTitle, 48) : "";
  const localAvatarDataUrl = local?.avatarMode === "image"
    ? safeDataImage(local.avatarImageDataUrl)
    : undefined;

  const displayName = cleanText(social?.displayName, 60) || localName || fallbackName;
  const tagline = cleanText(social?.bio, 500)
    || localTagline
    || DEFAULT_PROFILE_PREFERENCES.profileTagline;
  const selectedTitle = cleanText(social?.selectedTitle, 48) || manualTitle || automaticTitle;
  const avatarUrl = safeUrl(social?.avatarUrl);
  const bannerUrl = safeUrl(social?.bannerUrl);
  const hasLocalIdentity = Boolean(
    localName
    || (localTagline && localTagline !== DEFAULT_PROFILE_PREFERENCES.profileTagline)
    || localAvatarDataUrl
    || manualTitle,
  );

  return {
    displayName,
    tagline,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(localAvatarDataUrl ? { localAvatarDataUrl } : {}),
    ...(bannerUrl ? { bannerUrl } : {}),
    selectedTitle,
    source: social ? "social" : hasLocalIdentity ? "local" : "fallback",
  };
}
