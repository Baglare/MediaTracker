import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertSafeSupabaseTestTarget } from "@/lib/supabase-test-target";
import type { MediaItem, ProgressLog, SyncQueueItem } from "@/lib/types";
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

type SyncResult = {
  ok: boolean;
  conflict: boolean;
  reason: string;
  entityType: "media" | "progress";
  recordId: string;
  revision: number;
  deletedAt: string | null;
};

type LiveBridge = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  from: SupabaseClient["from"];
};

const liveBridge = vi.hoisted(() => ({
  client: null as LiveBridge | null,
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
  assertSafeSupabaseTestTarget(requiredEnvironmentValue("SUPABASE_TEST_URL"));
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

function asLiveBridge(
  client: SupabaseClient,
  operationIds: Set<string>,
  rpcCalls: string[],
): LiveBridge {
  return {
    rpc: async (name, args) => {
      rpcCalls.push(name);
      if (typeof args.p_operation_id === "string") {
        operationIds.add(args.p_operation_id);
      }
      const result = await client.rpc(name, args);
      return {
        data: result.data,
        error: result.error ? { message: result.error.message } : null,
      };
    },
    from: client.from.bind(client) as SupabaseClient["from"],
  };
}

describe.skipIf(!liveEnvironmentAvailable)(
  "D2B.2B live conflict resolution integration",
  () => {
    const runId = `d2b2b-conflicts-${randomUUID()}`;
    const mediaId = `${runId}-media`;
    const parentMediaId = `${runId}-parent`;
    const progressId = `${runId}-progress`;
    const mainManualId = randomUUID();
    const parentManualId = randomUUID();
    const operationIds = new Set<string>();
    const rpcCalls: string[] = [];
    const revisions: Record<string, number> = {};
    const conflicts: string[] = [];
    const passedScenarios: string[] = [];
    const cleanup: CleanupResult = {
      media: "not-created",
      progress: "not-created",
      operationLedger: "not-created",
      errors: [],
    };
    const storage = new MemoryStorage();

    let userA: SupabaseClient;
    let userB: SupabaseClient;
    let userAId = "";
    let userBId = "";
    let scopeA: LocalOwnerScope;
    let scopeB: LocalOwnerScope;
    let manager: typeof import("@/lib/sync-manager");
    let queue: typeof import("@/lib/sync-queue");
    let state: typeof import("@/lib/cloud-media-v2-state");
    let conflictsApi: typeof import("@/lib/cloud-media-v2-conflicts");
    let createdMainMedia = false;
    let createdParentMedia = false;
    let createdProgress = false;

    const media = (
      id = mediaId,
      manualId = mainManualId,
      status: MediaItem["status"] = "planning",
    ): MediaItem => ({
      id,
      identity: {
        version: 2,
        key: `v2:manual:item:${manualId}`,
        source: "manual",
        namespace: "item",
        manualId,
      },
      title: `D2B.2B Conflict Live ${id}`,
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
      mediaId: parentMediaId,
      mediaTitle: media(parentMediaId, parentManualId).title,
      mediaType: "movie",
      action: "added",
      amount: 0,
      unit: "movie",
      previousProgress: 0,
      newProgress: 0,
      createdAt: "2026-07-28T12:00:00.000Z",
    });

    const operation = (name: string) => `${runId}-${name}`;
    const mediaState = () =>
      state.getCloudMediaV2RecordState(scopeA, "media_item", mediaId);
    const blockedItem = (
      scope: LocalOwnerScope,
      reason: string,
    ): SyncQueueItem => {
      const item = queue.loadSyncQueue(scope).find(
        (entry) => entry.blockedConflict?.reason === reason,
      );
      expect(item, `Expected blocked conflict: ${reason}`).toBeDefined();
      return item as SyncQueueItem;
    };

    const applyMedia = async (
      client: SupabaseClient,
      name: string,
      operationType: "upsert" | "delete" | "restore",
      expectedRevision: number,
      payload: Record<string, unknown> | null,
    ): Promise<SyncResult> => {
      const operationId = operation(name);
      operationIds.add(operationId);
      const { data, error } = await client.rpc(
        "apply_media_item_sync_operation",
        {
          p_operation_id: operationId,
          p_record_id: mediaId,
          p_operation_type: operationType,
          p_expected_revision: expectedRevision,
          p_payload: payload,
        },
      );
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      return data as SyncResult;
    };

    const directPayload = (status: MediaItem["status"]) => ({
      title: media(mediaId, mainManualId, status).title,
      type: "movie",
      status,
      current_progress: 0,
      total_progress: 1,
      favorite: false,
      tags: [],
      metadata: {},
      identity_status: "resolved",
      canonical_version: 2,
      canonical_key: `v2:manual:item:${mainManualId}`,
      canonical_source: "manual",
      canonical_namespace: "item",
      canonical_stable_id: mainManualId,
    });

    const remoteMediaRow = async () => {
      const { data, error } = await userA
        .from("media_items")
        .select("id,status,revision,deleted_at")
        .eq("id", mediaId)
        .single();
      expect(error).toBeNull();
      return data as {
        id: string;
        status: string;
        revision: number;
        deleted_at: string | null;
      };
    };

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
      liveBridge.client = asLiveBridge(userA, operationIds, rpcCalls);
      manager = await import("@/lib/sync-manager");
      queue = await import("@/lib/sync-queue");
      state = await import("@/lib/cloud-media-v2-state");
      conflictsApi = await import("@/lib/cloud-media-v2-conflicts");
      manager.setOwnerScope(scopeA);

      manager.enqueueMediaUpsert(media());
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.revision).toBe(1);
      }, { timeout: 15_000 });
      createdMainMedia = true;
      revisions.created = mediaState()?.revision ?? 0;
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
          const mediaIds = [
            ...(createdMainMedia ? [mediaId] : []),
            ...(createdParentMedia ? [parentMediaId] : []),
          ];
          if (mediaIds.length > 0) {
            const { error } = await userA
              .from("media_items")
              .delete()
              .in("id", mediaIds);
            cleanup.media = error ? "failed" : "removed";
            if (error) cleanup.errors.push(`media:${error.code}`);
          }

          if (operationIds.size === 0) {
            cleanup.operationLedger = "not-created";
          } else {
            const ledgerAttempts = await Promise.all(
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
            if (
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
              cleanup.operationLedger = remaining.every(
                ({ data, error }) => !error && (data?.length ?? 0) === 0,
              )
                ? "removed"
                : "retained-permission-denied";
            }
          }
        } finally {
          await Promise.all([userA.auth.signOut(), userB.auth.signOut()]);
          vi.unstubAllEnvs();
          vi.unstubAllGlobals();
          console.info(
            "D2B2B_CONFLICT_LIVE_RESULT",
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

    it("resolves revision_mismatch by using remote or retrying local", async () => {
      const remoteUpdate = await applyMedia(
        userA,
        "remote-r2",
        "upsert",
        revisions.created,
        directPayload("watching"),
      );
      expect(remoteUpdate).toMatchObject({
        ok: true,
        conflict: false,
        revision: 2,
      });
      revisions.remoteBeforeUse = remoteUpdate.revision;

      manager.enqueueMediaUpsert(media(mediaId, mainManualId, "completed"));
      await vi.waitFor(() => {
        expect(blockedItem(scopeA, "revision_mismatch")).toBeDefined();
      }, { timeout: 15_000 });
      const useRemoteBlocked = blockedItem(scopeA, "revision_mismatch");
      const useRemoteCard = conflictsApi.describeCloudV2Conflict(useRemoteBlocked);
      expect(useRemoteCard?.actions).toContain("use-remote");
      const remoteSummary = await conflictsApi.fetchCloudV2RemoteSummary(
        useRemoteCard!,
      );
      expect(remoteSummary).toMatchObject({
        ok: true,
        summary: { revision: remoteUpdate.revision, status: "watching" },
      });
      const remoteItem = await conflictsApi.fetchCloudMediaForConflict(
        userAId,
        mediaId,
      );
      expect(remoteItem).toMatchObject({
        ok: true,
        item: { id: mediaId, status: "watching" },
      });
      expect(manager.acknowledgeCloudV2Conflict(
        scopeA,
        useRemoteBlocked.id,
      )).toEqual({ ok: true });
      expect(queue.loadSyncQueue(scopeA)).toEqual([]);
      expect(mediaState()).toMatchObject({
        revision: remoteUpdate.revision,
        deletedAt: null,
      });
      expect(mediaState()?.conflict).toBeUndefined();
      conflicts.push("revision_mismatch");
      passedScenarios.push("revision_use_remote");

      const nextRemote = await applyMedia(
        userA,
        "remote-r3",
        "upsert",
        remoteUpdate.revision,
        directPayload("planning"),
      );
      expect(nextRemote.revision).toBe(remoteUpdate.revision + 1);
      revisions.remoteBeforeRetry = nextRemote.revision;
      manager.enqueueMediaUpsert(media(mediaId, mainManualId, "completed"));
      await vi.waitFor(() => {
        expect(blockedItem(scopeA, "revision_mismatch")).toBeDefined();
      }, { timeout: 15_000 });
      const retryBlocked = blockedItem(scopeA, "revision_mismatch");
      const oldOperationId = retryBlocked.operationId;

      const realA = asLiveBridge(userA, operationIds, rpcCalls);
      let release!: () => void;
      let started!: () => void;
      const releasePromise = new Promise<void>((resolve) => { release = resolve; });
      const startedPromise = new Promise<void>((resolve) => { started = resolve; });
      liveBridge.client = {
        ...realA,
        rpc: async (name, args) => {
          started();
          await releasePromise;
          return realA.rpc(name, args);
        },
      };
      const retryResult = manager.retryCloudV2Conflict(
        scopeA,
        retryBlocked.id,
        nextRemote.revision,
      );
      expect(retryResult.ok).toBe(true);
      expect(retryResult.operationId).toBeTruthy();
      expect(retryResult.operationId).not.toBe(oldOperationId);
      await startedPromise;
      const retriedItem = queue.loadSyncQueue(scopeA).find(
        (entry) => entry.operationId === retryResult.operationId,
      );
      expect(retriedItem).toMatchObject({
        expectedRevision: nextRemote.revision,
        operationId: retryResult.operationId,
      });
      release();
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.revision).toBe(nextRemote.revision + 1);
      }, { timeout: 15_000 });
      revisions.localRetry = mediaState()?.revision ?? 0;
      expect((await remoteMediaRow()).status).toBe("completed");
      passedScenarios.push("revision_retry_local_new_operation");
    }, 45_000);

    it("keeps a tombstone unchanged or restores it explicitly", async () => {
      const deleted = await applyMedia(
        userA,
        "remote-delete",
        "delete",
        revisions.localRetry,
        null,
      );
      expect(deleted).toMatchObject({
        ok: true,
        conflict: false,
        reason: "deleted",
      });
      revisions.tombstoned = deleted.revision;

      manager.enqueueMediaUpsert(media(mediaId, mainManualId, "watching"));
      await vi.waitFor(() => {
        expect(blockedItem(scopeA, "tombstoned")).toBeDefined();
      }, { timeout: 15_000 });
      const keepBlocked = blockedItem(scopeA, "tombstoned");
      const beforeKeep = await remoteMediaRow();
      expect(manager.acknowledgeCloudV2Conflict(scopeA, keepBlocked.id))
        .toEqual({ ok: true });
      const afterKeep = await remoteMediaRow();
      expect(afterKeep).toEqual(beforeKeep);
      expect(afterKeep.deleted_at).toBeTruthy();
      expect(mediaState()?.conflict).toBeUndefined();
      conflicts.push("tombstoned");
      passedScenarios.push("tombstone_keep_deleted");

      expect(manager.enqueueMediaRestore(mediaId)).toBe(true);
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.deletedAt).toBeNull();
      }, { timeout: 15_000 });
      revisions.restored = mediaState()?.revision ?? 0;
      expect(revisions.restored).toBe(deleted.revision + 1);
      expect((await remoteMediaRow()).deleted_at).toBeNull();
      passedScenarios.push("tombstone_explicit_restore");
    }, 30_000);

    it("syncs a missing parent before retrying progress", async () => {
      manager.enqueueProgressLog(progress());
      await vi.waitFor(() => {
        expect(blockedItem(scopeA, "media_target_unavailable")).toBeDefined();
      }, { timeout: 15_000 });
      const blocked = blockedItem(scopeA, "media_target_unavailable");
      const operationId = blocked.operationId;
      const result = manager.retryProgressAfterParent(
        scopeA,
        blocked.id,
        media(parentMediaId, parentManualId),
      );
      expect(result.ok).toBe(true);
      expect(result.operationId).not.toBe(operationId);
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(state.getCloudMediaV2RecordState(
          scopeA,
          "media_item",
          parentMediaId,
        )?.revision).toBe(1);
        expect(state.getCloudMediaV2RecordState(
          scopeA,
          "progress_log",
          progressId,
        )?.revision).toBe(1);
      }, { timeout: 15_000 });
      createdParentMedia = true;
      createdProgress = true;
      conflicts.push("media_target_unavailable");
      passedScenarios.push("parent_media_then_progress");
    }, 30_000);

    it("keeps record_id_unavailable blocked without automatic retry", async () => {
      liveBridge.client = asLiveBridge(userB, operationIds, rpcCalls);
      manager.setOwnerScope(scopeB);
      manager.enqueueMediaUpsert(media());
      await vi.waitFor(() => {
        expect(blockedItem(scopeB, "record_id_unavailable")).toBeDefined();
      }, { timeout: 15_000 });
      const blocked = blockedItem(scopeB, "record_id_unavailable");
      const card = conflictsApi.describeCloudV2Conflict(blocked);
      expect(card).toMatchObject({
        reason: "record_id_unavailable",
        manualOnly: true,
        actions: ["defer"],
      });
      const callsBefore = rpcCalls.length;
      await manager.flush();
      await manager.flush();
      expect(rpcCalls).toHaveLength(callsBefore);
      expect(queue.loadSyncQueue(scopeB)).toContainEqual(blocked);
      expect(blocked.retryCount).toBe(0);
      conflicts.push("record_id_unavailable");
      passedScenarios.push("record_id_manual_only_no_retry");
    }, 30_000);

    it("rejects a stale owner resolution result and safely replays it", async () => {
      const realA = asLiveBridge(userA, operationIds, rpcCalls);
      liveBridge.client = realA;
      manager.setOwnerScope(scopeA);
      const remoteUpdate = await applyMedia(
        userA,
        "stale-owner-remote",
        "upsert",
        revisions.restored,
        directPayload("watching"),
      );
      revisions.staleRemote = remoteUpdate.revision;
      manager.enqueueMediaUpsert(media(mediaId, mainManualId, "completed"));
      await vi.waitFor(() => {
        expect(blockedItem(scopeA, "revision_mismatch")).toBeDefined();
      }, { timeout: 15_000 });
      const blocked = blockedItem(scopeA, "revision_mismatch");

      let release!: () => void;
      let networkFinished!: () => void;
      const releasePromise = new Promise<void>((resolve) => { release = resolve; });
      const networkFinishedPromise = new Promise<void>((resolve) => {
        networkFinished = resolve;
      });
      liveBridge.client = {
        ...realA,
        rpc: async (name, args) => {
          const result = await realA.rpc(name, args);
          networkFinished();
          await releasePromise;
          return result;
        },
      };
      const resolution = manager.retryCloudV2Conflict(
        scopeA,
        blocked.id,
        remoteUpdate.revision,
      );
      expect(resolution.ok).toBe(true);
      await networkFinishedPromise;

      liveBridge.client = asLiveBridge(userB, operationIds, rpcCalls);
      manager.setOwnerScope(scopeB);
      release();
      await vi.waitFor(() => {
        expect(mediaState()?.revision).toBe(remoteUpdate.revision);
        expect(queue.loadSyncQueue(scopeA).some(
          (entry) => entry.operationId === resolution.operationId,
        )).toBe(true);
      }, { timeout: 15_000 });
      expect(state.getCloudMediaV2RecordState(
        scopeB,
        "media_item",
        mediaId,
      )?.revision).toBe(0);
      passedScenarios.push("stale_owner_resolution_rejected");

      liveBridge.client = realA;
      manager.setOwnerScope(scopeA);
      await manager.flush();
      await vi.waitFor(() => {
        expect(queue.loadSyncQueue(scopeA)).toEqual([]);
        expect(mediaState()?.revision).toBe(remoteUpdate.revision + 1);
      }, { timeout: 15_000 });
      revisions.staleResolutionRetry = mediaState()?.revision ?? 0;
      passedScenarios.push("stale_resolution_stable_retry");
    }, 45_000);
  },
);

if (!liveEnvironmentAvailable) {
  console.info(
    `D2B.2B conflict live integration skipped; missing: ${
      missingEnvironment.join(", ")
    }`,
  );
}
