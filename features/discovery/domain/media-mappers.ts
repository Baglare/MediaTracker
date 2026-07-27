import type { AniListNormalizedResult } from "@/lib/anilist-types";
import type { OmdbNormalizedResult } from "@/lib/omdb-types";
import type { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { getTvmazeSeasonExternalId } from "@/lib/series-group";
import type { TmdbNormalizedDetail } from "@/lib/tmdb-types";
import type { MediaItem } from "@/lib/types";
import type { TvmazeNormalizedDetail } from "@/lib/tvmaze-types";
import { ensureMediaIdentity } from "@/lib/media-identity";

function withIdentity<T extends MediaItem>(item: T): T {
  return ensureMediaIdentity(item).item as T;
}

export function mapTvmazeDetail(detail: TvmazeNormalizedDetail): {
  singleItem: MediaItem;
  seasonItems: MediaItem[] | null;
} {
  const shared = {
    type: "tv" as const,
    status: "planning" as const,
    coverImage: detail.coverUrl || "/placeholders/tv.svg",
    currentProgress: 0,
    externalSource: "tvmaze" as const,
    overview: detail.overview,
    releaseYear: detail.releaseYear,
    numberOfSeasons: detail.numberOfSeasons,
    numberOfEpisodes: detail.numberOfEpisodes,
    tvmazeStatus: detail.tvmazeStatus,
    lastAirDate: detail.lastAirDate,
    nextAirDate: detail.nextAirDate,
    genres: detail.genres,
    language: detail.language,
    seasonBreakdown: detail.seasonBreakdown,
    seriesGroupId: `tvmaze:${detail.externalId}`,
    seriesGroupTitle: detail.title,
  };
  const singleItem: MediaItem = withIdentity({
    ...shared,
    id: `tvmaze-${detail.externalId}`,
    title: detail.title,
    totalProgress: detail.totalProgress,
    externalId: detail.externalId,
    seriesRelationType: "main",
    orderIndex: 1,
  });
  const seasons = (detail.seasonBreakdown ?? []).filter((entry) => entry.episodes > 0);
  if (seasons.length <= 1) return { singleItem, seasonItems: null };
  return {
    singleItem,
    seasonItems: seasons.map((entry) => withIdentity({
      ...shared,
      id: `tvmaze-${detail.externalId}-season-${entry.season}`,
      title: `${detail.title} - Sezon ${entry.season}`,
      totalProgress: entry.episodes,
      externalId: getTvmazeSeasonExternalId(detail.externalId, entry.season),
      numberOfEpisodes: entry.episodes,
      seriesRelationType: "season",
      seasonNumber: entry.season,
      orderIndex: entry.season,
    })),
  };
}

export function mapOpenLibraryResult(result: OpenLibraryNormalizedResult): MediaItem {
  return withIdentity({
    id: `ol-${result.externalId}`,
    title: result.title,
    type: "book",
    status: "planning",
    coverImage: result.coverUrl || "/placeholders/book.svg",
    currentProgress: 0,
    totalProgress: result.totalProgress,
    externalSource: "openlibrary",
    externalId: result.externalId,
    releaseYear: result.releaseYear,
    authors: result.authors,
    pageCount: result.pageCount,
    editionCount: result.editionCount,
    languages: result.languages,
    subjects: result.subjects,
    isbn: result.isbn,
  });
}

export function mapAniListResult(result: AniListNormalizedResult): MediaItem {
  return withIdentity({
    id: `anilist-${result.externalId}`,
    title: result.title,
    type: result.type,
    status: "planning",
    coverImage: result.coverUrl || `/placeholders/${result.type}.svg`,
    currentProgress: 0,
    totalProgress: result.totalProgress,
    externalSource: "anilist",
    externalId: result.externalId,
    overview: result.overview,
    releaseYear: result.releaseYear,
    nativeTitle: result.nativeTitle,
    episodes: result.episodes,
    chapters: result.chapters,
    volumes: result.volumes,
    genres: result.genres,
    countryOfOrigin: result.countryOfOrigin,
    anilistStatus: result.anilistStatus,
    format: result.format,
    averageScore: result.averageScore,
    popularity: result.popularity,
    siteUrl: result.siteUrl,
    nextAiringEpisode: result.nextAiringEpisode,
    anilistRelations: result.relations,
  });
}

export function mapOmdbResult(result: OmdbNormalizedResult): MediaItem {
  return withIdentity({
    id: `omdb-${result.externalId}`,
    title: result.title,
    type: "movie",
    status: "planning",
    coverImage: result.coverUrl || "/placeholders/movie.svg",
    currentProgress: 0,
    totalProgress: 1,
    externalSource: "omdb",
    externalId: result.externalId,
    overview: result.overview,
    releaseYear: result.releaseYear,
    runtime: result.runtime,
    genres: result.genres,
    averageScore: result.imdbRating,
    siteUrl: result.imdbUrl,
  });
}

export function mapTmdbResult(result: TmdbNormalizedDetail): MediaItem {
  return withIdentity({
    id: `tmdb-${result.externalId}`,
    title: result.title,
    type: "movie",
    status: "planning",
    coverImage: result.coverUrl || "/placeholders/movie.svg",
    currentProgress: 0,
    totalProgress: 1,
    externalSource: "tmdb",
    externalId: result.externalId,
    imdbId: result.imdbId,
    originalTitle: result.originalTitle,
    overview: result.overview,
    releaseYear: result.releaseYear,
    runtime: result.runtime,
    genres: result.genres,
    averageScore: result.averageScore,
    siteUrl: result.siteUrl,
  });
}
