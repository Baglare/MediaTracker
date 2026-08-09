// ============================================
// AniList Arama API Route'u
// ============================================
// POST /api/anilist/search { query: "naruto", category: "anime" }
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

import { NextRequest } from "next/server";
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
import { SEARCH_REQUEST_MAX_BYTES, apiError, enforceRateLimit, fetchWithTimeout, noStoreJson, parseSearchQuery, readStrictJsonObject, resolveRateLimitIdentity } from "@/lib/api/request-security";

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

  const response = await fetchWithTimeout(ANILIST_URL, {
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

  const response = await fetchWithTimeout(ANILIST_URL, {
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
  value: unknown,
): { ok: true; values?: string[] } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return { ok: false };
  const values = value.map((entry) => entry.trim()).filter(Boolean);
  if (values.length === 0 || values.length > 6 || values.some((value) => value.length > 60)) return { ok: false };
  return { ok: true, values: [...new Set(values)] };
}

/**
 * POST /api/anilist/search. `query` structured discover isteklerinde opsiyoneldir.
 */
export async function POST(request: NextRequest) {
  const parsed = await readStrictJsonObject(
    request,
    new Set(["query", "category", "genres", "tags", "episodesLte", "minimumTagRank", "sort"]),
    SEARCH_REQUEST_MAX_BYTES,
  );
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const queryResult = parseSearchQuery(body.query, false);
  if (!queryResult.ok) return apiError("search_query_invalid", 400);
  const query = queryResult.value;
  const categoryValue = body.category === undefined ? "all" : body.category;
  if (typeof categoryValue !== "string" || !["anime", "manga", "manhwa", "manhua", "all"].includes(categoryValue)) {
    return apiError("search_filter_invalid", 400);
  }
  const category = categoryValue as AniListCategory;

  // R37.1 — Structured discover parametreleri
  const parsedGenres = parseStructuredValues(body.genres);
  const parsedTags = parseStructuredValues(body.tags);
  if (!parsedGenres.ok || !parsedTags.ok) {
    return apiError("search_filter_invalid", 400);
  }
  const genres = parsedGenres.values;
  const tags = parsedTags.values;
  if (genres?.some((genre) => !ANILIST_DISCOVER_GENRES.has(genre))) {
    return apiError("search_filter_invalid", 400);
  }
  if (tags?.some((tag) => !ANILIST_DISCOVER_TAGS.has(tag))) {
    return apiError("search_filter_invalid", 400);
  }
  const episodesLesser = body.episodesLte === undefined
    ? undefined
    : typeof body.episodesLte === "number" && Number.isInteger(body.episodesLte) && body.episodesLte > 0 && body.episodesLte <= 1000
      ? body.episodesLte
      : Number.NaN;
  if (episodesLesser !== undefined && !Number.isFinite(episodesLesser)) return apiError("search_filter_invalid", 400);
  const minimumTagRank = body.minimumTagRank === undefined
    ? undefined
    : typeof body.minimumTagRank === "number"
      ? body.minimumTagRank
      : Number.NaN;
  if (minimumTagRank !== undefined && (!Number.isInteger(minimumTagRank) || minimumTagRank < 0 || minimumTagRank > 100 || !tags?.length)) {
    return apiError("search_filter_invalid", 400);
  }
  const sortParam = parseStructuredValues(body.sort);
  if (!sortParam.ok) return apiError("search_filter_invalid", 400);
  const sort = sortParam.values;
  if (sort?.some((value) => !ANILIST_DISCOVER_SORTS.has(value))) {
    return apiError("search_filter_invalid", 400);
  }

  const hasStructuredFilter =
    (genres && genres.length > 0) ||
    (tags && tags.length > 0) ||
    typeof episodesLesser === "number";
  const trimmedQuery = query;

  if (!trimmedQuery && !hasStructuredFilter) {
    return apiError("search_query_or_filter_required", 400);
  }
  const rateLimit = enforceRateLimit("search:anilist", await resolveRateLimitIdentity(request), 60, 60_000);
  if (rateLimit) return rateLimit;

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
        sort,
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
      console.warn("[anilist:search] upstream returned no results");
    }

    return noStoreJson({
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
        filters: hasStructuredFilter ? { genres, tags, minimumTagRank, episodesLesser, sort } : undefined,
      },
    });
  } catch (err) {
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
    return noStoreJson(
      {
        code: "upstream_error",
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
