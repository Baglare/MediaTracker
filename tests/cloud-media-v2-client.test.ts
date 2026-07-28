import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCloudMediaV2Payload,
  buildCloudProgressV2Payload,
  decodeCloudMediaV2Result,
  dispatchCloudMediaV2QueueItem,
  isCloudMediaV2Enabled,
  type CloudMediaV2RpcClient,
} from "@/lib/cloud-media-v2-client";
import {
  createCanonicalMediaIdentity,
} from "@/lib/media-identity";
import {
  buildLegacyScopedSyncQueueKey,
  buildSyncQueueKey,
  loadSyncQueue,
} from "@/lib/sync-queue";
import { createUserOwnerScope } from "@/lib/local-owner-scope";
import type {
  MediaItem,
  ProgressLog,
  SyncOperation,
  SyncQueueItem,
} from "@/lib/types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const scope = createUserOwnerScope("11111111-1111-4111-8111-111111111111");

function media(): MediaItem {
  return {
    id: "media-1",
    identity: createCanonicalMediaIdentity({
      source: "tmdb",
      namespace: "movie",
      stableId: "123",
    })!,
    title: "V2 Movie",
    type: "movie",
    status: "planning",
    coverImage: "/cover.jpg",
    currentProgress: 0,
    totalProgress: 0,
    favorite: true,
    tags: ["v2"],
    personalNotes: "private local note",
  };
}

function progress(): ProgressLog {
  return {
    id: "log-1",
    mediaId: "media-1",
    mediaTitle: "V2 Movie",
    mediaType: "movie",
    action: "added",
    amount: 0,
    unit: "movie",
    previousProgress: 0,
    newProgress: 0,
    createdAt: "2026-07-28T10:00:00.000Z",
  };
}

function queueItem(
  operation: SyncOperation = "upsert",
  overrides: Partial<SyncQueueItem> = {},
): SyncQueueItem {
  return {
    schemaVersion: 2,
    id: "stable-operation-id",
    operationId: "stable-operation-id",
    transport: "cloud-v2",
    entity: "media_item",
    operation,
    expectedRevision: operation === "upsert" ? 0 : 2,
    payload: operation === "upsert" ? media() : { id: "media-1" },
    createdAt: "2026-07-28T10:00:00.000Z",
    retryCount: 0,
    ownerScope: scope.key,
    userId: scope.userId,
    ...overrides,
  };
}

