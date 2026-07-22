import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, SyncQueueItem } from "@/lib/types";

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

    manager.enqueueMediaUpsert(mediaItem("m1"));

    expect(loadSyncQueue()).toMatchObject([
      { entity: "media_item", operation: "upsert", payload: { id: "m1" }, retryCount: 0 },
    ]);
  });

  it("coalesces repeated upserts for the same entity id to the latest payload", async () => {
    const manager = await import("@/lib/sync-manager");
    const { loadSyncQueue } = await import("@/lib/sync-queue");

    manager.enqueueMediaUpsert(mediaItem("m1", "Old"));
    manager.enqueueMediaUpsert(mediaItem("m1", "Latest"));

    const queue = loadSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toMatchObject({ id: "m1", title: "Latest" });
  });

  it("replaces a pending upsert with a delete for the same entity id", async () => {
    const manager = await import("@/lib/sync-manager");
    const { loadSyncQueue } = await import("@/lib/sync-queue");

    manager.enqueueMediaUpsert(mediaItem("m1"));
    manager.enqueueMediaDelete("m1");

    expect(loadSyncQueue()).toMatchObject([
      { entity: "media_item", operation: "delete", payload: { id: "m1" } },
    ]);
  });

  it("removes a successfully flushed item", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    manager.setUserId("user-a");
    queue.saveSyncQueue([queueItem({ userId: "user-a" })]);
    cloudMocks.uploadMediaItems.mockResolvedValue({ ok: true });

    await manager.flush();

    expect(queue.loadSyncQueue()).toEqual([]);
    expect(cloudMocks.uploadMediaItems).toHaveBeenCalledWith("user-a", [mediaItem("m1")]);
  });

  it("keeps a failed item and updates retryCount and lastError", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    manager.setUserId("user-a");
    queue.saveSyncQueue([queueItem({ userId: "user-a", retryCount: 2 })]);
    cloudMocks.uploadMediaItems.mockResolvedValue({ ok: false, error: "network request failed" });

    await manager.flush();

    expect(queue.loadSyncQueue()).toMatchObject([
      { id: "queue-1", retryCount: 3, lastError: "Ağ hatası." },
    ]);
  });

  it("does not flush an item owned by another user", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    manager.setUserId("user-a");
    queue.saveSyncQueue([queueItem({ userId: "user-b" })]);

    await manager.flush();

    expect(cloudMocks.uploadMediaItems).not.toHaveBeenCalled();
    expect(queue.loadSyncQueue()).toHaveLength(1);
  });

  it("flushes an anonymous item with the signed-in user id", async () => {
    const manager = await import("@/lib/sync-manager");
    const queue = await import("@/lib/sync-queue");
    manager.setUserId("user-a");
    queue.saveSyncQueue([queueItem({ userId: null })]);
    cloudMocks.uploadMediaItems.mockResolvedValue({ ok: true });

    await manager.flush();

    expect(cloudMocks.uploadMediaItems).toHaveBeenCalledWith("user-a", [mediaItem("m1")]);
    expect(queue.loadSyncQueue()).toEqual([]);
  });

  it("falls back safely for malformed or structurally invalid queue data", async () => {
    const { loadSyncQueue } = await import("@/lib/sync-queue");
    localStorage.setItem("media-tracker-sync-queue", "{broken");
    expect(loadSyncQueue()).toEqual([]);

    localStorage.setItem("media-tracker-sync-queue", JSON.stringify([{ id: "missing-fields" }]));
    expect(loadSyncQueue()).toEqual([]);
  });
});
