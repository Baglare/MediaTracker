// ============================================
// Online Arama (TMDB) Bileşeni — V1 Devre Dışı
// ============================================
// TMDB live erişimi v1 policy ile kapalı; future enablement ayrı review gerektirir.
// Kod silinmedi, ileride geri döndürülebilir.

"use client";

import { Globe, AlertTriangle } from "lucide-react";

export default function OnlineSearch() {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/30 rounded-xl border border-zinc-800/30 opacity-60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/5 flex items-center justify-center">
            <Globe className="w-4 h-4 text-sky-500/40" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-zinc-400">
              TMDB ile Ara
            </span>
            <p className="text-[11px] text-zinc-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              TMDB canlı araması v1’de kapalı; gelecekte açılması ayrı inceleme gerektirir
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
