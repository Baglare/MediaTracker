import { describe, expect, it } from "vitest";

import {
  buildLocalDataKeys,
  LOCAL_DATA_FORMAT,
  LOCAL_DATA_SCHEMA_VERSION,
  loadScopedMediaList,
  loadScopedProgressLogs,
  type LocalStorageLike,
} from "@/lib/local-data-storage";
import {
  readMediaIdentityAliasRegistry,
  resolveCanonicalMediaAlias,
} from "@/lib/media-identity-aliases";
import { createUserOwnerScope } from "@/lib/local-owner-scope";
import type { MediaItem, ProgressLog } from "@/lib/types";

class MemoryStorage implements LocalStorageLike {
  values = new Map<string, string>();
  failSetKey?: string;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (key === this.failSetKey) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}

const scope = createUserOwnerScope("user-a");

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "manual-record",
    title: "Legacy Manual",
    type: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    ...overrides,
  };
}

function log(): ProgressLog {
  return {
    id: "log-1",
    mediaId: "manual-record",
    mediaTitle: "Legacy Manual",
    mediaType: "movie",
    action: "added",
    amount: 0,
    unit: "movie",
    previousProgress: 0,
    newProgress: 0,
    createdAt: "2026-07-27T00:00:00.000Z",
  };
}

function ownedV2Envelope(
  domain: "media-library" | "progress-logs",
  records: unknown[],
): string {
  return JSON.stringify({
    format: LOCAL_DATA_FORMAT,
    domain,
    schemaVersion: 2,
    writerVersion: "D1B.2A",
    ownerScope: scope.key,
    datasetOrigin: "user",
    writtenAt: "2026-07-27T00:00:00.000Z",
    recordCount: records.length,
    records,
  });
}

describe("owner-scoped local data v2 to v3 identity migration", () => {
  it("migrates external/manual records, preserves record/log IDs and writes aliases", () => {
    const storage = new MemoryStorage();
    const mediaKeys = buildLocalDataKeys("media-library", scope);
    const logKeys = buildLocalDataKeys("progress-logs", scope);
    const oldMediaRaw = ownedV2Envelope("media-library", [
      media(),
      media({
        id: "tmdb-record",
        title: "External",
        externalSource: "tmdb",
        externalId: "42",
      }),
    ]);
    storage.setItem(mediaKeys.current, oldMediaRaw);
    storage.setItem(logKeys.current, ownedV2Envelope("progress-logs", [log()]));

    const mediaRead = loadScopedMediaList(scope, storage);
    const logsRead = loadScopedProgressLogs(scope, storage);

    expect(mediaRead).toMatchObject({
      status: "valid",
      schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
      data: [
        { id: "manual-record", identity: { source: "manual", namespace: "item" } },
        { id: "tmdb-record", identity: { key: "v2:tmdb:movie:42" } },
      ],
    });
    expect(logsRead).toMatchObject({
      status: "valid",
      schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
      data: [{ id: "log-1", mediaId: "manual-record" }],
    });
    expect(JSON.parse(storage.getItem(mediaKeys.current)!).schemaVersion).toBe(3);
    expect(storage.getItem(mediaKeys.backup)).toBe(oldMediaRaw);

    const aliases = readMediaIdentityAliasRegistry(scope, storage);
    expect(aliases.status).toBe("valid");
    if (aliases.status !== "valid") return;
    expect(resolveCanonicalMediaAlias(aliases.data, "tmdb:42"))
      .toBe("v2:tmdb:movie:42");
    expect(resolveCanonicalMediaAlias(aliases.data, "tmdb-record"))
      .toBe("v2:tmdb:movie:42");
  });

  it("is idempotent and never regenerates a successful manual UUID", () => {
    const storage = new MemoryStorage();
    const keys = buildLocalDataKeys("media-library", scope);
    storage.setItem(keys.current, ownedV2Envelope("media-library", [media()]));
    const first = loadScopedMediaList(scope, storage);
    const manualId = first.data?.[0].identity?.manualId;
    const current = storage.getItem(keys.current);
    const second = loadScopedMediaList(scope, storage);
    expect(second.data?.[0].identity?.manualId).toBe(manualId);
    expect(storage.getItem(keys.current)).toBe(current);
  });

  it("rolls back the media current when alias safe-write fails", () => {
    const storage = new MemoryStorage();
    const keys = buildLocalDataKeys("media-library", scope);
    const oldRaw = ownedV2Envelope("media-library", [media()]);
    storage.setItem(keys.current, oldRaw);
    storage.failSetKey =
      `mediaTracker:personal:v1:${scope.storageKey}:mediaIdentityAliases:temp`;
    const read = loadScopedMediaList(scope, storage);
    expect(read.status).toBe("migration_failed");
    expect(storage.getItem(keys.current)).toBe(oldRaw);
    expect(storage.getItem(keys.backup)).toBe(oldRaw);
  });

  it("preserves unresolved records and does not invent identity on later reads", () => {
    const storage = new MemoryStorage();
    const keys = buildLocalDataKeys("media-library", scope);
    storage.setItem(keys.current, ownedV2Envelope("media-library", [{
      ...media({ id: "unknown-record" }),
      externalSource: "future-provider",
      externalId: "opaque",
    }]));
    const first = loadScopedMediaList(scope, storage);
    const second = loadScopedMediaList(scope, storage);
    expect(first.data?.[0]).toMatchObject({
      id: "unknown-record",
      identityStatus: "unresolved",
      identityIssueCodes: ["IDENTITY_INVALID_SOURCE"],
    });
    expect(first.data?.[0].identity).toBeUndefined();
    expect(second.data?.[0].identity).toBeUndefined();
  });

  it("keeps two exact-collision records and progress logs unchanged", () => {
    const storage = new MemoryStorage();
    const mediaKeys = buildLocalDataKeys("media-library", scope);
    const logKeys = buildLocalDataKeys("progress-logs", scope);
    storage.setItem(mediaKeys.current, ownedV2Envelope("media-library", [
      media({ id: "a", externalSource: "tmdb", externalId: "42" }),
      media({ id: "b", externalSource: "tmdb", externalId: "42" }),
    ]));
    storage.setItem(logKeys.current, ownedV2Envelope("progress-logs", [log()]));
    expect(loadScopedMediaList(scope, storage).data).toHaveLength(2);
    expect(loadScopedProgressLogs(scope, storage).data).toEqual([log()]);
    const aliases = readMediaIdentityAliasRegistry(scope, storage);
    expect(aliases.status === "valid" && aliases.data.issues)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "IDENTITY_EXACT_COLLISION" }),
      ]));
  });
});
