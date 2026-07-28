import type { StorageWriteResult } from "./local-data-storage";
import type { LocalOwnerScope } from "./local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalStorageLike,
} from "./personal-data-storage";
import type {
  CloudMediaV2ConflictReason,
  SyncEntity,
} from "./types";

export const CLOUD_MEDIA_V2_STATE_VERSION = 1 as const;

export interface CloudMediaV2RecordState {
  entity: SyncEntity;
  recordId: string;
  revision: number;
  deletedAt: string | null;
  lastOperationId: string;
  updatedAt: string;
  conflict?: {
    reason: CloudMediaV2ConflictReason;
    detectedAt: string;
  };
}

export interface CloudMediaV2LocalState {
  version: 1;
  records: CloudMediaV2RecordState[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

export const cloudMediaV2StateCodec: PersonalDataCodec<CloudMediaV2LocalState> = (
  value,
) => {
  if (
    !isRecord(value)
    || value.version !== CLOUD_MEDIA_V2_STATE_VERSION
    || !Array.isArray(value.records)
  ) {
    return { ok: false, message: "Cloud Media V2 local state formati gecersiz." };
  }
  const records: CloudMediaV2RecordState[] = [];
  const keys = new Set<string>();
  for (const entry of value.records) {
    if (
      !isRecord(entry)
      || (entry.entity !== "media_item" && entry.entity !== "progress_log")
      || typeof entry.recordId !== "string"
      || entry.recordId.length === 0
      || entry.recordId.length > 240
      || typeof entry.revision !== "number"
      || !Number.isSafeInteger(entry.revision)
      || entry.revision < 0
      || (
        entry.deletedAt !== null
        && (
          typeof entry.deletedAt !== "string"
          || !Number.isFinite(Date.parse(entry.deletedAt))
        )
      )
      || typeof entry.lastOperationId !== "string"
      || entry.lastOperationId.length < 8
      || typeof entry.updatedAt !== "string"
      || !Number.isFinite(Date.parse(entry.updatedAt))
    ) {
      return { ok: false, message: "Cloud Media V2 record state gecersiz." };
    }
    let conflict: CloudMediaV2RecordState["conflict"];
    if (entry.conflict !== undefined) {
      if (
        !isRecord(entry.conflict)
        || typeof entry.conflict.reason !== "string"
        || !conflictReasons.has(
          entry.conflict.reason as CloudMediaV2ConflictReason,
        )
        || typeof entry.conflict.detectedAt !== "string"
        || !Number.isFinite(Date.parse(entry.conflict.detectedAt))
      ) {
        return { ok: false, message: "Cloud Media V2 conflict state gecersiz." };
      }
      conflict = {
        reason: entry.conflict.reason as CloudMediaV2ConflictReason,
        detectedAt: entry.conflict.detectedAt,
      };
    }
    const key = `${entry.entity}:${entry.recordId}`;
    if (keys.has(key)) {
      return { ok: false, message: "Cloud Media V2 state duplicate record iceriyor." };
    }
    keys.add(key);
    records.push({
      entity: entry.entity,
      recordId: entry.recordId,
      revision: entry.revision,
      deletedAt: entry.deletedAt,
      lastOperationId: entry.lastOperationId,
      updatedAt: entry.updatedAt,
      ...(conflict ? { conflict } : {}),
    });
  }
  records.sort((left, right) =>
    `${left.entity}:${left.recordId}`.localeCompare(
      `${right.entity}:${right.recordId}`,
      "en",
    ));
  return { ok: true, value: { version: 1, records } };
};

function emptyState(): CloudMediaV2LocalState {
  return { version: CLOUD_MEDIA_V2_STATE_VERSION, records: [] };
}

export function readCloudMediaV2State(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike | null,
): CloudMediaV2LocalState {
  const result = readPersonalData(
    scope,
    "cloudMediaV2State",
    cloudMediaV2StateCodec,
    storage,
  );
  return result.status === "valid" ? result.data : emptyState();
}

export function getCloudMediaV2RecordState(
  scope: LocalOwnerScope,
  entity: SyncEntity,
  recordId: string,
  storage?: PersonalStorageLike | null,
): CloudMediaV2RecordState | undefined {
  return readCloudMediaV2State(scope, storage).records.find(
    (entry) => entry.entity === entity && entry.recordId === recordId,
  );
}

export function writeCloudMediaV2ServerResult(
  scope: LocalOwnerScope,
  input: {
    entity: SyncEntity;
    recordId: string;
    operationId: string;
    revision: number;
    deletedAt: string | null;
    conflict?: CloudMediaV2ConflictReason;
  },
  storage?: PersonalStorageLike | null,
): StorageWriteResult {
  const current = readCloudMediaV2State(scope, storage);
  const key = `${input.entity}:${input.recordId}`;
  const nextRecord: CloudMediaV2RecordState = {
    entity: input.entity,
    recordId: input.recordId,
    revision: input.revision,
    deletedAt: input.deletedAt,
    lastOperationId: input.operationId,
    updatedAt: new Date().toISOString(),
    ...(input.conflict
      ? { conflict: { reason: input.conflict, detectedAt: new Date().toISOString() } }
      : {}),
  };
  const records = current.records
    .filter((entry) => `${entry.entity}:${entry.recordId}` !== key)
    .concat(nextRecord);
  return writePersonalData(
    scope,
    "cloudMediaV2State",
    { version: 1, records },
    cloudMediaV2StateCodec,
    storage,
  );
}
