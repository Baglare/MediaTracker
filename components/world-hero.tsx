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

import type { MediaType } from "@/lib/types";
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

// R13.2: FilmStripIcon (Belgesel) kaldırıldı — `documentary` data modelde
// ayrı bir tür değil, sahte filtre yaratmamak için pill da gösterilmiyor.

// Arşiv — kitap
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

// R13.2: FeatherIcon (Roman) ve SealIcon (Klasikler) kaldırıldı — Arşiv
// içinde data modelde karşılığı olmayan alt türleri (sahte buton ya da
// disabled etiket olarak) göstermiyoruz.

// ----- World config -----
// R13.2: Tüm dünyalar artık interaktif. Davranış kaynağı dünyaya göre değişir:
//   - east   → eastSubFilter state'i (mevcut V5A davranışı, korundu)
//   - screen → typeFilter state'i (Tümü / Film / Dizi)
//   - arch   → typeFilter state'i (Tümü / Kitap)
// Brief gereği Belgesel / Roman / Klasikler hiç gösterilmiyor; data modelde
// karşılıkları olmadığı için sahte buton yaratmıyoruz.
type WorldKey = "east" | "screen" | "arch";

// Pill aksiyon paradigmaları (her pill kendi kind'ını taşır):
//   "east-sub" → eastSubFilter setter'ını çağırır.
//   "type"     → typeFilter setter'ını çağırır.

interface EastSubPill {
  kind: "east-sub";
  id: EastSubFilter;             // "all" | "anime" | "manga" | "novel"
  label: string;
  Icon?: (props: { className?: string }) => React.ReactElement;
  activeAnimClass?: string;       // V5A.4 mikro animasyon class'ı
}

interface TypePill {
  kind: "type";
  id: MediaType | "all";
  label: string;
  Icon?: (props: { className?: string }) => React.ReactElement;
}

type Pill = EastSubPill | TypePill;

interface WorldConfig {
  key: WorldKey;
  glyph: string;
  glyphFontClass: string;
  title: string;
  subtitle: string;
  pills: Pill[];                  // İlk pill genellikle "Tümü".
}

