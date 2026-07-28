import { getCanonicalMediaIdentity } from "./media-identity";
import type {
  CloudMediaV2ConflictReason,
  MediaItem,
  ProgressLog,
  SyncQueueItem,
} from "./types";
import { getSupabaseBrowserClient } from "./supabase/client";
import { toMediaRow, toProgressLogRow } from "./supabase/mapping";

export const CLOUD_MEDIA_V2_FEATURE_FLAG =
  "NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED" as const;

const appliedReasons = new Set([
  "created",
  "updated",
  "deleted",
  "restored",
  "unchanged",
]);
const conflictReasons = new Set<CloudMediaV2ConflictReason>([
  "revision_mismatch",
  "tombstoned",
  "record_id_unavailable",
  "media_target_unavailable",
  "not_found",
  "already_tombstoned",
  "not_tombstoned",
  "immutable_log_conflict",
]);

export type CloudMediaV2DispatchResult =
  | {
      kind: "applied";
      reason: string;
      revision: number;
      deletedAt: string | null;
    }
  | {
      kind: "conflict";
      reason: CloudMediaV2ConflictReason;
      revision: number;
      deletedAt: string | null;
    }
  | { kind: "retryable-error"; error: string }
  | { kind: "invalid-response"; error: string };

export interface CloudMediaV2RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCloudMediaV2Enabled(
  value: string | undefined = process.env.NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED,
): boolean {
  return value === "true";
}

export function buildCloudMediaV2Payload(
  userId: string,
  item: MediaItem,
): Record<string, unknown> {
  const row = toMediaRow(userId, item);
  const identity = getCanonicalMediaIdentity(item);
  return {
    title: row.title,
    type: row.type,
    status: row.status,
    current_progress: row.current_progress,
    total_progress: row.total_progress,
    external_source: row.external_source,
    external_id: row.external_id,
    cover_url: row.cover_url,
    backdrop_url: row.backdrop_url,
    overview: row.overview,
    release_year: row.release_year,
    favorite: row.favorite,
    user_rating: row.user_rating,
    tags: row.tags,
    personal_notes: row.personal_notes,
    metadata: row.metadata,
    identity_status: identity ? "resolved" : "unresolved",
    ...(identity
      ? {
          canonical_version: identity.version,
          canonical_key: identity.key,
          canonical_source: identity.source,
          canonical_namespace: identity.namespace,
          canonical_stable_id: identity.externalId ?? identity.manualId,
        }
      : {}),
  };
}

export function buildCloudProgressV2Payload(
  userId: string,
  log: ProgressLog,
): Record<string, unknown> {
  const row = toProgressLogRow(userId, log);
  return {
    media_id: row.media_id,
    media_title: row.media_title,
    media_type: row.media_type,
    action: row.action,
    amount: row.amount,
    unit: row.unit,
    previous_progress: row.previous_progress,
    new_progress: row.new_progress,
    created_at: row.created_at,
  };
}

export function decodeCloudMediaV2Result(
  value: unknown,
  item: SyncQueueItem,
): CloudMediaV2DispatchResult {
  const deletedAt = isRecord(value) && value.deletedAt === undefined
    ? null
    : isRecord(value)
      ? value.deletedAt
      : undefined;
  if (
    !isRecord(value)
    || typeof value.ok !== "boolean"
    || typeof value.conflict !== "boolean"
    || typeof value.reason !== "string"
    || value.entityType !== (
      item.entity === "media_item" ? "media" : "progress"
    )
    || value.recordId !== (
      isRecord(item.payload) && typeof item.payload.id === "string"
        ? item.payload.id
        : undefined
    )
    || typeof value.revision !== "number"
    || !Number.isSafeInteger(value.revision)
    || value.revision < 0
    || (
      deletedAt !== null
      && (
        typeof deletedAt !== "string"
        || !Number.isFinite(Date.parse(deletedAt))
      )
    )
  ) {
    return {
      kind: "invalid-response",
      error: "Cloud Media V2 RPC sonucu doğrulanamadı.",
    };
  }
  if (
    value.ok === true
    && value.conflict === false
    && appliedReasons.has(value.reason)
  ) {
    return {
      kind: "applied",
      reason: value.reason,
      revision: value.revision,
      deletedAt,
    };
  }
  if (
    value.ok === false
    && value.conflict === true
  ) {
    const reason = conflictReasons.has(
      value.reason as CloudMediaV2ConflictReason,
    )
      ? value.reason as CloudMediaV2ConflictReason
      : "unknown";
    return {
      kind: "conflict",
      reason,
      revision: value.revision,
      deletedAt,
    };
  }
  return {
    kind: "invalid-response",
    error: "Cloud Media V2 RPC sonucu bilinmeyen durum taşıyor.",
  };
}

export async function dispatchCloudMediaV2QueueItem(
  userId: string,
  item: SyncQueueItem,
  client: CloudMediaV2RpcClient | null = (
    getSupabaseBrowserClient() as unknown as CloudMediaV2RpcClient | null
  ),
): Promise<CloudMediaV2DispatchResult> {
  if (!client) {
    return { kind: "retryable-error", error: "Supabase yapılandırılmadı." };
  }
  if (
    item.transport !== "cloud-v2"
    || item.schemaVersion !== 2
    || typeof item.operationId !== "string"
    || item.operationId.length < 8
    || typeof item.expectedRevision !== "number"
    || !Number.isSafeInteger(item.expectedRevision)
    || item.expectedRevision < 0
    || item.userId !== userId
    || !isRecord(item.payload)
    || typeof item.payload.id !== "string"
  ) {
    return {
      kind: "invalid-response",
      error: "Cloud Media V2 queue item doğrulanamadı.",
    };
  }

  let rpcName: string;
  let payload: Record<string, unknown> | null;
  if (item.entity === "media_item") {
    rpcName = "apply_media_item_sync_operation";
    payload = item.operation === "upsert"
      ? buildCloudMediaV2Payload(userId, item.payload as unknown as MediaItem)
      : null;
  } else if (item.entity === "progress_log" && item.operation === "upsert") {
    rpcName = "apply_progress_log_sync_operation";
    payload = buildCloudProgressV2Payload(
      userId,
      item.payload as unknown as ProgressLog,
    );
  } else {
    return {
      kind: "invalid-response",
      error: "Cloud Media V2 operation/entity kombinasyonu desteklenmiyor.",
    };
  }

  const { data, error } = await client.rpc(rpcName, {
    p_operation_id: item.operationId,
    p_record_id: item.payload.id,
    p_operation_type: item.operation,
    p_expected_revision: item.expectedRevision,
    p_payload: payload,
  });
  if (error) {
    return { kind: "retryable-error", error: error.message };
  }
  return decodeCloudMediaV2Result(data, item);
}
