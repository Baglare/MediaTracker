import Link from "next/link";
import type { ReactNode } from "react";

import { NotificationBadge } from "@/components/social/notification-badge";

export function SocialPageShell({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){
  return <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100"><div className="mx-auto max-w-6xl">
    <nav aria-label="Sosyal navigasyon" className="mb-6 flex flex-wrap items-center gap-2 text-sm"><Link href="/" className="mr-2 text-zinc-400 hover:text-zinc-200">← MediaTracker</Link><Link href="/feed" className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:border-violet-500/40">Akış</Link><Link href="/recommendations" className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:border-violet-500/40">Öneriler</Link><Link href="/notifications" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 hover:border-violet-500/40">Bildirimler <NotificationBadge /></Link><Link href="/people" className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:border-violet-500/40">Kullanıcı Ara</Link><Link href="/progression" className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:border-amber-500/40">XP V2</Link></nav>
    <header className="mb-6"><h1 className="text-3xl font-bold">{title}</h1><p className="mt-2 text-sm text-zinc-400">{subtitle}</p></header>{children}
  </div></main>;
}

export function SocialSignInRequired({configured=true}:{configured?:boolean}){
  return <SocialPageShell title="Sosyal alan" subtitle={configured?"Bu alan için hesabınla giriş yapmalısın.":"Supabase yapılandırılmadığı için sosyal alan kullanılamıyor."}><div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400"><Link href="/" className="text-violet-300">MediaTracker’a dön ve hesap panelini aç →</Link></div></SocialPageShell>;
}
