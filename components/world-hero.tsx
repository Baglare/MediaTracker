// ============================================
// R11 — World Hero (Doğu / Kadraj / Arşiv)
// ============================================
// V5A.2'deki EastThemeHeader'ın genelleştirilmiş hâli. Kütüphanem
// üstünde, themeFilter ∈ {east, screen, library} iken render edilir.
// "all" / settings için hiç render edilmez (parent kontrol eder).
//
// Bu tur **yalnızca statik görsel kimlik** kuruyor:
//   - Doğu: Anime / Manga / Novel pill'leri INTERAKTİF (mevcut
//     eastSubFilter davranışı birebir korunur — V5A.2 ile aynı).
//   - Kadraj: Film / Dizi / Belgesel pill'leri SADECE GÖRSEL.
//     Yeni filtre state'i eklenmiyor (Film/Dizi ayrımı zaten typeFilter
//     üzerinden yapılabiliyor; Belgesel data modelinde yok).
//   - Arşiv: Kitap / Roman / Klasikler pill'leri SADECE GÖRSEL.
//     Aynı sebeple yeni state yok.
// Kasıtlı yapılmayanlar (R11 brief): macro animasyon (katana / aperture /
// wax seal), useWorld context, no-flash boot script, MediaCard redesign.
//
// Renkler tamamen --w-* tokenlarından (data-world scope, R10) gelir;
// hardcoded amber/blue/parchment yok. Bu sayede ileride Kadraj/Arşiv
// için gerçek alt filtreler eklenince hero görsel olarak hazır.

"use client";

import type { EastSubFilter, ThemeFilter } from "./media-filters";

// ----- Glyph + Sub-pill ikonları -----
// Doğu için V5A'daki üç ikonu (slash / yin-yang / scroll-brush) korudum;
// bunlar mevcut sub-pill animasyon class'larıyla (v5a-*-anim) eşleşmek
// zorunda. Yeni ikonlar eklerken globals.css'teki keyframe adlarıyla
// uyumu bozma.

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
      <path d="M5 19l-1 1" strokeWidth="2.6" />
      <path d="M9 15l1.5 1.5" opacity="0.5" />
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
      <circle cx="12" cy="7.5" r="1" fill="#1a120c" stroke="none" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
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
      <path d="M12 7l-7 7v3h3l7-7" />
    </svg>
  );
}

// Kadraj — lens / klaket / belgesel
function LensIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v4.5M21 12h-4.5M12 21v-4.5M3 12h4.5" strokeLinecap="round" />
    </svg>
  );
}

function ClapperIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="9" width="18" height="11" rx="1.5" />
      <path d="M3 9l3-4 4 1-3 3zM10 9l3-4 4 1-3 3zM17 9l3-4" />
    </svg>
  );
}

function FilmStripIcon({ className }: { className?: string }) {
  // Belgesel için film şeridi metaforu
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M4 8h16M4 16h16" />
      <circle cx="7" cy="5.5" r="0.6" fill="currentColor" />
      <circle cx="12" cy="5.5" r="0.6" fill="currentColor" />
      <circle cx="17" cy="5.5" r="0.6" fill="currentColor" />
      <circle cx="7" cy="18.5" r="0.6" fill="currentColor" />
      <circle cx="12" cy="18.5" r="0.6" fill="currentColor" />
      <circle cx="17" cy="18.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

// Arşiv — kitap / tüy kalem / mum mührü
function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 01-3-3V4z" />
      <path d="M5 17a3 3 0 013-3h9" />
    </svg>
  );
}

function FeatherIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 4c-6 0-12 5-12 11v3l3-1c6 0 9-6 9-13z" />
      <path d="M8 18l-4 4" />
      <path d="M11 15h4" opacity="0.6" />
    </svg>
  );
}

function SealIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="10" r="6" />
      <path
        d="M9 14l-1.5 6 4.5-2 4.5 2L15 14"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" fill="currentColor" stroke="none" opacity="0.6" />
    </svg>
  );
}

