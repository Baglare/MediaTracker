import type { MediaItem, ProgressLog } from "./types";
import type {
  LocalDatasetOrigin,
  StorageReadResult,
  StorageReadStatus,
} from "./local-data-storage";

export type LibraryIntegrity =
  | "pending"
  | "valid"
  | "corrupt"
  | "owner_mismatch"
  | "unsupported_version"
  | "migration_failed"
  | "storage_unavailable";

export interface LibraryHydrationResult {
  integrity: Exclude<LibraryIntegrity, "pending">;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  usedDemoData: boolean;
  datasetOrigin: LocalDatasetOrigin;
  requiresInitialWrite: boolean;
  mediaReadStatus: StorageReadStatus;
  progressReadStatus: StorageReadStatus;
  issues: string[];
}

export type XpFullSyncBlockReason =
  | "library_data_unavailable"
  | "library_data_corrupt"
  | "library_migration_required";

export type XpFullSyncGuard =
  | { allowed: true; items: MediaItem[] }
  | { allowed: false; reason: XpFullSyncBlockReason };

function blockingIntegrity(
  status: StorageReadStatus,
): Exclude<LibraryIntegrity, "pending" | "valid"> | null {
  if (status === "corrupt") return "corrupt";
  if (status === "owner_mismatch") return "owner_mismatch";
  if (status === "unsupported_version") return "unsupported_version";
  if (status === "migration_failed") return "migration_failed";
  if (status === "storage_unavailable") return "storage_unavailable";
  return null;
}

export function resolveLibraryHydration(args: {
  media: StorageReadResult<MediaItem[]>;
  progressLogs: StorageReadResult<ProgressLog[]>;
  demoItems: MediaItem[];
  allowDemoData?: boolean;
}): LibraryHydrationResult {
  const blocked = blockingIntegrity(args.media.status) ?? blockingIntegrity(args.progressLogs.status);
  const issues = [...args.media.issues, ...args.progressLogs.issues].map((entry) => entry.message);
  if (blocked) {
    return {
      integrity: blocked,
      mediaItems: [],
      progressLogs: [],
      usedDemoData: false,
      datasetOrigin: "user",
      requiresInitialWrite: false,
      mediaReadStatus: args.media.status,
      progressReadStatus: args.progressLogs.status,
      issues,
    };
  }

  const mediaMissing = args.media.status === "missing";
  const logsMissing = args.progressLogs.status === "missing";
  const useDemoData = mediaMissing && args.allowDemoData !== false;
  const datasetOrigin = useDemoData
    ? "demo"
    : args.media.datasetOrigin ?? args.progressLogs.datasetOrigin ?? "user";
  return {
    integrity: "valid",
    mediaItems: useDemoData ? args.demoItems : args.media.data ?? [],
    progressLogs: args.progressLogs.data ?? [],
    usedDemoData: useDemoData,
    datasetOrigin,
    requiresInitialWrite: mediaMissing || logsMissing,
    mediaReadStatus: args.media.status,
    progressReadStatus: args.progressLogs.status,
    issues,
  };
}

export function guardXpFullSync(
  read: StorageReadResult<MediaItem[]>,
): XpFullSyncGuard {
  if (read.status === "valid" || read.status === "empty") {
    return { allowed: true, items: read.data ?? [] };
  }
  if (read.status === "corrupt") {
    return { allowed: false, reason: "library_data_corrupt" };
  }
  if (read.status === "unsupported_version" || read.status === "migration_failed") {
    return { allowed: false, reason: "library_migration_required" };
  }
  return { allowed: false, reason: "library_data_unavailable" };
}

export function materializeDemoDatasetMutation(
  demoItems: MediaItem[],
  nextItems: MediaItem[],
): MediaItem[] {
  const demoById = new Map(demoItems.map((item) => [item.id, JSON.stringify(item)]));
  return nextItems.filter((item) => {
    const original = demoById.get(item.id);
    return original === undefined || original !== JSON.stringify(item);
  });
}
