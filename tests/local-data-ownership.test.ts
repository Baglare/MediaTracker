import { describe, expect, it } from "vitest";
import {
  assignUnscopedLibraryToUser,
  deferUnscopedOwnership,
  keepUnscopedLibraryAsGuest,
  prepareScopedLibrary,
} from "@/lib/local-data-ownership";
import {
  buildLocalDataKeys,
  loadScopedMediaList,
  saveLibrarySnapshot,
  saveScopedLibrarySnapshot,
  type LocalStorageLike,
} from "@/lib/local-data-storage";
import {
  createUserOwnerScope,
  GUEST_OWNER_SCOPE,
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
} from "@/lib/local-owner-scope";
import type { MediaItem, ProgressLog } from "@/lib/types";
import { mockMediaList } from "@/lib/mock-media";

class MemoryStorage implements LocalStorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function media(id = "m1"): MediaItem {
  return {
    id,
    title: `Title ${id}`,
    type: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 0,
    favorite: false,
  };
}

function log(id = "l1"): ProgressLog {
  return {
    id,
    mediaId: "m1",
    mediaTitle: "Title m1",
    mediaType: "movie",
    action: "added",
    amount: 0,
    unit: "movie",
    previousProgress: 0,
    newProgress: 0,
    createdAt: "2026-07-23T10:00:00.000Z",
  };
}

describe("local owner scope and key registry", () => {
  it("builds collision-free guest and authenticated media/log keys", () => {
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    const keys = [
      buildLocalDataKeys("media-library", GUEST_OWNER_SCOPE).current,
      buildLocalDataKeys("progress-logs", GUEST_OWNER_SCOPE).current,
      buildLocalDataKeys("media-library", userA).current,
      buildLocalDataKeys("progress-logs", userA).current,
      buildLocalDataKeys("media-library", userB).current,
      buildLocalDataKeys("progress-logs", userB).current,
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rejects unsafe user ids", () => {
    expect(() => createUserOwnerScope("../user-a")).toThrow("invalid_local_owner_user_id");
    expect(() => createUserOwnerScope("name@example.com")).toThrow("invalid_local_owner_user_id");
  });

  it("never exposes a previous owner while the next owner is pending", () => {
    expect(isHydratedOwnerVisible("user:user-b", "user:user-a")).toBe(false);
    expect(isHydratedOwnerVisible("guest", "user:user-b")).toBe(false);
    expect(isHydratedOwnerVisible("user:user-b", null)).toBe(false);
    expect(isHydratedOwnerVisible("user:user-b", "user:user-b")).toBe(true);
  });

  it("rejects stale hydration generations during rapid account switches", () => {
    expect(isCurrentOwnerGeneration(1, 2)).toBe(false);
    expect(isCurrentOwnerGeneration(2, 2)).toBe(true);
  });

  it("rejects an envelope whose owner does not match its scoped key", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    expect(saveScopedLibrarySnapshot(userA, [media()], [], "user", storage).ok).toBe(true);
    const raw = storage.getItem(buildLocalDataKeys("media-library", userA).current)!;
    storage.setItem(buildLocalDataKeys("media-library", userB).current, raw);
    expect(loadScopedMediaList(userB, storage).status).toBe("owner_mismatch");
    expect(loadScopedMediaList(userA, storage).status).toBe("valid");
  });

  it("never falls back from corrupt scoped data to another owner's valid data", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    expect(saveScopedLibrarySnapshot(userB, [media("b")], [], "user", storage).ok).toBe(true);
    storage.setItem(buildLocalDataKeys("media-library", userA).current, "{broken");

    expect(loadScopedMediaList(userA, storage).status).toBe("corrupt");
    expect(loadScopedMediaList(userB, storage).data?.[0].id).toBe("b");
  });
});

