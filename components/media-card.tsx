// ============================================
// Medya Karti Bileseni
// ============================================
// R18.4 redesign:
//   - Cover artık iki overlay taşıyor:
//       · top-left: rating badge (puan varsa amber, yoksa "Puanla" tetikleyici)
//       · top-right: favori bookmark/ribbon (her zaman görünür; pasifse silik)
//   - Rating popover trigger'a göre cover'ın sol kenarına yapışır → sağ kenar
//     kırpılma sorunu yok (önceki versiyonda badge satırı en sağdaydı).
//   - Sağ kolon yeniden gruplandı: başlık → tür/altmedia/durum → meta → genre/tag.
//   - Üst aksiyon ikonları (Info/Edit/Group/Delete) hover'da görünmeye devam ediyor;
//     favori artık burada DEĞİL — cover ribbon'una taşındı.
// Veri akışı, +1/Tamamla, edit/delete, detay açma, rating handler — tümü
// aynen. Sadece görsel mimari ve overlay yerleşimi değişti.

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Plus,
  Check,
  Pause,
  X,
  Clock,
  BookOpen,
  Pencil,
  Trash2,
  Heart,
  Star,
  StickyNote,
  Info,
  Layers,
} from "lucide-react";
import { MediaItem } from "@/lib/types";
import {
  getProgressLabel,
  getProgressPercent,
  getMediaTypeLabel,
  getStatusLabel,
  getIncrementLabel,
  isMovieLike,
} from "@/lib/progress";
import {
  resolveThemeAccent,
  topAccentGradient,
  ThemeSubBadge,
} from "@/components/theme-accent";

interface MediaCardProps {
  item: MediaItem;
  onIncrement: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenDetail: (item: MediaItem) => void;
  onAddRelatedParts?: (item: MediaItem) => void;
  relatedPartsLabel?: string;
  canAddRelatedParts?: boolean;
  onOpenGroupEdit?: (item: MediaItem) => void;
  // R18.3: Hızlı puanlama. Sağlanmazsa rating chip yine görünür ama tıklanmaz
  // (geriye dönük uyum: eski çağrılar kırılmaz).
  onUpdateRating?: (id: string, rating: number | null) => void;
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

function getStatusColor(status: string): string {
  switch (status) {
    case "watching":
    case "reading":
      return "bg-blue-500/20 text-blue-400 ring-blue-500/30";
    case "planning":
      return "bg-amber-500/20 text-amber-400 ring-amber-500/30";
    case "completed":
      return "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30";
    case "paused":
      return "bg-orange-500/20 text-orange-400 ring-orange-500/30";
    case "dropped":
      return "bg-red-500/20 text-red-400 ring-red-500/30";
    default:
      return "bg-zinc-500/20 text-zinc-400 ring-zinc-500/30";
  }
}

function getProgressGradient(type: string): string {
  switch (type) {
    case "movie":
      return "from-indigo-500 to-violet-500";
    case "tv":
      return "from-violet-500 to-purple-500";
    case "anime":
      return "from-pink-500 to-rose-500";
    case "manga":
      return "from-orange-500 to-amber-500";
    case "manhwa":
      return "from-teal-500 to-emerald-500";
    case "manhua":
      return "from-cyan-500 to-sky-500";
    case "book":
      return "from-green-500 to-lime-500";
    default:
      return "from-violet-500 to-fuchsia-500";
  }
}

export default function MediaCard({
  item,
  onIncrement,
  onComplete,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenDetail,
  onAddRelatedParts,
  relatedPartsLabel = "Parca Ekle",
  canAddRelatedParts = false,
  onOpenGroupEdit,
  onUpdateRating,
}: MediaCardProps) {
  // R18.3: Hızlı puanlama popover state'i. Component-local; kart-bazlı.
  const [ratingOpen, setRatingOpen] = useState(false);
  const ratingWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ratingOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (ratingWrapRef.current && !ratingWrapRef.current.contains(e.target as Node)) {
        setRatingOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRatingOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ratingOpen]);
  const canRate = !!onUpdateRating;
  const hasKnownTotal = item.totalProgress > 0;
  const percent = hasKnownTotal
    ? getProgressPercent(item.currentProgress, item.totalProgress)
    : 0;
  const progressLabel = getProgressLabel(item.type);
  // Bilinmeyen toplam (totalProgress = 0): hiçbir zaman "finished" sayma —
  // kullanıcı serbestçe artırabilmeli.
  const isFinished = hasKnownTotal && item.currentProgress >= item.totalProgress;
  const isCompleted = item.status === "completed";
  // "Film gibi" davranan: saf film + AniList anime MOVIE format. İkisi de bölüm/dakika
  // progress göstermez; ana aksiyon "İzlendi Olarak İşaretle".
  const isMovie = isMovieLike(item);
  const showProgressBlock = !isMovie;
  const incrementLabel = getIncrementLabel(item.type);
  const hasSeasonInfo = item.numberOfSeasons || item.numberOfEpisodes || item.seasonNumber;
  const isBook = item.type === "book";
  const hasAuthors = item.authors && item.authors.length > 0;
  const isAniList = item.externalSource === "anilist";
  const isFavorite = item.favorite || false;
  const hasRating = item.userRating != null;
  const hasTags = item.tags && item.tags.length > 0;
  const hasNotes = item.personalNotes && item.personalNotes.trim().length > 0;

