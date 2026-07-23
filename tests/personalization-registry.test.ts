import { describe, expect, it } from "vitest";

import {
  CHART_PALETTE_REGISTRY,
  STANDARD_CHART_STATUS_PRESENTATION,
  resolveChartStatusPresentation,
} from "@/lib/personalization/chart-palette-registry";
import type { ChartStatusKey, WorldThemeKey } from "@/lib/personalization/types";
import { WORLD_THEME_REGISTRY } from "@/lib/personalization/world-theme-registry";

const WORLD_KEYS: WorldThemeKey[] = ["neutral", "east", "screen", "arch"];
const STATUS_KEYS: ChartStatusKey[] = ["completed", "inProgress", "planning", "paused", "dropped"];

describe("world theme registry", () => {
  it("contains Neutral, Doğu, Kadraj and Arşiv with domain-compatible keys", () => {
    expect(Object.keys(WORLD_THEME_REGISTRY)).toEqual(WORLD_KEYS);
    expect(WORLD_THEME_REGISTRY.east.label).toBe("Doğu");
    expect(WORLD_THEME_REGISTRY.screen.label).toBe("Kadraj");
    expect(WORLD_THEME_REGISTRY.arch.label).toBe("Arşiv");
  });

  it.each(WORLD_KEYS)("defines complete semantic colors for %s", (key) => {
    expect(WORLD_THEME_REGISTRY[key]).toMatchObject({
      key,
      primary: expect.any(String),
      primaryStrong: expect.any(String),
      secondary: expect.any(String),
      border: expect.any(String),
      glow: expect.any(String),
      chartPrimary: expect.any(String),
      iconKey: expect.any(String),
      heroMotifKey: expect.any(String),
    });
  });

  it("preserves the established world color identities", () => {
    expect(WORLD_THEME_REGISTRY.east).toMatchObject({ primary: "#e8b86a", secondary: "#d96f5b" });
    expect(WORLD_THEME_REGISTRY.screen).toMatchObject({ primary: "#6fb0e0", secondary: "#e84a4a" });
    expect(WORLD_THEME_REGISTRY.arch).toMatchObject({ primary: "#b8956a", secondary: "#9d4646" });
  });
});

describe("chart palette registry", () => {
  it("registers every selectable P5B palette", () => {
    expect(Object.keys(CHART_PALETTE_REGISTRY)).toEqual([
      "standard",
      "ocean",
      "pastel",
      "high_contrast",
      "monochrome",
      "world_aware",
    ]);
  });

  it("models the current Right Rail colors as the standard palette", () => {
    expect(CHART_PALETTE_REGISTRY.standard.followWorldCompletedColor).toBe(true);
    expect(STANDARD_CHART_STATUS_PRESENTATION).toMatchObject({
      completed: { segmentColor: "#34d399", dotTone: "#34d399" },
      inProgress: { segmentColor: "#a78bfa" },
      planning: { segmentColor: "#7dd3fc" },
      paused: { segmentColor: "#fb923c" },
      dropped: { segmentColor: "#f87171" },
    });
  });

  it("defines every status for every palette", () => {
    for (const palette of Object.values(CHART_PALETTE_REGISTRY)) {
      expect(Object.keys(palette.statuses)).toEqual(STATUS_KEYS);
      for (const key of STATUS_KEYS) {
        expect(palette.statuses[key].segmentColor).toBeTruthy();
        expect(palette.statuses[key].rowActiveSurface).toBeTruthy();
        expect(palette.statuses[key].textTone).toBeTruthy();
        expect(palette.statuses[key].dotTone).toBeTruthy();
      }
    }
  });

  it("uses a safe neutral completed color when world-aware input is absent", () => {
    expect(resolveChartStatusPresentation("world_aware", "completed").segmentColor).toBe(WORLD_THEME_REGISTRY.neutral.chartPrimary);
  });

  it("uses the selected world completed color when requested", () => {
    expect(resolveChartStatusPresentation("world_aware", "completed", "screen").segmentColor).toBe(WORLD_THEME_REGISTRY.screen.chartPrimary);
  });

  it("can keep completed inside the selected palette when world following is disabled", () => {
    expect(resolveChartStatusPresentation("world_aware", "completed", "screen", false).segmentColor)
      .toBe(CHART_PALETTE_REGISTRY.world_aware.statuses.completed.segmentColor);
  });
});
