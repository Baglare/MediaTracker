import type { EvidenceClaim } from "../domain/evidence";
import type {
  AspectId,
  RecommendationMediaType,
  RecommendationProvider,
} from "../domain/types";

export const PROVIDER_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type SecondaryIdentityKind =
  | "imdb"
  | "tmdb"
  | "tvmaze"
  | "anilist"
  | "openlibrary_work"
  | "openlibrary_edition"
  | "thetvdb";

export interface SecondaryIdentity {
  kind: SecondaryIdentityKind;
  externalId: string;
}

export interface IdentityVerificationEvidence {
  provider: RecommendationProvider;
  field: string;
  externalId: string;
}

export interface RecommendationCandidateIdentity {
  primaryProvider: RecommendationProvider;
  primaryExternalId: string;
  mediaType: RecommendationMediaType;
  verified: true;
  secondaryIds: readonly SecondaryIdentity[];
  canonicalKey: string;
  verificationEvidence: readonly IdentityVerificationEvidence[];
}

export interface ProviderTagMetadata {
  name: string;
  rank?: number;
  category?: string;
  isGeneralSpoiler?: boolean;
  isMediaSpoiler?: boolean;
}

export interface CandidateObjectiveMetadata {
  mediaType: RecommendationMediaType;
  format?: string;
  releaseStatus?: string;
  releaseYear?: number;
  language?: string;
  countries?: readonly string[];
  episodeCount?: number;
  chapterCount?: number;
  pageCount?: number;
  runtimeMinutes?: number;
  genres?: readonly string[];
  subjects?: readonly string[];
  keywords?: readonly string[];
  tags?: readonly ProviderTagMetadata[];
  popularity?: number;
  communityScore?: number;
}

export interface RawProviderEvidenceClaim extends EvidenceClaim {
  mappedAspectIds: readonly AspectId[];
  spoiler?: boolean;
}

export type ProviderCoverageStatus = "available" | "partial" | "unavailable";
export type ProviderEvidenceCacheStatus = "miss" | "hit" | "refreshed" | "not_cacheable";

export interface CandidateProviderEvidenceSnapshot {
  schemaVersion: typeof PROVIDER_EVIDENCE_SCHEMA_VERSION;
  candidateIdentity: RecommendationCandidateIdentity;
  objectiveMetadata: CandidateObjectiveMetadata;
  rawEvidenceClaims: readonly RawProviderEvidenceClaim[];
  providerCoverage: Readonly<Partial<Record<RecommendationProvider, ProviderCoverageStatus>>>;
  missingFields: readonly string[];
  fetchedAt: string;
  cacheStatus: ProviderEvidenceCacheStatus;
  warnings: readonly string[];
}

export interface ProviderEvidenceTelemetry {
  snapshots: number;
  enrichedCandidates: number;
  cacheHits: number;
  cacheMisses: number;
  enrichmentFailures: number;
  tvmaze_anime_excluded: number;
  tvmaze_anime_likely_excluded: number;
  tvmaze_anime_unknown: number;
  tvmaze_non_anime_kept: number;
  same_provider_deduped: number;
  exact_bridge_deduped: number;
  identity_conflicts: number;
}

export function emptyProviderEvidenceTelemetry(): ProviderEvidenceTelemetry {
  return {
    snapshots: 0,
    enrichedCandidates: 0,
    cacheHits: 0,
    cacheMisses: 0,
    enrichmentFailures: 0,
    tvmaze_anime_excluded: 0,
    tvmaze_anime_likely_excluded: 0,
    tvmaze_anime_unknown: 0,
    tvmaze_non_anime_kept: 0,
    same_provider_deduped: 0,
    exact_bridge_deduped: 0,
    identity_conflicts: 0,
  };
}
