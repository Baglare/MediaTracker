import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MediaItem, ProgressLog } from "@/lib/types";
import {
  createUserOwnerScope,
  type LocalOwnerScope,
} from "@/lib/local-owner-scope";

const requiredEnvironment = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_ANON_KEY",
  "SUPABASE_TEST_USER_A_EMAIL",
  "SUPABASE_TEST_USER_A_PASSWORD",
  "SUPABASE_TEST_USER_B_EMAIL",
  "SUPABASE_TEST_USER_B_PASSWORD",
] as const;

const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name],
);
const liveEnvironmentAvailable = missingEnvironment.length === 0;

type RpcBridge = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

const liveBridge = vi.hoisted(() => ({
  client: null as RpcBridge | null,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => liveBridge.client,
}));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

type CleanupResult = {
  media: "removed" | "failed" | "not-created";
  progress: "removed" | "failed" | "not-created";
  operationLedger:
    | "removed"
    | "retained-permission-denied"
    | "failed"
    | "not-created";
  errors: string[];
};

function requiredEnvironmentValue(
  name: (typeof requiredEnvironment)[number],
): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing live-test environment variable: ${name}`);
  return value;
}

function createTestClient(): SupabaseClient {
  return createClient(
    requiredEnvironmentValue("SUPABASE_TEST_URL"),
    requiredEnvironmentValue("SUPABASE_TEST_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

function asRpcBridge(
  client: SupabaseClient,
  operationIds: Set<string>,
): RpcBridge {
  return {
    rpc: async (name, args) => {
      if (typeof args.p_operation_id === "string") {
        operationIds.add(args.p_operation_id);
      }
      const result = await client.rpc(name, args);
      return {
        data: result.data,
        error: result.error ? { message: result.error.message } : null,
      };
    },
  };
}

describe.skipIf(!liveEnvironmentAvailable)(
  "D2B.2A live client queue integration",
  () => {
    const runId = `d2b2a-client-${randomUUID()}`;
    const mediaId = `${runId}-media`;
    const progressId = `${runId}-progress`;
    const manualId = randomUUID();
    const operationIds = new Set<string>();
    const revisions: Record<string, number> = {};
    const conflicts: string[] = [];
    const passedScenarios: string[] = [];
    const cleanup: CleanupResult = {
      media: "not-created",
      progress: "not-created",
      operationLedger: "not-created",
      errors: [],
    };

    let userA: SupabaseClient;
    let userB: SupabaseClient;
    let userAId = "";
    let userBId = "";
    let scopeA: LocalOwnerScope;
    let scopeB: LocalOwnerScope;
    let manager: typeof import("@/lib/sync-manager");
    let queue: typeof import("@/lib/sync-queue");
    let state: typeof import("@/lib/cloud-media-v2-state");
    let createdMedia = false;
    let createdProgress = false;
    const storage = new MemoryStorage();

    const media = (status: MediaItem["status"] = "planning"): MediaItem => ({
      id: mediaId,
      identity: {
        version: 2,
        key: `v2:manual:item:${manualId}`,
        source: "manual",
        namespace: "item",
        manualId,
      },
      title: `D2B.2A Client Live ${runId}`,
      type: "movie",
      status,
      coverImage: "",
      currentProgress: 0,
      totalProgress: 1,
      favorite: false,
      tags: [],
    });

    const progress = (): ProgressLog => ({
      id: progressId,
      mediaId,
      mediaTitle: media().title,
      mediaType: "movie",
      action: "added",
      amount: 0,
      unit: "movie",
      previousProgress: 0,
      newProgress: 0,
      createdAt: "2026-07-28T12:00:00.000Z",
    });

    const mediaState = () =>
      state.getCloudMediaV2RecordState(scopeA, "media_item", mediaId);
    const progressState = () =>
      state.getCloudMediaV2RecordState(scopeA, "progress_log", progressId);

    beforeAll(async () => {
      vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED", "true");
      vi.stubGlobal("localStorage", storage);
      vi.stubGlobal("window", {
        localStorage: storage,
        addEventListener: vi.fn(),
      });
      vi.stubGlobal("navigator", { onLine: true });

      userA = createTestClient();
      userB = createTestClient();
      const [sessionA, sessionB] = await Promise.all([
        userA.auth.signInWithPassword({
          email: requiredEnvironmentValue("SUPABASE_TEST_USER_A_EMAIL"),
          password: requiredEnvironmentValue("SUPABASE_TEST_USER_A_PASSWORD"),
        }),
        userB.auth.signInWithPassword({
          email: requiredEnvironmentValue("SUPABASE_TEST_USER_B_EMAIL"),
          password: requiredEnvironmentValue("SUPABASE_TEST_USER_B_PASSWORD"),
        }),
      ]);
      expect(sessionA.error).toBeNull();
      expect(sessionB.error).toBeNull();
      userAId = sessionA.data.user?.id ?? "";
      userBId = sessionB.data.user?.id ?? "";
      expect(userAId).not.toBe("");
      expect(userBId).not.toBe("");
      expect(userAId).not.toBe(userBId);

      scopeA = createUserOwnerScope(userAId);
      scopeB = createUserOwnerScope(userBId);
      liveBridge.client = asRpcBridge(userA, operationIds);
      manager = await import("@/lib/sync-manager");
      queue = await import("@/lib/sync-queue");
      state = await import("@/lib/cloud-media-v2-state");
      manager.setOwnerScope(scopeA);
    }, 30_000);

    afterAll(async () => {
      try {
        manager?.setOwnerScope(null);
      } finally {
        try {
          if (createdProgress) {
            const { error } = await userA
              .from("progress_logs")
              .delete()
              .eq("id", progressId);
            cleanup.progress = error ? "failed" : "removed";
            if (error) cleanup.errors.push(`progress:${error.code}`);
          }
          if (createdMedia) {
            const { error } = await userA
              .from("media_items")
              .delete()
              .eq("id", mediaId);
            cleanup.media = error ? "failed" : "removed";
            if (error) cleanup.errors.push(`media:${error.code}`);
          }

          const ledgerAttempts = operationIds.size === 0
            ? []
            : await Promise.all(
                [userA, userB].map((client) =>
                  client
                    .from("cloud_media_sync_operations")
                    .delete()
                    .in("operation_id", [...operationIds]),
                ),
              );
          const ledgerErrors = ledgerAttempts
            .map(({ error }) => error)
            .filter((error) => error !== null);
          if (operationIds.size === 0) {
            cleanup.operationLedger = "not-created";
          } else if (
            ledgerErrors.length > 0
            && ledgerErrors.every(
              (error) =>
                error.code === "42501"
                || /permission denied/i.test(error.message),
            )
          ) {
            cleanup.operationLedger = "retained-permission-denied";
          } else if (ledgerErrors.length > 0) {
            cleanup.operationLedger = "failed";
            cleanup.errors.push(
              ...ledgerErrors.map((error) => `ledger:${error.code}`),
            );
          } else {
            const remaining = await Promise.all(
              [userA, userB].map((client) =>
                client
                  .from("cloud_media_sync_operations")
                  .select("operation_id")
                  .in("operation_id", [...operationIds]),
              ),
            );
            const remainingErrors = remaining
              .map(({ error }) => error)
              .filter((error) => error !== null);
            if (remainingErrors.length > 0) {
              cleanup.operationLedger = "failed";
              cleanup.errors.push(
                ...remainingErrors.map(
                  (error) => `ledger-check:${error.code}`,
                ),
              );
            } else if (
              remaining.every(({ data }) => (data?.length ?? 0) === 0)
            ) {
              cleanup.operationLedger = "removed";
            } else {
              cleanup.operationLedger = "retained-permission-denied";
            }
          }
        } finally {
          await Promise.all([userA.auth.signOut(), userB.auth.signOut()]);
          vi.unstubAllEnvs();
          vi.unstubAllGlobals();
          console.info(
            "D2B2A_CLIENT_LIVE_RESULT",
            JSON.stringify({
              runId,
              passedScenarios,
              revisions,
              conflicts,
              cleanup,
            }),
          );
        }
      }
    }, 30_000);

    it("runs queue to RPC create and update with server revisions", async () => {
      manager.enqueueMediaUpsert(media());
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.revision).toBe(1);
      }, { timeout: 15_000 });
      createdMedia = true;
      revisions.created = mediaState()?.revision ?? 0;
      passedScenarios.push("media_create");

      manager.enqueueMediaUpsert(media("watching"));
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.revision).toBe(2);
      }, { timeout: 15_000 });
      revisions.updated = mediaState()?.revision ?? 0;
      expect(revisions.updated).toBe(revisions.created + 1);
      passedScenarios.push("media_update");
    });

    it("retries an unknown result with the same operation ID idempotently", async () => {
      const realA = asRpcBridge(userA, operationIds);
      liveBridge.client = {
        rpc: async (name, args) => {
          const applied = await realA.rpc(name, args);
          expect(applied.error).toBeNull();
          return { data: null, error: { message: "simulated unknown result" } };
        },
      };
      manager.enqueueMediaUpsert(media("completed"));
      const operationId = queue.loadSyncQueue(scopeA)[0]?.operationId;
      expect(operationId).toBeTruthy();
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)[0]).toMatchObject({
          operationId,
          retryCount: 1,
          dispatchStartedAt: expect.any(String),
        });
      }, { timeout: 15_000 });
      passedScenarios.push("unknown_result_retryable");

      liveBridge.client = realA;
      await manager.flush();
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.revision).toBe(3);
      }, { timeout: 15_000 });
      revisions.idempotentRetry = mediaState()?.revision ?? 0;
      expect(revisions.idempotentRetry).toBe(revisions.updated + 1);
      passedScenarios.push("stable_operation_retry");
    });

    it("keeps stale revision and tombstone conflicts blocked", async () => {
      expect(state.writeCloudMediaV2ServerResult(scopeA, {
        entity: "media_item",
        recordId: mediaId,
        operationId: `${runId}-stale-local-state`,
        revision: revisions.updated,
        deletedAt: null,
      }).ok).toBe(true);
      manager.enqueueMediaUpsert(media("watching"));
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)[0]?.blockedConflict?.reason)
          .toBe("revision_mismatch");
      }, { timeout: 15_000 });
      conflicts.push("revision_mismatch");
      expect(mediaState()?.revision).toBe(revisions.idempotentRetry);
      passedScenarios.push("revision_conflict_blocked");

      manager.enqueueMediaDelete(mediaId);
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.deletedAt).toBeTruthy();
      }, { timeout: 15_000 });
      revisions.deleted = mediaState()?.revision ?? 0;
      expect(revisions.deleted).toBe(revisions.idempotentRetry + 1);
      passedScenarios.push("media_tombstone");

      manager.enqueueMediaUpsert(media("completed"));
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)[0]?.blockedConflict?.reason)
          .toBe("tombstoned");
      }, { timeout: 15_000 });
      conflicts.push("tombstoned");
      passedScenarios.push("tombstone_stale_upsert_blocked");

      expect(manager.enqueueMediaRestore(mediaId)).toBe(true);
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.deletedAt).toBeNull();
      }, { timeout: 15_000 });
      revisions.restored = mediaState()?.revision ?? 0;
      expect(revisions.restored).toBe(revisions.deleted + 1);
      passedScenarios.push("media_restore");
    });

    it("creates and idempotently replays an immutable progress record", async () => {
      manager.enqueueProgressLog(progress());
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(progressState()?.revision).toBe(1);
      }, { timeout: 15_000 });
      createdProgress = true;
      revisions.progressCreated = progressState()?.revision ?? 0;
      passedScenarios.push("progress_create");

      manager.enqueueProgressLog(progress());
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(progressState()?.revision).toBe(1);
      }, { timeout: 15_000 });
      revisions.progressUpdated = progressState()?.revision ?? 0;
      passedScenarios.push("progress_unchanged_update");
    });

    it("isolates User A rows, queue and revision state from User B", async () => {
      const visibleToB = await userB
        .from("media_items")
        .select("id")
        .eq("id", mediaId);
      expect(visibleToB.error).toBeNull();
      expect(visibleToB.data).toEqual([]);

      liveBridge.client = asRpcBridge(userB, operationIds);
      manager.setOwnerScope(scopeB);
      manager.enqueueMediaUpsert(media());
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeB)[0]?.blockedConflict?.reason)
          .toBe("record_id_unavailable");
      }, { timeout: 10_000 });
      expect(queue.loadSyncQueue(scopeA)).toEqual([]);
      expect(state.getCloudMediaV2RecordState(
        scopeB,
        "media_item",
        mediaId,
      )?.revision).toBe(0);
      conflicts.push("record_id_unavailable");
      passedScenarios.push("owner_isolation");
    }, 15_000);

    it("rejects a stale owner response before local revision state changes", async () => {
      const realA = asRpcBridge(userA, operationIds);
      let release!: () => void;
      let networkFinished!: () => void;
      const releasePromise = new Promise<void>((resolve) => { release = resolve; });
      const networkFinishedPromise = new Promise<void>((resolve) => {
        networkFinished = resolve;
      });
      liveBridge.client = {
        rpc: async (name, args) => {
          const result = await realA.rpc(name, args);
          networkFinished();
          await releasePromise;
          return result;
        },
      };
      manager.setOwnerScope(scopeA);
      const beforeRevision = mediaState()?.revision;
      manager.enqueueMediaUpsert(media("completed"));
      await networkFinishedPromise;

      liveBridge.client = asRpcBridge(userB, operationIds);
      manager.setOwnerScope(scopeB);
      release();
      await vi.waitFor(() => {
        expect(mediaState()?.revision).toBe(beforeRevision);
        expect(queue.loadSyncQueue(scopeA)).toHaveLength(1);
      }, { timeout: 15_000 });
      passedScenarios.push("stale_owner_response_rejected");

      liveBridge.client = realA;
      manager.setOwnerScope(scopeA);
      await manager.flush();
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.revision).toBe((beforeRevision ?? 0) + 1);
      }, { timeout: 15_000 });
      revisions.staleRetry = mediaState()?.revision ?? 0;
      passedScenarios.push("stale_operation_safe_retry");
    });
  },
);

if (!liveEnvironmentAvailable) {
  console.info(
    `D2B.2A client live integration skipped; missing: ${
      missingEnvironment.join(", ")
    }`,
  );
}
