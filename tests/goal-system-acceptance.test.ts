import { describe, expect, it, vi } from "vitest";

import {
  acceptCloudGoalVersion,
  overwriteCloudGoalWithLocal,
  saveConflictingGoalAsCopy,
} from "@/features/goals/cloud/conflicts";
import { readGoalCloudQueue, writeGoalCloudQueue } from "@/features/goals/cloud/queue";
import { createGoal, GoalRepositoryError } from "@/features/goals/data/goal-repository";
import { readGoalStore, writeGoalStore } from "@/features/goals/data/goal-store";
import { decodeGoal } from "@/features/goals/domain/codec";
import type { Goal } from "@/features/goals/domain/types";
import { buildGoalEvaluationSnapshot, evaluateGoals } from "@/features/goals/evaluation";
import { createUserOwnerScope, GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";
import { buildPersonalDataKeys, type PersonalStorageLike } from "@/lib/personal-data-storage";
import type { MediaItem, ProgressLog } from "@/lib/types";

class MemoryStorage implements PersonalStorageLike {
  data = new Map<string, string>();
  failOnceKey: string | null = null;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failOnceKey) {
      this.failOnceKey = null;
      throw new Error("injected_write_failure");
    }
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

const scope = createUserOwnerScope("goal-acceptance-owner");
const now = "2026-08-04T10:00:00.000Z";
const goal: Goal = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Haftalık bölüm",
  origin: "manual",
  scope: { kind: "media_type", mediaType: "tv" },
  metric: { kind: "progress", unit: "episode", targetValue: 4 },
  schedule: { kind: "weekly", startsOn: "2026-08-03", weekStartsOn: "monday", timeZone: "UTC" },
  lifecycle: "active",
  createdAt: now,
  updatedAt: now,
};
const remoteGoal: Goal = { ...goal, title: "Cloud başlığı", updatedAt: "2026-08-04T11:00:00.000Z" };

function blocked(operation: "upsert" | "tombstone" = "upsert") {
  return {
    schemaVersion: 1 as const,
    operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerScope: scope.key,
    userId: scope.userId,
    goalId: goal.id,
    operation,
    expectedRevision: 1,
    definition: goal,
    enqueuedAt: now,
    retryCount: 0,
    blockedConflict: {
      kind: operation === "tombstone" ? "local_delete_vs_newer_cloud" as const : "local_update_vs_newer_cloud" as const,
      serverRevision: 2,
      serverDeletedAt: null,
      serverDefinition: remoteGoal,
      detectedAt: now,
    },
  };
}

describe("D5-5 persistence and evaluation acceptance", () => {
  it("rejects derived result fields at the Goal codec boundary", () => {
    for (const field of ["currentValue", "progressPercent", "attainment", "completed"] as const) {
      expect(decodeGoal({ ...goal, [field]: field === "completed" ? true : 1 }).ok).toBe(false);
    }
  });

  it("does not enqueue Cloud when the verified local Goal write fails", () => {
    const storage = new MemoryStorage();
    const cloudMutation = vi.fn();
    storage.failOnceKey = buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).temp;
    expect(() => createGoal(GUEST_OWNER_SCOPE, {
      title: "Yazılamayan hedef",
      scope: { kind: "library" },
      metric: { kind: "completed_media", targetValue: 1 },
      schedule: { kind: "one_time", startsOn: "2026-08-04", endsOn: "2026-08-31" },
    }, {
      storage,
      cloudMutation,
      idFactory: () => "22222222-2222-4222-8222-222222222222",
      now: () => new Date(now),
    })).toThrowError(GoalRepositoryError);
    expect(cloudMutation).not.toHaveBeenCalled();
  });

  it("indexes the progress-log snapshot once and reuses it across Goals", () => {
    const media: MediaItem = {
      id: "tv-1", title: "TV", type: "tv", status: "watching", coverImage: "",
      currentProgress: 2, totalProgress: 12,
    };
    const records: ProgressLog[] = [{
      id: "log-1", mediaId: media.id, mediaTitle: media.title, mediaType: "tv",
      action: "increment", amount: 99, unit: "episode", previousProgress: 0,
      newProgress: 2, createdAt: now,
    }];
    let iterations = 0;
    const instrumented = new Proxy(records, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          return function* iterator() {
            iterations += 1;
            yield* target;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const snapshot = buildGoalEvaluationSnapshot([media], instrumented);
    const second = { ...goal, id: "33333333-3333-4333-8333-333333333333", title: "İkinci" };
    const results = evaluateGoals([goal, second], snapshot, { now, timeZone: "UTC" });
    expect(iterations).toBe(1);
    expect(results.map((entry) => entry.currentValue)).toEqual([2, 2]);
  });

  it("re-evaluates status corrections without rewriting the Goal definition", () => {
    const storage = new MemoryStorage();
    expect(writeGoalStore(GUEST_OWNER_SCOPE, [goal], { storage }).ok).toBe(true);
    const before = storage.getItem(buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).current);
    const completed: MediaItem = { id: "film", title: "Film", type: "movie", status: "completed", coverImage: "", currentProgress: 1, totalProgress: 1 };
    const corrected = { ...completed, status: "planning" as const };
    const evidence: ProgressLog = { id: "complete", mediaId: "film", mediaTitle: "Film", mediaType: "movie", action: "complete", amount: 1, unit: "movie", previousProgress: 0, newProgress: 1, createdAt: now };
    buildGoalEvaluationSnapshot([completed], [evidence]);
    buildGoalEvaluationSnapshot([corrected], [evidence]);
    expect(storage.getItem(buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).current)).toBe(before);
  });
});

