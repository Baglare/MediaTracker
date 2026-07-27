import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_PREFERENCES,
  aiFeedbackCodec,
  aiPreferencesCodec,
  aiSessionCodec,
  readAiPreferencesState,
} from "@/lib/ai/local-state";
import {
  createUserOwnerScope,
  GUEST_OWNER_SCOPE,
} from "@/lib/local-owner-scope";
import {
  decideLegacyPersonalOwnership,
  inspectLegacyPersonalData,
  migrateLegacyPersonalDomainToGuest,
} from "@/lib/personal-data-ownership";
import {
  buildPersonalDataKeys,
  readPersonalData,
  writePersonalData,
  type PersonalStorageLike,
} from "@/lib/personal-data-storage";
import {
  DEFAULT_PROFILE_PREFERENCES,
  PROFILE_PREFS_STORAGE_KEY,
  profilePreferencesCodec,
  readScopedProfilePreferences,
  writeScopedProfilePreferences,
} from "@/lib/profile-preferences";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  createCustomThemeDefinition,
  customThemeCollectionCodec,
  readScopedCustomThemes,
  writeScopedCustomThemes,
} from "@/lib/personalization/custom-themes";
import {
  readOwnerThemeSelection,
  writeOwnerThemeSelection,
} from "@/lib/personalization/owner-theme-selection";
import {
  DEFAULT_THEME_CLOUD_SYNC_PREFERENCES,
  readScopedThemeCloudSyncPreferences,
  writeScopedThemeCloudSyncPreferences,
} from "@/lib/personalization/theme-cloud-sync";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";
import {
  readAppearancePreferences,
  writeAppearancePreferences,
} from "@/hooks/use-appearance-preferences";

class MemoryStorage implements PersonalStorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const userA = createUserOwnerScope("user-a");
const userB = createUserOwnerScope("user-b");

function profile(name: string) {
  return {
    ...DEFAULT_PROFILE_PREFERENCES,
    displayName: name,
    avatarMode: "image" as const,
    avatarImageDataUrl: `data:image/png;base64,${name}`,
  };
}

function theme(id = "ct_12345678") {
  return createCustomThemeDefinition(id, "2026-07-23T10:00:00.000Z", {
    name: `Tema ${id}`,
    inputs: {
      colorScheme: "dark",
      background: "#101820",
      surface: "#182733",
      accent: "#2AA7A1",
      secondaryAccent: "#C38A5A",
    },
  });
}

