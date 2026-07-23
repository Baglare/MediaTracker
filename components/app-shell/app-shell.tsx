"use client";

import { ArrowLeft, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppearanceWorldScope } from "@/components/personalization/appearance-runtime";
import AppSidebar from "@/components/app-sidebar";
import AppTopbar from "@/components/app-topbar";
import type { AppNavigationId, DashboardTabId } from "@/components/app-shell/app-navigation";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import type { ImageTransform } from "@/lib/personalization/image-transform";
import type { UserProgression } from "@/lib/user-progression";
import type { WorldThemeKey } from "@/lib/personalization/types";

export type AppShellMode = "authenticated" | "public";

interface AppShellProps {
  mode: AppShellMode;
  activeNavigationId?: AppNavigationId | DashboardTabId;
  onChangeTab?: (tab: DashboardTabId) => void;
  profileName?: string;
  profileTagline?: string;
  profilePreferences?: ProfilePreferences;
  socialAvatarUrl?: string;
  avatarTransform?: ImageTransform;
  progression?: UserProgression;
  journeyTitle?: string;
  world?: WorldThemeKey;
  rightRail?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

function PublicTopbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-bg)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
          <Image src="/brand/media-tracker-mark.svg" alt="" aria-hidden="true" width={30} height={30} className="h-7 w-7" />
          <span className="font-semibold text-[var(--app-text-primary)]">MediaTracker</span>
        </Link>
        <nav aria-label="Public navigasyon" className="ml-auto flex items-center gap-2 text-sm">
          <Link href="/people" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><Users className="h-4 w-4" aria-hidden="true" />Kullanıcı ara</Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-[var(--app-text-secondary)] hover:border-[var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Uygulamaya dön</Link>
        </nav>
      </div>
    </header>
  );
}

export function AppShell({ mode, activeNavigationId = "dashboard", onChangeTab, profileName, profileTagline, profilePreferences, socialAvatarUrl, avatarTransform, progression, journeyTitle, world = "neutral", rightRail, children, contentClassName = "px-4 py-6 sm:px-6 lg:px-8 lg:py-8" }: AppShellProps) {
  if (mode === "public") {
    return (
      <AppearanceWorldScope world={world} className="app-page min-h-screen" data-app-shell="public">
        <PublicTopbar />
        <main className={`mx-auto w-full max-w-7xl ${contentClassName}`}>{children}</main>
      </AppearanceWorldScope>
    );
  }

  if (!profileName || !profileTagline || !profilePreferences || !progression || !journeyTitle || !onChangeTab) {
    throw new Error("Authenticated AppShell requires profile, progression and navigation props.");
  }

  return (
    <AppearanceWorldScope world={world} className="app-page flex min-h-screen overflow-x-clip" data-app-shell="authenticated">
      <AppSidebar activeNavigationId={activeNavigationId} onChange={onChangeTab} profileName={profileName} profileTagline={profileTagline} profilePreferences={profilePreferences} socialAvatarUrl={socialAvatarUrl} avatarTransform={avatarTransform} progression={progression} journeyTitle={journeyTitle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar activeNavigationId={activeNavigationId} onChangeTab={onChangeTab} profileName={profileName} profilePreferences={profilePreferences} socialAvatarUrl={socialAvatarUrl} avatarTransform={avatarTransform} />
        <main className={`relative min-w-0 flex-1 ${contentClassName}`}>{children}</main>
      </div>
      {rightRail}
    </AppearanceWorldScope>
  );
}
