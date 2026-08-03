import { decodeGoal } from "@/features/goals/domain/codec";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalStorageLike,
} from "@/lib/personal-data-storage";
import type { GoalCloudRecordState } from "./types";

export interface GoalCloudStateEnvelope {
  version: 1;
  records: GoalCloudRecordState[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const goalCloudStateCodec: PersonalDataCodec<GoalCloudStateEnvelope> = (value) => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.records)) {
    return { ok: false, message: "Goal Cloud sidecar envelope geçersiz." };
  }
  const records: GoalCloudRecordState[] = [];
  const ids = new Set<string>();
  for (const entry of value.records) {
    if (!isRecord(entry)
      || typeof entry.goalId !== "string"
      || ids.has(entry.goalId)
      || !Number.isSafeInteger(entry.revision)
      || (entry.revision as number) < 0
      || (entry.deletedAt !== null && (typeof entry.deletedAt !== "string" || !Number.isFinite(Date.parse(entry.deletedAt))))
      || typeof entry.lastOperationId !== "string"
      || typeof entry.updatedAt !== "string"
      || !Number.isFinite(Date.parse(entry.updatedAt))) {
      return { ok: false, message: "Goal Cloud sidecar kaydı geçersiz." };
    }
    let lastSyncedDefinition;
    if (entry.lastSyncedDefinition !== undefined) {
      const decoded = decodeGoal(entry.lastSyncedDefinition);
      if (decoded.ok && decoded.value.id === entry.goalId) lastSyncedDefinition = decoded.value;
      // Metadata bozukluğu Goal tanımlarını kaybettirmemeli; yalnız bozuk snapshot atılır.
    }
    ids.add(entry.goalId);
    records.push({
      goalId: entry.goalId,
      revision: entry.revision as number,
      deletedAt: entry.deletedAt,
      lastOperationId: entry.lastOperationId,
      updatedAt: entry.updatedAt,
      ...(lastSyncedDefinition ? { lastSyncedDefinition } : {}),
    });
  }
  records.sort((a, b) => a.goalId.localeCompare(b.goalId, "en"));
  return { ok: true, value: { version: 1, records } };
};

export function readGoalCloudState(scope: LocalOwnerScope, storage?: PersonalStorageLike | null): GoalCloudStateEnvelope {
  const result = readPersonalData(scope, "goalCloudState", goalCloudStateCodec, storage);
  return result.status === "valid" ? result.data : { version: 1, records: [] };
}

export function getGoalCloudRecordState(scope: LocalOwnerScope, goalId: string, storage?: PersonalStorageLike | null) {
  return readGoalCloudState(scope, storage).records.find((entry) => entry.goalId === goalId);
}

export function writeGoalCloudRecordState(
  scope: LocalOwnerScope,
  record: GoalCloudRecordState,
  storage?: PersonalStorageLike | null,
): boolean {
  const current = readGoalCloudState(scope, storage);
  const records = current.records.filter((entry) => entry.goalId !== record.goalId).concat(record);
  return writePersonalData(scope, "goalCloudState", { version: 1, records }, goalCloudStateCodec, storage).ok;
}

export function writeGoalCloudState(
  scope: LocalOwnerScope,
  records: readonly GoalCloudRecordState[],
  storage?: PersonalStorageLike | null,
): boolean {
  return writePersonalData(scope, "goalCloudState", { version: 1, records: [...records] }, goalCloudStateCodec, storage).ok;
}
