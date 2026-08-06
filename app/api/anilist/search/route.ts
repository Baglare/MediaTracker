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
import {
  buildAniListSearchFallback,
  normalizeAniListMedia,
  rankAniListSearchResults,
} from "@/lib/anilist";
import { providerRetrievalAllowlist } from "@/features/recommendations/domain/aspect-registry";

// ---- GraphQL Sorgu Metinleri ----
// `media(...)` alanı altında MEDIA_FIELDS aynı kalır; sadece dış argümanlar/sort
// dali iki mod arası değişir.
const MEDIA_FIELDS = `
  id
  type
  format
  status
  title { romaji english native }
  synonyms
  description(asHtml: false)
  startDate { year }
  coverImage { large extraLarge }
  bannerImage
  episodes
  chapters
  volumes
  genres
  tags { id name rank category isGeneralSpoiler isMediaSpoiler isAdult }
  countryOfOrigin
  averageScore
  popularity
  siteUrl
  nextAiringEpisode { episode airingAt }
`;

const SEARCH_QUERY = `
query ($search: String!, $type: MediaType, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: $type, sort: [SEARCH_MATCH, POPULARITY_DESC]) {${MEDIA_FIELDS}}
  }
}
`;

// R37.1 — Structured discover: title-search atmadan tür/tag/bölüm filtresiyle
// aday üretir. AniList "media" alanı opsiyonel argümanları (genre_in, tag_in,
// episodes_lesser, sort) destekler; hepsi opsiyonel ve birlikte AND'lenir.
const DISCOVER_QUERY = `
query (
  $type: MediaType,
  $perPage: Int,
  $genreIn: [String],
  $tagIn: [String],
  $minimumTagRank: Int,
  $episodesLesser: Int,
  $sort: [MediaSort]
) {
  Page(page: 1, perPage: $perPage) {
    media(
      type: $type,
      genre_in: $genreIn,
      tag_in: $tagIn,
      minimumTagRank: $minimumTagRank,
      episodes_lesser: $episodesLesser,
      sort: $sort,
      isAdult: false
    ) {${MEDIA_FIELDS}}
  }
}
`;

/** AniList GraphQL endpoint */
const ANILIST_URL = "https://graphql.anilist.co";

class AniListHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter?: string,
  ) {
    super(`AniList API hatası: ${status}`);
    this.name = "AniListHttpError";
  }
}

class AniListGraphqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AniListGraphqlError";
  }
}

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
    throw new AniListHttpError(
      response.status,
      response.headers.get("retry-after") ?? undefined,
    );
  }

  // GraphQL "200 OK + errors[]" durumunu da yakala — eskiden sessizce yutuluyordu.
  const json = (await response.json()) as AniListSearchResponse & {
    errors?: { message: string }[];
  };
  if (json.errors && json.errors.length > 0) {
    const msg = json.errors.map((e) => e.message).join("; ");
    throw new AniListGraphqlError(`AniList GraphQL hatası: ${msg}`);
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

// R37.1 — Discover modu için structured filter sorgusu.
// q yoksa ama genres/tags/episodesLte verilmişse bu yola gider.
async function discoverAniList(args: {
  type: "ANIME" | "MANGA" | undefined;
  perPage: number;
  genres?: string[];
  tags?: string[];
  minimumTagRank?: number;
  episodesLesser?: number;
  sort?: string[];
}): Promise<AniListRawMedia[]> {
  const variables: Record<string, unknown> = {
    perPage: args.perPage,
    sort: args.sort && args.sort.length > 0 ? args.sort : ["POPULARITY_DESC"],
  };
  if (args.type) variables.type = args.type;
  if (args.genres && args.genres.length > 0) variables.genreIn = args.genres;
  if (args.tags && args.tags.length > 0) variables.tagIn = args.tags;
  if (typeof args.minimumTagRank === "number") variables.minimumTagRank = args.minimumTagRank;
  if (typeof args.episodesLesser === "number" && args.episodesLesser > 0) {
    variables.episodesLesser = args.episodesLesser;
  }

  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "MediaTracker/1.0 (+https://github.com/local)",
    },
    body: JSON.stringify({ query: DISCOVER_QUERY, variables }),
  });

  if (!response.ok) {
    throw new AniListHttpError(
      response.status,
      response.headers.get("retry-after") ?? undefined,
    );
  }
  const json = (await response.json()) as AniListSearchResponse & {
    errors?: { message: string }[];
  };
  if (json.errors && json.errors.length > 0) {
    const msg = json.errors.map((e) => e.message).join("; ");
    throw new AniListGraphqlError(`AniList GraphQL hatası: ${msg}`);
  }
  return json.data?.Page?.media || [];
}

