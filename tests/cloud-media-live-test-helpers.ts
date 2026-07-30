import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveCloudRolloutContract,
  type CloudMediaSchemaStage,
} from "@/lib/cloud-rollout";

export type LiveCloudSchemaStage = Extract<
  CloudMediaSchemaStage,
  "d2b1" | "d2c1"
>;

export type LiveCleanupStatus =
  | "tombstoned"
  | "already-tombstoned"
  | "not-created"
  | "failed";

type SyncResult = {
  ok: boolean;
  conflict: boolean;
  reason: string;
  revision: number;
  deletedAt: string | null;
};

function isPermissionDenied(error: { code?: string; message: string }): boolean {
  return error.code === "42501" || /permission denied/i.test(error.message);
}

export async function detectLiveCloudSchemaStage(
  client: SupabaseClient,
  syntheticRunId: string,
): Promise<LiveCloudSchemaStage> {
  const configuredStage = process.env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE;
  if (configuredStage === "d2b1" || configuredStage === "d2c1") {
    const rollout = resolveCloudRolloutContract({
      v2Enabled: "true",
      schemaStage: configuredStage,
    });
    if (rollout.status !== "ready") {
      throw new Error(`Live cloud rollout is not ready: ${rollout.code}`);
    }
    return rollout.schemaStage as LiveCloudSchemaStage;
  }

  // A zero-row UPDATE distinguishes the additive and enforced grants without
  // creating or changing data. The canonical rollout resolver remains the
  // single source of truth for the resulting schema/client contract.
  const probe = await client
    .from("media_items")
    .update({ title: "schema-phase-probe" })
    .eq("id", `${syntheticRunId}-schema-phase-probe`);
  const detectedStage: LiveCloudSchemaStage = probe.error
    ? isPermissionDenied(probe.error)
      ? "d2c1"
      : (() => {
          throw new Error(
            `Cloud schema phase probe failed: ${probe.error.code ?? "unknown"}`,
          );
        })()
    : "d2b1";
  const rollout = resolveCloudRolloutContract({
    v2Enabled: "true",
    schemaStage: detectedStage,
  });
  if (rollout.status !== "ready") {
    throw new Error(`Live cloud rollout is not ready: ${rollout.code}`);
  }
  return rollout.schemaStage as LiveCloudSchemaStage;
}

export async function tombstoneSyntheticV2Record(input: {
  client: SupabaseClient;
  runId: string;
  recordId: string;
  entity: "media" | "progress";
  operationId: string;
}): Promise<{ status: LiveCleanupStatus; error?: string }> {
  const { client, runId, recordId, entity, operationId } = input;
  if (!recordId.startsWith(runId) || !operationId.startsWith(runId)) {
    return { status: "failed", error: `unsafe-cleanup-target:${recordId}` };
  }

  const table = entity === "media" ? "media_items" : "progress_logs";
  const { data, error } = await client
    .from(table)
    .select("revision,deleted_at")
    .eq("id", recordId)
    .maybeSingle();
  if (error) {
    return {
      status: "failed",
      error: `${entity}-read:${error.code ?? "unknown"}`,
    };
  }
  if (!data) return { status: "not-created" };
  if (data.deleted_at) return { status: "already-tombstoned" };

  const rpcName = entity === "media"
    ? "apply_media_item_sync_operation"
    : "apply_progress_log_sync_operation";
  const result = await client.rpc(rpcName, {
    p_operation_id: operationId,
    p_record_id: recordId,
    p_operation_type: "delete",
    p_expected_revision: data.revision,
    p_payload: null,
  });
  if (result.error) {
    return {
      status: "failed",
      error: `${entity}-rpc:${result.error.code ?? "unknown"}`,
    };
  }
  const payload = result.data as SyncResult | null;
  if (!payload?.ok || payload.reason !== "deleted" || !payload.deletedAt) {
    return {
      status: "failed",
      error: `${entity}-delete:${payload?.reason ?? "invalid-result"}`,
    };
  }
  return { status: "tombstoned" };
}
