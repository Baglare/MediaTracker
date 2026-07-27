import { describe, expect, it } from "vitest";

import {
  buildLocalDataGraphFingerprint,
  scanLocalDataIntegrity,
  type LocalDataIntegrityInput,
} from "@/lib/local-data-integrity";
import { ensureMediaIdentity } from "@/lib/media-identity";
import {
  emptyMediaIdentityAliasRegistry,
  mediaIdentityAliasRegistryCodec,
  type MediaIdentityAliasRegistry,
} from "@/lib/media-identity-aliases";
import {
  emptyMediaRecordRedirectRegistry,
  type MediaRecordRedirectRegistry,
} from "@/lib/media-record-redirects";
import type { DuplicateReviewRegistry } from "@/lib/duplicate-review-registry";
import type { DuplicateMergeJournal } from "@/lib/duplicate-merge";
import {
  createUserOwnerScope,
  GUEST_OWNER_SCOPE,
} from "@/lib/local-owner-scope";
import {
  buildLocalDataKeys,
  inspectScopedLocalData,
  type StorageReadResult,
} from "@/lib/local-data-storage";
import {
  buildPersonalDataKeys,
  inspectPersonalData,
  type PersonalDataReadResult,
} from "@/lib/personal-data-storage";
import type { RecommendationLinkInspectionResult } from "@/lib/social/local-social";
import type { SyncQueueInspectionResult } from "@/lib/sync-queue";
import type { MediaItem, ProgressLog } from "@/lib/types";

const USER_A = createUserOwnerScope("user-a");
const FIXED_NOW = "2026-07-29T12:00:00.000Z";

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
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

function validPersonal<T>(data: T): PersonalDataReadResult<T> {
  return {
    status: "valid",
    sourceKey: "owner-scoped:test",
    data,
    writtenAt: FIXED_NOW,
  };
}

function input(overrides: Partial<LocalDataIntegrityInput> = {}): LocalDataIntegrityInput {
  return {
    scope: USER_A,
    mediaItems: [media()],
    progressLogs: [log()],
    aliases: validPersonal(emptyMediaIdentityAliasRegistry()),
    redirects: validPersonal(emptyMediaRecordRedirectRegistry()),
    now: FIXED_NOW,
    ...overrides,
  };
}

function codes(overrides: Partial<LocalDataIntegrityInput> = {}): string[] {
  return scanLocalDataIntegrity(input(overrides)).issues.map((issue) => issue.code);
}

describe("local data integrity media and identity scan", () => {
  it("reports invalid and duplicate record IDs without removing records", () => {
    const first = media({ id: "same" });
    const second = media({ id: "same", title: "Second" });
    const invalid = media({ id: "" });
    const items = [first, second, invalid];
    const before = JSON.stringify(items);
    const report = scanLocalDataIntegrity(input({ mediaItems: items, progressLogs: [] }));
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "MEDIA_ID_INVALID",
      "MEDIA_ID_DUPLICATE",
    ]));
    expect(report.scannedMediaCount).toBe(3);
    expect(JSON.stringify(items)).toBe(before);
  });

  it("reports missing, unresolved, invalid and mismatched identities", () => {
    const missing = { ...media({ id: "missing" }), identity: undefined };
    const unresolved = {
      ...missing,
      id: "unresolved",
      identityStatus: "unresolved" as const,
      identityIssueCodes: ["IDENTITY_UNRESOLVED" as const],
    };
    const mismatch = media({ id: "mismatch", externalSource: "tmdb", externalId: "42" });
    mismatch.identity = { ...mismatch.identity!, key: "v2:tmdb:movie:43" };
    const invalid = {
      ...media({ id: "invalid" }),
      identity: {
        version: 2,
        key: "v2:unknown:item:1",
        source: "unknown",
        namespace: "item",
        externalId: "1",
      } as unknown as MediaItem["identity"],
    };
    const result = codes({
      mediaItems: [missing, unresolved, mismatch, invalid],
      progressLogs: [],
    });
    expect(result).toEqual(expect.arrayContaining([
      "IDENTITY_MISSING",
      "IDENTITY_UNRESOLVED",
      "IDENTITY_KEY_MISMATCH",
      "IDENTITY_INVALID_SOURCE",
    ]));
  });

  it("groups exact canonical collisions once and keeps every record", () => {
    const first = media({ id: "a", externalSource: "tmdb", externalId: "42" });
    const second = { ...first, id: "b" };
    const third = { ...first, id: "c" };
    const report = scanLocalDataIntegrity(input({
      mediaItems: [third, first, second],
      progressLogs: [],
    }));
    const collision = report.issues.filter((issue) =>
      issue.code === "IDENTITY_EXACT_COLLISION");
    expect(collision).toHaveLength(1);
    expect(collision[0].affectedRecordIds).toEqual(["a", "b", "c"]);
    expect(report.scannedMediaCount).toBe(3);
  });

  it("reports missing and duplicate series membership slots", () => {
    expect(codes({
      mediaItems: [
        media({ id: "missing-group", seriesGroupTitle: "Series" }),
        media({ id: "part-a", seriesGroupId: "series-1", orderIndex: 1 }),
        media({ id: "part-b", seriesGroupId: "series-1", orderIndex: 1 }),
      ],
      progressLogs: [],
    })).toEqual(expect.arrayContaining([
      "GROUP_MEMBER_MISSING_GROUP_ID",
      "GROUP_MEMBER_DUPLICATE_SLOT",
    ]));
  });
});

