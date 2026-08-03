"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ProfileHero } from "@/components/profile/profile-hero";
import { LoadingState } from "@/components/ui/loading-state";
import { useAuth } from "@/hooks/use-auth";
import { usePersistedPreferences } from "@/hooks/use-persisted-preferences";
import { useXpProgression } from "@/hooks/use-xp-progression";
import { defaultProfilePresentationPreferences } from "@/lib/personalization/defaults";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";
import { resolveProfileDisplayName, resolveSelectedTitle } from "@/lib/profile-preferences";
import { publishOwnProfileSummary, type OwnProfileHeroData } from "@/lib/social/profile-summary";
import { loadOwnProfileCache, readOwnProfileCache, updateOwnProfileCache } from "@/lib/social/own-profile-cache";
import { calculateUserProgression, type UserProgression } from "@/lib/user-progression";

const EMPTY_PROGRESSION = calculateUserProgression([], []);

const ProfileViewContent = dynamic(
  () => import("@/components/profile/profile-view-content").then((module) => module.ProfileViewContent),
  { loading: () => <div className="grid gap-5 xl:grid-cols-2"><LoadingState label="Favoriler hazırlanıyor…" rows={4}/><LoadingState label="Aktiviteler hazırlanıyor…" rows={4}/></div> },
);

const ProfileEditorPanel = dynamic(
  () => import("@/components/profile/profile-editor-panel").then((module) => module.ProfileEditorPanel),
  { loading: () => <LoadingState label="Profil editörü hazırlanıyor…" rows={6}/> },
);

export function ProfilePageClient({ initialMode = "view" }: { initialMode?: "view" | "edit" }) {
  const router = useRouter();
  const auth = useAuth();
  const { profilePreferences, setProfilePreferences } = usePersistedPreferences();
  const mode = initialMode;
  const [heroData, setHeroData] = useState<OwnProfileHeroData>();
  const [heroOwnerId, setHeroOwnerId] = useState<string | null>(null);
  const [cloudState, setCloudState] = useState<"idle" | "loading" | "ready" | "offline">(auth.user ? "loading" : "idle");
  const [localProgression, setLocalProgression] = useState<UserProgression>(EMPTY_PROGRESSION);
  const { progression, summary } = useXpProgression(auth.user?.id ?? null, localProgression);

  useEffect(() => {
    if (!auth.configured || !auth.user) {
      queueMicrotask(() => {
        setHeroOwnerId(null);
        setCloudState("idle");
        setHeroData(undefined);
      });
      return;
    }
    const ownerId = auth.user.id;
    const controller = new AbortController();
    const cached = readOwnProfileCache<OwnProfileHeroData>(ownerId, "hero");
    queueMicrotask(() => {
      setHeroOwnerId(ownerId);
      setHeroData(cached);
      setCloudState(cached ? "ready" : "loading");
    });
    loadOwnProfileCache({
      ownerId,
      resource: "hero",
      fetcher: async () => {
        const response = await fetch("/api/social/profile/hero", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("profile_hero_unavailable");
        return response.json() as Promise<OwnProfileHeroData>;
      },
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        setHeroData(next);
        updateOwnProfileCache(ownerId, next);
        publishOwnProfileSummary(next);
        setCloudState("ready");
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setCloudState("offline"); });
    return () => controller.abort();
  }, [auth.configured, auth.user]);

  const fallbackName = resolveProfileDisplayName(profilePreferences, auth.user);
  const selectedTitle = resolveSelectedTitle(profilePreferences, progression.title);
  const visibleHeroData = auth.user && heroOwnerId === auth.user.id
    ? heroData
    : undefined;
  const identity = resolveProfileIdentity({
    authenticated: Boolean(auth.user),
    localPreferences: profilePreferences,
    socialProfile: visibleHeroData,
    fallbackName,
    automaticTitle: progression.title,
  });
  const presentation = visibleHeroData?.presentation ?? defaultProfilePresentationPreferences();
  const heroProgression = useMemo(() => ({
    level: progression.level,
    totalXp: progression.totalXp,
    currentLevelXp: progression.currentLevelXp,
    nextLevelXp: progression.nextLevelXp,
    progressPercent: progression.progressPercent,
    tier: progression.tier,
    dominantWorld: progression.dominantWorld,
  }), [progression]);
  const updateLocalProgression = useCallback((next: UserProgression) => setLocalProgression(next), []);

  function changeMode(next: "view" | "edit") {
    router.replace(next === "edit" ? "/profile?mode=edit" : "/profile", { scroll: false });
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
        progression={heroProgression}
        visibilityLabel={visibleHeroData?.visibilityMode ?? "Yerel profil"}
        publicProfileHref={visibleHeroData?.username ? `/u/${visibleHeroData.username}` : undefined}
        onEdit={() => changeMode("edit")}
        setupMessage={auth.user && cloudState === "ready" && !visibleHeroData?.username ? "Cloud sosyal profil henüz oluşturulmadı. Yerel kimliğin korunuyor; düzenle bölümünden kontrollü olarak oluşturabilirsin." : undefined}
      />
      {identity.bio && <section className="app-card rounded-2xl border p-5"><h2 className="text-sm font-semibold">Hakkında</h2><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--app-text-secondary)]">{identity.bio}</p></section>}
      {mode === "edit" ? (
        <ProfileEditorPanel authConfigured={auth.configured} authenticated={Boolean(auth.user)} userId={auth.loading ? undefined : auth.user?.id ?? null} localPreferences={profilePreferences} onLocalPreferencesChange={setProfilePreferences} profileName={identity.displayName} selectedTitle={selectedTitle} progression={summary ? progression : undefined} onClose={() => changeMode("view")} />
      ) : (
        <ProfileViewContent userId={auth.loading ? undefined : auth.user?.id ?? null} remoteProgression={summary ? progression : undefined} onLocalProgression={updateLocalProgression} />
      )}
    </div>
  );
}
