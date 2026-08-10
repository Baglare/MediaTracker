import type { EastSubFilter, ThemeFilter } from "@/components/media-filters";
import type { LibrarySort } from "@/components/library-control-bar";
import { groupMediaItems, type MediaItemGroup } from "@/lib/series-group";
import type { MediaItem, MediaStatus, MediaType, ProgressLog } from "@/lib/types";
import { withMediaClassification } from "@/lib/types";

export interface LibraryFilterInput {
  query: string;
  type: MediaType | "all";
  status: MediaStatus | "active" | "all";
  world: ThemeFilter;
  eastSubtype: EastSubFilter;
}

export interface LibraryReadModel {
  filtered: MediaItem[];
  continueItems: MediaItem[];
  seriesGroups: MediaItemGroup[];
  singletonItems: MediaItem[];
}

export function matchesLibraryWorld(
  item: MediaItem,
  world: ThemeFilter,
  eastSubtype: EastSubFilter,
): boolean {
  if (world === "all") return true;
  const classification = withMediaClassification(item);
  if (world === "east") {
    const east = classification.mediaType === "anime"
      || classification.mediaType === "manga"
      || classification.mediaType === "novel";
    return east && (eastSubtype === "all" || classification.mediaType === eastSubtype);
  }
  if (world === "screen") {
    return classification.mediaType === "tv" || classification.mediaType === "movie";
  }
  return classification.mediaType === "book";
}

export function filterLibraryMedia(
  media: readonly MediaItem[],
  filters: LibraryFilterInput,
): MediaItem[] {
  const query = filters.query.trim().toLocaleLowerCase("tr");
  return media.filter((item) => {
    const searchMatches = !query || item.title.toLocaleLowerCase("tr").includes(query);
    const typeMatches = filters.type === "all" || item.type === filters.type;
    const statusMatches = filters.status === "all"
      || (filters.status === "active"
        ? item.status === "watching" || item.status === "reading"
        : item.status === filters.status);
    return searchMatches
      && typeMatches
      && statusMatches
      && matchesLibraryWorld(item, filters.world, filters.eastSubtype);
  });
}

export function lastProgressByMedia(logs: readonly ProgressLog[]): ReadonlyMap<string, number> {
  const values = new Map<string, number>();
  for (const log of logs) {
    const timestamp = new Date(log.createdAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    if (timestamp > (values.get(log.mediaId) ?? 0)) values.set(log.mediaId, timestamp);
  }
  return values;
}

export function isContinuingMedia(item: MediaItem): boolean {
  if (item.status === "watching" || item.status === "reading") return true;
  return item.currentProgress > 0 && item.status !== "completed" && item.status !== "dropped";
}

export function sortLibraryMedia(
  items: readonly MediaItem[],
  sort: LibrarySort,
  source: readonly MediaItem[],
  lastActivity: ReadonlyMap<string, number>,
): MediaItem[] {
  const sourceIndex = new Map(source.map((item, index) => [item.id, index]));
  const progressRatio = (item: MediaItem) =>
    item.totalProgress > 0 ? item.currentProgress / item.totalProgress : -1;
  return [...items].sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title, "tr");
    if (sort === "lastActivity") {
      return (lastActivity.get(right.id) ?? 0) - (lastActivity.get(left.id) ?? 0);
    }
    if (sort === "progress") return progressRatio(right) - progressRatio(left);
    if (sort === "rating") return (right.userRating ?? -1) - (left.userRating ?? -1);
    return (sourceIndex.get(right.id) ?? 0) - (sourceIndex.get(left.id) ?? 0);
  });
}

export function selectLibraryReadModel({
  media,
  logs,
  filters,
  sort,
}: {
  media: readonly MediaItem[];
  logs: readonly ProgressLog[];
  filters: LibraryFilterInput;
  sort: LibrarySort;
}): LibraryReadModel {
  const filtered = filterLibraryMedia(media, filters);
  const grouped = groupMediaItems(filtered);
  const lastActivity = lastProgressByMedia(logs);
  const seriesGroups = grouped.filter((group) => group.isGroup && group.items.length >= 2);
  const singletonItems = sortLibraryMedia(
    grouped
      .filter((group) => !(group.isGroup && group.items.length >= 2))
      .map((group) => group.items[0]),
    sort,
    media,
    lastActivity,
  );
  const continueItems = filtered
    .filter(isContinuingMedia)
    .sort((left, right) => (lastActivity.get(right.id) ?? 0) - (lastActivity.get(left.id) ?? 0))
    .slice(0, 6);
  return { filtered, continueItems, seriesGroups, singletonItems };
}

export function resolveWorldScope(
  activeTab: string,
  world: ThemeFilter,
): "neutral" | "east" | "screen" | "arch" {
  if (activeTab === "settings") return "neutral";
  if (world === "east") return "east";
  if (world === "screen") return "screen";
  if (world === "library") return "arch";
  return "neutral";
}

export function shouldShowDashboardRightRail(activeTab: string): boolean {
  return !["dashboard", "discover", "ai", "settings"].includes(activeTab);
}
