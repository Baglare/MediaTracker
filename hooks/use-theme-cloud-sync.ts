"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "./use-auth";
import { createSecureCustomThemeId } from "./use-custom-themes";
import { useAppearanceRuntime } from "@/components/personalization/appearance-runtime";
import { useCustomThemesRuntime } from "@/components/personalization/custom-themes-runtime";
import {
  DEFAULT_THEME_CLOUD_SYNC_PREFERENCES,
  initialThemeSyncChoice,
  mergeThemeStates,
  normalizeThemeCloudState,
  readThemeCloudSyncPreferences,
  writeThemeCloudSyncPreferences,
  type InitialThemeSyncChoice,
  type ThemeCloudState,
  type ThemeCloudSyncPreferences,
} from "@/lib/personalization/theme-cloud-sync";

type SyncStatus = "idle" | "loading" | "syncing" | "conflict" | "error";

interface SyncResponse {
  conflict?: boolean;
  message?: string;
  state?: unknown;
}

function localSignature(
  themes: ReturnType<typeof useCustomThemesRuntime>["themes"],
  selection: ReturnType<typeof useAppearanceRuntime>["preferences"]["theme"],
): string {
  return JSON.stringify({ themes, selection });
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useThemeCloudSync() {
  const auth = useAuth();
  const appearance = useAppearanceRuntime();
  const customThemes = useCustomThemesRuntime();
  const [preferences, setPreferences] = useState<ThemeCloudSyncPreferences>(
    DEFAULT_THEME_CLOUD_SYNC_PREFERENCES,
  );
  const [hydrated, setHydrated] = useState(false);
  const [remote, setRemote] = useState<ThemeCloudState | null>(null);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [message, setMessage] = useState("Tema senkronizasyonu bu cihazda kapalı.");
  const [showInitialChoice, setShowInitialChoice] = useState(false);
  const lastSyncedSignature = useRef<string | null>(null);
  const initialCheckStarted = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device-local preference hydration
    setPreferences(readThemeCloudSyncPreferences(window.localStorage));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeThemeCloudSyncPreferences(window.localStorage, preferences);
  }, [hydrated, preferences]);

  const updatePreferences = useCallback((patch: Partial<ThemeCloudSyncPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch, version: 1 }));
  }, []);

  const fetchRemote = useCallback(async (): Promise<ThemeCloudState | null> => {
    if (!auth.user) return null;
    setStatus("loading");
    try {
      const response = await fetch("/api/personalization/themes/sync", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await responseJson(response);
      if (!response.ok) {
        const error = typeof (json as { message?: unknown } | null)?.message === "string"
          ? String((json as { message: string }).message)
          : "Bulut tema verisi alınamadı.";
        throw new Error(error);
      }
      const state = normalizeThemeCloudState(json);
      if (!state) throw new Error("Bulut tema verisi geçersiz.");
      setRemote(state);
      setStatus("idle");
      return state;
    } catch (error) {
      const next = error instanceof Error ? error.message : "Bulut tema verisi alınamadı.";
      setStatus("error");
      setMessage(next);
      updatePreferences({ lastError: next });
      return null;
    }
  }, [auth.user, updatePreferences]);

  const saveLocal = useCallback(async (
    expectedRevision: number,
    successMessage = "Tema değişiklikleri bulutla eşitlendi.",
    selection = appearance.preferences.theme,
    themes = customThemes.themes,
  ): Promise<boolean> => {
    if (!auth.user) return false;
    setStatus("syncing");
    try {
      const response = await fetch("/api/personalization/themes/sync", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision,
          activeThemeSelection: selection,
          customThemes: themes,
        }),
      });
      const json = await responseJson(response) as SyncResponse | null;
      if (response.status === 409) {
        const conflictState = normalizeThemeCloudState(json?.state);
        if (conflictState) setRemote(conflictState);
        setStatus("conflict");
        setMessage("Bulutta daha yeni tema değişiklikleri bulundu.");
        updatePreferences({
          pendingLocalChanges: true,
          lastError: "revision_conflict",
        });
        return false;
      }
      if (!response.ok) {
        throw new Error(typeof json?.message === "string"
          ? json.message
          : "Tema senkronizasyonu tamamlanamadı.");
      }
      const state = normalizeThemeCloudState(json?.state);
      if (!state) throw new Error("Bulut yanıtı doğrulanamadı.");
      setRemote(state);
      lastSyncedSignature.current = localSignature(themes, selection);
      updatePreferences({
        enabled: true,
        lastRemoteRevision: state.revision,
        lastSyncedAt: new Date().toISOString(),
        lastError: undefined,
        pendingLocalChanges: false,
      });
      setStatus("idle");
      setMessage(successMessage);
      return true;
    } catch (error) {
      const next = error instanceof Error ? error.message : "Tema senkronizasyonu tamamlanamadı.";
      setStatus("error");
      setMessage(`${next} Yerel temaların korunuyor.`);
      updatePreferences({ pendingLocalChanges: true, lastError: next });
      return false;
    }
  }, [
    appearance.preferences.theme,
    auth.user,
    customThemes.themes,
    updatePreferences,
  ]);

  const beginEnable = useCallback(async () => {
    if (!auth.user) {
      setMessage("Cihazlar arası tema senkronizasyonu için giriş yapmalısın.");
      return;
    }
    const state = await fetchRemote();
    if (!state) return;
    setShowInitialChoice(true);
    setMessage("Yerel ve bulut tema durumunu karşılaştırıp başlangıç yönünü seç.");
  }, [auth.user, fetchRemote]);

  const applyCloud = useCallback((state: ThemeCloudState) => {
    customThemes.replaceAll(state.customThemes);
    appearance.setThemeSelection(state.activeThemeSelection);
    lastSyncedSignature.current = localSignature(state.customThemes, state.activeThemeSelection);
  }, [appearance, customThemes]);

  const resolveInitial = useCallback(async (choice: InitialThemeSyncChoice | "cancel") => {
    if (choice === "cancel" || !remote) {
      setShowInitialChoice(false);
      setMessage("Tema senkronizasyonu etkinleştirilmedi.");
      return;
    }
    if (choice === "cloud") {
      applyCloud(remote);
      updatePreferences({
        enabled: true,
        lastRemoteRevision: remote.revision,
        lastSyncedAt: new Date().toISOString(),
        lastError: undefined,
        pendingLocalChanges: false,
      });
      setStatus("idle");
      setMessage("Buluttaki temalar bu cihaza indirildi.");
    } else if (choice === "merge") {
      const merged = mergeThemeStates(
        customThemes.themes,
        remote.customThemes,
        appearance.preferences.theme,
        remote.activeThemeSelection,
        createSecureCustomThemeId,
        new Date().toISOString(),
      );
      customThemes.replaceAll(merged.collection.themes);
      appearance.setThemeSelection(merged.activeThemeSelection);
      updatePreferences({
        enabled: true,
        lastRemoteRevision: remote.revision,
        pendingLocalChanges: true,
      });
      setMessage(merged.conflicts.length > 0
        ? `${merged.conflicts.length} ID çakışmasında bulut kopyası oluşturuldu. Birleştirilmiş durum buluta gönderiliyor.`
        : "Yerel ve bulut temaları birleştirildi.");
      await saveLocal(
        remote.revision,
        "Birleştirilmiş temalar buluta kaydedildi.",
        merged.activeThemeSelection,
        merged.collection.themes,
      );
    } else {
      updatePreferences({
        enabled: true,
        lastRemoteRevision: remote.revision,
        pendingLocalChanges: true,
      });
      await saveLocal(remote.revision, "Bu cihazdaki temalar buluta kaydedildi.");
    }
    setShowInitialChoice(false);
  }, [
    appearance,
    applyCloud,
    customThemes,
    remote,
    saveLocal,
    updatePreferences,
  ]);

  const refresh = useCallback(async () => {
    const state = await fetchRemote();
    if (!state) return;
    const knownRevision = preferences.lastRemoteRevision ?? 0;
    if (state.revision > knownRevision) {
      setStatus("conflict");
      setMessage("Bulutta daha yeni tema değişiklikleri bulundu. İncele, birleştir veya bir tarafı seç.");
    } else {
      setMessage("Bulut tema durumu güncel.");
    }
  }, [fetchRemote, preferences.lastRemoteRevision]);

  const useCloud = useCallback(() => {
    if (!remote) return;
    applyCloud(remote);
    updatePreferences({
      enabled: true,
      lastRemoteRevision: remote.revision,
      lastSyncedAt: new Date().toISOString(),
      lastError: undefined,
      pendingLocalChanges: false,
    });
    setStatus("idle");
    setMessage("Bulut sürümü bu cihaza uygulandı.");
  }, [applyCloud, remote, updatePreferences]);

  const forceDevice = useCallback(async () => {
    if (!remote) return;
    await saveLocal(remote.revision, "Bu cihazdaki tema durumu buluta yazıldı.");
  }, [remote, saveLocal]);

  const mergeConflict = useCallback(async () => {
    if (!remote) return;
    const merged = mergeThemeStates(
      customThemes.themes,
      remote.customThemes,
      appearance.preferences.theme,
      remote.activeThemeSelection,
      createSecureCustomThemeId,
      new Date().toISOString(),
    );
    customThemes.replaceAll(merged.collection.themes);
    appearance.setThemeSelection(merged.activeThemeSelection);
    updatePreferences({ pendingLocalChanges: true });
    await saveLocal(
      remote.revision,
      "Çakışmalar birleştirilip buluta kaydedildi.",
      merged.activeThemeSelection,
      merged.collection.themes,
    );
  }, [appearance, customThemes, remote, saveLocal, updatePreferences]);

  const disable = useCallback(() => {
    updatePreferences({ enabled: false, pendingLocalChanges: false, lastError: undefined });
    setStatus("idle");
    setShowInitialChoice(false);
    setMessage("Tema senkronizasyonu bu cihazda kapatıldı. Yerel ve bulut verileri korunuyor.");
  }, [updatePreferences]);

  const deleteCloud = useCallback(async () => {
    if (!auth.user) return false;
    setStatus("syncing");
    try {
      const response = await fetch("/api/personalization/themes/sync", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Bulut tema verisi silinemedi.");
      setRemote(null);
      updatePreferences({
        lastRemoteRevision: 0,
        lastSyncedAt: new Date().toISOString(),
        lastError: undefined,
        pendingLocalChanges: false,
      });
      setStatus("idle");
      setMessage("Bulut tema verisi silindi. Yerel temalar korunuyor.");
      return true;
    } catch (error) {
      const next = error instanceof Error ? error.message : "Bulut tema verisi silinemedi.";
      setStatus("error");
      setMessage(next);
      return false;
    }
  }, [auth.user, updatePreferences]);

  const signature = useMemo(() => (
    localSignature(customThemes.themes, appearance.preferences.theme)
  ), [appearance.preferences.theme, customThemes.themes]);

  useEffect(() => {
    if (!hydrated || !preferences.enabled || !auth.user || initialCheckStarted.current) return;
    initialCheckStarted.current = true;
    void fetchRemote().then((state) => {
      if (!state) return;
      const knownRevision = preferences.lastRemoteRevision ?? 0;
      if (state.revision > knownRevision) {
        setStatus("conflict");
        setMessage("Bulutta daha yeni tema değişiklikleri bulundu.");
      } else {
        lastSyncedSignature.current = signature;
        if (preferences.pendingLocalChanges) {
          void saveLocal(knownRevision);
        }
      }
    });
  }, [
    auth.user,
    fetchRemote,
    hydrated,
    preferences.enabled,
    preferences.lastRemoteRevision,
    preferences.pendingLocalChanges,
    saveLocal,
    signature,
  ]);

  useEffect(() => {
    if (!hydrated || !preferences.enabled || !auth.user || !remote) return;
    if (lastSyncedSignature.current === null) {
      lastSyncedSignature.current = signature;
      return;
    }
    if (signature === lastSyncedSignature.current || status !== "idle") return;
    updatePreferences({ pendingLocalChanges: true });
    const timer = window.setTimeout(() => {
      void saveLocal(preferences.lastRemoteRevision ?? 0);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    auth.user,
    hydrated,
    preferences.enabled,
    preferences.lastRemoteRevision,
    remote,
    saveLocal,
    signature,
    status,
    updatePreferences,
  ]);

  return {
    auth,
    preferences,
    remote,
    status,
    message,
    showInitialChoice,
    recommendedInitialChoice: initialThemeSyncChoice(
      customThemes.themes.length,
      remote?.customThemes.length ?? 0,
    ),
    beginEnable,
    resolveInitial,
    refresh,
    syncNow: () => saveLocal(preferences.lastRemoteRevision ?? 0),
    useCloud,
    forceDevice,
    mergeConflict,
    disable,
    deleteCloud,
  };
}
