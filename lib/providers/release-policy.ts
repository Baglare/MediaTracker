import type { PublicProviderCapabilities, PublicProviderCapability, PublicProviderId } from "@/lib/providers/types";

const TMDB_APPROVED_LOGO_AVAILABLE = false;

function disabled(reason: PublicProviderCapability["reason"]): PublicProviderCapability {
  return { enabled: false, reason };
}

function enabled(): PublicProviderCapability {
  return { enabled: true, reason: "enabled" };
}

function hasProviderContact(value: string | undefined): boolean {
  const normalized = value?.trim() ?? "";
  return normalized.length >= 8
    && normalized.length <= 256
    && /mediatracker/i.test(normalized)
    && (/@/.test(normalized) || /https?:\/\//i.test(normalized));
}

export function resolvePublicProviderCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  options: { tmdbApprovedLogoAvailable?: boolean } = {},
): PublicProviderCapabilities {
  const vercelEnvironment = env.VERCEL_ENV;
  const production = vercelEnvironment === "production";
  const previewOrDevelopment = vercelEnvironment === "preview" || (!vercelEnvironment && env.NODE_ENV === "development");

  const anilistMode = env.MEDIA_TRACKER_ANILIST_MODE;
  let anilist: PublicProviderCapability = disabled("disabled_by_policy");
  if (anilistMode === "authorized") anilist = enabled();
  else if (anilistMode === "preview_test") {
    anilist = previewOrDevelopment && !production ? enabled() : disabled("authorization_required");
  } else if (anilistMode && anilistMode !== "disabled") {
    anilist = disabled("disabled_by_policy");
  }

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
      openlibrary: hasProviderContact(env.MEDIA_TRACKER_PROVIDER_USER_AGENT)
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
