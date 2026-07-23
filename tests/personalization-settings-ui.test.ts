import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  APPEARANCE_ACCENT_OPTIONS,
  APPEARANCE_THEME_OPTIONS,
} from "@/components/personalization/appearance-settings-card";
import { resolveAppearanceTheme } from "@/lib/personalization/resolve-appearance";
import { resolveThemeAccent } from "@/components/theme-accent";

const settingsSource = readFileSync("components/personalization/appearance-settings-card.tsx", "utf8");

describe("appearance settings view model", () => {
  it("shows exactly four active theme choices", () => {
    expect(APPEARANCE_THEME_OPTIONS.map((option) => option.id)).toEqual(["system", "obsidian", "porcelain", "ocean"]);
  });

  it("shows exactly six world accent choices", () => {
    expect(APPEARANCE_ACCENT_OPTIONS.map((option) => option.id)).toEqual(["auto", "theme", "east", "screen", "arch", "neutral"]);
  });

  it("uses accessible selected state and a single instant-save reset model", () => {
    expect(settingsSource).toContain("aria-pressed={selected}");
    expect(settingsSource).toContain("resetToDefaults");
    expect(settingsSource).toContain("Varsayılana dön");
    expect(settingsSource).not.toContain("Uygula");
    expect(settingsSource).not.toContain("Vazgeç");
  });

  it("exposes chart, density and effects while keeping profile presentation controls separate", () => {
    expect(settingsSource).toMatch(/Grafik renkleri|Görünüm yoğunluğu|Görsel efektler/);
    expect(settingsSource).not.toMatch(/Avatar frame|Banner style/);
  });
});

describe("accent and content-world separation", () => {
  it("resolves fixed screen accent independently from active East world", () => {
    const appearance = resolveAppearanceTheme({ baseTheme: "obsidian", accentMode: "screen", activeWorld: "east", prefersDark: true });
    const contentAccent = resolveThemeAccent({ type: "anime" });
    expect(appearance.resolvedAccent).toBe("screen");
    expect(contentAccent.theme).toBe("east");
    expect(contentAccent.family).toBe("anime");
  });
});
