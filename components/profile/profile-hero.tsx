"use client";

import { Eye, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { ProfileAvatar } from "@/components/sidebar-profile-card";
import { bannerPositionFallback, resolveImageTransformStyle } from "@/lib/personalization/image-transform";
import type { ResolvedProfileIdentity } from "@/lib/personalization/profile-identity";
import type { ProfilePresentationPreferences } from "@/lib/personalization/types";
import type { ProfilePreferences } from "@/lib/profile-preferences";

export type ProfileHeroVariant = "self" | "public" | "preview";

export interface ProfileHeroProgression {
  level: number;
  totalXp?: number;
  currentLevelXp?: number;
  nextLevelXp?: number;
  progressPercent?: number;
  tier?: string;
  dominantWorld?: string;
  badges?: Array<{ key: string; name: string }>;
}

const OVERLAY_CLASSES: Record<ProfilePresentationPreferences["overlayStrength"], string> = {
  low: "from-black/55 via-black/20 to-black/45",
  medium: "from-black/75 via-black/35 to-black/65",
  high: "from-black/90 via-black/55 to-black/80",
};

const FRAME_CLASSES: Record<ProfilePresentationPreferences["avatarFrame"], string> = {
  none: "",
  subtle: "ring-4 ring-[var(--app-surface-1)] shadow-lg",
  world: "ring-4 ring-[var(--profile-primary)] shadow-lg",
  tier: "ring-4 ring-[var(--profile-strong)] shadow-xl",
};

const SURFACE_CLASSES: Record<ProfilePresentationPreferences["surfaceStyle"], string> = {
  solid: "bg-[var(--app-surface-1)]",
  soft_glass: "bg-[color-mix(in_srgb,var(--app-surface-1)_82%,transparent)] backdrop-blur-md",
  textured: "bg-[radial-gradient(circle_at_top_right,var(--profile-soft),transparent_42%),var(--app-surface-1)]",
};

export function ProfileHero({ variant, identity, presentation, localPreferences, progression, visibilityLabel, location, language, joinedAt, publicProfileHref, onEdit, onBannerError, actions, setupMessage }: {
  variant: ProfileHeroVariant;
  identity: ResolvedProfileIdentity;
  presentation: ProfilePresentationPreferences;
  localPreferences?: ProfilePreferences;
  progression?: ProfileHeroProgression;
  visibilityLabel?: string;
  location?: string;
  language?: string;
  joinedAt?: string;
  publicProfileHref?: string;
  onEdit?: () => void;
  onBannerError?: () => void;
  actions?: ReactNode;
  setupMessage?: string;
}) {
  const [failedBannerUrl, setFailedBannerUrl] = useState<string>();
  const [loadedBannerUrl, setLoadedBannerUrl] = useState<string>();
  const requestedBannerUrl = presentation.bannerMode === "image" ? identity.bannerUrl : undefined;
  const imageBannerUrl = requestedBannerUrl && failedBannerUrl !== requestedBannerUrl ? requestedBannerUrl : undefined;
  const hasImageBanner = Boolean(imageBannerUrl && loadedBannerUrl === imageBannerUrl);
  const expandedBanner = presentation.bannerMode !== "none";
  const compact = variant === "preview";
  const textClass = hasImageBanner ? "text-white" : "text-[var(--app-text-primary)]";
  const mutedClass = hasImageBanner ? "text-white/80" : "text-[var(--app-text-muted)]";
  const badgeClass = hasImageBanner
    ? "border-white/20 bg-black/35 text-white"
    : "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] text-[var(--app-selected-text)]";
  return (
    <section data-profile-palette={presentation.paletteId} data-profile-variant={variant} className={`relative overflow-hidden rounded-3xl border border-[var(--app-border)] ${SURFACE_CLASSES[presentation.surfaceStyle]}`}>
      <div data-profile-banner-state={hasImageBanner ? "image" : presentation.bannerMode === "none" ? "none" : "themed-fallback"} className={`relative ${compact ? "min-h-44" : expandedBanner ? "min-h-64 sm:min-h-72" : "min-h-48"} ${presentation.bannerMode === "none" ? "bg-[var(--app-surface-2)]" : "profile-hero-themed-fallback"}`}>
        {imageBannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed cloud asset URL; decorative responsive crop.
          <img src={imageBannerUrl} alt="" onLoad={() => setLoadedBannerUrl(imageBannerUrl)} onError={() => { setFailedBannerUrl(imageBannerUrl); setLoadedBannerUrl(undefined); onBannerError?.(); }} className={`absolute inset-0 h-full w-full object-cover transition-opacity ${hasImageBanner ? "opacity-100" : "opacity-0"}`} style={resolveImageTransformStyle(presentation.bannerTransform, "banner", bannerPositionFallback(presentation.bannerPosition))} />
        )}
        {hasImageBanner && <div aria-hidden="true" className={`absolute inset-0 bg-gradient-to-t ${OVERLAY_CLASSES[presentation.overlayStrength]}`} />}
        {presentation.motifIntensity !== "none" && <div aria-hidden="true" className={`absolute right-6 top-6 h-28 w-28 rounded-full border border-[color-mix(in_srgb,var(--profile-primary)_35%,var(--app-border))] bg-[radial-gradient(circle,var(--profile-soft),transparent_68%)] ${presentation.motifIntensity === "full" ? "opacity-90" : "opacity-45"}`} />}

        <div className="relative flex h-full flex-col justify-end gap-5 p-5 sm:flex-row sm:items-end sm:p-7">
          <div className={`shrink-0 rounded-full ${FRAME_CLASSES[presentation.avatarFrame]}`}>
            <ProfileAvatar profileName={identity.displayName} preferences={localPreferences} socialAvatarUrl={identity.avatarUrl} allowLocalFallback size="xl" shape="circle" ariaLabel={`${identity.displayName} avatarı`} imageTransform={presentation.avatarTransform} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={`truncate text-2xl font-bold sm:text-3xl ${textClass}`}>{identity.displayName}</h1>
              {visibilityLabel && <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${badgeClass}`}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{visibilityLabel}</span>}
            </div>
            {identity.username && <p className={`mt-1 text-sm ${mutedClass}`}>@{identity.username}</p>}
            <p className={`mt-2 max-w-2xl text-sm leading-relaxed ${mutedClass}`}>{identity.tagline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {identity.selectedTitle && <span className="rounded-full bg-[var(--profile-soft)] px-3 py-1.5 font-medium text-[var(--profile-ink)] ring-1 ring-[var(--profile-primary)]/40"><Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{identity.selectedTitle}</span>}
              {progression && <span className={`rounded-full border px-3 py-1.5 ${badgeClass}`}>Seviye {progression.level}{progression.tier ? ` · ${progression.tier}` : ""}</span>}
              {progression?.dominantWorld && <span className={`rounded-full border px-3 py-1.5 ${badgeClass}`}>{progression.dominantWorld}</span>}
            </div>
            {(location || language || joinedAt) && <p className={`mt-3 text-xs ${mutedClass}`}>{[location, language?.toUpperCase(), joinedAt].filter(Boolean).join(" · ")}</p>}
          </div>
          {variant === "self" && <div className="flex shrink-0 flex-wrap gap-2">
            {onEdit && <button type="button" onClick={onEdit} className="app-primary-action inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><Pencil className="h-4 w-4" aria-hidden="true" />Profili düzenle</button>}
            {publicProfileHref && <Link href={publicProfileHref} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${hasImageBanner ? "border-white/25 bg-black/35 text-white hover:bg-black/45" : "border-[var(--app-border-strong)] bg-[var(--app-surface-1)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"}`}><Eye className="h-4 w-4" aria-hidden="true" />Public görünüm</Link>}
          </div>}
          {variant === "public" && actions}
        </div>
      </div>
      {setupMessage && <p className="border-t border-[var(--app-border)] bg-[var(--app-warning-soft)] px-5 py-3 text-sm text-[var(--app-warning)]">{setupMessage}</p>}
      {variant !== "preview" && progression?.progressPercent !== undefined && progression.nextLevelXp !== undefined && (
        <div className="px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--app-text-muted)]"><span>XP ilerlemesi</span><span>{Math.round(progression.progressPercent * 100)}% · {progression.currentLevelXp ?? 0}/{progression.nextLevelXp}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--app-surface-3)]"><div className="h-full rounded-full bg-[var(--profile-primary)]" style={{ width: `${Math.round(progression.progressPercent * 100)}%` }} /></div>
        </div>
      )}
    </section>
  );
}
