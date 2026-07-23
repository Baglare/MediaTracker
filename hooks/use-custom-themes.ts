"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MAX_CUSTOM_THEMES,
  appendCustomTheme,
  createCustomThemeDefinition,
  deleteCustomTheme,
  readCustomThemes,
  replaceCustomTheme,
  resetStoredCustomThemes,
  updateCustomThemeDefinition,
  writeCustomThemes,
  type CustomThemeCollection,
  type CustomThemeDraftValue,
} from "@/lib/personalization/custom-themes";
import type { CustomThemeDefinition } from "@/lib/personalization/types";

function secureCustomThemeId(): string {
  if (typeof crypto.randomUUID === "function") return `ct_${crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ct_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

export function useCustomThemes() {
  const [collection, setCollection] = useState<CustomThemeCollection>({ version: 1, themes: [] });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage hydration
    setCollection(readCustomThemes(window.localStorage));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeCustomThemes(window.localStorage, collection);
  }, [collection, hydrated]);

  const create = useCallback((draft: CustomThemeDraftValue): CustomThemeDefinition => {
    if (collection.themes.length >= MAX_CUSTOM_THEMES) throw new Error("custom_theme_limit");
    const theme = createCustomThemeDefinition(secureCustomThemeId(), isoNow(), draft);
    setCollection((current) => appendCustomTheme(current, theme));
    return theme;
  }, [collection.themes.length]);

  const update = useCallback((id: string, draft: CustomThemeDraftValue): CustomThemeDefinition => {
    const existing = collection.themes.find((theme) => theme.id === id);
    if (!existing) throw new Error("custom_theme_not_found");
    const updated = updateCustomThemeDefinition(existing, isoNow(), draft);
    setCollection((current) => replaceCustomTheme(current, updated));
    return updated;
  }, [collection.themes]);

  const duplicate = useCallback((id: string): CustomThemeDefinition => {
    const source = collection.themes.find((theme) => theme.id === id);
    if (!source) throw new Error("custom_theme_not_found");
    if (collection.themes.length >= MAX_CUSTOM_THEMES) throw new Error("custom_theme_limit");
    return create({
      name: `${source.name} · Kopya`.slice(0, 40),
      inputs: source.inputs,
      corrections: source.corrections,
    });
  }, [collection.themes, create]);

  const rename = useCallback((id: string, name: string): CustomThemeDefinition => {
    const source = collection.themes.find((theme) => theme.id === id);
    if (!source) throw new Error("custom_theme_not_found");
    return update(id, {
      name,
      inputs: source.inputs,
      corrections: source.corrections,
    });
  }, [collection.themes, update]);

  const remove = useCallback((id: string) => {
    setCollection((current) => deleteCustomTheme(current, id));
  }, []);

  const reset = useCallback(() => {
    setCollection(resetStoredCustomThemes(window.localStorage));
  }, []);

  return {
    themes: collection.themes,
    hydrated,
    create,
    update,
    duplicate,
    rename,
    remove,
    reset,
  };
}
