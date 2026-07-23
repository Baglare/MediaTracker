import {
  MAX_CUSTOM_THEMES,
  normalizeCustomThemeName,
  type CustomThemeCollection,
  type CustomThemesStorage,
} from "./custom-themes";
import { sameThemeContent, validateCanonicalThemeList } from "./theme-bundle";
import { normalizeThemeSelection } from "./validation";
import type { CustomThemeDefinition, ThemeSelection } from "./types";
import type { StorageWriteResult } from "../local-data-storage";
import type { LocalOwnerScope } from "../local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
} from "../personal-data-storage";

export const THEME_CLOUD_SYNC_STORAGE_KEY = "mediaTracker:themeCloudSync:v1";

export interface ThemeCloudSyncPreferences {
  version: 1;
  enabled: boolean;
  lastRemoteRevision?: number;
  lastSyncedAt?: string;
  lastError?: string;
  pendingLocalChanges: boolean;
}

export interface CanonicalThemeSyncPayload {
  schemaVersion: 1;
  activeThemeSelection: ThemeSelection;
  customThemes: CustomThemeDefinition[];
}

export interface ThemeCloudState extends CanonicalThemeSyncPayload {
  exists: boolean;
  revision: number;
  updatedAt?: string;
}

export interface ThemeMergeResult {
  collection: CustomThemeCollection;
  activeThemeSelection: ThemeSelection;
  conflicts: Array<{ id: string; localName: string; cloudName: string; duplicateId?: string }>;
  activeThemeConflict: boolean;
  rejected: number;
}

export type InitialThemeSyncChoice = "device" | "cloud" | "merge" | "empty";

export const DEFAULT_THEME_CLOUD_SYNC_PREFERENCES: ThemeCloudSyncPreferences = {
  version: 1,
  enabled: false,
  pendingLocalChanges: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function normalizeThemeCloudSyncPreferences(value: unknown): ThemeCloudSyncPreferences {
  if (!isRecord(value) || value.version !== 1) {
    return { ...DEFAULT_THEME_CLOUD_SYNC_PREFERENCES };
  }
  const revision = typeof value.lastRemoteRevision === "number"
    && Number.isSafeInteger(value.lastRemoteRevision)
    && value.lastRemoteRevision >= 0
    ? value.lastRemoteRevision
    : undefined;
  const lastError = typeof value.lastError === "string"
    ? value.lastError.trim().slice(0, 200) || undefined
    : undefined;
  return {
    version: 1,
    enabled: value.enabled === true,
    lastRemoteRevision: revision,
    lastSyncedAt: validIsoDate(value.lastSyncedAt) ? value.lastSyncedAt : undefined,
    lastError,
    pendingLocalChanges: value.pendingLocalChanges === true,
  };
}

export const themeCloudSyncPreferencesCodec: PersonalDataCodec<ThemeCloudSyncPreferences> = (
  value,
) => {
  if (
    !isRecord(value)
    || value.version !== 1
    || typeof value.enabled !== "boolean"
    || typeof value.pendingLocalChanges !== "boolean"
  ) {
    return { ok: false, message: "Theme cloud sync metadata formati gecersiz." };
  }
  return { ok: true, value: normalizeThemeCloudSyncPreferences(value) };
};

export function readScopedThemeCloudSyncPreferences(
  scope: LocalOwnerScope,
  storage?: CustomThemesStorage,
): PersonalDataReadResult<ThemeCloudSyncPreferences> {
  return readPersonalData(
    scope,
    "themeCloudSync",
    themeCloudSyncPreferencesCodec,
    storage,
  );
}

export function writeScopedThemeCloudSyncPreferences(
  scope: LocalOwnerScope,
  value: unknown,
  storage?: CustomThemesStorage,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "themeCloudSync",
    normalizeThemeCloudSyncPreferences(value),
    themeCloudSyncPreferencesCodec,
    storage,
  );
}

export function readThemeCloudSyncPreferences(
  storage: CustomThemesStorage,
): ThemeCloudSyncPreferences {
  try {
    const raw = storage.getItem(THEME_CLOUD_SYNC_STORAGE_KEY);
    return raw
      ? normalizeThemeCloudSyncPreferences(JSON.parse(raw))
      : { ...DEFAULT_THEME_CLOUD_SYNC_PREFERENCES };
  } catch {
    return { ...DEFAULT_THEME_CLOUD_SYNC_PREFERENCES };
  }
}

