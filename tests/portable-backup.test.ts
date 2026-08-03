import { describe, expect, it } from "vitest";

import { createBackupPayload, parseBackupJson } from "@/lib/backup";
import { ensureMediaIdentity } from "@/lib/media-identity";
import {
  writeMediaIdentityAliasRegistry,
  type MediaIdentityAliasRegistry,
} from "@/lib/media-identity-aliases";
import {
  writeMediaRecordRedirectRegistry,
  type MediaRecordRedirectRegistry,
} from "@/lib/media-record-redirects";
import {
  MAX_PORTABLE_BACKUP_BYTES,
  collectPortableBackupSource,
  computePortableBackupChecksum,
  createPortableBackup,
  inspectPortableBackupText,
  portableBackupFilename,
  serializePortableBackup,
  type PortableBackupSource,
  type PortableBackupV2,
} from "@/lib/portable-backup";
import {
  GUEST_OWNER_SCOPE,
  createUserOwnerScope,
} from "@/lib/local-owner-scope";
import {
  replaceRecommendationLinksForScope,
} from "@/lib/social/local-social";
import type { MediaItem, ProgressLog } from "@/lib/types";

const EXPORTED_AT = "2026-07-30T10:00:00.000Z";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return ensureMediaIdentity({
    id: "media-1",
    title: "Portable Example",
    type: "movie",
    status: "planning",
    coverImage: "/cover.jpg",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    externalSource: "tmdb",
    externalId: "42",
    personalNotes: "very-private-note",
    seriesGroupId: "group-1",
    orderIndex: 1,
    ...overrides,
  }).item;
}

function progress(overrides: Partial<ProgressLog> = {}): ProgressLog {
  return {
    id: "log-1",
    mediaId: "media-1",
    mediaTitle: "Portable Example",
    mediaType: "movie",
    action: "added",
    amount: 0,
    unit: "movie",
    previousProgress: 0,
    newProgress: 0,
    createdAt: EXPORTED_AT,
    ...overrides,
  };
}

function aliasRegistry(): MediaIdentityAliasRegistry {
  return {
    version: 1,
    records: [{
      alias: "tmdb:42",
      canonicalKey: "v2:tmdb:movie:42",
      aliasType: "legacy-canonical-key",
      createdAt: EXPORTED_AT,
    }],
    issues: [],
  };
}

function redirectRegistry(): MediaRecordRedirectRegistry {
  return {
    version: 1,
    records: [{
      fromRecordId: "old-media",
      toRecordId: "media-1",
      operationId: "merge-op",
      createdAt: EXPORTED_AT,
    }],
  };
}

function source(ownerType: "guest" | "authenticated" = "authenticated"): PortableBackupSource {
  return {
    ownerType,
    mediaItems: [media()],
    progressLogs: [progress()],
    identityAliases: aliasRegistry(),
    recordRedirects: redirectRegistry(),
    recommendationLinks: [{
      recommendationId: "rec-1",
      localMediaId: "media-1",
      canonicalMediaKey: "v2:tmdb:movie:42",
      linkedAt: EXPORTED_AT,
    }],
  };
}

async function create(
  value: PortableBackupSource = source(),
  includePersonalNotes = false,
) {
  return createPortableBackup(value, {
    exportedAt: EXPORTED_AT,
    includePersonalNotes,
  });
}

async function reseal(value: PortableBackupV2): Promise<string> {
  value.manifest.checksum.value = await computePortableBackupChecksum(
    value.manifest,
    value.data,
  );
  return serializePortableBackup(value);
}

