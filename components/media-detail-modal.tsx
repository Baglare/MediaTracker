// ============================================
// Media Detail Modal — R21 (Premium redesign)
// ============================================
// R21'de tamamen modernleştirildi:
//   - Hero alanı: blur backdrop cover + premium kapak (ring + soft shadow +
//     world-accent glow). Başlık + native title + tip/dünya/status rozetleri
//     + yıl + kaynak. Mobilde tek kolona düşer.
//   - Toolbar: favori toggle, hızlı rating popover (MediaCard ile aynı
//     etkileşim modeli), Düzenle, Sil. Bu turda yeni handler tanımlanmıyor;
//     parent'tan gelen mevcut callback'ler reuse edilir.
//   - Progress section: world accent gradient bar, bilinmeyen total için "??"
//     korunur, film/movie-like için bölüm/dakika satırı gizlenir; sadece
//     "İzlendi Olarak İşaretle" aksiyonu kalır.
//   - Metadata "kart" hissi veren section'lara bölündü: Genel Bilgiler /
//     Notlar & Etiketler / Açıklama / Kaynak. Boş alanlar render edilmez.
//   - Son Aktiviteler: max 5 log, scroll yok; sade.
//   - data-world scope altında --w-* tokenlarından accent alır (Tümü → nötr
//     zinc; Doğu/Kadraj/Arşiv'de hafifçe o dünyanın tonu).
//
// **Davranış / data flow değişmedi.** onIncrementProgress, onComplete,
// onToggleFavorite, onUpdateRating (R18.3), onEdit, onDelete prop'ları
// aynen tüketilir. Yeni state / modal eklenmedi.

"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  X,
  Heart,
  Pencil,
  Trash2,
  Check,
  Plus,
  Star,
  StickyNote,
  ExternalLink,
  BookOpen,
  Clock,
  Pause,
  History,
  Info,
  Tag,
  Link2,
  Trophy,
} from "lucide-react";
import { MediaItem, ProgressLog } from "@/lib/types";
import {
  getProgressLabel,
  getProgressPercent,
  getMediaTypeLabel,
  getStatusLabel,
  getIncrementLabel,
  isMovieLike,
} from "@/lib/progress";
import { ThemeSubBadge } from "@/components/theme-accent";

interface MediaDetailModalProps {
  media: MediaItem | null;
  progressLogs?: ProgressLog[];
  open: boolean;
  onClose: () => void;
  onEdit: (media: MediaItem) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onIncrementProgress: (id: string) => void;
  onComplete: (id: string) => void;
  // R21: Hızlı rating güncelleme (R18.3 ile aynı sözleşme). Sağlanmazsa
  // rating chip salt-okunur (geriye dönük uyum).
  onUpdateRating?: (id: string, rating: number | null) => void;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "watching":
    case "reading":
      return "bg-blue-500/15 text-blue-300 ring-blue-500/30";
    case "planning":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "completed":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "paused":
      return "bg-orange-500/15 text-orange-300 ring-orange-500/30";
    case "dropped":
      return "bg-red-500/15 text-red-300 ring-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "watching":
    case "reading":
      return <BookOpen className="w-3 h-3" />;
    case "planning":
      return <Clock className="w-3 h-3" />;
    case "completed":
      return <Check className="w-3 h-3" />;
    case "paused":
      return <Pause className="w-3 h-3" />;
    case "dropped":
      return <X className="w-3 h-3" />;
    default:
      return null;
  }
}

function sourceLabelOf(source: MediaItem["externalSource"]): string {
  switch (source) {
    case "tvmaze":
      return "TVMaze";
    case "anilist":
      return "AniList";
    case "openlibrary":
      return "Open Library";
    case "omdb":
      return "OMDb";
    case "tmdb":
      return "TMDB";
    default:
      return "Manuel";
  }
}

