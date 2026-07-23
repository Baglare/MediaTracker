"use client";

import { Archive, BookOpen, Clapperboard, Settings, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { dashboardTabHref } from "@/components/app-shell/app-navigation";
import { resolveImageTransformStyle, type ImageTransform } from "@/lib/personalization/image-transform";
import { DEFAULT_PROFILE_PREFERENCES, type AvatarAccent, type PresetAvatar, type ProfilePreferences } from "@/lib/profile-preferences";
import { resolveAvatarSource } from "@/lib/social/avatar";
import CloudModeBadge from "./cloud-mode-badge";

interface SidebarProfileCardProps {
  profileName: string;
  tagline: string;
  preferences: ProfilePreferences;
  socialAvatarUrl?: string;
  avatarTransform?: ImageTransform;
}

interface ProfileAvatarProps {
  profileName: string;
  preferences?: ProfilePreferences;
  socialAvatarUrl?: string;
  allowLocalFallback?: boolean;
  size?: "sm" | "md" | "lg" | "social" | "xl";
  shape?: "rounded" | "circle";
  ariaLabel?: string;
  imageTransform?: ImageTransform;
}

const ACCENT_CLASSES: Record<AvatarAccent, string> = {
  amber: "from-amber-300 via-amber-500 to-yellow-600 text-zinc-950 shadow-amber-950/30",
  violet: "from-violet-300 via-violet-500 to-fuchsia-600 text-zinc-50 shadow-violet-950/30",
  cyan: "from-cyan-300 via-sky-500 to-blue-600 text-zinc-950 shadow-cyan-950/30",
  rose: "from-rose-300 via-rose-500 to-red-600 text-zinc-50 shadow-rose-950/30",
  emerald: "from-emerald-300 via-emerald-500 to-teal-600 text-zinc-950 shadow-emerald-950/30",
  zinc: "from-zinc-300 via-zinc-500 to-zinc-700 text-zinc-950 shadow-black/30",
};

const PRESET_ICONS: Record<PresetAvatar, typeof UserRound> = {
  default: UserRound,
  east: Sparkles,
  screen: Clapperboard,
  arch: Archive,
  mixed: BookOpen,
};

const SIZE_CLASSES = {
  sm: "h-8 w-8 rounded-lg text-xs",
  md: "h-9 w-9 rounded-xl text-sm",
  lg: "h-16 w-16 rounded-2xl text-xl",
  social: "h-12 w-12 rounded-full text-base",
  xl: "h-24 w-24 rounded-full text-2xl sm:h-28 sm:w-28",
};

function getInitial(profileName: string): string {
  const trimmed = profileName.trim();
  if (!trimmed) return "B";
  return trimmed.charAt(0).toLocaleUpperCase("tr-TR");
}

export function ProfileAvatar({
  profileName,
  preferences,
  socialAvatarUrl,
  allowLocalFallback = true,
  size = "md",
  shape = "rounded",
  ariaLabel,
  imageTransform,
}: ProfileAvatarProps) {
  const effectivePreferences = preferences ?? DEFAULT_PROFILE_PREFERENCES;
  const [failedSocialUrl, setFailedSocialUrl] = useState<string>();
  const usableSocialUrl = failedSocialUrl === socialAvatarUrl ? undefined : socialAvatarUrl;
  const resolved = resolveAvatarSource({ socialAvatarUrl: usableSocialUrl, localPreferences: effectivePreferences, allowLocalFallback });
  const Icon = PRESET_ICONS[effectivePreferences.presetAvatar];
  const sizeClass = SIZE_CLASSES[size];
  const iconSizeClass = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const shapeClass = shape === "circle" ? "!rounded-full" : "";

  if (resolved.imageUrl) {
    return (
      // next/image data URL avatar için anlamlı bir kazanç sağlamıyor (boyut tipi olarak runtime'da değişken,
      // remote pattern yok). Klasik <img> bilinçli tercih.
      <span className={`${sizeClass} ${shapeClass} relative block shrink-0 overflow-hidden shadow-sm shadow-black/30 ring-1 ring-[var(--app-border-strong)]`} role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed/data URL avatar; shared transform metadata is applied directly. */}
        <img
          src={resolved.imageUrl}
          alt=""
          onError={resolved.source === "social" ? () => setFailedSocialUrl(socialAvatarUrl) : undefined}
          className="absolute inset-0 h-full w-full object-cover"
          style={resolveImageTransformStyle(imageTransform, "avatar")}
        />
      </span>
    );
  }

  return (
    <div
      className={`${sizeClass} ${shapeClass} grid shrink-0 place-items-center bg-gradient-to-br font-bold shadow-sm ${
        ACCENT_CLASSES[effectivePreferences.avatarAccent]
      }`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
    >
      {resolved.source === "preset" ? (
        <Icon className={iconSizeClass} aria-hidden="true" />
      ) : (
        getInitial(profileName)
      )}
    </div>
  );
}

export default function SidebarProfileCard({
  profileName,
  tagline,
  preferences,
  socialAvatarUrl,
  avatarTransform,
}: SidebarProfileCardProps) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3 shadow-sm shadow-black/20">
      <div className="flex items-start gap-3">
        <Link
          href="/profile"
          className="shrink-0 cursor-pointer rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
          aria-label="Profili aç"
          title="Profili aç"
        >
          <ProfileAvatar profileName={profileName} preferences={preferences} socialAvatarUrl={socialAvatarUrl} imageTransform={avatarTransform} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="min-w-0 cursor-pointer rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
              aria-label="Profili aç"
              title="Profili aç"
            >
              <p className="truncate text-[13px] font-semibold leading-tight text-[var(--app-text-primary)]">
                {profileName}
              </p>
              <p className="mt-0.5 truncate text-[10.5px] text-[var(--app-text-muted)]">{tagline}</p>
            </Link>
            <Link
              href={dashboardTabHref("settings")}
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-3)] text-[var(--app-text-muted)] transition-colors hover:border-[var(--app-accent)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
              aria-label="Ayarları aç"
              title="Ayarları aç"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-2 max-w-full overflow-hidden opacity-80">
            <CloudModeBadge compact />
          </div>
        </div>
      </div>
    </div>
  );
}
