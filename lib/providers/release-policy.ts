import type { PublicProviderCapabilities, PublicProviderCapability, PublicProviderId } from "@/lib/providers/types";
import { isValidProviderUserAgent } from "@/lib/api/provider-identity";

const TMDB_APPROVED_LOGO_AVAILABLE = false;

function disabled(reason: PublicProviderCapability["reason"]): PublicProviderCapability {
  return { enabled: false, reason };
}

function enabled(): PublicProviderCapability {
  return { enabled: true, reason: "enabled" };
}

export function resolvePublicProviderCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  options: { tmdbApprovedLogoAvailable?: boolean } = {},
): PublicProviderCapabilities {
  // ANILIST_LIVE_ACCESS = DISABLED_PENDING_WRITTEN_AUTHORIZATION in every v1 runtime.
  // Future authorization requires a reviewed source change and release gate; no env bypass.
  const anilist = disabled("authorization_required");

  const tmdbMode = env.MEDIA_TRACKER_TMDB_MODE;
  let tmdb: PublicProviderCapability = disabled("disabled_by_policy");
  if (tmdbMode === "noncommercial") {
    if (!env.TMDB_READ_ACCESS_TOKEN) tmdb = disabled("missing_configuration");
    else if (!(options.tmdbApprovedLogoAvailable ?? TMDB_APPROVED_LOGO_AVAILABLE)) tmdb = disabled("attribution_required");
    else tmdb = enabled();
  }

  return {
    version: 1,
    providers: {
      tvmaze: enabled(),
      openlibrary: isValidProviderUserAgent(env.MEDIA_TRACKER_PROVIDER_USER_AGENT)
        ? enabled()
        : disabled("missing_configuration"),
      anilist,
      tmdb,
      omdb: disabled("disabled_by_policy"),
    },
  };
}

export function publicProviderCapability(
  provider: PublicProviderId,
  env: NodeJS.ProcessEnv = process.env,
): PublicProviderCapability {
  return resolvePublicProviderCapabilities(env).providers[provider];
}