function resolveSourceLink(media: MediaItem): string | undefined {
  if (media.siteUrl) return media.siteUrl;
  if (media.externalSource === "openlibrary" && media.externalId) {
    return `https://openlibrary.org${media.externalId}`;
  }
  if (media.externalSource === "omdb" && media.externalId) {
    return `https://www.imdb.com/title/${media.externalId}/`;
  }
  return undefined;
}

// R21.1: Overview/description için **plain-text** dönüşümü.
//
// Mevcut durum:
//   - AniList overview'i [lib/anilist.ts](lib/anilist.ts) `stripHtml` ile
//     normalize sırasında zaten temizleniyor (satır 128).
//   - TVmaze overview'leri `app/api/tvmaze/{search,details}/route.ts`
//     içindeki `stripHtml` ile API katmanında temizleniyor.
//   - Diğer kaynaklarda (OMDb, Open Library, manuel) overview tipik olarak
//     düz metin.
//
// Yine de defansif: eski snapshot'larda kaydedilmiş HTML, kullanıcı tarafından
// manuel düzenlenmiş bir overview, ya da ileride eklenecek yeni bir kaynağın
// HTML sızdırması durumunda XSS yüzeyi açılmasın diye modal artık
// `dangerouslySetInnerHTML` yerine bu helper'ın çıkardığı düz metni
// `whitespace-pre-wrap` ile basıyor. Sonuç:
//   - `<br>`, `<p>`, `</p>` → satır sonu (AniList okunabilirliği korunur).
//   - Diğer tüm tag'ler tamamen kaldırılır (`<script>`, `<iframe>`, `<img onerror=...>`,
//     event handler attribute'ları, inline JS dahil; tag'in TÜM gövdesi düşer).
//   - Yaygın HTML entity'leri çözümlenir (`&amp; &lt; &gt; &quot; &#39; &nbsp;`).
//   - DOM'a HTML olarak hiçbir şey enjekte edilmez → script/iframe/handler
//     attribute zinciri render edilemez.
//
// Whitelist tabanlı `<b><i><em>` gibi minimal rich text korunması bilinçli
// olarak yapılmadı; AniList açıklamaları zaten plain-text olarak geliyor,
// güvenlik yüzeyini bir-DOM-parser olmadan minimumda tutmak tercih edildi.
function sanitizeOverview(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*p\b[^>]*>/gi, "")
    // Script ve style bloklarını içerikleriyle birlikte sil (tag'ler sonraki
    // adımda da düşerdi ama gövdedeki kodun metne sızmaması için baştan al).
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    // Kalan tüm tag'leri at — attribute'lar (onclick, onerror, src, href dahil)
    // ile birlikte gider. Açılı parantez içinde tek satırlık eşleşme.
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    // Yaygın HTML entity'lerini çözümle.
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric entity (örn. &#8217; → ’) — sadece güvenli aralık.
    .replace(/&#(\d+);/g, (_m, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) && code >= 0x20 && code <= 0xffff
        ? String.fromCharCode(code)
        : "";
    })
    // 3+ ardışık newline'ı 2'ye düşür ki paragraf arası temiz dursun.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatLogDate(isoStr: string): string {
  const d = new Date(isoStr);
  return new Intl.DateTimeFormat("tr-TR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Tek satır metadata anahtar/değer. value falsy ise hiç render edilmez —
// boş alanlar "Detaylar" section'unu boğmasın diye.
function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-200 text-right min-w-0 break-words">{value}</span>
    </div>
  );
}

