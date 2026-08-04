import type {
  RecommendationDecodeResult,
  RecommendationDomainIssue,
  RecommendationMediaType,
  RecommendationProvider,
} from "./types";

export type ProviderCapability =
  | "discovery"
  | "identity"
  | "objective_metadata"
  | "aspect_evidence"
  | "enrichment"
  | "secondary_verification";

export interface RecommendationProviderPolicy {
  provider: RecommendationProvider;
  ownership: string;
  capabilities: Readonly<Record<ProviderCapability, readonly RecommendationMediaType[]>>;
}

export const PROVIDER_CAPABILITY_REGISTRY = {
  anilist: {
    provider: "anilist",
    ownership: "Anime, manga, manhwa ve manhua için primary recommendation provider.",
    capabilities: {
      discovery: ["anime", "manga", "manhwa", "manhua"],
      identity: ["anime", "manga", "manhwa", "manhua"],
      objective_metadata: ["anime", "manga", "manhwa", "manhua"],
      aspect_evidence: ["anime", "manga", "manhwa", "manhua"],
      enrichment: ["anime", "manga", "manhwa", "manhua"],
      secondary_verification: [],
    },
  },
  tvmaze: {
    provider: "tvmaze",
    ownership: "Anime dışı TV discovery ve operational yayın/bölüm metadata provider.",
    capabilities: {
      discovery: ["tv"],
      identity: ["tv"],
      objective_metadata: ["tv"],
      aspect_evidence: ["tv"],
      enrichment: ["tv"],
      secondary_verification: [],
    },
  },
  tmdb: {
    provider: "tmdb",
    ownership: "Movie ve TV discovery ile genre/keyword enrichment provider.",
    capabilities: {
      discovery: ["movie", "tv"],
      identity: ["movie", "tv"],
      objective_metadata: ["movie", "tv"],
      aspect_evidence: ["movie", "tv"],
      enrichment: ["movie", "tv"],
      secondary_verification: [],
    },
  },
  omdb: {
    provider: "omdb",
    ownership: "Movie identity ve secondary verification provider.",
    capabilities: {
      discovery: [],
      identity: ["movie"],
      objective_metadata: ["movie"],
      aspect_evidence: ["movie"],
      enrichment: ["movie"],
      secondary_verification: ["movie"],
    },
  },
  openlibrary: {
    provider: "openlibrary",
    ownership: "Book identity ve bibliographic metadata provider.",
    capabilities: {
      discovery: ["book"],
      identity: ["book"],
      objective_metadata: ["book"],
      aspect_evidence: ["book"],
      enrichment: ["book"],
      secondary_verification: [],
    },
  },
} as const satisfies Record<RecommendationProvider, RecommendationProviderPolicy>;

export const PRIMARY_RECOMMENDATION_PROVIDERS: Readonly<
  Record<RecommendationMediaType, readonly RecommendationProvider[]>
> = {
  anime: ["anilist"],
  manga: ["anilist"],
  manhwa: ["anilist"],
  manhua: ["anilist"],
  tv: ["tvmaze", "tmdb"],
  movie: ["tmdb"],
  book: ["openlibrary"],
};

export function providerSupports(
  provider: RecommendationProvider,
  capability: ProviderCapability,
  mediaType: RecommendationMediaType,
): boolean {
  return (PROVIDER_CAPABILITY_REGISTRY[provider].capabilities[capability] as readonly RecommendationMediaType[])
    .includes(mediaType);
}

export interface VerifiedRecommendationIdentity {
  verificationStatus: "verified";
  provider: RecommendationProvider;
  externalId: string;
  mediaType: RecommendationMediaType;
}

export function createVerifiedRecommendationIdentity(input: {
  provider: RecommendationProvider;
  externalId: string;
  mediaType: RecommendationMediaType;
  providerIdentityVerified: boolean;
}): RecommendationDecodeResult<VerifiedRecommendationIdentity> {
  const issues: RecommendationDomainIssue[] = [];
  if (!input.providerIdentityVerified) {
    issues.push({
      code: "provider_identity_unverified",
      path: "providerIdentityVerified",
      message: "Doğrulanmamış provider kaydı V2 recommendation identity olamaz.",
    });
  }
  const externalId = input.externalId.trim();
  if (!externalId || externalId.length > 240) {
    issues.push({
      code: "provider_external_id_invalid",
      path: "externalId",
      message: "Provider externalId 1-240 karakter olmalıdır.",
    });
  }
  if (!providerSupports(input.provider, "identity", input.mediaType)) {
    issues.push({
      code: "provider_media_type_unsupported",
      path: "mediaType",
      message: `${input.provider} ${input.mediaType} identity capability'sini desteklemiyor.`,
    });
  }
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      verificationStatus: "verified",
      provider: input.provider,
      externalId,
      mediaType: input.mediaType,
    },
  };
}