describe("owner-scoped personal key/envelope storage", () => {
  it("builds collision-free domain keys for guest and two users", () => {
    const keys = [
      buildPersonalDataKeys("profilePreferences", GUEST_OWNER_SCOPE).current,
      buildPersonalDataKeys("profilePreferences", userA).current,
      buildPersonalDataKeys("profilePreferences", userB).current,
      buildPersonalDataKeys("customThemes", userA).current,
      buildPersonalDataKeys("aiSession", userA).current,
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps verified current/backup slots and rejects a foreign envelope", () => {
    const storage = new MemoryStorage();
    expect(writeScopedProfilePreferences(userA, profile("A1"), storage).ok).toBe(true);
    expect(writeScopedProfilePreferences(userA, profile("A2"), storage).ok).toBe(true);
    const keysA = buildPersonalDataKeys("profilePreferences", userA);
    expect(storage.getItem(keysA.backup)).toContain("A1");
    expect(storage.getItem(keysA.temp)).toBeNull();

    const keysB = buildPersonalDataKeys("profilePreferences", userB);
    storage.setItem(keysB.current, storage.getItem(keysA.current)!);
    expect(readScopedProfilePreferences(userB, storage).status).toBe("owner_mismatch");
    expect(readScopedProfilePreferences(userA, storage)).toMatchObject({
      status: "valid",
      data: { displayName: "A2" },
    });
  });

  it("quarantines corrupt personal JSON without replacing current", () => {
    const storage = new MemoryStorage();
    const keys = buildPersonalDataKeys("profilePreferences", userA);
    storage.setItem(keys.current, "{broken");
    const read = readScopedProfilePreferences(userA, storage);
    expect(read.status).toBe("corrupt");
    expect(storage.getItem(keys.current)).toBe("{broken");
    expect(read.status === "corrupt" && read.quarantineKey).toBeTruthy();
  });
});

describe("profile, themes and sync metadata isolation", () => {
  it("isolates local name/avatar fallback and preserves cloud identity priority", () => {
    const storage = new MemoryStorage();
    writeScopedProfilePreferences(userA, profile("User A"), storage);
    writeScopedProfilePreferences(userB, profile("User B"), storage);
    const a = readScopedProfilePreferences(userA, storage);
    const b = readScopedProfilePreferences(userB, storage);
    expect(a.status === "valid" && a.data.avatarImageDataUrl).toContain("User A");
    expect(b.status === "valid" && b.data.displayName).toBe("User B");
    expect(resolveProfileIdentity({
      authenticated: true,
      localPreferences: a.status === "valid" ? a.data : undefined,
      socialProfile: { displayName: "Cloud A", avatarUrl: "https://cdn.example/a.webp" },
    })).toMatchObject({ displayName: "Cloud A", avatarUrl: "https://cdn.example/a.webp" });
  });

  it("keeps custom catalogs and active selection owner-scoped", () => {
    const storage = new MemoryStorage();
    writeScopedCustomThemes(userA, { version: 1, themes: [theme()] }, storage);
    writeScopedCustomThemes(userB, { version: 1, themes: [theme("ct_87654321")] }, storage);
    writeOwnerThemeSelection(userA, { kind: "custom", id: "ct_12345678" }, storage);
    expect(readScopedCustomThemes(userA, storage)).toMatchObject({
      status: "valid",
      data: { themes: [{ id: "ct_12345678" }] },
    });
    expect(readScopedCustomThemes(userB, storage)).toMatchObject({
      status: "valid",
      data: { themes: [{ id: "ct_87654321" }] },
    });
    expect(readOwnerThemeSelection(userB, storage).status).toBe("missing");
  });

  it("isolates theme sync enabled/revision/pending state and leaves guest disabled", () => {
    const storage = new MemoryStorage();
    writeScopedThemeCloudSyncPreferences(userA, {
      version: 1,
      enabled: true,
      lastRemoteRevision: 8,
      pendingLocalChanges: true,
    }, storage);
    expect(readScopedThemeCloudSyncPreferences(userA, storage)).toMatchObject({
      status: "valid",
      data: { enabled: true, lastRemoteRevision: 8, pendingLocalChanges: true },
    });
    expect(readScopedThemeCloudSyncPreferences(userB, storage).status).toBe("missing");
    expect(DEFAULT_THEME_CLOUD_SYNC_PREFERENCES.enabled).toBe(false);
  });
});

describe("AI owner state codecs", () => {
  it("enforces session limits and rejects invalid session envelopes", () => {
    expect(aiSessionCodec({ version: 1, sessions: "bad" }).ok).toBe(false);
    const sessions = Array.from({ length: 12 }, (_, index) => ({
      id: `s-${index}`,
      createdAt: "2026-07-23T10:00:00.000Z",
      prompt: `Prompt ${index}`,
      assistantMessage: "Answer",
      recommendations: [],
      settings: DEFAULT_AI_PREFERENCES.settings,
    }));
    const decoded = aiSessionCodec({ version: 1, sessions });
    expect(decoded.ok && decoded.value.sessions).toHaveLength(8);
  });

  it("allowlists feedback and defaults note consent safely", () => {
    const feedback = aiFeedbackCodec({
      version: 1,
      dismissedSignals: {},
      recommendationEvents: [{
        id: "rf-1",
        action: "execute_code",
        recommendationId: "r-1",
        title: "Title",
        mediaType: "movie",
        source: "tmdb",
        createdAt: "2026-07-23T10:00:00.000Z",
      }],
    });
    expect(feedback.ok && feedback.value.recommendationEvents).toEqual([]);
    const preferences = aiPreferencesCodec({ version: 1, settings: {}, dataToggles: {} });
    expect(preferences.ok && preferences.value).toMatchObject({
      settings: { usePersonalNotes: false },
      dataToggles: { notes: false },
    });
  });

  it("does not expose another owner's AI preferences", () => {
    const storage = new MemoryStorage();
    expect(writePersonalData(userA, "aiPreferences", {
      ...DEFAULT_AI_PREFERENCES,
      scopeMode: "east",
    }, aiPreferencesCodec, storage).ok).toBe(true);
    expect(readAiPreferencesState(userA, storage)).toMatchObject({
      status: "valid",
      data: { scopeMode: "east" },
    });
    expect(readAiPreferencesState(userB, storage).status).toBe("missing");
  });
});

describe("legacy personal ownership decisions", () => {
  it("copies signed-out global profile to guest while preserving raw source/backup", () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify(profile("Legacy"));
    storage.setItem(PROFILE_PREFS_STORAGE_KEY, raw);
    expect(migrateLegacyPersonalDomainToGuest("profile", storage)).toBe(true);
    expect(storage.getItem(PROFILE_PREFS_STORAGE_KEY)).toBe(raw);
    expect(readScopedProfilePreferences(GUEST_OWNER_SCOPE, storage)).toMatchObject({
      status: "valid",
      data: { displayName: "Legacy" },
    });
    expect([...storage.values.keys()].some((key) => key.includes("personalOwnershipBackup"))).toBe(true);
  });

  it("quarantines corrupt legacy personal JSON without creating a guest envelope", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_PREFS_STORAGE_KEY, "{broken");
    expect(migrateLegacyPersonalDomainToGuest("profile", storage)).toBe(false);
    expect(storage.getItem(PROFILE_PREFS_STORAGE_KEY)).toBe("{broken");
    expect(readScopedProfilePreferences(GUEST_OWNER_SCOPE, storage).status).toBe("missing");
    expect([...storage.values.keys()].some((key) => key.includes("quarantine:personal-legacy")))
      .toBe(true);
  });

  it("requires an explicit authenticated decision and isolates User A marker from User B", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_PREFS_STORAGE_KEY, JSON.stringify(profile("Legacy")));
    const candidate = inspectLegacyPersonalData(userA, storage)[0];
    expect(candidate).toMatchObject({ domain: "profile", destinationHasData: false });
    expect(readScopedProfilePreferences(userA, storage).status).toBe("missing");
    expect(decideLegacyPersonalOwnership(userA, candidate, "deferred", storage).ok).toBe(true);
    expect(inspectLegacyPersonalData(userA, storage)[0].deferred).toBe(true);
    expect(inspectLegacyPersonalData(userB, storage)[0].deferred).not.toBe(true);
  });

  it("assigns themes only into an empty target and never silently merges", () => {
    const storage = new MemoryStorage();
    storage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify({
      version: 1,
      themes: [theme()],
    }));
    const candidate = inspectLegacyPersonalData(userA, storage)
      .find((item) => item.domain === "themes")!;
    expect(decideLegacyPersonalOwnership(userA, candidate, "assigned_to_user", storage).ok).toBe(true);
    expect(readScopedCustomThemes(userA, storage).status).toBe("valid");

    writeScopedCustomThemes(userB, { version: 1, themes: [theme("ct_87654321")] }, storage);
    const userBCandidate = inspectLegacyPersonalData(userB, storage)
      .find((item) => item.domain === "themes")!;
    expect(userBCandidate.destinationHasData).toBe(true);
    expect(decideLegacyPersonalOwnership(userB, userBCandidate, "assigned_to_user", storage).ok)
      .toBe(false);
  });

  it("re-consents personal-note use when legacy AI state is assigned to a user", () => {
    const storage = new MemoryStorage();
    storage.setItem("media-tracker-ai-settings", JSON.stringify({
      ...DEFAULT_AI_PREFERENCES.settings,
      usePersonalNotes: true,
    }));
    storage.setItem("media-tracker-ai-data-toggles", JSON.stringify({
      ...DEFAULT_AI_PREFERENCES.dataToggles,
      notes: true,
    }));
    storage.setItem("media-tracker-ai-sessions", "[]");
    const candidate = inspectLegacyPersonalData(userA, storage)
      .find((item) => item.domain === "ai")!;
    expect(candidate.hasSensitiveConsent).toBe(true);
    expect(decideLegacyPersonalOwnership(userA, candidate, "assigned_to_user", storage).ok)
      .toBe(true);
    expect(readAiPreferencesState(userA, storage)).toMatchObject({
      status: "valid",
      data: {
        settings: { usePersonalNotes: false },
        dataToggles: { notes: false },
      },
    });
  });

  it("keeps each personal domain in its own envelope", () => {
    const storage = new MemoryStorage();
    writePersonalData(userA, "profilePreferences", profile("A"), profilePreferencesCodec, storage);
    writePersonalData(userA, "customThemes", { version: 1, themes: [] }, customThemeCollectionCodec, storage);
    expect(readPersonalData(userA, "profilePreferences", profilePreferencesCodec, storage).status)
      .toBe("valid");
    expect(buildPersonalDataKeys("profilePreferences", userA).current)
      .not.toBe(buildPersonalDataKeys("customThemes", userA).current);
  });
});