  // V5A.3: Doğu ailesinde (anime/manga/novel) accent rengini themeden türet;
  // diğer kartlarda eski type-bazlı gradient olduğu gibi kalır.
  const themeAccent = resolveThemeAccent(item);
  const accentGradient = topAccentGradient(themeAccent, getProgressGradient(item.type));

  return (
    // R12: Hover border'ı aktif dünya tonuna doğru hafifçe çekiyoruz —
    // data-world scope'undan gelen --w-primary'ı color-mix ile zinc-700'e
    // karıştırarak nötr (Tümü) seçimde hâlâ zinc hissi koruyoruz.
    // Top accent gradient ve ThemeSubBadge davranışı dokunulmadı (V5A).
    // R18.5: Kart yüzey dili rafine edildi.
    //   - bg artık iki katmanlı (gradient + zinc) — flat 2015 hissi gitti.
    //   - hover'da hafif lift (translate-y) + accent border + soft shadow.
    //   - overflow-hidden korunuyor (ribbon kart sınırı içinde yaşıyor).
    <div className="group relative flex flex-col rounded-2xl border border-zinc-800/60 bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 overflow-hidden transition-all duration-300 hover:border-[color-mix(in_srgb,var(--w-primary)_38%,#52525b)] hover:shadow-lg hover:shadow-black/40 motion-safe:hover:-translate-y-0.5">
      {/* Üst accent — hover'da öne çıkan ince çizgi. */}
      <div
        aria-hidden
        className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${accentGradient} opacity-40 group-hover:opacity-90 transition-opacity`}
      />

      {/* === Favori corner ribbon ===
          Görünür kurdele eski dikey bookmark oranını korur; dış button alanı
          klavye ve dokunma için daha geniş bir hit target sağlar.
          Pasifse tema yüzeyi; aktifse favoriye özel kontrollü rose dolgu.
          Mikro animasyon: ikon kısaca scale (motion-safe), bg/color smooth
          transition. Aşırı değil — premium "snap". */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(item.id);
        }}
        title={isFavorite ? "Favoriden Çıkar" : "Favoriye Ekle"}
        aria-label={isFavorite ? `${item.title} favorilerden çıkar` : `${item.title} favorilere ekle`}
        aria-pressed={isFavorite}
        className="absolute right-3 top-0 z-30 inline-flex h-11 w-9 cursor-pointer items-start justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
      >
        <span
          data-favorite-ribbon={isFavorite ? "active" : "inactive"}
          className={`inline-flex h-9 w-6 items-start justify-center transition-colors duration-200 ${
            isFavorite
              ? "bg-gradient-to-b from-rose-400 to-rose-600 text-white drop-shadow-[0_2px_5px_rgba(190,18,60,0.28)]"
              : "bg-[color-mix(in_srgb,var(--app-surface-elevated)_88%,transparent)] text-[var(--app-text-secondary)] shadow-[inset_0_0_0_1px_var(--app-border-strong),0_2px_5px_rgba(0,0,0,0.18)] drop-shadow-[0_2px_2px_var(--app-shadow)] hover:text-rose-500"
          }`}
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 58%, 0 100%)" }}
          aria-hidden="true"
        >
          <Heart
            className={`mt-1.5 h-3.5 w-3.5 motion-safe:transition-transform motion-safe:duration-200 ${
              isFavorite ? "fill-current scale-110" : "scale-100"
            }`}
            strokeWidth={isFavorite ? 1.5 : 1.75}
          />
        </span>
      </button>

      {/* R20: Mobilde gap/padding hafifçe daraltıldı, sm+'da eski değerler. */}
      <div className="flex gap-3 sm:gap-4 p-3 pr-4 sm:p-4 sm:pr-5 flex-1">
        {/* R18.5: Cover artık tek overlay taşıyor: sol-üstte rating badge.
            Favori cover'dan tamamen alındı; kartın sağ-üst köşesinde dikey
            bookmark/ribbon olarak yaşıyor.
            Cover'ın iç ring/rounded wrapper'ı sadece görseli kırpar; rating
            popover bu wrapper'ın dışında, aşağı doğru açılır. */}
        <div className="relative w-20 h-28 flex-shrink-0">
          <div className="absolute inset-0 rounded-xl overflow-hidden ring-1 ring-zinc-800 shadow-sm shadow-black/40">
            <Image
              src={item.coverImage}
              alt={item.title}
              fill
              unoptimized
              className="object-cover"
            />
            {/* Üst vignette — rating badge'in altına oturduğu yumuşak zemin */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/65 via-black/25 to-transparent"
            />
          </div>

          {/* === Rating badge — cover top-left (R18.5: rafine) === */}
          {(hasRating || canRate) && (
            <div ref={ratingWrapRef} className="absolute top-1.5 left-1.5">
              {canRate ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRatingOpen((v) => !v);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={ratingOpen}
                  aria-label={hasRating ? "Puanı değiştir" : "Puan ver"}
                  title={hasRating ? "Puanı değiştir" : "Puan ver"}
                  // R18.6: Unrated trigger artık icon-only — "Puanla" yazısı
                  // cover'da ekstra gürültü yaratıyordu. Hover'da yumuşak
                  // amber halka ile davet sinyali kalır; aria-label tooltip
                  // erişilebilirliği koruyor.
                  className={`inline-flex items-center gap-1 h-[22px] rounded-full text-[11px] font-semibold tabular-nums backdrop-blur-md ring-1 transition-all cursor-pointer ${
                    hasRating
                      ? "pl-1.5 pr-2 bg-zinc-950/70 text-amber-200 ring-amber-300/35 shadow-sm shadow-black/40 hover:bg-zinc-950/85"
                      : "w-[22px] justify-center bg-zinc-950/55 text-zinc-300 ring-white/10 hover:text-amber-200 hover:ring-amber-400/35 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                  }`}
                >
                  <Star
                    className={`w-3 h-3 ${hasRating ? "fill-amber-300 text-amber-300" : ""}`}
                  />
                  {hasRating && (
                    <span className="leading-none">{item.userRating}</span>
                  )}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 pl-1.5 pr-2 h-[22px] rounded-full text-[11px] font-semibold tabular-nums backdrop-blur-md bg-zinc-950/70 text-amber-200 ring-1 ring-amber-300/35 shadow-sm shadow-black/40">
                  <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                  <span className="leading-none">{item.userRating}</span>
                </span>
              )}

