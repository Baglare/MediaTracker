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

describe("appearance cookie mirror", () => {
  it.each([
    ["obsidian.obsidian.auto", { baseTheme: "obsidian", resolvedTheme: "obsidian", accentMode: "auto" }],
    ["porcelain.porcelain.theme", { baseTheme: "porcelain", resolvedTheme: "porcelain", accentMode: "theme" }],
    ["ocean.ocean.screen", { baseTheme: "ocean", resolvedTheme: "ocean", accentMode: "screen" }],
    ["system.porcelain.neutral", { baseTheme: "system", resolvedTheme: "porcelain", accentMode: "neutral" }],
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
    expect(serializeAppearanceCookie({ baseTheme: "system", resolvedTheme: "obsidian", accentMode: "east" })).toBe("system.obsidian.east");
    expect(appearanceCookieDocumentValue({ baseTheme: "ocean", resolvedTheme: "ocean", accentMode: "theme" }, true)).toBe(
      `${APPEARANCE_COOKIE_NAME}=ocean.ocean.theme; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
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
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, baseTheme },
      "neutral",
      prefersDark,
    );
    expect(result).toMatchObject({ theme, baseTheme, colorScheme });
  });

  it("applies validated root attributes and color-scheme", () => {
    const root = { dataset: {}, style: { colorScheme: "" } };
    const attributes = resolveRootAppearanceAttributes(
      { ...DEFAULT_APP_APPEARANCE_PREFERENCES, baseTheme: "ocean", accentMode: "arch" },
      "east",
      true,
    );
    applyRootAppearanceAttributes(root, attributes);
    expect(root.dataset).toEqual({
      theme: "ocean",
      baseTheme: "ocean",
      accentMode: "arch",
      resolvedAccent: "arch",
      effects: "subtle",
      density: "comfortable",
    });
    expect(root.style.colorScheme).toBe("dark");
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
    const fallback = { ...DEFAULT_APP_APPEARANCE_PREFERENCES, baseTheme: "porcelain" as const, accentMode: "screen" as const };
    expect(readAppearancePreferences(storage, fallback)).toEqual(fallback);
    storage.values.set(APPEARANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({ ...fallback, baseTheme: "ocean" }));
    expect(readAppearancePreferences(storage, fallback).baseTheme).toBe("ocean");
  });

  it("saves appearance without deleting another preference namespace", () => {
    const storage = memoryStorage();
    storage.values.set("mediaTracker:uiPreferences", "preserve-me");
    writeAppearancePreferences(storage, { ...DEFAULT_APP_APPEARANCE_PREFERENCES, baseTheme: "ocean" });
    expect(storage.values.get("mediaTracker:uiPreferences")).toBe("preserve-me");
    expect(readAppearancePreferences(storage).baseTheme).toBe("ocean");
  });
});
