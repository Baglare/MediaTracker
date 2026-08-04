import { describe, expect, it } from "vitest";
import { emptyMediaIdentityAliasRegistry } from "@/lib/media-identity-aliases";
import { emptyMediaRecordRedirectRegistry } from "@/lib/media-record-redirects";
import {
  computePortableBackupChecksum,
  createPortableBackup,
  decodePortableBackupForImport,
  inspectPortableBackupText,
  serializePortableBackup,
  type PortableBackupV2,
} from "@/lib/portable-backup";
import type { Goal } from "@/features/goals/domain/types";
import {
  executePortableAdditiveImport,
  preparePortableAdditiveImport,
  undoLastPortableImport,
} from "@/lib/portable-additive-import";
import { readGoalStore, writeGoalStore } from "@/features/goals/data/goal-store";
import { ensureMediaIdentity } from "@/lib/media-identity";
import { GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";
import { buildPersonalDataKeys } from "@/lib/personal-data-storage";
import { saveScopedLibrarySnapshot } from "@/lib/local-data-storage";
import type { MediaItem } from "@/lib/types";

const goal: Goal = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ayda iki film",
  origin: "suggested",
  scope: { kind: "library" },
  metric: { kind: "completed_media", targetValue: 2 },
  schedule: { kind: "monthly", startsOn: "2026-08-01", timeZone: "Europe/Istanbul" },
  lifecycle: "archived",
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-02T08:00:00.000Z",
};

const linkedMedia = ensureMediaIdentity({
  id: "portable-goal-media", title: "Exact Film", type: "movie", status: "planning",
  coverImage: "", currentProgress: 0, totalProgress: 1,
  externalSource: "tmdb", externalId: "9001",
} satisfies MediaItem).item;

class MemoryStorage {
  values = new Map<string, string>();
  failOnceKey: string | null = null;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failOnceKey) {
      this.failOnceKey = null;
      throw new Error("injected_write_failure");
    }
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

async function v3(goals: Goal[] = [goal], mediaItems: MediaItem[] = []) {
  return createPortableBackup({
    ownerType: "authenticated", mediaItems, progressLogs: [], goals,
    identityAliases: emptyMediaIdentityAliasRegistry(),
    recordRedirects: emptyMediaRecordRedirectRegistry(),
    recommendationLinks: [],
  }, { exportedAt: "2026-08-03T08:00:00.000Z", includePersonalNotes: false });
}

