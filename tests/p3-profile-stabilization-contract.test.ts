import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE_THEME_REGISTRY } from "@/lib/personalization/theme-registry";

const read = (path: string) => readFileSync(path, "utf8");
const profilePage = read("components/profile/profile-page-client.tsx");
const viewContent = read("components/profile/profile-view-content.tsx");
const editorPanel = read("components/profile/profile-editor-panel.tsx");
const editor = read("components/profile/unified-profile-editor.tsx");
const positionEditor = read("components/profile/image-position-editor.tsx");
const hero = read("components/profile/profile-hero.tsx");
const avatar = read("components/sidebar-profile-card.tsx");
const server = read("lib/social/server.ts");
const xp = read("hooks/use-xp-progression.ts");
const css = read("app/globals.css");
const cloud = read("components/cloud-data-status-card.tsx");
const filters = read("components/media-filters.tsx");

describe("P3.0 profile performance contracts", () => {
  it("keeps the hero independent from local library hydration", () => {
    expect(profilePage).toContain("<ProfileHero");
    expect(profilePage).not.toContain("useMediaLibrary");
    expect(profilePage).not.toContain("UnifiedProfileEditor");
    expect(viewContent).toContain("useMediaLibrary");
  });

  it("loads editor-only code and data only in edit mode", () => {
    expect(profilePage).toContain("dynamic(");
    expect(profilePage).toContain("profile-editor-panel");
    expect(editorPanel).toContain('fetch("/api/social/profile"');
    expect(editorPanel).toContain("<UnifiedProfileEditor");
    expect(profilePage).toContain('mode === "edit"');
  });

  it("uses a minimal hero endpoint without editor modules", () => {
    expect(profilePage).toContain('fetch("/api/social/profile/hero"');
    const loader = server.slice(server.indexOf("export async function loadOwnProfileHeroData"));
    expect(loader).not.toMatch(/profile_modules|profile_media_showcase|list_social_blocks/);
    expect(loader).toContain("Promise.all");
  });

  it("dedupes concurrent XP reads across shell and profile consumers", () => {
    expect(xp).toContain("const inFlight = new Map");
    expect(xp).toContain("if (running) return running");
    expect(xp.match(/fetch\("\/api\/xp"/g)).toHaveLength(1);
  });
});

describe("P3.0 image positioning contracts", () => {
  it("supports pointer, keyboard, zoom and reset controls", () => {
    expect(positionEditor).toContain("onPointerDown");
    expect(positionEditor).toContain("onPointerMove");
    expect(positionEditor).toContain('event.key === "ArrowLeft"');
    expect(positionEditor).toContain('type="range"');
    expect(positionEditor).toContain("Merkeze sıfırla");
  });

  it("uses the same transform helper for hero banners and shared avatars", () => {
    expect(hero).toContain("resolveImageTransformStyle(presentation.bannerTransform");
    expect(hero).toContain("imageTransform={presentation.avatarTransform}");
    expect(avatar).toContain('resolveImageTransformStyle(imageTransform, "avatar")');
  });

  it("resets new uploads but preserves draft cancellation", () => {
    expect(editor).toContain('"bannerTransform",');
    expect(editor).toContain("defaultImageTransform()");
    expect(editor).toContain("avatarTransform: defaultImageTransform()");
    expect(editor).toContain("setForm(savedForm)");
  });
});

describe("P3.0 porcelain contrast contracts", () => {
  it.each(["--app-action-success-text", "--app-action-accent-text", "--app-selected-text", "--app-disabled-text"])("defines %s in every active preset theme scope", (token) => {
    const activeThemeCount = Object.keys(BASE_THEME_REGISTRY).filter((id) => id !== "system").length;
    expect(css.match(new RegExp(token, "g"))).toHaveLength(activeThemeCount);
  });

  it("keeps cloud actions readable without fading the whole card", () => {
    expect(cloud).toContain("var(--app-action-success-text)");
    expect(cloud).toContain("var(--app-action-accent-text)");
    expect(cloud).not.toContain("disabled:opacity-50");
  });

  it("uses selected semantic text and a non-color-only marker for active status pills", () => {
    expect(filters).toContain("var(--app-selected-text)");
    expect(filters).toContain("aria-pressed={isActive}");
    expect(filters).toContain("✓");
    expect(filters).toContain("focus-visible:ring-2");
  });
});
