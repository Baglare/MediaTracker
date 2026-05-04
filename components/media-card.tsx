// ============================================
// Medya Kartı Bileşeni
// ============================================
// Her bir medya öğesini gösteren kart. Kapak görseli, başlık,
// ilerleme çubuğu, +1 ve tamamla butonları içerir.
// Film türünde +1 yerine sadece "İzlendi" butonu gösterilir.
// TVmaze'den eklenen dizilerde sezon/bölüm ve genre bilgisi gösterilir.
// Open Library'den eklenen kitaplarda yazar, sayfa ve konu bilgisi gösterilir.
// AniList'ten eklenen anime/manga/manhwa/manhua'da bölüm/chapter bilgisi gösterilir.

"use client";

import Image from "next/image";
import { Plus, Check, Pause, X, Clock, BookOpen, Pencil, Trash2, Heart, Star, StickyNote, Info } from "lucide-react";
import { MediaItem } from "@/lib/types";
import {
  getProgressLabel,
  getProgressPercent,
  getMediaTypeLabel,
  getStatusLabel,
  getIncrementLabel,
} from "@/lib/progress";

// Kart bileşeninin dışarıdan aldığı değerler
interface MediaCardProps {
  item: MediaItem;                                // Gösterilecek medya verisi
  onIncrement: (id: string) => void;              // +1 butonuna basılınca
  onComplete: (id: string) => void;               // Tamamla butonuna basılınca
  onEdit: (item: MediaItem) => void;              // Düzenle butonuna basılınca
  onDelete: (id: string) => void;                 // Sil butonuna basılınca
  onToggleFavorite: (id: string) => void;         // Favori kalbe basılınca
  onOpenDetail: (item: MediaItem) => void;        // Detay butonuna basılınca
}

/**
 * Duruma göre ikon döndüren yardımcı fonksiyon
 */
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

/**
 * Duruma göre renk sınıfları döndüren yardımcı fonksiyon
 */
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

