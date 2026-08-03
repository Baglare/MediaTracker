import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { contrastRatio, relativeLuminance } from "@/lib/personalization/color-utils";
import { getBaseThemeDefinition, PRESET_THEME_INPUTS } from "@/lib/personalization/theme-registry";

const read = (path: string) => readFileSync(path, "utf8");
const LIGHT_IDS = ["porcelain", "dusty_rose", "lavender", "polar", "sepia"] as const;

describe("D4-3 card stabilization", () => {
  it("keeps two lines by default and expands the real title area on hover", () => {
    const card = read("components/media-card.tsx");
    const group = read("components/series-group-card.tsx");
    const css = read("app/globals.css");
    expect(card).toContain("expandable-title-card");
    expect(card).toContain("expandable-card-title min-h-[2.25rem]");
    expect(card).not.toContain("title={item.title}");
    expect(group).toContain("expandable-card-title");
    expect(css).toContain("-webkit-line-clamp: 2");
    expect(css).toContain(".expandable-title-card:hover .expandable-card-title");
    expect(css).toContain("-webkit-line-clamp: 6");
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
  });

  it("uses semantic high-contrast subtype chips instead of world ink", () => {
    const badges = read("components/theme-accent.tsx");
    expect(badges).toContain("var(--app-surface-elevated)");
    expect(badges).toContain("var(--app-text-primary)");
    expect(badges).toContain("var(--app-border-strong)");
    expect(badges).not.toMatch(/MediaClassificationBadges[\s\S]{0,1800}text-\[var\(--w-ink\)\]/);
  });
});

describe("D4-3 light theme identity", () => {
  it("keeps preset backgrounds and surfaces visibly distinct", () => {
    expect(PRESET_THEME_INPUTS).toMatchObject({
      porcelain: { background: "#E8E1D4", surface: "#F8F4EA" },
      dusty_rose: { background: "#DFC5CD", surface: "#F1DDE3" },
      lavender: { background: "#D4C9E7", surface: "#EDE6F5" },
      polar: { background: "#CDE1E9", surface: "#E7F2F5" },
      sepia: { background: "#E8D5B6", surface: "#F6E8D0" },
    });
    for (const id of LIGHT_IDS) {
      const tokens = getBaseThemeDefinition(id).tokens;
      expect(Math.abs(relativeLuminance(tokens.surface1) - relativeLuminance(tokens.surface2)), id).toBeGreaterThan(0.08);
      expect(tokens.panelBackground).not.toBe(tokens.cardBackground);
    }
  });

  it("preserves readable semantic text on panels and cards", () => {
    for (const id of LIGHT_IDS) {
      const tokens = getBaseThemeDefinition(id).tokens;
      expect(contrastRatio(tokens.textPrimary, tokens.cardBackground), `${id} card number`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.textSecondary, tokens.panelBackground), `${id} panel label`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.warning, tokens.panelBackground), `${id} journey warning`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses semantic dashboard and journey surfaces without changing dark presets", () => {
    const dashboard = read("components/enhanced-dashboard.tsx");
    const sidebar = read("components/app-sidebar.tsx");
    const css = read("app/globals.css");
    expect(dashboard).toContain("bg-[var(--app-card-bg)]");
    expect(dashboard).toContain("text-[var(--app-text-secondary)] font-bold");
    expect(sidebar).toContain("bg-[var(--app-card-bg)]");
    expect(sidebar).toContain("text-[var(--app-warning)]");
    expect(sidebar).toContain("Seviye {progression.level}");
    expect(css).toMatch(/\[data-theme="porcelain"\][\s\S]*?--app-logo-color: #245fa8;/);
    expect(contrastRatio("#245fa8", getBaseThemeDefinition("porcelain").tokens.background)).toBeGreaterThanOrEqual(4.5);
    expect(PRESET_THEME_INPUTS.obsidian.background).toBe("#09090B");
    expect(PRESET_THEME_INPUTS.ocean.background).toBe("#06111F");
    expect(PRESET_THEME_INPUTS.forest.background).toBe("#10231C");
  });
});

describe("D4-3 personalization density", () => {
  it("collapses secondary appearance and theme tools through the shared primitive", () => {
    const appearance = read("components/personalization/appearance-settings-card.tsx");
    const studio = read("components/personalization/theme-studio.tsx");
    const transfer = read("components/personalization/theme-transfer-panel.tsx");
    const cloud = read("components/personalization/theme-cloud-sync-panel.tsx");
    for (const key of ["appearance-world-accent", "appearance-chart-colors", "appearance-density-effects"]) {
      expect(appearance).toContain(`storageKey="${key}"`);
    }
    expect(studio).toContain('storageKey="theme-ready-presets"');
    expect(studio).toContain('storageKey="theme-custom-library"');
    expect(transfer).toContain('storageKey="theme-transfer-tools"');
    expect(cloud).toContain('storageKey="theme-cloud-sync"');
    expect(cloud).toContain('alert={sync.status === "conflict" || sync.status === "error"}');
  });

  it("retains keyboard, focus, session and reduced-motion contracts", () => {
    const primitive = read("components/ui/collapsible-section.tsx");
    expect(primitive).toContain('type="button"');
    expect(primitive).toContain("aria-expanded={open}");
    expect(primitive).toContain("aria-controls={contentId}");
    expect(primitive).toContain("window.sessionStorage");
    expect(primitive).toContain("focus-visible:ring-2");
    expect(primitive).toContain("motion-reduce:transition-none");
  });
});

describe("D4-3 local world metric labels", () => {
  it("names the media-count source and renders an explicit unit", () => {
    const dashboard = read("components/enhanced-dashboard.tsx");
    const rail = read("components/right-rail.tsx");
    expect(dashboard).toContain('title="Kütüphane dünya dağılımı"');
    expect(dashboard).toContain('hint="Medya adedi"');
    expect(dashboard).toContain('valueUnit="medya"');
    expect(rail).toContain('title="Kütüphane dünya dağılımı"');
    expect(rail).toContain('valueUnit="medya"');
  });
});