const WORLDS: Record<WorldKey, WorldConfig> = {
  east: {
    key: "east",
    glyph: "東",
    glyphFontClass: "text-base font-semibold",
    title: "Doğu",
    subtitle: "Anime, manga ve novel koleksiyonların.",
    pills: [
      { kind: "east-sub", id: "all", label: "Tümü" },
      { kind: "east-sub", id: "anime", label: "Anime", Icon: KatanaIcon, activeAnimClass: "v5a-slash-anim" },
      { kind: "east-sub", id: "manga", label: "Manga", Icon: YinYangIcon, activeAnimClass: "v5a-yin-anim" },
      { kind: "east-sub", id: "novel", label: "Novel", Icon: ScrollBrushIcon, activeAnimClass: "v5a-ink-anim" },
    ],
  },
  screen: {
    key: "screen",
    glyph: "◉",
    glyphFontClass: "text-lg font-bold",
    title: "Kadraj",
    subtitle: "Film ve dizi koleksiyonların.",
    pills: [
      { kind: "type", id: "all", label: "Tümü" },
      { kind: "type", id: "movie", label: "Film", Icon: LensIcon },
      { kind: "type", id: "tv", label: "Dizi", Icon: ClapperIcon },
    ],
  },
  arch: {
    key: "arch",
    glyph: "Æ",
    glyphFontClass: "text-lg font-bold italic",
    title: "Arşiv",
    subtitle: "Kitap koleksiyonun.",
    pills: [
      { kind: "type", id: "all", label: "Tümü" },
      { kind: "type", id: "book", label: "Kitap", Icon: BookIcon },
    ],
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
  // Doğu için tüketilir; diğer dünyalarda görmezden gelinir.
  eastSub: EastSubFilter;
  onEastSubChange: (next: EastSubFilter) => void;
  // R13.2: Kadraj/Arşiv pill'leri mevcut typeFilter üzerinden çalışır.
  // Doğu pill'lerinde tüketilmez.
  typeFilter: MediaType | "all";
  onTypeChange: (next: MediaType | "all") => void;
}

export default function WorldHero({
  themeFilter,
  eastSub,
  onEastSubChange,
  typeFilter,
  onTypeChange,
}: WorldHeroProps) {
  const worldKey = themeToWorld(themeFilter);
  // "Tümü" seçiliyken hero hiç çıkmasın — control bar sade kalsın.
  if (!worldKey) return null;
  const w = WORLDS[worldKey];

  return (
    <div
      // Surface: --w-* tokenları üzerinden ince kimlik. Stiller dünyadan
      // bağımsız aynı; sadece renk değişkenleri swap olur (R10 plumbing).
      // R20: Mobilde hero kompakt — px/py küçüldü, glyph daha küçük.
      // Desktop boyutları (sm+) korunur.
      className="relative overflow-hidden rounded-2xl px-4 py-3 sm:px-6 sm:py-5"
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

      {/* R14: İçerik subtree `key={worldKey}` ile dünya değişiminde remount
          olur, böylece r14-hero-*-enter `forwards` animasyonları sıfırdan
          oynar. eastSub/typeFilter değişimi worldKey'i etkilemediği için
          alt pill seçimleri entrance'ı re-trigger ETMEZ — sadece dünya
          değişiminde 250–500ms aralığında bir kerelik fade/slide. */}
      <div
        key={worldKey}
        className="relative flex flex-wrap items-center gap-x-4 gap-y-3 justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Glyph rozeti — kanji / aperture / Æ + dünya-spesifik karakter */}
          <span
            className={`r14-hero-glyph-enter ${glyphCharacterClass(worldKey)} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${w.glyphFontClass}`}
            style={{
              background: "var(--w-soft)",
              color: "var(--w-primary-strong)",
            }}
          >
            {w.glyph}
          </span>
          <div className="r14-hero-text-enter min-w-0">
            <h2
              className="text-sm font-semibold tracking-wide truncate"
              style={{ color: "var(--w-primary-strong)" }}
            >
              {w.title}
            </h2>
            <p className="text-xs text-zinc-400 truncate">{w.subtitle}</p>
          </div>
        </div>

        {/* R13.2: Tüm dünyalarda pill'ler interaktif. Doğu eastSubFilter,
            Kadraj/Arşiv typeFilter üzerinden. R14: pill grubunun entrance'ı
            text bloğundan sonra (120ms gecikmeli) gelir.
            R20: Mobilde pill grubu yatay scroll'a düşer; sm+ wrap davranışı
            korunur. -mx ile container kenarına nefes alır. */}
        <div className="r14-hero-pills-enter -mx-1 flex sm:flex-wrap items-center gap-2 overflow-x-auto sm:overflow-visible scrollbar-hide px-1 touch-pan-x w-full sm:w-auto">
          {w.pills.map((pill) => {
            if (pill.kind === "east-sub") {
              const isActive = eastSub === pill.id;
              return (
                <SubButton
                  key={`east-${pill.id}`}
                  label={pill.label}
                  active={isActive}
                  onClick={() => onEastSubChange(pill.id)}
                  Icon={pill.Icon}
                  // V5A.4: aktif/pasif geçişinde key remount → animasyon bir kez oynar.
                  iconKey={isActive ? "active" : "idle"}
                  iconAnimClass={isActive ? pill.activeAnimClass : undefined}
                />
              );
            }
            // pill.kind === "type" → typeFilter wiring (Kadraj/Arşiv)
            const isActive = typeFilter === pill.id;
            return (
              <SubButton
                key={`type-${pill.id}`}
                label={pill.label}
                active={isActive}
                onClick={() => onTypeChange(pill.id)}
                Icon={pill.Icon}
                // R14: Aktif Kadraj/Arşiv pill'lerine küçük dünya-spesifik
                // glow. Doğu pill'leri zaten V5A.4 ikon mikro animasyonunu
                // kullandığı için burada ek dekorasyon almıyor.
                activeExtraClass={
                  worldKey === "screen"
                    ? "r14-pill-screen-active"
                    : worldKey === "arch"
                      ? "r14-pill-arch-active"
                      : undefined
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// R14: Dünya glyph rozetine karakter veren class adını döner.
function glyphCharacterClass(world: WorldKey): string {
  switch (world) {
    case "east":
      return "r14-glyph-east";
    case "screen":
      return "r14-glyph-screen";
    case "arch":
      return "r14-glyph-arch";
  }
}

// ----- Pill primitives -----
function SubButton({
  label,
  active,
  onClick,
  Icon,
  iconKey,
  iconAnimClass,
  activeExtraClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  Icon?: (props: { className?: string }) => React.ReactElement;
  iconKey?: string;
  iconAnimClass?: string;
  // R14: Aktif state'e eklenecek ekstra class — dünya-spesifik glow için.
  // Doğu pill'lerinde verilmez (V5A.4 ikon animasyonu yeterli).
  activeExtraClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 px-3 h-9 sm:h-auto sm:py-1.5 rounded-lg text-xs font-medium tracking-wide transition-colors cursor-pointer ${
        active
          ? `ring-1 ${activeExtraClass ?? ""}`
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

// R13.2: SubBadge kaldırıldı. Önceki versiyonda Kadraj/Arşiv için salt-görsel
// "soon" pill'leri vardı; artık tüm pill'ler interaktif (typeFilter veya
// eastSubFilter üzerinden), desteklenmeyen alt türler hiç gösterilmiyor.
