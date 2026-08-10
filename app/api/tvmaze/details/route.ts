// ============================================
// TVmaze Dizi Detay API Route'u
// ============================================
// GET /api/tvmaze/details?id=169
//
// Belirli bir dizinin detay bilgilerini ve bölüm listesini çeker.
// İki paralel istek atar:
// 1) Show detayları: https://api.tvmaze.com/shows/{id}
// 2) Bölüm listesi:  https://api.tvmaze.com/shows/{id}/episodes
//
// Bölüm sayısı, sezon sayısı, son/sonraki yayın tarihi hesaplanır.

import { NextRequest, NextResponse } from "next/server";
import {
  TvmazeRawShow,
  TvmazeEpisode,
  TvmazeNormalizedDetail,
} from "@/lib/tvmaze-types";
import { providerUserAgent } from "@/lib/api/provider-identity";
import { publicProviderCapability } from "@/lib/providers/release-policy";

/**
 * HTML etiketlerini kaldırıp düz metin döndüren basit fonksiyon.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * GET /api/tvmaze/details?id=169
 */
export async function GET(request: NextRequest) {
  // 1) Show ID'sini al
  const searchParams = request.nextUrl.searchParams;
  const showId = searchParams.get("id");

  if (!showId || showId.trim().length === 0) {
    return NextResponse.json(
      { error: "Dizi ID'si (id) gerekli." },
      { status: 400 }
    );
  }
  const capability = publicProviderCapability("tvmaze");
  if (!capability.enabled) {
    return NextResponse.json(
      { code: "provider_unavailable", reason: capability.reason },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const userAgent = providerUserAgent();
    // 2) İki isteği paralel olarak at (daha hızlı!)
    const [showResponse, episodesResponse] = await Promise.all([
      fetch(`https://api.tvmaze.com/shows/${showId}`, {
        headers: { accept: "application/json", ...(userAgent ? { "User-Agent": userAgent } : {}) },
      }),
      fetch(`https://api.tvmaze.com/shows/${showId}/episodes`, {
        headers: { accept: "application/json", ...(userAgent ? { "User-Agent": userAgent } : {}) },
      }),
    ]);

    // Show verisi kontrolü
    if (!showResponse.ok) {
      return NextResponse.json(
        { error: `TVmaze show hatası: ${showResponse.status}` },
        { status: 502 }
      );
    }

    const show = (await showResponse.json()) as TvmazeRawShow;

    // Bölüm listesi (hata olsa bile boş dizi olarak devam et)
    let episodes: TvmazeEpisode[] = [];
    if (episodesResponse.ok) {
      episodes = (await episodesResponse.json()) as TvmazeEpisode[];
    }

    // 3) Bölüm verilerinden istatistikler çıkar
    const numberOfEpisodes = episodes.length;
    const totalProgress = numberOfEpisodes > 0 ? numberOfEpisodes : 1;

    // Unique sezon sayısı ve breakdown
    const seasonMap = new Map<number, number>();
    for (const ep of episodes) {
      if (ep.season != null) {
        seasonMap.set(ep.season, (seasonMap.get(ep.season) || 0) + 1);
      }
    }
    const numberOfSeasons = seasonMap.size > 0 ? seasonMap.size : undefined;
    const seasonBreakdown = Array.from(seasonMap.entries())
      .map(([season, count]) => ({ season, episodes: count }))
      .sort((a, b) => a.season - b.season);

    // Bugünün tarihi (YYYY-MM-DD formatında karşılaştırma için)
    const today = new Date().toISOString().split("T")[0];

    // Son yayınlanan bölüm: airdate'i olan ve bugüne eşit veya önceki bölümlerin sonuncusu
    let lastAirDate: string | undefined;
    let nextAirDate: string | undefined;

    for (const ep of episodes) {
      if (ep.airdate) {
        if (ep.airdate <= today) {
          // Bu bölüm yayınlanmış (veya bugün yayınlanacak)
          lastAirDate = ep.airdate;
        } else if (!nextAirDate) {
          // Bugünden sonraki ilk bölüm
          nextAirDate = ep.airdate;
        }
      }
    }

    // 4) Show verisini normalize et
    let releaseYear: number | undefined;
    if (show.premiered && show.premiered.length >= 4) {
      const parsed = parseInt(show.premiered.substring(0, 4), 10);
      if (!isNaN(parsed)) releaseYear = parsed;
    }

    const coverUrl = show.image?.medium || show.image?.original || undefined;
    const overview = show.summary ? stripHtml(show.summary) : undefined;
    const networkName =
      show.network?.name || show.webChannel?.name || undefined;

    const result: TvmazeNormalizedDetail = {
      externalSource: "tvmaze",
      externalId: String(show.id),
      type: "tv",
      title: show.name,
      overview,
      releaseYear,
      coverUrl,
      totalProgress,
      numberOfSeasons,
      numberOfEpisodes: numberOfEpisodes > 0 ? numberOfEpisodes : undefined,
      tvmazeStatus: show.status || undefined,
      lastAirDate,
      nextAirDate,
      genres: show.genres || undefined,
      networkName,
      language: show.language || undefined,
      seasonBreakdown,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("TVmaze detay hatası:", err);
    return NextResponse.json(
      { error: "TVmaze'e bağlanırken bir hata oluştu." },
      { status: 502 }
    );
  }
}