describe("Portable Backup V2 export", () => {
  it("serializes deterministically independent of source record order", async () => {
    const firstSource = source();
    firstSource.mediaItems.push(media({
      id: "media-2",
      externalId: "43",
      title: "Second",
    }));
    const secondSource = structuredClone(firstSource);
    secondSource.mediaItems.reverse();

    const first = await create(firstSource);
    const second = await create(secondSource);
    expect(first.serialized).toBe(second.serialized);
    expect(first.backup.manifest.checksum.value).toHaveLength(64);
  });

  it("uses only guest/authenticated owner type and never serializes raw UID", async () => {
    const rawUid = "25cbf708-6845-4bdc-9a93-secret-owner";
    const guest = await create(source("guest"));
    const authenticated = await create(source("authenticated"));

    expect(guest.backup.manifest.ownerType).toBe("guest");
    expect(authenticated.backup.manifest.ownerType).toBe("authenticated");
    expect(authenticated.serialized).not.toContain(rawUid);
    expect(authenticated.serialized).not.toContain("userId");
    expect(authenticated.serialized).not.toContain("ownerScope");
  });

  it("strips raw provider payload, unknown secret fields and excludes notes by default", async () => {
    const unsafe = media() as MediaItem & Record<string, unknown>;
    unsafe.metadata = { providerPayload: "raw-provider-secret" };
    unsafe.apiKey = "api-key-secret";
    const created = await create({ ...source(), mediaItems: [unsafe] });

    expect(created.serialized).not.toContain("raw-provider-secret");
    expect(created.serialized).not.toContain("api-key-secret");
    expect(created.serialized).not.toContain("very-private-note");
    expect(created.backup.manifest.privacy.rawProviderPayloadExcluded).toBe(true);
  });

  it("includes personal notes only after explicit selection", async () => {
    const excluded = await create(source(), false);
    const included = await create(source(), true);

    expect(excluded.serialized).not.toContain("very-private-note");
    expect(excluded.backup.manifest.privacy.personalNotesIncluded).toBe(false);
    expect(included.serialized).toContain("very-private-note");
    expect(included.backup.manifest.privacy.personalNotesIncluded).toBe(true);
  });

  it("round-trips every core domain through read-only codecs", async () => {
    const created = await create();
    const inspected = await inspectPortableBackupText(created.serialized);

    expect(inspected.status).toBe("valid");
    expect(inspected.errorCount).toBe(0);
    expect(inspected.summary.counts).toMatchObject({
      mediaItems: 1,
      progressLogs: 1,
      identityAliases: 1,
      recordRedirects: 1,
      recommendationLinks: 1,
    });
    expect(inspected.summary.relationships.groupedMedia).toBe(1);
  });

  it("exports manual releases and hidden provider keys but not provider cache", async () => {
    const calendarMedia = media({
      releaseCalendar: {
        version: 1,
        manualEvents: [{
          id: "550e8400-e29b-41d4-a716-446655440000",
          mediaId: "media-1",
          eventKind: "movie_release",
          title: "Portable manual release",
          schedule: { precision: "date_only", date: "2026-08-10" },
          note: "portable-event-note",
          createdAt: EXPORTED_AT,
          updatedAt: EXPORTED_AT,
        }],
        hiddenProviderEventKeys: ["tmdb:release-42"],
      },
    });
    const created = await create({ ...source(), mediaItems: [calendarMedia] });
    const inspected = await inspectPortableBackupText(created.serialized);

    expect(inspected.status).toBe("valid");
    expect(created.backup.data.mediaItems?.[0].releaseCalendar)
      .toEqual(calendarMedia.releaseCalendar);
    expect(created.serialized).toContain("portable-event-note");
    expect(created.serialized).not.toContain("releaseCalendarCache");
  });

  it("produces the stable browser download filename", () => {
    expect(portableBackupFilename(EXPORTED_AT))
      .toBe("mediatracker-portable-v3-2026-07-30.json");
  });

  it("cannot enter the existing legacy import write path", async () => {
    const created = await create();
    expect(parseBackupJson(created.serialized)).toEqual({
      valid: false,
      error: "Portable Backup V2 bu aşamada yalnız read-only incelenebilir; restore/import desteklenmiyor.",
    });
  });
});

