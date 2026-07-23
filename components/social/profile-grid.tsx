import Image from "next/image";
import type { CSSProperties } from "react";

import { ConnectionLists } from "@/components/social/connection-lists";
import type { ProfileModuleKey, SocialProfilePayload } from "@/lib/social/types";
import type { PublicXpSummary, XpBranchKey, XpWorldKey } from "@/lib/xp/types";

const TITLES: Record<ProfileModuleKey, string> = { favorites: "Favori Vitrini", current: "Şu Anda", stats: "Genel İstatistikler", progression: "Yolculuk Seviyesi", badges: "Rozet Vitrini", follows: "Bağlantılar", shared_lists: "Paylaşılan Listeler", shared_notes: "Paylaşılan Notlar", activity: "Son Aktiviteler" };
const SPANS = ["", "md:col-span-1", "md:col-span-2", "md:col-span-3", "md:col-span-4", "md:col-span-5", "md:col-span-6", "md:col-span-7", "md:col-span-8", "md:col-span-9", "md:col-span-10", "md:col-span-11", "md:col-span-12"];
const STARTS = ["md:col-start-1", "md:col-start-2", "md:col-start-3", "md:col-start-4", "md:col-start-5", "md:col-start-6", "md:col-start-7", "md:col-start-8", "md:col-start-9", "md:col-start-10", "md:col-start-11", "md:col-start-12"];

function MediaCards({ items }: { items: SocialProfilePayload["favorites"] }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{items.map((item) => <article key={`${item.externalSource}:${item.externalId}:${item.title}`} className="min-w-0"><div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[var(--app-surface-3)]">{item.coverUrl ? <Image src={item.coverUrl} alt="" fill sizes="160px" unoptimized className="object-cover" /> : <div className="grid h-full place-items-center text-2xl text-[var(--app-text-muted)]" aria-hidden="true">◆</div>}</div><p className="mt-1 truncate text-xs text-[var(--app-text-secondary)]">{item.title}</p></article>)}</div>;
}

function XpProgression({ xp }: { xp: PublicXpSummary }) {
  const worldLabels: Record<XpWorldKey,string> = { east: "Doğu", screen: "Kadraj", arch: "Arşiv" };
  const branchLabels: Record<XpBranchKey,string> = { tracker: "İz Sürücü", explorer: "Kaşif", critic: "Eleştirmen", curator: "Küratör", connector: "Bağ Kurucu" };
  return <div><p className="text-2xl font-bold text-[var(--profile-strong)]">Seviye {xp.level}</p><p className="text-sm text-[var(--app-text-secondary)]">{xp.selectedTitle ?? "Yolculuk devam ediyor"} · {xp.totalXp ?? 0} XP</p><div className="mt-3 grid grid-cols-3 gap-2 text-xs">{(Object.keys(worldLabels) as XpWorldKey[]).map((key)=>{const world=xp.worlds.find((item)=>item.key===key);return <div key={key} data-world={key} className="rounded-lg border border-[var(--w-border)] bg-[var(--w-soft)] p-2"><p className="font-medium text-[var(--w-primary-strong)]">{worldLabels[key]}</p><p className="text-[var(--app-text-muted)]">Sv. {world?.level??1}</p></div>;})}</div><div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">{(Object.keys(branchLabels) as XpBranchKey[]).map((key)=>{const branch=xp.branches.find((item)=>item.key===key);return <div key={key} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)] p-2"><p className="truncate text-[var(--app-text-secondary)]">{branchLabels[key]}</p><p className="text-[var(--app-text-muted)]">Sv. {branch?.level??1}</p></div>;})}</div>{xp.legacyImported&&<p className="mt-2 text-xs text-sky-300">Yerel ilerlemeden aktarım içerir.</p>}</div>;
}

