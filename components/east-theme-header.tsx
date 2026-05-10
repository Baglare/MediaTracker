// ============================================
// V5A.2 — Doğu Theme Header (kompakt)
// ============================================
// Kütüphanem üstünde themeFilter === "east" iken render edilir.
// Doğu alt filtresini (Anime / Manga / Novel) burada yönetir, böylece
// MediaFilters tarafındaki ayrı "Doğu Alt Tür" bloğunu yerinden eder.
// Bu turda mikro animasyon, motif sistemi yok — sadece kompakt başlık + pill'ler.
// Görsel referans: design_references/v5a-dogu-theme-concept.html

"use client";

import type { EastSubFilter } from "./media-filters";

// SVG ikonları concept HTML'sinden alındı; emoji yerine inline SVG kullanıyoruz.
function KatanaIcon({ className }: { className?: string }) {
  // Anime — diagonal slash + iz: bir kılıç vuruşu izi metaforu
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
      <path d="M5 19l-1 1" strokeWidth="2.6" />
      <path d="M9 15l1.5 1.5" opacity="0.5" />
    </svg>
  );
}

function YinYangIcon({ className }: { className?: string }) {
  // Manga — yin-yang
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
      <circle cx="12" cy="7.5" r="1" fill="#1a120c" stroke="none" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ScrollBrushIcon({ className }: { className?: string }) {
  // Novel — parşömen + fırça izi
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
      <path d="M12 7l-7 7v3h3l7-7" />
    </svg>
  );
}

// V5A.4: Her ikona, aktif olduğunda ek bir animasyon class'ı veriyoruz.
// CSS keyframes globals.css'te; React tarafında `key` değişimiyle remount
// tetikleyip animasyon her seçimde bir kez (loopsuz) oynatılır.
const SUB_PILLS: {
  value: Exclude<EastSubFilter, "all">;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  activeAnimClass: string;
}[] = [
  { value: "anime", label: "Anime", Icon: KatanaIcon, activeAnimClass: "v5a-slash-anim" },
  { value: "manga", label: "Manga", Icon: YinYangIcon, activeAnimClass: "v5a-yin-anim" },
  { value: "novel", label: "Novel", Icon: ScrollBrushIcon, activeAnimClass: "v5a-ink-anim" },
];

interface EastThemeHeaderProps {
  activeSub: EastSubFilter;
  onChangeSub: (next: EastSubFilter) => void;
}

export default function EastThemeHeader({
  activeSub,
  onChangeSub,
}: EastThemeHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-amber-500/20 bg-gradient-to-br from-zinc-950 via-stone-950 to-zinc-900 px-5 py-4 sm:px-6 sm:py-5">
      {/* Kompakt başlık satırı */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Kanji rozeti */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-amber-500/30 bg-amber-500/10 text-amber-200 text-base font-semibold">
            東
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-amber-100 tracking-wide truncate">
              Doğu · 東方
            </h2>
            <p className="text-xs text-amber-200/50 truncate">
              Anime, manga ve novel koleksiyonun tek başlık altında.
            </p>
          </div>
        </div>

        {/* Tümü / Anime / Manga / Novel pill'leri */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeSub("all")}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide
              transition-colors cursor-pointer
              ${
                activeSub === "all"
                  ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/40"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 ring-1 ring-zinc-800"
              }
            `}
          >
            Tümü
          </button>
          {SUB_PILLS.map(({ value, label, Icon, activeAnimClass }) => {
            const isActive = activeSub === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onChangeSub(value)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide
                  transition-colors cursor-pointer
                  ${
                    isActive
                      ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/40"
                      : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 ring-1 ring-zinc-800"
                  }
                `}
              >
                {/*
                  V5A.4: Aktiften pasife (ya da pasiften aktife) geçişte React'ın
                  `key` değişimi ikonu remount eder; CSS animasyonu yeniden
                  tetiklenip bir kez oynar (sürekli loop yok).
                */}
                <Icon
                  key={isActive ? "active" : "idle"}
                  className={`w-3.5 h-3.5 ${isActive ? activeAnimClass : ""}`}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
