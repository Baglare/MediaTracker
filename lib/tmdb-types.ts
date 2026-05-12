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

/**
 * R21.2: TMDB `/movie/{id}` detay yanıtı için kullandığımız alanlar.
 * `append_to_response=external_ids` ile IMDb id de alınıyor → siteUrl üretimi.
 */
export interface TmdbMovieDetailResponse {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  release_date?: string;
  poster_path?: string | null;
  runtime?: number | null;
  vote_average?: number;
  genres?: { id: number; name: string }[];
  external_ids?: { imdb_id?: string | null };
  homepage?: string | null;
}

/**
 * R21.2: TMDB detayını normalize ederek MediaItem üretiminde kullanırız.
 * OMDb normalize sonucuyla niyet eşdeğer (movie + metadata); fark sadece
 * kaynak kimliği.
 */
export interface TmdbNormalizedDetail {
  externalSource: "tmdb";
  externalId: string;
  type: "movie";
  title: string;
  originalTitle?: string;
  overview?: string;
  releaseYear?: number;
  coverUrl?: string;
  totalProgress: 1;
  runtime?: number;
  genres?: string[];
  averageScore?: number;  // 0-100 (TMDB vote_average 0-10 → ×10)
  imdbId?: string;
  siteUrl?: string;        // homepage veya TMDB sayfa linki
}