export function ProfileGrid({ payload }: { payload: SocialProfilePayload }) {
  if (!payload.profile || !payload.relationship) return null;
  const profile = payload.profile;
  const relationship = payload.relationship;
  const modules = [...payload.modules].sort((a, b) => a.mobileOrder - b.mobileOrder);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:auto-rows-min">
      {modules.map((module) => {
        if ((module.moduleKey === "favorites" && payload.favorites.length === 0) || (module.moduleKey === "current" && payload.current.length === 0) || (module.moduleKey === "badges" && !payload.xp?.badges.length) || module.moduleKey === "shared_lists") return null;
        return <section key={module.moduleKey} style={{ "--social-grid-row": `${module.gridY + 1} / span ${module.gridHeight}` } as CSSProperties} className={`social-profile-grid-item app-section rounded-2xl border border-[var(--app-border)] p-4 ${SPANS[module.gridWidth]} ${STARTS[module.gridX]}`}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--app-text-primary)]">{TITLES[module.moduleKey]}</h2>
          {module.moduleKey === "favorites" && <MediaCards items={payload.favorites} />}
          {module.moduleKey === "current" && <MediaCards items={payload.current} />}
          {module.moduleKey === "stats" && payload.stats && <div className="grid grid-cols-2 gap-2 text-sm"><p>Toplam <strong>{payload.stats.totalMedia}</strong></p><p>Tamamlanan <strong>{payload.stats.completed}</strong></p><p>Devam eden <strong>{payload.stats.active}</strong></p><p>Favori <strong>{payload.stats.favorites}</strong></p><p className="col-span-2 text-xs text-[var(--app-text-muted)]">Kullanıcının yayımladığı toplu snapshot · {new Date(payload.stats.snapshotAt).toLocaleDateString("tr-TR")}</p></div>}
          {module.moduleKey === "progression" && payload.xp?.level !== undefined && <XpProgression xp={payload.xp} />}
          {module.moduleKey === "progression" && !payload.xp && payload.progression && <div><p className="text-2xl font-bold text-[var(--profile-strong)]">Seviye {payload.progression.level}</p><p className="text-sm text-[var(--app-text-secondary)]">{payload.progression.title} · {payload.progression.tier}</p><p className="mt-2 text-xs text-[var(--app-text-muted)]">Yerel progression verisinden yayımlanan, doğrulanmamış snapshot.</p></div>}
          {module.moduleKey === "badges" && payload.xp && <div className="grid gap-2 sm:grid-cols-2">{payload.xp.badges.map((badge)=><div key={badge.key} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-3"><p className="text-sm font-medium text-[var(--app-warning)]">{badge.name}</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">{badge.description}</p></div>)}</div>}
          {module.moduleKey === "follows" && <ConnectionLists ownerId={profile.id} self={relationship.self} />}
          {module.moduleKey === "shared_notes" && <div className="space-y-3">{payload.sharedNotes.map((note) => <article key={note.id} className="rounded-xl bg-[var(--app-surface-3)] p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{note.mediaTitle}</p>{note.containsSpoiler && <span className="text-xs text-amber-400">Spoiler</span>}</div>{note.containsSpoiler ? <details className="mt-2 text-sm text-[var(--app-text-muted)]"><summary className="cursor-pointer">Notu göster</summary><p className="mt-2 whitespace-pre-wrap">{note.content}</p></details> : <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--app-text-muted)]">{note.content}</p>}</article>)}</div>}
          {module.moduleKey === "activity" && <div className="space-y-2">{(payload.activity ?? []).map((activity) => <article key={activity.id} className="rounded-xl bg-[var(--app-surface-3)] p-3"><p className="text-sm"><strong>{activity.media.title}</strong> · {activity.eventType.replaceAll("_"," ")}</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">{new Date(activity.createdAt).toLocaleString("tr-TR")} · {activity.visibility}</p>{activity.text && <p className="mt-2 text-sm text-[var(--app-text-muted)]">{activity.text}</p>}</article>)}{(payload.activity ?? []).length===0&&<p className="text-sm text-[var(--app-text-muted)]">Görünür aktivite yok.</p>}</div>}
        </section>;
      })}
    </div>
  );
}
