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
} from "@/lib/tmdb-types";

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
  };
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || id.trim().length === 0) {
    return NextResponse.json({ error: "id gerekli." }, { status: 400 });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { result: null, error: "TMDB yapılandırılmadı." },
      { status: 503 },
    );
  }

  try {
    const url = new URL(`https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}`);
    url.searchParams.set("language", "tr-TR");
    url.searchParams.set("append_to_response", "external_ids");

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

    const detail = (await res.json()) as TmdbMovieDetailResponse;
    const normalized = normalizeDetail(detail);
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