function parseCsv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 6);
  return parts.length > 0 ? parts : undefined;
}

const RETRIEVAL_ALLOWLIST = providerRetrievalAllowlist("anilist");
const ANILIST_DISCOVER_GENRES = new Set([...RETRIEVAL_ALLOWLIST.genres, "Thriller"]);
const ANILIST_DISCOVER_TAGS = new Set([
  ...RETRIEVAL_ALLOWLIST.tags,
  "Iyashikei",
  "Heartwarming",
  "Dark Fantasy",
]);
const ANILIST_DISCOVER_SORTS = new Set(["POPULARITY_DESC", "SCORE_DESC", "ID"]);

function parseStructuredValues(
  params: URLSearchParams,
  singular: string,
  plural: string,
): { ok: true; values?: string[] } | { ok: false } {
  const raw = [params.get(singular), params.get(plural)].filter((value): value is string => Boolean(value));
  if (raw.length === 0) return { ok: true };
  const values = raw.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0 || values.length > 6 || values.some((value) => value.length > 60)) return { ok: false };
  return { ok: true, values: [...new Set(values)] };
}

/**
 * GET /api/anilist/search?q=naruto&category=anime
 * R37.1 ek paramlar (q opsiyonel olur):
 *   &genres=Slice of Life,Comedy
 *   &tags=Iyashikei
 *   &episodesLte=13
 *   &sort=POPULARITY_DESC,SCORE_DESC
 */
