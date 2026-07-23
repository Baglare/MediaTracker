import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, PUT } from "@/app/api/personalization/themes/sync/route";
import {
  createCustomThemeDefinition,
  type CustomThemesStorage,
} from "@/lib/personalization/custom-themes";
import {
  applyThemeImport,
  createThemeBundle,
  parseThemeBundleText,
  safeThemeExportFilename,
  serializeThemeBundle,
} from "@/lib/personalization/theme-bundle";
import {
  DEFAULT_THEME_CLOUD_SYNC_PREFERENCES,
  initialThemeSyncChoice,
  mergeThemeStates,
  normalizeCanonicalThemeSyncPayload,
  normalizeThemeCloudSyncPreferences,
  readThemeCloudSyncPreferences,
  THEME_CLOUD_SYNC_STORAGE_KEY,
  writeThemeCloudSyncPreferences,
} from "@/lib/personalization/theme-cloud-sync";
import type { CustomThemeDefinition, CustomThemeInputs } from "@/lib/personalization/types";

const serverMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: serverMocks.getUser },
    rpc: serverMocks.rpc,
  }),
}));

const INPUTS: CustomThemeInputs = {
  colorScheme: "dark",
  background: "#101820",
  surface: "#182733",
  accent: "#2AA7A1",
  secondaryAccent: "#C38A5A",
};

function theme(
  id = "ct_12345678",
  name = "Gece Kıyısı",
  inputs: CustomThemeInputs = INPUTS,
): CustomThemeDefinition {
  return createCustomThemeDefinition(id, "2026-07-23T10:00:00.000Z", { name, inputs });
}

