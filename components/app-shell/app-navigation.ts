import {
  Activity,
  BarChart3,
  Bell,
  Calendar,
  Compass,
  Heart,
  LayoutDashboard,
  Library,
  ListChecks,
  NotebookPen,
  Send,
  Settings,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DashboardTabId =
  | "dashboard"
  | "library"
  | "discover"
  | "calendar"
  | "progress"
  | "watchlist"
  | "favorites"
  | "ratings"
  | "notes"
  | "stats"
  | "profile"
  | "ai"
  | "activity"
  | "settings";

export type AppNavigationId =
  | Exclude<DashboardTabId, "profile" | "progress">
  | "profile"
  | "feed"
  | "recommendations"
  | "notifications"
  | "people"
  | "progression"
  | "goals";

export type AppNavigationSection = "general" | "social" | "personal" | "assistants";

export interface AppNavigationItem {
  id: AppNavigationId;
  label: string;
  icon: LucideIcon;
  section: AppNavigationSection;
  authRequired: boolean;
  destination:
    | { kind: "route"; href: string; activeMatch: "exact" | "prefix" }
    | { kind: "dashboard-tab"; tab: DashboardTabId; href: string; activeMatch: "exact" };
  unread?: boolean;
  badge?: string;
}

export const APP_NAVIGATION_SECTION_LABELS: Record<AppNavigationSection, string> = {
  general: "Genel",
  social: "Sosyal",
  personal: "Kişisel",
  assistants: "Yardımcılar",
};

export function dashboardTabHref(tab: DashboardTabId): string {
  return `/?tab=${tab}`;
}

function dashboardItem(
  id: Exclude<DashboardTabId, "profile" | "progress">,
  label: string,
  icon: LucideIcon,
  section: AppNavigationSection,
  badge?: string,
): AppNavigationItem {
  return {
    id,
    label,
    icon,
    section,
    authRequired: false,
    destination: { kind: "dashboard-tab", tab: id, href: dashboardTabHref(id), activeMatch: "exact" },
    ...(badge ? { badge } : {}),
  };
}

export const APP_NAVIGATION_ITEMS: readonly AppNavigationItem[] = [
  dashboardItem("dashboard", "Dashboard", LayoutDashboard, "general"),
  dashboardItem("library", "Kütüphanem", Library, "general"),
  dashboardItem("discover", "Keşfet", Compass, "general"),
  dashboardItem("calendar", "Takvim", Calendar, "general"),
  { id: "profile", label: "Profil", icon: UserRound, section: "personal", authRequired: false, destination: { kind: "route", href: "/profile", activeMatch: "exact" } },
  { id: "feed", label: "Akış", icon: Activity, section: "social", authRequired: true, destination: { kind: "route", href: "/feed", activeMatch: "prefix" } },
  { id: "recommendations", label: "Öneriler", icon: Send, section: "social", authRequired: true, destination: { kind: "route", href: "/recommendations", activeMatch: "prefix" } },
  { id: "notifications", label: "Bildirimler", icon: Bell, section: "social", authRequired: true, unread: true, destination: { kind: "route", href: "/notifications", activeMatch: "prefix" } },
  { id: "people", label: "Kullanıcı Ara", icon: Users, section: "social", authRequired: false, destination: { kind: "route", href: "/people", activeMatch: "prefix" } },
  { id: "progression", label: "İlerleme", icon: TrendingUp, section: "personal", authRequired: true, destination: { kind: "route", href: "/progression", activeMatch: "prefix" } },
  { id: "goals", label: "Hedefler", icon: Target, section: "personal", authRequired: false, destination: { kind: "route", href: "/goals", activeMatch: "prefix" } },
  dashboardItem("watchlist", "İzleme Listem", ListChecks, "personal"),
  dashboardItem("favorites", "Favorilerim", Heart, "personal"),
  dashboardItem("ratings", "Puanlamalarım", Star, "personal"),
  dashboardItem("notes", "Notlarım", NotebookPen, "personal"),
  dashboardItem("stats", "İstatistikler", BarChart3, "personal"),
  dashboardItem("ai", "AI Danışman", Sparkles, "assistants", "Beta"),
  dashboardItem("activity", "Aktivite", Activity, "assistants"),
  dashboardItem("settings", "Ayarlar", Settings, "assistants"),
] as const;

export function parseDashboardTab(
  value: string | null,
  fallback: DashboardTabId = "dashboard",
): DashboardTabId {
  const item = APP_NAVIGATION_ITEMS.find(
    (candidate) => candidate.destination.kind === "dashboard-tab" && candidate.destination.tab === value,
  );
  return item?.destination.kind === "dashboard-tab" ? item.destination.tab : fallback;
}

export const APP_NAVIGATION_SECTIONS: readonly AppNavigationSection[] = [
  "general",
  "social",
  "personal",
  "assistants",
] as const;

export function getAppNavigationItem(id: AppNavigationId | DashboardTabId): AppNavigationItem | undefined {
  return APP_NAVIGATION_ITEMS.find((item) => item.id === id);
}

export function resolveActiveNavigation(pathname: string): AppNavigationId | undefined {
  if (pathname.startsWith("/u/")) return undefined;
  return APP_NAVIGATION_ITEMS.find((item) => {
    if (item.destination.kind !== "route") return pathname === "/" && item.id === "dashboard";
    return item.destination.activeMatch === "exact"
      ? pathname === item.destination.href
      : pathname === item.destination.href || pathname.startsWith(`${item.destination.href}/`);
  })?.id;
}