export function writeThemeCloudSyncPreferences(
  storage: CustomThemesStorage,
  value: unknown,
): ThemeCloudSyncPreferences {
  const normalized = normalizeThemeCloudSyncPreferences(value);
  try {
    storage.setItem(THEME_CLOUD_SYNC_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Sync tercihi yazılamasa da local tema verisi kullanılmaya devam eder.
  }
  return normalized;
}

export function normalizeCanonicalThemeSyncPayload(value: unknown): {
  ok: boolean;
  value?: CanonicalThemeSyncPayload;
  error?: string;
} {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !["schemaVersion", "activeThemeSelection", "customThemes"].includes(key))
    || value.schemaVersion !== 1) {
    return { ok: false, error: "theme_sync_payload_invalid" };
  }
  const themes = validateCanonicalThemeList(value.customThemes);
  if (!themes.ok) return { ok: false, error: "theme_sync_themes_invalid" };
  const selection = normalizeThemeSelection(value.activeThemeSelection);
  if (selection.kind === "custom" && !themes.themes.some((theme) => theme.id === selection.id)) {
    return {
      ok: true,
      value: {
        schemaVersion: 1,
        activeThemeSelection: { kind: "preset", id: "obsidian" },
        customThemes: themes.themes,
      },
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      activeThemeSelection: selection,
      customThemes: themes.themes,
    },
  };
}

export function normalizeThemeCloudState(value: unknown): ThemeCloudState | null {
  if (!isRecord(value)) return null;
  const payload = normalizeCanonicalThemeSyncPayload({
    schemaVersion: value.schemaVersion,
    activeThemeSelection: value.activeThemeSelection,
    customThemes: value.customThemes,
  });
  if (!payload.ok || !payload.value
    || typeof value.revision !== "number"
    || !Number.isSafeInteger(value.revision)
    || value.revision < 0) {
    return null;
  }
  return {
    ...payload.value,
    exists: value.exists === true,
    revision: value.revision,
    updatedAt: validIsoDate(value.updatedAt) ? value.updatedAt : undefined,
  };
}

export function initialThemeSyncChoice(
  localCount: number,
  cloudCount: number,
): InitialThemeSyncChoice {
  if (localCount === 0 && cloudCount === 0) return "empty";
  if (localCount > 0 && cloudCount === 0) return "device";
  if (localCount === 0 && cloudCount > 0) return "cloud";
  return "merge";
}

export function mergeThemeStates(
  local: readonly CustomThemeDefinition[],
  cloud: readonly CustomThemeDefinition[],
  localSelection: ThemeSelection,
  cloudSelection: ThemeSelection,
  generateId: () => string,
  now: string,
): ThemeMergeResult {
  const themes = [...local];
  const conflicts: ThemeMergeResult["conflicts"] = [];
  let rejected = 0;
  for (const cloudTheme of cloud) {
    const localTheme = themes.find((theme) => theme.id === cloudTheme.id);
    if (!localTheme) {
      if (themes.length >= MAX_CUSTOM_THEMES) {
        rejected += 1;
        continue;
      }
      themes.push(cloudTheme);
      continue;
    }
    if (sameThemeContent(localTheme, cloudTheme)) continue;
    if (themes.length >= MAX_CUSTOM_THEMES) {
      conflicts.push({ id: cloudTheme.id, localName: localTheme.name, cloudName: cloudTheme.name });
      rejected += 1;
      continue;
    }
    const duplicateId = generateId();
    const suffix = " · Bulut Kopyası";
    const duplicateName = normalizeCustomThemeName(
      `${cloudTheme.name.slice(0, 40 - suffix.length)}${suffix}`,
    ) ?? "Bulut Kopyası";
    themes.push({
      ...cloudTheme,
      id: duplicateId,
      name: duplicateName,
      createdAt: now,
      updatedAt: now,
    });
    conflicts.push({
      id: cloudTheme.id,
      localName: localTheme.name,
      cloudName: cloudTheme.name,
      duplicateId,
    });
  }
  const activeThemeConflict = JSON.stringify(localSelection) !== JSON.stringify(cloudSelection);
  return {
    collection: { version: 1, themes },
    activeThemeSelection: localSelection,
    conflicts,
    activeThemeConflict,
    rejected,
  };
}
