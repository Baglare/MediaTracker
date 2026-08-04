import type { AiCandidate, AiIntent } from "@/lib/ai/types";
import type { MediaType } from "@/lib/types";
import type { RecommendationReference } from "../domain/codec";
import type { RecommendationMediaType, RecommendationProvider } from "../domain/types";

const PROVIDERS = new Set<RecommendationProvider>(["anilist", "tvmaze", "tmdb", "omdb", "openlibrary"]);
const MEDIA_TYPES = new Set<RecommendationMediaType>(["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"]);

function normalizeTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export interface ReferenceResolutionResult {
  references: RecommendationReference[];
  unresolvedCount: number;
  ambiguousCount: number;
  warnings: string[];
}

export interface ReferenceMediaItem {
  title: string;
  type: MediaType;
  externalSource?: string;
  externalId?: string;
}

export function resolveRecommendationReferences(input: {
  intent: AiIntent;
  mediaItems: readonly ReferenceMediaItem[];
  candidates: readonly AiCandidate[];
}): ReferenceResolutionResult {
  const references: RecommendationReference[] = [];
  const warnings: string[] = [];
  let unresolvedCount = 0;
  let ambiguousCount = 0;
  for (const titleText of input.intent.references) {
    const key = normalizeTitle(titleText);
    const library = input.mediaItems.filter((item) => normalizeTitle(item.title) === key);
    const providers = input.candidates.filter((candidate) => normalizeTitle(candidate.title) === key);
    const exact = [
      ...library.flatMap((item) => item.externalSource && item.externalId && PROVIDERS.has(item.externalSource as RecommendationProvider) && MEDIA_TYPES.has(item.type as RecommendationMediaType)
        ? [{ title: item.title, mediaType: item.type as RecommendationMediaType, provider: item.externalSource as RecommendationProvider, externalId: item.externalId }]
        : []),
      ...providers.flatMap((candidate) => PROVIDERS.has(candidate.source as RecommendationProvider) && MEDIA_TYPES.has(candidate.type as RecommendationMediaType)
        ? [{ title: candidate.title, mediaType: candidate.type as RecommendationMediaType, provider: candidate.source as RecommendationProvider, externalId: candidate.externalId }]
        : []),
    ];
    const unique = new Map(exact.map((item) => [`${item.provider}:${item.externalId}`, item]));
    if (unique.size === 1) {
      const item = [...unique.values()][0];
      references.push({ state: "verified", titleSnapshot: item.title, mediaType: item.mediaType, provider: item.provider, externalId: item.externalId });
    } else {
      references.push({ state: "unresolved", titleText });
      unresolvedCount += 1;
      if (unique.size > 1) {
        ambiguousCount += 1;
        warnings.push(`ambiguous_reference:${titleText}`);
      }
    }
  }
  return { references, unresolvedCount, ambiguousCount, warnings };
}