// ----- World config -----
// `interactive: false` olan pill'ler tıklanabilir görünür ama hiçbir şeyi
// değiştirmez (cursor-default + onClick yok). İleride Kadraj/Arşiv için
// gerçek alt filtre eklenince burada `interactive: true`'ya çevirip
// onChange handler'larını parent'a bağlayacağız.
type WorldKey = "east" | "screen" | "arch";

interface SubPill {
  id: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  // V5A.4 ile uyumlu animasyon class'ı; sadece Doğu pill'lerinde anlamlı.
  activeAnimClass?: string;
}

interface WorldConfig {
  key: WorldKey;
  glyph: string;        // sol rozetteki sembol
  glyphFontClass: string;
  title: string;
  subtitle: string;
  subgroups: SubPill[];
  // east → kullanıcı seçimi anlamlı; diğerleri sadece görsel.
  interactive: boolean;
}

const WORLDS: Record<WorldKey, WorldConfig> = {
  east: {
    key: "east",
    glyph: "東",
    glyphFontClass: "text-base font-semibold",
    title: "Doğu",
    subtitle: "Anime, manga ve novel koleksiyonların.",
    subgroups: [
      { id: "anime", label: "Anime", Icon: KatanaIcon, activeAnimClass: "v5a-slash-anim" },
      { id: "manga", label: "Manga", Icon: YinYangIcon, activeAnimClass: "v5a-yin-anim" },
      { id: "novel", label: "Novel", Icon: ScrollBrushIcon, activeAnimClass: "v5a-ink-anim" },
    ],
    interactive: true,
  },
  screen: {
    key: "screen",
    glyph: "◉",
    glyphFontClass: "text-lg font-bold",
    title: "Kadraj",
    subtitle: "Film ve dizi koleksiyonların.",
    subgroups: [
      { id: "film", label: "Film", Icon: LensIcon },
      { id: "dizi", label: "Dizi", Icon: ClapperIcon },
      { id: "doc", label: "Belgesel", Icon: FilmStripIcon },
    ],
    interactive: false,
  },
  arch: {
    key: "arch",
    // "Æ" Cormorant italik ima eder; system fonta düşse bile okunaklı kalır.
    glyph: "Æ",
    glyphFontClass: "text-lg font-bold italic",
    title: "Arşiv",
    subtitle: "Kitaplar, eski kayıtlar ve okuma arşivin.",
    subgroups: [
      { id: "book", label: "Kitap", Icon: BookIcon },
      { id: "novel", label: "Roman", Icon: FeatherIcon },
      { id: "classics", label: "Klasikler", Icon: SealIcon },
    ],
    interactive: false,
  },
};

// ----- Mapping: ThemeFilter ("library") → WorldKey ("arch") -----
function themeToWorld(theme: ThemeFilter): WorldKey | null {
  if (theme === "east") return "east";
  if (theme === "screen") return "screen";
  if (theme === "library") return "arch";
  return null;
}

// ----- Component -----
interface WorldHeroProps {
  themeFilter: ThemeFilter;
  // Sadece Doğu için tüketilir; diğer dünyalarda görmezden gelinir.
  eastSub: EastSubFilter;
  onEastSubChange: (next: EastSubFilter) => void;
}

