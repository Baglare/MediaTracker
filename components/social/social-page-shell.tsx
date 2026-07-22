import Link from "next/link";
import type { ReactNode } from "react";

import { AppPageHeader } from "@/components/app-shell/app-page-header";

export function SocialPageShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <AppPageHeader title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

export function SocialSignInRequired({ configured = true }: { configured?: boolean }) {
  return (
    <SocialPageShell title="Sosyal alan" subtitle={configured ? "Bu alan için hesabınla giriş yapmalısın." : "Supabase yapılandırılmadığı için sosyal alan kullanılamıyor."}>
      <div className="app-panel rounded-2xl border p-6 text-sm text-[var(--app-text-muted)]">
        MediaTracker yerel modda çalışmaya devam eder. <Link href="/?tab=settings" className="text-[var(--app-accent-strong)]">Hesap ayarlarını aç →</Link>
      </div>
    </SocialPageShell>
  );
}
