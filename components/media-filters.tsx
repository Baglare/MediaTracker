// ============================================
// Medya Filtreleme Bileşenleri (R18.1)
// ============================================
// R18.1: Eski tek "MediaFilters" paneli üç bloktan (Dünya / Tür / Durum)
// ibaretti; "Tür" bloğu Doğu/Kadraj/Arşiv arasında simetrisiz ve WorldHero
// alt pill'leri ile fonksiyon olarak çakışıyordu. Bu turda:
//   - Tür bloğu **kaldırıldı**. Tür seçimi artık tamamen WorldHero alt
//     pill'leri üzerinden yapılır (Doğu→eastSubFilter, Kadraj/Arşiv→typeFilter).
//   - Dünya filtresi daha belirgin bir **segmented control**'e (`WorldSwitcher`)
//     dönüştürüldü; LibraryControlBar'da öne çıkar.
//   - Durum filtresi `StatusFilterRow` adıyla bağımsız, sakin bir alt-satır
//     olarak ayrıldı; sayfa hiyerarşisinde WorldHero'nun **altına** yerleşir.
//
// Tip ve değer setleri korunur (R18 normalize'ı, world-hero ve page.tsx
// hâlâ bu tipleri tüketir). State semantikleri aynı; sadece kompozisyon değişti.

"use client";

import { MediaStatus } from "@/lib/types";

// V5A.1 / R9: Üst seviye "Dünya" filtresi.
// "all"     — Tümü
// "east"    — Doğu (anime + manga + novel; light/web/visual novel dahil)
// "screen"  — Kadraj (tv + movie + miniseries/documentary benzeri ekran medyaları)
// "library" — Arşiv (book — klasik kitap/okuma)
export type ThemeFilter = "all" | "east" | "screen" | "library";

// V5A.1: Doğu seçiliyken aktifleşen ikinci seviye alt filtre.
export type EastSubFilter = "all" | "anime" | "manga" | "novel";

// ----- Dünya switcher (R18.1) -----

interface WorldSwitcherProps {
  activeTheme: ThemeFilter;
  onThemeChange: (theme: ThemeFilter) => void;
}

const WORLD_OPTIONS: { label: string; value: ThemeFilter; icon: string }[] = [
  { label: "Tümü", value: "all", icon: "🌐" },
  { label: "Doğu", value: "east", icon: "🏯" },
  { label: "Kadraj", value: "screen", icon: "🎞️" },
  { label: "Arşiv", value: "library", icon: "📚" },
];

/**
 * R18.1: Dünya filtresi artık küçük bir filtre chip'i değil; LibraryControlBar
 * altında öne çıkan bir segmented control. Aktif Dünya `--w-*` token'larına
 * bağlanır (R12) — "Tümü" iken nötr zinc, bir dünya seçili iken o dünyanın
 * tonu. WorldHero ile aynı renk kimliğini paylaşır.
 */
export function WorldSwitcher({ activeTheme, onThemeChange }: WorldSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Dünya"
      // R20: Mobilde wrap yerine yatay scroll (parent overflow-x-auto'lar).
      // Pill'ler shrink etmesin; aktif/pasif state aynı genişlikte ve net.
      // sm+'da kontrol bar dar olursa wrap'a izin verilir.
      className="inline-flex flex-nowrap sm:flex-wrap items-center gap-1 rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-1 w-max sm:w-auto"
    >
      {WORLD_OPTIONS.map((opt) => {
        const isActive = activeTheme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onThemeChange(opt.value)}
            className={`group inline-flex shrink-0 items-center gap-1.5 px-3 h-9 sm:h-auto sm:py-1.5 rounded-lg text-[12.5px] font-medium tracking-wide transition-colors cursor-pointer ${
              isActive
                ? "bg-[var(--w-soft)] text-[var(--w-primary-strong)] ring-1 ring-[color-mix(in_srgb,var(--w-primary)_40%,transparent)]"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
            }`}
          >
            <span className="text-sm leading-none">{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ----- Durum filtresi (R18.1) -----

interface StatusFilterRowProps {
  activeStatus: MediaStatus | "active" | "all";
  onStatusChange: (status: MediaStatus | "active" | "all") => void;
}

const STATUS_OPTIONS: { label: string; value: MediaStatus | "active" | "all" }[] = [
  { label: "Tümü", value: "all" },
  { label: "Devam Ediyor", value: "active" },
  { label: "Planlandı", value: "planning" },
  { label: "Tamamlandı", value: "completed" },
  { label: "Duraklatıldı", value: "paused" },
  { label: "Bırakıldı", value: "dropped" },
];

/**
 * R18.1: Eski "Durum" pill grubu WorldHero'nun altına bağımsız bir satır
 * olarak taşındı. "Daha sakin, modern, kompakt" tasarım hedefi:
 *   - Eyebrow label ("Durum") küçük + uppercase tracking
 *   - Pill'ler hafif, ring-only; aktif state ince fuchsia accent
 *   - flex-wrap ile dar ekranda alt satıra düşer
 */
export function StatusFilterRow({ activeStatus, onStatusChange }: StatusFilterRowProps) {
  return (
    // R20: Mobilde "Durum" label'ı üstte, chip'ler altta yatay scroll'a
    // (flex-nowrap + overflow-x-auto) düşer. sm+'da eski tek-satır flex-wrap
    // davranışı korunur. Chip yüksekliği h-8 → daha rahat dokunma.
    <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-y-1.5 sm:gap-x-3 sm:gap-y-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 shrink-0">
        Durum
      </span>
      <div className="-mx-1 flex sm:flex-wrap items-center gap-1.5 overflow-x-auto sm:overflow-visible scrollbar-hide px-1 touch-pan-x">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = activeStatus === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStatusChange(opt.value)}
              className={`shrink-0 inline-flex items-center px-2.5 h-8 sm:h-auto sm:py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-500/40"
                  : "bg-zinc-900/40 text-zinc-400 ring-1 ring-zinc-800 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
              aria-pressed={isActive}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
