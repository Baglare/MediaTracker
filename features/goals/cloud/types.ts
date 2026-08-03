import type { Goal } from "@/features/goals/domain/types";

export type GoalCloudOperationKind = "upsert" | "tombstone";
export type GoalCloudResultStatus =
  | "applied"
  | "idempotent_replay"
  | "revision_conflict"
  | "deleted_conflict"
  | "operation_id_reused"
  | "invalid_payload";

export type GoalCloudConflictKind =
  | "local_update_vs_newer_cloud"
  | "local_update_vs_remote_tombstone"
  | "local_delete_vs_newer_cloud"
  | "operation_id_reused"
  | "malformed_server_definition";

export interface GoalCloudConflict {
  kind: GoalCloudConflictKind;
  serverRevision: number;
  serverDeletedAt: string | null;
  serverDefinition?: Goal;
  detectedAt: string;
}

export interface GoalCloudQueueItem {
  schemaVersion: 1;
  operationId: string;
  ownerScope: string;
  userId: string;
  goalId: string;
  operation: GoalCloudOperationKind;
  expectedRevision: number;
  definition?: Goal;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
  dispatchStartedAt?: string;
  blockedConflict?: GoalCloudConflict;
  permanentFailure?: { code: "invalid_payload" | "retry_exhausted"; detectedAt: string };
}

export interface GoalCloudRecordState {
  goalId: string;
  revision: number;
  deletedAt: string | null;
  lastOperationId: string;
  lastSyncedDefinition?: Goal;
  updatedAt: string;
}

export interface GoalCloudRpcSnapshot {
  status: GoalCloudResultStatus;
  goalId: string;
  revision: number;
  deletedAt: string | null;
  definition?: Goal;
}
