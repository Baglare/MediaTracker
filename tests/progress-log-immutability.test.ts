import { describe, expect, it } from "vitest";
import { createUserOwnerScope, GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";
import { createSyncQueueItem, replaceSyncQueueDurably } from "@/lib/sync-queue";
import { buildImmutableProgressCorrection, canCoalescePendingProgressLog, classifyProgressLogReplay } from "@/lib/progress-log-immutability";
import type { ProgressLog } from "@/lib/types";
import { writeCloudMediaV2ServerResult } from "@/lib/cloud-media-v2-state";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const log: ProgressLog = {
  id: "log-1", mediaId: "media-1", mediaTitle: "Dizi", mediaType: "tv",
  action: "increment", amount: 1, unit: "episode", previousProgress: 1,
  newProgress: 2, createdAt: "2026-08-03T08:00:00.000Z",
};

describe("ProgressLog immutable-after-dispatch policy", () => {
  it("treats same payload as idempotent and changed payload as conflict", () => {
    expect(classifyProgressLogReplay(log, { ...log })).toBe("idempotent");
    expect(classifyProgressLogReplay(log, { ...log, newProgress: 3 })).toBe("conflict");
  });

  it("coalesces guest logs inside one snapshot but rejects authenticated cross-key coalescing", () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    const item = createSyncQueueItem(scope, { entity: "progress_log", operation: "upsert", payload: log, id: "queue-progress-1" });
    expect(replaceSyncQueueDurably(scope, [item], storage)).toBe(true);
    expect(canCoalescePendingProgressLog(GUEST_OWNER_SCOPE)).toBe(true);
    expect(canCoalescePendingProgressLog(scope)).toBe(false);
    expect(replaceSyncQueueDurably(scope, [{ ...item, dispatchStartedAt: "2026-08-03T08:01:00.000Z" }], storage)).toBe(true);
    expect(canCoalescePendingProgressLog(scope)).toBe(false);
  });

  it("creates a new manual_adjust ID for post-dispatch correction", () => {
    expect(buildImmutableProgressCorrection(log, 1, { id: "log-2", createdAt: "2026-08-03T09:00:00.000Z" })).toMatchObject({ id: "log-2", action: "manual_adjust", previousProgress: 2, newProgress: 1 });
  });

  it("rejects coalescing after server acknowledgement removed the queue item", () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("owner-a");
    expect(writeCloudMediaV2ServerResult(scope, { entity: "progress_log", recordId: log.id, operationId: "ack-operation-1", revision: 1, deletedAt: null }, storage).ok).toBe(true);
    expect(canCoalescePendingProgressLog(scope)).toBe(false);
  });
});
