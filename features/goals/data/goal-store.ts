import { decodeGoal } from "@/features/goals/domain/codec";
import { isValidIsoInstant } from "@/features/goals/domain/dates";
import type { Goal } from "@/features/goals/domain/types";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { StorageWriteResult } from "@/lib/local-data-storage";
import {
  inspectPersonalDataSlot,
  readPersonalData,
  writePersonalData,
  writeRecoveredPersonalData,
  type PersonalDataCodec,
  type PersonalStorageLike,
} from "@/lib/personal-data-storage";

export const GOAL_STORE_SCHEMA_VERSION = 1 as const;
const GOAL_STORE_DOMAIN = "goals" as const;

export interface GoalStoreEnvelope {
  schemaVersion: typeof GOAL_STORE_SCHEMA_VERSION;
  owner: string;
  savedAt: string;
  goals: Goal[];
}

export type GoalStoreReadResult =
  | { status: "ready"; source: "current" | "temp" | "backup"; data: GoalStoreEnvelope; needsRepair: boolean; quarantineKey?: string }
  | { status: "repaired"; source: "current"; data: GoalStoreEnvelope; needsRepair: true; message: string; quarantineKey?: string }
  | { status: "missing"; data: GoalStoreEnvelope; needsRepair: false; quarantineKey?: undefined }
  | { status: "error"; data: GoalStoreEnvelope; needsRepair: false; message: string; quarantineKey?: undefined };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyEnvelope(scope: LocalOwnerScope, savedAt = new Date(0).toISOString()): GoalStoreEnvelope {
  return { schemaVersion: GOAL_STORE_SCHEMA_VERSION, owner: scope.key, savedAt, goals: [] };
}

export function createGoalStoreCodec(scope: LocalOwnerScope): PersonalDataCodec<GoalStoreEnvelope> {
  return (value) => {
    if (!isRecord(value)) return { ok: false, message: "Goal store envelope nesne olmalıdır.", code: "goal_store_invalid" };
    const unknown = Object.keys(value).filter((key) => !["schemaVersion", "owner", "savedAt", "goals"].includes(key));
    if (unknown.length > 0) return { ok: false, message: "Goal store bilinmeyen alan taşıyor.", code: "goal_store_unknown_field" };
    if (value.schemaVersion !== GOAL_STORE_SCHEMA_VERSION) {
      return { ok: false, message: "Goal store schemaVersion desteklenmiyor.", code: "goal_store_version" };
    }
    if (value.owner !== scope.key) {
      return { ok: false, message: "Goal store sahibi aktif owner ile eşleşmiyor.", code: "goal_store_owner_mismatch" };
    }
    if (!isValidIsoInstant(value.savedAt)) {
      return { ok: false, message: "Goal store savedAt geçerli ISO instant olmalıdır.", code: "goal_store_saved_at" };
    }
    if (!Array.isArray(value.goals)) {
      return { ok: false, message: "Goal store goals alanı liste olmalıdır.", code: "goal_store_goals_invalid" };
    }

    const goals: Goal[] = [];
    const ids = new Set<string>();
    let malformed = 0;
    for (const entry of value.goals) {
      const decoded = decodeGoal(entry);
      if (!decoded.ok || ids.has(decoded.value.id)) {
        malformed += 1;
        continue;
      }
      ids.add(decoded.value.id);
      goals.push(decoded.value);
    }
    const normalized: GoalStoreEnvelope = {
      schemaVersion: GOAL_STORE_SCHEMA_VERSION,
      owner: scope.key,
      savedAt: value.savedAt,
      goals,
    };
    if (malformed > 0) {
      return {
        ok: false,
        message: `${malformed} bozuk veya yinelenen Goal kaydı karantinaya ayrıldı.`,
        code: "goal_store_partial_corruption",
        repairData: { current: normalized, repaired: normalized },
      };
    }
    return { ok: true, value: normalized };
  };
}

export function readGoalStore(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike | null,
): GoalStoreReadResult {
  const codec = createGoalStoreCodec(scope);
  const current = readPersonalData(scope, GOAL_STORE_DOMAIN, codec, storage);
  if (current.status === "valid") {
    return { status: "ready", source: "current", data: current.data, needsRepair: false };
  }
  if (current.status === "owner_mismatch" || current.status === "storage_unavailable") {
    return { status: "error", data: emptyEnvelope(scope), needsRepair: false, message: current.message };
  }

  const recoveryOrder = current.status === "missing"
    ? (["temp", "backup"] as const)
    : (["backup", "temp"] as const);
  for (const slot of recoveryOrder) {
    const recovered = inspectPersonalDataSlot(scope, GOAL_STORE_DOMAIN, codec, slot, storage);
    if (recovered.status === "valid") {
      return {
        status: "ready",
        source: slot,
        data: recovered.data,
        needsRepair: current.status === "corrupt",
        ...(current.status === "corrupt" ? { quarantineKey: current.quarantineKey } : {}),
      };
    }
  }

  if (current.status === "corrupt" && current.repairData) {
    return {
      status: "repaired",
      source: "current",
      data: current.repairData.repaired,
      needsRepair: true,
      message: current.message,
      quarantineKey: current.quarantineKey,
    };
  }
  if (current.status === "missing") return { status: "missing", data: emptyEnvelope(scope), needsRepair: false };
  return {
    status: "error",
    data: emptyEnvelope(scope),
    needsRepair: false,
    message: "message" in current ? current.message : "Goal store okunamadı.",
  };
}

export function writeGoalStore(
  scope: LocalOwnerScope,
  goals: readonly Goal[],
  options: {
    storage?: PersonalStorageLike | null;
    now?: () => Date;
    recoveryQuarantineKey?: string;
  } = {},
): StorageWriteResult {
  const codec = createGoalStoreCodec(scope);
  const data: GoalStoreEnvelope = {
    schemaVersion: GOAL_STORE_SCHEMA_VERSION,
    owner: scope.key,
    savedAt: (options.now ?? (() => new Date()))().toISOString(),
    goals: [...goals],
  };
  return options.recoveryQuarantineKey !== undefined
    ? writeRecoveredPersonalData(scope, GOAL_STORE_DOMAIN, data, codec, options.recoveryQuarantineKey, options.storage)
    : writePersonalData(scope, GOAL_STORE_DOMAIN, data, codec, options.storage);
}

export function goalStoreEventName(scope: LocalOwnerScope): string {
  return `media-tracker:goals-changed:${scope.storageKey}`;
}

export function publishGoalStoreChange(scope: LocalOwnerScope, target?: EventTarget | null): void {
  const resolved = target ?? (typeof window === "undefined" ? null : window);
  resolved?.dispatchEvent(new Event(goalStoreEventName(scope)));
}

export function subscribeGoalStore(
  scope: LocalOwnerScope,
  listener: () => void,
  target?: EventTarget | null,
): () => void {
  const resolved = target ?? (typeof window === "undefined" ? null : window);
  if (!resolved) return () => undefined;
  const eventName = goalStoreEventName(scope);
  resolved.addEventListener(eventName, listener);
  return () => resolved.removeEventListener(eventName, listener);
}
