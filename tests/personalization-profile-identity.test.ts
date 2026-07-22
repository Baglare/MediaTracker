import { describe, expect, it } from "vitest";

import { DEFAULT_PROFILE_PREFERENCES } from "@/lib/profile-preferences";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";

const localPreferences = {
  ...DEFAULT_PROFILE_PREFERENCES,
  displayName: "Yerel Ad",
  profileTagline: "Yerel tagline",
  avatarMode: "image" as const,
  avatarImageDataUrl: "data:image/png;base64,local",
  selectedTitleMode: "manual" as const,
  manualTitle: "Yerel Ünvan",
};

describe("profile identity resolver", () => {
  it("prefers an authenticated cloud profile over local identity", () => {
    expect(resolveProfileIdentity({
      authenticated: true,
      localPreferences,
      socialProfile: { displayName: "Cloud Ad", tagline: "Cloud tagline", bio: "Cloud bio", selectedTitle: "Cloud Ünvan" },
    })).toMatchObject({ displayName: "Cloud Ad", tagline: "Cloud tagline", bio: "Cloud bio", selectedTitle: "Cloud Ünvan", source: "social" });
  });

  it("uses local displayName when cloud displayName is missing", () => {
    expect(resolveProfileIdentity({ authenticated: true, localPreferences, socialProfile: { bio: "Cloud bio" } }).displayName).toBe("Yerel Ad");
  });

  it("uses local tagline when cloud tagline is missing without deriving it from bio", () => {
    expect(resolveProfileIdentity({ authenticated: true, localPreferences, socialProfile: { displayName: "Cloud Ad" } }).tagline).toBe("Yerel tagline");
    expect(resolveProfileIdentity({ authenticated: true, localPreferences, socialProfile: { displayName: "Cloud Ad", bio: "Uzun cloud bio" } }).tagline).toBe("Yerel tagline");
  });

  it("keeps cloud avatar ahead of the local image fallback", () => {
    const result = resolveProfileIdentity({ authenticated: true, localPreferences, socialProfile: { avatarUrl: "https://cdn.example/avatar.webp" } });
    expect(result.avatarUrl).toBe("https://cdn.example/avatar.webp");
    expect(result.localAvatarDataUrl).toBe("data:image/png;base64,local");
  });

  it("keeps banner exclusively from the authenticated social profile", () => {
    expect(resolveProfileIdentity({ authenticated: true, localPreferences, socialProfile: { bannerUrl: "https://cdn.example/banner.webp" } }).bannerUrl).toBe("https://cdn.example/banner.webp");
    expect(resolveProfileIdentity({ authenticated: false, localPreferences, socialProfile: { bannerUrl: "https://cdn.example/banner.webp" } })).not.toHaveProperty("bannerUrl");
  });

  it("uses local identity when no social profile exists", () => {
    expect(resolveProfileIdentity({ authenticated: true, localPreferences })).toMatchObject({
      displayName: "Yerel Ad",
      tagline: "Yerel tagline",
      source: "local",
    });
  });

  it("uses safe fallbacks when local identity is absent", () => {
    expect(resolveProfileIdentity({
      authenticated: false,
      localPreferences: DEFAULT_PROFILE_PREFERENCES,
      fallbackName: "Misafir",
      automaticTitle: "Yolcu",
    })).toMatchObject({
      displayName: "Misafir",
      tagline: DEFAULT_PROFILE_PREFERENCES.profileTagline,
      selectedTitle: "Yolcu",
      source: "fallback",
    });
  });

  it("does not mutate resolver inputs", () => {
    const input = { authenticated: true, localPreferences: { ...localPreferences }, socialProfile: { displayName: "Cloud Ad" } };
    const before = structuredClone(input);
    resolveProfileIdentity(input);
    expect(input).toEqual(before);
  });
});
