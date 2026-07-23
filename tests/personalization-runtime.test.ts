import { describe, expect, it, vi } from "vitest";

import {
  APPEARANCE_COOKIE_NAME,
  DEFAULT_APPEARANCE_COOKIE_IDENTITY,
  appearanceCookieDocumentValue,
  parseAppearanceCookie,
  serializeAppearanceCookie,
} from "@/lib/personalization/appearance-cookie";
import {
  applyRootAppearanceAttributes,
  resolveRootAppearanceAttributes,
  subscribeToSystemTheme,
  type SystemThemeMediaQuery,
} from "@/lib/personalization/appearance-runtime";
import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "@/lib/personalization/defaults";
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  readAppearancePreferences,
  writeAppearancePreferences,
  type AppearancePreferencesStorage,
} from "@/hooks/use-appearance-preferences";

function memoryStorage(): AppearancePreferencesStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function rootTarget() {
  const variables = new Map<string, string>();
  return {
    dataset: {} as Record<string, string>,
    style: {
      colorScheme: "",
      setProperty: (key: string, value: string) => { variables.set(key, value); },
      removeProperty: (key: string) => { variables.delete(key); },
    },
    variables,
  };
}

describe("appearance cookie mirror", () => {
  it.each([
    ["obsidian.obsidian.auto", { theme: { kind: "preset", id: "obsidian" }, resolvedTheme: "obsidian", accentMode: "auto" }],
    ["porcelain.porcelain.theme", { theme: { kind: "preset", id: "porcelain" }, resolvedTheme: "porcelain", accentMode: "theme" }],
    ["ocean.ocean.screen", { theme: { kind: "preset", id: "ocean" }, resolvedTheme: "ocean", accentMode: "screen" }],
    ["system.porcelain.neutral", { theme: { kind: "preset", id: "system" }, resolvedTheme: "porcelain", accentMode: "neutral" }],
  ] as const)("accepts allowlisted identity %s", (raw, expected) => {
    expect(parseAppearanceCookie(raw)).toEqual(expected);
  });

  it.each([
    "porcelain.obsidian.auto",
    "ocean.porcelain.auto",
    "system.ocean.auto",
    "custom.custom.auto",
    "obsidian.obsidian.javascript:alert(1)",
    "broken",
    "",
  ])("falls back for malformed or inconsistent cookie %s", (raw) => {
    expect(parseAppearanceCookie(raw)).toEqual(DEFAULT_APPEARANCE_COOKIE_IDENTITY);
  });

  it("serializes only the allowlisted compact identity", () => {
    expect(serializeAppearanceCookie({ theme: { kind: "preset", id: "system" }, resolvedTheme: "obsidian", accentMode: "east" })).toBe("v3.p.system.obsidian.east");
    expect(appearanceCookieDocumentValue({ theme: { kind: "preset", id: "ocean" }, resolvedTheme: "ocean", accentMode: "theme" }, true)).toBe(
      `${APPEARANCE_COOKIE_NAME}=v3.p.ocean.ocean.theme; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  });
});

describe("appearance root runtime", () => {
  it.each([
    ["obsidian", true, "obsidian", "dark"],
    ["porcelain", true, "porcelain", "light"],
    ["ocean", true, "ocean", "dark"],
    ["system", false, "porcelain", "light"],
    ["system", true, "obsidian", "dark"],
  ] as const)("applies %s with system dark=%s as %s", (baseTheme, prefersDark, theme, colorScheme) => {
    const result = resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "preset", id: baseTheme } },
      "neutral",
      prefersDark,
    );
    expect(result).toMatchObject({
      theme,
      themeSelection: { kind: "preset", id: baseTheme },
      colorScheme,
    });
  });

  it("applies validated root attributes and color-scheme", () => {
    const root = rootTarget();
    const attributes = resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "preset", id: "ocean" }, accentMode: "arch" },
      "east",
      true,
    );
    applyRootAppearanceAttributes(root, attributes);
    expect(root.dataset).toEqual({
      theme: "ocean",
      themeSource: "preset",
      themeSelection: "ocean",
      baseTheme: "ocean",
      accentMode: "arch",
      resolvedAccent: "arch",
      effects: "subtle",
      density: "comfortable",
    });
    expect(root.style.colorScheme).toBe("dark");
  });

  it("applies compact density and full effects as root presentation attributes", () => {
    const root = rootTarget();
    const attributes = resolveRootAppearanceAttributes(
      {
        ...DEFAULT_APP_APPEARANCE_PREFERENCES,
        density: "compact",
        effectsLevel: "full",
      },
      "neutral",
      true,
    );
    applyRootAppearanceAttributes(root, attributes);
    expect(root.dataset).toMatchObject({
      density: "compact",
      effects: "full",
    });
  });

  it("responds to system theme changes and removes the exact listener", () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const addEventListener = vi.fn((_type: "change", next: (event: { matches: boolean }) => void) => { listener = next; });
    const removeEventListener = vi.fn();
    const mediaQuery: SystemThemeMediaQuery = { matches: false, addEventListener, removeEventListener };
    const onChange = vi.fn();
    const cleanup = subscribeToSystemTheme(mediaQuery, onChange);
    listener?.({ matches: true });
    expect(onChange).toHaveBeenCalledWith(true);
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});

describe("localStorage and cookie reconciliation", () => {
  it("uses the cookie-derived identity only when local storage is absent", () => {
    const storage = memoryStorage();
    const fallback = { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "preset", id: "porcelain" as const }, accentMode: "screen" as const };
    expect(readAppearancePreferences(storage, fallback)).toEqual(fallback);
    storage.values.set(APPEARANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({ ...fallback, theme: { kind: "preset", id: "ocean" } }));
    expect(readAppearancePreferences(storage, fallback).theme).toEqual({ kind: "preset", id: "ocean" });
  });

  it("saves appearance without deleting another preference namespace", () => {
    const storage = memoryStorage();
    storage.values.set("mediaTracker:uiPreferences", "preserve-me");
    writeAppearancePreferences(storage, { ...DEFAULT_APP_APPEARANCE_PREFERENCES, theme: { kind: "preset", id: "ocean" } });
    expect(storage.values.get("mediaTracker:uiPreferences")).toBe("preserve-me");
    expect(readAppearancePreferences(storage).theme).toEqual({ kind: "preset", id: "ocean" });
  });
});