describe("local data integrity registries and relationships", () => {
  it("reports alias collision, invalid/orphan target, chain and cycle diagnostics", () => {
    const collisionRegistry: MediaIdentityAliasRegistry = {
      version: 1,
      records: [{
        alias: "old",
        canonicalKey: "v2:tmdb:movie:999",
        aliasType: "record-id",
        createdAt: FIXED_NOW,
      }],
      issues: [{
        id: "collision",
        code: "IDENTITY_ALIAS_COLLISION",
        severity: "warning",
        currentIdentity: "v2:tmdb:movie:1",
        expectedIdentity: "v2:tmdb:movie:2",
        repairable: false,
        evidence: "collision",
      }],
    };
    expect(codes({ aliases: validPersonal(collisionRegistry) })).toEqual(
      expect.arrayContaining(["ALIAS_COLLISION", "ALIAS_ORPHAN_TARGET"]),
    );
    for (const diagnosticCode of ["alias_invalid_target", "alias_chain", "alias_cycle"]) {
      expect(codes({
        aliases: {
          status: "corrupt",
          sourceKey: "alias",
          diagnosticCode,
          message: "invalid",
        },
      })).toContain(diagnosticCode.toUpperCase());
    }
  });

  it("reports redirect chain, cycle and missing target", () => {
    const registry: MediaRecordRedirectRegistry = {
      version: 1,
      records: [{
        fromRecordId: "old",
        toRecordId: "missing",
        operationId: "op-1",
        createdAt: FIXED_NOW,
      }],
    };
    expect(codes({ redirects: validPersonal(registry) })).toContain("REDIRECT_MISSING_TARGET");
    for (const diagnosticCode of ["redirect_chain", "redirect_cycle"]) {
      expect(codes({
        redirects: {
          status: "corrupt",
          sourceKey: "redirect",
          diagnosticCode,
          message: "invalid",
        },
      })).toContain(diagnosticCode.toUpperCase());
    }
  });

  it("reports orphan, duplicate and conflicting progress logs", () => {
    const same = log({ id: "duplicate" });
    const conflict = log({ id: "conflict" });
    expect(codes({
      progressLogs: [
        log({ id: "orphan", mediaId: "missing" }),
        same,
        { ...same },
        conflict,
        { ...conflict, newProgress: 1 },
      ],
    })).toEqual(expect.arrayContaining([
      "PROGRESS_LOG_MEDIA_MISSING",
      "PROGRESS_LOG_ID_DUPLICATE",
      "PROGRESS_LOG_ID_CONFLICT",
    ]));
  });

  it("recognizes a pending redirect instead of hiding an orphan log", () => {
    const redirects: MediaRecordRedirectRegistry = {
      version: 1,
      records: [{
        fromRecordId: "old",
        toRecordId: "media-1",
        operationId: "op-1",
        createdAt: FIXED_NOW,
      }],
    };
    expect(codes({
      progressLogs: [log({ mediaId: "old" })],
      redirects: validPersonal(redirects),
    })).toContain("PROGRESS_LOG_REDIRECT_PENDING");
  });

  it("reports missing and foreign recommendation local links", () => {
    const source: RecommendationLinkInspectionResult = {
      status: "valid",
      links: [{
        recommendationId: "rec-1",
        localMediaId: "missing",
        canonicalMediaKey: "v2:tmdb:movie:1",
        linkedAt: FIXED_NOW,
        userId: "user-a",
      }],
      issues: [{
        code: "recommendation_link_owner_mismatch",
        index: 1,
        localMediaId: "foreign",
      }],
    };
    expect(codes({ recommendationLinks: source })).toEqual(expect.arrayContaining([
      "RECOMMENDATION_LINK_MEDIA_MISSING",
      "RECOMMENDATION_LINK_OWNER_MISMATCH",
    ]));
  });

  it("reports stale duplicate decisions", () => {
    const registry: DuplicateReviewRegistry = {
      version: 1,
      decisions: [{
        candidateFingerprint: "dup:v1:probable:12345678:12345678",
        decision: "ignored",
        scanVersion: 1,
        recordIds: ["media-1", "old-record"],
        evidenceFingerprint: "ev:v1:12345678",
        decidedAt: FIXED_NOW,
      }],
    };
    expect(codes({ duplicateReviews: validPersonal(registry) })).toContain(
      "DUPLICATE_REVIEW_DECISION_STALE",
    );
  });
});

