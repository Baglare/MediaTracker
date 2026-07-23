import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  dashboardTabHref,
  parseDashboardTab,
} from "@/components/app-shell/app-navigation";
import {
  DEFAULT_DASHBOARD_TABS,
  DEFAULT_STARTUP_PREFERENCES,
  STARTUP_PREFERENCES_STORAGE_KEY,
  normalizeStartupPreferences,
  readStartupPreferences,
  resetStartupPreferences,
  writeStartupPreferences,
  type StartupPreferencesStorage,
} from "@/lib/personalization/startup-preferences";

function memoryStorage(initial?: string): StartupPreferencesStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STARTUP_PREFERENCES_STORAGE_KEY, initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const css = readFileSync("app/globals.css", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const appearanceRuntime = readFileSync("components/personalization/appearance-runtime.tsx", "utf8");
const appearanceSettings = readFileSync("components/personalization/appearance-settings-card.tsx", "utf8");
const startupSettings = readFileSync("components/personalization/startup-settings-card.tsx", "utf8");
const layoutTypes = readFileSync("lib/personalization/layout-types.ts", "utf8");

describe("startup preferences", () => {
  it("defaults to Dashboard and exposes only internal General tabs", () => {
    expect(DEFAULT_STARTUP_PREFERENCES).toEqual({
      version: 1,
      defaultDashboardTab: "dashboard",
    });
    expect(DEFAULT_DASHBOARD_TABS).toEqual([
      "dashboard",
      "library",
      "discover",
      "calendar",
      "settings",
    ]);
  });

  it.each(DEFAULT_DASHBOARD_TABS)("accepts %s as a startup tab", (defaultDashboardTab) => {
    expect(normalizeStartupPreferences({ version: 1, defaultDashboardTab }))
      .toEqual({ version: 1, defaultDashboardTab });
  });

  it("falls back for malformed JSON, unknown versions and social routes", () => {
    expect(readStartupPreferences(memoryStorage("{broken"))).toEqual(DEFAULT_STARTUP_PREFERENCES);
    expect(normalizeStartupPreferences({ version: 2, defaultDashboardTab: "library" }))
      .toEqual(DEFAULT_STARTUP_PREFERENCES);
    expect(normalizeStartupPreferences({ version: 1, defaultDashboardTab: "feed" }))
      .toEqual(DEFAULT_STARTUP_PREFERENCES);
  });

  it("persists and resets without deleting another preference namespace", () => {
    const storage = memoryStorage();
    storage.values.set("mediaTracker:layoutPreferences:v1", "preserve-me");
    expect(writeStartupPreferences(storage, { version: 1, defaultDashboardTab: "library" }))
      .toEqual({ version: 1, defaultDashboardTab: "library" });
    expect(readStartupPreferences(storage).defaultDashboardTab).toBe("library");
    expect(resetStartupPreferences(storage)).toEqual(DEFAULT_STARTUP_PREFERENCES);
    expect(storage.values.get("mediaTracker:layoutPreferences:v1")).toBe("preserve-me");
  });

  it("lets an explicit URL query override the startup preference", () => {
    expect(parseDashboardTab("settings", "library")).toBe("settings");
    expect(parseDashboardTab(null, "library")).toBe("library");
    expect(parseDashboardTab("invalid", "library")).toBe("library");
  });

  it("keeps explicit Dashboard and gear links canonical", () => {
    expect(dashboardTabHref("dashboard")).toBe("/?tab=dashboard");
    expect(dashboardTabHref("settings")).toBe("/?tab=settings");
  });
});

describe("P5B runtime and separation contracts", () => {
  it("mounts startup and appearance runtimes once above the persistent AppShell", () => {
    expect(layout.match(/<AppearanceRuntime/g)).toHaveLength(1);
    expect(layout.match(/<StartupRuntime/g)).toHaveLength(1);
    expect(layout.match(/<RouteAppShell/g)).toHaveLength(1);
  });

  it("derives the bare-root tab from hydrated startup preferences without router replace loops", () => {
    expect(page).toContain("startup.preferences.defaultDashboardTab");
    expect(page).toContain("explicitTab === null");
    expect(page).not.toMatch(/router\.replace|window\.location\.reload/);
  });

  it("applies density and effects through root attributes instead of per-card hooks", () => {
    expect(appearanceRuntime).toContain("preferences");
    expect(css).toContain('[data-density="compact"]');
    expect(css).toContain('[data-effects="off"]');
    expect(css).toContain('[data-effects="full"]');
    expect(readFileSync("lib/personalization/appearance-runtime.ts", "utf8"))
      .toMatch(/density: preferences\.density[\s\S]*effects: preferences\.effectsLevel|effects: preferences\.effectsLevel[\s\S]*density: preferences\.density/);
  });

  it("defines shared spacing tokens and preserves accessible control targets", () => {
    for (const token of [
      "--app-page-gap",
      "--app-section-gap",
      "--app-panel-padding",
      "--app-card-padding",
      "--app-control-gap",
      "--app-list-row-padding",
    ]) {
      expect(css).toContain(`${token}:`);
    }
    expect(appearanceSettings).toContain("min-h-24");
    expect(appearanceSettings).toContain("min-h-11");
    expect(readFileSync("features/library/components/library-feature.tsx", "utf8"))
      .toContain("space-y-[var(--app-section-gap)]");
    expect(readFileSync("components/enhanced-dashboard.tsx", "utf8"))
      .toContain("density-card");
    expect(readFileSync("components/right-rail.tsx", "utf8"))
      .toContain("density-card");
  });

  it("gives reduced motion precedence and does not add looping animations", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(/animation-iteration-count:\s*infinite|animation:\s*[^;]*\sinfinite/);
  });

  it("keeps chart, density and effects out of P5A layout preferences", () => {
    expect(layoutTypes).not.toMatch(/chartPalette|density|effects|baseTheme/);
  });

  it("keeps startup preferences separate from theme and chart concerns", () => {
    const source = readFileSync("lib/personalization/startup-preferences.ts", "utf8");
    expect(source).not.toMatch(/baseTheme|accentMode|chartPalette|density|effects/);
  });

  it("exposes registry-driven chart choices and no RGB/HEX editor", () => {
    expect(appearanceSettings).toContain("Object.values(CHART_PALETTE_REGISTRY)");
    expect(appearanceSettings).toContain("Object.values(BASE_THEME_REGISTRY)");
    expect(appearanceSettings).toContain("followWorldCompletedColor");
    expect(appearanceSettings).not.toMatch(/type=["']color["']|RGB|HEX/);
  });

  it("shows all startup choices with a single instant-save model", () => {
    for (const label of ["Dashboard", "Kütüphane", "Keşfet", "Takvim", "Ayarlar"]) {
      expect(startupSettings).toContain(label);
    }
    expect(startupSettings).toContain("setDefaultDashboardTab");
    expect(startupSettings).not.toContain("Değişiklikleri kaydet");
  });

  it("does not fetch or remount the shell when presentation preferences change", () => {
    expect(appearanceSettings).not.toMatch(/\bfetch\(/);
    expect(startupSettings).not.toMatch(/\bfetch\(/);
    expect(appearanceRuntime).not.toContain("RouteAppShell");
  });
});
