"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell, type AppShellMode } from "@/components/app-shell/app-shell";
import { useStartupRuntime } from "@/components/personalization/startup-runtime";
import {
  dashboardTabHref,
  parseDashboardTab,
  resolveActiveNavigation,
  type AppNavigationId,
  type DashboardTabId,
} from "@/components/app-shell/app-navigation";
import { useAuth } from "@/hooks/use-auth";
import { useXpProgression } from "@/hooks/use-xp-progression";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";
import { DEFAULT_PROFILE_PREFERENCES, loadProfilePreferences, type ProfilePreferences } from "@/lib/profile-preferences";
import { PROFILE_SUMMARY_EVENT, type OwnProfileSummary } from "@/lib/social/profile-summary";
import { calculateUserProgression } from "@/lib/user-progression";

const EMPTY_PROGRESSION = calculateUserProgression([], []);

function authFallbackName(user: ReturnType<typeof useAuth>["user"]): string {
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const value = metadata?.display_name ?? metadata?.name;
  return typeof value === "string" && value.trim() ? value.trim() : "Baglare";
}

function activeNavigation(
  pathname: string,
  tab: string | null,
  defaultTab: DashboardTabId,
): AppNavigationId | DashboardTabId {
  if (pathname === "/") return parseDashboardTab(tab, defaultTab);
  return resolveActiveNavigation(pathname) ?? "dashboard";
}

export function RouteAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const startup = useStartupRuntime();
  const auth = useAuth();
  const [localPreferences, setLocalPreferences] = useState<ProfilePreferences>(DEFAULT_PROFILE_PREFERENCES);
  const [cloudIdentity, setCloudIdentity] = useState<OwnProfileSummary>();
  const summaryUserId = useRef<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time local identity hydration.
    setLocalPreferences(loadProfilePreferences());
  }, []);

  useEffect(() => {
    const onSummary = (event: Event) => {
      const summary = (event as CustomEvent<OwnProfileSummary>).detail;
      setCloudIdentity((current) => ({ ...current, ...summary }));
      summaryUserId.current = auth.user?.id ?? null;
    };
    window.addEventListener(PROFILE_SUMMARY_EVENT, onSummary);
    return () => window.removeEventListener(PROFILE_SUMMARY_EVENT, onSummary);
  }, [auth.user?.id]);

  useEffect(() => {
    if (!auth.configured || !auth.user) {
      summaryUserId.current = null;
      return;
    }
    if (pathname === "/profile" || summaryUserId.current === auth.user.id) return;
    summaryUserId.current = auth.user.id;
    let active = true;
    fetch("/api/social/profile/summary", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("profile_summary_unavailable");
        return response.json() as Promise<OwnProfileSummary>;
      })
      .then((summary) => { if (active) setCloudIdentity(summary); })
      .catch(() => { if (active) summaryUserId.current = null; });
    return () => { active = false; };
  }, [auth.configured, auth.user, pathname]);

  const { progression } = useXpProgression(auth.user?.id ?? null, EMPTY_PROGRESSION);
  const identity = useMemo(() => resolveProfileIdentity({
    authenticated: Boolean(auth.user),
    localPreferences,
    socialProfile: cloudIdentity,
    fallbackName: authFallbackName(auth.user),
    automaticTitle: progression.title,
  }), [auth.user, cloudIdentity, localPreferences, progression.title]);

  const mode: AppShellMode = pathname.startsWith("/u/") || pathname === "/people"
    ? auth.user ? "authenticated" : "public"
    : "authenticated";

  if (mode === "public") return <AppShell mode="public">{children}</AppShell>;

  const navigateTab = (tab: DashboardTabId) => router.push(dashboardTabHref(tab));
  return (
    <AppShell
      mode="authenticated"
      activeNavigationId={activeNavigation(
        pathname,
        searchParams.get("tab"),
        startup.preferences.defaultDashboardTab,
      )}
      onChangeTab={navigateTab}
      profileName={identity.displayName}
      profileTagline={identity.tagline}
      profilePreferences={localPreferences}
      socialAvatarUrl={identity.avatarUrl}
      avatarTransform={cloudIdentity?.avatarTransform}
      progression={progression}
      journeyTitle={identity.selectedTitle || progression.title}
      contentClassName={pathname === "/" ? "p-0" : undefined}
    >
      {children}
    </AppShell>
  );
}
