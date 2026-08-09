// ============================================
// TVmaze Dizi Arama API Route'u
// ============================================
// POST /api/tvmaze/search { query: "breaking bad" }
//
// TVmaze API'sine sunucu tarafında istek atar.
// Token gerektirmez (TVmaze ücretsiz API).
// Sonuçları normalize edip JSON olarak döndürür.

import { NextRequest } from "next/server";
import {
  TvmazeSearchItem,
  TvmazeNormalizedResult,
} from "@/lib/tvmaze-types";
import { SEARCH_REQUEST_MAX_BYTES, apiError, enforceRateLimit, fetchWithTimeout, noStoreJson, parseSearchQuery, readStrictJsonObject, resolveRateLimitIdentity } from "@/lib/api/request-security";

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
export function normalizeSearchResult(
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
    showType: show.type || undefined,
    networkCountryCode: show.network?.country?.code || undefined,
    webChannelCountryCode: show.webChannel?.country?.code || undefined,
    imdbId: show.externals?.imdb || undefined,
    theTvdbId: typeof show.externals?.thetvdb === "number" ? String(show.externals.thetvdb) : undefined,
    premiered: show.premiered || undefined,
    ended: show.ended || undefined,
  };
}

/**
 * POST /api/tvmaze/search { query }
 */
export async function POST(request: NextRequest) {
  const parsed = await readStrictJsonObject(request, new Set(["query"]), SEARCH_REQUEST_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const query = parseSearchQuery(parsed.value.query);
  if (!query.ok) return apiError("search_query_invalid", 400);
  const rateLimit = enforceRateLimit("search:tvmaze", await resolveRateLimitIdentity(request), 60, 60_000);
  if (rateLimit) return rateLimit;

  // 2) TVmaze API'sine istek at
  try {
    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query.value)}`;

    const tvmazeResponse = await fetchWithTimeout(url, {
      headers: { accept: "application/json" },
    });

    if (!tvmazeResponse.ok) {
      return noStoreJson({ code: "upstream_error" }, { status: 502 });
    }

    const data = (await tvmazeResponse.json()) as TvmazeSearchItem[];

    // 3) Sonuçları normalize et
    const normalized = data.map(normalizeSearchResult);

    return noStoreJson({ results: normalized });
  } catch {
    return noStoreJson({ code: "upstream_error" }, { status: 502 });
  }
}
