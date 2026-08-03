import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { goalFromCloudDefinition, goalToCloudDefinition } from "./mapping";
import type { GoalCloudQueueItem, GoalCloudRpcSnapshot, GoalCloudResultStatus } from "./types";
import type { RemoteGoalSnapshot } from "./manual-transfer";

export interface GoalCloudRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

const statuses = new Set<GoalCloudResultStatus>([
  "applied", "idempotent_replay", "revision_conflict", "deleted_conflict",
  "operation_id_reused", "invalid_payload",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodeGoalCloudRpcSnapshot(value: unknown, expectedGoalId: string):
  | { ok: true; snapshot: GoalCloudRpcSnapshot }
  | { ok: false; code: "invalid_response" | "malformed_server_definition" } {
  if (!isRecord(value)
    || typeof value.status !== "string" || !statuses.has(value.status as GoalCloudResultStatus)
    || value.goalId !== expectedGoalId
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || (value.deletedAt !== null && (typeof value.deletedAt !== "string" || !Number.isFinite(Date.parse(value.deletedAt))))) {
    return { ok: false, code: "invalid_response" };
  }
  let definition;
  if (value.definition !== null && value.definition !== undefined) {
    const decoded = goalFromCloudDefinition(value.definition);
    if (!decoded.ok || decoded.goal.id !== expectedGoalId) {
      return { ok: false, code: "malformed_server_definition" };
    }
    definition = decoded.goal;
  }
  return {
    ok: true,
    snapshot: {
      status: value.status as GoalCloudResultStatus,
      goalId: expectedGoalId,
      revision: value.revision as number,
      deletedAt: value.deletedAt as string | null,
      ...(definition ? { definition } : {}),
    },
  };
}

export async function dispatchGoalCloudQueueItem(
  item: GoalCloudQueueItem,
  client: GoalCloudRpcClient | null = getSupabaseBrowserClient() as unknown as GoalCloudRpcClient | null,
): Promise<
  | { kind: "result"; snapshot: GoalCloudRpcSnapshot }
  | { kind: "retryable"; error: string }
  | { kind: "invalid"; code: "invalid_response" | "malformed_server_definition" }
> {
  if (!client) return { kind: "retryable", error: "Cloud bağlantısı yapılandırılmadı." };
  const { data, error } = await client.rpc("apply_cloud_goal_v1", {
    p_operation_id: item.operationId,
    p_goal_id: item.goalId,
    p_expected_revision: item.expectedRevision,
    p_definition: item.definition
      ? goalToCloudDefinition(item.definition)
      : null,
    p_delete: item.operation === "tombstone",
  });
  if (error) return { kind: "retryable", error: error.message };
  const decoded = decodeGoalCloudRpcSnapshot(data, item.goalId);
  return decoded.ok
    ? { kind: "result", snapshot: decoded.snapshot }
    : { kind: "invalid", code: decoded.code };
}

export interface GoalCloudQueryClient {
  from(name: string): {
    select(columns: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

export async function fetchGoalCloudSnapshots(
  client: GoalCloudQueryClient | null = getSupabaseBrowserClient() as unknown as GoalCloudQueryClient | null,
): Promise<{ ok: true; snapshots: RemoteGoalSnapshot[] } | { ok: false; error: string }> {
  if (!client) return { ok: false, error: "Goal Cloud yapılandırılmadı." };
  const { data, error } = await client.from("goals").select("id,definition,revision,deleted_at");
  if (error) return { ok: false, error: "Hedef Cloud snapshot alınamadı." };
  if (!Array.isArray(data)) return { ok: false, error: "Hedef Cloud snapshot doğrulanamadı." };
  const snapshots: RemoteGoalSnapshot[] = [];
  for (const row of data) {
    if (!isRecord(row) || typeof row.id !== "string" || !Number.isSafeInteger(row.revision)
      || (row.deleted_at !== null && (typeof row.deleted_at !== "string" || !Number.isFinite(Date.parse(row.deleted_at))))) {
      return { ok: false, error: "Hedef Cloud snapshot doğrulanamadı." };
    }
    let goal;
    if (row.definition !== null) {
      const decoded = goalFromCloudDefinition(row.definition);
      if (!decoded.ok || decoded.goal.id !== row.id) return { ok: false, error: "Hedef Cloud tanımı doğrulanamadı." };
      goal = decoded.goal;
    }
    snapshots.push({ goal: goal ?? null, goalId: row.id, revision: row.revision as number, deletedAt: row.deleted_at as string | null });
  }
  snapshots.sort((a, b) => a.goalId.localeCompare(b.goalId, "en"));
  return { ok: true, snapshots };
}
