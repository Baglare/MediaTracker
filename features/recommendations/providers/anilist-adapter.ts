import type { AniListNormalizedResult } from "@/lib/anilist-types";
import { createVerifiedCandidateIdentity } from "./candidate-identity";
import { mapAniListTagClaims, mapProviderGenreClaims, mapProviderMetadataClaim } from "./evidence-mappers";
import type { CandidateProviderEvidenceSnapshot } from "./types";
import { PROVIDER_EVIDENCE_SCHEMA_VERSION } from "./types";

export function adaptAniListEvidence(
  result: AniListNormalizedResult,
  fetchedAt = new Date().toISOString(),
): CandidateProviderEvidenceSnapshot {
  const identity = createVerifiedCandidateIdentity({
    primaryProvider: "anilist", primaryExternalId: result.externalId, mediaType: result.type,
    secondaryIds: [{ kind: "anilist", externalId: result.externalId }],
  });
  const metadataClaims = [
    result.format ? mapProviderMetadataClaim({ provider: "anilist", field: "format", value: result.format, reliability: 0.95 }) : null,
    result.anilistStatus ? mapProviderMetadataClaim({ provider: "anilist", field: "status", value: result.anilistStatus, reliability: 0.95 }) : null,
    result.countryOfOrigin ? mapProviderMetadataClaim({ provider: "anilist", field: "countryOfOrigin", value: result.countryOfOrigin, reliability: 0.95 }) : null,
  ].filter((claim): claim is NonNullable<typeof claim> => claim !== null);
  return {
    schemaVersion: PROVIDER_EVIDENCE_SCHEMA_VERSION,
    candidateIdentity: identity,
    objectiveMetadata: {
      mediaType: result.type, format: result.format, releaseStatus: result.anilistStatus,
      releaseYear: result.releaseYear, countries: result.countryOfOrigin ? [result.countryOfOrigin] : undefined,
      episodeCount: result.episodes, chapterCount: result.chapters, genres: result.genres,
      tags: result.tags, popularity: result.popularity, communityScore: result.averageScore,
    },
    rawEvidenceClaims: [
      ...mapProviderGenreClaims("anilist", result.genres, 0.9),
      ...mapAniListTagClaims(result.tags), ...metadataClaims,
    ],
    providerCoverage: { anilist: "available" },
    missingFields: [!result.genres?.length && "genres", !result.tags?.length && "tags", !result.overview && "description"].filter((x): x is string => Boolean(x)),
    fetchedAt, cacheStatus: "not_cacheable", warnings: ["anilist_tag_rank_is_not_aspect_strength"],
  };
}

