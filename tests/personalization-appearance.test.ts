import { describe, expect, it } from "vitest";

import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  readAppearancePreferences,
  resetStoredAppearancePreferences,
  writeAppearancePreferences,
  type AppearancePreferencesStorage,
} from "@/hooks/use-appearance-preferences";
import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "@/lib/personalization/defaults";
import { resolveAppearanceTheme } from "@/lib/personalization/resolve-appearance";
import { BASE_THEME_REGISTRY } from "@/lib/personalization/theme-registry";
import { normalizeAppearancePreferences } from "@/lib/personalization/validation";

function memoryStorage(initial?: string): AppearancePreferencesStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(APPEARANCE_PREFERENCES_STORAGE_KEY, initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("appearance preferences", () => {
  it("defaults to the current Obsidian appearance", () => {
    expect(DEFAULT_APP_APPEARANCE_PREFERENCES).toEqual({
      version: 1,
      baseTheme: "obsidian",
      accentMode: "auto",
      effectsLevel: "subtle",
      density: "comfortable",
    });
  });

  it("falls back safely for malformed storage", () => {
    expect(readAppearancePreferences(memoryStorage("{broken"))).toEqual(DEFAULT_APP_APPEARANCE_PREFERENCES);
  });

  it("falls back for an unknown preference version", () => {
    expect(normalizeAppearancePreferences({ version: 2, baseTheme: "ocean" })).toEqual(DEFAULT_APP_APPEARANCE_PREFERENCES);
  });

  it("normalizes a partial preference object field by field", () => {
    expect(normalizeAppearancePreferences({ version: 1, baseTheme: "ocean", density: "compact", accentMode: "invalid" })).toEqual({
      ...DEFAULT_APP_APPEARANCE_PREFERENCES,
      baseTheme: "ocean",
      density: "compact",
    });
  });

  it("writes only the normalized preference contract", () => {
    const storage = memoryStorage();
    writeAppearancePreferences(storage, { version: 1, baseTheme: "porcelain", extra: "ignored" });
    expect(JSON.parse(storage.values.get(APPEARANCE_PREFERENCES_STORAGE_KEY) ?? "null")).toEqual({
      ...DEFAULT_APP_APPEARANCE_PREFERENCES,
      baseTheme: "porcelain",
    });
  });

  it("resets persisted state to defaults", () => {
    const storage = memoryStorage(JSON.stringify({ version: 1, baseTheme: "ocean" }));
    expect(resetStoredAppearancePreferences(storage)).toEqual(DEFAULT_APP_APPEARANCE_PREFERENCES);
    expect(storage.values.has(APPEARANCE_PREFERENCES_STORAGE_KEY)).toBe(false);
  });

  it("registers Porcelain and Ocean without activating them", () => {
    expect(BASE_THEME_REGISTRY.porcelain).toMatchObject({ id: "porcelain", colorScheme: "light" });
    expect(BASE_THEME_REGISTRY.ocean).toMatchObject({ id: "ocean", colorScheme: "dark" });
    expect(DEFAULT_APP_APPEARANCE_PREFERENCES.baseTheme).toBe("obsidian");
  });
});

describe("appearance resolution", () => {
  it("resolves the system theme from prefers-color-scheme", () => {
    expect(resolveAppearanceTheme({ baseTheme: "system", prefersDark: true }).resolvedBaseTheme).toBe("obsidian");
    expect(resolveAppearanceTheme({ baseTheme: "system", prefersDark: false }).resolvedBaseTheme).toBe("porcelain");
  });

  it.each([
    ["east", "east"],
    ["screen", "screen"],
    ["arch", "arch"],
    [undefined, "neutral"],
  ] as const)("resolves auto + %s to %s", (activeWorld, expected) => {
    expect(resolveAppearanceTheme({ baseTheme: "obsidian", accentMode: "auto", activeWorld }).resolvedAccent).toBe(expected);
  });

  it.each([
    ["east", "east"],
    ["screen", "screen"],
    ["arch", "arch"],
    ["neutral", "neutral"],
    ["theme", "theme"],
  ] as const)("keeps fixed %s accent independent of the active world", (accentMode, expected) => {
    expect(resolveAppearanceTheme({ baseTheme: "ocean", accentMode, activeWorld: "east" }).resolvedAccent).toBe(expected);
  });

  it("falls back safely for unknown resolver input", () => {
    const resolved = resolveAppearanceTheme({ baseTheme: "unknown", accentMode: "unknown", activeWorld: "unknown" });
    expect(resolved.resolvedBaseTheme).toBe("obsidian");
    expect(resolved.resolvedAccent).toBe("neutral");
  });
});
