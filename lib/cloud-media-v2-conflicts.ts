import type { LocalOwnerScope } from "./local-owner-scope";
import {
  loadSyncQueue,
  type SyncQueueStorageLike,
} from "./sync-queue";
import { getSupabaseBrowserClient } from "./supabase/client";
import { fetchCloudMediaItems } from "./supabase/cloud-repository";
import type {
  CloudMediaV2ConflictReason,
  MediaItem,
  SyncEntity,
  SyncQueueItem,
} from "./types";

export type CloudV2ConflictAction =
  | "use-remote"
  | "retry-local"
  | "defer"
  | "keep-deleted"
  | "restore"
  | "retry-parent-first";

export interface CloudV2ConflictCard {
  itemId: string;
  entity: SyncEntity;
  recordId: string;
  reason: CloudMediaV2ConflictReason;
  title: string;
  description: string;
  manualOnly: boolean;
  actions: CloudV2ConflictAction[];
  expectedRevision: number;
  serverRevision: number;
  serverDeletedAt: string | null;
  relatedMediaId?: string;
  safeLocalSummary: {
    title?: string;
    type?: string;
    status?: string;
    progress?: string;
  };
}

export interface CloudV2RemoteSummary {
  recordId: string;
  revision: number;
  deletedAt: string | null;
  title?: string;
  status?: string;
  progress?: string;
}

export type CloudV2RemoteSummaryResult =
  | { ok: true; summary: CloudV2RemoteSummary }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordIdOf(item: SyncQueueItem): string {
  return isRecord(item.payload) && typeof item.payload.id === "string"
    ? item.payload.id
    : "";
}

function safeLocalSummary(
  item: SyncQueueItem,
): CloudV2ConflictCard["safeLocalSummary"] {
  if (!isRecord(item.payload)) return {};
  const currentProgress = typeof item.payload.currentProgress === "number"
    ? item.payload.currentProgress
    : typeof item.payload.newProgress === "number"
      ? item.payload.newProgress
      : undefined;
  const totalProgress = typeof item.payload.totalProgress === "number"
    ? item.payload.totalProgress
    : undefined;
  return {
    ...(typeof item.payload.title === "string"
      ? { title: item.payload.title }
      : typeof item.payload.mediaTitle === "string"
        ? { title: item.payload.mediaTitle }
        : {}),
    ...(typeof item.payload.type === "string"
      ? { type: item.payload.type }
      : typeof item.payload.mediaType === "string"
        ? { type: item.payload.mediaType }
        : {}),
    ...(typeof item.payload.status === "string"
      ? { status: item.payload.status }
      : {}),
    ...(currentProgress !== undefined
      ? {
          progress: totalProgress === undefined
            ? String(currentProgress)
            : `${currentProgress}/${totalProgress}`,
        }
      : {}),
  };
}

export function describeCloudV2Conflict(
  item: SyncQueueItem,
): CloudV2ConflictCard | null {
  const conflict = item.blockedConflict;
  const recordId = recordIdOf(item);
  if (!conflict || !recordId) return null;
  const common = {
    itemId: item.id,
    entity: item.entity,
    recordId,
    reason: conflict.reason,
    expectedRevision: item.expectedRevision ?? 0,
    serverRevision: conflict.serverRevision,
    serverDeletedAt: conflict.serverDeletedAt,
    ...(isRecord(item.payload) && typeof item.payload.mediaId === "string"
      ? { relatedMediaId: item.payload.mediaId }
      : {}),
    safeLocalSummary: safeLocalSummary(item),
  };
  switch (conflict.reason) {
    case "revision_mismatch":
      return {
        ...common,
        title: "Bulut sürümü daha güncel",
        description:
          "Yerel değişiklik daha eski bir sürüm üzerinden hazırlandı. Hiçbir veri otomatik ezilmedi.",
        manualOnly: false,
        actions: ["use-remote", "retry-local", "defer"],
      };
    case "tombstoned":
      return {
        ...common,
        title: "Kayıt bulutta silinmiş",
        description:
          "Eski bir yerel değişiklik silinmiş Cloud kaydını otomatik olarak geri getiremez.",
        manualOnly: false,
        actions: ["keep-deleted", "restore", "defer"],
      };
    case "media_target_unavailable":
      return {
        ...common,
        title: "İlerleme için üst medya bulunamadı",
        description:
          "İlerleme işlemi, aynı hesaba ait üst medya Cloud'da hazır olmadan gönderilemez.",
        manualOnly: false,
        actions: ["retry-parent-first", "defer"],
      };
    case "record_id_unavailable":
      return {
        ...common,
        title: "Kayıt kimliği Cloud'da kullanılamıyor",
        description:
          "Eklemeli şemadaki genel birincil anahtar sınırı nedeniyle bu kayıt kimliği başka bir sahip satırıyla çakışıyor. Otomatik kimlik değişimi veya birleştirme yapılmaz.",
        manualOnly: true,
        actions: ["defer"],
      };
    default:
      return {
        ...common,
        title: "Cloud işlemi kullanıcı kararı bekliyor",
        description:
          "Bu çakışma otomatik çözülemez. Yerel veri korunarak işlem engellenmiş durumda bırakıldı.",
        manualOnly: true,
        actions: ["defer"],
      };
  }
}

