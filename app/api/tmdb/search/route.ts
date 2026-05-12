// ============================================
// TMDB Arama API Route'u (Server-Side)
// ============================================
// R21.2: Film aramalarında birincil kaynak. Şu değişikliklerle:
//   - `search/multi` yerine `search/movie` kullanılıyor → sadece film sonuçları
//     döner. Dizi sonuçları TVmaze tarafında zaten zengin (sezon kırılımı vs.),
//     TMDB sonuçlarının TVmaze ile karışıp duplicate yaratmasını engellemek
//     için TMDB **film-only**.
//   - Token yapılandırılmamış (env eksik) durumda 503 + `{ results: [] }` döner.
//     Eskiden 500 dönüyordu; client tarafı bunu hata olarak görüp OMDb
//     fallback'ine düşemiyordu.
//   - Upstream hatalarında da `{ results: [], error: ... }` ile graceful
//     fallback davranışı korunur.
// API token asla tarayıcıya sızmaz; tüm istek server-side.

import { NextRequest, NextResponse } from "next/server";
import { TmdbRawResult, TmdbNormalizedResult } from "@/lib/tmdb-types";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

/**
 * Tek bir TMDB ham film sonucunu normalize edilmiş formata çevirir.
 * `search/movie` yalnızca film döndürdüğü için media_type alanı yoktur;
 * dönüşümü film için sabitliyoruz.
 */
function normalizeMovieResult(raw: TmdbRawResult): TmdbNormalizedResult | null {
  const title = raw.title;
  if (!title) return null;

  let releaseYear: number | undefined;
  if (raw.release_date && raw.release_date.length >= 4) {
    const parsed = parseInt(raw.release_date.substring(0, 4), 10);
    if (!isNaN(parsed)) releaseYear = parsed;
  }

  const coverUrl = raw.poster_path
    ? `${TMDB_IMAGE_BASE}${raw.poster_path}`
    : undefined;

  return {
    externalSource: "tmdb",
    externalId: String(raw.id),
    type: "movie",
    title,
    overview: raw.overview || undefined,
    releaseYear,
    coverUrl,
    totalProgress: 1,
  };
}

interface TmdbSearchMovieResponse {
  page: number;
  results: TmdbRawResult[];
  total_pages: number;
  total_results: number;
}

/**
 * GET /api/tmdb/search?q=...
 * Film araması yapar; sonuç dizisini normalize edip döner.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "Arama metni (q) gerekli." }, { status: 400 });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    // R21.2: 503 + boş results → client OMDb fallback'ine düşer; app çökmez.
    return NextResponse.json(
      { results: [], error: "TMDB yapılandırılmadı." },
      { status: 503 },
    );
  }

  try {
    const url = new URL("https://api.themoviedb.org/3/search/movie");
    url.searchParams.set("query", query.trim());
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "tr-TR");
    url.searchParams.set("page", "1");

    const tmdbResponse = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!tmdbResponse.ok) {
      const statusText = tmdbResponse.statusText || "Bilinmeyen hata";
      return NextResponse.json(
        { results: [], error: `TMDB API hatası: ${tmdbResponse.status} ${statusText}` },
        { status: 502 },
      );
    }

    const data = (await tmdbResponse.json()) as TmdbSearchMovieResponse;
    const normalized: TmdbNormalizedResult[] = (data.results || [])
      .map(normalizeMovieResult)
      .filter((item): item is TmdbNormalizedResult => item !== null);

    return NextResponse.json({ results: normalized });
  } catch (err) {
    console.error("TMDB arama hatası:", err);
    return NextResponse.json(
      { results: [], error: "TMDB'ye bağlanırken bir hata oluştu." },
      { status: 502 },
    );
  }
}
