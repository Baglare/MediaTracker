import Link from "next/link";
import type { ReactNode } from "react";

import { AppPageHeader } from "@/components/app-shell/app-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { PageHeroTone } from "@/components/ui/page-hero";

export function SocialPageShell({
  title,
  subtitle,
  children,
  actions,
  icon,
  eyebrow,
  summary,
  tone = "social",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  eyebrow?: string;
  summary?: ReactNode;
  tone?: PageHeroTone;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <AppPageHeader title={title} subtitle={subtitle} actions={actions} icon={icon} eyebrow={eyebrow} summary={summary} tone={tone} />
      {children}
    </div>
  );
}

export function SocialSignInRequired({ configured = true }: { configured?: boolean }) {
  return (
    <SocialPageShell title="Sosyal alan" subtitle={configured ? "Bu alan için hesabınla giriş yapmalısın." : "Supabase yapılandırılmadığı için sosyal alan kullanılamıyor."}>
      <EmptyState
        title={configured ? "Sosyal alan için oturum gerekli" : "Sosyal servis yapılandırılmamış"}
        description="MediaTracker yerel modda çalışmaya devam eder. Hesap bağlantını Ayarlar bölümünden yönetebilirsin."
        primaryAction={<Link href="/?tab=settings" className="app-primary-action rounded-lg px-3 py-2 text-sm font-medium">Hesap ayarlarını aç</Link>}
      />
    </SocialPageShell>
  );
}
