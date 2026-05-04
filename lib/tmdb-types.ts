// ============================================
// TMDB API Tip Tanımları
// ============================================
// TMDB'den dönen ham verilerin ve normalize edilmiş
// sonuçların tip tanımları.

/**
 * TMDB "search/multi" endpoint'inden dönen ham sonuç.
 * Sadece kullandığımız alanları tanımlıyoruz.
 */
export interface TmdbRawResult {
  id: number;
  media_type: "movie" | "tv" | "person";

  // Film alanları
  title?: string;           // Film başlığı
  release_date?: string;    // Çıkış tarihi "2010-07-16" formatında

  // Dizi alanları
  name?: string;            // Dizi adı
  first_air_date?: string;  // İlk yayın tarihi

  // Ortak alanlar
  overview?: string;        // Kısa açıklama
  poster_path?: string | null;     // Poster yolu ("/abc123.jpg")
  vote_average?: number;
  popularity?: number;
}

/**
 * TMDB API yanıtının üst yapısı.
 */
export interface TmdbSearchResponse {
  page: number;
  results: TmdbRawResult[];
  total_pages: number;
  total_results: number;
}

/**
 * Normalize edilmiş TMDB sonucu.
 * Frontend'e bu formatta gönderilir.
 */
export interface TmdbNormalizedResult {
  externalSource: "tmdb";
  externalId: string;        // TMDB ID (string olarak)
  type: "movie" | "tv";      // Sadece film veya dizi
  title: string;
  originalTitle?: string;
  overview?: string;
  releaseYear?: number;
  coverUrl?: string;
  totalProgress: number;     // movie: 1, tv: 1 (ileride detail ile güncellenecek)
}