export default function WorldHero({
  themeFilter,
  eastSub,
  onEastSubChange,
}: WorldHeroProps) {
  const worldKey = themeToWorld(themeFilter);
  // "Tümü" seçiliyken hero hiç çıkmasın — control bar sade kalsın.
  if (!worldKey) return null;
  const w = WORLDS[worldKey];

  return (
    <div
      // Surface: --w-* tokenları üzerinden ince kimlik. Stiller dünyadan
      // bağımsız aynı; sadece renk değişkenleri swap olur (R10 plumbing).
      className="relative overflow-hidden rounded-2xl px-5 py-4 sm:px-6 sm:py-5"
      style={{
        background:
          "linear-gradient(135deg, rgba(24,24,27,0.85), rgba(9,9,11,0.85)), var(--w-soft)",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 22%, transparent)",
      }}
    >
      {/* Sağ üst köşede çok hafif bir tint — motif değil, sadece renk havası.
          Macro animasyon / katana / aperture yok (R11 brief). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full opacity-40 blur-2xl"
        style={{ background: "var(--w-primary)" }}
      />

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Glyph rozeti — kanji / aperture / Æ */}
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${w.glyphFontClass}`}
            style={{
              background: "var(--w-soft)",
              color: "var(--w-primary-strong)",
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 32%, transparent)",
            }}
          >
            {w.glyph}
          </span>
          <div className="min-w-0">
            <h2
              className="text-sm font-semibold tracking-wide truncate"
              style={{ color: "var(--w-primary-strong)" }}
            >
              {w.title}
            </h2>
            <p className="text-xs text-zinc-400 truncate">{w.subtitle}</p>
          </div>
        </div>

        {/* Subgroup pill'leri.
            Doğu interaktif; Kadraj/Arşiv salt-görsel (visual only).
            Salt-görsel pill'lerde hover değişimi yapmıyoruz, böylece
            kullanıcı hiçbir şey beklemez. */}
        <div className="flex flex-wrap items-center gap-2">
          {w.interactive && (
            <SubButton
              label="Tümü"
              active={eastSub === "all"}
              onClick={() => onEastSubChange("all")}
            />
          )}
          {w.subgroups.map((sg) => {
            if (w.interactive) {
              const isActive = eastSub === sg.id;
              return (
                <SubButton
                  key={sg.id}
                  label={sg.label}
                  active={isActive}
                  onClick={() => onEastSubChange(sg.id as EastSubFilter)}
                  Icon={sg.Icon}
                  // V5A.4: aktif/pasif geçişinde key remount → animasyon bir kez oynar.
                  iconKey={isActive ? "active" : "idle"}
                  iconAnimClass={isActive ? sg.activeAnimClass : undefined}
                />
              );
            }
            // Görsel-only: tıklama yok, cursor default. İlk pill'i hafifçe
            // "öne çıkmış" göstermiyoruz — yanıltıcı olur (gerçek filtre yok).
            return (
              <SubBadge
                key={sg.id}
                label={sg.label}
                Icon={sg.Icon}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ----- Pill primitives -----
function SubButton({
  label,
  active,
  onClick,
  Icon,
  iconKey,
  iconAnimClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  Icon?: (props: { className?: string }) => React.ReactElement;
  iconKey?: string;
  iconAnimClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-colors cursor-pointer ${
        active
          ? "ring-1"
          : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 ring-1 ring-zinc-800"
      }`}
      style={
        active
          ? {
              background: "var(--w-soft)",
              color: "var(--w-primary-strong)",
              // ring color override
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 40%, transparent)",
            }
          : undefined
      }
    >
      {Icon && (
        <Icon
          key={iconKey}
          className={`w-3.5 h-3.5 ${iconAnimClass ?? ""}`}
        />
      )}
      <span>{label}</span>
    </button>
  );
}

function SubBadge({
  label,
  Icon,
}: {
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
}) {
  // R13.1: Salt-görsel kategori — Kadraj/Arşiv için. Önceki versiyon
  // interaktif pill'lerle aynı stildeydi → tıklanabilir intibası veriyordu.
  // Şimdi açıkça pasif:
  //   - dotted ring (interaktif olanlar solid ring kullanıyor)
  //   - cursor-not-allowed
  //   - opacity-60 (sessizleşir)
  //   - aria-disabled="true" (a11y)
  //   - sağ üstte küçük "Yakında" mikro-rozeti (UI niyeti açık)
  // hover transition yok; kullanıcı parmağı üzerine geldiğinde hiçbir şey
  // değişmez → "buton" beklentisi yok.
  return (
    <span
      role="presentation"
      aria-disabled="true"
      title={`${label} · alt filtre yakında`}
      className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide border border-dashed border-zinc-700/70 bg-zinc-900/30 text-zinc-500 opacity-60 cursor-not-allowed select-none"
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="ml-0.5 text-[9px] font-mono uppercase tracking-[0.12em] text-zinc-600"
      >
        soon
      </span>
    </span>
  );
}
