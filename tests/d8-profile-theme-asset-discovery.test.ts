import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseServerClientMock = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: getSupabaseServerClientMock }));

import { deriveCustomThemeTokens, evaluateThemeContrast } from "@/lib/personalization/custom-theme-tokens";
import { normalizeCustomThemeDefinition } from "@/lib/personalization/custom-themes";
import { buildPublicProfileThemeSnapshot, decodePublicProfileThemeSnapshot, publicProfileThemeStyle } from "@/lib/personalization/public-profile-theme";
import { BASE_THEME_REGISTRY } from "@/lib/personalization/theme-registry";
import { parseAppearanceCookie, serializeAppearanceCookie } from "@/lib/personalization/appearance-cookie";
import { createThemeBundle, parseThemeBundleText } from "@/lib/personalization/theme-bundle";
import { normalizeCanonicalThemeSyncPayload } from "@/lib/personalization/theme-cloud-sync";
import { normalizeSearchResultDescription, SEARCH_RESULT_DESCRIPTION_MAX_CHARS } from "@/lib/search-result-description";
import { invalidateOwnProfileCache, loadOwnProfileCache, readOwnProfileCache, resetOwnProfileCacheForTests } from "@/lib/social/own-profile-cache";
import { createSignedSocialAssetUrl, resetSignedSocialAssetUrlCacheForTests } from "@/lib/social/server";

const customV1 = {
  version: 1 as const,
  id: "ct_12345678",
  name: "Legacy",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
  inputs: { colorScheme: "dark" as const, background: "#09090b", surface: "#18181b", accent: "#8b5cf6", secondaryAccent: "#f59e0b" },
};

function sessionStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear(), key: () => null, get length() { return values.size; } };
}

