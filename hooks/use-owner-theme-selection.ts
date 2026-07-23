"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "./use-auth";
import {
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
  resolveLocalOwnerScope,
} from "@/lib/local-owner-scope";
import {
  readOwnerThemeSelection,
  writeOwnerThemeSelection,
} from "@/lib/personalization/owner-theme-selection";
import type { ThemeSelection } from "@/lib/personalization/types";
import { migrateLegacyPersonalDomainToGuest } from "@/lib/personal-data-ownership";

export function useOwnerThemeSelection() {
  const auth = useAuth();
  const scope = useMemo(
    () => resolveLocalOwnerScope(auth.loading ? undefined : auth.user?.id ?? null),
    [auth.loading, auth.user?.id],
  );
  const [selection, setSelectionState] = useState<ThemeSelection | null>(null);
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);
  const generation = useRef(0);
  const visible = isHydratedOwnerVisible(scope?.key ?? null, hydratedScopeKey);

  useEffect(() => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    queueMicrotask(() => {
      if (!isCurrentOwnerGeneration(currentGeneration, generation.current)) return;
      setHydratedScopeKey(null);
      setSelectionState(null);
      if (!scope) return;
      if (scope.kind === "guest") {
        migrateLegacyPersonalDomainToGuest("themes", window.localStorage);
      }
      const read = readOwnerThemeSelection(scope);
      if (!isCurrentOwnerGeneration(currentGeneration, generation.current)) return;
      setSelectionState(read.status === "valid" ? read.data.selection : null);
      setHydratedScopeKey(scope.key);
    });
  }, [scope]);

  const setSelection = useCallback((next: ThemeSelection | null) => {
    if (!scope || !visible) return false;
    const result = writeOwnerThemeSelection(scope, next);
    if (!result.ok) return false;
    setSelectionState(next);
    return true;
  }, [scope, visible]);

  return {
    scope,
    selection: visible ? selection : null,
    hydrated: visible,
    setSelection,
  };
}
