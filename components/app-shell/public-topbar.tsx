import { ArrowLeft, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export function PublicTopbar({ sticky = true, label = "Public navigasyon" }: {
  sticky?: boolean;
  label?: string;
}) {
  return (
    <header className={`${sticky ? "sticky top-0 z-40" : "relative"} border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-bg)_88%,transparent)] backdrop-blur-md`}>
      <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
          <BrandMark className="h-7 w-7" />
          <span className="font-semibold text-[var(--app-text-primary)]">MediaTracker</span>
        </Link>
        <nav aria-label={label} className="ml-auto flex min-w-0 items-center gap-1 text-sm sm:gap-2">
          <Link href="/privacy" aria-label="Gizlilik ve veri kullanımı" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] sm:px-3"><ShieldCheck className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Gizlilik</span></Link>
          <Link href="/people" aria-label="Kullanıcı ara" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] sm:px-3"><Users className="h-4 w-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Kullanıcı ara</span></Link>
          <Link href="/" aria-label="Uygulamaya dön" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] px-2 py-2 text-[var(--app-text-secondary)] hover:border-[var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] sm:px-3"><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Uygulamaya dön</span></Link>
        </nav>
      </div>
    </header>
  );
}
