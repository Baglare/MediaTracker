import { describe, expect, it } from "vitest";

import {
  executeIntegrityRepair,
  prepareIntegrityRepair,
  readIntegrityRepairJournal,
  undoLastIntegrityRepair,
  type IntegrityRepairPlan,
  type IntegrityRepairStorage,
} from "@/lib/local-data-integrity-repair";
import {
  buildLocalDataKeys,
  inspectScopedLocalData,
  saveScopedLibrarySnapshot,
} from "@/lib/local-data-storage";
import {
  emptyMediaIdentityAliasRegistry,
  mediaIdentityAliasRegistryCodec,
} from "@/lib/media-identity-aliases";
import {
  emptyMediaRecordRedirectRegistry,
  mediaRecordRedirectRegistryCodec,
  writeMediaRecordRedirectRegistry,
} from "@/lib/media-record-redirects";
import {
  duplicateReviewRegistryCodec,
  writeDuplicateReviewRegistry,
  type DuplicateReviewRegistry,
} from "@/lib/duplicate-review-registry";
import {
  duplicateMergeJournalCodec,
  writeDuplicateMergeJournal,
  type DuplicateMergeJournal,
} from "@/lib/duplicate-merge";
import {
  createUserOwnerScope,
  type LocalOwnerScope,
} from "@/lib/local-owner-scope";
import {
  buildPersonalDataKeys,
  inspectPersonalData,
} from "@/lib/personal-data-storage";
import { ensureMediaIdentity } from "@/lib/media-identity";
import { scanLocalDataIntegrity } from "@/lib/local-data-integrity";
import {
  inspectRecommendationLinksForScope,
  replaceRecommendationLinksForScope,
} from "@/lib/social/local-social";
import { inspectSyncQueue } from "@/lib/sync-queue";
import type { MediaItem, ProgressLog } from "@/lib/types";

const SCOPE = createUserOwnerScope("user-a");
const OTHER_SCOPE = createUserOwnerScope("user-b");
const NOW = "2026-07-29T12:00:00.000Z";

class MemoryStorage implements IntegrityRepairStorage {
  values = new Map<string, string>();
  failOnceKey: string | null = null;
  failAlwaysKey: string | null = null;
  corruptReadAfterWriteKey: string | null = null;
  corruptNextReadKey: string | null = null;
  writes: string[] = [];

  getItem(key: string): string | null {
    const value = this.values.get(key) ?? null;
    if (key === this.corruptNextReadKey && value !== null) {
      this.corruptNextReadKey = null;
      return `${value}!`;
    }
    return value;
  }

