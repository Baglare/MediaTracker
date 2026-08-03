import { afterEach, describe, expect, it, vi } from "vitest";
import { createUserOwnerScope, GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";
import { buildPersonalDataKeys } from "@/lib/personal-data-storage";
import { goalFromCloudDefinition, goalToCloudDefinition } from "@/features/goals/cloud/mapping";
import { resolveGoalCloudRolloutContract } from "@/features/goals/cloud/rollout";
import { decodeGoalCloudRpcSnapshot } from "@/features/goals/cloud/client";
import { enqueueGoalCloudOperation, readGoalCloudQueue, writeGoalCloudQueue } from "@/features/goals/cloud/queue";
import { applyCloudGoalsToLocalMerge, planCloudGoalsToLocalMerge, replaceLocalGoalsFromCloud } from "@/features/goals/cloud/manual-transfer";
import { queueGoalCloudMutation } from "@/features/goals/cloud/manager";
import { readGoalStore, writeGoalStore } from "@/features/goals/data/goal-store";
import type { Goal } from "@/features/goals/domain/types";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const goal: Goal = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Haftalık bölüm",
  origin: "manual",
  scope: { kind: "media_type", mediaType: "tv" },
  metric: { kind: "progress", unit: "episode", targetValue: 5 },
  schedule: { kind: "weekly", startsOn: "2026-08-03", weekStartsOn: "monday", timeZone: "Europe/Istanbul" },
  lifecycle: "active",
  createdAt: "2026-08-03T08:00:00.000Z",
  updatedAt: "2026-08-03T08:00:00.000Z",
};

afterEach(() => vi.unstubAllEnvs());

describe("Goal Cloud V1 mapping and rollout", () => {
  it("syncs only the strict Goal definition", () => {
    expect(goalFromCloudDefinition(goal)).toEqual({ ok: true, goal });
    expect(Object.keys(goalToCloudDefinition(goal))).not.toContain("currentValue");
    expect(goalFromCloudDefinition({ ...goal, progressPercent: 40 })).toEqual({ ok: false, code: "malformed_server_definition" });
  });

  it("fails closed when enabled schema is unavailable", () => {
    expect(resolveGoalCloudRolloutContract({ enabled: "false", schemaStage: "absent" }).status).toBe("disabled");
    expect(resolveGoalCloudRolloutContract({ enabled: "true", schemaStage: "absent" })).toMatchObject({ status: "incompatible", code: "goal_schema_unavailable" });
    expect(resolveGoalCloudRolloutContract({ enabled: "true", schemaStage: "v1" }).status).toBe("ready");
  });

  it("rejects malformed server definitions without touching domain data", () => {
    expect(decodeGoalCloudRpcSnapshot({ status: "applied", goalId: goal.id, revision: 1, deletedAt: null, definition: { ...goal, attainment: "reached" } }, goal.id)).toEqual({ ok: false, code: "malformed_server_definition" });
  });
});

describe("Goal durable owner queue", () => {
  it("isolates owner keys and does not queue guest mutations", () => {
    const storage = new MemoryStorage();
    const a = createUserOwnerScope("owner-a");
    const b = createUserOwnerScope("owner-b");
    enqueueGoalCloudOperation(a, "upsert", goal.id, goal, { storage, operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    expect(readGoalCloudQueue(a, storage)).toHaveLength(1);
    expect(readGoalCloudQueue(b, storage)).toHaveLength(0);
    expect(enqueueGoalCloudOperation(GUEST_OWNER_SCOPE, "upsert", goal.id, goal, { storage })).toBeNull();
    expect(buildPersonalDataKeys("goalCloudQueue", a).current).not.toBe(buildPersonalDataKeys("goalCloudQueue", b).current);
  });

  it("coalesces only undispatched operations and lets tombstone supersede pending upsert", () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    enqueueGoalCloudOperation(scope, "upsert", goal.id, goal, { storage, operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    enqueueGoalCloudOperation(scope, "tombstone", goal.id, goal, { storage, operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    expect(readGoalCloudQueue(scope, storage)).toMatchObject([{ operation: "tombstone", definition: goal }]);
  });

  it("keeps an in-flight operation when a new mutation arrives", () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    enqueueGoalCloudOperation(scope, "upsert", goal.id, goal, { storage, operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const first = { ...readGoalCloudQueue(scope, storage)[0], dispatchStartedAt: "2026-08-03T08:01:00.000Z" };
    expect(writeGoalCloudQueue(scope, [first], storage)).toBe(true);
    enqueueGoalCloudOperation(scope, "upsert", goal.id, { ...goal, title: "Yeni" }, { storage, operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    expect(readGoalCloudQueue(scope, storage)).toHaveLength(2);
  });

  it("does not enqueue when flag is disabled and preserves queue fail-closed when schema is absent", () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED", "false");
    expect(queueGoalCloudMutation(scope, { operation: "upsert", goal }, { storage })).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE", "absent");
    expect(queueGoalCloudMutation(scope, { operation: "upsert", goal }, { storage })).not.toBeNull();
    expect(readGoalCloudQueue(scope, storage)).toHaveLength(1);
  });
});

describe("manual Goal transfer planning", () => {
  it("keeps local-only goals and exposes different payload as conflict", () => {
    const changed = { ...goal, title: "Cloud title" };
    const plan = planCloudGoalsToLocalMerge([goal], [{ goal: changed, goalId: goal.id, revision: 2, deletedAt: null }]);
    expect(plan.additions).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("merges cloud-only definitions without deleting local-only goals", () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    expect(writeGoalStore(scope, [goal], { storage }).ok).toBe(true);
    const remote = { ...goal, id: "22222222-2222-4222-8222-222222222222", title: "Cloud-only" };
    expect(applyCloudGoalsToLocalMerge(scope, [{ goal: remote, goalId: remote.id, revision: 1, deletedAt: null }], storage)).toEqual({ ok: true, added: 1 });
    expect(readGoalStore(scope, storage).data.goals).toHaveLength(2);
  });

  it("requires confirmation and blocks replace after queue dispatch", () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    enqueueGoalCloudOperation(scope, "upsert", goal.id, goal, { storage, operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const dispatched = { ...readGoalCloudQueue(scope, storage)[0], dispatchStartedAt: "2026-08-03T08:01:00.000Z" };
    writeGoalCloudQueue(scope, [dispatched], storage);
    expect(replaceLocalGoalsFromCloud(scope, [], { confirmed: true }, storage)).toEqual({ ok: false, code: "dispatch_started" });
  });
});
