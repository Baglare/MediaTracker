"use client";

import type { ReactNode } from "react";

import { AppearanceWorldScope } from "@/components/personalization/appearance-runtime";
import { PublicTopbar } from "@/components/app-shell/public-topbar";
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
  showPublicHeader?: boolean;
  fullWidthPublicContent?: boolean;
}

export function AppShell({ mode, activeNavigationId = "dashboard", onChangeTab, profileName, profileTagline, profilePreferences, socialAvatarUrl, avatarTransform, progression, journeyTitle, world = "neutral", rightRail, children, contentClassName, showPublicHeader = true, fullWidthPublicContent = false }: AppShellProps) {
  const resolvedContentClassName = contentClassName ?? "app-content";
  if (mode === "public") {
    return (
      <AppearanceWorldScope world={world} className="app-page min-h-screen" data-app-shell="public">
        {showPublicHeader && <PublicTopbar />}
        <main className={`mx-auto w-full ${fullWidthPublicContent ? "max-w-none" : "max-w-7xl"} ${resolvedContentClassName}`}>{children}</main>
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
        <main className={`relative min-w-0 flex-1 ${resolvedContentClassName}`}>{children}</main>
      </div>
      {rightRail}
    </AppearanceWorldScope>
  );
}
