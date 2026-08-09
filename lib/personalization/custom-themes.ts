import {
  normalizeCustomThemeInputs,
  normalizeThemeCorrections,
} from "./custom-theme-tokens";
import type {
  CustomThemeCorrections,
  CustomThemeDefinition,
  CustomThemeInputs,
} from "./types";
import type { StorageWriteResult } from "../local-data-storage";
import type { LocalOwnerScope } from "../local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
} from "../personal-data-storage";

export const CUSTOM_THEMES_STORAGE_KEY = "mediaTracker:customThemes:v1";
export const CUSTOM_THEMES_VERSION = 1 as const;
export const CUSTOM_THEME_DEFINITION_VERSION = 2 as const;
export const MAX_CUSTOM_THEMES = 20;

export interface CustomThemeCollection {
  version: typeof CUSTOM_THEMES_VERSION;
  themes: CustomThemeDefinition[];
}

export interface CustomThemesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CustomThemeDraftValue {
  name: string;
  inputs: CustomThemeInputs;
  corrections?: CustomThemeCorrections;
}

const CUSTOM_THEME_ID = /^ct_[a-z0-9_-]{8,80}$/i;

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function normalizeCustomThemeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 40 ? name : null;
}

export function normalizeCustomThemeDefinition(value: unknown): CustomThemeDefinition | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const theme = value as Partial<CustomThemeDefinition>;
  const name = normalizeCustomThemeName(theme.name);
  const inputs = normalizeCustomThemeInputs(theme.inputs);
  if (
    (theme.version !== 1 && theme.version !== CUSTOM_THEME_DEFINITION_VERSION)
    || typeof theme.id !== "string"
    || !CUSTOM_THEME_ID.test(theme.id)
    || !name
    || !inputs
    || !validDate(theme.createdAt)
    || !validDate(theme.updatedAt)
  ) {
    return null;
  }
  return {
    version: CUSTOM_THEME_DEFINITION_VERSION,
    id: theme.id,
    name,
    createdAt: theme.createdAt,
    updatedAt: theme.updatedAt,
    inputs,
    corrections: normalizeThemeCorrections(theme.corrections),
  };
}

export function normalizeCustomThemeCollection(value: unknown): CustomThemeCollection {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (value as { version?: unknown }).version !== CUSTOM_THEMES_VERSION
    || !Array.isArray((value as { themes?: unknown }).themes)
  ) {
    return { version: CUSTOM_THEMES_VERSION, themes: [] };
  }
  const seen = new Set<string>();
  const themes: CustomThemeDefinition[] = [];
  for (const candidate of (value as { themes: unknown[] }).themes) {
    const theme = normalizeCustomThemeDefinition(candidate);
    if (!theme || seen.has(theme.id)) continue;
    seen.add(theme.id);
    themes.push(theme);
    if (themes.length === MAX_CUSTOM_THEMES) break;
  }
  return { version: CUSTOM_THEMES_VERSION, themes };
}

export const customThemeCollectionCodec: PersonalDataCodec<CustomThemeCollection> = (value) => {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (value as { version?: unknown }).version !== CUSTOM_THEMES_VERSION
    || !Array.isArray((value as { themes?: unknown }).themes)
  ) {
    return { ok: false, message: "Custom theme katalog formati gecersiz." };
  }
  return { ok: true, value: normalizeCustomThemeCollection(value) };
};

export function readScopedCustomThemes(
  scope: LocalOwnerScope,
  storage?: CustomThemesStorage,
): PersonalDataReadResult<CustomThemeCollection> {
  return readPersonalData(scope, "customThemes", customThemeCollectionCodec, storage);
}

export function writeScopedCustomThemes(
  scope: LocalOwnerScope,
  value: unknown,
  storage?: CustomThemesStorage,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "customThemes",
    normalizeCustomThemeCollection(value),
    customThemeCollectionCodec,
    storage,
  );
}

export function readCustomThemes(storage: CustomThemesStorage): CustomThemeCollection {
  try {
    const raw = storage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    return raw
      ? normalizeCustomThemeCollection(JSON.parse(raw))
      : { version: CUSTOM_THEMES_VERSION, themes: [] };
  } catch {
    return { version: CUSTOM_THEMES_VERSION, themes: [] };
  }
}

export function writeCustomThemes(
  storage: CustomThemesStorage,
  value: unknown,
): CustomThemeCollection {
  const normalized = normalizeCustomThemeCollection(value);
  try {
    storage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Local storage unavailable/full: valid runtime state remains usable.
  }
  return normalized;
}

export function resetStoredCustomThemes(storage: CustomThemesStorage): CustomThemeCollection {
  try {
    storage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
  } catch {
    // Reset remains deterministic when storage is unavailable.
  }
  return { version: CUSTOM_THEMES_VERSION, themes: [] };
}

export function createCustomThemeDefinition(
  id: string,
  now: string,
  draft: CustomThemeDraftValue,
): CustomThemeDefinition {
  const normalized = normalizeCustomThemeDefinition({
    version: CUSTOM_THEME_DEFINITION_VERSION,
    id,
    name: draft.name,
    createdAt: now,
    updatedAt: now,
    inputs: draft.inputs,
    corrections: draft.corrections,
  });
  if (!normalized) throw new Error("invalid_custom_theme");
  return normalized;
}

export function updateCustomThemeDefinition(
  current: CustomThemeDefinition,
  now: string,
  draft: CustomThemeDraftValue,
): CustomThemeDefinition {
  const normalized = normalizeCustomThemeDefinition({
    ...current,
    name: draft.name,
    inputs: draft.inputs,
    corrections: draft.corrections,
    updatedAt: now,
  });
  if (!normalized) throw new Error("invalid_custom_theme");
  return normalized;
}

export function appendCustomTheme(
  collection: CustomThemeCollection,
  theme: CustomThemeDefinition,
): CustomThemeCollection {
  if (collection.themes.length >= MAX_CUSTOM_THEMES) throw new Error("custom_theme_limit");
  if (collection.themes.some((item) => item.id === theme.id)) throw new Error("duplicate_custom_theme_id");
  return { version: CUSTOM_THEMES_VERSION, themes: [...collection.themes, theme] };
}

export function replaceCustomTheme(
  collection: CustomThemeCollection,
  theme: CustomThemeDefinition,
): CustomThemeCollection {
  if (!collection.themes.some((item) => item.id === theme.id)) throw new Error("custom_theme_not_found");
  return {
    version: CUSTOM_THEMES_VERSION,
    themes: collection.themes.map((item) => item.id === theme.id ? theme : item),
  };
}

export function deleteCustomTheme(
  collection: CustomThemeCollection,
  id: string,
): CustomThemeCollection {
  return {
    version: CUSTOM_THEMES_VERSION,
    themes: collection.themes.filter((item) => item.id !== id),
  };
}
