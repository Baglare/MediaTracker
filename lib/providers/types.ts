export type PublicProviderId = "tvmaze" | "openlibrary" | "anilist" | "tmdb" | "omdb";

export type PublicProviderReason =
  | "enabled"
  | "disabled_by_policy"
  | "missing_configuration"
  | "authorization_required"
  | "attribution_required";

export interface PublicProviderCapability {
  enabled: boolean;
  reason: PublicProviderReason;
}

export interface PublicProviderCapabilities {
  version: 1;
  providers: Record<PublicProviderId, PublicProviderCapability>;
}

export const FAIL_CLOSED_PROVIDER_CAPABILITIES: PublicProviderCapabilities = {
  version: 1,
  providers: {
    tvmaze: { enabled: false, reason: "missing_configuration" },
    openlibrary: { enabled: false, reason: "missing_configuration" },
    anilist: { enabled: false, reason: "disabled_by_policy" },
    tmdb: { enabled: false, reason: "disabled_by_policy" },
    omdb: { enabled: false, reason: "disabled_by_policy" },
  },
};
