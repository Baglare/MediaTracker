// ============================================
// Global Search Tip Tanımları
// ============================================

import { MediaType } from "./types";

/** Global Search sonuçlarının ortak yapısı */
export interface GlobalSearchResult {
  // R21.2: TMDB film aramalarında birincil kaynak olarak eklendi. OMDb
  // hâlâ fallback kaynağı olarak kullanılıyor (TMDB unavailable veya 0 sonuç
  // durumlarında).
  source: "tvmaze" | "anilist" | "openlibrary" | "omdb" | "tmdb";
  externalId: string;
  type: MediaType;
  title: string;
  subtitle?: string;        // Orijinal başlık, yazar vb.
  nativeTitle?: string;     // AniList için ayrı native/Kanji başlığı
  overview?: string;
  releaseYear?: number;
  coverUrl?: string;
  genres?: string[];
  subjects?: string[];
  authors?: string[];
  totalProgress?: number;
  // Ekleme sırasında detay çekmek için gerekli ham veri
  raw?: unknown;
}

export interface GlobalSearchLibraryStatus {
  isInLibrary: boolean;
  hasAddableParts: boolean;
  actionLabel?: string;
  missingCount?: number;
}

/**
 * Global Search kategori filtreleri (R23.2 sadeleştirme).
 *
 * Kütüphanem'in Dünya taksonomisine paralel olarak chip seti küçültüldü:
 * `manhwa` ve `manhua` artık ayrı chip değil — "manga" chip'i bu üç kaynak
 * türünü birden kapsar. "novel" chip'i AniList format=NOVEL ve
 * light/web/visual novel tiplerini toplar. Fetch katmanı bu chip'lere
 * görünür bir tek-tek param GEÇMEZ; client-side filtering ile aynı raw
 * havuz üzerinden ayrıştırılır.
 */
export type GlobalSearchCategory =
  | "all"
  | "movie"
  | "tv"
  | "anime"
  | "manga"
  | "novel"
  | "book";

/** Gruplanmış sonuçlar (Hepsi modunda) */
export interface GroupedResults {
  tv: GlobalSearchResult[];
  anime: GlobalSearchResult[];
  manga: GlobalSearchResult[];
  manhwa: GlobalSearchResult[];
  manhua: GlobalSearchResult[];
  book: GlobalSearchResult[];
}
