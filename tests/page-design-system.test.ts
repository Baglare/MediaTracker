import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { WORLD_THEME_REGISTRY } from "@/lib/personalization/world-theme-registry";
import { BASE_THEME_REGISTRY } from "@/lib/personalization/theme-registry";

const read = (path: string) => readFileSync(path, "utf8");
const css = read("app/globals.css");
const socialShell = read("components/social/social-page-shell.tsx");
const feed = read("components/social/activity-feed.tsx");
const recommendations = read("components/social/recommendation-inbox.tsx");
const notifications = read("components/social/notification-center.tsx");
const people = read("components/social/people-search.tsx");
const progression = read("components/xp/progression-dashboard.tsx");
const profileGrid = read("components/social/profile-grid.tsx");

describe("P3.1 shared page primitives", () => {
  it.each([
    "page-hero",
    "page-section",
    "section-heading",
    "stat-card",
    "segmented-tabs",
    "filter-toolbar",
    "contextual-actions",
    "empty-state",
    "error-state",
    "loading-state",
    "status-badge",
  ])("provides the focused %s primitive", (name) => {
    expect(read(`components/ui/${name}.tsx`).length).toBeGreaterThan(120);
  });

  it("keeps presentation-only primitives server compatible", () => {
    for (const name of ["page-hero", "page-section", "section-heading", "stat-card", "filter-toolbar", "contextual-actions", "empty-state", "loading-state", "status-badge"]) {
      expect(read(`components/ui/${name}.tsx`), name).not.toContain('"use client"');
    }
  });

  it("limits client state to interactive tab and retry primitives", () => {
    expect(read("components/ui/segmented-tabs.tsx")).toContain('"use client"');
    expect(read("components/ui/error-state.tsx")).toContain('"use client"');
    expect(read("components/ui/segmented-tabs.tsx")).toContain('role="tablist"');
    expect(read("components/ui/segmented-tabs.tsx")).toContain("aria-selected");
    expect(read("components/ui/segmented-tabs.tsx")).toContain('event.key === "ArrowRight"');
  });

  it("keeps SocialPageShell content-only and delegates its header", () => {
    expect(socialShell).toContain("<AppPageHeader");
    expect(socialShell).not.toMatch(/<main|AppSidebar|AppTopbar|min-h-screen/);
  });
});

describe("P3.1 surfaces, themes and world identity", () => {
  it.each([
    "--app-hero-bg",
    "--app-panel-bg",
    "--app-card-bg",
    "--app-card-hover",
    "--app-section-divider",
    "--app-subtle-highlight",
  ])("defines %s for all active themes", (token) => {
    const activeThemeCount = Object.keys(BASE_THEME_REGISTRY).filter((id) => id !== "system").length;
    expect(css.match(new RegExp(`${token}:`, "g"))).toHaveLength(activeThemeCount);
  });

  it("keeps all world identities in the canonical registry", () => {
    expect(Object.keys(WORLD_THEME_REGISTRY)).toEqual(["neutral", "east", "screen", "arch"]);
    expect(WORLD_THEME_REGISTRY.east.heroMotifKey).toBe("slash");
    expect(WORLD_THEME_REGISTRY.screen.heroMotifKey).toBe("aperture");
    expect(WORLD_THEME_REGISTRY.arch.heroMotifKey).toBe("wax-seal");
  });

  it("renders decorative motifs without pointer interaction or animation loops", () => {
    const hero = read("components/ui/page-hero.tsx");
    expect(hero).toContain("page-hero-motif pointer-events-none");
    expect(hero).toContain('aria-hidden="true"');
    expect(css).toContain('[data-page-hero-tone="screen"]');
    expect(css).toContain('[data-page-hero-tone="arch"]');
    expect(css).not.toMatch(/page-hero-motif[\s\S]{0,160}animation:/);
  });

  it("uses registry-backed world cards on progression", () => {
    expect(progression).toContain("WORLD_THEME_REGISTRY[worldKey]");
    expect(progression).toContain('data-world={worldKey}');
    expect(progression).toContain("world-identity-motif pointer-events-none");
  });
});

describe("P3.1 feature page contracts", () => {
  it("preserves feed reactions, comments, spoilers and profile links", () => {
    expect(feed).toContain("REACTION_TYPES.map");
    expect(feed).toContain("CommentThread");
    expect(feed).toContain("comment.spoiler");
    expect(feed).toContain("`/u/${activity.actor.username}`");
    expect(feed).toContain("<EmptyState");
    expect(feed).toContain("<LoadingState");
  });

  it("uses common recommendation tabs without exposing lifecycle enums", () => {
    expect(recommendations).toContain("<SegmentedTabs");
    expect(recommendations).toContain("FILTER_LABELS");
    expect(recommendations).toContain('href={`/u/${item.other.username}`}');
    expect(recommendations).toContain("recommendationResponsePresentation");
    expect(recommendations).toContain("recommendationProgressPresentation");
    expect(recommendations).toContain("<ErrorState");
  });

  it("keeps notification routing and non-color-only unread state", () => {
    expect(notifications).toContain("notificationHref(item)");
    expect(notifications).toContain('"read_all"');
    expect(notifications).toContain("publishNotificationChange");
    expect(notifications).toContain(">Yeni</span>");
    expect(notifications).toContain("<EmptyState");
  });

  it("keeps people profile links, relationships and transformed avatars", () => {
    expect(people).toContain('href={`/u/${person.username}`}');
    expect(people).toContain("CONNECTION_LABELS");
    expect(people).toContain("imageTransform={person.avatarTransform}");
    expect(people).toContain("<FilterToolbar");
    expect(people).toContain("<ErrorState");
  });

  it("preserves XP sections while adopting common primitives", () => {
    for (const label of ["Dünya ustalıkları", "Uzmanlık dalları", "Görevler", "Rozetler", "Son XP olayları"]) {
      expect(progression).toContain(label);
    }
    expect(progression).toContain("<StatCard");
    expect(progression).toContain('href="/profile"');
    expect(progression).toContain("synchronizeLibrary");
  });

  it("aligns public profile modules without changing visibility data", () => {
    expect(profileGrid).toContain("social-profile-grid-item app-section");
    expect(profileGrid).toContain("payload.modules");
    expect(profileGrid).toContain("ConnectionLists");
    expect(profileGrid).toContain("payload.sharedNotes");
  });
});

describe("P3.1 loading, error and performance boundaries", () => {
  it.each(["feed", "recommendations", "notifications", "people", "progression", "profile"])("provides %s route states", (route) => {
    expect(read(`app/${route}/loading.tsx`)).toContain("Loading");
    expect(read(`app/${route}/error.tsx`)).toContain("PageError");
  });

  it("keeps the public profile loading state inside the canonical shell", () => {
    const loading = read("app/u/[username]/loading.tsx");
    expect(loading).not.toMatch(/<main|min-h-screen|AppShell/);
    expect(loading).toContain("<LoadingState");
  });

  it("does not add per-page AppShell or server-to-own-API fetches", () => {
    for (const route of ["feed", "recommendations", "notifications", "people", "progression", "profile"]) {
      const page = read(`app/${route}/page.tsx`);
      expect(page, route).not.toMatch(/<AppShell|<RouteAppShell|fetch\("\/api\//);
    }
  });

  it("preserves profile lazy boundaries", () => {
    const profile = read("components/profile/profile-page-client.tsx");
    expect(profile).toContain("dynamic(");
    expect(profile).toContain("profile-editor-panel");
    expect(profile).toContain('mode === "edit"');
  });
});
