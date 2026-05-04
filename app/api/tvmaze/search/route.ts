// ============================================
// TVmaze Dizi Arama API Route'u
// ============================================
// GET /api/tvmaze/search?q=breaking+bad
//
// TVmaze API'sine sunucu tarafında istek atar.
// Token gerektirmez (TVmaze ücretsiz API).
// Sonuçları normalize edip JSON olarak döndürür.

import { NextRequest, NextResponse } from "next/server";
import {
  TvmazeSearchItem,
  TvmazeNormalizedResult,
} from "@/lib/tvmaze-types";

/**
 * HTML etiketlerini kaldırıp düz metin döndüren basit fonksiyon.
 * TVmaze summary alanı "<p>A show about...</p>" gibi HTML içerir.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")  // Tüm HTML taglerini kaldır
    .replace(/&amp;/g, "&")   // HTML entity'lerini çöz
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Tek bir TVmaze arama sonucunu normalize eder.
 */
function normalizeSearchResult(
  item: TvmazeSearchItem
): TvmazeNormalizedResult {
  const show = item.show;

  // Yılı premiered tarihinden çıkar: "2008-01-20" → 2008
  let releaseYear: number | undefined;
  if (show.premiered && show.premiered.length >= 4) {
    const parsed = parseInt(show.premiered.substring(0, 4), 10);
    if (!isNaN(parsed)) releaseYear = parsed;
  }

  // Poster URL'si
  const coverUrl = show.image?.medium || show.image?.original || undefined;

  // Özet: HTML'den düz metne çevir
  const overview = show.summary ? stripHtml(show.summary) : undefined;

  // Kanal adı: network veya webChannel
  const networkName =
    show.network?.name || show.webChannel?.name || undefined;

  return {
    externalSource: "tvmaze",
    externalId: String(show.id),
    type: "tv",
    title: show.name,
    overview,
    releaseYear,
    coverUrl,
    genres: show.genres || undefined,
    tvmazeStatus: show.status || undefined,
    networkName,
    language: show.language || undefined,
  };
}

/**
 * GET /api/tvmaze/search?q=breaking+bad
 */
export async function GET(request: NextRequest) {
  // 1) Arama metnini al
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Arama metni (q) gerekli." },
      { status: 400 }
    );
  }

  // 2) TVmaze API'sine istek at
  try {
    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(
      query.trim()
    )}`;

    const tvmazeResponse = await fetch(url, {
      headers: { accept: "application/json" },
    });

    if (!tvmazeResponse.ok) {
      return NextResponse.json(
        { error: `TVmaze API hatası: ${tvmazeResponse.status}` },
        { status: 502 }
      );
    }

    const data = (await tvmazeResponse.json()) as TvmazeSearchItem[];

    // 3) Sonuçları normalize et
    const normalized = data.map(normalizeSearchResult);

    return NextResponse.json({ results: normalized });
  } catch (err) {
    console.error("TVmaze arama hatası:", err);
    return NextResponse.json(
      { error: "TVmaze'e bağlanırken bir hata oluştu." },
      { status: 502 }
    );
  }
}
