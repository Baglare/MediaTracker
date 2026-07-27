import { describe, expect, it, vi } from "vitest";

import {
  buildDuplicateMergePlan,
  buildDuplicateMergePlanForCurrentState,
  executeDuplicateMerge,
  prepareDuplicateMerge,
  prepareDuplicateMergeForCurrentState,
  readDuplicateMergeJournal,
  recoverPendingDuplicateMerge,
  undoLastDuplicateMerge,
  writeDuplicateMergeJournal,
  type FieldMergeSelection,
} from "@/lib/duplicate-merge";
import { scanDuplicateCandidates } from "@/lib/duplicate-scanner";
import {
  emptyMediaIdentityAliasRegistry,
  readMediaIdentityAliasRegistry,
} from "@/lib/media-identity-aliases";
import { ensureMediaIdentity } from "@/lib/media-identity";
import {
  buildLocalDataKeys,
  loadScopedMediaList,
  loadScopedProgressLogs,
  saveScopedLibrarySnapshot,
} from "@/lib/local-data-storage";
import {
  createUserOwnerScope,
  GUEST_OWNER_SCOPE,
  type LocalOwnerScope,
} from "@/lib/local-owner-scope";
import {
  emptyMediaRecordRedirectRegistry,
  readMediaRecordRedirectRegistry,
  resolveMediaRecordRedirect,
} from "@/lib/media-record-redirects";
import { buildPersonalDataKeys } from "@/lib/personal-data-storage";
import {
  loadRecommendationLinksForScope,
  replaceRecommendationLinksForScope,
} from "@/lib/social/local-social";
import { buildSyncQueueKey, loadSyncQueue } from "@/lib/sync-queue";
import type { MediaItem, ProgressLog } from "@/lib/types";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  failOnceKey: string | null = null;
  failAlwaysKey: string | null = null;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (key === this.failOnceKey) {
      this.failOnceKey = null;
      throw new Error("injected_write_failure");
    }
    if (key === this.failAlwaysKey) throw new Error("injected_write_failure");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return ensureMediaIdentity({
    id: "record-a",
    title: "Example",
    type: "movie",
    status: "planning",
    coverImage: "/cover.jpg",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    externalSource: "tmdb",
    externalId: "42",
    ...overrides,
  }).item;
}

function log(id: string, mediaId: string, newProgress: number): ProgressLog {
  return {
    id,
    mediaId,
    mediaTitle: "Example",
    mediaType: "movie",
    action: "increment",
    amount: 1,
    unit: "movie",
    previousProgress: Math.max(0, newProgress - 1),
    newProgress,
    createdAt: `2026-07-28T00:00:0${newProgress}.000Z`,
  };
}

function candidate(items: MediaItem[], scope: LocalOwnerScope) {
  return scanDuplicateCandidates(items, emptyMediaIdentityAliasRegistry(), {
    ownerScope: scope.key,
  }).candidates[0];
}

function setup(
  scope: LocalOwnerScope = GUEST_OWNER_SCOPE,
  overrides: {
    items?: MediaItem[];
    logs?: ProgressLog[];
    storage?: MemoryStorage;
  } = {},
) {
  const storage = overrides.storage ?? new MemoryStorage();
  const first = media({ id: "record-a" });
  const second = { ...first, id: "record-b" };
  const items = overrides.items ?? [first, second];
  const logs = overrides.logs ?? [
    log("log-a", "record-a", 1),
    log("log-b", "record-b", 2),
  ];
  expect(saveScopedLibrarySnapshot(scope, items, logs, "user", storage).ok).toBe(true);
  return {
    scope,
    storage,
    items,
    logs,
    candidate: candidate(items, scope),
  };
}

