import type { PublicProviderCapabilities, PublicProviderCapability, PublicProviderId } from "@/lib/providers/types";
import { isValidProviderUserAgent } from "@/lib/api/provider-identity";

function disabled(reason: PublicProviderCapability["reason"]): PublicProviderCapability {
  return { enabled: false, reason };
}

function enabled(): PublicProviderCapability {
  return { enabled: true, reason: "enabled" };
}

export function resolvePublicProviderCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): PublicProviderCapabilities {
  // ANILIST_LIVE_ACCESS = DISABLED_PENDING_WRITTEN_AUTHORIZATION in every v1 runtime.
  // Future authorization requires a reviewed source change and release gate; no env bypass.
  const anilist = disabled("authorization_required");

  // TMDB_V1_LIVE_ACCESS = HARD_DISABLED in every v1 runtime.
  // Future legal/retention/AI/branding review requires a separate source change and acceptance.
  const tmdb = disabled("disabled_by_policy");

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
