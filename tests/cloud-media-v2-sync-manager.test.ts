import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/types";
import {
  createUserOwnerScope,
  GUEST_OWNER_SCOPE,
} from "@/lib/local-owner-scope";

const v2Mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
}));

vi.mock("@/lib/cloud-media-v2-client", () => ({
  isCloudMediaV2Enabled: () =>
    process.env.NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED === "true",
  dispatchCloudMediaV2QueueItem: v2Mocks.dispatch,
}));

vi.mock("@/lib/supabase/cloud-repository", () => ({
  deleteMediaItem: vi.fn(),
  uploadMediaItems: vi.fn(),
  uploadProgressLogs: vi.fn(),
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

function media(id = "media-1"): MediaItem {
  return {
    id,
    title: "V2",
    type: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 0,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED", "true");
  const storage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloud Media V2 sync manager integration", () => {
  it("enqueues V2 work and persists only the server revision after success", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const state = await import("@/lib/cloud-media-v2-state");
    const scope = createUserOwnerScope("user-a");
    manager.setOwnerScope(scope);
    v2Mocks.dispatch.mockResolvedValue({
      kind: "applied",
      reason: "created",
      revision: 7,
      deletedAt: null,
    });
    manager.enqueueMediaUpsert(media());
    const item = queue.loadSyncQueue(scope)[0];
    expect(item).toMatchObject({
      schemaVersion: 2,
      transport: "cloud-v2",
      operationId: expect.any(String),
      expectedRevision: 0,
    });

    await vi.waitFor(() => {
      expect(queue.loadSyncQueue(scope)).toEqual([]);
      expect(state.getCloudMediaV2RecordState(
        scope,
        "media_item",
        "media-1",
      )).toMatchObject({ revision: 7, deletedAt: null });
    });
  });

  it("keeps controlled conflicts blocked without overwriting local media", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setOwnerScope(scope);
    v2Mocks.dispatch.mockResolvedValue({
      kind: "conflict",
      reason: "revision_mismatch",
      revision: 9,
      deletedAt: null,
    });
    manager.enqueueMediaUpsert(media());

    await vi.waitFor(() => {
      expect(queue.loadSyncQueue(scope)).toMatchObject([
        {
          retryCount: 0,
          blockedConflict: {
            reason: "revision_mismatch",
            serverRevision: 9,
          },
        },
      ]);
    });
    await manager.flush();
    expect(v2Mocks.dispatch).toHaveBeenCalledTimes(1);
  });

  it("allows an explicit restore to supersede a blocked tombstone conflict", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setOwnerScope(scope);
    v2Mocks.dispatch.mockResolvedValueOnce({
      kind: "conflict",
      reason: "tombstoned",
      revision: 4,
      deletedAt: "2026-07-28T12:00:00.000Z",
    });
    manager.enqueueMediaUpsert(media());
    await vi.waitFor(() => {
      expect(queue.loadSyncQueue(scope)[0].blockedConflict?.reason)
        .toBe("tombstoned");
    });

    v2Mocks.dispatch.mockResolvedValueOnce({
      kind: "applied",
      reason: "restored",
      revision: 5,
      deletedAt: null,
    });
    expect(manager.enqueueMediaRestore("media-1")).toBe(true);
    await vi.waitFor(() => {
      expect(queue.loadSyncQueue(scope)).toEqual([]);
    });
    expect(v2Mocks.dispatch.mock.calls[1]?.[1]).toMatchObject({
      operation: "restore",
      expectedRevision: 4,
    });
  });

  it("resolves revision conflict as a new logical operation without changing it during retry", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setOwnerScope(scope);
    queue.saveSyncQueue(scope, [{
      schemaVersion: 2,
      id: "blocked-operation-id",
      operationId: "blocked-operation-id",
      transport: "cloud-v2",
      entity: "media_item",
      operation: "upsert",
      expectedRevision: 2,
      payload: media(),
      createdAt: "2026-07-28T10:00:00.000Z",
      retryCount: 0,
      dispatchStartedAt: "2026-07-28T10:00:01.000Z",
      ownerScope: scope.key,
      userId: scope.userId,
      blockedConflict: {
        reason: "revision_mismatch",
        serverRevision: 4,
        serverDeletedAt: null,
        detectedAt: "2026-07-28T10:00:02.000Z",
      },
    }]);

    const result = manager.retryCloudV2Conflict(
      scope,
      "blocked-operation-id",
      4,
    );
    expect(result.ok).toBe(true);
    const [replacement] = queue.loadSyncQueue(scope);
    expect(replacement).toMatchObject({
      expectedRevision: 4,
      operation: "upsert",
    });
    expect(replacement).not.toHaveProperty("blockedConflict");
    expect(replacement.operationId).not.toBe("blocked-operation-id");
    expect(queue.loadSyncQueue(scope)[0].operationId)
      .toBe(replacement.operationId);
    expect(v2Mocks.dispatch).not.toHaveBeenCalled();
  });

  it("queues parent media before retrying a blocked progress operation", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setOwnerScope(scope);
    queue.saveSyncQueue(scope, [{
      schemaVersion: 2,
      id: "blocked-progress-id",
      operationId: "blocked-progress-id",
      transport: "cloud-v2",
      entity: "progress_log",
      operation: "upsert",
      expectedRevision: 0,
      payload: {
        id: "log-1",
        mediaId: "media-1",
        mediaTitle: "V2",
        mediaType: "movie",
        action: "added",
        amount: 0,
        unit: "movie",
        previousProgress: 0,
        newProgress: 0,
        createdAt: "2026-07-28T10:00:00.000Z",
      },
      createdAt: "2026-07-28T10:00:00.000Z",
      retryCount: 0,
      dispatchStartedAt: "2026-07-28T10:00:01.000Z",
      ownerScope: scope.key,
      userId: scope.userId,
      blockedConflict: {
        reason: "media_target_unavailable",
        serverRevision: 0,
        serverDeletedAt: null,
        detectedAt: "2026-07-28T10:00:02.000Z",
      },
    }]);

    expect(manager.retryProgressAfterParent(
      scope,
      "blocked-progress-id",
      media(),
    ).ok).toBe(true);
    expect(queue.loadSyncQueue(scope).map((item) => item.entity)).toEqual([
      "media_item",
      "progress_log",
    ]);
    expect(queue.loadSyncQueue(scope)[1]).toMatchObject({
      expectedRevision: 0,
    });
    expect(queue.loadSyncQueue(scope)[1]).not.toHaveProperty("blockedConflict");
  });

  it("acknowledges a blocked conflict and clears only its local conflict state", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const state = await import("@/lib/cloud-media-v2-state");
    const scope = createUserOwnerScope("user-a");
    manager.setOwnerScope(scope);
    queue.saveSyncQueue(scope, [{
      schemaVersion: 2,
      id: "blocked-use-remote",
      operationId: "blocked-use-remote",
      transport: "cloud-v2",
      entity: "media_item",
      operation: "upsert",
      expectedRevision: 2,
      payload: media(),
      createdAt: "2026-07-28T10:00:00.000Z",
      retryCount: 0,
      ownerScope: scope.key,
      userId: scope.userId,
      blockedConflict: {
        reason: "revision_mismatch",
        serverRevision: 4,
        serverDeletedAt: null,
        detectedAt: "2026-07-28T10:00:02.000Z",
      },
    }]);
    expect(state.writeCloudMediaV2ServerResult(scope, {
      entity: "media_item",
      recordId: "media-1",
      operationId: "blocked-use-remote",
      revision: 4,
      deletedAt: null,
      conflict: "revision_mismatch",
    }).ok).toBe(true);

    expect(manager.acknowledgeCloudV2Conflict(
      scope,
      "blocked-use-remote",
    )).toEqual({ ok: true });
    expect(queue.loadSyncQueue(scope)).toEqual([]);
    expect(state.getCloudMediaV2RecordState(
      scope,
      "media_item",
      "media-1",
    )).toMatchObject({
      revision: 4,
      deletedAt: null,
    });
    expect(state.getCloudMediaV2RecordState(
      scope,
      "media_item",
      "media-1",
    )?.conflict).toBeUndefined();
    expect(v2Mocks.dispatch).not.toHaveBeenCalled();
  });

  it("keeps network failures retryable with the same operation id", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setOwnerScope(scope);
    v2Mocks.dispatch.mockResolvedValue({
      kind: "retryable-error",
      error: "network request failed",
    });
    manager.enqueueMediaUpsert(media());
    const operationId = queue.loadSyncQueue(scope)[0].operationId;

    await vi.waitFor(() => {
      expect(queue.loadSyncQueue(scope)[0]).toMatchObject({
        operationId,
        retryCount: 1,
        dispatchStartedAt: expect.any(String),
      });
    });
  });

  it("never dispatches guest work even when the V2 flag is enabled", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    manager.setOwnerScope(GUEST_OWNER_SCOPE);
    manager.enqueueMediaUpsert(media());
    await manager.flush();
    expect(v2Mocks.dispatch).not.toHaveBeenCalled();
    expect(queue.loadSyncQueue(GUEST_OWNER_SCOPE)[0].transport).toBe("legacy");
  });

  it("does not apply a stale User A response to User B queue state", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const state = await import("@/lib/cloud-media-v2-state");
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    let resolve!: (value: {
      kind: "applied";
      reason: string;
      revision: number;
      deletedAt: null;
    }) => void;
    v2Mocks.dispatch
      .mockImplementationOnce(() =>
        new Promise((done) => { resolve = done; }))
      .mockResolvedValue({
        kind: "retryable-error",
        error: "network request failed",
      });
    manager.setOwnerScope(userA);
    manager.enqueueMediaUpsert(media("media-a"));
    manager.setOwnerScope(userB);
    manager.enqueueMediaUpsert(media("media-b"));
    resolve({
      kind: "applied",
      reason: "created",
      revision: 1,
      deletedAt: null,
    });
    await vi.waitFor(() => {
      expect(queue.loadSyncQueue(userB)).toHaveLength(1);
      expect(queue.loadSyncQueue(userB)[0].payload).toMatchObject({
        id: "media-b",
      });
      expect(state.getCloudMediaV2RecordState(
        userA,
        "media_item",
        "media-a",
      )).toBeUndefined();
      expect(queue.loadSyncQueue(userA)).toHaveLength(1);
    });
  });
});
