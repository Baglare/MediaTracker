import type { AniListNormalizedResult } from "@/lib/anilist-types";

export type AniListSearchDiagnostic =
  | { kind: "results"; count: number }
  | { kind: "empty"; count: 0 }
  | { kind: "rate_limited"; count: 0; retryAfter?: string }
  | { kind: "unavailable"; count: 0 }
  | { kind: "source_error"; count: 0 };

export interface AniListSearchOutcome {
  results: AniListNormalizedResult[];
  diagnostic: AniListSearchDiagnostic;
}

interface AniListSearchPayload {
  results?: unknown;
  errors?: unknown;
}

export async function fetchAniListGlobalSearch(input: {
  query: string;
  category: "anime" | "all";
  fetcher?: typeof fetch;
}): Promise<AniListSearchOutcome> {
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(
      `/api/anilist/search?q=${encodeURIComponent(input.query)}&category=${input.category}`,
    );
    const payload = await response.json().catch(() => ({})) as AniListSearchPayload;
    if (response.status === 429) {
      return {
        results: [],
        diagnostic: {
          kind: "rate_limited",
          count: 0,
          retryAfter: response.headers.get("retry-after") ?? undefined,
        },
      };
    }
    if (response.status === 403) {
      return { results: [], diagnostic: { kind: "unavailable", count: 0 } };
    }
    if (!response.ok || Array.isArray(payload.errors)) {
      return { results: [], diagnostic: { kind: "source_error", count: 0 } };
    }
    const results = Array.isArray(payload.results)
      ? payload.results as AniListNormalizedResult[]
      : [];
    return results.length > 0
      ? { results, diagnostic: { kind: "results", count: results.length } }
      : { results: [], diagnostic: { kind: "empty", count: 0 } };
  } catch {
    return { results: [], diagnostic: { kind: "source_error", count: 0 } };
  }
}

export function anilistDiagnosticMessage(
  diagnostic: Exclude<AniListSearchDiagnostic, { kind: "results" }>,
): string {
  switch (diagnostic.kind) {
    case "empty":
      return "AniList bu sorgu için sonuç döndürmedi. Daha kısa başlık, İngilizce başlık veya farklı yazım deneyin.";
    case "rate_limited":
      return diagnostic.retryAfter
        ? `AniList istek sınırına ulaşıldı. Retry-After: ${diagnostic.retryAfter}.`
        : "AniList istek sınırına ulaşıldı. Bir süre sonra tekrar deneyin.";
    case "unavailable":
      return "AniList API geçici olarak kullanılamıyor. Daha sonra tekrar deneyin.";
    case "source_error":
      return "AniList kaynağında bir hata oluştu. Diğer kaynak sonuçları gösterilmeye devam ediyor.";
  }
}

export function collectFulfilledSearchResults<T>(
  settled: readonly PromiseSettledResult<T[]>[],
): T[] {
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}
