// ============================================
// Series Group Card — V2
// ============================================
// Aynı seriesGroupId'ye sahip 2+ MediaItem'ı tek bir
// aç/kapat kart altında toplar. V2'de:
// - Grup seviyesinde "Sezon/Parça Ekle" aksiyonu
// - Kapalı haldeki özet: parça/tamamlanan/yüzde + devam edilen parça
// - Normal MediaCard'tan görsel olarak ayırt edilen kart
// - Açıldığında child kartlar görsel olarak grup altına bağlı görünür

"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronDown, ChevronUp, Layers, Plus, Pencil } from "lucide-react";
import { MediaItem } from "@/lib/types";
import { MediaItemGroup } from "@/lib/series-group";
import { getMediaTypeLabel, getProgressLabel } from "@/lib/progress";
import MediaCard from "@/components/media-card";

interface SeriesGroupCardProps {
  group: MediaItemGroup;
  onIncrement: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenDetail: (item: MediaItem) => void;
  onAddRelatedParts?: (item: MediaItem) => void;
  resolveRelatedAction?: (item: MediaItem) => { canAdd: boolean; label: string };
  onOpenGroupEdit?: (item: MediaItem) => void;
}

function isItemCompleted(item: MediaItem): boolean {
  if (item.status === "completed") return true;
  if (item.totalProgress > 0 && item.currentProgress >= item.totalProgress) {
    return true;
  }
  return false;
}

function isItemActive(item: MediaItem): boolean {
  if (item.status === "watching" || item.status === "reading") return true;
  if (
    item.status !== "completed" &&
    item.status !== "dropped" &&
    item.currentProgress > 0 &&
    (item.totalProgress === 0 || item.currentProgress < item.totalProgress)
  ) {
    return true;
  }
  return false;
}

function getOngoingItem(items: MediaItem[]): MediaItem | undefined {
  // groupMediaItems zaten orderIndex/seasonNumber sıralı veriyor.
  return items.find(isItemActive) ?? items.find((it) => !isItemCompleted(it));
}

