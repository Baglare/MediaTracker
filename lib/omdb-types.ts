// ============================================
// OMDb API Tip Tanımları
// ============================================

export interface OmdbSearchItem {
  Title: string;
  Year: string;
  imdbID: string;
  Type: "movie";
  Poster: string;
}

export interface OmdbSearchResponse {
  Search?: OmdbSearchItem[];
  totalResults?: string;
  Response: "True" | "False";
  Error?: string;
}

export interface OmdbDetailResponse {
  Title?: string;
  Year?: string;
  imdbID?: string;
  Type?: "movie";
  Poster?: string;
  Plot?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Actors?: string;
  imdbRating?: string;
  Response: "True" | "False";
  Error?: string;
}

export interface OmdbNormalizedResult {
  externalSource: "omdb";
  externalId: string;
  type: "movie";
  title: string;
  overview?: string;
  releaseYear?: number;
  coverUrl?: string;
  totalProgress: number;
  runtime?: number;
  genres?: string[];
  director?: string;
  actors?: string[];
  imdbRating?: number;
  imdbUrl?: string;
}
