import { describe, expect, it } from "vitest";
import {
  describeCloudV2Conflict,
  listCloudV2Conflicts,
} from "@/lib/cloud-media-v2-conflicts";
import { createUserOwnerScope, GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";
import { saveSyncQueue } from "@/lib/sync-queue";
import type {
  CloudMediaV2ConflictReason,
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

const scope = createUserOwnerScope("user-a");

function blockedItem(
  reason: CloudMediaV2ConflictReason,
  overrides: Partial<SyncQueueItem> = {},
): SyncQueueItem {
  return {
    schemaVersion: 2,
    id: `operation-${reason}`,
    operationId: `operation-${reason}`,
    transport: "cloud-v2",
    entity: "media_item",
    operation: "upsert",
    expectedRevision: 2,
    payload: {
      id: "media-1",
      title: "Safe title",
      type: "movie",
      status: "watching",
      currentProgress: 3,
      totalProgress: 10,
      personalNotes: "must not leak",
      metadata: { rawProviderPayload: "must not leak" },
    },
    createdAt: "2026-07-28T10:00:00.000Z",
    retryCount: 0,
    dispatchStartedAt: "2026-07-28T10:00:01.000Z",
    ownerScope: scope.key,
    userId: scope.userId,
    blockedConflict: {
      reason,
      serverRevision: 4,
      serverDeletedAt: reason === "tombstoned"
        ? "2026-07-28T10:00:02.000Z"
        : null,
      detectedAt: "2026-07-28T10:00:03.000Z",
    },
    ...overrides,
  };
}

describe("Cloud Media V2 conflict presentation", () => {
  it("maps revision mismatch to explicit remote/local/defer choices", () => {
    expect(describeCloudV2Conflict(blockedItem("revision_mismatch")))
      .toMatchObject({
        manualOnly: false,
        actions: ["use-remote", "retry-local", "defer"],
        expectedRevision: 2,
        serverRevision: 4,
      });
  });

  it("maps tombstone to keep deleted or explicit restore", () => {
    expect(describeCloudV2Conflict(blockedItem("tombstoned")))
      .toMatchObject({
        actions: ["keep-deleted", "restore", "defer"],
        serverDeletedAt: "2026-07-28T10:00:02.000Z",
      });
  });

  it("maps missing parent progress to parent-first retry", () => {
    const card = describeCloudV2Conflict(blockedItem(
      "media_target_unavailable",
      {
        entity: "progress_log",
        payload: {
          id: "log-1",
          mediaId: "media-parent",
          mediaTitle: "Safe title",
        },
      },
    ));
    expect(card).toMatchObject({
      actions: ["retry-parent-first", "defer"],
      relatedMediaId: "media-parent",
    });
  });

  it("keeps global record ID conflict manual-only", () => {
    expect(describeCloudV2Conflict(blockedItem("record_id_unavailable")))
      .toMatchObject({
        manualOnly: true,
        actions: ["defer"],
      });
  });

  it("maps unknown conflict to a safe generic blocked result", () => {
    expect(describeCloudV2Conflict(blockedItem("unknown"))).toMatchObject({
      manualOnly: true,
      actions: ["defer"],
    });
  });

  it("does not expose notes, provider payload or owner ID in safe summaries", () => {
    const serialized = JSON.stringify(
      describeCloudV2Conflict(blockedItem("revision_mismatch")),
    );
    expect(serialized).not.toContain("must not leak");
    expect(serialized).not.toContain(scope.userId);
    expect(serialized).toContain("Safe title");
  });

  it("isolates conflict cards by owner and hides guest cloud state", () => {
    const storage = new MemoryStorage();
    saveSyncQueue(scope, [blockedItem("revision_mismatch")], storage);
    const userB = createUserOwnerScope("user-b");
    expect(listCloudV2Conflicts(scope, storage)).toHaveLength(1);
    expect(listCloudV2Conflicts(userB, storage)).toEqual([]);
    expect(listCloudV2Conflicts(GUEST_OWNER_SCOPE, storage)).toEqual([]);
  });
});
