import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, SyncQueueItem } from "@/lib/types";
import { createUserOwnerScope, GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";

const cloudMocks = vi.hoisted(() => ({
  deleteMediaItem: vi.fn(),
  uploadMediaItems: vi.fn(),
  uploadProgressLogs: vi.fn(),
}));

vi.mock("@/lib/supabase/cloud-repository", () => cloudMocks);

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function mediaItem(id: string, title = `Title ${id}`): MediaItem {
  return {
    id,
    title,
    type: "movie",
    status: "planning",
    coverImage: "/placeholders/movie.svg",
    currentProgress: 0,
    totalProgress: 1,
  };
}

function queueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: "queue-1",
    entity: "media_item",
    operation: "upsert",
    payload: mediaItem("m1"),
    createdAt: "2026-07-20T10:00:00.000Z",
    retryCount: 0,
    ownerScope: "user:user-a",
    userId: "user-a",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sync queue and manager", () => {
  it("keeps the hydration server snapshot referentially stable", async () => {
    const manager = await import("@/lib/sync-manager");

    expect(manager.getServerSnapshot()).toBe(manager.getServerSnapshot());
  });

  it("enqueues a new media item upsert", async () => {
    const manager = await import("@/lib/sync-manager");
    const { loadSyncQueue } = await import("@/lib/sync-queue");
    manager.setOwnerScope(GUEST_OWNER_SCOPE);

    manager.enqueueMediaUpsert(mediaItem("m1"));

    expect(loadSyncQueue(GUEST_OWNER_SCOPE)).toMatchObject([
      { entity: "media_item", operation: "upsert", payload: { id: "m1" }, retryCount: 0 },
    ]);
  });

  it("coalesces repeated upserts for the same entity id to the latest payload", async () => {
    const manager = await import("@/lib/sync-manager");
    const { loadSyncQueue } = await import("@/lib/sync-queue");
    manager.setOwnerScope(GUEST_OWNER_SCOPE);

    manager.enqueueMediaUpsert(mediaItem("m1", "Old"));
    manager.enqueueMediaUpsert(mediaItem("m1", "Latest"));

    const queue = loadSyncQueue(GUEST_OWNER_SCOPE);
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toMatchObject({ id: "m1", title: "Latest" });
  });

  it("replaces a pending upsert with a delete for the same entity id", async () => {
    const manager = await import("@/lib/sync-manager");
    const { loadSyncQueue } = await import("@/lib/sync-queue");
    manager.setOwnerScope(GUEST_OWNER_SCOPE);

    manager.enqueueMediaUpsert(mediaItem("m1"));
    manager.enqueueMediaDelete("m1");

    expect(loadSyncQueue(GUEST_OWNER_SCOPE)).toMatchObject([
      { entity: "media_item", operation: "delete", payload: { id: "m1" } },
    ]);
  });

  it("keeps the same entity id in separate owner queues", async () => {
    const queue = await import("@/lib/sync-queue");
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");

    queue.enqueueSyncOperation(userA, {
      entity: "media_item",
      operation: "upsert",
      payload: mediaItem("tmdb-123", "A"),
    });
    queue.enqueueSyncOperation(userB, {
      entity: "media_item",
      operation: "upsert",
      payload: mediaItem("tmdb-123", "B"),
    });

    expect(queue.loadSyncQueue(userA)[0].payload).toMatchObject({ title: "A" });
    expect(queue.loadSyncQueue(userB)[0].payload).toMatchObject({ title: "B" });
  });

  it("never flushes a guest queue", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    manager.setOwnerScope(GUEST_OWNER_SCOPE);
    manager.enqueueMediaUpsert(mediaItem("m1"));

    await manager.flush();

    expect(cloudMocks.uploadMediaItems).not.toHaveBeenCalled();
    expect(queue.loadSyncQueue(GUEST_OWNER_SCOPE)).toHaveLength(1);
  });

  it("removes a successfully flushed item", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setUserId("user-a");
    queue.saveSyncQueue(scope, [queueItem()]);
    cloudMocks.uploadMediaItems.mockResolvedValue({ ok: true });

    await manager.flush();

    expect(queue.loadSyncQueue(scope)).toEqual([]);
    expect(cloudMocks.uploadMediaItems).toHaveBeenCalledWith("user-a", [mediaItem("m1")]);
  });

  it("durably marks an item before its remote dispatch resolves", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setUserId("user-a");
    queue.saveSyncQueue(scope, [queueItem()]);
    let resolveUpload!: (value: { ok: true }) => void;
    cloudMocks.uploadMediaItems.mockImplementation(() =>
      new Promise((resolve) => { resolveUpload = resolve; })
    );

    const flushing = manager.flush();

    expect(queue.loadSyncQueue(scope)[0].dispatchStartedAt).toBeTruthy();
    resolveUpload({ ok: true });
    await flushing;
  });

  it("retries a crash-persisted dispatch marker with the same operation id", async () => {
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    const persistedDispatchAt = "2026-07-20T10:01:00.000Z";
    queue.saveSyncQueue(scope, [queueItem({
      id: "stable-operation-id",
      dispatchStartedAt: persistedDispatchAt,
    })]);
    cloudMocks.uploadMediaItems
      .mockResolvedValueOnce({ ok: false, error: "network request failed" })
      .mockResolvedValueOnce({ ok: true });

    // Yeni modül örneği, uygulamanın crash/reload sonrasındaki manager state'ini temsil eder.
    vi.resetModules();
    const reloadedManager = await import("@/lib/sync-manager");
    reloadedManager.setUserId("user-a");
    await vi.waitFor(() => {
      expect(queue.loadSyncQueue(scope)[0]).toMatchObject({
        id: "stable-operation-id",
        retryCount: 1,
        lastError: "Ağ hatası.",
        dispatchStartedAt: persistedDispatchAt,
      });
    });

    await reloadedManager.flush();

    expect(cloudMocks.uploadMediaItems).toHaveBeenCalledTimes(2);
    expect(queue.loadSyncQueue(scope)).toEqual([]);
  });

  it("keeps a failed item and updates retryCount and lastError", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    manager.setUserId("user-a");
    queue.saveSyncQueue(scope, [queueItem({ retryCount: 2 })]);
    cloudMocks.uploadMediaItems.mockResolvedValue({ ok: false, error: "network request failed" });

    await manager.flush();

    expect(queue.loadSyncQueue(scope)).toMatchObject([
      {
        id: "queue-1",
        retryCount: 3,
        lastError: "Ağ hatası.",
        dispatchStartedAt: expect.any(String),
      },
    ]);
  });

  it("does not flush an item owned by another user", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    manager.setUserId("user-a");
    queue.saveSyncQueue(userB, [queueItem({ ownerScope: userB.key, userId: "user-b" })]);

    await manager.flush();

    expect(cloudMocks.uploadMediaItems).not.toHaveBeenCalled();
    expect(queue.loadSyncQueue(userA)).toHaveLength(0);
    expect(queue.loadSyncQueue(userB)).toHaveLength(1);
  });

  it("never adopts an ownerless legacy item into the signed-in user", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    localStorage.setItem(queue.LEGACY_SYNC_QUEUE_KEY, JSON.stringify([
      { ...queueItem(), ownerScope: undefined, userId: undefined },
    ]));
    manager.setUserId("user-a");

    await manager.flush();

    expect(cloudMocks.uploadMediaItems).not.toHaveBeenCalled();
    expect(queue.loadSyncQueue(scope)).toEqual([]);
    expect(localStorage.getItem(queue.LEGACY_SYNC_QUEUE_KEY)).not.toBeNull();
    expect(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .some((key) => key?.startsWith("mediaTracker:quarantine:cloud-sync-queue:")),
    ).toBe(true);
  });

  it("keeps the previous user's queue after logout", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const userA = createUserOwnerScope("user-a");
    manager.setUserId("user-a");
    queue.saveSyncQueue(userA, [queueItem()]);
    manager.setUserId(null);

    await manager.flush();

    expect(cloudMocks.uploadMediaItems).not.toHaveBeenCalled();
    expect(queue.loadSyncQueue(userA)).toHaveLength(1);
  });

  it("does not let a stale flush remove the next user's queue", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    queue.saveSyncQueue(userB, [queueItem({
      id: "queue-b",
      ownerScope: userB.key,
      userId: "user-b",
      payload: mediaItem("m1", "B"),
    })]);
    let resolveUpload!: (value: { ok: true }) => void;
    cloudMocks.uploadMediaItems.mockImplementation(() =>
      new Promise((resolve) => { resolveUpload = resolve; })
    );
    manager.setUserId("user-a");
    queue.saveSyncQueue(userA, [queueItem()]);
    const flushing = manager.flush();
    manager.setUserId("user-b");
    resolveUpload({ ok: true });
    await flushing;

    expect(queue.loadSyncQueue(userA)).toEqual([]);
    expect(queue.loadSyncQueue(userB)).toHaveLength(1);
  });

  it("falls back safely for malformed or structurally invalid queue data", async () => {
    const { loadSyncQueue } = await import("@/lib/sync-queue");
    const scope = createUserOwnerScope("user-a");
    localStorage.setItem("mediaTracker:queue:v1:user-user-a:cloudSync", "{broken");
    expect(loadSyncQueue(scope)).toEqual([]);

    localStorage.setItem("mediaTracker:queue:v1:user-user-a:cloudSync", JSON.stringify([{ id: "missing-fields" }]));
    expect(loadSyncQueue(scope)).toEqual([]);
  });
});
