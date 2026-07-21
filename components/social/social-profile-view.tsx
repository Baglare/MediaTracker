import Link from "next/link";

import { ProfileGrid } from "@/components/social/profile-grid";
import { SocialActions } from "@/components/social/social-actions";
import { YinYangConnection } from "@/components/social/yin-yang-connection";
import type { SocialProfilePayload } from "@/lib/social/types";

function StateCard({ title, text }: { title: string; text: string }) {
  return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4"><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-2 text-sm text-zinc-400">{text}</p><Link href="/people" className="mt-5 inline-block text-sm text-violet-300">Kullanıcı aramaya dön</Link></div></main>;
}

export function SocialProfileView({ payload }: { payload: SocialProfilePayload }) {
  if (payload.status === "not_configured") return <StateCard title="Sosyal sistem yapılandırılmamış" text="MediaTracker yerel modda çalışmaya devam ediyor; sosyal sayfalar için Supabase yapılandırması gerekli." />;
  if (payload.status === "personal") return <StateCard title="Kişisel profil" text="Bu profil kişisel olarak kullanılıyor." />;
  if (payload.status === "unavailable") return <StateCard title="Profil kullanılamıyor" text="Bu profile şu anda erişilemiyor." />;
  if (payload.status !== "available" || !payload.profile || !payload.relationship) return <StateCard title="Profil bulunamadı" text="Kullanıcı adı mevcut değil veya profil kaldırılmış." />;
  const profile = payload.profile;
  return <main className="min-h-screen bg-zinc-950 text-zinc-100">
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Link href="/people" className="mb-4 inline-block text-sm text-zinc-400 hover:text-zinc-200">← Kullanıcı ara</Link>
      <header className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="h-36 bg-gradient-to-br from-violet-950 via-zinc-900 to-zinc-950 bg-cover bg-center sm:h-52" style={profile.bannerUrl ? { backgroundImage: `url(${JSON.stringify(profile.bannerUrl).slice(1, -1)})` } : undefined} />
        <div className="px-5 pb-5 sm:px-8">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-zinc-900 bg-violet-900 text-2xl font-bold sm:h-28 sm:w-28">{profile.avatarUrl ? <span className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(profile.avatarUrl).slice(1, -1)})` }} role="img" aria-label={`${profile.displayName} avatarı`} /> : profile.displayName.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1 pb-1"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-bold">{profile.displayName}</h1><span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400">{profile.visibilityMode === "protected" ? "Korumalı" : "Herkese açık"}</span></div><p className="text-sm text-zinc-400">@{profile.username}{profile.selectedTitle ? ` · ${profile.selectedTitle}` : ""}</p></div>
          </div>
          {profile.bio && <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm text-zinc-300">{profile.bio}</p>}
          <p className="mt-2 text-xs text-zinc-500">{[profile.location, profile.language?.toUpperCase(), `Katılım ${new Date(profile.joinedAt).toLocaleDateString("tr-TR")}`].filter(Boolean).join(" · ")}</p>
          <div className="mt-5 flex flex-col justify-between gap-4 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center"><YinYangConnection relationship={payload.relationship} following={profile.followingCount} followers={profile.followerCount} /><SocialActions targetId={profile.id} state={payload.relationship.state} viewerFollowsOwner={payload.relationship.viewerFollowsOwner} ownerFollowsViewer={payload.relationship.ownerFollowsViewer} /></div>
        </div>
      </header>
      <div className="mt-5"><ProfileGrid payload={payload} /></div>
    </div>
  </main>;
}
