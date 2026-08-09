import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseAppearanceCookie,
  serializeAppearanceCookie,
} from "@/lib/personalization/appearance-cookie";
import {
  APP_THEME_TOKEN_CSS_VARIABLES,
  applyRootAppearanceAttributes,
  resolveRootAppearanceAttributes,
  themeTokensToCssVariables,
} from "@/lib/personalization/appearance-runtime";
import {
  contrastRatio,
  hexToRgb,
  mixHexColors,
  normalizeHexColor,
  relativeLuminance,
  rgbToHex,
} from "@/lib/personalization/color-utils";
import {
  appendCustomTheme,
  createCustomThemeDefinition,
  deleteCustomTheme,
  normalizeCustomThemeCollection,
  readCustomThemes,
  updateCustomThemeDefinition,
  writeCustomThemes,
  CUSTOM_THEMES_STORAGE_KEY,
  type CustomThemesStorage,
} from "@/lib/personalization/custom-themes";
import {
  deriveCustomThemeTokens,
  evaluateThemeContrast,
  normalizeCustomThemeInputs,
} from "@/lib/personalization/custom-theme-tokens";
import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "@/lib/personalization/defaults";
import { getBaseThemeDefinition } from "@/lib/personalization/theme-registry";
import { normalizeAppearancePreferences } from "@/lib/personalization/validation";
import type { CustomThemeDefinition, CustomThemeInputs } from "@/lib/personalization/types";

const DARK_INPUTS: CustomThemeInputs = {
  colorScheme: "dark",
  background: "#101820",
  surface: "#182733",
  accent: "#2AA7A1",
  secondaryAccent: "#C38A5A",
};
const LIGHT_INPUTS: CustomThemeInputs = {
  colorScheme: "light",
  background: "#F2EEE8",
  surface: "#FAF7F2",
  accent: "#6B4E87",
  secondaryAccent: "#A65D45",
};