export async function GET(request: NextRequest) {
  // 1) Query parametrelerini al
  const params = request.nextUrl.searchParams;
  const query = params.get("q");
  const categoryValue = params.get("category") || "all";
  if (!["anime", "manga", "manhwa", "manhua", "all"].includes(categoryValue)) {
    return NextResponse.json({ error: "Medya kategorisi geçersiz." }, { status: 400 });
  }
  const category = categoryValue as AniListCategory;

  // R37.1 — Structured discover parametreleri
  const parsedGenres = parseStructuredValues(params, "genre", "genres");
  const parsedTags = parseStructuredValues(params, "tag", "tags");
  if (!parsedGenres.ok || !parsedTags.ok) {
    return NextResponse.json({ error: "Structured filtre sınırları geçersiz." }, { status: 400 });
  }
  const genres = parsedGenres.values;
  const tags = parsedTags.values;
  if (genres?.some((genre) => !ANILIST_DISCOVER_GENRES.has(genre))) {
    return NextResponse.json({ error: "Desteklenmeyen AniList tür filtresi." }, { status: 400 });
  }
  if (tags?.some((tag) => !ANILIST_DISCOVER_TAGS.has(tag))) {
    return NextResponse.json({ error: "Desteklenmeyen AniList etiket filtresi." }, { status: 400 });
  }
  const episodesLteRaw = params.get("episodesLte");
  const episodesLesser =
    episodesLteRaw && /^\d+$/.test(episodesLteRaw) ? Math.min(parseInt(episodesLteRaw, 10), 1000) : undefined;
  const minimumTagRankRaw = params.get("minimumTagRank");
  const minimumTagRank = minimumTagRankRaw === null
    ? undefined
    : /^\d{1,3}$/.test(minimumTagRankRaw)
      ? Number(minimumTagRankRaw)
      : Number.NaN;
  if (minimumTagRank !== undefined && (!Number.isInteger(minimumTagRank) || minimumTagRank < 0 || minimumTagRank > 100 || !tags?.length)) {
    return NextResponse.json({ error: "Etiket rank filtresi geçersiz." }, { status: 400 });
  }
  const sortParam = parseCsv(params.get("sort"));
  if (sortParam?.some((sort) => !ANILIST_DISCOVER_SORTS.has(sort))) {
    return NextResponse.json({ error: "AniList sıralama filtresi geçersiz." }, { status: 400 });
  }

  const hasStructuredFilter =
    (genres && genres.length > 0) ||
    (tags && tags.length > 0) ||
    typeof episodesLesser === "number";
  const trimmedQuery = query?.trim() || "";

  if (!trimmedQuery && !hasStructuredFilter) {
    return NextResponse.json(
      { error: "Arama metni (q) veya en az bir structured filter (genres/tags/episodesLte) gerekli." },
      { status: 400 }
    );
  }

  try {
    let results: AniListRawMedia[] = [];
    let fallbackUsed = false;

    if (!trimmedQuery && hasStructuredFilter) {
      // R37.1 — Discover modu: title-search yok, sadece structured filtreler.
      const targetType: "ANIME" | "MANGA" | undefined =
        category === "anime" ? "ANIME" : category === "all" ? undefined : "MANGA";
      const perPage = category === "anime" || category === "all" ? 16 : 40;
      results = await discoverAniList({
        type: targetType,
        perPage,
        genres,
        tags,
        minimumTagRank,
        episodesLesser,
        sort: sortParam,
      });
      if (category !== "all" && category !== "anime") {
        results = filterByCountry(results, category);
      }
    } else {
      const runTextSearch = async (search: string): Promise<AniListRawMedia[]> => {
        if (category === "all") {
          const [animeResults, mangaResults] = await Promise.all([
            queryAniList(search, "ANIME", 12),
            queryAniList(search, "MANGA", 12),
          ]);
          return [...animeResults, ...mangaResults];
        }
        if (category === "anime") {
          return queryAniList(search, "ANIME", 12);
        }
        const mangaResults = await queryAniList(search, "MANGA", 40);
        return filterByCountry(mangaResults, category);
      };
      results = await runTextSearch(trimmedQuery);
      const fallbackQuery = results.length === 0
        ? buildAniListSearchFallback(trimmedQuery)
        : null;
      if (fallbackQuery && fallbackQuery !== trimmedQuery) {
        results = await runTextSearch(fallbackQuery);
        fallbackUsed = true;
      }
      results = rankAniListSearchResults(results, trimmedQuery);
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
        `[anilist:search] 0 sonuç: q="${trimmedQuery}" category="${category}" discover=${
          !trimmedQuery && hasStructuredFilter
        } — AniList bu sorgu için boş döndü.`,
      );
    }

    return NextResponse.json({
      results: normalized,
      // Client tarafında görünür empty/error state için meta. Mevcut tüketiciler
      // (sadece `results` okuyan) etkilenmez — ekstra alan göz ardı edilir.
      meta: {
        source: "anilist",
        count: normalized.length,
        query: trimmedQuery,
        category,
        mode: !trimmedQuery && hasStructuredFilter ? "discover" : "search",
        fallbackUsed,
        filters: hasStructuredFilter ? { genres, tags, minimumTagRank, episodesLesser, sort: sortParam } : undefined,
      },
    });
  } catch (err) {
    console.error("AniList arama hatası:", err);
    const status = err instanceof AniListHttpError
      ? err.status === 429 || err.status === 403
        ? err.status
        : 502
      : 502;
    const reason = err instanceof AniListHttpError
      ? err.status === 429
        ? "rate_limited"
        : err.status === 403
          ? "forbidden"
          : "upstream_error"
      : err instanceof AniListGraphqlError
        ? "graphql_error"
        : "network_error";
    return NextResponse.json(
      {
        error: "AniList'e bağlanırken bir hata oluştu.",
        meta: {
          source: "anilist",
          failed: true,
          reason,
        },
      },
      {
        status,
        headers: err instanceof AniListHttpError && err.retryAfter
          ? { "Retry-After": err.retryAfter }
          : undefined,
      }
    );
  }
}
