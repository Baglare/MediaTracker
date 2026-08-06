import {
  ASPECT_IDS,
  ASPECT_REGISTRY,
  evidenceStrategyForProvider,
  providerRetrievalMappingsFor,
  type AspectId,
} from "./aspect-registry";
import type { RecommendationMediaType, RecommendationProvider } from "./types";

export type RankedTagProviderCoverageStatus =
  | "mapped_queryable"
  | "evidence_only"
  | "semantic_confirmation_required"
  | "unsupported";

export type RankedTagMappingSource =
  | "repository_contract"
  | "provider_taxonomy"
  | "live_observed"
  | "none";

export interface RankedTagProviderCoverage {
  aspectId: AspectId;
  provider: RecommendationProvider;
  status: RankedTagProviderCoverageStatus;
  canonicalProviderTags: readonly string[];
  canonicalProviderKeywords: readonly string[];
  supportsServerSideQuery: boolean;
  supportsMinimumRank: boolean;
  supportedMediaTypes: readonly RecommendationMediaType[];
  canUseAsMust: boolean;
  canUseAsAvoid: boolean;
  canUseAsPrefer: boolean;
  requiresSemanticConfirmation: boolean;
  mappingSource: RankedTagMappingSource;
  limitationReason: string;
}

export const RANKED_TAG_ASPECT_IDS = ASPECT_IDS.filter((aspectId) => (
  ASPECT_REGISTRY[aspectId].defaultEvidenceStrategy === "ranked_tag"
));

export const RANKED_TAG_SEMANTIC_CONFIRMATION_ASPECT_IDS: readonly AspectId[] = [
  "power_progression",
  "found_family",
  "coming_of_age",
  "antihero",
  "enemies_to_lovers",
  "friendship_focus",
  "family_focus",
  "dark",
  "disturbing_content",
];

const PROVIDERS: readonly RecommendationProvider[] = ["anilist", "tvmaze", "tmdb", "omdb", "openlibrary"];
const PROVIDER_MEDIA_TYPES: Readonly<Record<RecommendationProvider, readonly RecommendationMediaType[]>> = {
  anilist: ["anime", "manga", "manhwa", "manhua"],
  tvmaze: ["tv"],
  tmdb: ["movie", "tv"],
  omdb: ["movie"],
  openlibrary: ["book"],
};

function statusFor(aspectId: AspectId, provider: RecommendationProvider): RankedTagProviderCoverageStatus {
  const entry = ASPECT_REGISTRY[aspectId];
  if (entry.providerSupport[provider] === "unsupported") return "unsupported";
  const mapping = providerRetrievalMappingsFor(aspectId, provider).find((candidate) => (
    candidate.queryable
    && candidate.strategy === "ranked_tag"
    && (candidate.canonicalTags?.length ?? 0) > 0
  ));
  if (mapping) return "mapped_queryable";
  if (provider === "tvmaze" || provider === "omdb") return "unsupported";
  if (RANKED_TAG_SEMANTIC_CONFIRMATION_ASPECT_IDS.includes(aspectId)) return "semantic_confirmation_required";
  return evidenceStrategyForProvider(aspectId, provider) === "soft_only" || provider === "anilist"
    ? "evidence_only"
    : "unsupported";
}

function buildCoverage(aspectId: AspectId, provider: RecommendationProvider): RankedTagProviderCoverage {
  const entry = ASPECT_REGISTRY[aspectId];
  const status = statusFor(aspectId, provider);
  const mapping = providerRetrievalMappingsFor(aspectId, provider).find((candidate) => (
    candidate.queryable && candidate.strategy === "ranked_tag"
  ));
  const supportedMediaTypes = mapping?.supportedMediaTypes
    ?? PROVIDER_MEDIA_TYPES[provider].filter((mediaType) => (
      (entry.supportedMediaTypes as readonly RecommendationMediaType[]).includes(mediaType)
    ));
  const semantic = status === "semantic_confirmation_required";
  const evidenceUsable = status === "mapped_queryable" || status === "evidence_only";
  return {
    aspectId,
    provider,
    status,
    canonicalProviderTags: mapping?.canonicalTags ?? [],
    canonicalProviderKeywords: [],
    supportsServerSideQuery: status === "mapped_queryable",
    supportsMinimumRank: status === "mapped_queryable" && provider === "anilist",
    supportedMediaTypes,
    canUseAsMust: status === "mapped_queryable" && entry.mustSafety !== "unsafe",
    canUseAsAvoid: evidenceUsable && String(entry.avoidSafety) !== "unsafe",
    canUseAsPrefer: status !== "unsupported",
    requiresSemanticConfirmation: semantic,
    mappingSource: mapping ? "repository_contract" : status === "unsupported" ? "none" : "repository_contract",
    limitationReason: status === "mapped_queryable"
      ? "provider_tag_rank_is_relevance_not_centrality"
      : semantic
        ? "broad_or_composite_aspect_requires_semantic_confirmation"
        : status === "evidence_only"
          ? "provider_field_is_unranked_or_not_server_queryable"
          : "provider_has_no_reliable_ranked_taxonomy_for_aspect",
  };
}

export const RANKED_TAG_PROVIDER_COVERAGE: readonly RankedTagProviderCoverage[] = RANKED_TAG_ASPECT_IDS
  .flatMap((aspectId) => PROVIDERS.map((provider) => buildCoverage(aspectId, provider)));

export function rankedTagProviderCoverageFor(
  aspectId: AspectId,
  provider: RecommendationProvider,
  mediaType?: RecommendationMediaType,
): RankedTagProviderCoverage | null {
  const coverage = RANKED_TAG_PROVIDER_COVERAGE.find((item) => item.aspectId === aspectId && item.provider === provider) ?? null;
  if (!coverage || (mediaType && !coverage.supportedMediaTypes.includes(mediaType))) return null;
  return coverage;
}