describe("auth transition and device-preference contracts", () => {
  it("keeps density/effects/chart palette device-scoped across owner writes", () => {
    const storage = new MemoryStorage();
    writeAppearancePreferences(storage, {
      version: 3,
      theme: { kind: "preset", id: "ocean" },
      accentMode: "screen",
      effectsLevel: "full",
      density: "compact",
      chartPaletteId: "high_contrast",
      followWorldCompletedColor: false,
    });
    writeScopedProfilePreferences(userA, profile("A"), storage);
    writeScopedProfilePreferences(userB, profile("B"), storage);
    expect(readAppearancePreferences(storage)).toMatchObject({
      theme: { kind: "preset", id: "ocean" },
      effectsLevel: "full",
      density: "compact",
      chartPaletteId: "high_contrast",
    });
  });

  it("masks previous profile/theme/AI owners and retains generation guards", () => {
    const profileHook = readFileSync("hooks/use-owned-profile-preferences.ts", "utf8");
    const themesHook = readFileSync("hooks/use-custom-themes.ts", "utf8");
    const themesRuntime = readFileSync(
      "components/personalization/custom-themes-runtime.tsx",
      "utf8",
    );
    const appearanceRuntime = readFileSync(
      "components/personalization/appearance-runtime.tsx",
      "utf8",
    );
    const ai = readFileSync("components/ai-advisor.tsx", "utf8");
    expect(profileHook).toMatch(/isHydratedOwnerVisible|isCurrentOwnerGeneration/);
    expect(themesHook).toMatch(/isHydratedOwnerVisible|isCurrentOwnerGeneration/);
    expect(themesRuntime).toMatch(/const scope = useMemo\(/);
    expect(themesRuntime).toContain("[auth.loading, auth.user?.id]");
    expect(appearanceRuntime).not.toMatch(/\[\s*ownerTheme,/);
    expect(ai).toMatch(/ownerVisible|inFlightRequestId\.current = null/);
  });

  it("does not use old global AI writes in the advisor runtime", () => {
    const ai = readFileSync("components/ai-advisor.tsx", "utf8");
    expect(ai).not.toMatch(/localStorage\.(getItem|setItem|removeItem)/);
    expect(ai).toMatch(/writeAiSessionState|writeAiFeedbackState|writeAiPreferencesState/);
  });

  it("does not apply an ownerless custom cookie snapshot during server first paint", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("safeInitialTheme");
    expect(layout).toContain('theme: safeInitialTheme');
    expect(layout).not.toContain("initialCustomTheme);");
  });

  it("scopes theme sync metadata and rejects stale owner responses", () => {
    const hook = readFileSync("hooks/use-theme-cloud-sync.ts", "utf8");
    expect(hook).toMatch(/readScopedThemeCloudSyncPreferences|writeScopedThemeCloudSyncPreferences/);
    expect(hook).toContain("generation !== ownerGeneration.current");
    expect(hook).toContain("if (!auth.user) return false");
  });

  it("keeps profile and theme legacy decisions non-blocking in Settings", () => {
    const settings = readFileSync("features/settings/components/settings-feature.tsx", "utf8");
    const panel = readFileSync("components/personal-data-ownership-panel.tsx", "utf8");
    expect(settings).toContain("PersonalDataOwnershipPanel");
    expect(panel).toMatch(/assigned_to_user|assigned_to_guest|deferred|backup_only/);
    expect(panel).not.toMatch(/avatarImageDataUrl|assistantMessage|personalNotes/);
  });
});
