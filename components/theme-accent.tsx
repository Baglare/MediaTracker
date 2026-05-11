// ============================================
// V5A.3 — Theme Accent yardımcısı
// ============================================
// MediaCard ve SeriesGroupCard kartlarının theme/subType bilgisine göre
// küçük rozet + accent tonu almasına yarar. Sadece OKUMA yönünde:
// withMediaClassification ile fallback değerleri hesaplar; veriyi mutate etmez.
// Bu turda sadece minimal accent + rozet — animasyon, motif, redesign yok.

"use client";

import type { ReactElement } from "react";
import type { MediaItem, MediaSubType, MediaTheme } from "@/lib/types";
import { withMediaClassification } from "@/lib/types";

// V5A.5: resolveThemeAccent / ThemeSubBadge artık Quick Search sonuçları gibi
// MediaItem olmayan ham nesnelerle de çalışıyor. withMediaClassification zaten
// Partial<MediaItem> kabul ediyor; burada da aynı geniş tipi kullanıyoruz.
type ClassifiableInput = Partial<MediaItem> & {
  metadata?: Record<string, unknown> | null;
};

// ------ Inline SVG ikonlar (east-theme-header ile aynı dil) ------

function KatanaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 21L19 5" />
      <path d="M19 5l2 2-2 2" />
    </svg>
  );
}

function YinYangIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path
        d="M12 3a4.5 4.5 0 010 9 4.5 4.5 0 000 9"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function ScrollBrushIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 19c2-3 6-4 9-2 2 1 3 0 5-3" />
      <path d="M14 5l4 4-2 2-4-4z" />
    </svg>
  );
}

// ------ Sub-type → okunabilir rozet etiketi ------
const SUB_TYPE_LABEL: Partial<Record<MediaSubType, string>> = {
  anime_tv: "Anime · TV",
  anime_movie: "Anime · Film",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  light_novel: "Light Novel",
  web_novel: "Web Novel",
  visual_novel: "Visual Novel",
  serialized_novel: "Novel",
  // tv_series / movie / book için rozet gösterme — type rozeti zaten var.
};

// Doğu üç ana ailesinin accent paleti.
// "amber/fuchsia" Anime, "teal/emerald" Manga, "amber/stone" Novel.
type EastFamily = "anime" | "manga" | "novel";

interface EastAccent {
  family: EastFamily;
  // Üst accent line gradient (kart üstündeki ince çizgi için).
  topGradient: string;
  // Rozet için tailwind sınıfları.
  badge: string;
  // SeriesGroupCard sol kenar gradyanı.
  groupSideGradient: string;
  // SeriesGroupCard ring rengi (open state hariç).
  groupRing: string;
  Icon: (props: { className?: string }) => ReactElement;
}

const EAST_ACCENTS: Record<EastFamily, EastAccent> = {
  anime: {
    family: "anime",
    topGradient: "from-amber-500 to-fuchsia-500",
    badge:
      "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    groupSideGradient: "from-amber-500/60 to-fuchsia-500/40",
    groupRing: "ring-amber-500/20",
    Icon: KatanaIcon,
  },
  manga: {
    family: "manga",
    topGradient: "from-teal-500 to-emerald-500",
    badge:
      "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30",
    groupSideGradient: "from-teal-500/60 to-emerald-500/40",
    groupRing: "ring-emerald-500/20",
    Icon: YinYangIcon,
  },
  novel: {
    family: "novel",
    topGradient: "from-amber-500 to-stone-500",
    badge:
      "bg-amber-500/10 text-amber-200/90 ring-amber-500/25",
    groupSideGradient: "from-amber-500/55 to-stone-500/40",
    groupRing: "ring-amber-500/15",
    Icon: ScrollBrushIcon,
  },
};

export interface ResolvedThemeAccent {
  theme: MediaTheme;
  family: EastFamily | null;       // sadece Doğu ailelerinden biri ise dolu
  subType: MediaSubType;
  subTypeLabel: string | null;     // SUB_TYPE_LABEL'da varsa rozet metni
  accent: EastAccent | null;       // family null ise accent da null
}

/**
 * Bir MediaItem için theme accent bilgisini çözer. Eksik classification
 * alanları withMediaClassification ile sadece OKUMA yönünde tamamlanır;
 * çağıran tarafta veri mutasyonu olmaz.
 */
export function resolveThemeAccent(item: ClassifiableInput): ResolvedThemeAccent {
  const cls = withMediaClassification(item);
  let family: EastFamily | null = null;
  if (cls.theme === "east") {
    if (cls.mediaType === "anime") family = "anime";
    else if (cls.mediaType === "manga") family = "manga";
  } else if (cls.mediaType === "novel") {
    // serialized_novel/light_novel/web_novel/visual_novel hepsi Doğu ailesinin
    // novel kolu olarak kabul edilir (V5A.1 filtre haritasıyla tutarlı).
    family = "novel";
  }

  return {
    theme: cls.theme,
    family,
    subType: cls.subType,
    subTypeLabel: SUB_TYPE_LABEL[cls.subType] ?? null,
    accent: family ? EAST_ACCENTS[family] : null,
  };
}

/**
 * Kartların üst accent çizgisi için tailwind gradient string'i.
 * Doğu ailesindeyse theme accent kullanılır; aksi halde fallback döner.
 */
export function topAccentGradient(
  resolved: ResolvedThemeAccent,
  fallback: string,
): string {
  return resolved.accent ? resolved.accent.topGradient : fallback;
}

/**
 * Doğu ailesinden bir item için ufak inline rozet (icon + subType label).
 * Doğu dışı item'larda null döner — kartı rozet çöplüğüne çevirmiyoruz.
 */
export function ThemeSubBadge({
  item,
  compact = false,
}: {
  item: ClassifiableInput;
  // V5A.5: Quick Search gibi yoğun listelerde 10px varyant. Default 11px.
  compact?: boolean;
}) {
  const resolved = resolveThemeAccent(item);
  if (!resolved.accent || !resolved.subTypeLabel) return null;
  const Icon = resolved.accent.Icon;
  const sizeClass = compact
    ? "text-[10px] px-1.5 py-0.5 rounded"
    : "text-[11px] px-2 py-0.5 rounded-md";
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ring-1 ${sizeClass} ${resolved.accent.badge}`}
      title={`Doğu · ${resolved.subTypeLabel}`}
    >
      <Icon className="w-3 h-3" />
      {resolved.subTypeLabel}
    </span>
  );
}
