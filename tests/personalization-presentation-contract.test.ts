import { describe, expect, it } from "vitest";

import { DEFAULT_APP_APPEARANCE_PREFERENCES, DEFAULT_PROFILE_PRESENTATION_PREFERENCES } from "@/lib/personalization/defaults";
import { PROFILE_PALETTE_IDS, normalizeProfilePresentationPreferences } from "@/lib/personalization/validation";
import { CONNECTION_COLORS } from "@/lib/social/types";

describe("profile presentation validation", () => {
  it("accepts a known profile palette", () => {
    expect(normalizeProfilePresentationPreferences({ version: 1, paletteId: "east" }).paletteId).toBe("east");
  });

  it("falls back from an unknown profile palette", () => {
    expect(normalizeProfilePresentationPreferences({ version: 1, paletteId: "#ff00ff" }).paletteId).toBe("neutral");
  });

  it.each([
    ["bannerMode", "world"],
    ["bannerPosition", "bottom"],
    ["overlayStrength", "high"],
    ["avatarFrame", "tier"],
    ["surfaceStyle", "soft_glass"],
    ["motifIntensity", "full"],
  ] as const)("validates %s", (field, value) => {
    expect(normalizeProfilePresentationPreferences({ version: 1, [field]: value })[field]).toBe(value);
  });

  it("falls back all invalid presentation choices independently", () => {
    expect(normalizeProfilePresentationPreferences({
      version: 1,
      bannerMode: "video",
      bannerPosition: "left",
      overlayStrength: 10,
      avatarFrame: "custom",
      surfaceStyle: "css",
      motifIntensity: "extreme",
    })).toEqual(DEFAULT_PROFILE_PRESENTATION_PREFERENCES);
  });
});

describe("personalization separation contracts", () => {
  it("keeps connectionColor as social relationship presentation", () => {
    expect(CONNECTION_COLORS).toContain("violet");
    expect(PROFILE_PALETTE_IDS).not.toContain("violet");
    expect(PROFILE_PALETTE_IDS).not.toContain("connectionColor");
  });

  it("keeps public profile fields out of app appearance preferences", () => {
    expect(DEFAULT_APP_APPEARANCE_PREFERENCES).not.toHaveProperty("profilePaletteId");
    expect(DEFAULT_APP_APPEARANCE_PREFERENCES).not.toHaveProperty("bannerMode");
    expect(DEFAULT_APP_APPEARANCE_PREFERENCES).not.toHaveProperty("connectionColor");
  });

  it("keeps library filters out of profile presentation preferences", () => {
    expect(DEFAULT_PROFILE_PRESENTATION_PREFERENCES).not.toHaveProperty("themeFilter");
    expect(DEFAULT_PROFILE_PRESENTATION_PREFERENCES).not.toHaveProperty("typeFilter");
    expect(DEFAULT_PROFILE_PRESENTATION_PREFERENCES).not.toHaveProperty("libraryView");
  });

  it("keeps raw CSS out of client preference models", () => {
    const serialized = JSON.stringify({ appearance: DEFAULT_APP_APPEARANCE_PREFERENCES, presentation: DEFAULT_PROFILE_PRESENTATION_PREFERENCES });
    expect(serialized).not.toMatch(/#|rgb\(|var\(--|color-mix/);
  });

  it("does not expose an arbitrary custom color field", () => {
    expect(DEFAULT_APP_APPEARANCE_PREFERENCES).not.toHaveProperty("customColor");
    expect(DEFAULT_PROFILE_PRESENTATION_PREFERENCES).not.toHaveProperty("customColor");
    expect(DEFAULT_PROFILE_PRESENTATION_PREFERENCES).not.toHaveProperty("hexColor");
  });
});
