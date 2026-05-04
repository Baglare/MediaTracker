import { MediaItem, ProgressLog } from "./types";

export interface DashboardStats {
  totalItems: number;
  completedItems: number;
  inProgressItems: number;
  planningItems: number;
  droppedItems: number;
  pausedItems: number;
  favoriteItems: number;
  
  // Weekly Activity
  logsThisWeek: number;
  
  // Nearing Completion (Current progress is >= 80% of total)
  nearingCompletion: MediaItem[];
  
  // Dormant Items (In progress, but no logs in the last 14 days)
  dormantItems: MediaItem[];
  
  // Recent Activity
  recentLogs: ProgressLog[];
}

export function calculateDashboardStats(
  mediaList: MediaItem[],
  progressLogs: ProgressLog[]
): DashboardStats {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const stats: DashboardStats = {
    totalItems: mediaList.length,
    completedItems: mediaList.filter((m) => m.status === "completed").length,
    inProgressItems: mediaList.filter((m) => m.status === "watching" || m.status === "reading").length,
    planningItems: mediaList.filter((m) => m.status === "planning").length,
    droppedItems: mediaList.filter((m) => m.status === "dropped").length,
    pausedItems: mediaList.filter((m) => m.status === "paused").length,
    favoriteItems: mediaList.filter((m) => m.favorite).length,
    logsThisWeek: 0,
    nearingCompletion: [],
    dormantItems: [],
    recentLogs: [],
  };

  // 1. Calculate logs this week and recent logs
  const sortedLogs = [...progressLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  stats.recentLogs = sortedLogs.slice(0, 10); // Top 10 recent
  stats.logsThisWeek = sortedLogs.filter(
    (l) => new Date(l.createdAt) >= oneWeekAgo
  ).length;

  // 2. Identify Nearing Completion and Dormant Items
  const currentItems = mediaList.filter((m) => m.status === "watching" || m.status === "reading");
  
  for (const item of currentItems) {
    // Nearing completion (>= 80% or missing just a few)
    if (item.totalProgress > 1 && item.currentProgress > 0) {
      const ratio = item.currentProgress / item.totalProgress;
      if (ratio >= 0.8 && ratio < 1) {
        stats.nearingCompletion.push(item);
      }
    }

    // Dormant items check
    const itemLogs = sortedLogs.filter((l) => l.mediaId === item.id);
    if (itemLogs.length > 0) {
      const lastLogDate = new Date(itemLogs[0].createdAt);
      if (lastLogDate < twoWeeksAgo) {
        stats.dormantItems.push(item);
      }
    } else {
      // No logs at all and it's in progress
      stats.dormantItems.push(item);
    }
  }

  // Sort them
  stats.nearingCompletion.sort((a, b) => {
    const ratioA = a.currentProgress / a.totalProgress;
    const ratioB = b.currentProgress / b.totalProgress;
    return ratioB - ratioA; // closest to 100% first
  });

  return stats;
}
