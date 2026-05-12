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

/** Global Search kategori filtreleri */
export type GlobalSearchCategory =
  | "all"
  | "tv"
  | "anime"
  | "manga"
  | "manhwa"
  | "manhua"
  | "book"
  | "movie";

/** Gruplanmış sonuçlar (Hepsi modunda) */
export interface GroupedResults {
  tv: GlobalSearchResult[];
  anime: GlobalSearchResult[];
  manga: GlobalSearchResult[];
  manhwa: GlobalSearchResult[];
  manhua: GlobalSearchResult[];
  book: GlobalSearchResult[];
}