function storage(initial?: unknown): CustomThemesStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(
      THEME_CLOUD_SYNC_STORAGE_KEY,
      typeof initial === "string" ? initial : JSON.stringify(initial),
    );
  }
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function cloudState(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    schemaVersion: 1,
    activeThemeSelection: { kind: "custom", id: "ct_12345678" },
    customThemes: [theme()],
    revision: 1,
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("P6.1 theme bundle export", () => {
  it("exports one canonical custom theme without unrelated preferences", () => {
    const bundle = createThemeBundle([theme()], "2026-07-23T11:00:00.000Z", "ct_12345678");
    expect(bundle).toMatchObject({
      format: "mediatracker-theme-bundle",
      version: 1,
      application: "MediaTracker",
      activeTheme: { kind: "custom", id: "ct_12345678" },
    });
    expect(bundle.themes).toHaveLength(1);
    expect(JSON.stringify(bundle)).not.toMatch(
      /layout|startup|chartPalette|profilePalette|connectionColor|cookie|user_id|email|css/i,
    );
  });

  it("round-trips all themes and omits an unavailable active id", () => {
    const themes = [theme(), theme("ct_87654321", "Açık Kıyı", { ...INPUTS, colorScheme: "light" })];
    const serialized = serializeThemeBundle(
      createThemeBundle(themes, "2026-07-23T11:00:00.000Z", "ct_missing00"),
    );
    const preview = parseThemeBundleText(serialized, []);
    expect(preview.fatalErrors).toEqual([]);
    expect(preview.bundle?.activeTheme).toBeUndefined();
    expect(preview.candidates.flatMap((candidate) => candidate.theme ?? [])).toHaveLength(2);
  });

  it("creates a traversal-safe filename", () => {
    expect(safeThemeExportFilename("../../ Gül / Tema<>")).toBe("mediatracker-theme-gul-tema.json");
  });
});

describe("P6.1 theme bundle import validation and conflicts", () => {
  it("rejects malformed JSON, wrong version and oversized files", () => {
    expect(parseThemeBundleText("{broken", []).fatalErrors).toHaveLength(1);
    expect(parseThemeBundleText(JSON.stringify({
      format: "mediatracker-theme-bundle",
      version: 2,
      application: "MediaTracker",
      exportedAt: "2026-07-23T11:00:00.000Z",
      themes: [theme()],
    }), []).fatalErrors).toHaveLength(1);
    expect(parseThemeBundleText("{}", [], 256 * 1024 + 1).fatalErrors[0]).toContain("256 KB");
  });

  it.each(["rawCss", "style", "className", "backgroundImage", "url"])(
    "rejects the unsafe theme key %s",
    (key) => {
      const payload = createThemeBundle([theme()], "2026-07-23T11:00:00.000Z");
      const unsafe = { ...payload, themes: [{ ...payload.themes[0], [key]: "url(javascript:x)" }] };
      const preview = parseThemeBundleText(JSON.stringify(unsafe), []);
      expect(preview.invalidCount).toBe(1);
      expect(preview.candidates[0].theme).toBeUndefined();
    },
  );

  it("keeps valid records available when another bundle record is invalid", () => {
    const payload = createThemeBundle([theme()], "2026-07-23T11:00:00.000Z");
    const preview = parseThemeBundleText(JSON.stringify({
      ...payload,
      themes: [payload.themes[0], { ...payload.themes[0], id: "bad", inputs: { ...INPUTS, accent: "linear-gradient(red,blue)" } }],
    }), []);
    expect(preview.candidates).toHaveLength(2);
    expect(preview.invalidCount).toBe(1);
    expect(preview.validCount + preview.warningCount).toBe(1);
  });

  it("detects identical/different id conflicts and name-only conflicts", () => {
    const current = theme();
    const identical = parseThemeBundleText(
      serializeThemeBundle(createThemeBundle([current], "2026-07-23T11:00:00.000Z")),
      [current],
    );
    const differentTheme = theme("ct_12345678", "Değişmiş Tema", {
      ...INPUTS,
      accent: "#8855AA",
    });
    const different = parseThemeBundleText(
      serializeThemeBundle(createThemeBundle([differentTheme], "2026-07-23T11:00:00.000Z")),
      [current, theme("ct_87654321", "Değişmiş Tema")],
    );
    expect(identical.candidates[0].idConflict).toBe("identical");
    expect(different.candidates[0]).toMatchObject({
      idConflict: "different",
      nameConflict: true,
    });
  });

  it("supports skip, replace and duplicate without silent overwrite", () => {
    const current = theme();
    const imported = theme("ct_12345678", "Bulut Sürümü", { ...INPUTS, accent: "#8855AA" });
    const preview = parseThemeBundleText(
      serializeThemeBundle(createThemeBundle([imported], "2026-07-23T11:00:00.000Z")),
      [current],
    );
    const skipped = applyThemeImport(
      { version: 1, themes: [current] },
      preview,
      { 0: "skip" },
      () => "ct_newcopy0",
      "2026-07-23T12:00:00.000Z",
    );
    const replaced = applyThemeImport(
      { version: 1, themes: [current] },
      preview,
      { 0: "replace" },
      () => "ct_newcopy0",
      "2026-07-23T12:00:00.000Z",
    );
    const duplicated = applyThemeImport(
      { version: 1, themes: [current] },
      preview,
      { 0: "duplicate" },
      () => "ct_newcopy0",
      "2026-07-23T12:00:00.000Z",
    );
    expect(skipped).toMatchObject({ skipped: 1, updated: 0, added: 0 });
    expect(replaced.collection.themes[0]).toMatchObject({ id: current.id, name: "Bulut Sürümü" });
    expect(duplicated.collection.themes).toHaveLength(2);
    expect(duplicated.collection.themes[1]).toMatchObject({
      id: "ct_newcopy0",
      name: expect.stringContaining("İçe Aktarılan"),
    });
  });

  it("never grows beyond the 20-theme local limit", () => {
    const existing = Array.from({ length: 20 }, (_, index) => (
      theme(`ct_${String(index).padStart(8, "0")}`, `Tema ${index}`)
    ));
    const imported = theme("ct_extra000", "Ek Tema");
    const preview = parseThemeBundleText(
      serializeThemeBundle(createThemeBundle([imported], "2026-07-23T11:00:00.000Z")),
      existing,
    );
    const result = applyThemeImport(
      { version: 1, themes: existing },
      preview,
      {},
      () => "ct_newcopy0",
      "2026-07-23T12:00:00.000Z",
    );
    expect(result.collection.themes).toHaveLength(20);
    expect(result.rejected).toBe(1);
  });
});

describe("P6.1 device-local cloud preference and merge", () => {
  it("defaults disabled and recovers from malformed/versioned storage", () => {
    expect(readThemeCloudSyncPreferences(storage())).toEqual(DEFAULT_THEME_CLOUD_SYNC_PREFERENCES);
    expect(readThemeCloudSyncPreferences(storage("{broken"))).toEqual(DEFAULT_THEME_CLOUD_SYNC_PREFERENCES);
    expect(normalizeThemeCloudSyncPreferences({ version: 2, enabled: true }))
      .toEqual(DEFAULT_THEME_CLOUD_SYNC_PREFERENCES);
  });

  it("normalizes metadata and writes only its own storage key", () => {
    const target = storage();
    target.values.set("mediaTracker:customThemes:v1", "preserve");
    const saved = writeThemeCloudSyncPreferences(target, {
      version: 1,
      enabled: true,
      lastRemoteRevision: 3,
      lastSyncedAt: "2026-07-23T12:00:00.000Z",
      lastError: " x ".repeat(150),
      pendingLocalChanges: true,
    });
    expect(saved.enabled).toBe(true);
    expect(saved.lastError?.length).toBeLessThanOrEqual(200);
    expect(target.values.get("mediaTracker:customThemes:v1")).toBe("preserve");
  });

  it.each([
    [0, 0, "empty"],
    [1, 0, "device"],
    [0, 1, "cloud"],
    [1, 1, "merge"],
  ] as const)("resolves initial sync %s/%s as %s", (local, cloud, expected) => {
    expect(initialThemeSyncChoice(local, cloud)).toBe(expected);
  });

  it("merges unique and identical records while preserving divergent copies", () => {
    const local = theme();
    const uniqueCloud = theme("ct_cloud000", "Bulut");
    const divergentCloud = theme("ct_12345678", "Bulut Değişik", {
      ...INPUTS,
      accent: "#8855AA",
    });
    const merged = mergeThemeStates(
      [local],
      [local, uniqueCloud, divergentCloud],
      { kind: "custom", id: local.id },
      { kind: "custom", id: uniqueCloud.id },
      () => "ct_cloudcopy",
      "2026-07-23T12:00:00.000Z",
    );
    expect(merged.collection.themes).toHaveLength(3);
    expect(merged.conflicts[0]).toMatchObject({
      id: local.id,
      duplicateId: "ct_cloudcopy",
    });
    expect(merged.activeThemeSelection).toEqual({ kind: "custom", id: local.id });
    expect(merged.activeThemeConflict).toBe(true);
  });

  it("falls back to Obsidian when a cloud custom selection has no theme", () => {
    const normalized = normalizeCanonicalThemeSyncPayload({
      schemaVersion: 1,
      activeThemeSelection: { kind: "custom", id: "ct_missing00" },
      customThemes: [],
    });
    expect(normalized.value?.activeThemeSelection).toEqual({ kind: "preset", id: "obsidian" });
  });
});

describe("P6.1 cloud API", () => {
  beforeEach(() => {
    serverMocks.getUser.mockReset();
    serverMocks.rpc.mockReset();
    serverMocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("rejects anonymous requests and marks all responses private/no-store", async () => {
    serverMocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("gets the authenticated user's cloud state", async () => {
    serverMocks.rpc.mockResolvedValue({ data: cloudState(), error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ exists: true, revision: 1 });
    expect(serverMocks.rpc).toHaveBeenCalledWith("get_theme_sync_state");
  });

  it("validates saves and never accepts a client user id", async () => {
    const invalid = await PUT(new Request("http://localhost/api/personalization/themes/sync", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: 0,
        userId: "other-user",
        activeThemeSelection: { kind: "preset", id: "obsidian" },
        customThemes: [],
      }),
    }));
    expect(invalid.status).toBe(400);

    serverMocks.rpc.mockResolvedValue({
      data: { ok: true, conflict: false, state: cloudState() },
      error: null,
    });
    const response = await PUT(new Request("http://localhost/api/personalization/themes/sync", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: 0,
        activeThemeSelection: { kind: "custom", id: "ct_12345678" },
        customThemes: [theme()],
      }),
    }));
    expect(response.status).toBe(200);
    expect(serverMocks.rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(serverMocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_user_id");
  });

  it("maps revision mismatch to a controlled 409 response", async () => {
    serverMocks.rpc.mockResolvedValue({
      data: { ok: false, conflict: true, state: cloudState({ revision: 4 }) },
      error: null,
    });
    const response = await PUT(new Request("http://localhost/api/personalization/themes/sync", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: 3,
        activeThemeSelection: { kind: "custom", id: "ct_12345678" },
        customThemes: [theme()],
      }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      conflict: true,
      state: { revision: 4 },
    });
  });

  it("deletes only through the authenticated RPC boundary", async () => {
    serverMocks.rpc.mockResolvedValue({ data: { ok: true, deleted: true }, error: null });
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deleted: true });
    expect(serverMocks.rpc).toHaveBeenCalledWith("delete_theme_sync_state");
  });
});