describe("D8-2 public profile theme privacy and contrast", () => {
  it("defaults legacy themes to v2 auto text mode without publishing by default", () => {
    const migrated = normalizeCustomThemeDefinition(customV1);
    expect(migrated).toMatchObject({ version: 2, inputs: { textColorMode: "auto" } });
    expect(buildPublicProfileThemeSnapshot({ visibility: "hidden" })).toBeUndefined();
  });

  it("builds allowlisted preset/custom snapshots without private theme IDs", () => {
    const preset = buildPublicProfileThemeSnapshot({ visibility: "preset_only", publicPreset: "porcelain" });
    const custom = buildPublicProfileThemeSnapshot({ visibility: "current_theme", currentTheme: { kind: "custom", theme: normalizeCustomThemeDefinition(customV1)! } });
    expect(preset?.source).toBe("preset");
    expect(custom?.source).toBe("custom");
    expect(JSON.stringify(custom)).not.toContain("ct_12345678");
    expect(Object.keys(custom?.tokens ?? {})).toHaveLength(21);
  });

  it("rejects malformed, extra, url/var and low-contrast public snapshots", () => {
    const valid = buildPublicProfileThemeSnapshot({ visibility: "preset_only", publicPreset: "obsidian" })!;
    expect(decodePublicProfileThemeSnapshot({ ...valid, rawCss: "x" })).toBeUndefined();
    expect(decodePublicProfileThemeSnapshot({ ...valid, tokens: { ...valid.tokens, accent: "url(https://bad)" } })).toBeUndefined();
    expect(decodePublicProfileThemeSnapshot({ ...valid, tokens: { ...valid.tokens, accent: "var(--secret)" } })).toBeUndefined();
    const low = { ...valid, tokens: { ...valid.tokens, textPrimary: valid.tokens.background, textSecondary: valid.tokens.background } };
    expect(decodePublicProfileThemeSnapshot(low)).toBeUndefined();
  });

  it("keeps every preset critically valid and custom text colors round-trip", () => {
    const failures = Object.values(BASE_THEME_REGISTRY).flatMap((theme) => theme.colorScheme !== "system" && !evaluateThemeContrast(theme.tokens).valid ? [{ id: theme.id, warnings: evaluateThemeContrast(theme.tokens).warnings }] : []);
    expect(failures).toEqual([]);
    const custom = normalizeCustomThemeDefinition({ ...customV1, version: 2, inputs: { ...customV1.inputs, textColorMode: "custom", textPrimary: "#ffffff", textSecondary: "#e2e8f0", textMuted: "#a8b2c1" } });
    expect(custom?.inputs).toMatchObject({ textColorMode: "custom", textPrimary: "#FFFFFF", textSecondary: "#E2E8F0", textMuted: "#A8B2C1" });
    expect(evaluateThemeContrast(deriveCustomThemeTokens(custom!.inputs)).valid).toBe(true);
    const cookie = parseAppearanceCookie(serializeAppearanceCookie({ theme: { kind: "custom", id: custom!.id }, resolvedTheme: "custom", accentMode: "theme", customTheme: { id: custom!.id, inputs: custom!.inputs } }));
    expect(cookie.customTheme?.inputs).toMatchObject({ textColorMode: "custom", textPrimary: "#FFFFFF", textSecondary: "#E2E8F0", textMuted: "#A8B2C1" });
    const bundle = createThemeBundle([custom!], "2026-08-09T00:00:00.000Z", custom!.id);
    expect(parseThemeBundleText(JSON.stringify(bundle), []).bundle?.themes[0]?.inputs).toEqual(custom!.inputs);
    expect(normalizeCanonicalThemeSyncPayload({ schemaVersion: 1, activeThemeSelection: { kind: "custom", id: custom!.id }, customThemes: [custom] }).value?.customThemes[0]?.inputs).toEqual(custom!.inputs);
  });

  it("keeps invalid themes draft-saveable but blocks activation in Theme Studio", () => {
    const source = readFileSync("components/personalization/theme-studio.tsx", "utf8");
    expect(source).toContain("if (apply && !contrast.valid)");
    expect(source).toContain("disabled={!contrast.valid}");
  });

  it("maps only scoped semantic variables and leaves shell/root untouched", () => {
    const valid = buildPublicProfileThemeSnapshot({ visibility: "preset_only", publicPreset: "polar" })!;
    expect(Object.keys(publicProfileThemeStyle(valid))).toHaveLength(21);
    const view = readFileSync("components/social/social-profile-view.tsx", "utf8");
    const shell = readFileSync("components/app-shell/route-app-shell.tsx", "utf8");
    expect(view).toContain("style={scopedThemeStyle}");
    expect(view).toContain("data-profile-theme-source");
    expect(shell).not.toContain("publicProfileThemeStyle");
    expect(shell).not.toContain("themeSnapshot");
  });
});

describe("D8-2 owner-safe profile asset caches", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: sessionStorage() });
    resetOwnProfileCacheForTests();
    resetSignedSocialAssetUrlCacheForTests();
    getSupabaseServerClientMock.mockReset();
  });

  it("coalesces concurrent owner/resource loads and survives a valid session reload", async () => {
    let resolve!: (value: { avatarUrl: string }) => void;
    const fetcher = vi.fn(() => new Promise<{ avatarUrl: string }>((done) => { resolve = done; }));
    const first = loadOwnProfileCache({ ownerId: "owner-a", resource: "summary", fetcher });
    const second = loadOwnProfileCache({ ownerId: "owner-a", resource: "summary", fetcher });
    resolve({ avatarUrl: "signed-a" });
    await expect(Promise.all([first, second])).resolves.toEqual([{ avatarUrl: "signed-a" }, { avatarUrl: "signed-a" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resetOwnProfileCacheForTests();
    expect(readOwnProfileCache("owner-a", "summary")).toEqual({ avatarUrl: "signed-a" });
    expect(readOwnProfileCache("owner-b", "summary")).toBeUndefined();
  });

  it("invalidates owner session values and never crosses owners", async () => {
    await loadOwnProfileCache({ ownerId: "owner-a", resource: "hero", fetcher: async () => ({ avatarUrl: "a", bannerUrl: "banner-a" }) });
    invalidateOwnProfileCache("owner-a");
    expect(readOwnProfileCache("owner-a", "hero")).toBeUndefined();
    expect(readOwnProfileCache("owner-b", "hero")).toBeUndefined();
  });

  it("rejects expired signed profile values from session storage", () => {
    window.sessionStorage.setItem("mediaTracker:ownProfile:v1:owner-a:summary", JSON.stringify({ version: 1, ownerId: "owner-a", resource: "summary", value: { avatarUrl: "expired" }, fetchedAt: 1, expiresAt: 2 }));
    expect(readOwnProfileCache("owner-a", "summary")).toBeUndefined();
  });

  it("coalesces signed URL creation and naturally misses on path/revision/kind changes", async () => {
    const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `signed:${path}` }, error: null }));
    getSupabaseServerClientMock.mockResolvedValue({ storage: { from: () => ({ createSignedUrl }) } });
    await Promise.all([createSignedSocialAssetUrl("owner-a/avatar/a.webp", "avatar", "r1"), createSignedSocialAssetUrl("owner-a/avatar/a.webp", "avatar", "r1")]);
    await createSignedSocialAssetUrl("owner-a/avatar/a.webp", "avatar", "r2");
    await createSignedSocialAssetUrl("owner-a/avatar/a.webp", "banner", "r2");
    await createSignedSocialAssetUrl("owner-b/avatar/a.webp", "avatar", "r1");
    expect(createSignedUrl).toHaveBeenCalledTimes(4);
  });
});