function shortTitle(title: string | undefined, max = 32): string {
  if (!title) return "Parça";
  const trimmed = title.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Devam edilen parça için kullanıcıya gösterilecek kısa label.
 * orderIndex/releaseYear ASLA "Parça X" olarak gösterilmez — onlar yalnızca
 * sıralama hint'idir. Güvenilir sezon/role bilgisi yoksa item title'ından
 * kısa, okunur bir başlık döner.
 */
function describeOngoingLabel(item: MediaItem): string {
  if (typeof item.seasonNumber === "number" && item.seasonNumber > 0) {
    return `Sezon ${item.seasonNumber}`;
  }
  switch (item.seriesRelationType) {
    case "season":
      return shortTitle(item.title);
    case "movie":
      return "Film";
    case "ova":
      return "OVA";
    case "ona":
      return "ONA";
    case "special":
      return "Special";
    case "recap":
      return "Recap";
    case "spin_off":
      return "Spin-off";
    case "side_story":
      return "Yan Hikaye";
    default:
      return shortTitle(item.title);
  }
}

/**
 * Grup için, child item'ların currentProgress/totalProgress toplamına dayalı
 * yüzde hesaplar. totalProgress yoksa fallback olarak completed/total oranı kullanılır.
 */
function computeGroupProgress(items: MediaItem[]): {
  percent: number;
  current: number;
  total: number;
  hasUnitTotals: boolean;
} {
  let current = 0;
  let total = 0;
  let hasUnitTotals = false;
  for (const it of items) {
    const t = typeof it.totalProgress === "number" ? it.totalProgress : 0;
    const c = typeof it.currentProgress === "number" ? it.currentProgress : 0;
    if (t > 0) {
      hasUnitTotals = true;
      total += t;
      current += Math.min(Math.max(c, 0), t);
    }
  }
  if (hasUnitTotals && total > 0) {
    return {
      percent: Math.round((current / total) * 100),
      current,
      total,
      hasUnitTotals: true,
    };
  }
  // Fallback: completed/total parça oranı (eski davranış)
  const completedCount = items.filter(isItemCompleted).length;
  const totalCount = items.length;
  return {
    percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    current: completedCount,
    total: totalCount,
    hasUnitTotals: false,
  };
}

export default function SeriesGroupCard({
  group,
  onIncrement,
  onComplete,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenDetail,
  onAddRelatedParts,
  resolveRelatedAction,
  onOpenGroupEdit,
}: SeriesGroupCardProps) {
  const [open, setOpen] = useState(false);

  const items = group.items;
  const total = items.length;
  const completed = items.filter(isItemCompleted).length;

  // V3.1: yüzde, child item'ların gerçek progress toplamına göre hesaplanır.
  // currentProgress/totalProgress değişince anında güncellenir.
  const groupProgress = computeGroupProgress(items);
  const percent = groupProgress.percent;

  const cover = items[0]?.coverImage;
  const title = group.seriesGroupTitle || items[0]?.title || "Seri";

  const allSeasons = items.every((it) => it.seriesRelationType === "season");
  const partsLabel = allSeasons ? "sezon" : "parça";
  const firstType = items[0]?.type;
  const sameType = firstType && items.every((it) => it.type === firstType);

  // Devam edilen parça (varsa)
  const ongoing = getOngoingItem(items);
  const ongoingLabel = ongoing ? describeOngoingLabel(ongoing) : null;
  const ongoingProgressLabel = ongoing ? getProgressLabel(ongoing.type) : "";

  // Grup seviyesinde "Sezon/Parça Ekle" — temsilci olarak ilk item kullanılır
  // (TVmaze season grupları için hepsi aynı showId'yi paylaşır).
  const representative = items[0];
  const groupRelated = representative && resolveRelatedAction
    ? resolveRelatedAction(representative)
    : undefined;
  const canAddAtGroupLevel =
    !!groupRelated?.canAdd && !!onAddRelatedParts && !!representative;

  return (
    <div
      className={`relative rounded-2xl border bg-gradient-to-b from-violet-500/[0.04] to-zinc-900/50 ring-1 transition-colors ${
        open
          ? "border-violet-500/40 ring-violet-500/20"
          : "border-zinc-800/60 ring-transparent hover:border-violet-500/30"
      }`}
    >
      {/* Sol kenar accent — grup olduğunu güçlü şekilde belli eder */}
      <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-violet-500/60 to-fuchsia-500/40" />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-4 p-4 text-left rounded-2xl hover:bg-zinc-900/40 transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <div className="relative w-16 h-22 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-zinc-800">
          {cover ? (
            <Image
              src={cover}
              alt={title}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
              <Layers className="w-5 h-5 text-zinc-600" />
            </div>
          )}
          {/* Parça sayısı rozeti */}
          <span className="absolute bottom-1 right-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-black/70 text-violet-200 ring-1 ring-violet-500/30">
            {total}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30">
              <Layers className="w-3 h-3" />
              Seri
            </span>
            {sameType && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 ring-1 ring-zinc-700/50">
                {getMediaTypeLabel(firstType!)}
              </span>
            )}
          </div>

          <h3 className="mt-1.5 font-semibold text-zinc-100 text-sm leading-tight truncate">
            {title}
          </h3>

          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] text-zinc-500">
            <span>
              <span className="text-zinc-300 font-medium">{total}</span> {partsLabel}
            </span>
            <span className="text-zinc-700">•</span>
            <span>
              <span className="text-emerald-400 font-medium">{completed}</span> tamamlandı
            </span>
            {ongoingLabel && completed < total && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="text-blue-300/90">
                  Devam: {ongoingLabel}
                  {ongoing && ongoing.totalProgress > 0 && (
                    <span className="text-zinc-500">
                      {" "}
                      ({ongoing.currentProgress}/{ongoing.totalProgress} {ongoingProgressLabel})
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-[11px] text-zinc-400 font-medium tabular-nums">
              {percent}%
            </span>
          </div>
        </div>

        <div className="flex items-center text-zinc-500 self-center">
          {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Grup seviyesi aksiyonlar */}
      {(canAddAtGroupLevel || (onOpenGroupEdit && representative)) && (
        <div className="px-4 pb-3 -mt-1 flex items-center gap-2 flex-wrap">
          {canAddAtGroupLevel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (representative && onAddRelatedParts) {
                  onAddRelatedParts(representative);
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30 hover:bg-violet-500/25 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              {groupRelated?.label ?? "Sezon Ekle"}
            </button>
          )}
          {onOpenGroupEdit && representative && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenGroupEdit(representative);
              }}
              title="Grup başlığını düzenle"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-fuchsia-500/10 text-fuchsia-300 ring-1 ring-fuchsia-500/25 hover:bg-fuchsia-500/20 transition-colors cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
              Grubu Düzenle
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="border-t border-violet-500/15 bg-zinc-950/40 rounded-b-2xl">
          <div className="relative pl-3 pr-3 py-3 sm:pl-4 sm:pr-4 sm:py-4 space-y-3">
            {/* Soldaki ince hiyerarşi çizgisi */}
            <div className="pointer-events-none absolute left-1.5 top-3 bottom-3 w-px bg-violet-500/20" />
            {items.map((child) => {
              const related = resolveRelatedAction?.(child);
              return (
                <div key={child.id} className="relative pl-3">
                  <MediaCard
                    item={child}
                    onIncrement={onIncrement}
                    onComplete={onComplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleFavorite={onToggleFavorite}
                    onOpenDetail={onOpenDetail}
                    onAddRelatedParts={onAddRelatedParts}
                    relatedPartsLabel={related?.label}
                    canAddRelatedParts={related?.canAdd ?? false}
                    onOpenGroupEdit={onOpenGroupEdit}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