describe("Portable Backup V3 Goals", () => {
  it("exports Goal definitions but no evaluation/cloud metadata", async () => {
    const created = await v3();
    expect(created.backup.manifest.version).toBe(3);
    expect(created.backup.data.goals).toEqual([goal]);
    for (const forbidden of [
      "currentValue", "progressPercent", "attainment", "GoalEvaluation",
      "suggestions", "sessionDismiss", "cloudRevision", "goalCloudState",
      "goalCloudQueue", "operationLedger", "blockedConflict", "tombstoneMetadata",
    ]) expect(created.serialized).not.toContain(`\"${forbidden}\"`);
  });

  it("keeps V2 import compatibility", async () => {
    const created = await v3([]);
    const backup = structuredClone(created.backup) as PortableBackupV2;
    backup.manifest.version = 2;
    backup.manifest.domains = backup.manifest.domains.filter((domain) => domain !== "goals");
    delete backup.manifest.schemas.goal;
    delete (backup.manifest.counts as Partial<typeof backup.manifest.counts>).goals;
    delete backup.data.goals;
    backup.manifest.checksum.value = await computePortableBackupChecksum(backup.manifest, backup.data);
    const decoded = await decodePortableBackupForImport(serializePortableBackup(backup));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.manifest.version).toBe(2);
  });

  it("salvages healthy Goals and reports malformed entries", async () => {
    const created = await v3();
    const backup = structuredClone(created.backup);
    backup.data.goals!.push({ ...goal, id: "not-a-uuid" } as Goal);
    backup.manifest.counts.goals = 2;
    backup.manifest.checksum.value = await computePortableBackupChecksum(backup.manifest, backup.data);
    const text = serializePortableBackup(backup);
    const inspection = await inspectPortableBackupText(text);
    expect(inspection.status).toBe("valid");
    expect(inspection.issues.some((issue) => issue.code === "GOAL_CODEC_INVALID")).toBe(true);
    const decoded = await decodePortableBackupForImport(text);
    expect(decoded.ok && decoded.data.goals).toEqual([goal]);
  });

  it("roundtrips every origin, lifecycle, schedule and scope with idempotent replay", async () => {
    const goals: Goal[] = [
      goal,
      {
        ...goal,
        id: "22222222-2222-4222-8222-222222222222",
        title: "Haftalık bölüm",
        origin: "manual",
        lifecycle: "cancelled",
        scope: { kind: "media_type", mediaType: "tv" },
        metric: { kind: "progress", unit: "episode", targetValue: 3 },
        schedule: { kind: "weekly", startsOn: "2026-08-03", weekStartsOn: "monday", timeZone: "Europe/Istanbul" },
      },
      {
        ...goal,
        id: "33333333-3333-4333-8333-333333333333",
        title: "Exact filmi tamamla",
        origin: "manual",
        lifecycle: "active",
        scope: { kind: "media", mediaRecordId: linkedMedia.id, title: linkedMedia.title },
        metric: { kind: "completed_media", targetValue: 1 },
        schedule: { kind: "one_time", startsOn: "2026-08-01", endsOn: "2026-08-31" },
      },
    ];
    const storage = new MemoryStorage();
    expect(saveScopedLibrarySnapshot(GUEST_OWNER_SCOPE, [], [], "user", storage).ok).toBe(true);
    const created = await v3(goals, [linkedMedia]);
    const prepared = await preparePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, { storage });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect((await executePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, prepared.plan, { storage })).ok).toBe(true);
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals).toEqual(goals);
    const repeated = await preparePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, { storage });
    expect(repeated.ok && repeated.plan.counts.goalSkip).toBe(3);
    if (repeated.ok) expect(await executePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, repeated.plan, { storage })).toMatchObject({ ok: true, idempotent: true });
  });

  it("surfaces different Goal payloads as conflict and never overwrites local", async () => {
    const storage = new MemoryStorage();
    expect(saveScopedLibrarySnapshot(GUEST_OWNER_SCOPE, [], [], "user", storage).ok).toBe(true);
    expect(writeGoalStore(GUEST_OWNER_SCOPE, [{ ...goal, title: "Yerel" }], { storage }).ok).toBe(true);
    const created = await v3([{ ...goal, title: "Backup" }]);
    const prepared = await preparePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, { storage });
    expect(prepared.ok && prepared.plan.blockers).toMatchObject([{ code: "goal_id_conflict" }]);
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals[0].title).toBe("Yerel");
  });

  it("uses only explicit exact-copy media remap and preserves missing targets", async () => {
    const storage = new MemoryStorage();
    const existing = { ...linkedMedia, id: "existing-exact-media" };
    expect(saveScopedLibrarySnapshot(GUEST_OWNER_SCOPE, [existing], [], "user", storage).ok).toBe(true);
    const mediaGoal: Goal = {
      ...goal,
      id: "44444444-4444-4444-8444-444444444444",
      scope: { kind: "media", mediaRecordId: linkedMedia.id, title: linkedMedia.title },
      metric: { kind: "completed_media", targetValue: 1 },
    };
    const created = await v3([mediaGoal], [linkedMedia]);
    const prepared = await preparePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, {
      storage,
      exactDuplicateCopyRecordIds: [linkedMedia.id],
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect((await executePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, prepared.plan, { storage })).ok).toBe(true);
    const imported = readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals[0];
    expect(imported.scope.kind === "media" && imported.scope.mediaRecordId).toMatch(/^import-/);

    const missingStorage = new MemoryStorage();
    expect(saveScopedLibrarySnapshot(GUEST_OWNER_SCOPE, [], [], "user", missingStorage).ok).toBe(true);
    const missingBackup = await v3([mediaGoal], []);
    const missingPlan = await preparePortableAdditiveImport(GUEST_OWNER_SCOPE, missingBackup.serialized, { storage: missingStorage });
    expect(missingPlan.ok).toBe(true);
    if (missingPlan.ok) {
      expect((await executePortableAdditiveImport(GUEST_OWNER_SCOPE, missingBackup.serialized, missingPlan.plan, { storage: missingStorage })).ok).toBe(true);
      expect(readGoalStore(GUEST_OWNER_SCOPE, missingStorage).data.goals[0].scope).toMatchObject({ kind: "media", mediaRecordId: linkedMedia.id });
    }
  });

  it("rolls back Goal writes and supports undo without exporting Cloud state", async () => {
    const storage = new MemoryStorage();
    expect(saveScopedLibrarySnapshot(GUEST_OWNER_SCOPE, [], [], "user", storage).ok).toBe(true);
    const created = await v3();
    const prepared = await preparePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, { storage });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    storage.failOnceKey = buildPersonalDataKeys("goals", GUEST_OWNER_SCOPE).temp;
    expect(await executePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, prepared.plan, { storage })).toMatchObject({ ok: false, recoveryRequired: false });
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals).toEqual([]);

    const retry = await preparePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, { storage });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect((await executePortableAdditiveImport(GUEST_OWNER_SCOPE, created.serialized, retry.plan, { storage })).ok).toBe(true);
    expect(undoLastPortableImport(GUEST_OWNER_SCOPE, storage)).toMatchObject({ ok: true, state: "rolled-back" });
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals).toEqual([]);
  });
});