function memoryStorage(initial?: unknown): CustomThemesStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(CUSTOM_THEMES_STORAGE_KEY, typeof initial === "string" ? initial : JSON.stringify(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function theme(id = "ct_12345678", inputs = DARK_INPUTS): CustomThemeDefinition {
  return createCustomThemeDefinition(id, "2026-07-23T00:00:00.000Z", {
    name: "Özel Tema",
    inputs,
  });
}

describe("P6 color helpers", () => {
  it.each([
    ["abc", "#AABBCC"],
    ["#123456", "#123456"],
    [" 8a3f5d ", "#8A3F5D"],
  ])("normalizes %s to canonical HEX", (input, expected) => {
    expect(normalizeHexColor(input)).toBe(expected);
  });

  it.each(["#12", "#GGGGGG", "rgb(1,2,3)", "url(x)", "#12345678", "linear-gradient(red,blue)"])("rejects arbitrary color input %s", (input) => {
    expect(normalizeHexColor(input)).toBeNull();
  });

  it("converts RGB and HEX bidirectionally with safe bounds", () => {
    expect(rgbToHex({ r: 300, g: -4, b: 127.6 })).toBe("#FF0080");
    expect(hexToRgb("#0A80FF")).toEqual({ r: 10, g: 128, b: 255 });
  });

  it("calculates luminance, contrast and deterministic mixing", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBe(1);
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(mixHexColors("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});

describe("P6 custom token derivation and contrast", () => {
  it.each([
    [LIGHT_INPUTS, "#1C1917"],
    [DARK_INPUTS, "#F8FAFC"],
  ] as const)("derives readable light/dark token families", (inputs, primaryText) => {
    const tokens = deriveCustomThemeTokens(inputs);
    expect(tokens.textPrimary).toBe(primaryText);
    expect(tokens.surface1).toBe(inputs.surface);
    expect(tokens.surface2).not.toBe(tokens.surface1);
    expect(tokens.borderStrong).not.toBe(tokens.surface1);
    expect(tokens.focus).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("is deterministic and keeps semantic status colors separate", () => {
    const first = deriveCustomThemeTokens(DARK_INPUTS);
    const second = deriveCustomThemeTokens({ ...DARK_INPUTS });
    expect(second).toEqual(first);
    expect(first.danger).not.toBe(DARK_INPUTS.accent);
    expect(first.success).not.toBe(DARK_INPUTS.accent);
    expect(first.warning).not.toBe(DARK_INPUTS.accent);
  });

  it("rejects non-finite/arbitrary inputs and normalizes short HEX", () => {
    expect(normalizeCustomThemeInputs({ ...DARK_INPUTS, accent: "rgb(1,2,3)" })).toBeNull();
    expect(normalizeCustomThemeInputs({ ...DARK_INPUTS, accent: "#0af" })?.accent).toBe("#00AAFF");
  });

  it("reports low contrast and provides allowlisted corrections", () => {
    const tokens = deriveCustomThemeTokens({
      colorScheme: "light",
      background: "#1C1917",
      surface: "#24211F",
      accent: "#302C29",
      secondaryAccent: "#453F3A",
    });
    const report = evaluateThemeContrast(tokens);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((warning) => warning.key === "text-primary")).toBe(true);
    expect(Object.keys(report.corrections ?? {})).toEqual(expect.arrayContaining(["textPrimary"]));
  });
});

describe("P6 custom theme persistence", () => {
  it("starts empty and falls back for malformed/versioned storage", () => {
    expect(readCustomThemes(memoryStorage()).themes).toEqual([]);
    expect(readCustomThemes(memoryStorage("{broken")).themes).toEqual([]);
    expect(readCustomThemes(memoryStorage({ version: 99, themes: [theme()] })).themes).toEqual([]);
  });

  it("creates, updates, renames and deletes without changing the stable id", () => {
    const created = theme();
    const collection = appendCustomTheme({ version: 1, themes: [] }, created);
    const updated = updateCustomThemeDefinition(created, "2026-07-23T01:00:00.000Z", {
      name: "Yeni ad",
      inputs: LIGHT_INPUTS,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Yeni ad");
    expect(deleteCustomTheme({ version: 1, themes: [updated] }, created.id).themes).toEqual([]);
    expect(collection.themes).toHaveLength(1);
  });

  it("deduplicates ids, drops unknown records and enforces the 20 theme limit", () => {
    const themes = Array.from({ length: 22 }, (_, index) => theme(`ct_${String(index).padStart(8, "0")}`));
    const normalized = normalizeCustomThemeCollection({ version: 1, themes: [themes[0], themes[0], ...themes.slice(1), { nope: true }] });
    expect(normalized.themes).toHaveLength(20);
    expect(new Set(normalized.themes.map((item) => item.id)).size).toBe(20);
  });

  it("writes only its namespace and preserves other preferences", () => {
    const storage = memoryStorage();
    storage.values.set("mediaTracker:appearancePreferences:v3", "preserve");
    writeCustomThemes(storage, { version: 1, themes: [theme()] });
    expect(storage.values.get("mediaTracker:appearancePreferences:v3")).toBe("preserve");
    expect(readCustomThemes(storage).themes).toHaveLength(1);
  });

  it("rejects invalid ids, names and input payloads", () => {
    expect(() => createCustomThemeDefinition("user supplied", "2026-07-23T00:00:00.000Z", { name: "", inputs: DARK_INPUTS })).toThrow("invalid_custom_theme");
  });
});

describe("P6 appearance migration and presets", () => {
  it("migrates v2 preset selection without losing P5B fields", () => {
    expect(normalizeAppearancePreferences({
      version: 2,
      baseTheme: "ocean",
      accentMode: "screen",
      density: "compact",
      effectsLevel: "off",
      chartPaletteId: "pastel",
      followWorldCompletedColor: false,
    })).toEqual({
      version: 3,
      theme: { kind: "preset", id: "ocean" },
      accentMode: "screen",
      density: "compact",
      effectsLevel: "off",
      chartPaletteId: "pastel",
      followWorldCompletedColor: false,
    });
  });

  it("normalizes preset/custom selections and falls back for missing or malformed ids", () => {
    expect(normalizeAppearancePreferences({ ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "preset", id: "forest" } }).theme)
      .toEqual({ kind: "preset", id: "forest" });
    expect(normalizeAppearancePreferences({ ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "custom", id: "ct_12345678" } }).theme)
      .toEqual({ kind: "custom", id: "ct_12345678" });
    expect(normalizeAppearancePreferences({ ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "custom", id: "bad" } }).theme)
      .toEqual({ kind: "preset", id: "obsidian" });
  });

  it.each([
    ["dusty_rose", "light"],
    ["forest", "dark"],
    ["lavender", "light"],
    ["polar", "light"],
    ["sepia", "light"],
  ] as const)("registers %s with complete metadata and %s scheme", (id, scheme) => {
    const definition = getBaseThemeDefinition(id);
    expect(definition.colorScheme).toBe(scheme);
    expect(definition.label.length).toBeGreaterThan(0);
    expect(definition.tokens).toEqual(expect.objectContaining({
      background: expect.any(String),
      surface1: expect.any(String),
      textPrimary: expect.any(String),
      accent: expect.any(String),
      secondaryAccent: expect.any(String),
    }));
  });
});

describe("P6 runtime and first paint contract", () => {
  it("round-trips a compact, allowlisted custom cookie snapshot", () => {
    const raw = serializeAppearanceCookie({
      theme: { kind: "custom", id: "ct_12345678" },
      resolvedTheme: "custom",
      accentMode: "theme",
      customTheme: { id: "ct_12345678", inputs: { ...DARK_INPUTS, textColorMode: "auto" } },
    });
    expect(raw.length).toBeLessThan(300);
    expect(parseAppearanceCookie(raw)).toEqual({
      theme: { kind: "custom", id: "ct_12345678" },
      resolvedTheme: "custom",
      accentMode: "theme",
      customTheme: { id: "ct_12345678", inputs: { ...DARK_INPUTS, textColorMode: "auto" } },
    });
  });

  it("rejects invalid custom cookie values and falls back safely", () => {
    expect(parseAppearanceCookie("v3.c.bad.dark.javascript:alert(1).ffffff.ffffff.ffffff.auto.-_-_-_-_-"))
      .toMatchObject({ theme: { kind: "preset", id: "obsidian" } });
  });

  it("applies custom root attributes and only known semantic variables", () => {
    const custom = theme();
    const attributes = resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "custom", id: custom.id } },
      "neutral",
      true,
      custom,
    );
    const variables = new Map<string, string>();
    const root = {
      dataset: {} as Record<string, string>,
      style: {
        colorScheme: "",
        setProperty: (key: string, value: string) => { variables.set(key, value); },
        removeProperty: (key: string) => { variables.delete(key); },
      },
    };
    applyRootAppearanceAttributes(root, attributes);
    expect(root.dataset).toMatchObject({ theme: "custom", themeSource: "custom", customThemeId: custom.id });
    expect([...variables.keys()].sort()).toEqual(Object.values(APP_THEME_TOKEN_CSS_VARIABLES).sort());
    expect(themeTokensToCssVariables(attributes.inlineTokens)["--app-bg"]).toBe(DARK_INPUTS.background);
  });

  it("cleans inline variables when returning to a preset", () => {
    const custom = theme();
    const variables = new Map<string, string>();
    const root = {
      dataset: {} as Record<string, string>,
      style: {
        colorScheme: "",
        setProperty: (key: string, value: string) => { variables.set(key, value); },
        removeProperty: (key: string) => { variables.delete(key); },
      },
    };
    applyRootAppearanceAttributes(root, resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "custom", id: custom.id } },
      "neutral", true, custom,
    ));
    applyRootAppearanceAttributes(root, resolveRootAppearanceAttributes(
      DEFAULT_APP_APPEARANCE_PREFERENCES, "neutral", true,
    ));
    expect(variables.size).toBe(0);
    expect(root.dataset.customThemeId).toBeUndefined();
  });

  it("keeps custom base surfaces while resolving theme/fixed world accents", () => {
    const custom = theme();
    const themeAccent = resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "custom", id: custom.id }, accentMode: "theme" },
      "east", true, custom,
    );
    const fixedWorld = resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "custom", id: custom.id }, accentMode: "arch" },
      "east", true, custom,
    );
    expect(themeAccent.inlineTokens?.background).toBe(DARK_INPUTS.background);
    expect(themeAccent.inlineTokens?.accent).toBe(DARK_INPUTS.accent);
    expect(fixedWorld.inlineTokens?.background).toBe(DARK_INPUTS.background);
    expect(fixedWorld.inlineTokens?.accent).not.toBe(DARK_INPUTS.accent);
  });

  it("falls back to Obsidian when a selected custom theme is unavailable", () => {
    const attributes = resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "custom", id: "ct_missing00" } },
      "neutral", true,
    );
    expect(attributes).toMatchObject({
      theme: "obsidian",
      themeSource: "preset",
      themeSelection: { kind: "preset", id: "obsidian" },
    });
  });
});

