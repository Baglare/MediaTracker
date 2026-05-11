"use client";

// ============================================
// Right Rail Container (R1: Layout Redesign)
// ============================================
// İskelet. R1 turunda yalnızca container + 3 boş "widget" placeholder'ı
// duruyor. İçerik (Genel İlerleme ringi, Günlük Hedef, Yaklaşan Bölümler,
// AI Önerilen Devam, Son Aktiviteler, Quote) sonraki faza bırakıldı.
//
// xl (≥1280px) altında gizleniyor; main column daha rahat nefes alsın.

import { Target, Activity, Calendar } from "lucide-react";

function WidgetSkeleton({
  title,
  icon: Icon,
  eyebrow,
  children,
}: {
  title: string;
  icon: typeof Target;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 tracking-tight">
          <Icon className="w-3.5 h-3.5 text-amber-400/80" />
          {title}
        </div>
        {eyebrow && (
          <span className="text-[10px] font-mono tracking-widest text-zinc-500">
            {eyebrow}
          </span>
        )}
      </div>
      <div className="text-xs text-zinc-500">{children ?? "Yakında"}</div>
    </div>
  );
}

export default function RightRail() {
  return (
    <aside
      className="hidden xl:flex sticky top-0 h-screen w-80 shrink-0 flex-col gap-3 border-l border-zinc-800/60 bg-zinc-950/40 px-4 py-5 overflow-y-auto"
      aria-label="Sağ panel"
    >
      <div className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase px-1">
        Bakış
      </div>

      <WidgetSkeleton title="Genel İlerleme" icon={Target} eyebrow="7 GÜN">
        Ring + kütüphane özet metrikleri burada olacak.
      </WidgetSkeleton>

      <WidgetSkeleton title="Günlük Hedef" icon={Activity}>
        Bölüm hedefi + haftalık seri görselleştirme.
      </WidgetSkeleton>

      <WidgetSkeleton title="Yaklaşan Bölümler" icon={Calendar}>
        TVMaze yayın takvimi + AniList airing.
      </WidgetSkeleton>

      <div className="mt-2 text-[11px] text-zinc-600 leading-relaxed px-1">
        Sağ panel widget&apos;ları sonraki turda detaylandırılacak.
      </div>
    </aside>
  );
}