describe("Portable Backup V2 read-only inspection", () => {
  it("accepts a valid checksum and rejects modified content", async () => {
    const created = await create();
    expect((await inspectPortableBackupText(created.serialized)).status).toBe("valid");

    const modified = created.serialized.replace("Portable Example", "Changed");
    const inspected = await inspectPortableBackupText(modified);
    expect(inspected.status).toBe("invalid");
    expect(inspected.issues.map((entry) => entry.code)).toContain("CHECKSUM_MISMATCH");
  });

  it("reports corrupt JSON and unsupported future versions without guessing", async () => {
    const corrupt = await inspectPortableBackupText("{not-json");
    expect(corrupt.issues.map((entry) => entry.code)).toContain("CORRUPT_JSON");

    const created = await create();
    const parsed = JSON.parse(created.serialized) as PortableBackupV2;
    (parsed.manifest as { version: number }).version = 99;
    const unsupported = await inspectPortableBackupText(JSON.stringify(parsed));
    expect(unsupported.status).toBe("unsupported-version");
    expect(unsupported.issues.map((entry) => entry.code)).toContain("UNSUPPORTED_VERSION");
  });

  it("rejects an oversized file before JSON parsing", async () => {
    const inspected = await inspectPortableBackupText(
      "x".repeat(MAX_PORTABLE_BACKUP_BYTES + 1),
    );
    expect(inspected.issues.map((entry) => entry.code)).toContain("FILE_TOO_LARGE");
    expect(inspected.issues.map((entry) => entry.code)).not.toContain("CORRUPT_JSON");
  });

  it("reports manifest count mismatch", async () => {
    const created = await create();
    created.backup.manifest.counts.mediaItems = 99;
    const inspected = await inspectPortableBackupText(await reseal(created.backup));
    expect(inspected.issues.map((entry) => entry.code)).toContain("COUNT_MISMATCH");
  });

  it("reports duplicate media and progress log IDs", async () => {
    const created = await create();
    created.backup.data.mediaItems!.push(
      structuredClone(created.backup.data.mediaItems![0]),
    );
    created.backup.data.progressLogs!.push(
      structuredClone(created.backup.data.progressLogs![0]),
    );
    created.backup.manifest.counts.mediaItems = 2;
    created.backup.manifest.counts.progressLogs = 2;
    const inspected = await inspectPortableBackupText(await reseal(created.backup));
    const codes = inspected.issues.map((entry) => entry.code);
    expect(codes).toContain("DUPLICATE_MEDIA_ID");
    expect(codes).toContain("DUPLICATE_PROGRESS_LOG_ID");
  });

  it("reports unknown fields and forbidden domains without exposing their values", async () => {
    const created = await create();
    const parsed = created.backup as PortableBackupV2 & {
      manifest: PortableBackupV2["manifest"] & { futureField?: string };
      data: PortableBackupV2["data"] & { syncQueue?: unknown };
    };
    parsed.manifest.futureField = "future-private-value";
    parsed.data.syncQueue = [{ apiKey: "do-not-show" }];
    (parsed.data.mediaItems![0] as MediaItem & Record<string, unknown>).futureField =
      "unknown-record-value";
    const inspected = await inspectPortableBackupText(await reseal(parsed));
    const codes = inspected.issues.map((entry) => entry.code);

    expect(codes).toContain("UNKNOWN_MANIFEST_FIELD");
    expect(codes).toContain("FORBIDDEN_DOMAIN");
    expect(codes).toContain("SENSITIVE_FIELD");
    expect(codes).toContain("UNKNOWN_RECORD_FIELD");
    expect(JSON.stringify(inspected)).not.toContain("future-private-value");
    expect(JSON.stringify(inspected)).not.toContain("do-not-show");
    expect(JSON.stringify(inspected)).not.toContain("unknown-record-value");
  });

  it("reports a corrupt manual release instead of silently accepting it", async () => {
    const created = await create();
    created.backup.data.mediaItems![0].releaseCalendar = {
      version: 1,
      manualEvents: [{
        id: "not-a-uuid",
        mediaId: "media-1",
        eventKind: "manual",
        title: "",
        schedule: { precision: "date_only", date: "2026-02-30" },
        createdAt: "invalid",
        updatedAt: "invalid",
      }],
      hiddenProviderEventKeys: [],
    };
    const inspected = await inspectPortableBackupText(await reseal(created.backup));
    expect(inspected.status).toBe("invalid");
    expect(inspected.issues.map((entry) => entry.code))
      .toContain("invalid_manual_event_id");
  });

  it("does not expose included personal-note content in its summary or issues", async () => {
    const created = await create(source(), true);
    const inspected = await inspectPortableBackupText(created.serialized);

    expect(inspected.summary.personalNotesIncluded).toBe(true);
    expect(JSON.stringify(inspected)).not.toContain("very-private-note");
  });

  it("detects personal-note content that contradicts the privacy manifest", async () => {
    const created = await create(source(), true);
    created.backup.manifest.privacy.personalNotesIncluded = false;
    const inspected = await inspectPortableBackupText(
      await reseal(created.backup),
    );
    expect(inspected.issues.map((entry) => entry.code))
      .toContain("PERSONAL_NOTES_MANIFEST_MISMATCH");
  });

  it("recognizes a valid legacy backup without treating it as Portable V2", async () => {
    const legacy = createBackupPayload([media()], [progress()]);
    const inspected = await inspectPortableBackupText(JSON.stringify(legacy));

    expect(inspected.status).toBe("legacy");
    expect(inspected.summary.compatible).toBe(true);
    expect(inspected.issues.map((entry) => entry.code)).toContain("LEGACY_BACKUP");
  });

  it("does not mutate any local storage value while collecting or inspecting", async () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("user-a");
    expect(writeMediaIdentityAliasRegistry(scope, aliasRegistry(), storage).ok).toBe(true);
    expect(writeMediaRecordRedirectRegistry(scope, redirectRegistry(), storage).ok).toBe(true);
    expect(replaceRecommendationLinksForScope(scope, [{
      recommendationId: "rec-1",
      localMediaId: "media-1",
      canonicalMediaKey: "v2:tmdb:movie:42",
      linkedAt: EXPORTED_AT,
      userId: "user-a",
    }], storage)).toBe(true);
    const before = JSON.stringify([...storage.values].sort());

    const collected = collectPortableBackupSource(
      scope,
      [media()],
      [progress()],
      storage,
    );
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    const created = await create(collected.source);
    await inspectPortableBackupText(created.serialized);

    expect(JSON.stringify([...storage.values].sort())).toBe(before);
  });

  it("keeps guest source owner-neutral", () => {
    const storage = new MemoryStorage();
    const collected = collectPortableBackupSource(
      GUEST_OWNER_SCOPE,
      [media()],
      [],
      storage,
    );
    expect(collected).toMatchObject({
      ok: true,
      source: { ownerType: "guest", recommendationLinks: [] },
    });
  });
});
