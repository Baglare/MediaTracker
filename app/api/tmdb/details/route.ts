// ============================================
// TMDB Detay API Route'u (Server-Side) — R21.2
// ============================================
// Global Search'ten "Ekle" akışında çağrılır. `/movie/{id}` + external_ids
// append'i ile runtime, genres, IMDb id ve homepage'i alır; normalize edip
// frontend'e döner. Token yapılandırılmamışsa 503 + null sonuç döner →
// `handleAddFromGlobalSearch` hatayı sessizce yakalayıp kullanıcıya uyarı
// gösterebilir.

import { NextRequest, NextResponse } from "next/server";
import type {
  TmdbMovieDetailResponse,
  TmdbNormalizedDetail,
  TmdbTvDetailResponse,
} from "@/lib/tmdb-types";
import { publicProviderCapability } from "@/lib/providers/release-policy";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

function normalizeDetail(detail: TmdbMovieDetailResponse): TmdbNormalizedDetail | null {
  if (!detail.id || !detail.title) return null;

  let releaseYear: number | undefined;
  if (detail.release_date && detail.release_date.length >= 4) {
    const parsed = parseInt(detail.release_date.substring(0, 4), 10);
    if (!isNaN(parsed)) releaseYear = parsed;
  }

  const imdbId = detail.external_ids?.imdb_id || undefined;
  const homepage = detail.homepage && detail.homepage.length > 0 ? detail.homepage : undefined;
  const siteUrl =
    homepage ??
    (imdbId
      ? `https://www.imdb.com/title/${imdbId}/`
      : `https://www.themoviedb.org/movie/${detail.id}`);

  return {
    externalSource: "tmdb",
    externalId: String(detail.id),
    type: "movie",
    title: detail.title,
    originalTitle:
      detail.original_title && detail.original_title !== detail.title
        ? detail.original_title
        : undefined,
    overview: detail.overview && detail.overview.length > 0 ? detail.overview : undefined,
    releaseYear,
    coverUrl: detail.poster_path ? `${TMDB_IMAGE_BASE}${detail.poster_path}` : undefined,
    totalProgress: 1,
    runtime:
      typeof detail.runtime === "number" && detail.runtime > 0 ? detail.runtime : undefined,
    genres:
      detail.genres && detail.genres.length > 0
        ? detail.genres.map((g) => g.name).filter(Boolean)
        : undefined,
    averageScore:
      typeof detail.vote_average === "number" && detail.vote_average > 0
        ? Math.round(detail.vote_average * 10)
        : undefined,
    imdbId,
    siteUrl,
    originalLanguage: detail.original_language,
    countries: detail.production_countries?.map((country) => country.iso_3166_1).filter(Boolean),
    popularity: detail.popularity,
    keywords: detail.keywords?.keywords,
  };
}

function normalizeTvDetail(detail: TmdbTvDetailResponse): TmdbNormalizedDetail | null {
  if (!detail.id || !detail.name) return null;
  const releaseYear = detail.first_air_date?.length && detail.first_air_date.length >= 4
    ? Number.parseInt(detail.first_air_date.slice(0, 4), 10) : undefined;
  const imdbId = detail.external_ids?.imdb_id || undefined;
  return {
    externalSource: "tmdb", externalId: String(detail.id), type: "tv", title: detail.name,
    originalTitle: detail.original_name && detail.original_name !== detail.name ? detail.original_name : undefined,
    overview: detail.overview || undefined,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : undefined,
    coverUrl: detail.poster_path ? `${TMDB_IMAGE_BASE}${detail.poster_path}` : undefined,
    totalProgress: 1,
    genres: detail.genres?.map((genre) => genre.name).filter(Boolean),
    averageScore: typeof detail.vote_average === "number" ? Math.round(detail.vote_average * 10) : undefined,
    imdbId, theTvdbId: detail.external_ids?.tvdb_id ? String(detail.external_ids.tvdb_id) : undefined,
    keywords: detail.keywords?.results, originalLanguage: detail.original_language,
    countries: detail.origin_country, popularity: detail.popularity,
    numberOfEpisodes: detail.number_of_episodes, numberOfSeasons: detail.number_of_seasons,
    siteUrl: detail.homepage || (imdbId ? `https://www.imdb.com/title/${imdbId}/` : `https://www.themoviedb.org/tv/${detail.id}`),
  };
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const requestedMediaType = request.nextUrl.searchParams.get("mediaType") === "tv" ? "tv" : "movie";
  if (!id || id.trim().length === 0) {
    return NextResponse.json({ error: "id gerekli." }, { status: 400 });
  }
  const capability = publicProviderCapability("tmdb");
  if (!capability.enabled) return NextResponse.json({ result: null, code: "provider_unavailable", reason: capability.reason }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { result: null, error: "TMDB yapılandırılmadı." },
      { status: 503 },
    );
  }

  try {
    const url = new URL(`https://api.themoviedb.org/3/${requestedMediaType}/${encodeURIComponent(id)}`);
    url.searchParams.set("language", "tr-TR");
    url.searchParams.set("append_to_response", "external_ids,keywords");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { result: null, error: `TMDB API hatası: ${res.status}` },
        { status: 502 },
      );
    }

    const detail = (await res.json()) as TmdbMovieDetailResponse | TmdbTvDetailResponse;
    const normalized = requestedMediaType === "tv"
      ? normalizeTvDetail(detail as TmdbTvDetailResponse)
      : normalizeDetail(detail as TmdbMovieDetailResponse);
    if (!normalized) {
      return NextResponse.json(
        { result: null, error: "TMDB detayı geçersiz." },
        { status: 502 },
      );
    }
    return NextResponse.json({ result: normalized });
  } catch (err) {
    console.error("TMDB detay hatası:", err);
    return NextResponse.json(
      { result: null, error: "TMDB'ye bağlanırken bir hata oluştu." },
      { status: 502 },
    );
  }
}
