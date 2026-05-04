// ============================================
// TMDB Arama API Route'u (Server-Side)
// ============================================
// Bu dosya Next.js App Router API route'udur.
// Kullanıcının arama metnini alır, TMDB API'sine sunucu tarafında
// istek atar ve sonuçları normalize edip döndürür.
// API token asla tarayıcıya sızmaz.

import { NextRequest, NextResponse } from "next/server";
import {
  TmdbSearchResponse,
  TmdbRawResult,
  TmdbNormalizedResult,
} from "@/lib/tmdb-types";

// TMDB poster URL'lerinin temel adresi
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

/**
 * Tek bir TMDB ham sonucunu normalize edilmiş formata çevirir.
 */
function normalizeResult(raw: TmdbRawResult): TmdbNormalizedResult | null {
  // Sadece movie ve tv sonuçlarını kabul ediyoruz
  if (raw.media_type !== "movie" && raw.media_type !== "tv") {
    return null;
  }

  // Film ve dizi farklı alan isimleri kullanıyor
  const isMovie = raw.media_type === "movie";
  const title = isMovie ? raw.title : raw.name;
  const dateStr = isMovie ? raw.release_date : raw.first_air_date;

  // Başlık yoksa bu sonucu atla
  if (!title) return null;

  // Yılı tarihten çıkar: "2010-07-16" → 2010
  let releaseYear: number | undefined;
  if (dateStr && dateStr.length >= 4) {
    const parsed = parseInt(dateStr.substring(0, 4), 10);
    if (!isNaN(parsed)) releaseYear = parsed;
  }

  // Poster URL'sini oluştur
  const coverUrl = raw.poster_path
    ? `${TMDB_IMAGE_BASE}${raw.poster_path}`
    : undefined;

  return {
    externalSource: "tmdb",
    externalId: String(raw.id),
    type: raw.media_type,
    title,
    overview: raw.overview || undefined,
    releaseYear,
    coverUrl,
    // Film için 1 (tek seferde izlenir), dizi için 1 (ileride detail ile güncellenecek)
    totalProgress: 1,
  };
}

/**
 * GET /api/tmdb/search?q=breaking+bad
 *
 * Arama metnini alır, TMDB'ye server-side istek atar,
 * sonuçları normalize edip JSON olarak döndürür.
 */
export async function GET(request: NextRequest) {
  // 1) Arama metnini al
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  // Boş arama kontrolü
  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Arama metni (q) gerekli." },
      { status: 400 }
    );
  }

  // 2) API token kontrolü
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "TMDB API token yapılandırılmamış. .env.local dosyasında TMDB_READ_ACCESS_TOKEN tanımlayın.",
      },
      { status: 500 }
    );
  }

  // 3) TMDB API'sine istek at
  try {
    const url = new URL("https://api.themoviedb.org/3/search/multi");
    url.searchParams.set("query", query.trim());
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "tr-TR");
    url.searchParams.set("page", "1");

    const tmdbResponse = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
      },
    });

    // TMDB hatası kontrolü
    if (!tmdbResponse.ok) {
      const statusText = tmdbResponse.statusText || "Bilinmeyen hata";
      return NextResponse.json(
        { error: `TMDB API hatası: ${tmdbResponse.status} ${statusText}` },
        { status: 502 }
      );
    }

    const data = (await tmdbResponse.json()) as TmdbSearchResponse;

    // 4) Sonuçları normalize et (person sonuçlarını filtrele)
    const normalized: TmdbNormalizedResult[] = data.results
      .map(normalizeResult)
      .filter((item): item is TmdbNormalizedResult => item !== null);

    return NextResponse.json({ results: normalized });
  } catch (err) {
    console.error("TMDB arama hatası:", err);
    return NextResponse.json(
      { error: "TMDB'ye bağlanırken bir hata oluştu." },
      { status: 502 }
    );
  }
}
