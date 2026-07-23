import type { MediaItem, ProgressLog } from "@/lib/types";

export interface CalendarReadModel {
  recentLogs: ProgressLog[];
  logsByDate: ReadonlyMap<string, ProgressLog[]>;
  plannedItems: MediaItem[];
  activeItems: MediaItem[];
}

export function selectCalendarReadModel(
  media: readonly MediaItem[],
  logs: readonly ProgressLog[],
): CalendarReadModel {
  const recentLogs = [...logs]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 20);
  const logsByDate = new Map<string, ProgressLog[]>();
  for (const log of recentLogs) {
    const key = new Date(log.createdAt).toLocaleDateString("tr-TR");
    logsByDate.set(key, [...(logsByDate.get(key) ?? []), log]);
  }
  return {
    recentLogs,
    logsByDate,
    plannedItems: media.filter((item) => item.status === "planning"),
    activeItems: media
      .filter((item) => item.status === "watching" || item.status === "reading"),
  };
}
