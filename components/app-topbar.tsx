"use client";

import { Bell, ChevronRight, Settings, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  getAppNavigationItem,
  type AppNavigationId,
  type DashboardTabId,
} from "@/components/app-shell/app-navigation";
import { NotificationBadge } from "@/components/social/notification-badge";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import type { ImageTransform } from "@/lib/personalization/image-transform";
import AppTabs from "./app-tabs";
import CloudModeBadge from "./cloud-mode-badge";
import { ProfileAvatar } from "./sidebar-profile-card";

interface AppTopbarProps {
  activeNavigationId: AppNavigationId | DashboardTabId;
  onChangeTab: (tab: DashboardTabId) => void;
  profileName: string;
  profilePreferences: ProfilePreferences;
  socialAvatarUrl?: string;
  avatarTransform?: ImageTransform;
}

export default function AppTopbar({ activeNavigationId, onChangeTab, profileName, profilePreferences, socialAvatarUrl, avatarTransform }: AppTopbarProps) {
  const activeLabel = getAppNavigationItem(activeNavigationId)?.label ?? "MediaTracker";
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-bg)_82%,transparent)] backdrop-blur-md" role="banner">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-6">
        <Link href="/profile" className="flex min-w-0 items-center gap-2 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] lg:hidden" aria-label="Profili aç">
          <ProfileAvatar profileName={profileName} preferences={profilePreferences} socialAvatarUrl={socialAvatarUrl} imageTransform={avatarTransform} size="sm" />
          <Image src="/brand/media-tracker-mark.svg" alt="" aria-hidden="true" width={24} height={24} className="h-6 w-6 shrink-0 object-contain" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-[var(--app-text-primary)]">MediaTracker</span>
            <span className="block max-w-[8rem] truncate text-[10px] text-[var(--app-text-muted)] sm:max-w-[12rem]">{profileName}</span>
          </div>
        </Link>

        <div className="hidden min-w-0 items-center gap-1.5 text-[13px] text-[var(--app-text-muted)] lg:flex">
          <Link href="/" className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">MediaTracker</Link>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
          <strong className="truncate font-semibold text-[var(--app-text-primary)]">{activeLabel}</strong>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block"><CloudModeBadge /></div>
          <Link href="/people" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] text-[var(--app-text-muted)] transition-colors hover:border-[var(--app-accent)] hover:text-[var(--app-accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] lg:hidden" aria-label="Kullanıcı ara"><Users className="h-4 w-4" aria-hidden="true" /></Link>
          <Link href="/notifications" className="relative grid h-8 w-8 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] text-[var(--app-text-muted)] hover:text-[var(--app-accent-strong)] lg:hidden" aria-label="Bildirimler"><Bell className="h-4 w-4" aria-hidden="true" /><span className="absolute -right-2 -top-2"><NotificationBadge /></span></Link>
          <button type="button" onClick={() => onChangeTab("settings")} className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] lg:hidden ${activeNavigationId === "settings" ? "border-[var(--app-accent)] bg-[var(--app-selected)] text-[var(--app-accent-strong)]" : "border-[var(--app-border)] bg-[var(--app-surface-1)] text-[var(--app-text-muted)] hover:border-[var(--app-accent)]"}`} aria-label="Ayarları aç"><Settings className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>

      <div className="relative border-t border-[var(--app-border)] px-3 py-1.5 sm:px-6 sm:py-2 lg:hidden">
        <AppTabs activeNavigationId={activeNavigationId} onChange={onChangeTab} />
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-[var(--app-bg)] to-transparent" />
      </div>
    </header>
  );
}
