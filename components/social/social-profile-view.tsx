import Link from "next/link";

import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileGrid } from "@/components/social/profile-grid";
import { SocialActions } from "@/components/social/social-actions";
import { YinYangConnection } from "@/components/social/yin-yang-connection";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection } from "@/components/ui/page-section";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";
import type { SocialProfilePayload } from "@/lib/social/types";

function StateCard({ title, text }: { title: string; text: string }) {
  return <div className="mx-auto grid min-h-[55vh] max-w-3xl place-items-center"><EmptyState title={title} description={text} primaryAction={<Link href="/people" className="app-primary-action rounded-lg px-3 py-2 text-sm font-medium">Kullanıcı aramaya dön</Link>}/></div>;
}

export function SocialProfileView({ payload }: { payload: SocialProfilePayload }) {
  if (payload.status === "not_configured") return <StateCard title="Sosyal sistem yapılandırılmamış" text="MediaTracker yerel modda çalışmaya devam ediyor; sosyal sayfalar için Supabase yapılandırması gerekli." />;
  if (payload.status === "personal") return <StateCard title="Kişisel profil" text="Bu profil kişisel olarak kullanılıyor." />;
  if (payload.status === "unavailable") return <StateCard title="Profil kullanılamıyor" text="Bu profile şu anda erişilemiyor." />;
  if (payload.status !== "available" || !payload.profile || !payload.relationship) return <StateCard title="Profil bulunamadı" text="Kullanıcı adı mevcut değil veya profil kaldırılmış." />;
  const profile = payload.profile;
  const identity = resolveProfileIdentity({ authenticated: true, socialProfile: profile, fallbackName: profile.username });
  const publicActions = payload.relationship.self ? (
    <Link href="/profile?mode=edit" className="app-primary-action rounded-xl px-4 py-2 text-sm font-semibold">Profili düzenle</Link>
  ) : (
    <div className="flex flex-col items-stretch gap-3 sm:items-end">
      <YinYangConnection relationship={payload.relationship} following={profile.followingCount} followers={profile.followerCount} />
      <SocialActions targetId={profile.id} state={payload.relationship.state} viewerFollowsOwner={payload.relationship.viewerFollowsOwner} ownerFollowsViewer={payload.relationship.ownerFollowsViewer} />
    </div>
  );
  const dominantWorld = payload.xp?.worlds.slice().sort((a, b) => b.xp - a.xp)[0]?.key;
  const dominantWorldSummary = payload.xp?.worlds.find((world) => world.key === dominantWorld);
  const progression = payload.xp
    ? { level: payload.xp.level ?? 1, totalXp: payload.xp.totalXp ?? 0, tier: dominantWorldSummary?.tier, dominantWorld, badges: payload.xp.badges }
    : payload.progression
      ? { level: payload.progression.level, totalXp: payload.progression.totalXp, tier: payload.progression.tier, dominantWorld: payload.progression.dominantWorld }
      : undefined;
  return (
    <div data-profile-palette={profile.presentation.paletteId} className="mx-auto w-full max-w-6xl space-y-5">
      <ProfileHero variant="public" identity={identity} presentation={profile.presentation} progression={progression} visibilityLabel={profile.visibilityMode === "protected" ? "Korumalı" : "Herkese açık"} location={profile.location} language={profile.language} joinedAt={`Katılım ${new Date(profile.joinedAt).toLocaleDateString("tr-TR")}`} actions={publicActions} />
      {identity.bio && <PageSection title="Hakkında"><p className="whitespace-pre-wrap text-sm text-[var(--app-text-secondary)]">{identity.bio}</p></PageSection>}
      {payload.relationship.self && <YinYangConnection relationship={payload.relationship} following={profile.followingCount} followers={profile.followerCount} />}
      <ProfileGrid payload={payload} />
    </div>
  );
}
