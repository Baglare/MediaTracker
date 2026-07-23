import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultLayoutPreferences,
  LAYOUT_PREFERENCES_STORAGE_KEY,
  loadLayoutPreferences,
  moveLayoutWidget,
  normalizeLayoutPreferences,
  normalizeWidgetPreferences,
  resetLayoutSurface,
  saveLayoutPreferences,
  setLayoutWidgetVisibility,
  visibleWidgetIds,
  type LayoutPreferencesStorage,
} from "@/lib/personalization/layout-preferences";
import {
  DASHBOARD_WIDGET_REGISTRY,
  RIGHT_RAIL_WIDGET_REGISTRY,
} from "@/lib/personalization/widget-registry";
import {
  DASHBOARD_WIDGET_IDS,
  RIGHT_RAIL_WIDGET_IDS,
} from "@/lib/personalization/layout-types";

const read = (path: string) => readFileSync(path, "utf8");

class MemoryStorage implements LayoutPreferencesStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("P5A layout preference validation", () => {
  it("creates versioned defaults for every registered widget", () => {
    const defaults = defaultLayoutPreferences();
    expect(defaults.version).toBe(1);
    expect(defaults.dashboard.map(({ id }) => id)).toEqual(DASHBOARD_WIDGET_IDS);
    expect(defaults.rightRail.map(({ id }) => id)).toEqual(RIGHT_RAIL_WIDGET_IDS);
  });

  it("falls back safely for invalid and unknown versions", () => {
    expect(normalizeLayoutPreferences(null)).toEqual(defaultLayoutPreferences());
    expect(normalizeLayoutPreferences({ version: 9, dashboard: [], rightRail: [] }))
      .toEqual(defaultLayoutPreferences());
  });

  it("drops duplicate and unknown ids while restoring missing widgets", () => {
    const normalized = normalizeWidgetPreferences([
      { id: "continue", visible: false, order: 4 },
      { id: "continue", visible: true, order: 0 },
      { id: "future-widget", visible: true, order: 1 },
    ], DASHBOARD_WIDGET_REGISTRY);
    expect(normalized.filter(({ id }) => id === "continue")).toHaveLength(1);
    expect(normalized.map(({ id }) => String(id))).not.toContain("future-widget");
    expect(normalized).toHaveLength(DASHBOARD_WIDGET_REGISTRY.length);
  });

  it("normalizes finite order values into one contiguous sequence", () => {
    const normalized = normalizeWidgetPreferences([
      { id: "continue", visible: true, order: 40 },
      { id: "summary", visible: false, order: -5 },
      { id: "recent-activity", visible: true, order: Number.NaN },
    ], DASHBOARD_WIDGET_REGISTRY);
    expect(normalized.map(({ order }) => order)).toEqual(
      Array.from({ length: normalized.length }, (_, index) => index),
    );
  });

  it("keeps required dashboard summary visible", () => {
    const normalized = normalizeWidgetPreferences([
      { id: "summary", visible: false, order: 0 },
    ], DASHBOARD_WIDGET_REGISTRY);
    expect(normalized.find(({ id }) => id === "summary")?.visible).toBe(true);
  });

  it("changes optional visibility but ignores required widget hiding", () => {
    const defaults = defaultLayoutPreferences();
    const hidden = setLayoutWidgetVisibility(defaults, "dashboard", "continue", false);
    expect(hidden.dashboard.find(({ id }) => id === "continue")?.visible).toBe(false);
    expect(setLayoutWidgetVisibility(hidden, "dashboard", "summary", false))
      .toEqual(hidden);
  });

  it.each([
    ["up", 0],
    ["top", 0],
    ["down", 2],
    ["bottom", DASHBOARD_WIDGET_IDS.length - 1],
  ] as const)("moves a dashboard widget %s", (move, expectedOrder) => {
    const moved = moveLayoutWidget(defaultLayoutPreferences(), "dashboard", "continue", move);
    expect(moved.dashboard.find(({ id }) => id === "continue")?.order).toBe(expectedOrder);
  });

  it("resets one surface without changing the other", () => {
    const customized = moveLayoutWidget(defaultLayoutPreferences(), "rightRail", "dailyGoal", "bottom");
    const dashboardHidden = setLayoutWidgetVisibility(customized, "dashboard", "continue", false);
    const reset = resetLayoutSurface(dashboardHidden, "dashboard");
    expect(reset.dashboard).toEqual(defaultLayoutPreferences().dashboard);
    expect(reset.rightRail).toEqual(customized.rightRail);
  });

  it("returns ordered visible ids without duplicates", () => {
    const preferences = normalizeWidgetPreferences([
      { id: "continue", visible: true, order: 1 },
      { id: "summary", visible: true, order: 0 },
      { id: "continue", visible: true, order: 2 },
    ], DASHBOARD_WIDGET_REGISTRY);
    expect(visibleWidgetIds(preferences).slice(0, 2)).toEqual(["summary", "continue"]);
  });
});

