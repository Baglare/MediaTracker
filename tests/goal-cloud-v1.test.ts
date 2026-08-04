import { afterEach, describe, expect, it, vi } from "vitest";
import { createUserOwnerScope, GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";
import { buildPersonalDataKeys } from "@/lib/personal-data-storage";
import { goalFromCloudDefinition, goalToCloudDefinition } from "@/features/goals/cloud/mapping";
import { resolveGoalCloudRolloutContract } from "@/features/goals/cloud/rollout";
import { decodeGoalCloudRpcSnapshot } from "@/features/goals/cloud/client";
import { enqueueGoalCloudOperation, readGoalCloudQueue, writeGoalCloudQueue } from "@/features/goals/cloud/queue";
import { applyCloudGoalsToLocalMerge, planCloudGoalsToLocalMerge, replaceLocalGoalsFromCloud } from "@/features/goals/cloud/manual-transfer";
import {
  flushGoalCloudQueue,
  getGoalCloudSyncSnapshot,
  queueGoalCloudMutation,
  setGoalCloudOwnerScope,
  subscribeGoalCloudSync,
} from "@/features/goals/cloud/manager";
import { readGoalCloudState } from "@/features/goals/cloud/state";
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

afterEach(() => {
  setGoalCloudOwnerScope(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE", "v1");
    expect(queueGoalCloudMutation(scope, { operation: "upsert", goal }, { storage })).not.toBeNull();
    expect(readGoalCloudQueue(scope, storage)).toHaveLength(1);
  });

  it("keeps offline failures pending and applies the bounded retry limit", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE", "v1");
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    enqueueGoalCloudOperation(scope, "upsert", goal.id, goal, { storage, operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    setGoalCloudOwnerScope(scope);
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: "network unavailable" } })) };
    for (let attempt = 0; attempt < 5; attempt += 1) await flushGoalCloudQueue({ storage, client });
    expect(client.rpc).toHaveBeenCalledTimes(5);
    expect(readGoalCloudQueue(scope, storage)[0]).toMatchObject({
      retryCount: 5,
      permanentFailure: { code: "retry_exhausted" },
    });
    await flushGoalCloudQueue({ storage, client });
    expect(client.rpc).toHaveBeenCalledTimes(5);
  });

  it("keeps revision conflicts blocked and invalid payloads permanent", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE", "v1");
    const blockedStorage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    enqueueGoalCloudOperation(scope, "upsert", goal.id, goal, { storage: blockedStorage, operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    setGoalCloudOwnerScope(scope);
    await flushGoalCloudQueue({ storage: blockedStorage, client: { rpc: async () => ({ data: { status: "revision_conflict", goalId: goal.id, revision: 3, deletedAt: null, definition: { ...goal, title: "Cloud" } }, error: null }) } });
    expect(readGoalCloudQueue(scope, blockedStorage)[0]).toMatchObject({ blockedConflict: { kind: "local_update_vs_newer_cloud", serverRevision: 3 } });

    const invalidStorage = new MemoryStorage();
    enqueueGoalCloudOperation(scope, "upsert", goal.id, goal, { storage: invalidStorage, operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    await flushGoalCloudQueue({ storage: invalidStorage, client: { rpc: async () => ({ data: { status: "invalid_payload", goalId: goal.id, revision: 0, deletedAt: null, definition: null }, error: null }) } });
    expect(readGoalCloudQueue(scope, invalidStorage)[0]).toMatchObject({ permanentFailure: { code: "invalid_payload" } });
  });

  it("drops a stale response after owner switch", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE", "v1");
    const storage = new MemoryStorage();
    const a = createUserOwnerScope("owner-a");
    const b = createUserOwnerScope("owner-b");
    enqueueGoalCloudOperation(a, "upsert", goal.id, goal, { storage, operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    let resolveRpc!: (value: { data: unknown; error: null }) => void;
    const client = { rpc: () => new Promise<{ data: unknown; error: null }>((resolve) => { resolveRpc = resolve; }) };
    setGoalCloudOwnerScope(a);
    const flushing = flushGoalCloudQueue({ storage, client });
    await vi.waitFor(() => expect(resolveRpc).toBeTypeOf("function"));
    setGoalCloudOwnerScope(b);
    resolveRpc({ data: { status: "applied", goalId: goal.id, revision: 1, deletedAt: null, definition: goal }, error: null });
    await flushing;
    expect(readGoalCloudQueue(a, storage)).toHaveLength(1);
    expect(readGoalCloudState(a, storage).records).toEqual([]);
    expect(getGoalCloudSyncSnapshot().ownerKey).toBe(b.key);
  });

  it("publishes one owner-scoped reactive status snapshot without affecting media rollout", () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE", "absent");
    const storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage, dispatchEvent: vi.fn() });
    vi.stubGlobal("localStorage", storage);
    const scope = createUserOwnerScope("owner-a");
    const listener = vi.fn();
    setGoalCloudOwnerScope(scope);
    const unsubscribe = subscribeGoalCloudSync(listener);
    expect(queueGoalCloudMutation(scope, { operation: "upsert", goal })).not.toBeNull();
    expect(listener).toHaveBeenCalled();
    expect(getGoalCloudSyncSnapshot()).toMatchObject({ ownerKey: scope.key, status: "incompatible", pending: 1 });
    unsubscribe();
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