describe("P6 Theme Studio separation contracts", () => {
  const studio = readFileSync("components/personalization/theme-studio.tsx", "utf8");
  const colorField = readFileSync("components/personalization/color-field.tsx", "utf8");
  const customTypes = readFileSync("lib/personalization/types.ts", "utf8");
  const runtime = readFileSync("components/personalization/appearance-runtime.tsx", "utf8");

  it("contains registry-driven preset/custom controls and RGB/HEX synchronization", () => {
    expect(studio).toContain("Object.values(BASE_THEME_REGISTRY)");
    expect(studio).toMatch(/Kaydet ve uygula|Yalnız kaydet|Uygulamada geçici önizle/);
    expect(studio).toMatch(/Düzenle \/ yeniden adlandır|Kopyala|Sil/);
    expect(colorField).toMatch(/type="color"|type="number"|HEX/);
    expect(colorField).toContain("COLOR_CATALOG");
  });

  it("does not add raw CSS, network, chart/profile palette or connection color to custom theme data", () => {
    expect(customTypes).not.toMatch(/interface CustomThemeInputs[\s\S]*?(rawCss|chartPalette|profilePalette|connectionColor)/);
    expect(`${studio}\n${runtime}`).not.toMatch(/\bfetch\(|supabase|connectionColor/);
  });
});
