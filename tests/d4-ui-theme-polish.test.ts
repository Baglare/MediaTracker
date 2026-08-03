import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveMediaBadgeLabels } from "@/components/theme-accent";
import { selectUpcomingReleaseSummary } from "@/features/calendar/components/upcoming-release-summary";
import { contrastRatio, relativeLuminance } from "@/lib/personalization/color-utils";
import { CHART_PALETTE_REGISTRY } from "@/lib/personalization/chart-palette-registry";
import { getBaseThemeDefinition, PRESET_THEME_INPUTS } from "@/lib/personalization/theme-registry";
import type { MediaItem } from "@/lib/types";

const read = (path: string) => readFileSync(path, "utf8");

describe("D4-2 collapsible section contract", () => {
  const primitive = read("components/ui/collapsible-section.tsx");
  const settings = read("features/settings/components/settings-feature.tsx");

  it("uses one keyboard-accessible primitive with session state", () => {
    expect(primitive).toContain('type="button"');
    expect(primitive).toContain("aria-expanded={open}");
    expect(primitive).toContain("aria-controls={contentId}");
    expect(primitive).toContain("window.sessionStorage");
    expect(primitive).toContain("defaultOpen || alert");
  });

  it("keeps rare settings closed and primary account/cloud surfaces visible", () => {
    for (const key of ["layout-presets", "startup-preferences", "advanced-cloud-data"]) {
      expect(settings).toContain(`storageKey="${key}"`);
    }
    expect(settings).toContain("<AuthPanel />");
    expect(settings).toContain("<CloudSyncStatusCard");
    expect(settings).not.toMatch(/<CollapsibleSection[\s\S]{0,180}<AuthPanel/);
  });
});

describe("D4-2 card title and badge taxonomy", () => {
  const card = read("components/media-card.tsx");
  const group = read("components/series-group-card.tsx");
  const library = read("features/library/components/library-feature.tsx");

  it("reserves two title lines without hover dependence", () => {
    expect(card).toContain("line-clamp-2 min-h-[2.25rem] min-w-0 break-words");
    expect(card).not.toContain("hover:max-w-[26rem]");
    expect(group).toContain("line-clamp-2");
    expect(library).toContain("2xl:grid-cols-3");
    expect(library).not.toMatch(/(^|[^2])xl:grid-cols-3/);
  });

  it("shows informative structured subtypes and hides redundant or invented ones", () => {
    expect(resolveMediaBadgeLabels({ type: "anime", format: "ONA" })).toEqual({ main: "Anime", subType: "ONA" });
    expect(resolveMediaBadgeLabels({ type: "manhwa" })).toEqual({ main: "Manga", subType: "Manhwa" });
    expect(resolveMediaBadgeLabels({ type: "movie", subType: "movie" })).toEqual({ main: "Film", subType: null });
    expect(resolveMediaBadgeLabels({ type: "book", subType: "book" })).toEqual({ main: "Kitap", subType: null });
    expect(resolveMediaBadgeLabels({ type: "anime", title: "OVA gibi görünen bir başlık" })).toEqual({ main: "Anime", subType: null });
  });
});

