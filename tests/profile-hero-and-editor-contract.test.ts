import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_PROFILE_PRESENTATION_PREFERENCES } from "@/lib/personalization/defaults";
import { validateSocialProfileInput } from "@/lib/social/validation";

const hero = readFileSync("components/profile/profile-hero.tsx", "utf8");
const editor = readFileSync("components/profile/unified-profile-editor.tsx", "utf8");
const profilePage = readFileSync("components/profile/profile-page-client.tsx", "utf8");
const publicProfile = readFileSync("components/social/social-profile-view.tsx", "utf8");

describe("shared ProfileHero", () => {
  it("defines self, public and preview variants in one component", () => {
    expect(hero).toContain('"self" | "public" | "preview"');
    expect(profilePage).toContain('variant="self"');
    expect(publicProfile).toContain('variant="public"');
    expect(editor).toContain('variant="preview"');
  });

  it.each(["none", "gradient", "world", "image"])("supports the %s banner contract", (mode) => {
    expect(hero).toContain(mode);
  });

  it("uses a themed fallback until an image banner is actually loaded", () => {
    expect(hero).toContain('presentation.bannerMode === "image" ? identity.bannerUrl : undefined');
    expect(hero).toContain('loadedBannerUrl === imageBannerUrl');
    expect(hero).toContain('"profile-hero-themed-fallback"');
    expect(hero).toContain('data-profile-banner-state');
    expect(hero).toContain('onLoad={() => setLoadedBannerUrl(imageBannerUrl)}');
  });

  it.each(["low", "medium", "high"])("defines the %s overlay", (strength) => {
    expect(hero).toMatch(new RegExp(`${strength}: ["']from-black`));
  });

  it.each(["none", "subtle", "world", "tier"])("defines the %s avatar frame", (frame) => {
    expect(hero).toMatch(new RegExp(`${frame}:`));
  });

  it("scopes profile palette without changing the application theme", () => {
    expect(hero).toContain("data-profile-palette");
    expect(hero).not.toMatch(/data-theme|document\.documentElement/);
  });

  it("uses an image element rather than interpolating user content into CSS", () => {
    expect(hero).toContain("<img src={imageBannerUrl}");
    expect(hero).toContain("resolveImageTransformStyle");
    expect(hero).toContain("onBannerError?.()");
    expect(hero).not.toContain("backgroundImage:");
  });

  it("keeps banner text readable and exposes avatar labeling", () => {
    expect(hero).toContain("OVERLAY_CLASSES");
    expect(hero).toContain('hasImageBanner ? "text-white" : "text-[var(--app-text-primary)]"');
    expect(hero).toContain("ariaLabel={`${identity.displayName} avatarı`}");
  });
});

describe("unified profile editor", () => {
  it("uses one explicit save and draft cancellation model", () => {
    expect(editor).toContain("Değişiklikleri kaydet");
    expect(editor).toContain("Taslak değişiklikler geri alındı");
  });

  it("uses initial profile data instead of fetching again when the editor mounts", () => {
    expect(editor).toContain("initialData?: SocialProfileEditorData");
    expect(editor).not.toContain('fetch("/api/social/profile", { cache: "no-store" })');
    expect(editor).not.toMatch(/useEffect\(\(\) => \{ void load/);
  });

  it("switches an uploaded banner draft to image mode and previews the returned URL", () => {
    expect(editor).toContain('updatePresentation(current, "bannerMode", "image")');
    expect(editor).toContain("bannerUrl: result.url");
    expect(editor).toContain("Banner yüklendi ve görsel modu seçildi");
  });

  it("keeps cloud-only controls hidden in local-only mode", () => {
    expect(editor).toContain("const localOnly = !authConfigured || !authenticated");
    expect(editor).toContain("{!localOnly &&");
  });

  it("updates only safe local identity cache fields after cloud save", () => {
    const saveBlock = editor.slice(editor.indexOf('await post({ action: "save_profile"'), editor.indexOf("setSavedForm(validation.value)"));
    expect(saveBlock).toContain("displayName");
    expect(saveBlock).toContain("profileTagline");
    expect(saveBlock).not.toMatch(/visibilityMode|username:|connectionColor|modules/);
  });

  it("reuses privacy, layout and sharing editors", () => {
    expect(editor).toContain("<SocialPreferencesPanel");
    expect(editor).toContain("<SocialLayoutEditor");
    expect(editor).toContain("<SocialSharingEditor");
  });

  it("keeps connectionColor explicitly outside palette and banner", () => {
    expect(editor).toContain("yalnız sosyal ilişki gösteriminde kullanılır");
    expect(editor).not.toMatch(/updatePresentation\([^\n]*connectionColor/);
  });

  it("validates tagline, bio and presentation as one cloud payload", () => {
    const valid = validateSocialProfileInput({
      username: "profile_user",
      displayName: "Profile User",
      tagline: "Kısa kimlik",
      bio: "Uzun profil açıklaması",
      visibilityMode: "public",
      connectionColor: "violet",
      presentation: DEFAULT_PROFILE_PRESENTATION_PREFERENCES,
    });
    expect(valid.ok).toBe(true);
    expect(validateSocialProfileInput({ ...(valid.ok ? valid.value : {}), tagline: "x".repeat(121) }).ok).toBe(false);
    expect(validateSocialProfileInput({ ...(valid.ok ? valid.value : {}), bio: "x".repeat(501) }).ok).toBe(false);
  });

  it("rejects unknown presentation values instead of sending them to the RPC", () => {
    const result = validateSocialProfileInput({ username: "profile_user", displayName: "Profile User", tagline: "", bio: "", visibilityMode: "public", connectionColor: "neutral", presentation: { ...DEFAULT_PROFILE_PRESENTATION_PREFERENCES, paletteId: "#fff" } });
    expect(result.ok).toBe(false);
  });

  it("distinguishes cloud failure from a missing profile", () => {
    expect(profilePage).toContain("Cloud profil bilgileri şu anda yenilenemedi");
    expect(editor).toContain("ilk cloud profil kaydından sonra açılır");
  });
});

describe("public profile module boundary", () => {
  it("keeps the existing grid and XP projection", () => {
    expect(publicProfile).toContain("<ProfileGrid payload={payload}");
    expect(publicProfile).toContain("payload.xp");
  });

  it("renders self and other-viewer actions differently", () => {
    expect(publicProfile).toContain("payload.relationship.self");
    expect(publicProfile).toContain("<SocialActions");
    expect(publicProfile).toContain('href="/profile?mode=edit"');
  });
});
