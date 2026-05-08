"use client";

import { useState, useMemo } from "react";
import { MediaItem, MediaStatus } from "@/lib/types";
import { X, Heart, Save } from "lucide-react";
import Image from "next/image";

interface QuickAddPayload {
  singleItem: MediaItem;
  seasonItems: MediaItem[] | null;
}

interface QuickAddModalProps {
  isOpen: boolean;
  payload: QuickAddPayload | null;
  onSave: (items: MediaItem[]) => void;
  onClose: () => void;
}

type AddMode = "single" | "seasons";

function getProgressLabel(type: string) {
  switch (type) {
    case "tv":
    case "anime":
      return "Bölüm";
    case "manga":
    case "manhwa":
    case "manhua":
      return "Bölüm (Ch)";
    case "book":
      return "Sayfa";
    case "movie":
      return "İzlenme";
    default:
      return "İlerleme";
  }
}

function getActiveStatusForType(type: string): MediaStatus {
  return type === "book" || type === "manga" || type === "manhwa" || type === "manhua"
    ? "reading"
    : "watching";
}

export default function QuickAddModal({
  isOpen,
  payload,
  onSave,
  onClose,
}: QuickAddModalProps) {
  const hasSeasons = !!(payload?.seasonItems && payload.seasonItems.length > 1);

  const [mode, setMode] = useState<AddMode>("single");
  const [selectedSeasonIds, setSelectedSeasonIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<MediaStatus>("planning");
  const [currentProgressInput, setCurrentProgressInput] = useState("");
  const [userRating, setUserRating] = useState("");
  const [favorite, setFavorite] = useState(false);

  // Modal her açıldığında veya farklı bir payload geldiğinde formu sıfırla.
  const payloadKey = isOpen && payload ? payload.singleItem.id : null;
  const [resetKey, setResetKey] = useState<string | null>(null);
  if (resetKey !== payloadKey) {
    setResetKey(payloadKey);
    setMode(hasSeasons ? "seasons" : "single");
    setSelectedSeasonIds(new Set(payload?.seasonItems?.map((s) => s.id) ?? []));
    setStatus("planning");
    setCurrentProgressInput("");
    setUserRating("");
    setFavorite(false);
  }

  const currentProgress = currentProgressInput.trim() === "" ? 0 : Number(currentProgressInput);

  // Kaydedilecek aktif item dizisini moda göre hesapla
  const activeItems = useMemo<MediaItem[]>(() => {
    if (!payload) return [];
    if (mode === "single" || !payload.seasonItems) return [payload.singleItem];
    return payload.seasonItems.filter((s) => selectedSeasonIds.has(s.id));
  }, [payload, mode, selectedSeasonIds]);

  const totalProgress = useMemo(
    () => activeItems.reduce((sum, item) => sum + item.totalProgress, 0),
    [activeItems]
  );

  if (!isOpen || !payload) return null;

  const primaryItem = payload.singleItem;
  const allSeasons = payload.seasonItems ?? [];
  const isMultiSelected = mode === "seasons" && activeItems.length > 1;

  const toggleSeason = (id: string) => {
    setSelectedSeasonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSeasons = () => {
    setSelectedSeasonIds((prev) => {
      if (prev.size === allSeasons.length) return new Set();
      return new Set(allSeasons.map((s) => s.id));
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeItems.length === 0) return;

    const finalProgress = Math.max(0, Math.min(currentProgress, totalProgress || currentProgress));
    const ratingNum = userRating.trim() !== "" ? parseInt(userRating, 10) : null;
    let remainingProgress = status === "completed" ? totalProgress : finalProgress;

    const savedItems = activeItems.map((item) => {
      const seasonProgress = Math.max(0, Math.min(remainingProgress, item.totalProgress));
      remainingProgress = Math.max(0, remainingProgress - seasonProgress);

      let finalStatus: MediaStatus = status;
      if (status === "completed" && item.totalProgress > 0) {
        finalStatus = "completed";
      } else if (seasonProgress >= item.totalProgress && item.totalProgress > 0) {
        finalStatus = "completed";
      } else if (seasonProgress > 0 && status === "planning") {
        finalStatus = getActiveStatusForType(item.type);
      }

      return {
        ...item,
        status: finalStatus,
        currentProgress: seasonProgress,
        userRating: ratingNum,
        favorite,
      };
    });

    onSave(savedItems);
  };

  const titleForHeader = isMultiSelected
    ? primaryItem.title.replace(/ - Sezon \d+$/, "")
    : primaryItem.title;

  const allSelected = selectedSeasonIds.size === allSeasons.length && allSeasons.length > 0;
  const noneSelected = activeItems.length === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-xl font-bold text-white">Kütüphaneye Ekle</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
          <div className="flex gap-4 mb-5 bg-zinc-800/30 p-4 rounded-xl border border-zinc-800/80">
            <div className="w-16 h-24 flex-shrink-0 bg-zinc-800 rounded-md overflow-hidden">
              <Image
                src={primaryItem.coverImage}
                alt={primaryItem.title}
                width={64}
                height={96}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h3
                title={titleForHeader}
                className="text-lg font-bold text-white leading-tight break-words"
              >
                {titleForHeader}
              </h3>
              <p className="text-sm text-zinc-400 capitalize mb-1">{primaryItem.type}</p>
              {primaryItem.releaseYear && (
                <p className="text-xs text-zinc-500">{primaryItem.releaseYear}</p>
              )}
              {hasSeasons && (
                <p className="text-xs text-violet-400 mt-1">
                  {allSeasons.length} sezon mevcut
                </p>
              )}
            </div>
          </div>

          {/* Mod Seçimi */}
          {hasSeasons && (
            <div className="mb-5">
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === "single"
                      ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Tek Kayıt Olarak Ekle
                </button>
                <button
                  type="button"
                  onClick={() => setMode("seasons")}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === "seasons"
                      ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Sezonları Ayrı Ekle
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                {mode === "single"
                  ? "Diziyi tek bir kayıt olarak, tüm bölümleriyle ekler."
                  : "Seçtiğiniz her sezon ayrı bir kayıt olarak eklenir."}
              </p>
            </div>
          )}

          {/* Sezon Seçim Listesi */}
          {hasSeasons && mode === "seasons" && (
            <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-400">
                  Eklenecek sezonlar ({activeItems.length}/{allSeasons.length})
                </p>
                <button
                  type="button"
                  onClick={toggleAllSeasons}
                  className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  {allSelected ? "Tümünü Bırak" : "Tümünü Seç"}
                </button>
              </div>
              <div className="space-y-1.5">
                {allSeasons.map((item) => {
                  const checked = selectedSeasonIds.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        checked
                          ? "bg-violet-500/10 ring-1 ring-violet-500/30"
                          : "bg-zinc-900/40 hover:bg-zinc-900/70"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSeason(item.id)}
                          className="w-4 h-4 accent-violet-500 cursor-pointer"
                        />
                        <span className="text-xs text-zinc-200 truncate">{item.title}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 whitespace-nowrap">
                        {item.totalProgress} bölüm
                      </span>
                    </label>
                  );
                })}
              </div>
              {noneSelected && (
                <p className="mt-2 text-[11px] text-rose-400">En az bir sezon seçmelisiniz.</p>
              )}
            </div>
          )}

          <form id="quick-add-form" onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Durum <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={status}
                onChange={(e) => setStatus(e.target.value as MediaStatus)}
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              >
                {(() => {
                  const t = primaryItem.type;
                  const isReadingType = t === "book" || t === "manga" || t === "manhwa" || t === "manhua";
                  // Aktif durum (watching/reading) tek bir option olarak gösterilir;
                  // value türe uygun ki form save'de doğru status'a otomatik düşsün.
                  return (
                    <>
                      <option value="planning">Planlanıyor</option>
                      <option value={isReadingType ? "reading" : "watching"}>
                        {isReadingType ? "Okunuyor" : "İzleniyor"}
                      </option>
                      <option value="completed">Tamamlandı</option>
                      <option value="paused">Duraklatıldı</option>
                      <option value="dropped">Bırakıldı</option>
                    </>
                  );
                })()}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  {getProgressLabel(primaryItem.type)} (Mevcut)
                </label>
                <input
                  type="number"
                  min="0"
                  max={totalProgress || undefined}
                  value={currentProgressInput}
                  placeholder="0"
                  onChange={(e) => setCurrentProgressInput(e.target.value)}
                  disabled={status === "completed" || noneSelected}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
                />
                {isMultiSelected && (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    İlerleme seçili sezonlara sırayla dağıtılır.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Toplam
                </label>
                <input
                  type="number"
                  value={totalProgress}
                  disabled
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-500 opacity-50 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Puanınız (0-10)
                </label>
                <select
                  value={userRating}
                  onChange={(e) => setUserRating(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 cursor-pointer"
                >
                  <option value="">Puan verilmedi</option>
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={String(i)}>{i}/10</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => setFavorite(!favorite)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
                    favorite
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Heart className={`w-5 h-5 ${favorite ? "fill-rose-500" : ""}`} />
                  <span className="text-sm font-medium">Favori</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="p-5 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            İptal
          </button>
          <button
            type="submit"
            form="quick-add-form"
            disabled={noneSelected}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors flex items-center gap-2 shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-violet-600"
          >
            <Save className="w-4 h-4" />
            Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