describe("D4-2 light theme identity and contrast", () => {
  const ids = ["porcelain", "dusty_rose", "lavender", "polar", "sepia"] as const;

  it("keeps each light preset's real surfaces distinct", () => {
    const backgrounds = ids.map((id) => getBaseThemeDefinition(id).tokens.background);
    expect(new Set(backgrounds).size).toBe(ids.length);
    for (const id of ids) {
      const tokens = getBaseThemeDefinition(id).tokens;
      expect(new Set([tokens.background, tokens.surface1, tokens.surface2, tokens.surface3]).size).toBe(4);
      expect(Math.abs(relativeLuminance(tokens.surface1) - relativeLuminance(tokens.surface2))).toBeGreaterThan(0.04);
    }
  });

  it("meets AA text and semantic status contrast on primary surfaces", () => {
    for (const id of ids) {
      const tokens = getBaseThemeDefinition(id).tokens;
      expect(contrastRatio(tokens.textPrimary, tokens.background), `${id} primary/background`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.textSecondary, tokens.surface1), `${id} secondary/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.textMuted, tokens.surface1), `${id} muted/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.danger, tokens.surface1), `${id} danger/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.success, tokens.surface1), `${id} success/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.warning, tokens.surface1), `${id} warning/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.focus, tokens.surface1), `${id} focus/surface`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(tokens.borderStrong, tokens.surface1), `${id} border/surface`).toBeGreaterThanOrEqual(3);
    }
  });

  it("copies updated preset inputs without migrating existing custom themes", () => {
    expect(PRESET_THEME_INPUTS.porcelain).toMatchObject({ background: "#F1EEE6", surface: "#FBFAF6", accent: "#245FA8" });
    expect(read("components/personalization/theme-studio.tsx")).toContain("inputs: { ...PRESET_THEME_INPUTS[resolvedId] }");
    expect(read("lib/personalization/custom-themes.ts")).not.toContain("PRESET_THEME_INPUTS");
  });
});

describe("D4-2 logo and chart accessibility", () => {
  it("uses a theme-token mask in every shell consumer", () => {
    const css = read("app/globals.css");
    const consumers = ["components/app-topbar.tsx", "components/app-sidebar.tsx", "components/app-shell/app-shell.tsx"];
    expect(css).toContain('mask: url("/brand/media-tracker-mark.svg")');
    expect(css).toContain("var(--app-logo-color, var(--app-text-primary))");
    for (const path of consumers) expect(read(path)).toContain("<BrandMark");
  });

  it("uses unique, evenly separated monochrome steps and matching dot colors", () => {
    const statuses = Object.values(CHART_PALETTE_REGISTRY.monochrome.statuses);
    expect(new Set(statuses.map((status) => status.segmentColor)).size).toBe(5);
    expect(statuses.every((status) => status.dotTone === status.segmentColor)).toBe(true);
    const percentages = statuses.map((status) => Number(status.segmentColor.match(/(\d+)%/)?.[1]));
    for (let index = 1; index < percentages.length; index += 1) {
      expect(percentages[index - 1] - percentages[index]).toBeGreaterThanOrEqual(18);
    }
    expect(read("components/right-rail.tsx")).toContain("const GAP = total > 1 ? 2.4 : 0");
  });
});

describe("D4-2 upcoming and world metric summaries", () => {
  function media(id: string, status: MediaItem["status"]): MediaItem {
    return { id, title: `Medya ${id}`, type: "tv", status, coverImage: "", currentProgress: 0, totalProgress: 12 } as MediaItem;
  }
  function view(id: string, date: string, status: MediaItem["status"] = "watching") {
    return {
      media: media(id, status), stale: false, fetchedAt: "2026-08-03T00:00:00.000Z",
      event: {
        schemaVersion: 1 as const, id, mediaRecordId: id, type: "manual" as const, title: `Olay ${id}`,
        date: { precision: "date_only" as const, date },
        origin: { kind: "manual" as const, persistence: "persistent_user_data" as const },
        episodeNumber: 2,
      },
    };
  }

  it("shows at most three visible active events with relative dates", () => {
    const summary = selectUpcomingReleaseSummary({
      today: "2026-08-03", timeZone: "Europe/Istanbul",
      agenda: {
        today: [view("today", "2026-08-03")],
        next7Days: [view("tomorrow", "2026-08-04"), view("done", "2026-08-05", "completed")],
        next30Days: [view("later", "2026-08-10"), view("fourth", "2026-08-11")],
        later: [], tba: [],
      },
    });
    expect(summary).toHaveLength(3);
    expect(summary.map((item) => item.relativeDate)).toEqual(["Bugün", "Yarın", "7 gün sonra"]);
    expect(summary.some((item) => item.id === "done")).toBe(false);
  });

  it("reuses one owner-scoped hook and labels world metric sources honestly", () => {
    const app = read("app/page.tsx");
    expect(app.match(/useReleaseCalendar\(/g)).toHaveLength(1);
    expect(read("features/calendar/components/calendar-feature.tsx")).not.toContain("useReleaseCalendar({");
    const worldMetric = read("components/profile/profile-progression-summary.tsx");
    expect(worldMetric).toContain("Dünya XP dağılımı");
    expect(worldMetric).toContain("Kütüphane dünya dağılımı");
    expect(worldMetric).toContain('"unknown"');
  });
});