function planFor(
  context: ReturnType<typeof setup>,
  overrides: Partial<{
    selectedRecordIds: string[];
    survivorRecordId: string;
    canonicalIdentityKey: string;
    fieldSelections: Record<string, FieldMergeSelection>;
    probableConfirmed: boolean;
    explicitMergeConfirmed: boolean;
  }> = {},
) {
  const selectedRecordIds = overrides.selectedRecordIds ?? ["record-a", "record-b"];
  const currentPreparation = prepareDuplicateMergeForCurrentState(
    context.scope,
    context.candidate,
    selectedRecordIds,
    context.storage,
  );
  if (!currentPreparation.ok) throw new Error(currentPreparation.blocker.message);
  const prepared = currentPreparation.preparation;
  const survivorRecordId = overrides.survivorRecordId ?? selectedRecordIds[0];
  const fieldSelections = overrides.fieldSelections ?? Object.fromEntries(
    prepared.fieldConflicts.map((conflict) => [
      String(conflict.field),
      { kind: "record", recordId: survivorRecordId } satisfies FieldMergeSelection,
    ]),
  );
  return buildDuplicateMergePlanForCurrentState(context.scope, context.candidate, {
    selectedRecordIds,
    survivorRecordId,
    canonicalIdentityKey: overrides.canonicalIdentityKey
      ?? prepared.suggestedCanonicalIdentityKey!,
    fieldSelections,
    probableConfirmed: overrides.probableConfirmed ?? true,
    explicitMergeConfirmed: overrides.explicitMergeConfirmed ?? true,
  }, context.storage);
}

