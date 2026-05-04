// ============================================
// AniList API Tip Tanımları
// ============================================
// AniList GraphQL API'den dönen ham verilerin ve normalize edilmiş
// sonuçların tip tanımları.

// ---- Ham AniList Tipleri ----

/** AniList media title alanları */
export interface AniListRawTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

/** AniList start date */
export interface AniListRawDate {
  year?: number;
}

/** AniList cover image */
export interface AniListRawCoverImage {
  large?: string;
  extraLarge?: string;
}

/** AniList nextAiringEpisode */
export interface AniListRawNextAiring {
  episode?: number;
  airingAt?: number;
}

/** AniList media (GraphQL sorgudan dönen tek bir medya) */
export interface AniListRawMedia {
  id: number;
  type: "ANIME" | "MANGA";
  format?: string;          // TV, OVA, MOVIE, SPECIAL, ONA, MUSIC, MANGA, ONE_SHOT, NOVEL
  status?: string;          // FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED, HIATUS
  title: AniListRawTitle;
  description?: string;     // Kısa açıklama (HTML olabilir)
  startDate?: AniListRawDate;
  coverImage?: AniListRawCoverImage;
  bannerImage?: string;
  episodes?: number;        // Anime bölüm sayısı
  chapters?: number;        // Manga chapter sayısı
  volumes?: number;         // Manga cilt sayısı
  genres?: string[];
  countryOfOrigin?: string; // JP, KR, CN, TW vb.
  averageScore?: number;    // 0-100 arası puan
  popularity?: number;
  siteUrl?: string;
  nextAiringEpisode?: AniListRawNextAiring;
}

/** AniList Page yapısı */
export interface AniListPage {
  media: AniListRawMedia[];
}

/** AniList GraphQL response */
export interface AniListSearchResponse {
  data: {
    Page: AniListPage;
  };
}

/** AniList tek media response (detail) */
export interface AniListDetailResponse {
  data: {
    Media: AniListRawMedia;
  };
}

// ---- Normalize Edilmiş Tip ----

/** Normalize edilmiş AniList arama / detay sonucu */
export interface AniListNormalizedResult {
  externalSource: "anilist";
  externalId: string;
  type: "anime" | "manga" | "manhwa" | "manhua";
  title: string;
  originalTitle?: string;      // Romaji
  nativeTitle?: string;        // Native (Kanji/Hangul/vb.)
  overview?: string;           // Açıklama
  releaseYear?: number;
  coverUrl?: string;           // Kapak URL'si
  backdropUrl?: string;        // Banner / arka plan
  totalProgress: number;       // Bölüm veya chapter sayısı
  episodes?: number;           // Anime bölüm sayısı
  chapters?: number;           // Manga chapter sayısı
  volumes?: number;            // Manga cilt sayısı
  genres?: string[];
  countryOfOrigin?: string;    // JP, KR, CN, TW
  anilistStatus?: string;      // FINISHED, RELEASING vb.
  format?: string;             // TV, OVA, MANGA, ONE_SHOT vb.
  averageScore?: number;
  popularity?: number;
  siteUrl?: string;
  nextAiringEpisode?: {
    episode?: number;
    airingAt?: number;
  };
}

// ---- Kategori tipi ----
export type AniListCategory = "anime" | "manga" | "manhwa" | "manhua" | "all";
