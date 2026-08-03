import { describe, expect, it, vi } from "vitest";

import {
  archiveGoal,
  cancelGoal,
  createGoal,
  deleteGoal,
  GoalRepositoryError,
  reactivateGoal,
  updateGoal,
} from "@/features/goals/data/goal-repository";
import {
  GOAL_STORE_SCHEMA_VERSION,
  goalStoreEventName,
  readGoalStore,
  subscribeGoalStore,
  writeGoalStore,
} from "@/features/goals/data/goal-store";
import { GUEST_OWNER_SCOPE, createUserOwnerScope } from "@/lib/local-owner-scope";
import { buildPersonalDataKeys, type PersonalStorageLike } from "@/lib/personal-data-storage";
import type { Goal } from "@/features/goals/domain/types";
import type { MediaItem } from "@/lib/types";

class MemoryStorage implements PersonalStorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-08-03T12:00:00.000Z");
const schedule = { kind: "one_time", startsOn: "2026-08-03", endsOn: "2026-08-31" } as const;
const media: MediaItem = {
  id: "record-1", title: "Exact Film", type: "movie", status: "planning",
  coverImage: "", currentProgress: 0, totalProgress: 1,
};

function manualGoal(id = UUID_A): Goal {
  return {
    id, title: "Bir film bitir", origin: "manual", lifecycle: "active",
    scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 1 }, schedule,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  };
}

function options(storage: MemoryStorage, idFactory = () => UUID_A) {
  return { storage, mediaItems: [media], now: () => NOW, idFactory };
}

describe("D5-2 owner-scoped Goal store", () => {
  it("uses exact guest and authenticated owner keys", () => {
    expect(buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).current).toBe("mediaTracker:personal:v1:guest:goals");
    expect(buildPersonalDataKeys("goals", createUserOwnerScope("abc_123")).current).toBe("mediaTracker:personal:v1:user-abc_123:goals");
  });

  it("writes the versioned owner envelope through temp verification", () => {
    const storage = new MemoryStorage();
    expect(writeGoalStore(GUEST_OWNER_SCOPE, [manualGoal()], { storage, now: () => NOW }).ok).toBe(true);
    const keys = buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE);
    expect(storage.getItem(keys.temp)).toBeNull();
    const outer = JSON.parse(storage.getItem(keys.current)!);
    expect(outer.value).toEqual({ schemaVersion: GOAL_STORE_SCHEMA_VERSION, owner: "guest", savedAt: NOW.toISOString(), goals: [manualGoal()] });
  });

  it("recovers verified temp and backup slots without crossing owners", () => {
    const storage = new MemoryStorage();
    writeGoalStore(GUEST_OWNER_SCOPE, [manualGoal()], { storage, now: () => NOW });
    const keys = buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE);
    const raw = storage.getItem(keys.current)!;
    storage.removeItem(keys.current);
    storage.setItem(keys.temp, raw);
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage)).toMatchObject({ status: "ready", source: "temp", needsRepair: false });
    storage.removeItem(keys.temp);
    storage.setItem(keys.backup, raw);
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage)).toMatchObject({ status: "ready", source: "backup", needsRepair: false });
    const user = createUserOwnerScope("owner-b");
    storage.setItem(buildPersonalDataKeys("goals", user).current, raw);
    expect(readGoalStore(user, storage).status).toBe("error");
  });

  it("quarantines corrupt current and salvages valid records", () => {
    const storage = new MemoryStorage();
    writeGoalStore(GUEST_OWNER_SCOPE, [manualGoal()], { storage, now: () => NOW });
    const key = buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).current;
    const outer = JSON.parse(storage.getItem(key)!);
    outer.value.goals.push({ id: "not-a-uuid" });
    storage.setItem(key, JSON.stringify(outer));
    const result = readGoalStore(GUEST_OWNER_SCOPE, storage);
    expect(result).toMatchObject({ status: "repaired", needsRepair: true });
    expect(result.data.goals).toEqual([manualGoal()]);
    expect([...storage.data.keys()].some((item) => item.startsWith("mediaTracker:quarantine:personal:goals:"))).toBe(true);
  });

  it("recovers from malformed JSON using a verified backup", () => {
    const storage = new MemoryStorage();
    writeGoalStore(GUEST_OWNER_SCOPE, [manualGoal()], { storage, now: () => NOW });
    const keys = buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE);
    storage.setItem(keys.backup, storage.getItem(keys.current)!);
    storage.setItem(keys.current, "{broken");
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage)).toMatchObject({ status: "ready", source: "backup", needsRepair: true });
    createGoal(GUEST_OWNER_SCOPE, {
      title: "İkinci hedef", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 2 }, schedule,
    }, options(storage, () => UUID_B));
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals).toHaveLength(2);
  });

  it("publishes reactive events only for the mutated owner", () => {
    const storage = new MemoryStorage();
    const target = new EventTarget();
    const guestListener = vi.fn();
    const userListener = vi.fn();
    const stopGuest = subscribeGoalStore(GUEST_OWNER_SCOPE, guestListener, target);
    const user = createUserOwnerScope("other");
    target.addEventListener(goalStoreEventName(user), userListener);
    createGoal(GUEST_OWNER_SCOPE, {
      title: "Yerel hedef", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 1 }, schedule,
    }, { ...options(storage), eventTarget: target });
    expect(guestListener).toHaveBeenCalledOnce();
    expect(userListener).not.toHaveBeenCalled();
    stopGuest();
  });

  it("keeps guest and account snapshots isolated during owner switches", () => {
    const storage = new MemoryStorage();
    const user = createUserOwnerScope("account-a");
    createGoal(GUEST_OWNER_SCOPE, { title: "Guest hedefi", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 1 }, schedule }, options(storage));
    createGoal(user, { title: "Hesap hedefi", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 2 }, schedule }, options(storage));
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals.map((goal) => goal.title)).toEqual(["Guest hedefi"]);
    expect(readGoalStore(user, storage).data.goals.map((goal) => goal.title)).toEqual(["Hesap hedefi"]);
  });
});