describe("unscoped ownership migration", () => {
  it("copies signed-out unscoped data to guest and preserves the source", () => {
    const storage = new MemoryStorage();
    expect(saveLibrarySnapshot([media()], [log()], storage).ok).toBe(true);
    const globalKey = buildLocalDataKeys("media-library").current;
    const globalRaw = storage.getItem(globalKey);

    const prepared = prepareScopedLibrary(GUEST_OWNER_SCOPE, storage);

    expect(prepared.media).toMatchObject({
      status: "valid",
      ownerScope: "guest",
      datasetOrigin: "legacy",
    });
    expect(storage.getItem(globalKey)).toBe(globalRaw);
    expect(storage.getItem("mediaTracker:ownershipBackup:v1:media-library")).toBe(globalRaw);
  });

  it("shows an ownership gate for authenticated users without assigning data", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    expect(saveLibrarySnapshot([media()], [log()], storage).ok).toBe(true);

    const prepared = prepareScopedLibrary(userA, storage);

    expect(prepared.ownershipCandidate).toMatchObject({
      mediaCount: 1,
      progressLogCount: 1,
      destinationHasData: false,
    });
    expect(loadScopedMediaList(userA, storage).status).toBe("missing");
  });

  it("does not offer a known demo snapshot for authenticated adoption", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    expect(saveLibrarySnapshot(mockMediaList, [], storage).ok).toBe(true);

    expect(prepareScopedLibrary(userA, storage).ownershipCandidate).toBeUndefined();
    expect(loadScopedMediaList(userA, storage).status).toBe("missing");
  });

  it("assigns only into an empty user namespace and creates a user sync plan", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    expect(saveLibrarySnapshot([media()], [log()], storage).ok).toBe(true);
    const candidate = prepareScopedLibrary(userA, storage).ownershipCandidate!;

    const result = assignUnscopedLibraryToUser(
      userA,
      candidate.sourceFingerprint,
      storage,
    );

    expect(result).toMatchObject({
      ok: true,
      decision: "assigned_to_user",
      syncPlan: { mediaItems: [{ id: "m1" }], progressLogs: [{ id: "l1" }] },
    });
    expect(loadScopedMediaList(userA, storage)).toMatchObject({
      status: "valid",
      datasetOrigin: "legacy",
    });
    expect(prepareScopedLibrary(userA, storage).ownershipCandidate).toBeUndefined();
  });

  it("does not merge into a populated destination", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    expect(saveLibrarySnapshot([media("old")], [], storage).ok).toBe(true);
    expect(saveScopedLibrarySnapshot(userA, [media("current")], [], "user", storage).ok).toBe(true);
    const candidate = prepareScopedLibrary(userA, storage).ownershipCandidate!;

    const result = assignUnscopedLibraryToUser(userA, candidate.sourceFingerprint, storage);

    expect(result).toMatchObject({ ok: false });
    expect(loadScopedMediaList(userA, storage).data?.[0].id).toBe("current");
  });

  it("keeps a user decision isolated and deferred data accessible", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    expect(saveLibrarySnapshot([media()], [], storage).ok).toBe(true);
    const candidate = prepareScopedLibrary(userA, storage).ownershipCandidate!;
    expect(deferUnscopedOwnership(userA, candidate, storage).ok).toBe(true);

    const prepared = prepareScopedLibrary(userA, storage);
    expect(prepared.ownershipCandidate).toBeUndefined();
    expect(prepared.deferredCandidate).toMatchObject({ deferred: true });
    expect(prepareScopedLibrary(userB, storage).ownershipCandidate).toBeDefined();
  });

  it("copies old data to guest without relabeling it as the signed-in user", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    expect(saveLibrarySnapshot([media()], [], storage).ok).toBe(true);
    const candidate = prepareScopedLibrary(userA, storage).ownershipCandidate!;

    expect(keepUnscopedLibraryAsGuest(
      userA,
      candidate.sourceFingerprint,
      storage,
    )).toMatchObject({ ok: true, decision: "assigned_to_guest" });
    expect(loadScopedMediaList(GUEST_OWNER_SCOPE, storage).status).toBe("valid");
    expect(loadScopedMediaList(userA, storage).status).toBe("missing");
  });
});
