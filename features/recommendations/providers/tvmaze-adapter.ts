import type { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import { createVerifiedCandidateIdentity } from "./candidate-identity";
import { mapProviderGenreClaims, mapProviderMetadataClaim } from "./evidence-mappers";
import type { CandidateProviderEvidenceSnapshot, ProviderEvidenceTelemetry, SecondaryIdentity } from "./types";
import { PROVIDER_EVIDENCE_SCHEMA_VERSION } from "./types";
import { classifyTvmazeAnime } from "./tvmaze-anime-classifier";

export interface TvmazeRecommendationDecision {
  keep: boolean;
  snapshot?: CandidateProviderEvidenceSnapshot;
  reasonCode?: "tvmaze_anime_excluded" | "tvmaze_anime_likely_excluded";
  classification: ReturnType<typeof classifyTvmazeAnime>;
}

export function adaptTvmazeRecommendationEvidence(
  result: TvmazeNormalizedResult,
  fetchedAt = new Date().toISOString(),
): TvmazeRecommendationDecision {
  const classification = classifyTvmazeAnime({
    type: result.showType, genres: result.genres, language: result.language,
    networkCountryCode: result.networkCountryCode, webChannelCountryCode: result.webChannelCountryCode,
  });
  if (classification.classification === "confirmed_anime") {
    return { keep: false, reasonCode: "tvmaze_anime_excluded", classification };
  }
  if (classification.classification === "likely_anime") {
    return { keep: false, reasonCode: "tvmaze_anime_likely_excluded", classification };
  }
  const secondaryIds: SecondaryIdentity[] = [{ kind: "tvmaze", externalId: result.externalId }];
  if (result.imdbId) secondaryIds.push({ kind: "imdb", externalId: result.imdbId });
  if (result.theTvdbId) secondaryIds.push({ kind: "thetvdb", externalId: result.theTvdbId });
  const identity = createVerifiedCandidateIdentity({ primaryProvider: "tvmaze", primaryExternalId: result.externalId, mediaType: "tv", secondaryIds });
  const snapshot: CandidateProviderEvidenceSnapshot = {
    schemaVersion: PROVIDER_EVIDENCE_SCHEMA_VERSION, candidateIdentity: identity,
    objectiveMetadata: {
      mediaType: "tv", format: result.showType, releaseStatus: result.tvmazeStatus,
      releaseYear: result.releaseYear, language: result.language,
      countries: [result.networkCountryCode, result.webChannelCountryCode].filter((x): x is string => Boolean(x)),
      genres: result.genres,
    },
    rawEvidenceClaims: [
      ...mapProviderGenreClaims("tvmaze", result.genres, 0.75),
      ...(result.showType ? [mapProviderMetadataClaim({ provider: "tvmaze", field: "type", value: result.showType, reliability: 0.9 })] : []),
      ...(result.language ? [mapProviderMetadataClaim({ provider: "tvmaze", field: "language", value: result.language, reliability: 0.9 })] : []),
    ],
    providerCoverage: { tvmaze: "available" },
    missingFields: [!result.genres?.length && "genres", !result.language && "language", !result.showType && "showType"].filter((x): x is string => Boolean(x)),
    fetchedAt, cacheStatus: "not_cacheable",
    warnings: classification.classification === "unknown" ? ["tvmaze_anime_classification_unknown"] : [],
  };
  return { keep: true, snapshot, classification };
}

export function countTvmazeDecision(telemetry: ProviderEvidenceTelemetry, decision: TvmazeRecommendationDecision): void {
  if (decision.reasonCode) telemetry[decision.reasonCode] += 1;
  else if (decision.classification.classification === "unknown") telemetry.tvmaze_anime_unknown += 1;
  else telemetry.tvmaze_non_anime_kept += 1;
}

