// ============================================
// R15 — World scope helpers
// ============================================
// "Dünya" (themeFilter) bazlı item/log scoping. Tek kaynak: aynı
// withMediaClassification çıkışı + aynı taksonomi kuralları (R9). app/page.tsx
// içindeki filtre IIFE'siyle birebir uyumlu olmalı; ikisinden birini
// değiştirirken diğerini de güncelle.
//
// Kapsam haritası (R9, korundu):
//   "all"     → tüm item'lar
//   "east"    → mediaType ∈ {anime, manga, novel}
//                (anime_movie/ova/ona/special, light/web/visual/serialized novel dahil)
//   "screen"  → mediaType ∈ {tv, movie}
//   "library" → mediaType === "book" (klasik kitap; novel'lar Doğu altında)
//
// Bu helper SADECE okuma yönünde — veriyi mutate etmez, classification'ı
// MediaItem.theme alanına yazmaz. eastSubFilter/typeFilter/statusFilter
// burada uygulanmaz (brief: "Search/status/type filtrelerine göre değil,
// seçili Dünya'ya göre çalışsın").

import type { MediaItem, ProgressLog } from "./types";
import { withMediaClassification } from "./types";

export type WorldScope = "all" | "east" | "screen" | "library";

export function matchesWorldScope(item: MediaItem, scope: WorldScope): boolean {
  if (scope === "all") return true;
  const cls = withMediaClassification(item);
  if (scope === "east") {
    return (
      cls.mediaType === "anime" ||
      cls.mediaType === "manga" ||
      cls.mediaType === "novel"
    );
  }
  if (scope === "screen") {
    return cls.mediaType === "tv" || cls.mediaType === "movie";
  }
  // scope === "library"
  return cls.mediaType === "book";
}

export function scopeMediaListByWorld(
  items: MediaItem[],
  scope: WorldScope,
): MediaItem[] {
  if (scope === "all") return items;
  return items.filter((it) => matchesWorldScope(it, scope));
}

/**
 * Logları scope item id setiyle filtreler. Item silinmiş veya scope dışı ise
 * o log'a bağlı satır da çıkar — "Son Aktiviteler" widget'ı dünya bazlı
 * çalışırken yetim log gösterilmesin diye.
 */
export function scopeProgressLogsByWorld(
  logs: ProgressLog[],
  items: MediaItem[],
  scope: WorldScope,
): ProgressLog[] {
  if (scope === "all") return logs;
  const allowed = new Set(
    items.filter((it) => matchesWorldScope(it, scope)).map((it) => it.id),
  );
  return logs.filter((l) => allowed.has(l.mediaId));
}