              {/* Popover — trigger altında, sol hizalı. Cover top-left'te
                  durduğu için aşağı + sağa açılır; kart sınırlarını aşmaz. */}
              {canRate && ratingOpen && (
                <div
                  role="menu"
                  aria-label="Hızlı puanlama"
                  // R18.6: z-30 → topbar (z-40), WorldTransition (z-[45]),
                  // detail modal (z-50) ve confirm/quick-add/media/manual
                  // modal'larının (z-[100]) altında kalır; kart içinde ribbon
                  // (z-30) ile aynı seviyede ama DOM sırasıyla onun üstünde.
                  className="absolute top-full left-0 mt-1.5 z-30 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur p-2 shadow-xl shadow-black/50 w-[11rem]"
                >
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                      const isCurrent = item.userRating === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isCurrent}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateRating?.(item.id, n);
                            setRatingOpen(false);
                          }}
                          className={`h-7 rounded-md text-[11px] font-mono tabular-nums font-semibold transition-colors cursor-pointer ${
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
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateRating?.(item.id, null);
                        setRatingOpen(false);
                      }}
                      className="mt-2 w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 ring-1 ring-zinc-800 hover:ring-rose-500/30 transition-colors cursor-pointer"
                    >
                      Puanı Temizle
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            {/* === Row: Title + ikincil aksiyon cluster ===
                R18.5: Başlık + (hover'da) Detay/Düzenle/Grup/Sil. Favori artık
                kart ribbon'unda (yukarıda) — bu cluster'da yok. Sağ tarafta
                ribbon için pr-7 reserve. Cluster tek bir frosted şerit gibi
                davranır: opacity-0 default + group-hover:opacity-100. */}
            <div className="flex items-start gap-2 pr-7">
              <div className="relative min-w-0 flex-1 h-[1.15rem]">
                <h3
                  className="
                    absolute left-0 top-0 z-20 max-w-full
                    font-semibold text-zinc-100 text-[14.5px] leading-tight tracking-tight cursor-default
                    whitespace-nowrap overflow-hidden text-ellipsis
                    transition-[max-width,padding,background-color,box-shadow,border-color] duration-150
                    hover:z-40 hover:max-w-[26rem] hover:whitespace-normal hover:break-words
                    hover:bg-zinc-950/95 hover:backdrop-blur
                    hover:rounded-lg hover:px-2 hover:py-1.5
                    hover:border hover:border-violet-500/40
                    hover:shadow-lg hover:shadow-black/40
                    hover:text-base
                  "
                >
                  {item.title}
                </h3>
              </div>
              <div
                className="
                  flex items-center gap-px rounded-lg ring-1 ring-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm
                  shrink-0
                  opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100
                  motion-safe:transition-opacity motion-safe:duration-150
                "
              >
                <button
                  type="button"
                  onClick={() => onOpenDetail(item)}
                  title="Detaylar"
                  className="w-7 h-7 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  title="Düzenle"
                  className="w-7 h-7 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {onOpenGroupEdit && (
                  <button
                    type="button"
                    onClick={() => onOpenGroupEdit(item)}
                    title="Grup Düzenle"
                    className="w-7 h-7 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-fuchsia-300 hover:bg-fuchsia-500/10 transition-colors cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  title="Sil"
                  className="w-7 h-7 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* === Row: Type · SubBadge · Status ===
                R18.5: Rafine — daha küçük tipografi, yumuşak ring, status
                rengi öne çıkıyor; type/subtype daha sakin. */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-800/60 text-zinc-400 ring-1 ring-zinc-700/40">
                {getMediaTypeLabel(item.type)}
              </span>

              {/* V5A.3: Doğu içerikleri için subType rozeti (manga/manhwa/manhua,
                  Light Novel/Web Novel/Visual Novel, Anime · TV/Film/OVA…) */}
              <ThemeSubBadge item={item} />

              <span
                className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md ring-1 ${getStatusColor(
                  item.status
                )}`}
              >
                {getStatusIcon(item.status)}
                {getStatusLabel(item.status)}
              </span>

              {hasNotes && (
                <span
                  title="Kişisel not var"
                  className="inline-flex items-center text-[10.5px] px-1 py-0.5 rounded-md bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/30"
                >
                  <StickyNote className="w-3 h-3" />
                </span>
              )}
            </div>

            {hasSeasonInfo && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-zinc-500">
                  {item.seriesRelationType === "season" && item.seasonNumber && `Sezon ${item.seasonNumber}`}
                  {item.seriesRelationType === "season" && item.seasonNumber && item.numberOfEpisodes && " • "}
                  {item.seriesRelationType !== "season" && item.numberOfSeasons && `${item.numberOfSeasons} sezon`}
                  {item.seriesRelationType !== "season" && item.numberOfSeasons && item.numberOfEpisodes && " • "}
                  {item.numberOfEpisodes && `${item.numberOfEpisodes} bölüm`}
                </span>
              </div>
            )}

            {canAddRelatedParts && onAddRelatedParts && (
              <div className="mt-2">
                <button
                  onClick={() => onAddRelatedParts(item)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/25 hover:bg-violet-500/20 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  {relatedPartsLabel}
                </button>
              </div>
            )}

            {isBook && hasAuthors && (
              <p className="text-[11px] text-zinc-400 mt-1 truncate">
                {item.authors!.slice(0, 2).join(", ")}
                {item.authors!.length > 2 && ` +${item.authors!.length - 2}`}
              </p>
            )}

            {isBook && (item.pageCount || item.editionCount) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.pageCount && (
                  <span className="text-[10px] text-zinc-500">{item.pageCount} sayfa</span>
                )}
                {item.pageCount && item.editionCount && (
                  <span className="text-[10px] text-zinc-700">•</span>
                )}
                {item.editionCount && (
                  <span className="text-[10px] text-zinc-600">{item.editionCount} baski</span>
                )}
              </div>
            )}

            {isBook && item.subjects && item.subjects.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {item.subjects.slice(0, 3).map((subject) => (
                  <span
                    key={subject}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/30"
                  >
                    {subject}
                  </span>
                ))}
              </div>
            )}

            {isAniList && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.type === "anime" && item.episodes && (
                  <span className="text-[10px] text-zinc-500">{item.episodes} bölüm</span>
                )}
                {item.type !== "anime" && item.chapters && (
                  <span className="text-[10px] text-zinc-500">{item.chapters} bölüm</span>
                )}
                {item.volumes && (
                  <>
                    <span className="text-[10px] text-zinc-700">•</span>
                    <span className="text-[10px] text-zinc-600">{item.volumes} cilt</span>
                  </>
                )}
                {item.format && (
                  <>
                    <span className="text-[10px] text-zinc-700">•</span>
                    <span className="text-[10px] text-zinc-600">{item.format}</span>
                  </>
                )}
              </div>
            )}

            {!isBook && item.genres && item.genres.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {item.genres.slice(0, 3).map((genre) => (
                  <span
                    key={genre}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/30"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {hasTags && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {item.tags!.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400/70 ring-1 ring-violet-500/15"
                  >
                    {tag}
                  </span>
                ))}
                {item.tags!.length > 3 && (
                  <span className="text-[10px] text-zinc-600">+{item.tags!.length - 3}</span>
                )}
              </div>
            )}
          </div>

          {showProgressBlock && (
            // R18.5: Progress bloğu daha okunur — sayılar tabular-nums + sağda
            // yüzde monospace; bar 1px daha ince ve overflow-hidden ring'i
            // dünya tonuyla hafif zenginleştirilmiş.
            <div className="mt-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] text-zinc-500 tabular-nums">
                  <span className="text-zinc-200 font-semibold">{item.currentProgress}</span>
                  <span className="text-zinc-700 mx-1">/</span>
                  <span className="text-zinc-400">{hasKnownTotal ? item.totalProgress : "??"}</span>
                  <span className="ml-1 text-zinc-500">{progressLabel}</span>
                </span>
                {hasKnownTotal ? (
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-zinc-300">
                    {Math.round(percent)}<span className="text-zinc-500">%</span>
                  </span>
                ) : (
                  <span
                    title="Toplam bilinmiyor"
                    className="text-[11px] font-mono text-zinc-600"
                  >
                    —
                  </span>
                )}
              </div>

              <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden ring-1 ring-inset ring-zinc-800/40">
                {hasKnownTotal ? (
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(
                      item.type
                    )} transition-all duration-500 ease-out`}
                    style={{ width: `${percent}%` }}
                  />
                ) : (
                  // Bilinmeyen toplam: yalnızca görsel placeholder. Grup yüzdesi
                  // hesabına KATILMAZ (computeGroupProgress totalProgress<=0 olanları
                  // birim toplamına eklemiyor).
                  <div
                    aria-hidden
                    className="h-full rounded-full bg-zinc-700/60"
                    style={{ width: "50%" }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* R18.5: Alt aksiyon barı yenilendi — sade frosted footer + tek-piksel
          iç ayraç + uniform hover bg. Buton davranışı aynı; sadece tipografi
          ve geçişler rafine. */}
      <div className="mt-auto flex border-t border-zinc-800/60 bg-zinc-950/40 backdrop-blur-sm">
        {isMovie ? (
          <button
            type="button"
            onClick={() => onComplete(item.id)}
            disabled={isCompleted}
            className={`
              flex-1 flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 py-3 sm:py-2.5 text-[13px] sm:text-[12px] font-semibold tracking-tight
              transition-colors duration-150 cursor-pointer
              ${
                isCompleted
                  ? "text-emerald-500/50 cursor-not-allowed"
                  : "text-zinc-300 hover:text-emerald-200 hover:bg-emerald-500/10"
              }
            `}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isCompleted ? "Tamamlandı" : "İzlendi Olarak İşaretle"}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onIncrement(item.id)}
              disabled={isCompleted || isFinished}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold tracking-tight
                transition-colors duration-150 cursor-pointer
                ${
                  isCompleted || isFinished
                    ? "text-zinc-600 cursor-not-allowed"
                    : "text-zinc-300 hover:text-violet-200 hover:bg-violet-500/10"
                }
              `}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{incrementLabel}</span>
            </button>

            <div className="w-px self-stretch my-1.5 bg-zinc-800/70" />

            <button
              type="button"
              onClick={() => onComplete(item.id)}
              disabled={isCompleted}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold tracking-tight
                transition-colors duration-150 cursor-pointer
                ${
                  isCompleted
                    ? "text-emerald-500/50 cursor-not-allowed"
                    : "text-zinc-300 hover:text-emerald-200 hover:bg-emerald-500/10"
                }
              `}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isCompleted ? "Tamamlandı" : "Tamamla"}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
