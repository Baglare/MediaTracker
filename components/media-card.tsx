// ============================================
// Medya Karti Bileseni
// ============================================

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
    <div className="group relative flex flex-col bg-zinc-900/50 rounded-2xl border border-zinc-800/50 overflow-hidden hover:border-[color-mix(in_srgb,var(--w-primary)_35%,#52525b)] transition-all duration-300">
      <div
        className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accentGradient} opacity-50 group-hover:opacity-100 transition-opacity`}
      />

      <div className="flex gap-4 p-4 flex-1">
        <div className="relative w-20 h-28 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-zinc-800">
          <Image
            src={item.coverImage}
            alt={item.title}
            fill
            unoptimized
            className="object-cover"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="relative min-w-0 flex-1 h-[1.15rem]">
                <h3
                  className="
                    absolute left-0 top-0 z-20 max-w-full
                    font-semibold text-zinc-100 text-sm leading-tight cursor-default
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
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onToggleFavorite(item.id)}
                  title={isFavorite ? "Favoriden Cikar" : "Favoriye Ekle"}
                  className={`w-6 h-6 rounded-md flex items-center justify-center transition-all cursor-pointer hover:scale-125 ${
                    isFavorite
                      ? "text-rose-400"
                      : "text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-400"
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isFavorite ? "fill-rose-400" : ""}`} />
                </button>
                <button
                  onClick={() => onOpenDetail(item)}
                  title="Detaylar"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onEdit(item)}
                  title="Duzenle"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {onOpenGroupEdit && (
                  <button
                    onClick={() => onOpenGroupEdit(item)}
                    title="Grup Düzenle"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-fuchsia-400 hover:bg-fuchsia-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  >
                    <Layers className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => onDelete(item.id)}
                  title="Sil"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 ring-1 ring-zinc-700/50">
                {getMediaTypeLabel(item.type)}
              </span>

              {/* V5A.3: Doğu içerikleri için subType rozeti (manga/manhwa/manhua,
                  Light Novel/Web Novel/Visual Novel, Anime · TV/Film/OVA…) */}
              <ThemeSubBadge item={item} />

              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ring-1 ${getStatusColor(
                  item.status
                )}`}
              >
                {getStatusIcon(item.status)}
                {getStatusLabel(item.status)}
              </span>

              {/* R18.3: Hızlı puanlama. canRate true ise chip tıklanabilir
                  trigger; popover içinde 1–10 + "Temizle". canRate yoksa
                  (eski çağrı yolu) chip salt-görsel olarak eski davranışta
                  kalır. */}
              {(hasRating || canRate) && (
                <div ref={ratingWrapRef} className="relative inline-flex">
                  {canRate ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRatingOpen((v) => !v);
                      }}
                      aria-haspopup="menu"
                      aria-expanded={ratingOpen}
                      title={hasRating ? "Puanı değiştir" : "Puan ver"}
                      className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-md ring-1 transition-colors cursor-pointer ${
                        hasRating
                          ? "bg-amber-500/10 text-amber-400 ring-amber-500/20 hover:bg-amber-500/15"
                          : "bg-zinc-800/40 text-zinc-500 ring-zinc-700/40 hover:text-amber-300 hover:bg-amber-500/10 hover:ring-amber-500/20 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      }`}
                    >
                      <Star
                        className={`w-2.5 h-2.5 ${hasRating ? "fill-amber-400" : ""}`}
                      />
                      {hasRating ? `${item.userRating}/10` : "Puanla"}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                      <Star className="w-2.5 h-2.5 fill-amber-400" />
                      {item.userRating}/10
                    </span>
                  )}

                  {canRate && ratingOpen && (
                    <div
                      role="menu"
                      aria-label="Hızlı puanlama"
                      className="absolute top-full left-0 mt-1 z-40 rounded-lg border border-zinc-800 bg-zinc-950/95 backdrop-blur p-2 shadow-xl shadow-black/40 w-[10.5rem]"
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
                              className={`h-7 rounded-md text-[11px] font-mono tabular-nums font-medium transition-colors cursor-pointer ${
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

              {hasNotes && (
                <span
                  title="Kisisel not var"
                  className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-md bg-zinc-800/60 text-zinc-500 ring-1 ring-zinc-700/30"
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
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-zinc-500">
                  <span className="text-zinc-300 font-medium">{item.currentProgress}</span>
                  {" / "}
                  {hasKnownTotal ? item.totalProgress : "??"} {progressLabel}
                </span>
                {hasKnownTotal ? (
                  <span className="text-xs text-zinc-500 font-medium">{Math.round(percent)}%</span>
                ) : (
                  <span
                    title="Toplam bilinmiyor"
                    className="text-xs text-zinc-600 font-medium"
                  >
                    —
                  </span>
                )}
              </div>

              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
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

      <div className="mt-auto flex border-t border-zinc-800/50">
        {isMovie ? (
          <button
            onClick={() => onComplete(item.id)}
            disabled={isCompleted}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium
              transition-all duration-200 cursor-pointer
              ${
                isCompleted
                  ? "text-emerald-500/50 cursor-not-allowed"
                  : "text-zinc-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              }
            `}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isCompleted ? "Tamamlandi" : "Izlendi Olarak Isaretle"}</span>
          </button>
        ) : (
          <>
            <button
              onClick={() => onIncrement(item.id)}
              disabled={isCompleted || isFinished}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium
                transition-all duration-200 cursor-pointer
                ${
                  isCompleted || isFinished
                    ? "text-zinc-600 cursor-not-allowed"
                    : "text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10"
                }
              `}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{incrementLabel}</span>
            </button>

            <div className="w-px bg-zinc-800/50" />

            <button
              onClick={() => onComplete(item.id)}
              disabled={isCompleted}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium
                transition-all duration-200 cursor-pointer
                ${
                  isCompleted
                    ? "text-emerald-500/50 cursor-not-allowed"
                    : "text-zinc-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                }
              `}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isCompleted ? "Tamamlandi" : "Tamamla"}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
