"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import MediaDetailModal from "@/components/media-detail-modal";
import { ProfileActivity } from "@/components/profile/profile-activity";
import { ProfileFavorites } from "@/components/profile/profile-favorites";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileProgressionSummary } from "@/components/profile/profile-progression-summary";
import { UnifiedProfileEditor } from "@/components/profile/unified-profile-editor";
import { useAuth } from "@/hooks/use-auth";
import { useMediaLibrary } from "@/hooks/use-media-library";
import { usePersistedPreferences } from "@/hooks/use-persisted-preferences";
import { useXpProgression } from "@/hooks/use-xp-progression";
import { defaultProfilePresentationPreferences } from "@/lib/personalization/defaults";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";
import { resolveProfileDisplayName, resolveSelectedTitle } from "@/lib/profile-preferences";
import type { SocialProfileEditorData } from "@/lib/social/types";
import { publishOwnProfileSummary } from "@/lib/social/profile-summary";
import { calculateUserProgression } from "@/lib/user-progression";

export function ProfilePageClient({ initialMode = "view" }: { initialMode?: "view" | "edit" }) {
  const auth = useAuth();
  const { mediaList, progressLogs, isLoaded, toggleFavorite, incrementMedia, completeMedia, updateRating } = useMediaLibrary(auth.user?.id ?? null);
  const { profilePreferences, setProfilePreferences } = usePersistedPreferences();
  const legacyProgression = useMemo(() => calculateUserProgression(mediaList, progressLogs), [mediaList, progressLogs]);
  const { progression } = useXpProgression(auth.user?.id ?? null, legacyProgression);
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [cloud, setCloud] = useState<SocialProfileEditorData>();
  const [cloudState, setCloudState] = useState<"idle" | "loading" | "ready" | "offline">(auth.user ? "loading" : "idle");
  const [detailId, setDetailId] = useState<string | null>(null);

  const loadCloud = useCallback(async (): Promise<SocialProfileEditorData | undefined> => {
    if (!auth.configured || !auth.user) { setCloudState("idle"); return undefined; }
    setCloudState((current) => current === "ready" ? current : "loading");
    try {
      const response = await fetch("/api/social/profile", { cache: "no-store" });
      if (!response.ok) throw new Error("profile_unavailable");
      const next = await response.json() as SocialProfileEditorData;
      setCloud(next);
      if (next.profile) publishOwnProfileSummary(next.profile);
      setCloudState("ready");
      return next;
    } catch { setCloudState("offline"); return undefined; }
  }, [auth.configured, auth.user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadCloud owns the explicit remote loading state.
  useEffect(() => { void loadCloud(); }, [loadCloud]);

  const fallbackName = resolveProfileDisplayName(profilePreferences, auth.user);
  const selectedTitle = resolveSelectedTitle(profilePreferences, progression.title);
  const identity = resolveProfileIdentity({
    authenticated: Boolean(auth.user),
    localPreferences: profilePreferences,
    socialProfile: cloud?.profile,
    fallbackName,
    automaticTitle: progression.title,
  });
  const presentation = cloud?.profile?.presentation ?? defaultProfilePresentationPreferences();
  const detail = mediaList.find((item) => item.id === detailId) ?? null;

  if (!isLoaded) return <div className="app-panel h-64 animate-pulse rounded-3xl" aria-label="Profil yükleniyor" />;

  if (mode === "edit") {
    if (cloudState === "loading") return <div className="app-panel mx-auto h-64 max-w-6xl animate-pulse rounded-3xl" aria-label="Profil editörü yükleniyor" />;
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Profili düzenle</h1><p className="mt-1 text-sm text-[var(--app-text-muted)]">Tek kimlik; cloud varsa ana kaynak, local veri güvenli fallback.</p></div><button type="button" onClick={() => setMode("view")} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">Profile dön</button></div>
        <UnifiedProfileEditor initialData={cloud} authConfigured={auth.configured} authenticated={Boolean(auth.user)} userId={auth.user?.id ?? null} localPreferences={profilePreferences} onLocalPreferencesChange={setProfilePreferences} profileName={identity.displayName} selectedTitle={selectedTitle} media={mediaList} progression={progression} socialAvatarUrl={cloud?.profile?.avatarUrl} onProfileChanged={loadCloud} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {cloudState === "offline" && <p role="status" className="rounded-xl border border-[var(--app-warning)] bg-[var(--app-warning-soft)] px-4 py-3 text-sm text-[var(--app-warning)]">Cloud profil bilgileri şu anda yenilenemedi. Son bilinen yerel kimlik gösteriliyor.</p>}
      {cloudState === "loading" && <p role="status" className="text-sm text-[var(--app-text-muted)]">Cloud profil kimliği arka planda yenileniyor…</p>}
      <ProfileHero
        variant="self"
        identity={identity}
        presentation={presentation}
        localPreferences={profilePreferences}
        progression={{ level: progression.level, totalXp: progression.totalXp, currentLevelXp: progression.currentLevelXp, nextLevelXp: progression.nextLevelXp, progressPercent: progression.progressPercent, tier: progression.tier, dominantWorld: progression.dominantWorld }}
        visibilityLabel={cloud?.profile ? cloud.profile.visibilityMode : "Yerel profil"}
        publicProfileHref={cloud?.profile?.username ? `/u/${cloud.profile.username}` : undefined}
        onEdit={() => setMode("edit")}
        setupMessage={auth.user && !cloud?.profile ? "Cloud sosyal profil henüz oluşturulmadı. Yerel kimliğin korunuyor; düzenle bölümünden kontrollü olarak oluşturabilirsin." : undefined}
      />
      {identity.bio && <section className="app-card rounded-2xl border p-5"><h2 className="text-sm font-semibold">Hakkında</h2><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--app-text-secondary)]">{identity.bio}</p></section>}
      <div className="grid gap-5 xl:grid-cols-2"><ProfileFavorites items={mediaList} onOpen={(item) => setDetailId(item.id)} /><ProfileActivity logs={progressLogs} /></div>
      <ProfileProgressionSummary progression={progression} />
      <MediaDetailModal media={detail} progressLogs={progressLogs.filter((log) => log.mediaId === detailId)} open={Boolean(detail)} onClose={() => setDetailId(null)} onEdit={() => undefined} onDelete={() => undefined} onToggleFavorite={toggleFavorite} onIncrementProgress={incrementMedia} onComplete={completeMedia} onUpdateRating={updateRating} />
    </div>
  );
}
