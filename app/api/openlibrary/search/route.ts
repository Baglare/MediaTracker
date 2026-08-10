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
import { SEARCH_REQUEST_MAX_BYTES, apiError, enforceRateLimit, fetchWithTimeout, noStoreJson, parseSearchQuery, readStrictJsonObject, resolveRateLimitIdentity } from "@/lib/api/request-security";
import { providerUserAgent } from "@/lib/api/provider-identity";
import { publicProviderCapability } from "@/lib/providers/release-policy";

/**
 * Tek bir Open Library doc'unu normalize eder.
 */
export function normalizeDoc(doc: OpenLibraryRawDoc): OpenLibraryNormalizedResult {
  // Kapak URL'si oluştur: cover_i değeri varsa resim URL'si yap
  // ?default=false → kapak yoksa 404 döndürür (kırık resim yerine)
  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg?default=false`
    : undefined;

  // Sayfa sayısı: number_of_pages_median varsa kullan, yoksa 1 fallback
  const pageCount = doc.number_of_pages_median || undefined;
  const totalProgress = pageCount || 1;

  // Konular: çok kalabalık olmasın diye en fazla 5 tane al
  const subjects = doc.subject
    ? doc.subject.slice(0, 5)
    : undefined;

  // ISBN'ler: çok kalabalık olmasın diye en fazla 3 tane al
  const isbn = doc.isbn
    ? doc.isbn.slice(0, 3)
    : undefined;

  return {
    externalSource: "openlibrary",
    externalId: doc.key,
    type: "book",
    title: doc.title,
    authors: doc.author_name || undefined,
    releaseYear: doc.first_publish_year || undefined,
    coverUrl,
    totalProgress,
    pageCount,
    editionCount: doc.edition_count || undefined,
    languages: doc.language || undefined,
    subjects,
    isbn,
    workId: doc.key,
    editionId: doc.edition_key?.[0] ? `/books/${doc.edition_key[0]}` : undefined,
    siteUrl: `https://openlibrary.org${doc.key.startsWith("/") ? doc.key : `/${doc.key}`}`,
  };
}

/**
 * POST /api/openlibrary/search { query: "mistborn" }
 */
export async function POST(request: NextRequest) {
  const parsed = await readStrictJsonObject(request, new Set(["query"]), SEARCH_REQUEST_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const query = parseSearchQuery(parsed.value.query);
  if (!query.ok) return apiError("search_query_invalid", 400);
  const rateLimit = enforceRateLimit("search:openlibrary", await resolveRateLimitIdentity(request), 60, 60_000);
  if (rateLimit) return rateLimit;
  const capability = publicProviderCapability("openlibrary");
  if (!capability.enabled) return noStoreJson({ results: [], code: "provider_unavailable", reason: capability.reason }, { status: 503 });

  // 2) Open Library API'sine istek at
  try {
    const params = new URLSearchParams({
      q: query.value,
      limit: "12",
      fields:
        "key,title,author_name,first_publish_year,cover_i,edition_count,edition_key,isbn,language,number_of_pages_median,subject",
    });

    const url = `https://openlibrary.org/search.json?${params.toString()}`;

    const userAgent = providerUserAgent();
    const olResponse = await fetchWithTimeout(url, {
      headers: {
        accept: "application/json",
        ...(userAgent ? { "user-agent": userAgent } : {}),
      },
    });

    if (!olResponse.ok) {
      return noStoreJson({ code: "upstream_error" }, { status: 502 });
    }

    const data = (await olResponse.json()) as OpenLibrarySearchResponse;

    // 3) Sonuçları normalize et
    const results = data.docs.map(normalizeDoc);

    return noStoreJson({
      results,
      totalFound: data.numFound,
    });
  } catch {
    return noStoreJson({ code: "upstream_error" }, { status: 502 });
  }
}
