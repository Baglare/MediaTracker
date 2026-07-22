import Link from "next/link";
import type { ReactNode } from "react";

import { NotificationBadge } from "@/components/social/notification-badge";

export function SocialPageShell({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){
  return <main className="app-page min-h-screen px-4 py-6"><div className="mx-auto max-w-6xl">
    <nav aria-label="Sosyal navigasyon" className="mb-6 flex flex-wrap items-center gap-2 text-sm"><Link href="/" className="mr-2 text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)]">← MediaTracker</Link><Link href="/feed" className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 hover:border-[var(--app-accent)]">Akış</Link><Link href="/recommendations" className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 hover:border-[var(--app-accent)]">Öneriler</Link><Link href="/notifications" className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 py-1.5 hover:border-[var(--app-accent)]">Bildirimler <NotificationBadge /></Link><Link href="/people" className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 hover:border-[var(--app-accent)]">Kullanıcı Ara</Link><Link href="/progression" className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 hover:border-[var(--app-accent)]">XP V2</Link></nav>
    <header className="mb-6"><h1 className="text-3xl font-bold text-[var(--app-text-primary)]">{title}</h1><p className="mt-2 text-sm text-[var(--app-text-muted)]">{subtitle}</p></header>{children}
  </div></main>;
}

export function SocialSignInRequired({configured=true}:{configured?:boolean}){
  return <SocialPageShell title="Sosyal alan" subtitle={configured?"Bu alan için hesabınla giriş yapmalısın.":"Supabase yapılandırılmadığı için sosyal alan kullanılamıyor."}><div className="app-panel rounded-2xl border p-6 text-sm text-[var(--app-text-muted)]"><Link href="/" className="text-[var(--app-accent-strong)]">MediaTracker’a dön ve hesap panelini aç →</Link></div></SocialPageShell>;
}
