import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { APP_NAVIGATION_ITEMS, dashboardTabHref, parseDashboardTab, resolveActiveNavigation } from "@/components/app-shell/app-navigation";

const read = (path: string) => readFileSync(path, "utf8");
const appPage = read("app/page.tsx");
const rootLayout = read("app/layout.tsx");
const appShell = read("components/app-shell/app-shell.tsx");
const routeShell = read("components/app-shell/route-app-shell.tsx");
const socialShell = read("components/social/social-page-shell.tsx");
const sidebarProfile = read("components/sidebar-profile-card.tsx");
const publicProfilePage = read("app/u/[username]/page.tsx");

describe("canonical application shell", () => {
  it("owns the only sidebar and topbar composition", () => {
    expect(appShell).toContain("<AppSidebar");
    expect(appShell).toContain("<AppTopbar");
    expect(socialShell).not.toMatch(/AppSidebar|AppTopbar/);
  });

  it("supports authenticated and public presentation modes", () => {
    expect(appShell).toContain('export type AppShellMode = "authenticated" | "public"');
    expect(appShell).toContain('mode === "public"');
    expect(appShell).toContain("MediaTracker");
  });

  it("keeps SocialPageShell content-only", () => {
    expect(socialShell).toContain("AppPageHeader");
    expect(socialShell).not.toMatch(/min-h-screen|<main|<nav/);
  });

  it("uses the canonical shell on dashboard and social routes", () => {
    expect(rootLayout).toContain("<RouteAppShell>{children}</RouteAppShell>");
    for (const path of ["app/page.tsx", "app/profile/page.tsx", "app/feed/page.tsx", "app/recommendations/page.tsx", "app/notifications/page.tsx", "app/people/page.tsx", "app/progression/page.tsx", "app/u/[username]/page.tsx"]) {
      expect(read(path), path).not.toMatch(/<AppShell|<RouteAppShell/);
    }
  });

  it("selects public mode for anonymous public profiles", () => {
    expect(routeShell).toContain('pathname.startsWith("/u/") || pathname === "/people"');
    expect(routeShell).toContain('auth.user ? "authenticated" : "public"');
    expect(publicProfilePage).not.toContain("AppShell");
  });

  it("keeps the appearance runtime at the root rather than duplicating it", () => {
    expect(routeShell).not.toContain("AppearanceRuntime");
    expect(appShell).not.toContain("AppearanceRuntime");
  });
});

describe("canonical navigation", () => {
  it("contains the required destinations once", () => {
    const labels = APP_NAVIGATION_ITEMS.map((item) => item.label);
    for (const label of ["Dashboard", "Kütüphanem", "Keşfet", "Takvim", "Profil", "Akış", "Öneriler", "Bildirimler", "Kullanıcı Ara", "İlerleme", "Ayarlar"]) {
      expect(labels.filter((candidate) => candidate === label), label).toHaveLength(1);
    }
  });

  it("routes the canonical profile item to /profile", () => {
    expect(APP_NAVIGATION_ITEMS.find((item) => item.id === "profile")?.destination).toMatchObject({ kind: "route", href: "/profile" });
    expect(sidebarProfile).toContain('href="/profile"');
  });

  it.each([
    ["/feed", "feed"],
    ["/feed/item/1", "feed"],
    ["/recommendations", "recommendations"],
    ["/notifications", "notifications"],
    ["/people", "people"],
    ["/profile", "profile"],
    ["/progression", "progression"],
  ] as const)("resolves %s to only %s", (path, expected) => {
    expect(resolveActiveNavigation(path)).toBe(expected);
  });

  it("does not mark a public user route as the self profile", () => {
    expect(resolveActiveNavigation("/u/another_user")).toBeUndefined();
  });

  it("preserves legacy dashboard sections through a query adapter", () => {
    expect(dashboardTabHref("library")).toBe("/?tab=library");
    expect(parseDashboardTab("library")).toBe("library");
    expect(appPage).toContain("useSearchParams");
    expect(appPage).toContain("router.push(dashboardTabHref(tab))");
    expect(appPage).not.toContain("window.history.replaceState");
  });
});

describe("profile extraction", () => {
  it("provides the canonical self-profile route", () => {
    const route = read("app/profile/page.tsx");
    expect(route).toContain("<ProfilePageClient");
    expect(route).not.toContain("RouteAppShell");
  });

  it("removes the old self-profile editor duplication from app/page", () => {
    expect(appPage).not.toContain("ProfileSettingsCard");
    expect(appPage).not.toContain("SocialProfileEditor");
    expect(appPage).not.toContain('activeTab === "profile"');
  });

  it("keeps extracted self-profile features outside app/page", () => {
    for (const path of ["components/profile/profile-favorites.tsx", "components/profile/profile-activity.tsx", "components/profile/profile-progression-summary.tsx"]) {
      expect(read(path).length, path).toBeGreaterThan(100);
    }
  });
});