describe("duplicate merge eligibility and plan", () => {
  it("keeps survivor record and canonical identity as separate explicit choices", () => {
    const tmdb = media({ id: "tmdb", imdbId: "tt0133093" });
    const omdb = media({
      id: "omdb",
      externalSource: "omdb",
      externalId: "tt0133093",
      imdbId: undefined,
    });
    const context = setup(GUEST_OWNER_SCOPE, { items: [tmdb, omdb], logs: [] });
    const prepared = prepareDuplicateMerge({
      scope: context.scope,
      candidate: context.candidate,
      selectedRecordIds: ["tmdb", "omdb"],
      mediaItems: context.items,
      progressLogs: [],
      aliases: emptyMediaIdentityAliasRegistry(),
      redirects: emptyMediaRecordRedirectRegistry(),
      recommendationLinks: [],
    });
    const selections = Object.fromEntries(prepared.fieldConflicts.map((conflict) => [
      String(conflict.field),
      { kind: "record", recordId: "omdb" } satisfies FieldMergeSelection,
    ]));
    const result = buildDuplicateMergePlan({
      scope: context.scope,
      candidate: context.candidate,
      selectedRecordIds: ["tmdb", "omdb"],
      survivorRecordId: "omdb",
      canonicalIdentityKey: tmdb.identity!.key,
      fieldSelections: selections,
      probableConfirmed: true,
      explicitMergeConfirmed: true,
      mediaItems: context.items,
      progressLogs: [],
      aliases: emptyMediaIdentityAliasRegistry(),
      redirects: emptyMediaRecordRedirectRegistry(),
      recommendationLinks: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.survivorRecordId).toBe("omdb");
    expect(result.plan.canonicalIdentityKey).toBe(tmdb.identity!.key);
    expect(result.mergedItem.id).toBe("omdb");
    expect(result.mergedItem.identity?.key).toBe(tmdb.identity!.key);
    expect(result.mergedItem.externalSource).toBe("tmdb");
    expect(result.mergedItem.externalId).toBe("42");
  });

  it("requires explicit probable and destructive confirmations", () => {
    const items = [
      media({ id: "record-a", externalSource: undefined, externalId: undefined }),
      media({ id: "record-b", externalSource: undefined, externalId: undefined }),
    ];
    const context = setup(GUEST_OWNER_SCOPE, { items, logs: [] });
    expect(context.candidate.classification).toBe("probable");
    const result = planFor(context, {
      probableConfirmed: false,
      explicitMergeConfirmed: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blockers.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "probable_confirmation_required",
      "merge_confirmation_required",
    ]));
  });

  it("does not select a connected-component automatically and validates a chosen subset", () => {
    const first = media({ id: "a" });
    const items = [first, { ...first, id: "b" }, { ...first, id: "c" }];
    const context = setup(GUEST_OWNER_SCOPE, { items, logs: [] });
    const prepared = prepareDuplicateMerge({
      scope: context.scope,
      candidate: context.candidate,
      selectedRecordIds: ["a", "b"],
      mediaItems: items,
      progressLogs: [],
      aliases: emptyMediaIdentityAliasRegistry(),
      redirects: emptyMediaRecordRedirectRegistry(),
      recommendationLinks: [],
    });
    expect(prepared.selectedRecordIds).toEqual(["a", "b"]);
    expect(prepared.candidate.recordIds).toEqual(["a", "b", "c"]);
    expect(prepared.blockers).toEqual([]);
  });

  it("rejects stale candidate state and unresolved field conflicts", () => {
    const context = setup();
    const stale = buildDuplicateMergePlanForCurrentState(context.scope, context.candidate, {
      selectedRecordIds: ["record-a", "record-b"],
      survivorRecordId: "record-a",
      canonicalIdentityKey: context.items[0].identity!.key,
      fieldSelections: {},
      probableConfirmed: true,
      explicitMergeConfirmed: true,
    }, context.storage);
    expect(stale.ok).toBe(true);
    context.items[1].title = "Changed after preview";
    expect(saveScopedLibrarySnapshot(
      context.scope,
      context.items,
      context.logs,
      "user",
      context.storage,
    ).ok).toBe(true);
    const execution = stale.ok
      ? executeDuplicateMerge(context.scope, stale.plan, { storage: context.storage })
      : null;
    expect(execution).toMatchObject({ ok: false, code: "candidate_stale" });

    const conflicting = setup(GUEST_OWNER_SCOPE, {
      items: [
        media({ id: "record-a", rating: 3 }),
        media({ id: "record-b", rating: 5 }),
      ],
      logs: [],
    });
    const unresolved = planFor(conflicting, { fieldSelections: {} });
    expect(unresolved.ok).toBe(false);
    if (!unresolved.ok) {
      expect(unresolved.blockers.map((entry) => entry.code))
        .toContain("field_conflict_unresolved");
    }
  });

  it("requires explicit field decisions, including note selection and collection union", () => {
    const first = media({
      id: "record-a",
      personalNotes: "İlk özel not",
      genres: ["Drama"],
      rating: 3,
    });
    const second = {
      ...first,
      id: "record-b",
      personalNotes: "İkinci özel not",
      genres: ["Science Fiction"],
      rating: 5,
    };
    const context = setup(GUEST_OWNER_SCOPE, { items: [first, second], logs: [] });
    const currentPreparation = prepareDuplicateMergeForCurrentState(
      context.scope,
      context.candidate,
      ["record-a", "record-b"],
      context.storage,
    );
    expect(currentPreparation.ok).toBe(true);
    if (!currentPreparation.ok) return;
    const selections = Object.fromEntries(
      currentPreparation.preparation.fieldConflicts.map((conflict) => [
        String(conflict.field),
        { kind: "record", recordId: "record-a" } satisfies FieldMergeSelection,
      ]),
    );
    selections.personalNotes = { kind: "record", recordId: "record-b" };
    selections.genres = { kind: "union", recordIds: ["record-a", "record-b"] };
    const result = buildDuplicateMergePlanForCurrentState(
      context.scope,
      context.candidate,
      {
        selectedRecordIds: ["record-a", "record-b"],
        survivorRecordId: "record-a",
        canonicalIdentityKey: first.identity!.key,
        fieldSelections: selections,
        probableConfirmed: true,
        explicitMergeConfirmed: true,
      },
      context.storage,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mergedItem.personalNotes).toBe("İkinci özel not");
    expect(result.mergedItem.genres).toEqual(["Drama", "Science Fiction"]);
    expect(result.mergedItem.rating).toBe(3);
  });

  it("blocks different group memberships because the persisted model has one group slot", () => {
    const first = media({ id: "record-a", seriesGroupId: "group-a" });
    const second = { ...first, id: "record-b", seriesGroupId: "group-b" };
    const context = setup(GUEST_OWNER_SCOPE, { items: [first, second], logs: [] });
    const prepared = prepareDuplicateMergeForCurrentState(
      context.scope,
      context.candidate,
      ["record-a", "record-b"],
      context.storage,
    );
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.preparation.blockers.map((entry) => entry.code))
        .toContain("group_membership_conflict");
    }
  });
});

