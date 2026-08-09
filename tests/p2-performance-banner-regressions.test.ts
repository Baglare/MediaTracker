import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const rootLayout = read("app/layout.tsx");
const routeShell = read("components/app-shell/route-app-shell.tsx");
const profilePage = read("components/profile/profile-page-client.tsx");
const editorPanel = read("components/profile/profile-editor-panel.tsx");
const editor = read("components/profile/unified-profile-editor.tsx");
const hero = read("components/profile/profile-hero.tsx");
const socialServer = read("lib/social/server.ts");
const authServer = read("lib/supabase/current-user.ts");
const assetRoute = read("app/api/social/assets/route.ts");
const authHook = read("hooks/use-auth.ts");
const notificationBadge = read("components/social/notification-badge.tsx");
const xpHook = read("hooks/use-xp-progression.ts");

const appRoutes = [
  "app/page.tsx",
  "app/profile/page.tsx",
  "app/feed/page.tsx",
  "app/recommendations/page.tsx",
  "app/notifications/page.tsx",
  "app/people/page.tsx",
  "app/progression/page.tsx",
  "app/u/[username]/page.tsx",
];

describe("P2 shell performance contracts", () => {
  it("mounts the canonical shell once in the persistent root layout", () => {
    expect(rootLayout.match(/<RouteAppShell/g)).toHaveLength(1);
    for (const route of appRoutes) expect(read(route), route).not.toMatch(/<AppShell|<RouteAppShell/);
  });

  it("keeps the theme runtime single and outside the persistent shell", () => {
    expect(rootLayout.match(/<AppearanceRuntime/g)).toHaveLength(1);
    expect(routeShell).not.toContain("AppearanceRuntime");
  });

  it("does not hydrate the shell from the full local media library", () => {
    expect(routeShell).not.toMatch(/loadMediaList|loadProgressLogs|useMediaLibrary/);
    expect(routeShell).toContain("/api/social/profile/summary");
  });

  it("coalesces auth reads with a request-local React cache boundary", () => {
    expect(authServer).toContain("export const getCurrentServerAuth = cache(");
    for (const route of ["app/feed/page.tsx", "app/recommendations/page.tsx", "app/notifications/page.tsx", "app/progression/page.tsx"]) {
      expect(read(route), route).toContain("getCurrentServerAuth");
      expect(read(route), route).not.toContain("auth.getUser()");
    }
  });

  it("shares client auth and notification subscriptions across shell consumers", () => {
    expect(authHook.match(/auth\.getSession\(\)/g)).toHaveLength(1);
    expect(authHook.match(/onAuthStateChange/g)).toHaveLength(1);
    expect(notificationBadge).toContain("useSyncExternalStore");
    expect(notificationBadge).toContain("if (inFlight) return inFlight");
  });

  it("does not request XP for an anonymous shell", () => {
    expect(xpHook).toContain("if (!userId) return;");
    expect(xpHook).toContain('fetch("/api/xp"');
  });

  it("does not fetch the editor profile twice during /profile mount", () => {
    expect(profilePage).toContain('fetch("/api/social/profile/hero"');
    expect(profilePage).not.toContain('fetch("/api/social/profile",');
    expect(editorPanel.match(/fetch\("\/api\/social\/profile"/g)).toHaveLength(1);
    expect(editor).not.toContain('fetch("/api/social/profile", { cache: "no-store" })');
  });

  it("keeps independent public profile work parallel", () => {
    expect(socialServer).toContain("const [avatarUrl, bannerUrl, xpResult, activityResult] = await Promise.all");
    expect(socialServer).toContain("const [avatarUrl, bannerUrl] = row");
  });

  it("does not call an internal API route from a server component", () => {
    for (const route of appRoutes) expect(read(route), route).not.toMatch(/fetch\(["']\/api\//);
  });
});

describe("P2 banner regression contracts", () => {
  it("stores the canonical object path rather than a signed URL", () => {
    expect(assetRoute).toContain("banner_path: path");
    expect(assetRoute).not.toMatch(/banner_path:\s*signed/);
  });

  it("returns a signed preview URL without persisting it", () => {
    expect(assetRoute).toContain("createSignedSocialAssetUrl(path, kind, path)");
    expect(assetRoute).toContain("url: signedUrl");
    expect(socialServer).toContain("createSignedUrl(assetPath, SIGNED_URL_TTL_SECONDS)");
    expect(assetRoute).not.toMatch(/avatar_path:\s*signed|banner_path:\s*signed/);
  });

  it("updates the preview URL and image mode immediately after upload", () => {
    expect(editor).toContain("bannerUrl: result.url");
    expect(editor).toContain('updatePresentation(current, "bannerMode", "image")');
  });

  it("persists image mode through the existing unified profile save", () => {
    expect(editor).toContain('action: "save_profile"');
    expect(read("app/api/social/profile/route.ts")).toContain("p_banner_mode: profile.presentation.bannerMode");
  });

  it("signs the same canonical banner path for self and public loaders", () => {
    expect(socialServer).toContain("row.banner_path");
    expect(socialServer).toContain("rawProfile?.bannerPath");
  });

  it("renders image banners with position, overlay and gradient fallback", () => {
    expect(hero).toContain("<img src={imageBannerUrl}");
    expect(hero).toContain("resolveImageTransformStyle(presentation.bannerTransform");
    expect(hero).toContain("bannerPositionFallback(presentation.bannerPosition)");
    expect(hero).toContain("OVERLAY_CLASSES[presentation.overlayStrength]");
    expect(hero).toContain("bannerGradient(presentation.paletteId)");
  });

  it("keeps avatar, palette and connection color boundaries intact", () => {
    expect(editor).toContain("ProfileSettingsCard");
    expect(hero).toContain("data-profile-palette");
    expect(editor).toContain("Bağlantı rengi yalnız sosyal ilişki gösteriminde kullanılır");
  });
});