describe("P5A local-first persistence and legacy migration", () => {
  it("falls back from broken JSON without throwing", () => {
    const storage = new MemoryStorage();
    storage.values.set(LAYOUT_PREFERENCES_STORAGE_KEY, "{broken");
    expect(loadLayoutPreferences(storage)).toEqual(defaultLayoutPreferences());
  });

  it("loads and saves the current version", () => {
    const storage = new MemoryStorage();
    const customized = setLayoutWidgetVisibility(
      defaultLayoutPreferences(),
      "rightRail",
      "dailyGoal",
      false,
    );
    saveLayoutPreferences(customized, storage);
    expect(loadLayoutPreferences(storage)).toEqual(customized);
  });

  it("does not remove unrelated preference keys", () => {
    const storage = new MemoryStorage();
    storage.values.set("mediaTracker:appearancePreferences:v1", "keep-me");
    saveLayoutPreferences(defaultLayoutPreferences(), storage);
    expect(storage.getItem("mediaTracker:appearancePreferences:v1")).toBe("keep-me");
  });

  it("migrates legacy Right Rail order and visibility only when new state is absent", () => {
    const storage = new MemoryStorage();
    storage.values.set("media-tracker-right-rail-preferences", JSON.stringify({
      order: ["recentActivities", "overallProgress"],
      enabled: { recentActivities: false, overallProgress: true },
    }));
    const migrated = loadLayoutPreferences(storage);
    expect(migrated.rightRail[0]?.id).toBe("recentActivities");
    expect(migrated.rightRail.find(({ id }) => id === "recentActivities")?.visible).toBe(false);
    expect(migrated.dashboard).toEqual(defaultLayoutPreferences().dashboard);
  });

  it("prefers latest valid P5A state over legacy state", () => {
    const storage = new MemoryStorage();
    const current = moveLayoutWidget(defaultLayoutPreferences(), "rightRail", "notedItems", "top");
    saveLayoutPreferences(current, storage);
    storage.values.set("media-tracker-right-rail-preferences", JSON.stringify({
      order: ["dailyGoal"],
      enabled: { dailyGoal: false },
    }));
    expect(loadLayoutPreferences(storage)).toEqual(current);
  });
});

describe("P5A registries and render contracts", () => {
  const page = read("app/page.tsx");
  const dashboard = read("components/enhanced-dashboard.tsx");
  const dashboardFeature = read("features/dashboard/components/dashboard-feature.tsx");
  const rightRail = read("components/right-rail.tsx");
  const settings = read("components/personalization/layout-settings-card.tsx");
  const hook = read("hooks/use-layout-preferences.ts");
  const persistedHook = read("hooks/use-persisted-preferences.ts");
  const registry = read("lib/personalization/widget-registry.ts");

  it("uses actual stable Dashboard ids with metadata", () => {
    expect(DASHBOARD_WIDGET_REGISTRY.map(({ id }) => id)).toEqual(DASHBOARD_WIDGET_IDS);
    expect(DASHBOARD_WIDGET_REGISTRY.every(({ label, description }) => label && description)).toBe(true);
  });

  it("keeps every existing Right Rail widget in one registry", () => {
    expect(RIGHT_RAIL_WIDGET_REGISTRY.map(({ id }) => id)).toEqual(RIGHT_RAIL_WIDGET_IDS);
    expect(RIGHT_RAIL_WIDGET_REGISTRY).toHaveLength(14);
  });

  it("renders Dashboard sections from normalized visibility and order", () => {
    expect(dashboard).toContain('data-dashboard-widget="summary"');
    expect(dashboard).toContain('isWidgetVisible("continue")');
    expect(dashboard).toContain('style={widgetOrder("favorite-showcase")}');
    expect(dashboard).not.toContain("localStorage");
  });

  it("renders Right Rail widgets only from the visible ordered list", () => {
    expect(rightRail).toContain("visibleWidgetIds(preferences)");
    expect(rightRail).toContain("visibleIds.map");
    expect(rightRail).toContain("Sağ panel boş");
    expect(rightRail).toContain("scopeMediaListByWorld");
  });

  it("keeps contextual entry points on Dashboard and Right Rail", () => {
    expect(dashboardFeature).toContain('/?tab=settings#layout');
    expect(dashboardFeature).toContain("Düzeni özelleştir");
    expect(rightRail).toContain('/?tab=settings#layout');
  });

  it("provides accessible visibility, reorder and live status controls", () => {
    expect(settings).toContain('type="checkbox"');
    expect(settings).toContain('aria-live="polite"');
    expect(settings).toContain("En üste");
    expect(settings).toContain("En alta");
    expect(settings).toContain("definition.required");
    expect(settings).toContain("Tüm düzeni sıfırla");
  });

  it("keeps layout persistence out of the legacy mega preference hook", () => {
    expect(hook).toContain("loadLayoutPreferences");
    expect(hook).toContain("saveLayoutPreferences");
    expect(hook).not.toContain("MediaItem");
    expect(hook).not.toContain("Supabase");
    expect(persistedHook).not.toContain("rightRailPreferences");
  });

  it("keeps theme, chart, density and effects out of layout preferences", () => {
    const types = read("lib/personalization/layout-types.ts");
    expect(types).not.toContain("ChartPalette");
    expect(types).not.toContain("BaseTheme");
    expect(types).not.toContain("density:");
    expect(types).not.toContain("effectsLevel");
    expect(registry).not.toMatch(/obsidian|porcelain|ocean|tozpembe|orman/i);
  });

  it("preserves the P4 composition and persistent AppShell boundaries", () => {
    expect(page).toContain("useLayoutPreferences");
    expect(page).toContain("layout.preferences.dashboard");
    expect(page).not.toContain("<AppShell");
    expect(read("app/layout.tsx")).toContain("<RouteAppShell>{children}</RouteAppShell>");
  });

  it("does not eagerly render hidden widgets during preference hydration", () => {
    expect(dashboardFeature).toContain("isLayoutHydrated");
    expect(dashboardFeature).toContain("Dashboard düzeni yükleniyor");
    expect(rightRail).toContain("isLayoutHydrated && visibleIds.map");
  });
});
