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
import { useOwnedProfilePreferences } from "@/hooks/use-owned-profile-preferences";
import { useXpProgression } from "@/hooks/use-xp-progression";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";
import { PROFILE_SUMMARY_EVENT, type OwnProfileSummary } from "@/lib/social/profile-summary";
import { loadOwnProfileCache, readOwnProfileCache, updateOwnProfileCache } from "@/lib/social/own-profile-cache";
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

  if (pathname === "/dev/recommendation-annotation") return children;

  return <ProductRouteAppShell pathname={pathname}>{children}</ProductRouteAppShell>;
}

function ProductRouteAppShell({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const startup = useStartupRuntime();
  const auth = useAuth();
  const {
    profilePreferences: localPreferences,
  } = useOwnedProfilePreferences();
  const [cloudIdentity, setCloudIdentity] = useState<OwnProfileSummary>();
  const [cloudOwnerId, setCloudOwnerId] = useState<string | null>(null);
  const summaryUserId = useRef<string | null>(null);

  useEffect(() => {
    const onSummary = (event: Event) => {
      if (!auth.user) return;
      const summary = (event as CustomEvent<OwnProfileSummary>).detail;
      updateOwnProfileCache(auth.user.id, summary);
      setCloudIdentity((current) => ({ ...current, ...summary }));
      setCloudOwnerId(auth.user.id);
      summaryUserId.current = auth.user?.id ?? null;
    };
    window.addEventListener(PROFILE_SUMMARY_EVENT, onSummary);
    return () => window.removeEventListener(PROFILE_SUMMARY_EVENT, onSummary);
  }, [auth.user]);

  useEffect(() => {
    if (!auth.configured || !auth.user) {
      summaryUserId.current = null;
      queueMicrotask(() => {
        setCloudOwnerId(null);
        setCloudIdentity(undefined);
      });
      return;
    }
    if (pathname === "/profile" || summaryUserId.current === auth.user.id) return;
    summaryUserId.current = auth.user.id;
    const ownerId = auth.user.id;
    const cached = readOwnProfileCache<OwnProfileSummary>(ownerId, "summary");
    queueMicrotask(() => {
      setCloudOwnerId(ownerId);
      setCloudIdentity(cached);
    });
    let active = true;
    loadOwnProfileCache({
      ownerId,
      resource: "summary",
      fetcher: async () => {
        const response = await fetch("/api/social/profile/summary", { cache: "no-store" });
        if (!response.ok) throw new Error("profile_summary_unavailable");
        return response.json() as Promise<OwnProfileSummary>;
      },
    })
      .then((summary) => { if (active) setCloudIdentity(summary); })
      .catch(() => { if (active) summaryUserId.current = null; });
    return () => { active = false; };
  }, [auth.configured, auth.user, pathname]);

  const { progression } = useXpProgression(auth.user?.id ?? null, EMPTY_PROGRESSION);
  const visibleCloudIdentity = auth.user
    && cloudOwnerId === auth.user.id
    ? cloudIdentity
    : undefined;
  const identity = useMemo(() => resolveProfileIdentity({
    authenticated: Boolean(auth.user),
    localPreferences,
    socialProfile: visibleCloudIdentity,
    fallbackName: authFallbackName(auth.user),
    automaticTitle: progression.title,
  }), [auth.user, localPreferences, progression.title, visibleCloudIdentity]);

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
      avatarTransform={visibleCloudIdentity?.avatarTransform}
      progression={progression}
      journeyTitle={identity.selectedTitle || progression.title}
      contentClassName={pathname === "/" ? "p-0" : undefined}
    >
      {children}
    </AppShell>
  );
}
