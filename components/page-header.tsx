"use client";

// ============================================
// Page Header (R7: Layout Redesign)
// ============================================
// Sidebar/topbar shell ile tutarlı, tüm tab içeriklerinin başına gelen
// ortak başlık bandı. Kütüphanem sekmesindeki SectionHead'in büyük
// kardeşi; aynı amber ikon + zinc başlık dilini kullanır ve altında ince
// ayırıcı border bırakır. Sadece görsel; logic yok.

import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4 pb-3 mb-5 border-b border-zinc-800/60">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-zinc-900/60 ring-1 ring-zinc-800/80 grid place-items-center">
          <Icon className="w-4 h-4 text-amber-400/90" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-zinc-50 tracking-tight leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12px] text-zinc-500 leading-tight mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
