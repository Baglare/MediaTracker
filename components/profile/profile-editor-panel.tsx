"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { UnifiedProfileEditor } from "@/components/profile/unified-profile-editor";
import { useMediaLibrary } from "@/hooks/use-media-library";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import { publishOwnProfileSummary } from "@/lib/social/profile-summary";
import { updateOwnProfileCache } from "@/lib/social/own-profile-cache";
import type { SocialProfileEditorData } from "@/lib/social/types";
import { calculateUserProgression, type UserProgression } from "@/lib/user-progression";

export function ProfileEditorPanel({ authConfigured, authenticated, userId, localPreferences, onLocalPreferencesChange, profileName, selectedTitle, progression, onClose }: {
  authConfigured: boolean;
  authenticated: boolean;
  userId: string | null | undefined;
  localPreferences: ProfilePreferences;
  onLocalPreferencesChange: (value: ProfilePreferences) => void;
  profileName: string;
  selectedTitle: string;
  progression?: UserProgression;
  onClose: () => void;
}) {
  const { mediaList, progressLogs, isLoaded } = useMediaLibrary(userId);
  const fallbackProgression = useMemo(() => calculateUserProgression(mediaList, progressLogs), [mediaList, progressLogs]);
  const [cloud, setCloud] = useState<SocialProfileEditorData>();
  const [state, setState] = useState<"loading" | "ready" | "offline">(!authenticated ? "ready" : "loading");

  const loadCloud = useCallback(async () => {
    if (!authConfigured || !authenticated) { setState("ready"); return undefined; }
    setState("loading");
    try {
      const response = await fetch("/api/social/profile", { cache: "no-store" });
      if (!response.ok) throw new Error("profile_unavailable");
      const next = await response.json() as SocialProfileEditorData;
      setCloud(next);
      if (next.profile && userId) {
        const summary = { ...next.profile, avatarTransform: next.profile.presentation.avatarTransform };
        updateOwnProfileCache(userId, summary);
        publishOwnProfileSummary(summary);
      }
      setState("ready");
      return next;
    } catch {
      setState("offline");
      return undefined;
    }
  }, [authConfigured, authenticated, userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadCloud owns the explicit remote editor state.
  useEffect(() => { void loadCloud(); }, [loadCloud]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Profili düzenle</h2><p className="mt-1 text-sm text-[var(--app-text-muted)]">Kimlik, sunum ve paylaşım ayarları yalnız bu modda yüklenir.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">Profile dön</button></div>
      {state === "loading" && <div className="app-panel h-64 animate-pulse rounded-3xl" aria-label="Profil editörü yükleniyor" />}
      {state === "offline" && <p role="alert" className="rounded-xl border border-[var(--app-warning)] bg-[var(--app-warning-soft)] px-4 py-3 text-sm text-[var(--app-warning)]">Cloud editör verileri şu anda yüklenemedi. Yerel kimlik düzenleme alanı kullanılabilir.</p>}
      {state !== "loading" && isLoaded && <UnifiedProfileEditor initialData={cloud} authConfigured={authConfigured} authenticated={authenticated} userId={userId ?? null} localPreferences={localPreferences} onLocalPreferencesChange={onLocalPreferencesChange} profileName={profileName} selectedTitle={selectedTitle} media={mediaList} progression={progression ?? fallbackProgression} socialAvatarUrl={cloud?.profile?.avatarUrl} onProfileChanged={loadCloud} />}
      {state !== "loading" && !isLoaded && <div className="app-panel h-40 animate-pulse rounded-2xl" aria-label="Yerel profil verileri yükleniyor" />}
    </div>
  );
}
