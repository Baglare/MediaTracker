import { NextRequest } from "next/server";
import { fetchOmdbDetail, fetchOmdbSearch, normalizeOmdbDetail } from "@/lib/omdb";
import { OmdbNormalizedResult } from "@/lib/omdb-types";
import { SEARCH_REQUEST_MAX_BYTES, apiError, enforceRateLimit, noStoreJson, parseSearchQuery, readStrictJsonObject, resolveRateLimitIdentity } from "@/lib/api/request-security";

export async function POST(request: NextRequest) {
  const parsed = await readStrictJsonObject(request, new Set(["query"]), SEARCH_REQUEST_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const query = parseSearchQuery(parsed.value.query);
  if (!query.ok) return apiError("search_query_invalid", 400);
  const rateLimit = enforceRateLimit("search:omdb", await resolveRateLimitIdentity(request), 60, 60_000);
  if (rateLimit) return rateLimit;

  if (!process.env.OMDB_API_KEY) {
    return noStoreJson({ code: "provider_unavailable" }, { status: 503 });
  }

  try {
    const search = await fetchOmdbSearch(query.value);
    if (search.Response !== "True") {
      return noStoreJson({ results: [] });
    }

    const baseResults = (search.Search || []).slice(0, 8);
    const detailResults = await Promise.allSettled(
      baseResults.map((item) => fetchOmdbDetail(item.imdbID))
    );

    const normalized: OmdbNormalizedResult[] = detailResults
      .map((result) => {
        if (result.status !== "fulfilled") return null;
        const detail = result.value;
        if (detail.Response !== "True") return null;
        return normalizeOmdbDetail(detail);
      })
      .filter((item): item is OmdbNormalizedResult => item !== null);

    return noStoreJson({ results: normalized });
  } catch {
    return noStoreJson({ code: "upstream_error" }, { status: 502 });
  }
}