describe("duplicate merge transaction and undo", () => {
  it("remaps logs and links, flattens aliases/redirects, and never changes XP", () => {
    const scope = createUserOwnerScope("user-a");
    const context = setup(scope);
    expect(replaceRecommendationLinksForScope(scope, [{
      recommendationId: "recommendation-1",
      localMediaId: "record-b",
      canonicalMediaKey: context.items[1].identity!.key,
      linkedAt: "2026-07-28T00:00:00.000Z",
      userId: "user-a",
    }], context.storage)).toBe(true);
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const triggerSync = vi.fn();
    const result = executeDuplicateMerge(scope, plan.plan, {
      storage: context.storage,
      triggerSync,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result).toMatchObject({ ok: true, state: "sync-pending" });
    expect(triggerSync).toHaveBeenCalledTimes(1);
    expect(loadScopedMediaList(scope, context.storage).data?.map((item) => item.id))
      .toEqual(["record-a"]);
    const logs = loadScopedProgressLogs(scope, context.storage).data!;
    expect(logs).toHaveLength(2);
    expect(logs.every((entry) => entry.mediaId === "record-a")).toBe(true);
    expect(logs.map((entry) => entry.id)).toEqual(["log-a", "log-b"]);
    expect(loadRecommendationLinksForScope(scope, context.storage)).toMatchObject([
      { recommendationId: "recommendation-1", localMediaId: "record-a" },
    ]);
    const redirects = readMediaRecordRedirectRegistry(scope, context.storage);
    expect(redirects.status).toBe("valid");
    if (redirects.status === "valid") {
      expect(resolveMediaRecordRedirect(redirects.data, "record-b")).toBe("record-a");
    }
    const aliases = readMediaIdentityAliasRegistry(scope, context.storage);
    expect(aliases.status).toBe("valid");
    expect(loadSyncQueue(scope, context.storage)).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: "media_item", operation: "upsert" }),
      expect.objectContaining({ entity: "media_item", operation: "delete" }),
    ]));
    expect(readDuplicateMergeJournal(scope, context.storage)).toMatchObject({
      status: "valid",
      data: {
        state: "sync-pending",
        receipt: {
          xpCompatibilityKeys: [expect.any(String)],
        },
      },
    });
  });

  it("keeps guest merge local and applies the same operation idempotently", () => {
    const context = setup();
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const first = executeDuplicateMerge(context.scope, plan.plan, { storage: context.storage });
    const second = executeDuplicateMerge(context.scope, plan.plan, { storage: context.storage });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect(first).toMatchObject({ ok: true, state: "completed" });
    expect(second).toMatchObject({ ok: true, state: "completed", idempotent: true });
    expect(loadSyncQueue(context.scope, context.storage)).toEqual([]);
  });

  it("undo restores media, logs, aliases, redirects and queues compensation without XP work", () => {
    const scope = createUserOwnerScope("user-a");
    const context = setup(scope);
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const executed = executeDuplicateMerge(scope, plan.plan, { storage: context.storage });
    expect(executed.ok, JSON.stringify(executed)).toBe(true);
    const result = undoLastDuplicateMerge(scope, { storage: context.storage });
    expect(result).toMatchObject({ ok: true, state: "rolled-back" });
    expect(loadScopedMediaList(scope, context.storage).data?.map((item) => item.id))
      .toEqual(["record-a", "record-b"]);
    expect(loadScopedProgressLogs(scope, context.storage).data?.map((entry) => entry.mediaId))
      .toEqual(["record-a", "record-b"]);
    const redirects = readMediaRecordRedirectRegistry(scope, context.storage);
    expect(redirects.status).toBe("valid");
    if (redirects.status === "valid") expect(redirects.data.records).toEqual([]);
    expect(undoLastDuplicateMerge(scope, { storage: context.storage }))
      .toMatchObject({ ok: true, state: "rolled-back", idempotent: true });
  });

  it("blocks undo after a post-merge local edit and isolates owner journals", () => {
    const scope = createUserOwnerScope("user-a");
    const context = setup(scope);
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const executed = executeDuplicateMerge(scope, plan.plan, { storage: context.storage });
    expect(executed.ok, JSON.stringify(executed)).toBe(true);
    const current = loadScopedMediaList(scope, context.storage).data!;
    current[0] = { ...current[0], favorite: true };
    expect(saveScopedLibrarySnapshot(
      scope,
      current,
      loadScopedProgressLogs(scope, context.storage).data!,
      "user",
      context.storage,
    ).ok).toBe(true);
    expect(undoLastDuplicateMerge(scope, { storage: context.storage }))
      .toMatchObject({ ok: false, code: "candidate_stale" });
    expect(undoLastDuplicateMerge(createUserOwnerScope("user-b"), {
      storage: context.storage,
    })).toMatchObject({ ok: false, code: "journal_recovery_required" });
  });

  it("rolls every changed domain back when a redirect write fails", () => {
    const context = setup();
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    context.storage.failOnceKey = buildPersonalDataKeys(
      "mediaRecordRedirects",
      context.scope,
    ).temp;
    const result = executeDuplicateMerge(context.scope, plan.plan, {
      storage: context.storage,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "write_failed",
      recoveryRequired: false,
    });
    expect(loadScopedMediaList(context.scope, context.storage).data).toHaveLength(2);
    expect(loadScopedProgressLogs(context.scope, context.storage).data?.map((entry) => entry.mediaId))
      .toEqual(["record-a", "record-b"]);
    expect(readDuplicateMergeJournal(context.scope, context.storage))
      .toMatchObject({ status: "valid", data: { state: "rolled-back" } });
  });

  it("marks recovery-required when both a local write and rollback fail", () => {
    const context = setup();
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    context.storage.failAlwaysKey = buildLocalDataKeys(
      "progress-logs",
      context.scope,
    ).temp;
    const result = executeDuplicateMerge(context.scope, plan.plan, {
      storage: context.storage,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "rollback_failed",
      recoveryRequired: true,
    });
    const journal = readDuplicateMergeJournal(context.scope, context.storage);
    expect(journal).toMatchObject({
      status: "valid",
      data: { state: "recovery-required" },
    });
  });

  it("rolls the local transaction back when durable cloud queue persistence fails", () => {
    const scope = createUserOwnerScope("user-a");
    const context = setup(scope);
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    context.storage.failOnceKey = buildSyncQueueKey(scope);
    const result = executeDuplicateMerge(scope, plan.plan, {
      storage: context.storage,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "write_failed",
      recoveryRequired: false,
    });
    expect(loadScopedMediaList(scope, context.storage).data).toHaveLength(2);
    expect(loadSyncQueue(scope, context.storage)).toEqual([]);
  });

  it("recovers an incomplete journal once and remains idempotent on startup", () => {
    const context = setup();
    const plan = planFor(context);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(executeDuplicateMerge(context.scope, plan.plan, {
      storage: context.storage,
    }).ok).toBe(true);
    const read = readDuplicateMergeJournal(context.scope, context.storage);
    expect(read.status).toBe("valid");
    if (read.status !== "valid") return;
    expect(writeDuplicateMergeJournal(context.scope, {
      ...read.data,
      state: "applying",
      updatedAt: "2026-07-28T02:00:00.000Z",
    }, context.storage).ok).toBe(true);
    expect(recoverPendingDuplicateMerge(context.scope, context.storage))
      .toMatchObject({ ok: true, state: "rolled-back" });
    expect(loadScopedMediaList(context.scope, context.storage).data).toHaveLength(2);
    expect(readDuplicateMergeJournal(context.scope, context.storage))
      .toMatchObject({ status: "valid", data: { state: "rolled-back" } });
    expect(recoverPendingDuplicateMerge(context.scope, context.storage)).toBeNull();
  });
});
