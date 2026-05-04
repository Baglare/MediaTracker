// ============================================
// AniList Arama API Route'u
// ============================================
// GET /api/anilist/search?q=naruto&category=anime
//
// AniList GraphQL API'sine sunucu tarafında istek atar.
// Token gerektirmez (AniList public API).
// Sonuçları normalize edip JSON olarak döndürür.
//
// category: "anime" | "manga" | "manhwa" | "manhua" | "all"
//   - anime → AniList type ANIME
//   - manga → AniList type MANGA, countryOfOrigin JP/diğer
//   - manhwa → AniList type MANGA, countryOfOrigin KR
//   - manhua → AniList type MANGA, countryOfOrigin CN veya TW
//   - all → ANIME + MANGA birlikte

import { NextRequest, NextResponse } from "next/server";
import {
  AniListRawMedia,
  AniListSearchResponse,
  AniListCategory,
} from "@/lib/anilist-types";
import { normalizeAniListMedia } from "@/lib/anilist";

// ---- GraphQL Sorgu Metni ----
const SEARCH_QUERY = `
query ($search: String!, $type: MediaType, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: $type, sort: SEARCH_MATCH) {
      id
      type
      format
      status
      title {
        romaji
        english
        native
      }
      description(asHtml: false)
      startDate {
        year
      }
      coverImage {
        large
        extraLarge
      }
      bannerImage
      episodes
      chapters
      volumes
      genres
      countryOfOrigin
      averageScore
      popularity
      siteUrl
      nextAiringEpisode {
        episode
        airingAt
      }
    }
  }
}
`;

/** AniList GraphQL endpoint */
const ANILIST_URL = "https://graphql.anilist.co";

/**
 * AniList'e tek bir GraphQL sorgusu atar.
 */
async function queryAniList(
  search: string,
  type: "ANIME" | "MANGA" | undefined,
  perPage: number
): Promise<AniListRawMedia[]> {
  const variables: Record<string, unknown> = {
    search,
    perPage,
  };
  if (type) {
    variables.type = type;
  }

  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: SEARCH_QUERY, variables }),
  });

  if (!response.ok) {
    throw new Error(`AniList API hatası: ${response.status}`);
  }

  const json = (await response.json()) as AniListSearchResponse;
  return json.data.Page.media || [];
}

/**
 * countryOfOrigin'e göre server-side filtreleme yapar.
 */
function filterByCountry(
  media: AniListRawMedia[],
  category: AniListCategory
): AniListRawMedia[] {
  switch (category) {
    case "manga":
      // JP veya bilinmeyen (null/undefined) → manga
      return media.filter((m) => {
        const c = m.countryOfOrigin?.toUpperCase();
        return !c || c === "JP";
      });
    case "manhwa":
      // Sadece KR
      return media.filter(
        (m) => m.countryOfOrigin?.toUpperCase() === "KR"
      );
    case "manhua":
      // CN veya TW
      return media.filter((m) => {
        const c = m.countryOfOrigin?.toUpperCase();
        return c === "CN" || c === "TW";
      });
    default:
      return media;
  }
}

/**
 * GET /api/anilist/search?q=naruto&category=anime
 */
export async function GET(request: NextRequest) {
  // 1) Query parametrelerini al
  const params = request.nextUrl.searchParams;
  const query = params.get("q");
  const category = (params.get("category") || "all") as AniListCategory;

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Arama metni (q) gerekli." },
      { status: 400 }
    );
  }

  try {
    let results: AniListRawMedia[] = [];

    if (category === "all") {
      // "all" → Hem ANIME hem MANGA sonuçlarını çek (paralel)
      const [animeResults, mangaResults] = await Promise.all([
        queryAniList(query.trim(), "ANIME", 12),
        queryAniList(query.trim(), "MANGA", 12),
      ]);
      // Anime sonuçlarını önce, manga sonuçlarını sonra koy
      results = [...animeResults, ...mangaResults];
    } else if (category === "anime") {
      results = await queryAniList(query.trim(), "ANIME", 12);
    } else {
      // manga, manhwa, manhua → Hepsi AniList'te MANGA türü
      // Daha fazla çekip server-side filtrele
      results = await queryAniList(query.trim(), "MANGA", 25);
      results = filterByCountry(results, category);
    }

    // Normalize et ve en fazla 12 sonuç döndür
    const normalized = results
      .slice(0, 12)
      .map(normalizeAniListMedia);

    return NextResponse.json({ results: normalized });
  } catch (err) {
    console.error("AniList arama hatası:", err);
    return NextResponse.json(
      { error: "AniList'e bağlanırken bir hata oluştu." },
      { status: 502 }
    );
  }
}
