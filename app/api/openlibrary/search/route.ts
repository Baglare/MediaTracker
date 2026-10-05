import { enforceDistributedRateLimit, reportProviderCooldown } from "@/lib/api/distributed-rate-limit";
import { runSafeApiRoute } from "@/lib/api/safe-route";
// ============================================
// Open Library Kitap Arama API Route'u
// ============================================
// POST /api/openlibrary/search { query: "mistborn" }
//
// Open Library API'sine sunucu tarafında istek atar.
// Token gerektirmez (Open Library ücretsiz API).
// Sonuçları normalize edip JSON olarak döndürür.

import { NextRequest } from "next/server";
import {
  OpenLibrarySearchResponse,
  OpenLibraryRawDoc,
  OpenLibraryNormalizedResult,
} from "@/lib/openlibrary-types";
import { SEARCH_REQUEST_MAX_BYTES, apiError, fetchWithTimeout, noStoreJson, parseSearchQuery, readStrictJsonObject } from "@/lib/api/request-security";
import { providerUserAgent } from "@/lib/api/provider-identity";
import { publicProviderCapability } from "@/lib/providers/release-policy";
import { openLibrarySourceUrl } from "@/lib/providers/openlibrary-source-url";
import { getOpenLibrarySearchCache, openLibrarySearchCacheKey, setOpenLibrarySearchCache } from "@/lib/api/openlibrary-search-cache";

function boundedStrings(value: unknown, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.slice(0, max).filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, 256).replace(/<[^>]*>/g, "").trim()).filter(Boolean);
  return strings.length ? strings : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * Tek bir Open Library doc'unu normalize eder.
 */
export function normalizeDoc(doc: OpenLibraryRawDoc): OpenLibraryNormalizedResult {
  // Kapak URL'si oluştur: cover_i değeri varsa resim URL'si yap
  // ?default=false → kapak yoksa 404 döndürür (kırık resim yerine)
  const coverUrl = Number.isSafeInteger(doc.cover_i) && doc.cover_i! > 0
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg?default=false`
    : undefined;

  // Sayfa sayısı: number_of_pages_median varsa kullan, yoksa 1 fallback
  const pageCount = positiveInteger(doc.number_of_pages_median);
  const totalProgress = pageCount || 1;

  // Konular: çok kalabalık olmasın diye en fazla 5 tane al
  const subjects = boundedStrings(doc.subject, 5);

  // ISBN'ler: çok kalabalık olmasın diye en fazla 3 tane al
  const isbn = boundedStrings(doc.isbn, 3);
  const editionId = Array.isArray(doc.edition_key) && typeof doc.edition_key[0] === "string"
    && openLibrarySourceUrl({ externalSource: "openlibrary", externalId: `/books/${doc.edition_key[0]}` })
    ? `/books/${doc.edition_key[0]}` : undefined;

  return {
    externalSource: "openlibrary",
    externalId: doc.key,
    type: "book",
    title: doc.title.slice(0, 512).replace(/<[^>]*>/g, "").trim(),
    authors: boundedStrings(doc.author_name, 12),
    releaseYear: positiveInteger(doc.first_publish_year),
    coverUrl,
    totalProgress,
    pageCount,
    editionCount: positiveInteger(doc.edition_count),
    languages: boundedStrings(doc.language, 12),
    subjects,
    isbn,
    workId: doc.key,
    editionId,
    siteUrl: openLibrarySourceUrl({ externalSource: "openlibrary", externalId: doc.key }),
  };
}

/**
 * POST /api/openlibrary/search { query: "mistborn" }
 */
export async function POST(request: NextRequest) {
  return runSafeApiRoute("/api/openlibrary/search", "POST", async () => {
  const parsed = await readStrictJsonObject(request, new Set(["query"]), SEARCH_REQUEST_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const query = parseSearchQuery(parsed.value.query);
  if (!query.ok) return apiError("search_query_invalid", 400);
  const capability = publicProviderCapability("openlibrary");
  if (!capability.enabled) return noStoreJson({ results: [], code: "provider_unavailable", reason: capability.reason }, { status: 503 });
  const userAgent = providerUserAgent();
  if (!userAgent) return apiError("provider_unavailable", 503);
  // 02D admission atomically couples application quota, provider debit and shared
  // cooldown. Keep it authoritative even on cache hits; no separate SQL policy.
  const rateLimit = await enforceDistributedRateLimit(request, "openlibrary_search");
  if (rateLimit) return rateLimit;
  const cacheKey = openLibrarySearchCacheKey(query.value);
  const cached = getOpenLibrarySearchCache(cacheKey);
  if (cached) return noStoreJson(cached);

  // 2) Open Library API'sine istek at
  try {
    const params = new URLSearchParams({
      q: query.value,
      limit: "12",
      fields:
        "key,title,author_name,first_publish_year,cover_i,edition_count,edition_key,isbn,language,number_of_pages_median,subject",
    });

    const url = `https://openlibrary.org/search.json?${params.toString()}`;

    const olResponse = await fetchWithTimeout(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": userAgent,
      },
    });

    const cooldown = await reportProviderCooldown(request, "openlibrary_search", olResponse);
    if (cooldown) return cooldown;
    if (!olResponse.ok) {
      return noStoreJson({ code: "upstream_error" }, { status: 502 });
    }

    const data = (await olResponse.json()) as OpenLibrarySearchResponse;

    // 3) Sonuçları normalize et
    if (!Array.isArray(data.docs) || !Number.isSafeInteger(data.numFound) || data.numFound < 0) {
      return apiError("upstream_error", 502);
    }
    const results = data.docs.slice(0, 12)
      .filter((doc) => doc && typeof doc.title === "string" && doc.title.trim()
        && openLibrarySourceUrl({ externalSource: "openlibrary", externalId: doc.key }))
      .map(normalizeDoc);
    const payload = {
      results,
      totalFound: data.numFound,
    };
    setOpenLibrarySearchCache(cacheKey, payload);
    return noStoreJson(payload);
  } catch {
    return noStoreJson({ code: "upstream_error" }, { status: 502 });
  }

  });
}
