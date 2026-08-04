import type { OmdbNormalizedResult } from "@/lib/omdb-types";
import { createVerifiedCandidateIdentity } from "./candidate-identity";
import { mapProviderGenreClaims, mapProviderMetadataClaim } from "./evidence-mappers";
import type { CandidateProviderEvidenceSnapshot } from "./types";
import { PROVIDER_EVIDENCE_SCHEMA_VERSION } from "./types";

export function adaptOmdbEvidence(result: OmdbNormalizedResult, fetchedAt = new Date().toISOString()): CandidateProviderEvidenceSnapshot {
  const identity = createVerifiedCandidateIdentity({
    primaryProvider: "omdb", primaryExternalId: result.externalId, mediaType: "movie",
    secondaryIds: [{ kind: "imdb", externalId: result.externalId }],
  });
  return {
    schemaVersion: PROVIDER_EVIDENCE_SCHEMA_VERSION, candidateIdentity: identity,
    objectiveMetadata: { mediaType: "movie", releaseYear: result.releaseYear, runtimeMinutes: result.runtime, genres: result.genres, communityScore: result.imdbRating },
    rawEvidenceClaims: [
      ...mapProviderGenreClaims("omdb", result.genres, 0.65),
      ...(result.runtime ? [mapProviderMetadataClaim({ provider: "omdb", field: "runtime", value: result.runtime, reliability: 0.85 })] : []),
    ],
    providerCoverage: { omdb: "partial" }, missingFields: [!result.genres?.length && "genres", !result.overview && "plot"].filter((x): x is string => Boolean(x)),
    fetchedAt, cacheStatus: "not_cacheable", warnings: ["omdb_is_secondary_partial_evidence"],
  };
}