describe("D5-2 Goal repository mutations", () => {
  it("creates, reads, updates and preserves createdAt while advancing updatedAt", () => {
    const storage = new MemoryStorage();
    const created = createGoal(GUEST_OWNER_SCOPE, {
      title: "Bir film", scope: { kind: "media", mediaRecordId: media.id }, metric: { kind: "completed_media", targetValue: 1 }, schedule,
    }, options(storage));
    expect(created).toMatchObject({ id: UUID_A, origin: "manual", lifecycle: "active", scope: { kind: "media", mediaRecordId: "record-1", title: "Exact Film" } });
    const updated = updateGoal(GUEST_OWNER_SCOPE, created.id, { title: "Yeni başlık" }, options(storage));
    expect(updated.createdAt).toBe(created.createdAt);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals[0].title).toBe("Yeni başlık");
    expect(storage.getItem(buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).backup)).not.toBeNull();
  });

  it("keeps cancel, archive and reactivate distinct", () => {
    const storage = new MemoryStorage();
    createGoal(GUEST_OWNER_SCOPE, { title: "Lifecycle", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 1 }, schedule }, options(storage));
    expect(cancelGoal(GUEST_OWNER_SCOPE, UUID_A, options(storage)).lifecycle).toBe("cancelled");
    expect(archiveGoal(GUEST_OWNER_SCOPE, UUID_A, options(storage)).lifecycle).toBe("archived");
    expect(reactivateGoal(GUEST_OWNER_SCOPE, UUID_A, options(storage)).lifecycle).toBe("active");
  });

  it("physically deletes only with explicit confirmation", () => {
    const storage = new MemoryStorage();
    createGoal(GUEST_OWNER_SCOPE, { title: "Sil", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 1 }, schedule }, options(storage));
    expect(() => deleteGoal(GUEST_OWNER_SCOPE, UUID_A, { confirmed: false } as never, options(storage))).toThrowError(GoalRepositoryError);
    deleteGoal(GUEST_OWNER_SCOPE, UUID_A, { confirmed: true }, options(storage));
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals).toEqual([]);
  });

  it("rejects duplicate IDs, missing exact media and fuzzy title matching without writing", () => {
    const storage = new MemoryStorage();
    const duplicateOptions = options(storage);
    createGoal(GUEST_OWNER_SCOPE, { title: "İlk", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 1 }, schedule }, duplicateOptions);
    const before = storage.getItem(buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).current);
    expect(() => createGoal(GUEST_OWNER_SCOPE, { title: "İkinci", scope: { kind: "library" }, metric: { kind: "completed_media", targetValue: 1 }, schedule }, duplicateOptions)).toThrowError(/overwrite edilmedi/);
    expect(storage.getItem(buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).current)).toBe(before);
    expect(() => createGoal(GUEST_OWNER_SCOPE, {
      title: "Benzer başlık yetmez", scope: { kind: "media", mediaRecordId: "Exact Film" }, metric: { kind: "completed_media", targetValue: 1 }, schedule,
    }, options(storage, () => UUID_B))).toThrowError(/exact mediaRecordId/);
    expect(storage.getItem(buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).current)).toBe(before);
  });

  it("enforces movie completion and single-media target policy", () => {
    const storage = new MemoryStorage();
    expect(() => createGoal(GUEST_OWNER_SCOPE, {
      title: "Film bölümü", scope: { kind: "media", mediaRecordId: media.id }, metric: { kind: "progress", unit: "episode", targetValue: 1 }, schedule,
    }, options(storage))).toThrowError(/uyumsuz/);
    expect(() => createGoal(GUEST_OWNER_SCOPE, {
      title: "İki kez film", scope: { kind: "media", mediaRecordId: media.id }, metric: { kind: "completed_media", targetValue: 2 }, schedule,
    }, options(storage))).toThrowError(/1 olmalıdır/);
  });

  it("preserves a missing exact media link while allowing definition-only edits", () => {
    const storage = new MemoryStorage();
    createGoal(GUEST_OWNER_SCOPE, {
      title: "Silinecek medya", scope: { kind: "media", mediaRecordId: media.id }, metric: { kind: "completed_media", targetValue: 1 }, schedule,
    }, options(storage));
    const updated = updateGoal(GUEST_OWNER_SCOPE, UUID_A, { title: "Bağlantısı eksik hedef" }, { ...options(storage), mediaItems: [] });
    expect(updated.scope).toMatchObject({ kind: "media", mediaRecordId: media.id });
    expect(updated.title).toBe("Bağlantısı eksik hedef");
  });
});