describe("P6.1 migration, privacy, and architecture contracts", () => {
  const migrationPath = "supabase/migrations/20260722130000_theme_cloud_sync.sql";
  const migration = readFileSync(migrationPath, "utf8");
  const schema = readFileSync("supabase/schema.sql", "utf8");
  const studio = readFileSync("components/personalization/theme-studio.tsx", "utf8");
  const transfer = readFileSync("components/personalization/theme-transfer-panel.tsx", "utf8");
  const syncPanel = readFileSync("components/personalization/theme-cloud-sync-panel.tsx", "utf8");
  const syncHook = readFileSync("hooks/use-theme-cloud-sync.ts", "utf8");
  const customHook = readFileSync("hooks/use-custom-themes.ts", "utf8");
  const publicLoader = readFileSync("lib/social/server.ts", "utf8");

  it("uses a unique 14-digit migration and keeps schema.sql synchronized", () => {
    expect(migrationPath).toMatch(/\/\d{14}_[a-z0-9_]+\.sql$/);
    expect(schema).toContain("-- Canonical P6.1 migration:");
    expect(schema.slice(schema.indexOf("-- P6.1 private"))).toBe(migration);
  });

  it("defines a private self-only table with revisioned RPC mutations", () => {
    expect(migration).toMatch(/create table if not exists public\.user_theme_preferences/);
    expect(migration).toMatch(/enable row level security/);
    expect(migration).toMatch(/using \(user_id = auth\.uid\(\)\)/);
    expect(migration).toMatch(/revoke all on table public\.user_theme_preferences/);
    expect(migration).toMatch(/grant select on table public\.user_theme_preferences to authenticated/);
    expect(migration).toMatch(/p_expected_revision/);
    expect(migration).toMatch(/v_current\.revision <> p_expected_revision/);
    expect(migration).toMatch(/revision=v_current\.revision\+1/);
    expect(migration).toMatch(/security definer[\s\S]*set search_path=public,pg_temp/);
  });

  it("enforces canonical payload constraints and does not store derived CSS tokens", () => {
    expect(migration).toMatch(/jsonb_array_length\(custom_themes\) <= 20/);
    expect(migration).toMatch(/octet_length\(custom_themes::text\) <= 262144/);
    expect(migration).toMatch(/\^#\[0-9A-Fa-f\]\{6\}\$/);
    expect(migration).not.toMatch(/raw_css|background_image|semantic_tokens|cookie_snapshot/i);
  });

  it("keeps cloud theme data out of public profile loading", () => {
    expect(publicLoader).not.toContain("user_theme_preferences");
    expect(publicLoader).not.toContain("custom_themes");
  });

  it("integrates preview-first transfer and opt-in sync without networking in local persistence", () => {
    expect(studio).toContain("ThemeTransferPanel");
    expect(studio).toContain("ThemeCloudSyncPanel");
    expect(transfer).toMatch(/parseThemeBundleText|Dosyada seçili olan temayı uygula/);
    expect(syncPanel).toMatch(/Tema senkronizasyonunu etkinleştir|Şimdi senkronize et/);
    expect(customHook).not.toMatch(/\bfetch\(|supabase/);
    expect(syncHook).toContain("enabled");
    expect(syncHook).toContain("pendingLocalChanges");
  });

  it("does not sync preview drafts or unrelated personalization domains", () => {
    expect(syncHook).not.toMatch(/previewCustomTheme|draft|layoutPreferences|startupPreferences|profilePalette|connectionColor/);
  });
});
