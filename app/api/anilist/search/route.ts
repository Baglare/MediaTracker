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
    media(search: $search, type: $type, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
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
      // Bazı backend'ler default Node fetch UA'sını reddediyor.
      // AniList için zorunlu değil ama defansif olarak set ediyoruz.
      "User-Agent": "MediaTracker/1.0 (+https://github.com/local)",
    },
    body: JSON.stringify({ query: SEARCH_QUERY, variables }),
  });

  if (!response.ok) {
    throw new Error(`AniList API hatası: ${response.status}`);
  }

  // GraphQL "200 OK + errors[]" durumunu da yakala — eskiden sessizce yutuluyordu.
  const json = (await response.json()) as AniListSearchResponse & {
    errors?: { message: string }[];
  };
  if (json.errors && json.errors.length > 0) {
    const msg = json.errors.map((e) => e.message).join("; ");
    throw new Error(`AniList GraphQL hatası: ${msg}`);
  }
  return json.data?.Page?.media || [];
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
      // Daha fazla çekip server-side filtrele (40, çünkü country filtresi sonrası
      // ana eserin top 12'ye girebilmesi gerekiyor — Attack on Titan / Oshi no Ko gibi
      // popüler başlıkların türetilmiş işleri tarafından bastırılmasını önler).
      results = await queryAniList(query.trim(), "MANGA", 40);
      results = filterByCountry(results, category);
    }

    // Normalize et ve en fazla 12 sonuç döndür
    const normalized = results
      .slice(0, 12)
      .map(normalizeAniListMedia);

    // Sessiz "0 sonuç" durumu — yukarı katmana görünür kalsın diye dev console'a yaz.
    // Üst-akım AniList outage'larında veya search index degradasyonunda burada
    // q="frieren" gibi sorgular için bile 0 dönebiliyor (deneylerle gözlendi).
    if (normalized.length === 0) {
      console.warn(
        `[anilist:search] 0 sonuç: q="${query.trim()}" category="${category}" — AniList search alanı bu sorgu için boş döndü.`,
      );
    }

    return NextResponse.json({
      results: normalized,
      // Client tarafında görünür empty/error state için meta. Mevcut tüketiciler
      // (sadece `results` okuyan) etkilenmez — ekstra alan göz ardı edilir.
      meta: { source: "anilist", count: normalized.length, query: query.trim(), category },
    });
  } catch (err) {
    console.error("AniList arama hatası:", err);
    return NextResponse.json(
      {
        error: "AniList'e bağlanırken bir hata oluştu.",
        meta: {
          source: "anilist",
          failed: true,
          reason: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 502 }
    );
  }
}
