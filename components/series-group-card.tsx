// ============================================
// Series Group Card — R3 (Layout Redesign)
// ============================================
// Aynı seriesGroupId'ye sahip 2+ MediaItem'ı tek bir aç/kapat kart altında
// toplar. R3 turunda görsel/yerleşim güçlendirildi: featured-collection
// hissi veren header, üst accent şeridi, sağda kompakt ilerleme paneli ve
// child item'lar için daha temiz bir iç container. Veri/logic akışı
// (computeGroupProgress, getOngoingItem, describeOngoingLabel, props
// arayüzü) aynen korunuyor. Child kartlar hâlâ MediaCard.

"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronDown, ChevronUp, Layers, Plus, Pencil } from "lucide-react";
import { MediaItem } from "@/lib/types";
import { MediaItemGroup } from "@/lib/series-group";
import { getMediaTypeLabel, getProgressLabel } from "@/lib/progress";
import MediaCard from "@/components/media-card";
import { resolveThemeAccent } from "@/components/theme-accent";

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
  // R18.3: Child MediaCard'lara hızlı puanlama prop'unu geçirmek için passthrough.
  onUpdateRating?: (id: string, rating: number | null) => void;
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
  onUpdateRating,
}: SeriesGroupCardProps) {
  const [open, setOpen] = useState(false);

  const items = group.items;
  const total = items.length;
  const completed = items.filter(isItemCompleted).length;

  // yüzde, child item'ların gerçek progress toplamına göre hesaplanır.
  // currentProgress/totalProgress değişince anında güncellenir.
  const groupProgress = computeGroupProgress(items);
  const percent = groupProgress.percent;

  // Toplam bilinen birim (bölüm/chapter) — child'lardan toplanır; bilinmeyen
  // (totalProgress=0) child'lar dahil edilmez.
  const unitTotal = groupProgress.hasUnitTotals ? groupProgress.total : 0;
  const unitCurrent = groupProgress.hasUnitTotals ? groupProgress.current : 0;

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

  // Grup tek bir Doğu ailesinden mi (hepsi anime / hepsi manga / hepsi novel)?
  // Öyleyse sol kenar accent + küçük rozet themeden tonlanır. Karışıksa fallback violet.
  const accents = items.map(resolveThemeAccent);
  const firstFamily = accents[0]?.family ?? null;
  const sameEastFamily =
    firstFamily !== null && accents.every((a) => a.family === firstFamily);
  const groupAccent = sameEastFamily ? accents[0]?.accent ?? null : null;
  const familyLabel: Record<"anime" | "manga" | "novel", string> = {
    anime: "Anime",
    manga: "Manga",
    novel: "Novel",
  };

  // Grup seviyesinde "Sezon/Parça Ekle" — temsilci olarak ilk item kullanılır
  // (TVmaze season grupları için hepsi aynı showId'yi paylaşır).
  const representative = items[0];
  const groupRelated = representative && resolveRelatedAction
    ? resolveRelatedAction(representative)
    : undefined;
  const canAddAtGroupLevel =
    !!groupRelated?.canAdd && !!onAddRelatedParts && !!representative;

  // Accent palet: Doğu ailesi varsa tema rengi; aksi halde violet/fuchsia fallback.
  // R3: tek bir yerden okunsun diye class'ları burada topluyoruz.
  const palette = groupAccent
    ? {
        topStrip: groupAccent.groupSideGradient, // "from-x to-y"
        progressBar: groupAccent.groupSideGradient,
        ringBorder: "border-amber-500/30",
        ringHover: "hover:border-amber-500/40",
        ringOpen: "border-amber-500/45 ring-amber-500/15",
        bgGradient: "from-amber-500/[0.05]",
        seriBadge:
          "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
        addBtn:
          "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 hover:bg-amber-500/25",
        editBtn:
          "bg-zinc-800/70 text-zinc-300 ring-1 ring-zinc-700/60 hover:bg-zinc-700/70",
        partCountBadge: "bg-black/70 text-amber-200 ring-1 ring-amber-500/30",
        innerDivider: "border-amber-500/15",
        innerBg: "bg-zinc-950/40",
        innerLine: "bg-amber-500/20",
        addChildBtn:
          "border-amber-500/30 text-amber-200 hover:bg-amber-500/10",
      }
    : {
        // R12: Doğu ailesi dışındaki gruplar (karışık veya tek aile değil)
        // için fallback artık world tokenlarından besleniyor. Aktif dünya
        // "Tümü" iken --w-primary nötr zinc-400 olduğundan kart sessiz kalır;
        // Kadraj/Arşiv'de hafifçe o dünyanın tonuna çekilir. Tailwind 4 JIT
        // arbitrary-value (color-mix) sınıflarını yakalar.
        topStrip:
          "from-[color-mix(in_srgb,var(--w-primary)_70%,transparent)] to-[color-mix(in_srgb,var(--w-secondary)_40%,transparent)]",
        progressBar:
          "from-[var(--w-primary)] to-[var(--w-primary-strong)]",
        ringBorder: "border-zinc-800/60",
        ringHover:
          "hover:border-[color-mix(in_srgb,var(--w-primary)_30%,transparent)]",
        ringOpen:
          "border-[color-mix(in_srgb,var(--w-primary)_40%,transparent)] ring-[color-mix(in_srgb,var(--w-primary)_20%,transparent)]",
        bgGradient:
          "from-[color-mix(in_srgb,var(--w-primary)_4%,transparent)]",
        seriBadge:
          "bg-[var(--w-soft)] text-[var(--w-primary-strong)] ring-1 ring-[color-mix(in_srgb,var(--w-primary)_30%,transparent)]",
        addBtn:
          "bg-[var(--w-soft)] text-[var(--w-primary-strong)] ring-1 ring-[color-mix(in_srgb,var(--w-primary)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--w-primary)_22%,transparent)]",
        editBtn:
          "bg-zinc-800/70 text-zinc-300 ring-1 ring-zinc-700/60 hover:bg-zinc-700/70",
        partCountBadge:
          "bg-black/70 text-[var(--w-primary-strong)] ring-1 ring-[color-mix(in_srgb,var(--w-primary)_30%,transparent)]",
        innerDivider:
          "border-[color-mix(in_srgb,var(--w-primary)_15%,transparent)]",
        innerBg: "bg-zinc-950/40",
        innerLine:
          "bg-[color-mix(in_srgb,var(--w-primary)_20%,transparent)]",
        addChildBtn:
          "border-[color-mix(in_srgb,var(--w-primary)_30%,transparent)] text-[var(--w-primary-strong)] hover:bg-[var(--w-soft)]",
      };

  return (
    <div
      className={`relative rounded-2xl border bg-gradient-to-b ${palette.bgGradient} to-zinc-900/60 ring-1 transition-colors overflow-hidden ${
        open
          ? `${palette.ringOpen}`
          : `${palette.ringBorder} ring-transparent ${palette.ringHover}`
      }`}
    >
      {/* Üst accent şeridi — "featured collection" hissi.
          R6: opacity hafifletildi ki grid içinde diğer kartları bastırmasın. */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${palette.topStrip} opacity-60`}
      />

      {/* HEADER — toggle alanı + sağda kompakt progress paneli */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // R20: Mobilde header iki satır gride düşer — cover+orta üstte,
        // ilerleme/chev alt satırda tam genişlikte. sm+'da eski 3 kolonlu
        // yatay diziliş aynen korunur.
        className="w-full grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-3 sm:gap-4 p-3 sm:p-5 text-left hover:bg-zinc-900/30 transition-colors cursor-pointer"
        aria-expanded={open}
      >
        {/* Cover — biraz daha belirgin (20x28) */}
        <div className="relative w-20 h-28 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-zinc-800 shadow-md shadow-black/30">
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
              <Layers className="w-6 h-6 text-zinc-600" />
            </div>
          )}
          {/* Parça sayısı rozeti */}
          <span
            className={`absolute bottom-1 right-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${palette.partCountBadge}`}
          >
            {total}
          </span>
        </div>

        {/* Orta: badges + title + meta + devam */}
        <div className="min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${palette.seriBadge}`}
            >
              <Layers className="w-3 h-3" />
              Seri
            </span>
            {sameType && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 ring-1 ring-zinc-700/50">
                {getMediaTypeLabel(firstType!)}
              </span>
            )}
            {groupAccent && firstFamily && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md ring-1 ${groupAccent.badge}`}
                title={`Doğu · ${familyLabel[firstFamily]}`}
              >
                <groupAccent.Icon className="w-3 h-3" />
                {familyLabel[firstFamily]}
              </span>
            )}
          </div>

          <h3 className="font-semibold text-zinc-50 text-base sm:text-[17px] leading-tight tracking-tight line-clamp-2">
            {title}
          </h3>

          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-zinc-500">
            <span>
              <span className="text-zinc-200 font-medium tabular-nums">{total}</span> {partsLabel}
            </span>
            <span className="text-zinc-700">·</span>
            <span>
              <span className="text-emerald-400 font-medium tabular-nums">{completed}</span> tamamlandı
            </span>
            {unitTotal > 0 && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="font-mono text-zinc-400 tabular-nums">
                  {unitCurrent}/{unitTotal}
                </span>
              </>
            )}
          </div>

          {ongoingLabel && completed < total && (
            <div className="text-[11.5px] text-zinc-400">
              <span className="text-zinc-500">Devam: </span>
              <span className="text-blue-300/90 font-medium">{ongoingLabel}</span>
              {ongoing && ongoing.totalProgress > 0 && (
                <span className="text-zinc-500 ml-1 font-mono tabular-nums">
                  ({ongoing.currentProgress}/{ongoing.totalProgress} {ongoingProgressLabel})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Sağ: kompakt progress + chevron.
            R20: Mobilde col-span-2 ile alt satıra düşer ve yatay diziliş alır
            (chevron sağda, progress bar sola yayılır). sm+'da eski dikey
            sağ kolon davranışı korunur. */}
        <div className="col-span-2 sm:col-span-1 flex flex-row-reverse sm:flex-col items-center sm:items-end justify-between gap-3 sm:gap-2 sm:min-w-[110px]">
          <div className="flex items-center text-zinc-500">
            {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          <div className="w-full">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
                İlerleme
              </span>
              <span className="text-sm font-semibold text-zinc-100 tabular-nums">
                {percent}%
              </span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${palette.progressBar} transition-all duration-500 ease-out`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Grup seviyesi aksiyonlar */}
      {(canAddAtGroupLevel || (onOpenGroupEdit && representative)) && (
        <div className="px-4 sm:px-5 pb-3 -mt-1 flex items-center gap-2 flex-wrap">
          {canAddAtGroupLevel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (representative && onAddRelatedParts) {
                  onAddRelatedParts(representative);
                }
              }}
              className={`inline-flex items-center gap-1 px-3 h-8 sm:px-2.5 sm:h-auto sm:py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${palette.addBtn}`}
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
              className={`inline-flex items-center gap-1 px-3 h-8 sm:px-2.5 sm:h-auto sm:py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${palette.editBtn}`}
            >
              <Pencil className="w-3 h-3" />
              Grubu Düzenle
            </button>
          )}
        </div>
      )}

      {open && (
        <div className={`border-t ${palette.innerDivider} ${palette.innerBg} rounded-b-2xl`}>
          <div className="relative pl-4 pr-3 py-4 sm:pl-5 sm:pr-4 sm:py-5 space-y-3">
            {/* Soldaki ince hiyerarşi çizgisi — child'ların bağlı olduğunu gösterir */}
            <div
              className={`pointer-events-none absolute left-2 top-4 bottom-4 w-px ${palette.innerLine}`}
              aria-hidden="true"
            />
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
                    onUpdateRating={onUpdateRating}
                  />
                </div>
              );
            })}

            {/* Expanded içinde de bir "Sezon/Parça Ekle" affordance'ı bırakıyoruz —
                referans tasarımda dashed ghost slot olarak görünüyor. Aynı handler. */}
            {canAddAtGroupLevel && (
              <button
                type="button"
                onClick={() => {
                  if (representative && onAddRelatedParts) {
                    onAddRelatedParts(representative);
                  }
                }}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-xs font-medium transition-colors cursor-pointer ${palette.addChildBtn}`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{groupRelated?.label ?? "Sezon / Parça Ekle"}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
