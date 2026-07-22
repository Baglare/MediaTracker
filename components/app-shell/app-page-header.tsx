import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function AppPageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <header className="mb-6">
      <nav aria-label="İçerik yolu" className="mb-3 flex items-center gap-1.5 text-xs text-[var(--app-text-muted)]">
        <Link href="/" className="inline-flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
          <Home className="h-3.5 w-3.5" aria-hidden="true" /> MediaTracker
        </Link>
        <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
        <span aria-current="page">{title}</span>
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--app-text-primary)]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--app-text-muted)]">{subtitle}</p>
        </div>
        {actions}
      </div>
    </header>
  );
}