export function listCloudV2Conflicts(
  scope: LocalOwnerScope | null,
  storage?: SyncQueueStorageLike | null,
): CloudV2ConflictCard[] {
  if (!scope || scope.kind !== "user") return [];
  return loadSyncQueue(scope, storage)
    .map(describeCloudV2Conflict)
    .filter((entry): entry is CloudV2ConflictCard => entry !== null);
}

interface RemoteQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export async function fetchCloudV2RemoteSummary(
  card: CloudV2ConflictCard,
): Promise<CloudV2RemoteSummaryResult> {
  const client = getSupabaseBrowserClient() as unknown as RemoteQueryClient | null;
  if (!client) {
    return { ok: false, message: "Cloud bağlantısı yapılandırılmadı." };
  }
  const table = card.entity === "media_item" ? "media_items" : "progress_logs";
  const columns = card.entity === "media_item"
    ? "id,title,status,current_progress,total_progress,revision,deleted_at"
    : "id,media_title,new_progress,revision,deleted_at";
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("id", card.recordId)
    .maybeSingle();
  if (error) {
    return { ok: false, message: "Cloud kayıt özeti alınamadı." };
  }
  if (!isRecord(data)) {
    return {
      ok: false,
      message: card.serverDeletedAt
        ? "Cloud tombstone özeti erişilebilir, aktif kayıt payload'ı bulunmuyor."
        : "Cloud kaydı bulunamadı.",
    };
  }
  const revision = data.revision;
  const deletedAt = data.deleted_at;
  if (
    typeof revision !== "number"
    || !Number.isSafeInteger(revision)
    || revision < 0
    || (
      deletedAt !== null
      && (
        typeof deletedAt !== "string"
        || !Number.isFinite(Date.parse(deletedAt))
      )
    )
  ) {
    return { ok: false, message: "Cloud kayıt özeti doğrulanamadı." };
  }
  const currentProgress = typeof data.current_progress === "number"
    ? data.current_progress
    : typeof data.new_progress === "number"
      ? data.new_progress
      : undefined;
  const totalProgress = typeof data.total_progress === "number"
    ? data.total_progress
    : undefined;
  return {
    ok: true,
    summary: {
      recordId: card.recordId,
      revision,
      deletedAt,
      ...(typeof data.title === "string"
        ? { title: data.title }
        : typeof data.media_title === "string"
          ? { title: data.media_title }
          : {}),
      ...(typeof data.status === "string" ? { status: data.status } : {}),
      ...(currentProgress !== undefined
        ? {
            progress: totalProgress === undefined
              ? String(currentProgress)
              : `${currentProgress}/${totalProgress}`,
          }
        : {}),
    },
  };
}

export async function fetchCloudMediaForConflict(
  userId: string,
  recordId: string,
): Promise<{ ok: true; item: MediaItem } | { ok: false; message: string }> {
  const result = await fetchCloudMediaItems(userId);
  if (!result.ok) return { ok: false, message: result.error };
  const item = result.data.find((entry) => entry.id === recordId);
  return item
    ? { ok: true, item }
    : { ok: false, message: "Aktif cloud media kaydı bulunamadı." };
}