describe("D8-2 discovery description boundary", () => {
  it("strips executable markup/entities and bounds 10k input", () => {
    const value = `<style>bad{}</style><script>alert(1)</script><p>A &amp; B</p>${"x".repeat(10_000)}`;
    const normalized = normalizeSearchResultDescription(value)!;
    expect(normalized).toContain("A & B");
    expect(normalized).not.toMatch(/script|style|alert|<|>/i);
    expect(normalized.length).toBe(SEARCH_RESULT_DESCRIPTION_MAX_CHARS);
  });

  it("uses the shared mobile-two/desktop-three-line contract in every descriptive card", () => {
    const shared = readFileSync("components/search-result-description.tsx", "utf8");
    expect(shared).toMatch(/line-clamp-2.*max-h-10.*overflow-hidden.*overflow-wrap:anywhere.*sm:line-clamp-3.*sm:max-h/);
    for (const file of ["global-search-result-card.tsx", "anilist-result-card.tsx", "tvmaze-result-card.tsx", "tmdb-result-card.tsx"]) {
      expect(readFileSync(`components/${file}`, "utf8"), file).toContain("<SearchResultDescription");
    }
    for (const file of ["global-search-result-card.tsx", "anilist-result-card.tsx", "tvmaze-result-card.tsx", "openlibrary-result-card.tsx", "tmdb-result-card.tsx"]) {
      const source = readFileSync(`components/${file}`, "utf8");
      expect(source, file).not.toContain("dangerouslySetInnerHTML");
      expect(source, file).toContain("min-w-0");
    }
  });
});

describe("D8-2 migration contract", () => {
  it("is additive, hidden by default and returns only published snapshots", () => {
    const sql = readFileSync("supabase/migrations/20260809120000_d8_public_profile_theme.sql", "utf8");
    expect(sql).toContain("profile_theme_visibility text not null default 'hidden'");
    expect(sql).toContain("case when p.profile_theme_visibility='hidden' then null else p.public_theme_snapshot end");
    expect(sql).toContain("where id=v_user");
    expect(sql).toContain("d8_public_theme_snapshot_valid");
    expect(sql).toContain("jsonb_each_text(v_tokens)");
    expect(sql).toContain("d8_theme_contrast");
    expect(sql).toContain("preset_theme_snapshot_mismatch");
    expect(sql).not.toMatch(/drop table|truncate/i);
  });

  it("allows public signed assets only when the exact path is currently published", () => {
    const sql = readFileSync("supabase/migrations/20260810120000_d8_profile_asset_visibility_hardening.sql", "utf8");
    expect(sql).toContain("p_asset_name is distinct from v_avatar_path");
    expect(sql).toContain("p_asset_name is distinct from v_banner_path");
    expect(sql).toContain("social_profile_asset_visible(name,(storage.foldername(name))[1],auth.uid())");
    expect(sql).not.toContain("bucket_id='profile-assets' and true");
  });
});
