"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  defaultAppearancePreferences,
} from "@/lib/personalization/defaults";
import type { AppAppearancePreferences } from "@/lib/personalization/types";
import { normalizeAppearancePreferences } from "@/lib/personalization/validation";

export const APPEARANCE_PREFERENCES_STORAGE_KEY = "mediaTracker:appearancePreferences:v3";
export const LEGACY_V2_APPEARANCE_PREFERENCES_STORAGE_KEY = "mediaTracker:appearancePreferences:v2";
export const LEGACY_APPEARANCE_PREFERENCES_STORAGE_KEY = "mediaTracker:appearancePreferences:v1";

export interface AppearancePreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readAppearancePreferences(
  storage: AppearancePreferencesStorage,
  fallback: unknown = defaultAppearancePreferences(),
): AppAppearancePreferences {
  try {
    const raw = storage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY);
    if (raw) return normalizeAppearancePreferences(JSON.parse(raw));
    const legacy = storage.getItem(LEGACY_V2_APPEARANCE_PREFERENCES_STORAGE_KEY)
      ?? storage.getItem(LEGACY_APPEARANCE_PREFERENCES_STORAGE_KEY);
    return legacy
      ? normalizeAppearancePreferences(JSON.parse(legacy))
      : normalizeAppearancePreferences(fallback);
  } catch {
    return normalizeAppearancePreferences(fallback);
  }
}

export function writeAppearancePreferences(
  storage: AppearancePreferencesStorage,
  preferences: unknown,
): AppAppearancePreferences {
  const normalized = normalizeAppearancePreferences(preferences);
  try {
    storage.setItem(APPEARANCE_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Depolama kapalı/doluysa geçerli runtime state korunur.
  }
  return normalized;
}

export function resetStoredAppearancePreferences(
  storage: AppearancePreferencesStorage,
): AppAppearancePreferences {
  const defaults = defaultAppearancePreferences();
  try {
    storage.removeItem(APPEARANCE_PREFERENCES_STORAGE_KEY);
    storage.removeItem(LEGACY_V2_APPEARANCE_PREFERENCES_STORAGE_KEY);
    storage.removeItem(LEGACY_APPEARANCE_PREFERENCES_STORAGE_KEY);
  } catch {
    // Depolama erişimi olmasa da reset çağrısı default state döndürür.
  }
  return defaults;
}

export function useAppearancePreferences(initialPreferences: unknown = defaultAppearancePreferences()) {
  const [preferences, setPreferencesState] = useState<AppAppearancePreferences>(() => (
    normalizeAppearancePreferences(initialPreferences)
  ));
  const [hydrated, setHydrated] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    const loaded = readAppearancePreferences(window.localStorage, initialPreferences);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage hydration
    setPreferencesState({
      ...loaded,
      theme: loaded.theme.kind === "preset"
        ? loaded.theme
        : { kind: "preset", id: "obsidian" },
    });
    setHydrated(true);
  }, [initialPreferences]);

  useEffect(() => {
    if (hydrated && dirty.current) {
      writeAppearancePreferences(window.localStorage, preferences);
      dirty.current = false;
    }
  }, [hydrated, preferences]);

  const setPreferences = useCallback((next: unknown) => {
    dirty.current = true;
    setPreferencesState(normalizeAppearancePreferences(next));
  }, []);

  const updatePreference = useCallback(<K extends keyof AppAppearancePreferences>(
    key: K,
    value: AppAppearancePreferences[K],
  ) => {
    dirty.current = true;
    setPreferencesState((current) => normalizeAppearancePreferences({ ...current, [key]: value }));
  }, []);

  const resetToDefaults = useCallback(() => {
    dirty.current = true;
    setPreferencesState(resetStoredAppearancePreferences(window.localStorage));
  }, []);

  return {
    preferences,
    hydrated,
    setPreferences,
    updatePreference,
    resetToDefaults,
  };
}