describe("local data integrity recovery and queue signals", () => {
  function journalSource(
    state: DuplicateMergeJournal["state"],
    ownerScope = USER_A.key,
  ): PersonalDataReadResult<DuplicateMergeJournal> {
    return validPersonal({
      ownerScope,
      state,
      updatedAt: "2026-07-29T10:00:00.000Z",
      plan: { selectedRecordIds: ["media-1", "media-2"] },
    } as unknown as DuplicateMergeJournal);
  }

  it("reports owner mismatch, stuck and recovery-required merge journals", () => {
    expect(codes({ mergeJournal: journalSource("prepared") })).toContain(
      "MERGE_JOURNAL_STUCK",
    );
    expect(codes({ mergeJournal: journalSource("recovery-required") })).toContain(
      "MERGE_JOURNAL_RECOVERY_REQUIRED",
    );
    expect(codes({ mergeJournal: journalSource("prepared", "user:user-b") })).toContain(
      "MERGE_JOURNAL_OWNER_MISMATCH",
    );
  });

  it("reports invalid, foreign and orphan cloud queue operations", () => {
    const queue: SyncQueueInspectionResult = {
      status: "valid",
      items: [{
        id: "queue-1",
        entity: "media_item",
        operation: "upsert",
        payload: { id: "missing-media" },
        createdAt: FIXED_NOW,
        retryCount: 0,
        ownerScope: USER_A.key,
        userId: "user-a",
      }],
      issues: [
        { code: "queue_item_invalid", index: 1, recordId: "invalid" },
        { code: "queue_owner_mismatch", index: 2, recordId: "foreign" },
      ],
    };
    expect(codes({ syncQueue: queue })).toEqual(expect.arrayContaining([
      "CLOUD_QUEUE_ORPHAN_UPSERT",
      "QUEUE_ITEM_INVALID",
      "QUEUE_OWNER_MISMATCH",
    ]));
  });

  it.each([
    ["corrupt", "ENVELOPE_CORRUPT"],
    ["owner_mismatch", "ENVELOPE_OWNER_MISMATCH"],
    ["unsupported_version", "ENVELOPE_UNSUPPORTED_VERSION"],
  ] as const)("reports %s media envelope state", (status, expected) => {
    const envelope: StorageReadResult<MediaItem[]> = {
      status,
      sourceKey: "media",
      issues: [{ code: status, message: "invalid" }],
    };
    expect(codes({ mediaEnvelope: envelope })).toContain(expected);
  });

  it("reports codec and owned schema version mismatches", () => {
    const envelope: StorageReadResult<MediaItem[]> = {
      status: "valid",
      sourceKey: "media",
      schemaVersion: 2,
      data: [media()],
      issues: [{ code: "legacy_repair", message: "repair", recordId: "media-1" }],
    };
    expect(codes({ mediaEnvelope: envelope })).toEqual(expect.arrayContaining([
      "ENVELOPE_VERSION_MISMATCH",
      "ENVELOPE_CODEC_LEGACY_REPAIR",
    ]));
  });
});

