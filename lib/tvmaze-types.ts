// ============================================
// TVmaze API Tip Tanımları
// ============================================
// TVmaze'den dönen ham verilerin ve normalize edilmiş
// sonuçların tip tanımları.

// ---- Ham TVmaze Tipleri ----

/** TVmaze show image yapısı */
export interface TvmazeImage {
  medium?: string;
  original?: string;
}

/** TVmaze network/webchannel yapısı */
export interface TvmazeNetwork {
  id: number;
  name: string;
  country?: { name: string; code: string } | null;
}

/** TVmaze search endpoint'inden dönen ham show verisi */
export interface TvmazeRawShow {
  id: number;
  name: string;
  language?: string | null;
  genres?: string[];
  status?: string;           // "Running", "Ended", "To Be Determined" vb.
  premiered?: string | null;  // "2008-01-20" formatında
  ended?: string | null;
  image?: TvmazeImage | null;
  summary?: string | null;    // HTML içerebilir: "<p>A show about...</p>"
  network?: TvmazeNetwork | null;
  webChannel?: TvmazeNetwork | null;
}

/** TVmaze search/shows endpoint'inden dönen her bir sonuç */
export interface TvmazeSearchItem {
  score: number;
  show: TvmazeRawShow;
}

/** TVmaze episode yapısı */
export interface TvmazeEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  airdate?: string;    // "2008-01-20" formatında
  runtime?: number;
}

// ---- Normalize Edilmiş Tipler ----

/** Normalize edilmiş TVmaze arama sonucu (search listesi için) */
export interface TvmazeNormalizedResult {
  externalSource: "tvmaze";
  externalId: string;
  type: "tv";
  title: string;
  overview?: string;
  releaseYear?: number;
  coverUrl?: string;
  genres?: string[];
  tvmazeStatus?: string;
  networkName?: string;
  language?: string;
}

/** Normalize edilmiş TVmaze detay sonucu (listeye eklerken kullanılır) */
export interface TvmazeNormalizedDetail {
  externalSource: "tvmaze";
  externalId: string;
  type: "tv";
  title: string;
  overview?: string;
  releaseYear?: number;
  coverUrl?: string;
  totalProgress: number;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  tvmazeStatus?: string;
  lastAirDate?: string;
  nextAirDate?: string;
  genres?: string[];
  networkName?: string;
  language?: string;
  seasonBreakdown?: { season: number; episodes: number }[];
}
