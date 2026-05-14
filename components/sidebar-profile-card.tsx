"use client";

import { Archive, BookOpen, Clapperboard, Settings, Sparkles, UserRound } from "lucide-react";
import type { AvatarAccent, PresetAvatar, ProfilePreferences } from "@/lib/profile-preferences";
import CloudModeBadge from "./cloud-mode-badge";

interface SidebarProfileCardProps {
  profileName: string;
  tagline: string;
  preferences: ProfilePreferences;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

interface ProfileAvatarProps {
  profileName: string;
  preferences: ProfilePreferences;
  size?: "sm" | "md" | "lg";
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
};

function getInitial(profileName: string): string {
  const trimmed = profileName.trim();
  if (!trimmed) return "B";
  return trimmed.charAt(0).toLocaleUpperCase("tr-TR");
}

export function ProfileAvatar({
  profileName,
  preferences,
  size = "md",
}: ProfileAvatarProps) {
  const Icon = PRESET_ICONS[preferences.presetAvatar];
  const sizeClass = SIZE_CLASSES[size];
  const iconSizeClass = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";

  if (preferences.avatarMode === "image" && preferences.avatarImageDataUrl) {
    return (
      // next/image data URL avatar için anlamlı bir kazanç sağlamıyor (boyut tipi olarak runtime'da değişken,
      // remote pattern yok). Klasik <img> bilinçli tercih.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preferences.avatarImageDataUrl}
        alt=""
        className={`${sizeClass} shrink-0 object-cover shadow-sm shadow-black/30 ring-1 ring-zinc-700/60`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} grid shrink-0 place-items-center bg-gradient-to-br font-bold shadow-sm ${
        ACCENT_CLASSES[preferences.avatarAccent]
      }`}
    >
      {preferences.avatarMode === "preset" ? (
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
  onOpenProfile,
  onOpenSettings,
}: SidebarProfileCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 p-3 shadow-sm shadow-black/20">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpenProfile}
          className="shrink-0 cursor-pointer rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
          aria-label="Profili aç"
          title="Profili aç"
        >
          <ProfileAvatar profileName={profileName} preferences={preferences} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenProfile}
              className="min-w-0 cursor-pointer rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
              aria-label="Profili aç"
              title="Profili aç"
            >
              <p className="truncate text-[13px] font-semibold leading-tight text-zinc-50">
                {profileName}
              </p>
              <p className="mt-0.5 truncate text-[10.5px] text-zinc-500">{tagline}</p>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-zinc-800/70 bg-zinc-950/35 text-zinc-500 transition-colors hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-amber-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35"
              aria-label="Ayarları aç"
              title="Ayarları aç"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 max-w-full overflow-hidden opacity-80">
            <CloudModeBadge compact />
          </div>
        </div>
      </div>
    </div>
  );
}
