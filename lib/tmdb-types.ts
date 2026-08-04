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
  media_type?: "movie" | "tv" | "person";

  // Film alanları
  title?: string;           // Film başlığı
  original_title?: string;
  release_date?: string;    // Çıkış tarihi "2010-07-16" formatında

  // Dizi alanları
  name?: string;            // Dizi adı
  original_name?: string;
  first_air_date?: string;  // İlk yayın tarihi

  // Ortak alanlar
  overview?: string;        // Kısa açıklama
  poster_path?: string | null;     // Poster yolu ("/abc123.jpg")
  vote_average?: number;
  popularity?: number;
  original_language?: string;
  origin_country?: string[];
}

export interface TmdbKeyword { id?: number; name: string }

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
  originalLanguage?: string;
  countries?: string[];
  popularity?: number;
  averageScore?: number;
  genres?: string[];
  keywords?: TmdbKeyword[];
  runtime?: number;
  numberOfEpisodes?: number;
  numberOfSeasons?: number;
  imdbId?: string;
  theTvdbId?: string;
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
  original_language?: string;
  production_countries?: { iso_3166_1: string }[];
  popularity?: number;
  keywords?: { keywords?: TmdbKeyword[] };
}

export interface TmdbTvDetailResponse {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  first_air_date?: string;
  poster_path?: string | null;
  number_of_episodes?: number;
  number_of_seasons?: number;
  vote_average?: number;
  popularity?: number;
  genres?: { id: number; name: string }[];
  original_language?: string;
  origin_country?: string[];
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null };
  keywords?: { results?: TmdbKeyword[] };
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
  type: "movie" | "tv";
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
  theTvdbId?: string;
  keywords?: TmdbKeyword[];
  originalLanguage?: string;
  countries?: string[];
  popularity?: number;
  numberOfEpisodes?: number;
  numberOfSeasons?: number;
  siteUrl?: string;        // homepage veya TMDB sayfa linki
}
