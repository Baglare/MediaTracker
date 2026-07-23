"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_CUSTOM_THEMES,
  appendCustomTheme,
  createCustomThemeDefinition,
  deleteCustomTheme,
  normalizeCustomThemeCollection,
  readScopedCustomThemes,
  replaceCustomTheme,
  updateCustomThemeDefinition,
  writeScopedCustomThemes,
  type CustomThemeCollection,
  type CustomThemeDraftValue,
} from "@/lib/personalization/custom-themes";
import type { CustomThemeDefinition } from "@/lib/personalization/types";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import {
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
} from "@/lib/local-owner-scope";
import { migrateLegacyPersonalDomainToGuest } from "@/lib/personal-data-ownership";

export function createSecureCustomThemeId(): string {
  if (typeof crypto.randomUUID === "function") return `ct_${crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ct_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

export function useCustomThemes(scope: LocalOwnerScope | null) {
  const [collection, setCollection] = useState<CustomThemeCollection>({ version: 1, themes: [] });
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);
  const generation = useRef(0);
  const visible = isHydratedOwnerVisible(scope?.key ?? null, hydratedScopeKey);

  useEffect(() => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    queueMicrotask(() => {
      if (!isCurrentOwnerGeneration(currentGeneration, generation.current)) return;
      setHydratedScopeKey(null);
      setCollection({ version: 1, themes: [] });
      if (!scope) return;
      if (scope.kind === "guest") {
        migrateLegacyPersonalDomainToGuest("themes", window.localStorage);
      }
      const read = readScopedCustomThemes(scope, window.localStorage);
      if (!isCurrentOwnerGeneration(currentGeneration, generation.current)) return;
      setCollection(read.status === "valid" ? read.data : { version: 1, themes: [] });
      setHydratedScopeKey(scope.key);
    });
  }, [scope]);

  const persist = useCallback((next: CustomThemeCollection) => {
    if (!scope || !visible) throw new Error("custom_theme_owner_unavailable");
    const result = writeScopedCustomThemes(scope, next, window.localStorage);
    if (!result.ok) throw new Error(`custom_theme_storage_${result.code}`);
    setCollection(next);
  }, [scope, visible]);

  const create = useCallback((draft: CustomThemeDraftValue): CustomThemeDefinition => {
    if (collection.themes.length >= MAX_CUSTOM_THEMES) throw new Error("custom_theme_limit");
    const theme = createCustomThemeDefinition(createSecureCustomThemeId(), isoNow(), draft);
    persist(appendCustomTheme(collection, theme));
    return theme;
  }, [collection, persist]);

  const update = useCallback((id: string, draft: CustomThemeDraftValue): CustomThemeDefinition => {
    const existing = collection.themes.find((theme) => theme.id === id);
    if (!existing) throw new Error("custom_theme_not_found");
    const updated = updateCustomThemeDefinition(existing, isoNow(), draft);
    persist(replaceCustomTheme(collection, updated));
    return updated;
  }, [collection, persist]);

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
    persist(deleteCustomTheme(collection, id));
  }, [collection, persist]);

  const reset = useCallback(() => {
    persist({ version: 1, themes: [] });
  }, [persist]);

  const replaceAll = useCallback((themes: readonly CustomThemeDefinition[]) => {
    persist(normalizeCustomThemeCollection({ version: 1, themes }));
  }, [persist]);

  return {
    themes: visible ? collection.themes : [],
    hydrated: visible,
    create,
    update,
    duplicate,
    rename,
    remove,
    reset,
    replaceAll,
  };
}
