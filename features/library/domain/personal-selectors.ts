import type { DashboardStats } from "@/lib/dashboard-stats";
import type { MediaItem, ProgressLog } from "@/lib/types";
import { withMediaClassification } from "@/lib/types";

export type PersonalCollectionKind = "progress" | "watchlist" | "favorites" | "ratings" | "notes";

export type PersonalSort =
  | "recent"
  | "lastActivity"
  | "progress"
  | "rating"
  | "ratingDesc"
  | "ratingAsc"
  | "title";

export function noteText(item: MediaItem): string {
  const personal = item.personalNotes?.trim();
  if (personal) return personal;
  const legacy = (item as MediaItem & { notes?: unknown }).notes;
  if (typeof legacy === "string") return legacy.trim();
  if (Array.isArray(legacy)) {
    return legacy
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function inCollection(item: MediaItem, kind: PersonalCollectionKind): boolean {
  if (kind === "watchlist") return item.status === "planning";
  if (kind === "favorites") return item.favorite === true;
  if (kind === "ratings") return typeof item.userRating === "number" && Number.isFinite(item.userRating);
  if (kind === "notes") return noteText(item).length > 0;
  return (
    item.status === "watching" ||
    item.status === "reading" ||
    (item.currentProgress > 0 && item.status !== "completed" && item.status !== "dropped")
  );
}

export function selectPersonalCollection({
  media,
  logs,
  kind,
  query,
  sort,
}: {
  media: readonly MediaItem[];
  logs: readonly ProgressLog[];
  kind: PersonalCollectionKind;
  query: string;
  sort: PersonalSort;
}): { all: MediaItem[]; visible: MediaItem[] } {
  const all = media.filter((item) => inCollection(item, kind));
  const normalized = query.trim().toLocaleLowerCase("tr");
  const visible = all.filter((item) => {
    if (!normalized) return true;
    return (
      item.title.toLocaleLowerCase("tr").includes(normalized) ||
      noteText(item).toLocaleLowerCase("tr").includes(normalized) ||
      (item.tags ?? []).some((tag) => tag.toLocaleLowerCase("tr").includes(normalized))
    );
  });
  const index = new Map(media.map((item, position) => [item.id, position]));
  const activity = new Map<string, number>();
  for (const log of logs) {
    activity.set(log.mediaId, Math.max(activity.get(log.mediaId) ?? 0, Date.parse(log.createdAt)));
  }
  visible.sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title, "tr");
    if (sort === "lastActivity") return (activity.get(right.id) ?? 0) - (activity.get(left.id) ?? 0);
    if (sort === "progress") {
      const ratio = (item: MediaItem) =>
        item.totalProgress > 0 ? item.currentProgress / item.totalProgress : 0;
      return ratio(right) - ratio(left);
    }
    if (sort === "ratingAsc") return (left.userRating ?? -1) - (right.userRating ?? -1);
    if (sort === "rating" || sort === "ratingDesc") {
      return (right.userRating ?? -1) - (left.userRating ?? -1);
    }
    return (index.get(right.id) ?? 0) - (index.get(left.id) ?? 0);
  });
  return { all, visible };
}

export interface LibraryStatisticsModel {
  dashboard: DashboardStats;
  averageRating: number | null;
  ratedCount: number;
  recentActivityCount: number;
  worlds: { east: number; screen: number; library: number };
  statuses: { completed: number; active: number; planning: number; paused: number; dropped: number };
  ratingCounts: { rating: number; count: number }[];
  topRated: MediaItem[];
  recentLogs: ProgressLog[];
}

export function selectLibraryStatistics(
  media: readonly MediaItem[],
  logs: readonly ProgressLog[],
  dashboard: DashboardStats,
  now: number,
): LibraryStatisticsModel {
  const rated = media.filter((item) => typeof item.userRating === "number");
  const worlds = { east: 0, screen: 0, library: 0 };
  for (const item of media) {
    const type = withMediaClassification(item).mediaType;
    if (type === "anime" || type === "manga" || type === "novel") worlds.east += 1;
    else if (type === "tv" || type === "movie") worlds.screen += 1;
    else worlds.library += 1;
  }
  return {
    dashboard,
    averageRating:
      rated.length > 0
        ? rated.reduce((total, item) => total + (item.userRating ?? 0), 0) / rated.length
        : null,
    ratedCount: rated.length,
    recentActivityCount: logs.filter(
      (log) => Date.parse(log.createdAt) >= now - 7 * 24 * 60 * 60 * 1000,
    ).length,
    worlds,
    statuses: {
      completed: media.filter((item) => item.status === "completed").length,
      active: media.filter((item) => item.status === "watching" || item.status === "reading").length,
      planning: media.filter((item) => item.status === "planning").length,
      paused: media.filter((item) => item.status === "paused").length,
      dropped: media.filter((item) => item.status === "dropped").length,
    },
    ratingCounts: Array.from({ length: 10 }, (_, index) => ({
      rating: index + 1,
      count: rated.filter((item) => item.userRating === index + 1).length,
    })),
    topRated: [...rated]
      .sort(
        (left, right) =>
          (right.userRating ?? -1) - (left.userRating ?? -1) ||
          left.title.localeCompare(right.title, "tr"),
      )
      .slice(0, 5),
    recentLogs: [...logs]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 5),
  };
}
