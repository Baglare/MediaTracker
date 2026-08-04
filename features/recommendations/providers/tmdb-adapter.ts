import type { TmdbNormalizedDetail, TmdbNormalizedResult } from "@/lib/tmdb-types";
import { createVerifiedCandidateIdentity } from "./candidate-identity";
import { mapProviderGenreClaims, mapProviderKeywordClaims, mapProviderMetadataClaim } from "./evidence-mappers";
import type { CandidateProviderEvidenceSnapshot, SecondaryIdentity } from "./types";
import { PROVIDER_EVIDENCE_SCHEMA_VERSION } from "./types";

type TmdbEvidenceInput = TmdbNormalizedResult | TmdbNormalizedDetail;

export function adaptTmdbEvidence(input: TmdbEvidenceInput, fetchedAt = new Date().toISOString()): CandidateProviderEvidenceSnapshot {
  const secondaryIds: SecondaryIdentity[] = [{ kind: "tmdb", externalId: input.externalId }];
  if (input.imdbId) secondaryIds.push({ kind: "imdb", externalId: input.imdbId });
  if (input.theTvdbId) secondaryIds.push({ kind: "thetvdb", externalId: input.theTvdbId });
  const identity = createVerifiedCandidateIdentity({ primaryProvider: "tmdb", primaryExternalId: input.externalId, mediaType: input.type, secondaryIds });
  const genres = input.genres;
  const keywords = input.keywords;
  return {
    schemaVersion: PROVIDER_EVIDENCE_SCHEMA_VERSION, candidateIdentity: identity,
    objectiveMetadata: {
      mediaType: input.type, releaseYear: input.releaseYear, language: input.originalLanguage,
      countries: input.countries, episodeCount: input.type === "tv" ? input.numberOfEpisodes : undefined,
      runtimeMinutes: input.type === "movie" ? input.runtime : undefined,
      genres, keywords: keywords?.map((item) => item.name), popularity: input.popularity,
      communityScore: input.averageScore,
    },
    rawEvidenceClaims: [
      ...mapProviderGenreClaims("tmdb", genres, 0.9),
      ...mapProviderKeywordClaims("tmdb", keywords, 0.82),
      ...(input.originalLanguage ? [mapProviderMetadataClaim({ provider: "tmdb", field: "originalLanguage", value: input.originalLanguage, reliability: 0.95 })] : []),
    ],
    providerCoverage: { tmdb: keywords?.length || genres?.length ? "available" : "partial" },
    missingFields: [!genres?.length && "genres", !keywords?.length && "keywords", !input.overview && "overview"].filter((x): x is string => Boolean(x)),
    fetchedAt, cacheStatus: "not_cacheable", warnings: [],
  };
}

export async function fetchTmdbEvidenceDetail(input: {
  baseUrl: string;
  externalId: string;
  mediaType: "movie" | "tv";
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<CandidateProviderEvidenceSnapshot> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 2500);
  try {
    const url = `${input.baseUrl}/api/tmdb/details?id=${encodeURIComponent(input.externalId)}&mediaType=${input.mediaType}`;
    const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`tmdb_evidence_unavailable:${response.status}`);
    const body = (await response.json()) as { result?: TmdbNormalizedDetail | null };
    if (!body.result) throw new Error("tmdb_evidence_unavailable:empty");
    return adaptTmdbEvidence(body.result);
  } finally {
    clearTimeout(timeout);
  }
}
