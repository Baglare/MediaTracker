"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";

import { useAuth } from "./use-auth";
import {
  DEFAULT_PROFILE_PREFERENCES,
  readScopedProfilePreferences,
  writeScopedProfilePreferences,
  type ProfilePreferences,
} from "@/lib/profile-preferences";
import {
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
  resolveLocalOwnerScope,
} from "@/lib/local-owner-scope";
import { migrateLegacyPersonalDomainToGuest } from "@/lib/personal-data-ownership";

export const PROFILE_PREFERENCES_CHANGED_EVENT =
  "media-tracker:owned-profile-preferences-changed";

export function useOwnedProfilePreferences() {
  const auth = useAuth();
  const scope = useMemo(
    () => resolveLocalOwnerScope(auth.loading ? undefined : auth.user?.id ?? null),
    [auth.loading, auth.user?.id],
  );
  const scopeKey = scope?.key ?? null;
  const generation = useRef(0);
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);
  const [storedPreferences, setStoredPreferences] = useState<ProfilePreferences>(
    DEFAULT_PROFILE_PREFERENCES,
  );
  const [storageError, setStorageError] = useState<string>();
  const visible = isHydratedOwnerVisible(scopeKey, hydratedScopeKey);

  useEffect(() => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    queueMicrotask(() => {
      if (!isCurrentOwnerGeneration(currentGeneration, generation.current)) return;
      setHydratedScopeKey(null);
      setStorageError(undefined);
      if (!scope) return;
      if (scope.kind === "guest") {
        migrateLegacyPersonalDomainToGuest("profile", window.localStorage);
      }
      const read = readScopedProfilePreferences(scope);
      if (!isCurrentOwnerGeneration(currentGeneration, generation.current)) return;
      setStoredPreferences(
        read.status === "valid" ? read.data : { ...DEFAULT_PROFILE_PREFERENCES },
      );
      if (read.status === "corrupt" || read.status === "owner_mismatch") {
        setStorageError(read.message);
      }
      setHydratedScopeKey(scope.key);
    });
  }, [scope, scopeKey]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{
        ownerScope: string;
        preferences: ProfilePreferences;
      }>).detail;
      if (detail?.ownerScope === scopeKey) {
        setStoredPreferences(detail.preferences);
      }
    };
    window.addEventListener(PROFILE_PREFERENCES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PROFILE_PREFERENCES_CHANGED_EVENT, onChanged);
  }, [scopeKey]);

  const setProfilePreferences = useCallback((
    action: SetStateAction<ProfilePreferences>,
  ) => {
    if (!scope || !visible) return;
    const next = typeof action === "function" ? action(storedPreferences) : action;
    const result = writeScopedProfilePreferences(scope, next);
    setStorageError(result.ok ? undefined : result.message);
    if (!result.ok) return;
    setStoredPreferences(next);
    queueMicrotask(() => window.dispatchEvent(new CustomEvent(
      PROFILE_PREFERENCES_CHANGED_EVENT,
      { detail: { ownerScope: scope.key, preferences: next } },
    )));
  }, [scope, storedPreferences, visible]);

  return {
    profilePreferences: visible
      ? storedPreferences
      : { ...DEFAULT_PROFILE_PREFERENCES },
    setProfilePreferences,
    hydrated: visible,
    storageError,
    ownerScope: scope,
  };
}