  setItem(key: string, value: string): void {
    this.writes.push(key);
    if (key === this.failAlwaysKey || key === this.failOnceKey) {
      if (key === this.failOnceKey) this.failOnceKey = null;
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
    if (key === this.corruptReadAfterWriteKey) {
      this.corruptNextReadKey = key;
      this.corruptReadAfterWriteKey = null;
    }
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return ensureMediaIdentity({
    id: "media-1",
    title: "Example",
    type: "movie",
    status: "planning",
    coverImage: "/cover.jpg",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    personalNotes: "private-note",
    ...overrides,
  }).item;
}

function log(overrides: Partial<ProgressLog> = {}): ProgressLog {
  return {
    id: "log-1",
    mediaId: "media-1",
    mediaTitle: "Example",
    mediaType: "movie",
    action: "added",
    amount: 0,
    unit: "movie",
    previousProgress: 0,
    newProgress: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function seed(
  storage: MemoryStorage,
  items: MediaItem[] = [media()],
  logs: ProgressLog[] = [log()],
  scope: LocalOwnerScope = SCOPE,
) {
  expect(saveScopedLibrarySnapshot(scope, items, logs, "user", storage).ok).toBe(true);
  storage.values.set("media-tracker-xp-outbox", JSON.stringify([{ owner: scope.key }]));
}

function report(storage: MemoryStorage, scope: LocalOwnerScope = SCOPE) {
  const mediaEnvelope = inspectScopedLocalData<MediaItem[]>(
    scope,
    "media-library",
    storage,
  );
  const progressEnvelope = inspectScopedLocalData<ProgressLog[]>(
    scope,
    "progress-logs",
    storage,
  );
  const aliases = inspectPersonalData(
    scope,
    "mediaIdentityAliases",
    mediaIdentityAliasRegistryCodec,
    storage,
  );
  const redirects = inspectPersonalData(
    scope,
    "mediaRecordRedirects",
    mediaRecordRedirectRegistryCodec,
    storage,
  );
  const duplicateReviews = inspectPersonalData(
    scope,
    "duplicateReviewDecisions",
    duplicateReviewRegistryCodec,
    storage,
  );
  const mergeJournal = inspectPersonalData(
    scope,
    "duplicateMergeJournal",
    duplicateMergeJournalCodec,
    storage,
  );
  return scanLocalDataIntegrity({
    scope,
    mediaItems: mediaEnvelope.data ?? [],
    progressLogs: progressEnvelope.data ?? [],
    mediaEnvelope,
    progressEnvelope,
    aliases,
    redirects,
    duplicateReviews,
    mergeJournal,
    recommendationLinks: inspectRecommendationLinksForScope(scope, storage),
    syncQueue: inspectSyncQueue(scope, storage),
  });
}

function planFor(
  storage: MemoryStorage,
  code: string,
  scope: LocalOwnerScope = SCOPE,
): IntegrityRepairPlan {
  const current = report(storage, scope);
  const issue = current.issues.find((entry) => entry.code === code);
  expect(issue, `missing issue ${code}`).toBeDefined();
  const result = prepareIntegrityRepair(
    scope,
    issue!.id,
    current.sourceFingerprint,
    storage,
  );
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(result.message);
  return result.plan;
}

function personalEnvelope(
  domain: "mediaIdentityAliases" | "mediaRecordRedirects",
  value: unknown,
  scope = SCOPE,
) {
  return JSON.stringify({
    format: "mediatracker-personal-data",
    domain,
    schemaVersion: 1,
    writerVersion: "D1B.2B",
    ownerScope: scope.key,
    writtenAt: NOW,
    value,
  });
}

describe("deterministic integrity repairs", () => {
  it("removes only the selected stale duplicate review decision", () => {
    const storage = new MemoryStorage();
    seed(storage);
    const registry: DuplicateReviewRegistry = {
      version: 1,
      decisions: [{
        candidateFingerprint: "dup:v1:probable:12345678:12345678",
        decision: "ignored",
        scanVersion: 1,
        recordIds: ["media-1", "missing"],
        evidenceFingerprint: "ev:v1:12345678",
        decidedAt: NOW,
      }],
    };
    expect(writeDuplicateReviewRegistry(SCOPE, registry, storage).ok).toBe(true);
    const plan = planFor(storage, "DUPLICATE_REVIEW_DECISION_STALE");
    expect(plan.preview.changes).toHaveLength(1);
    expect(executeIntegrityRepair(SCOPE, plan, storage)).toMatchObject({
      ok: true,
      state: "completed",
    });
    expect(report(storage).issues.map((entry) => entry.code)).not.toContain(
      "DUPLICATE_REVIEW_DECISION_STALE",
    );
  });

  it("flattens an alias chain to its unique terminal target and supports undo", () => {
    const storage = new MemoryStorage();
    const target = media({
      externalSource: "tmdb",
      externalId: "3",
    });
    seed(storage, [target], []);
    const chain = {
      version: 1,
      records: [
        {
          alias: "v2:tmdb:movie:1",
          canonicalKey: "v2:tmdb:movie:2",
          aliasType: "merged-canonical-key",
          createdAt: NOW,
        },
        {
          alias: "v2:tmdb:movie:2",
          canonicalKey: "v2:tmdb:movie:3",
          aliasType: "merged-canonical-key",
          createdAt: NOW,
        },
      ],
      issues: [],
    };
    storage.values.set(
      buildPersonalDataKeys("mediaIdentityAliases", SCOPE).current,
      personalEnvelope("mediaIdentityAliases", chain),
    );
    const plan = planFor(storage, "ALIAS_CHAIN");
    const execution = executeIntegrityRepair(SCOPE, plan, storage);
    expect(execution, JSON.stringify(execution)).toMatchObject({ ok: true });
    const repaired = inspectPersonalData(
      SCOPE,
      "mediaIdentityAliases",
      mediaIdentityAliasRegistryCodec,
      storage,
    );
    expect(repaired.status).toBe("valid");
    if (repaired.status === "valid") {
      expect(repaired.data.records.every(
        (entry) => entry.canonicalKey === "v2:tmdb:movie:3",
      )).toBe(true);
    }
    expect(undoLastIntegrityRepair(SCOPE, storage)).toMatchObject({
      ok: true,
      state: "rolled-back",
    });
    expect(report(storage).issues.map((entry) => entry.code)).toContain("ALIAS_CHAIN");
  });

  it("flattens a record redirect chain without changing media or log counts", () => {
    const storage = new MemoryStorage();
    seed(storage);
    const chain = {
      version: 1,
      records: [
        { fromRecordId: "old-a", toRecordId: "old-b", operationId: "op", createdAt: NOW },
        { fromRecordId: "old-b", toRecordId: "media-1", operationId: "op", createdAt: NOW },
      ],
    };
    storage.values.set(
      buildPersonalDataKeys("mediaRecordRedirects", SCOPE).current,
      personalEnvelope("mediaRecordRedirects", chain),
    );
    const before = report(storage);
    const result = executeIntegrityRepair(
      SCOPE,
      planFor(storage, "REDIRECT_CHAIN"),
      storage,
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    const after = report(storage);
    expect(after.scannedMediaCount).toBe(before.scannedMediaCount);
    expect(after.scannedLogCount).toBe(before.scannedLogCount);
    expect(after.issues.map((entry) => entry.code)).not.toContain("REDIRECT_CHAIN");
  });

  it("clears only duplicate explicit group order and keeps all group members", () => {
    const storage = new MemoryStorage();
    seed(storage, [
      media({ id: "a", seriesGroupId: "group-1", orderIndex: 1 }),
      media({ id: "b", seriesGroupId: "group-1", orderIndex: 1 }),
    ], []);
    const plan = planFor(storage, "GROUP_MEMBER_DUPLICATE_SLOT");
    expect(plan.preview.affectedGroupCount).toBe(1);
    expect(executeIntegrityRepair(SCOPE, plan, storage).ok).toBe(true);
    const data = inspectScopedLocalData<MediaItem[]>(
      SCOPE,
      "media-library",
      storage,
    ).data!;
    expect(data).toHaveLength(2);
    expect(data.find((item) => item.id === "a")?.orderIndex).toBe(1);
    expect(data.find((item) => item.id === "b")?.orderIndex).toBeUndefined();
  });

  it("remaps a recommendation link only through a valid record redirect", () => {
    const storage = new MemoryStorage();
    seed(storage);
    expect(writeMediaRecordRedirectRegistry(SCOPE, {
      version: 1,
      records: [{
        fromRecordId: "old",
        toRecordId: "media-1",
        operationId: "merge-op",
        createdAt: NOW,
      }],
    }, storage).ok).toBe(true);
    expect(replaceRecommendationLinksForScope(SCOPE, [{
      recommendationId: "rec-1",
      localMediaId: "old",
      canonicalMediaKey: "v2:tmdb:movie:1",
      linkedAt: NOW,
      userId: "user-a",
    }], storage)).toBe(true);
    const plan = planFor(storage, "RECOMMENDATION_LINK_REDIRECT_PENDING");
    expect(executeIntegrityRepair(SCOPE, plan, storage).ok).toBe(true);
    expect(inspectRecommendationLinksForScope(SCOPE, storage).links[0].localMediaId)
      .toBe("media-1");
  });

  it("remaps orphan ProgressLog.mediaId through a valid redirect without changing log ID", () => {
    const storage = new MemoryStorage();
    seed(storage, [media()], [log({ mediaId: "old" })]);
    expect(writeMediaRecordRedirectRegistry(SCOPE, {
      version: 1,
      records: [{
        fromRecordId: "old",
        toRecordId: "media-1",
        operationId: "merge-op",
        createdAt: NOW,
      }],
    }, storage).ok).toBe(true);
    const beforeXp = storage.getItem("media-tracker-xp-outbox");
    const plan = planFor(storage, "PROGRESS_LOG_REDIRECT_PENDING");
    expect(executeIntegrityRepair(SCOPE, plan, storage).ok).toBe(true);
    const logs = inspectScopedLocalData<ProgressLog[]>(
      SCOPE,
      "progress-logs",
      storage,
    ).data!;
    expect(logs).toMatchObject([{ id: "log-1", mediaId: "media-1" }]);
    expect(storage.getItem("media-tracker-xp-outbox")).toBe(beforeXp);
  });

  it("repairs only a valid V2 identity key mismatch and preserves private fields", () => {
    const storage = new MemoryStorage();
    const item = media({ externalSource: "tmdb", externalId: "42" });
    seed(storage, [item], []);
    const key = buildLocalDataKeys("media-library", SCOPE).current;
    const envelope = JSON.parse(storage.getItem(key)!) as {
      records: Array<MediaItem>;
    };
    envelope.records[0].identity = {
      ...envelope.records[0].identity!,
      key: "v2:tmdb:movie:999",
    };
    storage.values.set(key, JSON.stringify(envelope));
    const plan = planFor(storage, "IDENTITY_KEY_MISMATCH");
    expect(JSON.stringify(plan)).not.toContain("private-note");
    expect(executeIntegrityRepair(SCOPE, plan, storage).ok).toBe(true);
    const repaired = inspectScopedLocalData<MediaItem[]>(
      SCOPE,
      "media-library",
      storage,
    ).data![0];
    expect(repaired.identity?.key).toBe("v2:tmdb:movie:42");
    expect(repaired.personalNotes).toBe("private-note");
    expect(undoLastIntegrityRepair(SCOPE, storage).ok).toBe(true);
    expect(report(storage).issues.map((entry) => entry.code))
      .toContain("IDENTITY_KEY_MISMATCH");
  });

  it("delegates an in-progress merge journal rollback to the existing coordinator", () => {
    const storage = new MemoryStorage();
    const item = media();
    seed(storage, [item], []);
    const snapshot = {
      datasetOrigin: "user" as const,
      mediaItems: inspectScopedLocalData<MediaItem[]>(
        SCOPE,
        "media-library",
        storage,
      ).data!,
      progressLogs: [],
      aliases: inspectPersonalData(
        SCOPE,
        "mediaIdentityAliases",
        mediaIdentityAliasRegistryCodec,
        storage,
      ).status === "valid"
        ? (inspectPersonalData(
            SCOPE,
            "mediaIdentityAliases",
            mediaIdentityAliasRegistryCodec,
            storage,
          ) as { status: "valid"; data: ReturnType<typeof emptyMediaIdentityAliasRegistry> }).data
        : emptyMediaIdentityAliasRegistry(),
      redirects: emptyMediaRecordRedirectRegistry(),
      recommendationLinks: [],
      syncQueue: [],
    };
    const operationId = "merge-recovery-op";
    const journal = {
      version: 1,
      operationId,
      ownerScope: SCOPE.key,
      state: "prepared",
      sourceFingerprint: "merge-source:v1:test",
      plan: {
        version: 1,
        operationId,
        ownerScope: SCOPE.key,
        selectedRecordIds: ["media-1"],
      },
      before: snapshot,
      after: snapshot,
      appliedStages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as DuplicateMergeJournal;
    expect(writeDuplicateMergeJournal(SCOPE, journal, storage).ok).toBe(true);
    const plan = planFor(storage, "MERGE_JOURNAL_IN_PROGRESS");
    expect(plan.kind).toBe("recover-merge-journal");
    expect(executeIntegrityRepair(SCOPE, plan, storage)).toMatchObject({
      ok: true,
      state: "completed",
    });
    expect(report(storage).issues.map((entry) => entry.code))
      .not.toContain("MERGE_JOURNAL_IN_PROGRESS");
  });
});

describe("integrity repair guards, rollback and privacy", () => {
  it("refuses every manual-only class without changing data", () => {
    const storage = new MemoryStorage();
    const first = media({ id: "a", externalSource: "tmdb", externalId: "42" });
    const second = { ...first, id: "b" };
    seed(storage, [first, second], [
      log({ id: "conflict", newProgress: 1 }),
      log({ id: "conflict", newProgress: 2 }),
    ]);
    const before = JSON.stringify([...storage.values]);
    const current = report(storage);
    for (const code of ["IDENTITY_EXACT_COLLISION", "PROGRESS_LOG_ID_CONFLICT"]) {
      const issue = current.issues.find((entry) => entry.code === code)!;
      expect(prepareIntegrityRepair(
        SCOPE,
        issue.id,
        current.sourceFingerprint,
        storage,
      )).toMatchObject({ ok: false, code: "manual_only" });
    }
    expect(JSON.stringify([...storage.values])).toBe(before);
  });

  it("rejects stale fingerprints and foreign-owner plans", () => {
    const storage = new MemoryStorage();
    seed(storage, [media({ id: "a", seriesGroupId: "g", orderIndex: 1 }), media({
      id: "b",
      seriesGroupId: "g",
      orderIndex: 1,
    })], []);
    const plan = planFor(storage, "GROUP_MEMBER_DUPLICATE_SLOT");
    seed(storage, [
      media({ id: "a", seriesGroupId: "g", orderIndex: 1 }),
      media({ id: "b", seriesGroupId: "g", orderIndex: 1 }),
      media({ id: "c" }),
    ], []);
    expect(executeIntegrityRepair(SCOPE, plan, storage))
      .toMatchObject({ ok: false, code: "issue_stale" });
    expect(executeIntegrityRepair(OTHER_SCOPE, plan, storage))
      .toMatchObject({ ok: false, code: "owner_mismatch" });
  });

  it("rolls back a one-time write failure and marks repeated rollback failure", () => {
    const setup = () => {
      const storage = new MemoryStorage();
      seed(storage);
      expect(writeDuplicateReviewRegistry(SCOPE, {
        version: 1,
        decisions: [{
          candidateFingerprint: "dup:v1:probable:12345678:12345678",
          decision: "ignored",
          scanVersion: 1,
          recordIds: ["media-1", "missing"],
          evidenceFingerprint: "ev:v1:12345678",
          decidedAt: NOW,
        }],
      }, storage).ok).toBe(true);
      return storage;
    };
    const once = setup();
    const oncePlan = planFor(once, "DUPLICATE_REVIEW_DECISION_STALE");
    once.failOnceKey = buildPersonalDataKeys(
      "duplicateReviewDecisions",
      SCOPE,
    ).temp;
    expect(executeIntegrityRepair(SCOPE, oncePlan, once)).toMatchObject({
      ok: false,
      code: "write_failed",
      recoveryRequired: false,
    });
    expect(report(once).issues.map((entry) => entry.code))
      .toContain("DUPLICATE_REVIEW_DECISION_STALE");

    const repeated = setup();
    const repeatedPlan = planFor(repeated, "DUPLICATE_REVIEW_DECISION_STALE");
    repeated.failAlwaysKey = buildPersonalDataKeys(
      "duplicateReviewDecisions",
      SCOPE,
    ).temp;
    expect(executeIntegrityRepair(SCOPE, repeatedPlan, repeated)).toMatchObject({
      ok: false,
      code: "rollback_failed",
      recoveryRequired: true,
    });
    expect(readIntegrityRepairJournal(SCOPE, repeated)).toMatchObject({
      status: "valid",
      data: { state: "recovery-required" },
    });
  });

  it("rolls back when current read-back verification fails", () => {
    const storage = new MemoryStorage();
    seed(storage);
    expect(writeDuplicateReviewRegistry(SCOPE, {
      version: 1,
      decisions: [{
        candidateFingerprint: "dup:v1:probable:12345678:12345678",
        decision: "ignored",
        scanVersion: 1,
        recordIds: ["media-1", "missing"],
        evidenceFingerprint: "ev:v1:12345678",
        decidedAt: NOW,
      }],
    }, storage).ok).toBe(true);
    const plan = planFor(storage, "DUPLICATE_REVIEW_DECISION_STALE");
    storage.corruptReadAfterWriteKey = buildPersonalDataKeys(
      "duplicateReviewDecisions",
      SCOPE,
    ).current;
    expect(executeIntegrityRepair(SCOPE, plan, storage)).toMatchObject({
      ok: false,
      code: "write_failed",
      recoveryRequired: false,
    });
    expect(report(storage).issues.map((entry) => entry.code))
      .toContain("DUPLICATE_REVIEW_DECISION_STALE");
  });

  it("is idempotent, blocks stale undo and never writes XP/social/cloud domains", () => {
    const storage = new MemoryStorage();
    seed(storage, [media({ id: "a", seriesGroupId: "g", orderIndex: 1 }), media({
      id: "b",
      seriesGroupId: "g",
      orderIndex: 1,
    })], []);
    const xpBefore = storage.getItem("media-tracker-xp-outbox");
    const plan = planFor(storage, "GROUP_MEMBER_DUPLICATE_SLOT");
    const first = executeIntegrityRepair(SCOPE, plan, storage);
    expect(first.ok).toBe(true);
    expect(executeIntegrityRepair(SCOPE, plan, storage)).toMatchObject({
      ok: true,
      idempotent: true,
    });
    expect(storage.getItem("media-tracker-xp-outbox")).toBe(xpBefore);
    expect(storage.writes.some((key) => key.includes("social-outbox"))).toBe(false);
    expect(storage.writes.some((key) => key.includes("cloudSync"))).toBe(false);

    const mediaKey = buildLocalDataKeys("media-library", SCOPE).current;
    const raw = JSON.parse(storage.getItem(mediaKey)!) as { records: MediaItem[] };
    raw.records[0].title = "Post repair edit";
    storage.values.set(mediaKey, JSON.stringify(raw));
    expect(undoLastIntegrityRepair(SCOPE, storage)).toMatchObject({
      ok: false,
      code: "issue_stale",
    });
  });

  it("keeps sensitive data out of preview and journal metadata", () => {
    const storage = new MemoryStorage();
    seed(storage, [media({ id: "a", seriesGroupId: "g", orderIndex: 1 }), media({
      id: "b",
      seriesGroupId: "g",
      orderIndex: 1,
      personalNotes: "second-secret-note",
      metadata: { providerPayload: "raw-secret" },
    })], []);
    const plan = planFor(storage, "GROUP_MEMBER_DUPLICATE_SLOT");
    expect(JSON.stringify(plan)).not.toContain("private-note");
    expect(JSON.stringify(plan)).not.toContain("second-secret-note");
    expect(JSON.stringify(plan)).not.toContain("raw-secret");
    expect(executeIntegrityRepair(SCOPE, plan, storage).ok).toBe(true);
    const journal = readIntegrityRepairJournal(SCOPE, storage);
    expect(JSON.stringify(journal)).not.toContain("private-note");
    expect(JSON.stringify(journal)).not.toContain("second-secret-note");
    expect(JSON.stringify(journal)).not.toContain("raw-secret");
  });
});
