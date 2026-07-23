export const LAYOUT_PREFERENCES_VERSION = 1 as const;

export interface LayoutWidgetPreference<TId extends string> {
  id: TId;
  visible: boolean;
  order: number;
}

export interface LayoutPreferences<
  TDashboardId extends string = DashboardWidgetId,
  TRightRailId extends string = RightRailWidgetId,
> {
  version: typeof LAYOUT_PREFERENCES_VERSION;
  dashboard: Array<LayoutWidgetPreference<TDashboardId>>;
  rightRail: Array<LayoutWidgetPreference<TRightRailId>>;
}

export const DASHBOARD_WIDGET_IDS = [
  "summary",
  "continue",
  "recent-activity",
  "near-completion",
  "world-distribution",
  "high-rated",
  "status-distribution",
  "favorite-showcase",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export const RIGHT_RAIL_WIDGET_IDS = [
  "overallProgress",
  "dailyGoal",
  "suggestedContinue",
  "recentActivities",
  "upcomingEpisodes",
  "nearCompletion",
  "favoriteShowcase",
  "ratingSummary",
  "worldDistribution",
  "statusDistribution",
  "journeyMini",
  "plannedItems",
  "pausedItems",
  "notedItems",
] as const;

export type RightRailWidgetId = (typeof RIGHT_RAIL_WIDGET_IDS)[number];

export type LayoutSurface = "dashboard" | "rightRail";
export type LayoutMove = "up" | "down" | "top" | "bottom";

export interface WidgetDefinition<TId extends string> {
  id: TId;
  label: string;
  description: string;
  defaultVisible: boolean;
  defaultOrder: number;
  required?: boolean;
  allowedSurfaces: readonly LayoutSurface[];
  desktopSpan?: "full" | "wide" | "narrow";
  mobileOrder?: number;
  dataRequirement?: string;
  lazy?: boolean;
}