/**
 * Medya türüne göre ilerleme çubuğunun gradient rengini döndürür
 */
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
}: MediaCardProps) {
  // İlerleme yüzdesi hesaplanıyor
  const percent = getProgressPercent(item.currentProgress, item.totalProgress);
  // Medya türüne göre birim etiketi (bölüm, sayfa, chapter vs.)
  const progressLabel = getProgressLabel(item.type);
  // İlerleme tamamlandı mı?
  const isFinished = item.currentProgress >= item.totalProgress;
  // Durum "completed" ise butonları devre dışı bırak
  const isCompleted = item.status === "completed";
  // Film mi?
  const isMovie = item.type === "movie";
  // +1 butonunun etiketi
  const incrementLabel = getIncrementLabel(item.type);

  // Sezon/bölüm bilgisi var mı? (TVmaze'den eklenen diziler için)
  const hasSeasonInfo = item.numberOfSeasons || item.numberOfEpisodes;
  // Kitap mı?
  const isBook = item.type === "book";
  // Kitap yazarları var mı?
  const hasAuthors = item.authors && item.authors.length > 0;
  // AniList medyası mı? (anime, manga, manhwa, manhua)
  const isAniList = item.externalSource === "anilist";
  // Kişisel metadata
  const isFavorite = item.favorite || false;
  const hasRating = item.userRating != null;
  const hasTags = item.tags && item.tags.length > 0;
  const hasNotes = item.personalNotes && item.personalNotes.trim().length > 0;

  return (
    <div className="group relative bg-zinc-900/50 rounded-2xl border border-zinc-800/50 overflow-hidden hover:border-zinc-700/50 transition-all duration-300">
      {/* Üstte ince gradient çizgi (medya türüne göre renk) */}
      <div
        className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${getProgressGradient(
          item.type
        )} opacity-50 group-hover:opacity-100 transition-opacity`}
      />

      <div className="flex gap-4 p-4">
        {/* Sol taraf: Kapak görseli */}
        <div className="relative w-20 h-28 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-zinc-800">
          <Image
            src={item.coverImage}
            alt={item.title}
            fill
            unoptimized={true}
            className="object-cover"
          />
        </div>

        {/* Sağ taraf: Medya bilgileri */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* Üst kısım: Başlık, tür, durum ve aksiyonlar */}
          <div>
            {/* Başlık satırı + Favori/Düzenle/Sil butonları */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-zinc-100 truncate text-sm leading-tight">
                {item.title}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Favori kalp butonu */}
                <button
                  onClick={() => onToggleFavorite(item.id)}
                  title={isFavorite ? "Favoriden Çıkar" : "Favoriye Ekle"}
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
                {/* Düzenle ve Sil butonları */}
                <button
                  onClick={() => onEdit(item)}
                  title="Düzenle"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  title="Sil"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Tür ve durum etiketleri */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Medya türü etiketi */}
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 ring-1 ring-zinc-700/50">
                {getMediaTypeLabel(item.type)}
              </span>

              {/* Durum etiketi */}
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ring-1 ${getStatusColor(
                  item.status
                )}`}
              >
                {getStatusIcon(item.status)}
                {getStatusLabel(item.status)}
              </span>

              {/* Puan badge */}
              {hasRating && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                  <Star className="w-2.5 h-2.5 fill-amber-400" />
                  {item.userRating}/10
                </span>
              )}

              {/* Not göstergesi */}
              {hasNotes && (
                <span title="Kişisel not var" className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-md bg-zinc-800/60 text-zinc-500 ring-1 ring-zinc-700/30">
                  <StickyNote className="w-3 h-3" />
                </span>
              )}
            </div>

            {/* Sezon/bölüm bilgisi (TVmaze'den geliyorsa) */}
            {hasSeasonInfo && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-zinc-500">
                    {item.numberOfSeasons && `${item.numberOfSeasons} sezon`}
                    {item.numberOfSeasons && item.numberOfEpisodes && " • "}
                    {item.numberOfEpisodes && `${item.numberOfEpisodes} bölüm`}
                  </span>
              </div>
            )}

            {/* Kitap: Yazarlar (Open Library'den geliyorsa) */}
            {isBook && hasAuthors && (
              <p className="text-[11px] text-zinc-400 mt-1 truncate">
                {item.authors!.slice(0, 2).join(", ")}
                {item.authors!.length > 2 && ` +${item.authors!.length - 2}`}
              </p>
            )}

            {/* Kitap: Sayfa sayısı ve baskı bilgisi */}
            {isBook && (item.pageCount || item.editionCount) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.pageCount && (
                  <span className="text-[10px] text-zinc-500">
                    {item.pageCount} sayfa
                  </span>
                )}
                {item.pageCount && item.editionCount && (
                  <span className="text-[10px] text-zinc-700">•</span>
                )}
                {item.editionCount && (
                  <span className="text-[10px] text-zinc-600">
                    {item.editionCount} baskı
                  </span>
                )}
              </div>
            )}

            {/* Kitap: Konular (subjects — en fazla 3 tane) */}
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

            {/* AniList: Bölüm/chapter/cilt/format/durum bilgisi */}
            {isAniList && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.type === "anime" && item.episodes && (
                  <span className="text-[10px] text-zinc-500">
                    {item.episodes} bölüm
                  </span>
                )}
                {item.type !== "anime" && item.chapters && (
                  <span className="text-[10px] text-zinc-500">
                    {item.chapters} chapter
                  </span>
                )}
                {item.volumes && (
                  <>
                    <span className="text-[10px] text-zinc-700">•</span>
                    <span className="text-[10px] text-zinc-600">
                      {item.volumes} cilt
                    </span>
                  </>
                )}
                {item.format && (
                  <>
                    <span className="text-[10px] text-zinc-700">•</span>
                    <span className="text-[10px] text-zinc-600">
                      {item.format}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Tür etiketleri (genres — en fazla 3 tane, dizi/anime vb. için) */}
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

            {/* Kişisel etiketler (en fazla 3 tane) */}
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

          {/* Alt kısım: İlerleme bilgisi */}
          <div className="mt-3">
            {/* İlerleme metni: "35 / 47 bölüm" gibi */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-500">
                <span className="text-zinc-300 font-medium">
                  {item.currentProgress}
                </span>
                {" / "}
                {item.totalProgress} {progressLabel}
              </span>
              <span className="text-xs text-zinc-500 font-medium">
                {Math.round(percent)}%
              </span>
            </div>

            {/* İlerleme çubuğu */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(
                  item.type
                )} transition-all duration-500 ease-out`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Alt butonlar: Film için sadece "İzlendi/Tamamla", diğerleri için +1 ve Tamamla */}
      <div className="flex border-t border-zinc-800/50">
        {isMovie ? (
          // Film: Tek bir "İzlendi olarak işaretle" / "Tamamlandı" butonu
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
            <span>{isCompleted ? "Tamamlandı" : "İzlendi Olarak İşaretle"}</span>
          </button>
        ) : (
          // Diğer türler: +1 butonu + Tamamla butonu
          <>
            {/* +1 Butonu */}
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

            {/* Ayırıcı çizgi */}
            <div className="w-px bg-zinc-800/50" />

            {/* Tamamla Butonu */}
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
              <span>{isCompleted ? "Tamamlandı" : "Tamamla"}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
