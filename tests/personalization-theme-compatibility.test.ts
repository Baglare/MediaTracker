import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BASE_THEME_REGISTRY } from "@/lib/personalization/theme-registry";

const css = readFileSync("app/globals.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const runtime = readFileSync("components/personalization/appearance-runtime.tsx", "utf8");
const settings = readFileSync("components/personalization/appearance-settings-card.tsx", "utf8");
const appPage = readFileSync("app/page.tsx", "utf8");
const socialShell = readFileSync("components/social/social-page-shell.tsx", "utf8");
const appShell = readFileSync("components/app-shell/app-shell.tsx", "utf8");

const REQUIRED_CSS_TOKENS = [
  "--app-bg",
  "--app-surface-1",
  "--app-surface-2",
  "--app-surface-3",
  "--app-surface-elevated",
  "--app-text-primary",
  "--app-text-secondary",
  "--app-text-muted",
  "--app-border",
  "--app-border-strong",
  "--app-shadow",
  "--app-overlay",
  "--app-focus",
  "--app-accent",
  "--app-accent-strong",
  "--app-accent-soft",
] as const;

function themeBlock(theme: "obsidian" | "porcelain" | "ocean"): string {
  const match = css.match(new RegExp(`\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`, "m"));
  return match?.[1] ?? "";
}

describe("theme registry and CSS compatibility", () => {
  it.each(["obsidian", "porcelain", "ocean"] as const)("defines every required token for %s", (theme) => {
    const block = themeBlock(theme);
    for (const token of REQUIRED_CSS_TOKENS) expect(block).toContain(`${token}:`);
    expect(BASE_THEME_REGISTRY[theme]).toHaveProperty("tokens");
  });

  it("declares correct color schemes", () => {
    expect(BASE_THEME_REGISTRY.obsidian.colorScheme).toBe("dark");
    expect(BASE_THEME_REGISTRY.ocean.colorScheme).toBe("dark");
    expect(BASE_THEME_REGISTRY.porcelain.colorScheme).toBe("light");
  });

  it("keeps CSS source-of-truth preview values aligned with the registry", () => {
    for (const theme of ["obsidian", "porcelain", "ocean"] as const) {
      const block = themeBlock(theme);
      const tokens = BASE_THEME_REGISTRY[theme].tokens;
      expect(block).toContain(`--app-bg: ${tokens.background}`);
      expect(block).toContain(`--app-surface-1: ${tokens.surface1}`);
      expect(block).toContain(`--app-text-primary: ${tokens.textPrimary}`);
      expect(block).toContain(`--app-accent: ${tokens.accent}`);
    }
  });

  it("uses semantic tokens for body and primary app shells", () => {
    expect(css).toMatch(/body\s*\{[\s\S]*background-color: var\(--app-bg\)/);
    expect(layout).toContain("<RouteAppShell>{children}</RouteAppShell>");
    expect(appShell).toContain("app-page min-h-screen");
    expect(socialShell).not.toContain("min-h-screen");
    expect(css).toContain("--color-zinc-950: var(--app-bg)");
  });

  it("writes validated root attributes from the server and client runtime", () => {
    for (const attribute of ["data-theme", "data-base-theme", "data-accent-mode", "data-resolved-accent"]) {
      expect(layout).toContain(attribute);
    }
    expect(runtime).toContain("applyRootAppearanceAttributes");
    expect(runtime).toContain("subscribeToSystemTheme");
  });

  it("does not introduce obvious light-on-light shared shell combinations", () => {
    expect(`${appPage}\n${appShell}\n${socialShell}`).not.toMatch(/bg-white[^\n]*text-white/);
  });
});

describe("P1 separation contract", () => {
  it("keeps cloud, profile presentation, chart and relationship concerns out of appearance runtime", () => {
    const combined = `${runtime}\n${settings}`;
    expect(combined).not.toMatch(/supabase|connectionColor|ProfilePresentation|ChartPalette/);
  });

  it("does not expose density or effects controls", () => {
    expect(settings).not.toMatch(/updatePreference\("density"|updatePreference\("effectsLevel"/);
  });
});