// Section kartı — modal içinde tutarlı yüzey dili. R21'de tüm metadata blokları
// bu wrapper'a alındı; aynı border/bg/padding tonu.
function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-3">
        {Icon && <Icon className="w-3.5 h-3.5 text-[var(--w-primary-strong)]" />}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function MediaDetailModal({
  media,
  progressLogs = [],
  open,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onIncrementProgress,
  onComplete,
  onUpdateRating,
}: MediaDetailModalProps) {
  // R21: Hızlı rating popover — MediaCard ile aynı etkileşim modeli; outside
  // click + ESC kapatır. open=false iken effect bağlanmaz.
  const [ratingOpen, setRatingOpen] = useState(false);
  const ratingWrapRef = useRef<HTMLDivElement>(null);

  // Modal kapanınca popover state'ini sıfırla. CLAUDE.md (R19): effect içinde
  // sync setState yerine **modal-style prev-prop karşılaştırması** ile render
  // fazında guard'lı setter çağrısı. `lastOpen` izleme state'i ile ikinci
  // commit tetiklenmez; lint (`react-hooks/set-state-in-effect`) memnun.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (!open && ratingOpen) setRatingOpen(false);
  }

  // Tek bir ESC + outside-click effect'i. open || ratingOpen → bağla; aksi
  // halde temizle. Modal kapalıyken hiçbir listener yok.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ratingOpen) {
        setRatingOpen(false);
        return;
      }
      onClose();
    };
    const onPointer = (e: MouseEvent) => {
      if (!ratingOpen) return;
      if (ratingWrapRef.current && !ratingWrapRef.current.contains(e.target as Node)) {
        setRatingOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, ratingOpen, onClose]);

  if (!open || !media) return null;

  const isFavorite = media.favorite || false;
  const isCompleted = media.status === "completed";
  const hasKnownTotal = media.totalProgress > 0;
  const isFinished = hasKnownTotal && media.currentProgress >= media.totalProgress;
  const percent = hasKnownTotal
    ? getProgressPercent(media.currentProgress, media.totalProgress)
    : 0;
  const progressLabel = getProgressLabel(media.type);
  const incrementLabel = getIncrementLabel(media.type);
  const isMovie = isMovieLike(media);
  const showProgressBlock = !isMovie;

  const hasRating = media.userRating != null;
  const canRate = !!onUpdateRating;

  const sourceLabel = sourceLabelOf(media.externalSource);
  const sourceLink = resolveSourceLink(media);

  const hasTags = !!(media.tags && media.tags.length > 0);
  const hasNotes = !!(media.personalNotes && media.personalNotes.trim().length > 0);
  const hasOverview = !!(media.overview && media.overview.trim().length > 0);
  const tagsList = media.tags ?? [];
  const genreList = media.genres ?? media.subjects ?? [];

  const sortedLogs = [...progressLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const handleDelete = () => {
    onDelete(media.id);
    onClose();
  };

  const handleEdit = () => {
    onClose();
    onEdit(media);
  };

  // Backdrop tıklayınca kapat; container tıklayınca DEĞİL.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={media.title}
    >
      {/* Modal container.
          - Mobile: tam genişlik, alt kenara yaslı bottom-sheet hissi (rounded-t).
          - sm+: ortalı, max-w-3xl, rounded-2xl.
          - max-h kontrolü ile içerik ekran dışına taşmaz; iç bölge scroll'a düşer.
          - data-world scope üst seviyeden inherit eder; --w-* tokenları burada
            renk anchor'u olarak kullanılır. */}
      <div
        className="relative w-full sm:max-w-3xl bg-zinc-900/95 border border-zinc-800/80 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[92vh] sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* === HERO === */}
        <div className="relative shrink-0">
          {/* Backdrop blur cover */}
          <div className="absolute inset-0 overflow-hidden">
            <Image
              src={media.coverImage}
              alt=""
              fill
              unoptimized
              aria-hidden
              className="object-cover blur-2xl scale-110 opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/40 via-zinc-900/70 to-zinc-900" />
            {/* World accent glow — Tümü iken nötr zinc, dünya seçili iken o dünyanın tonu. */}
            <div
              aria-hidden
              className="absolute -top-20 -right-16 w-72 h-72 rounded-full blur-3xl opacity-30"
              style={{ background: "var(--w-primary)" }}
            />
          </div>

          {/* Close button (sticky-feel; üstte sağda) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-3 right-3 z-30 w-9 h-9 inline-flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-zinc-200 hover:text-white ring-1 ring-white/10 transition-colors cursor-pointer"
            aria-label="Detay modalını kapat"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Hero content. Mobilde flex-col (cover üstte), sm+ flex-row. */}
          <div className="relative z-10 flex flex-col sm:flex-row items-start gap-4 sm:gap-5 p-5 sm:p-6 pr-14">
            {/* Cover — premium ring + soft world glow. */}
            <div className="relative shrink-0 mx-auto sm:mx-0">
              <div
                aria-hidden
                className="absolute -inset-1 rounded-xl blur-md opacity-50"
                style={{ background: "var(--w-soft)" }}
              />
              <div
                className="relative w-28 h-40 sm:w-32 sm:h-44 rounded-xl overflow-hidden ring-1 shadow-xl shadow-black/50"
                style={{
                  boxShadow:
                    "0 12px 30px -10px rgba(0,0,0,0.6), inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 30%, rgba(63,63,70,0.6))",
                }}
              >
                <Image
                  src={media.coverImage}
                  alt={media.title}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            </div>

            {/* Title + badges */}
            <div className="flex-1 min-w-0 w-full">
              <h2 className="text-xl sm:text-2xl font-semibold text-zinc-50 tracking-tight leading-tight break-words">
                {media.title}
              </h2>
              {media.nativeTitle && media.nativeTitle !== media.title && (
                <p className="text-[13px] text-zinc-400 mt-1 break-words">
                  {media.nativeTitle}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span
                  className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md ring-1"
                  style={{
                    background: "var(--w-soft)",
                    color: "var(--w-primary-strong)",
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 30%, transparent)",
                  }}
                >
                  {getMediaTypeLabel(media.type)}
                </span>
                <ThemeSubBadge item={media} />
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ring-1 ${getStatusColor(
                    media.status,
                  )}`}
                >
                  {getStatusIcon(media.status)}
                  {getStatusLabel(media.status)}
                </span>
                {media.releaseYear && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-700/50 font-mono tabular-nums">
                    {media.releaseYear}
                  </span>
                )}
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-700/50">
                  {sourceLabel}
                </span>
              </div>

              {/* Hero alt satır: rating + favori — kompakt premium chip'ler. */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <div ref={ratingWrapRef} className="relative">
                  <button
                    type="button"
                    onClick={() => canRate && setRatingOpen((v) => !v)}
                    disabled={!canRate}
                    aria-haspopup={canRate ? "menu" : undefined}
                    aria-expanded={canRate ? ratingOpen : undefined}
                    aria-label={hasRating ? "Puanı değiştir" : "Puan ver"}
                    className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-semibold tabular-nums ring-1 transition-colors ${
                      hasRating
                        ? "bg-amber-500/15 text-amber-200 ring-amber-500/35 hover:bg-amber-500/25"
                        : canRate
                          ? "bg-zinc-900/70 text-zinc-300 ring-zinc-800 hover:text-amber-200 hover:ring-amber-500/35"
                          : "bg-zinc-900/40 text-zinc-500 ring-zinc-800/70 cursor-default"
                    } ${canRate ? "cursor-pointer" : ""}`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${hasRating ? "fill-amber-300 text-amber-300" : ""}`}
                    />
                    {hasRating ? (
                      <span className="leading-none">
                        {media.userRating}
                        <span className="text-amber-300/60"> / 10</span>
                      </span>
                    ) : (
                      <span className="leading-none">
                        {canRate ? "Puan ver" : "Puansız"}
                      </span>
                    )}
                  </button>

                  {canRate && ratingOpen && (
                    <div
                      role="menu"
                      aria-label="Hızlı puanlama"
                      className="absolute top-full left-0 mt-1.5 z-30 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur p-2 shadow-xl shadow-black/50 w-[12rem]"
                    >
                      <div className="grid grid-cols-5 gap-1">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                          const isCurrent = media.userRating === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isCurrent}
                              onClick={() => {
                                onUpdateRating?.(media.id, n);
                                setRatingOpen(false);
                              }}
                              className={`h-8 rounded-md text-[12px] font-mono tabular-nums font-semibold transition-colors cursor-pointer ${
                                isCurrent
                                  ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40"
                                  : "text-zinc-300 hover:bg-zinc-800/80 hover:text-amber-300"
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      {hasRating && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onUpdateRating?.(media.id, null);
                            setRatingOpen(false);
                          }}
                          className="mt-2 w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 ring-1 ring-zinc-800 hover:ring-rose-500/30 transition-colors cursor-pointer"
                        >
                          Puanı Temizle
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onToggleFavorite(media.id)}
                  title={isFavorite ? "Favoriden Çıkar" : "Favoriye Ekle"}
                  aria-pressed={isFavorite}
                  className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-semibold ring-1 transition-colors cursor-pointer ${
                    isFavorite
                      ? "bg-rose-500/15 text-rose-200 ring-rose-500/40 hover:bg-rose-500/25"
                      : "bg-zinc-900/70 text-zinc-400 ring-zinc-800 hover:text-rose-200 hover:ring-rose-500/35"
                  }`}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`}
                    strokeWidth={isFavorite ? 1.5 : 1.75}
                  />
                  {isFavorite ? "Favori" : "Favori Ekle"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* === BODY (scrollable) === */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="p-5 sm:p-6 space-y-5">
            {/* === Progress (sadece movie-like değilse bölüm/dakika satırı) === */}
            <SectionCard icon={Trophy} title="İlerleme">
              {showProgressBlock ? (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[13px] text-zinc-400 tabular-nums">
                      <span className="text-zinc-100 font-semibold">
                        {media.currentProgress}
                      </span>
                      <span className="text-zinc-600 mx-1">/</span>
                      <span className="text-zinc-300">
                        {hasKnownTotal ? media.totalProgress : "??"}
                      </span>
                      <span className="ml-1 text-zinc-500">{progressLabel}</span>
                    </span>
                    {hasKnownTotal ? (
                      <span
                        className="text-[13px] font-mono tabular-nums font-semibold"
                        style={{ color: "var(--w-primary-strong)" }}
                      >
                        {Math.round(percent)}
                        <span className="text-zinc-500">%</span>
                      </span>
                    ) : (
                      <span
                        title="Toplam bilinmiyor"
                        className="text-[13px] font-mono text-zinc-600"
                      >
                        —
                      </span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-zinc-800/80 rounded-full overflow-hidden ring-1 ring-inset ring-zinc-800/50">
                    {hasKnownTotal ? (
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${percent}%`,
                          background:
                            "linear-gradient(90deg, var(--w-primary), var(--w-primary-strong))",
                        }}
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="h-full rounded-full bg-zinc-700/60"
                        style={{ width: "50%" }}
                      />
                    )}
                  </div>
                  {isCompleted && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                      <Check className="w-3 h-3" />
                      Tamamlandı
                    </div>
                  )}
                </>
              ) : (
                // Movie-like: progress bar/sayı yok; sadece tamamlandı/tamamlanmadı durumu.
                <p className="text-[13px] text-zinc-400">
                  {isCompleted
                    ? "Bu yapım izlendi olarak işaretlendi."
                    : "Bu yapım henüz izlenmedi."}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                {showProgressBlock && (
                  <button
                    type="button"
                    onClick={() => onIncrementProgress(media.id)}
                    disabled={isCompleted || isFinished}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg text-[13px] font-semibold text-zinc-200 bg-zinc-800/70 hover:bg-zinc-700/70 ring-1 ring-zinc-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {incrementLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onComplete(media.id)}
                  disabled={isCompleted}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg text-[13px] font-semibold bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/35 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {isCompleted
                    ? "Tamamlandı"
                    : isMovie
                      ? "İzlendi Olarak İşaretle"
                      : "Tamamla"}
                </button>
              </div>
            </SectionCard>

            {/* === İki kolon: Genel Bilgiler + Notlar/Etiketler === */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Genel Bilgiler — boş alanlar render edilmiyor; tüm row'lar
                  null/0 olduğunda section'ı tamamen atlamak için pre-check. */}
              {(media.authors?.length ||
                media.format ||
                media.runtime ||
                media.numberOfSeasons ||
                media.numberOfEpisodes ||
                media.episodes ||
                media.chapters ||
                media.volumes ||
                media.pageCount ||
                media.editionCount ||
                media.networkName ||
                media.language ||
                media.languages?.length ||
                media.countryOfOrigin ||
                media.averageScore ||
                (media.seasonBreakdown && media.seasonBreakdown.length > 0)) && (
                <SectionCard icon={Info} title="Genel Bilgiler">
                  <div className="space-y-1.5">
                    <MetaRow
                      label="Yazar"
                      value={media.authors && media.authors.length > 0 ? media.authors.join(", ") : null}
                    />
                    <MetaRow label="Format" value={media.format ?? null} />
                    <MetaRow
                      label="Süre"
                      value={media.runtime ? `${media.runtime} dk` : null}
                    />
                    <MetaRow
                      label="Sezon"
                      value={media.numberOfSeasons ?? null}
                    />
                    <MetaRow
                      label="Bölüm"
                      value={media.numberOfEpisodes ?? media.episodes ?? null}
                    />
                    <MetaRow label="Chapter" value={media.chapters ?? null} />
                    <MetaRow label="Cilt" value={media.volumes ?? null} />
                    <MetaRow label="Sayfa" value={media.pageCount ?? null} />
                    <MetaRow
                      label="Baskı"
                      value={media.editionCount ?? null}
                    />
                    <MetaRow label="Kanal" value={media.networkName ?? null} />
                    <MetaRow
                      label="Dil"
                      value={
                        media.language ??
                        (media.languages && media.languages.length > 0
                          ? media.languages.join(", ")
                          : null)
                      }
                    />
                    <MetaRow label="Ülke" value={media.countryOfOrigin ?? null} />
                    <MetaRow
                      label="Skor"
                      value={media.averageScore ? `${media.averageScore}%` : null}
                    />
                  </div>

                  {media.seasonBreakdown && media.seasonBreakdown.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/70">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-2">
                        Sezon Kırılımı
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {media.seasonBreakdown.map((sb) => (
                          <div
                            key={sb.season}
                            className="flex items-center justify-between px-2 py-1 rounded-md text-[11.5px] bg-zinc-900/60 ring-1 ring-zinc-800/70"
                          >
                            <span className="text-zinc-400">
                              Sezon {sb.season}
                            </span>
                            <span className="text-zinc-200 font-medium tabular-nums">
                              {sb.episodes}b
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Notlar & Etiketler — boş ise bütün section atlanır. */}
              {(hasNotes || hasTags || genreList.length > 0) && (
                <SectionCard icon={Tag} title="Notlar & Etiketler">
                  {genreList.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-1.5">
                        Türler
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {genreList.map((g) => (
                          <span
                            key={g}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800/70 text-zinc-300 ring-1 ring-zinc-700/50"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasTags && (
                    <div className="mb-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-1.5">
                        Etiketlerim
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {tagsList.map((t) => (
                          <span
                            key={t}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasNotes && (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-1.5 flex items-center gap-1">
                        <StickyNote className="w-3 h-3" />
                        Kişisel Notlar
                      </p>
                      <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-words bg-zinc-900/50 rounded-md p-2.5 ring-1 ring-zinc-800/70">
                        {media.personalNotes}
                      </p>
                    </div>
                  )}
                </SectionCard>
              )}
            </div>

            {/* Açıklama — R21.1: dangerouslySetInnerHTML kaldırıldı.
                `sanitizeOverview` ile HTML tag'leri (ve script/iframe/style/
                event handler attribute'ları) tamamen düşürülür, sadece
                paragraf/br kaynaklı satır sonları korunur. Sonuç düz metin
                olarak `whitespace-pre-wrap` ile basıldığı için DOM'a HTML
                enjeksiyonu yok. */}
            {hasOverview && (() => {
              const overviewText = sanitizeOverview(media.overview!);
              if (!overviewText) return null;
              return (
                <SectionCard icon={BookOpen} title="Açıklama">
                  <p className="text-[13.5px] text-zinc-300 leading-relaxed max-h-48 overflow-y-auto pr-1 custom-scrollbar break-words whitespace-pre-wrap">
                    {overviewText}
                  </p>
                </SectionCard>
              );
            })()}

            {/* Kaynak / Dış Bağlantılar */}
            {(sourceLink || media.externalId) && (
              <SectionCard icon={Link2} title="Kaynak">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400">
                    <span className="text-zinc-500">Kaynak:</span>
                    <span className="text-zinc-200 font-medium">{sourceLabel}</span>
                  </span>
                  {media.externalId && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500 font-mono">
                      <span>id:</span>
                      <span className="text-zinc-300 break-all">{media.externalId}</span>
                    </span>
                  )}
                  {sourceLink && (
                    <a
                      href={sourceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[12px] font-medium ring-1 transition-colors cursor-pointer"
                      style={{
                        background: "var(--w-soft)",
                        color: "var(--w-primary-strong)",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 35%, transparent)",
                      }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Kaynakta Aç
                    </a>
                  )}
                </div>
              </SectionCard>
            )}

            {/* Son Aktiviteler */}
            {sortedLogs.length > 0 && (
              <SectionCard icon={History} title="Son Aktiviteler">
                <ul className="space-y-1.5">
                  {sortedLogs.slice(0, 5).map((log) => {
                    let label: React.ReactNode = null;
                    if (log.action === "increment") {
                      label = (
                        <span className="text-zinc-200 font-medium">
                          +{log.amount} {log.unit}
                        </span>
                      );
                    } else if (log.action === "complete") {
                      label = (
                        <span className="text-emerald-300 font-medium">
                          Tamamlandı
                        </span>
                      );
                    } else if (log.action === "manual_adjust") {
                      label = (
                        <span className="text-zinc-200 font-medium">
                          Manuel düzenleme
                        </span>
                      );
                    } else if (log.action === "added") {
                      label = (
                        <span className="text-violet-300 font-medium">
                          Kütüphaneye eklendi
                        </span>
                      );
                    }
                    return (
                      <li
                        key={log.id}
                        className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md bg-zinc-900/50 ring-1 ring-zinc-800/60 text-[12px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {label}
                          {log.action !== "complete" && log.action !== "added" && (
                            <span className="text-zinc-500 font-mono tabular-nums whitespace-nowrap">
                              {log.previousProgress} → {log.newProgress}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono tabular-nums whitespace-nowrap shrink-0">
                          {formatLogDate(log.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            )}
          </div>
        </div>

        {/* === FOOTER === */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-800/70 bg-zinc-950/60 backdrop-blur-sm flex items-center gap-2">
          <button
            type="button"
            onClick={handleEdit}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-zinc-300 hover:text-violet-200 bg-zinc-900/60 hover:bg-violet-500/10 ring-1 ring-zinc-800 hover:ring-violet-500/30 transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            Düzenle
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-zinc-300 hover:text-rose-200 bg-zinc-900/60 hover:bg-rose-500/10 ring-1 ring-zinc-800 hover:ring-rose-500/30 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Sil
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex items-center justify-center h-9 px-4 rounded-lg text-[13px] font-medium text-zinc-200 ring-1 transition-colors cursor-pointer"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--w-primary) 22%, transparent), color-mix(in srgb, var(--w-secondary) 18%, transparent))",
              boxShadow:
                "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 40%, transparent)",
            }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