describe("D5-5 Goal conflict acceptance", () => {
  it("accepts a valid Cloud definition and unblocks the operation", () => {
    const storage = new MemoryStorage();
    expect(writeGoalStore(scope, [goal], { storage }).ok).toBe(true);
    expect(writeGoalCloudQueue(scope, [blocked()], storage)).toBe(true);
    expect(acceptCloudGoalVersion(scope, blocked().operationId, storage)).toBe(true);
    expect(readGoalStore(scope, storage).data.goals).toEqual([remoteGoal]);
    expect(readGoalCloudQueue(scope, storage)).toEqual([]);
  });

  it("treats a remote tombstone as deletion even when the server returns its last definition", () => {
    const storage = new MemoryStorage();
    expect(writeGoalStore(scope, [goal], { storage }).ok).toBe(true);
    const item = blocked();
    item.blockedConflict.serverDeletedAt = "2026-08-04T12:00:00.000Z";
    item.blockedConflict.kind = "local_update_vs_remote_tombstone";
    expect(writeGoalCloudQueue(scope, [item], storage)).toBe(true);
    expect(acceptCloudGoalVersion(scope, item.operationId, storage)).toBe(true);
    expect(readGoalStore(scope, storage).data.goals).toEqual([]);
  });

  it("rolls back local changes when a later conflict-resolution write fails", () => {
    const storage = new MemoryStorage();
    expect(writeGoalStore(scope, [goal], { storage }).ok).toBe(true);
    expect(writeGoalCloudQueue(scope, [blocked()], storage)).toBe(true);
    storage.failOnceKey = buildPersonalDataKeys("goalCloudState", scope).temp;
    expect(acceptCloudGoalVersion(scope, blocked().operationId, storage)).toBe(false);
    expect(readGoalStore(scope, storage).data.goals).toEqual([goal]);
    expect(readGoalCloudQueue(scope, storage)).toHaveLength(1);
  });

  it("overwrites with current CAS revision for both update and local-delete conflicts", () => {
    const updateStorage = new MemoryStorage();
    expect(writeGoalStore(scope, [goal], { storage: updateStorage }).ok).toBe(true);
    expect(writeGoalCloudQueue(scope, [blocked()], updateStorage)).toBe(true);
    expect(overwriteCloudGoalWithLocal(scope, blocked().operationId, updateStorage)).toBe(true);
    expect(readGoalCloudQueue(scope, updateStorage)).toMatchObject([{ operation: "upsert", expectedRevision: 2 }]);

    const deleteStorage = new MemoryStorage();
    expect(writeGoalStore(scope, [], { storage: deleteStorage }).ok).toBe(true);
    expect(writeGoalCloudQueue(scope, [blocked("tombstone")], deleteStorage)).toBe(true);
    expect(overwriteCloudGoalWithLocal(scope, blocked().operationId, deleteStorage)).toBe(true);
    expect(readGoalCloudQueue(scope, deleteStorage)).toMatchObject([{ operation: "tombstone", expectedRevision: 2 }]);
  });

  it("saves a domain-valid new UUID copy and leaves no blocked operation", () => {
    const storage = new MemoryStorage();
    expect(writeGoalStore(scope, [goal], { storage }).ok).toBe(true);
    expect(writeGoalCloudQueue(scope, [blocked()], storage)).toBe(true);
    const copy = saveConflictingGoalAsCopy(scope, blocked().operationId, {
      id: "44444444-4444-4444-8444-444444444444",
      now: "2026-08-04T13:00:00.000Z",
      storage,
    });
    expect(copy && decodeGoal(copy).ok).toBe(true);
    expect(readGoalStore(scope, storage).data.goals).toHaveLength(2);
    const copyQueue = readGoalCloudQueue(scope, storage);
    expect(copyQueue).toMatchObject([{ goalId: copy?.id }]);
    expect(copyQueue[0]).not.toHaveProperty("blockedConflict");
  });

  it("refuses malformed or snapshot-free operation-reuse conflicts", () => {
    const storage = new MemoryStorage();
    expect(writeGoalStore(scope, [goal], { storage }).ok).toBe(true);
    const malformed = { ...blocked(), blockedConflict: { kind: "malformed_server_definition" as const, serverRevision: 2, serverDeletedAt: null, detectedAt: now } };
    expect(writeGoalCloudQueue(scope, [malformed], storage)).toBe(true);
    expect(acceptCloudGoalVersion(scope, malformed.operationId, storage)).toBe(false);
    expect(readGoalStore(scope, storage).data.goals).toEqual([goal]);
  });
});