function rpcClient(result: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { client: { rpc } as CloudMediaV2RpcClient, rpc };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("Cloud Media V2 client adapter", () => {
  it("keeps the rollout flag disabled unless explicitly enabled", () => {
    expect(isCloudMediaV2Enabled(undefined)).toBe(false);
    expect(isCloudMediaV2Enabled("false")).toBe(false);
    expect(isCloudMediaV2Enabled("true")).toBe(true);
  });

  it("maps MediaItem identity separately from record id", () => {
    const payload = buildCloudMediaV2Payload(scope.userId, media());
    expect(payload).toMatchObject({
      canonical_version: 2,
      canonical_key: "v2:tmdb:movie:123",
      canonical_source: "tmdb",
      canonical_namespace: "movie",
      canonical_stable_id: "123",
      identity_status: "resolved",
      total_progress: 0,
    });
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("xp");
    expect(payload).not.toHaveProperty("social");
    expect(payload).not.toHaveProperty("canonicalMediaKey");
  });

  it("maps progress with the exact D2B.1 payload names", () => {
    expect(buildCloudProgressV2Payload(scope.userId, progress())).toEqual({
      media_id: "media-1",
      media_title: "V2 Movie",
      media_type: "movie",
      action: "added",
      amount: 0,
      unit: "movie",
      previous_progress: 0,
      new_progress: 0,
      created_at: "2026-07-28T10:00:00.000Z",
    });
  });

  it.each([
    ["upsert", 0, "created", 1],
    ["upsert", 1, "updated", 2],
    ["delete", 2, "deleted", 3],
    ["restore", 3, "restored", 4],
  ] as const)(
    "dispatches media %s with stable operation and expected revision",
    async (operation, expectedRevision, reason, revision) => {
      const item = queueItem(operation, { expectedRevision });
      const { client, rpc } = rpcClient({
        ok: true,
        conflict: false,
        reason,
        entityType: "media",
        recordId: "media-1",
        revision,
        deletedAt: operation === "delete"
          ? "2026-07-28T11:00:00.000Z"
          : null,
      });
      const result = await dispatchCloudMediaV2QueueItem(
        scope.userId,
        item,
        client,
      );
      expect(result).toMatchObject({ kind: "applied", reason, revision });
      expect(rpc).toHaveBeenCalledWith(
        "apply_media_item_sync_operation",
        expect.objectContaining({
          p_operation_id: "stable-operation-id",
          p_record_id: "media-1",
          p_operation_type: operation,
          p_expected_revision: expectedRevision,
          p_payload: operation === "upsert" ? expect.any(Object) : null,
        }),
      );
    },
  );

  it("dispatches progress create/update through the progress RPC", async () => {
    const item = queueItem("upsert", {
      entity: "progress_log",
      payload: progress(),
      expectedRevision: 1,
    });
    const { client, rpc } = rpcClient({
      ok: true,
      conflict: false,
      reason: "unchanged",
      entityType: "progress",
      recordId: "log-1",
      revision: 1,
      deletedAt: null,
    });
    await dispatchCloudMediaV2QueueItem(scope.userId, item, client);
    expect(rpc).toHaveBeenCalledWith(
      "apply_progress_log_sync_operation",
      expect.objectContaining({
        p_operation_id: "stable-operation-id",
        p_record_id: "log-1",
        p_operation_type: "upsert",
        p_expected_revision: 1,
      }),
    );
  });

  it.each([
    "revision_mismatch",
    "tombstoned",
    "record_id_unavailable",
    "media_target_unavailable",
  ] as const)("decodes %s as a controlled domain conflict", (reason) => {
    expect(decodeCloudMediaV2Result({
      ok: false,
      conflict: true,
      reason,
      entityType: "media",
      recordId: "media-1",
      revision: 4,
      deletedAt: null,
    }, queueItem())).toEqual({
      kind: "conflict",
      reason,
      revision: 4,
      deletedAt: null,
    });
  });

  it("normalizes an omitted deletedAt on a no-row conflict", () => {
    expect(decodeCloudMediaV2Result({
      ok: false,
      conflict: true,
      reason: "record_id_unavailable",
      entityType: "media",
      recordId: "media-1",
      revision: 0,
    }, queueItem())).toEqual({
      kind: "conflict",
      reason: "record_id_unavailable",
      revision: 0,
      deletedAt: null,
    });
  });

  it("retries with the same operation id and does not rewrite expected revision", async () => {
    const item = queueItem();
    const response = {
      ok: true,
      conflict: false,
      reason: "created",
      entityType: "media",
      recordId: "media-1",
      revision: 1,
      deletedAt: null,
    };
    const { client, rpc } = rpcClient(response);
    await dispatchCloudMediaV2QueueItem(scope.userId, item, client);
    await dispatchCloudMediaV2QueueItem(scope.userId, item, client);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
  });

  it("keeps network errors retryable and rejects unknown RPC results", async () => {
    const networkClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "network request failed" },
      }),
    } as CloudMediaV2RpcClient;
    await expect(
      dispatchCloudMediaV2QueueItem(scope.userId, queueItem(), networkClient),
    ).resolves.toEqual({
      kind: "retryable-error",
      error: "network request failed",
    });
    expect(decodeCloudMediaV2Result(
      { ok: true, revision: "wrong" },
      queueItem(),
    )).toMatchObject({ kind: "invalid-response" });
  });

  it("migrates the scoped raw v1 queue to a v2 envelope without changing operation id", () => {
    const storage = new MemoryStorage();
    storage.setItem(buildLegacyScopedSyncQueueKey(scope), JSON.stringify([
      {
        id: "legacy-operation-id",
        entity: "media_item",
        operation: "upsert",
        payload: media(),
        createdAt: "2026-07-28T10:00:00.000Z",
        retryCount: 0,
        ownerScope: scope.key,
        userId: scope.userId,
      },
    ]));
    expect(loadSyncQueue(scope, storage)).toMatchObject([
      {
        schemaVersion: 2,
        id: "legacy-operation-id",
        operationId: "legacy-operation-id",
        transport: "legacy",
        expectedRevision: 0,
      },
    ]);
    expect(storage.getItem(buildSyncQueueKey(scope))).toContain(
      '"schemaVersion":2',
    );
    expect(storage.getItem(buildLegacyScopedSyncQueueKey(scope))).not.toBeNull();
  });
});