describe("local data integrity determinism, privacy and owner isolation", () => {
  it("returns stable issue IDs independent of record order and suppresses repeats", () => {
    const identity = media({ id: "a", externalSource: "tmdb", externalId: "42" }).identity;
    const items = [
      media({ id: "a", identity }),
      media({ id: "b", identity }),
      media({ id: "c", identity }),
    ];
    const first = scanLocalDataIntegrity(input({ mediaItems: items, progressLogs: [] }));
    const second = scanLocalDataIntegrity(input({
      mediaItems: [...items].reverse(),
      progressLogs: [],
    }));
    expect(first.issues.map((issue) => issue.id)).toEqual(
      second.issues.map((issue) => issue.id),
    );
    expect(new Set(first.issues.map((issue) => issue.id)).size).toBe(first.issues.length);
  });

  it("keeps unresolved records and every source fingerprint unchanged", () => {
    const unresolved = {
      ...media({ id: "unresolved" }),
      identity: undefined,
      identityStatus: "unresolved" as const,
      personalNotes: "private-note",
      metadata: { providerPayload: "secret-token" },
    };
    const source = input({ mediaItems: [unresolved], progressLogs: [] });
    const before = buildLocalDataGraphFingerprint(source);
    const report = scanLocalDataIntegrity(source);
    expect(source.mediaItems).toHaveLength(1);
    expect(buildLocalDataGraphFingerprint(source)).toBe(before);
    expect(JSON.stringify(report)).not.toContain("private-note");
    expect(JSON.stringify(report)).not.toContain("secret-token");
  });

  it("does not expose raw owner UID and isolates guest/user report ownership", () => {
    const userReport = scanLocalDataIntegrity(input({ scope: USER_A }));
    const guestReport = scanLocalDataIntegrity(input({ scope: GUEST_OWNER_SCOPE }));
    expect(userReport.ownerKind).toBe("user");
    expect(guestReport.ownerKind).toBe("guest");
    expect(JSON.stringify(userReport)).not.toContain("user-a");
  });

  it("returns no issues for a healthy graph", () => {
    const report = scanLocalDataIntegrity(input());
    expect(report.issues).toEqual([]);
    expect(report.counts.severity).toEqual({
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    });
  });

  it("inspects corrupt envelope and registry payloads without quarantine or writes", () => {
    const values = new Map<string, string>([
      [buildLocalDataKeys("media-library", USER_A).current, "{broken-media"],
      [
        buildPersonalDataKeys("mediaIdentityAliases", USER_A).current,
        "{broken-registry",
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
    };
    const before = JSON.stringify([...values]);
    expect(inspectScopedLocalData(
      USER_A,
      "media-library",
      storage,
    ).status).toBe("corrupt");
    expect(inspectPersonalData(
      USER_A,
      "mediaIdentityAliases",
      mediaIdentityAliasRegistryCodec,
      storage,
    ).status).toBe("corrupt");
    expect(JSON.stringify([...values])).toBe(before);
    expect([...values.keys()].some((key) => key.includes("quarantine"))).toBe(false);
  });

  it("uses the explicit active scope rather than inferring ownership from records", () => {
    const scopeB = createUserOwnerScope("user-b");
    const report = scanLocalDataIntegrity(input({
      scope: scopeB,
      syncQueue: {
        status: "valid",
        items: [],
        issues: [{ code: "queue_owner_mismatch", index: 0 }],
      },
    }));
    expect(report.ownerKind).toBe("user");
    expect(report.issues.map((issue) => issue.code)).toContain("QUEUE_OWNER_MISMATCH");
    expect(JSON.stringify(report)).not.toContain("user-b");
  });
});
