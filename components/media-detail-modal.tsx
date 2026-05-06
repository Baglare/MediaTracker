import React, { useEffect } from "react";
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
} from "lucide-react";
import { MediaItem, ProgressLog } from "@/lib/types";
import {
  getProgressLabel,
  getProgressPercent,
  getMediaTypeLabel,
  getStatusLabel,
  getIncrementLabel,
} from "@/lib/progress";

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
}: MediaDetailModalProps) {
  // ESC tuşuyla kapatma
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !media) return null;

  const isFavorite = media.favorite || false;
  const isCompleted = media.status === "completed";
  const isFinished = media.currentProgress >= media.totalProgress;
  const percent = getProgressPercent(media.currentProgress, media.totalProgress);
  const progressLabel = getProgressLabel(media.type);
  const incrementLabel = getIncrementLabel(media.type);
  const isMovie = media.type === "movie";

  // Kaynak badge string'i
  const sourceLabel =
    media.externalSource === "tvmaze"
      ? "TVmaze"
      : media.externalSource === "anilist"
      ? "AniList"
      : media.externalSource === "openlibrary"
      ? "Open Library"
      : media.externalSource === "omdb"
      ? "OMDb"
      : media.externalSource === "tmdb"
      ? "TMDB"
      : "Manuel";

  // Kaynak Linki
  let sourceLink = media.siteUrl;
  if (!sourceLink && media.externalSource === "openlibrary" && media.externalId) {
    sourceLink = `https://openlibrary.org${media.externalId}`;
  }
  if (!sourceLink && media.externalSource === "omdb" && media.externalId) {
    sourceLink = `https://www.imdb.com/title/${media.externalId}/`;
  }

  // Durum rengi
  const getStatusColor = (status: string) => {
    switch (status) {
      case "watching":
      case "reading":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "planning":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "completed":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "paused":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "dropped":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    }
  };

  // Status icon
  const getStatusIcon = (status: string) => {
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
  };

  const handleDelete = () => {
    onDelete(media.id);
    onClose();
  };

  const handleEdit = () => {
    onClose();
    onEdit(media);
  };

  // Format date wrapper
  function formatDate(isoStr: string) {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat("tr-TR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  // Sort logs
  const sortedLogs = [...progressLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleCloseButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      {/* Modal Container */}
      <div
        className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kapat Butonu (Absolute, üstte) */}
        <button
          type="button"
          onClick={handleCloseButtonClick}
          className="absolute top-4 right-4 z-30 pointer-events-auto w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors"
          aria-label="Detay modalını kapat"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Üst Alan: Cover / Banner (Varsa banner eklenebilir, şimdilik cover ile sade bir üst alan) */}
        <div className="relative h-40 sm:h-48 bg-zinc-800 flex items-end p-6 border-b border-zinc-800/80">
          {/* Arka plan blurlu cover (backdrop gibi) */}
          <div className="absolute inset-0 opacity-20">
            <Image
              src={media.coverImage}
              alt="Background"
              fill
              className="object-cover blur-md"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
          </div>

          <div className="relative z-10 flex items-end gap-6 w-full">
            {/* Kapak Görseli */}
            <div className="w-24 h-36 sm:w-28 sm:h-40 flex-shrink-0 rounded-lg overflow-hidden shadow-lg ring-2 ring-zinc-800 bg-zinc-900">
              <Image
                src={media.coverImage}
                alt={media.title}
                width={112}
                height={160}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>

            {/* Başlık ve Temel Badgeler */}
            <div className="flex-1 min-w-0 pb-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white truncate mb-2">
                {media.title}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800/80 text-xs font-medium text-zinc-300">
                  {getMediaTypeLabel(media.type)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${getStatusColor(
                    media.status
                  )}`}
                >
                  {getStatusIcon(media.status)}
                  {getStatusLabel(media.status)}
                </span>
                {media.releaseYear && (
                  <span className="px-2 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50 text-xs text-zinc-400">
                    {media.releaseYear}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50 text-xs text-zinc-400">
                  {sourceLabel}
                </span>

                <button
                  onClick={() => onToggleFavorite(media.id)}
                  title={isFavorite ? "Favoriden Çıkar" : "Favoriye Ekle"}
                  className="p-1 rounded-full hover:bg-zinc-800 transition-colors ml-auto"
                >
                  <Heart
                    className={`w-5 h-5 ${
                      isFavorite ? "fill-rose-500 text-rose-500" : "text-zinc-400"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* İçerik */}
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Progress Alanı */}
          <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-800 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-300">İlerleme Durumu</span>
              <span className="text-sm text-zinc-400">
                <strong className="text-white">{media.currentProgress}</strong> /{" "}
                {media.totalProgress} {progressLabel} (
                <span className="text-violet-400">{Math.round(percent)}%</span>)
              </span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            {/* Progress Action Buttons */}
            <div className="flex gap-2">
              {!isMovie && (
                <button
                  onClick={() => onIncrementProgress(media.id)}
                  disabled={isCompleted || isFinished}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  {incrementLabel}
                </button>
              )}
              <button
                onClick={() => onComplete(media.id)}
                disabled={isCompleted}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {isCompleted ? "Tamamlandı" : "Tamamla"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sol Kolon: Metadata */}
            <div className="space-y-6">
              {/* Açıklama */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-400 mb-2">Açıklama</h3>
                <p className="text-sm text-zinc-300 leading-relaxed max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                  {media.overview ? (
                    <span dangerouslySetInnerHTML={{ __html: media.overview }} />
                  ) : (
                    <span className="italic text-zinc-500">Açıklama bulunamadı.</span>
                  )}
                </p>
              </div>

              {/* Dış Kaynak Bilgileri */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2">Detaylar</h3>

                {/* Genres/Subjects */}
                {(media.genres?.length || media.subjects?.length) ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(media.genres || media.subjects || []).map((g) => (
                      <span
                        key={g}
                        className="px-2 py-0.5 rounded-md bg-zinc-800 text-xs text-zinc-300 border border-zinc-700/50"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Specific details based on type */}
                <div className="text-sm text-zinc-300 space-y-1.5">
                  {media.authors && media.authors.length > 0 && (
                    <p>
                      <span className="text-zinc-500">Yazar:</span> {media.authors.join(", ")}
                    </p>
                  )}

                  {media.format && (
                    <p>
                      <span className="text-zinc-500">Format:</span> {media.format}
                    </p>
                  )}
                  {media.averageScore && (
                    <p>
                      <span className="text-zinc-500">Skor:</span> {media.averageScore}%
                    </p>
                  )}
                  {media.pageCount && (
                    <p>
                      <span className="text-zinc-500">Sayfa Sayısı:</span> {media.pageCount}
                    </p>
                  )}
                  {media.seasonBreakdown && media.seasonBreakdown.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-zinc-500 mb-1">Sezon Kırılımı:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {media.seasonBreakdown.map((sb) => (
                          <div key={sb.season} className="flex items-center justify-between bg-zinc-800/50 px-2 py-1 rounded-md text-xs border border-zinc-700/50">
                            <span className="text-zinc-400">Sezon {sb.season}</span>
                            <span className="text-zinc-300 font-medium">{sb.episodes} Bölüm</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : media.numberOfSeasons ? (
                    <p>
                      <span className="text-zinc-500">Sezon:</span> {media.numberOfSeasons}
                    </p>
                  ) : null}
                </div>

                {/* Kaynakta Aç */}
                {sourceLink && (
                  <a
                    href={sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Kaynakta Aç
                  </a>
                )}
              </div>
            </div>

            {/* Sağ Kolon: Kişisel Alanlar */}
            <div>
              <div className="bg-zinc-800/20 border border-zinc-800/80 rounded-xl p-4 h-full">
                <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  Kişisel Bilgiler
                </h3>

                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-zinc-500 block mb-1">Puanım</span>
                    {media.userRating ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-sm font-medium">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        {media.userRating} / 10
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-500 italic">Puan verilmedi</span>
                    )}
                  </div>

                  <div>
                    <span className="text-xs text-zinc-500 block mb-1">Etiketlerim</span>
                    {media.tags && media.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {media.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-500 italic">Etiket yok</span>
                    )}
                  </div>

                  <div>
                    <span className="text-xs text-zinc-500 block mb-1">Kişisel Notlarım</span>
                    <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/80 min-h-[4rem]">
                      {media.personalNotes ? (
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                          {media.personalNotes}
                        </p>
                      ) : (
                        <span className="text-sm text-zinc-500 italic flex items-center gap-1">
                          <StickyNote className="w-3.5 h-3.5" />
                          Kişisel not eklenmemiş.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Logs */}
              {sortedLogs.length > 0 && (
                <div className="bg-zinc-800/20 border border-zinc-800/80 rounded-xl p-4 mt-6">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-400" />
                    Son Aktiviteler
                  </h3>
                  <div className="space-y-3">
                    {sortedLogs.slice(0, 5).map((log) => (
                      <div key={log.id} className="flex flex-col bg-zinc-900/30 rounded-lg p-2.5 border border-zinc-800/50">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-zinc-300">
                            {log.action === "increment" && `+${log.amount} Eklendi`}
                            {log.action === "complete" && "Tamamlandı"}
                            {log.action === "manual_adjust" && "Manuel Düzenleme"}
                          </span>
                          <span className="text-[10px] text-zinc-500">{formatDate(log.createdAt)}</span>
                        </div>
                        <span className="text-xs text-zinc-400">
                          {log.previousProgress} → {log.newProgress} {log.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Aksiyonlar */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/50 flex justify-between items-center">
          <div className="flex gap-2">
            <button
              onClick={handleEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700"
            >
              <Pencil className="w-4 h-4" />
              Düzenle
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
            >
              <Trash2 className="w-4 h-4" />
              Sil
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
