import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  APP_NAVIGATION_ITEMS,
  dashboardTabHref,
  parseDashboardTab,
} from "@/components/app-shell/app-navigation";

const read = (path: string) => readFileSync(path, "utf8");
const dashboardPage = read("app/page.tsx");
const routeShell = read("components/app-shell/route-app-shell.tsx");
const sidebarProfile = read("components/sidebar-profile-card.tsx");
const mobileTabs = read("components/app-tabs.tsx");

describe("dashboard query navigation", () => {
  it("uses an allowlisted default and known query tabs", () => {
    expect(parseDashboardTab(null)).toBe("dashboard");
    expect(parseDashboardTab("settings")).toBe("settings");
    expect(parseDashboardTab("library")).toBe("library");
    expect(parseDashboardTab("not-a-tab")).toBe("dashboard");
  });

  it("builds canonical dashboard hrefs", () => {
    expect(dashboardTabHref("dashboard")).toBe("/?tab=dashboard");
    expect(dashboardTabHref("settings")).toBe("/?tab=settings");
    expect(dashboardTabHref("library")).toBe("/?tab=library");
  });

  it("derives page content from live search params instead of mount-only state", () => {
    expect(dashboardPage).toContain("const searchParams = useSearchParams()");
    expect(dashboardPage).toContain("const explicitTab = searchParams.get(\"tab\")");
    expect(dashboardPage).toContain("startup.preferences.defaultDashboardTab");
    expect(dashboardPage).not.toContain("useState<TabType>");
    expect(dashboardPage).not.toContain("new URLSearchParams(window.location.search)");
  });

  it("navigates internal actions through Next router without reload or history mutation", () => {
    expect(dashboardPage).toContain("router.push(dashboardTabHref(tab))");
    expect(dashboardPage).not.toMatch(/window\.location\.reload|window\.history\.(?:pushState|replaceState)/);
  });

  it("uses the same parser for shell active state and back-forward updates", () => {
    expect(routeShell).toContain('if (pathname === "/") return parseDashboardTab(tab, defaultTab)');
    expect(routeShell).toContain('searchParams.get("tab")');
  });

  it("routes gear and mobile dashboard tabs through the canonical adapter", () => {
    expect(sidebarProfile).toContain('href={dashboardTabHref("settings")}');
    expect(mobileTabs).toContain("onClick={() => onChange(tab)}");
    expect(APP_NAVIGATION_ITEMS.find((item) => item.id === "settings")?.destination).toMatchObject({
      kind: "dashboard-tab",
      href: "/?tab=settings",
    });
  });

  it("keeps the persistent root shell contract", () => {
    expect(read("app/layout.tsx")).toContain("<RouteAppShell>{children}</RouteAppShell>");
    for (const path of ["app/page.tsx", "app/feed/page.tsx", "app/recommendations/page.tsx"]) {
      expect(read(path), path).not.toMatch(/<AppShell|<RouteAppShell/);
    }
  });
});
