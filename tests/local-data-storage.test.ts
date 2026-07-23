import { describe, expect, it } from "vitest";
import {
  LOCAL_DATA_FORMAT,
  MEDIA_DATA_KEYS,
  PROGRESS_LOG_DATA_KEYS,
  loadMediaList,
  loadProgressLogs,
  saveLibrarySnapshot,
  saveMediaList,
  type LocalStorageLike,
} from "@/lib/local-data-storage";
import type { MediaItem, ProgressLog } from "@/lib/types";

class MemoryStorage implements LocalStorageLike {
  values = new Map<string, string>();
  setCalls: string[] = [];
  failSetKey?: string;
  corruptSetKey?: string;
  corruptOnce = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setCalls.push(key);
    if (key === this.failSetKey) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    if (key === this.corruptSetKey && (!this.corruptOnce || this.setCalls.filter((item) => item === key).length === 1)) {
      this.values.set(key, "{corrupted");
      return;
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function media(id = "m1"): MediaItem {
  return {
    id,
    title: `Title ${id}`,
    type: "movie",
    theme: "screen",
    mediaType: "movie",
    subType: "movie",
    status: "planning",
    coverImage: "/placeholders/movie.svg",
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

function envelope(domain: "media-library" | "progress-logs", records: unknown[], version = 1) {
  return JSON.stringify({
    format: LOCAL_DATA_FORMAT,
    domain,
    schemaVersion: version,
    writerVersion: "test",
    writtenAt: "2026-07-23T10:00:00.000Z",
    recordCount: records.length,
    records,
  });
}

describe("versioned local data reads", () => {
  it("distinguishes missing media and legacy keys", () => {
    expect(loadMediaList(new MemoryStorage()).status).toBe("missing");
  });

  it("distinguishes a valid empty envelope from missing", () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_DATA_KEYS.current, envelope("media-library", []));
    expect(loadMediaList(storage)).toMatchObject({ status: "empty", data: [] });
  });

  it("reads a valid non-empty envelope", () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_DATA_KEYS.current, envelope("media-library", [media()]));
    expect(loadMediaList(storage)).toMatchObject({ status: "valid", data: [{ id: "m1" }] });
  });

  it("quarantines corrupt JSON without replacing current", () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_DATA_KEYS.current, "{broken");
    const result = loadMediaList(storage);
    expect(result.status).toBe("corrupt");
    expect(result.rawBackupKey).toContain("mediaTracker:quarantine:media-library:");
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBe("{broken");
    expect(storage.getItem(result.rawBackupKey!)).toContain("{broken");
  });

  it("rejects a domain mismatch and an unsupported future version", () => {
    const wrongDomain = new MemoryStorage();
    wrongDomain.setItem(MEDIA_DATA_KEYS.current, envelope("progress-logs", []));
    expect(loadMediaList(wrongDomain).status).toBe("corrupt");

    const future = new MemoryStorage();
    future.setItem(MEDIA_DATA_KEYS.current, envelope("media-library", [], 2));
    expect(loadMediaList(future).status).toBe("unsupported_version");
  });
});

describe("legacy dual-read migration", () => {
  it("migrates a legacy array, backs up raw input and keeps the legacy key", () => {
    const storage = new MemoryStorage();
    const legacyRaw = JSON.stringify([media()]);
    storage.setItem(MEDIA_DATA_KEYS.legacy, legacyRaw);
    const result = loadMediaList(storage);
    expect(result.status).toBe("valid");
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toContain(LOCAL_DATA_FORMAT);
    expect(storage.getItem(MEDIA_DATA_KEYS.legacyRawBackup)).toBe(legacyRaw);
    expect(storage.getItem(MEDIA_DATA_KEYS.legacy)).toBe(legacyRaw);
  });

  it("does not repeat migration after a canonical envelope exists", () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_DATA_KEYS.legacy, JSON.stringify([media("legacy")]));
    expect(loadMediaList(storage).status).toBe("valid");
    storage.setItem(MEDIA_DATA_KEYS.legacy, JSON.stringify([media("changed")]));
    expect(loadMediaList(storage).data?.[0].id).toBe("legacy");
  });

  it("quarantines corrupt legacy data without creating an envelope", () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_DATA_KEYS.legacy, "{broken");
    const result = loadMediaList(storage);
    expect(result.status).toBe("corrupt");
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBeNull();
    expect(storage.getItem(MEDIA_DATA_KEYS.legacy)).toBe("{broken");
  });

  it("keeps legacy data when raw backup cannot be written", () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_DATA_KEYS.legacy, JSON.stringify([media()]));
    storage.failSetKey = MEDIA_DATA_KEYS.legacyRawBackup;
    const result = loadMediaList(storage);
    expect(result.status).toBe("migration_failed");
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBeNull();
    expect(storage.getItem(MEDIA_DATA_KEYS.legacy)).not.toBeNull();
  });

  it("keeps legacy and raw backup when envelope migration write fails", () => {
    const storage = new MemoryStorage();
    const legacyRaw = JSON.stringify([media()]);
    storage.setItem(MEDIA_DATA_KEYS.legacy, legacyRaw);
    storage.failSetKey = MEDIA_DATA_KEYS.temp;
    const result = loadMediaList(storage);
    expect(result.status).toBe("migration_failed");
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBeNull();
    expect(storage.getItem(MEDIA_DATA_KEYS.legacy)).toBe(legacyRaw);
    expect(storage.getItem(MEDIA_DATA_KEYS.legacyRawBackup)).toBe(legacyRaw);
  });
});

describe("atomic-like safe writes", () => {
  it("writes temp, verifies current, creates backup and cleans temp", () => {
    const storage = new MemoryStorage();
    expect(saveMediaList([media("old")], storage).ok).toBe(true);
    const result = saveMediaList([media("new")], storage);
    expect(result).toMatchObject({ ok: true, backupCreated: true });
    expect(storage.getItem(MEDIA_DATA_KEYS.temp)).toBeNull();
    expect(loadMediaList(storage).data?.[0].id).toBe("new");
    expect(storage.getItem(MEDIA_DATA_KEYS.backup)).toContain("old");
  });

  it("reports quota failure and preserves an existing current", () => {
    const storage = new MemoryStorage();
    expect(saveMediaList([media("old")], storage).ok).toBe(true);
    const current = storage.getItem(MEDIA_DATA_KEYS.current);
    storage.failSetKey = MEDIA_DATA_KEYS.temp;
    const result = saveMediaList([media("new")], storage);
    expect(result).toMatchObject({ ok: false, code: "quota_exceeded" });
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBe(current);
  });

  it("reports serialization failure without touching current", () => {
    const storage = new MemoryStorage();
    expect(saveMediaList([media("old")], storage).ok).toBe(true);
    const current = storage.getItem(MEDIA_DATA_KEYS.current);
    const circular = media("circular") as MediaItem & { metadata?: unknown };
    circular.metadata = circular;
    const result = saveMediaList([circular], storage);
    expect(result).toMatchObject({ ok: false, code: "serialization_failed" });
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBe(current);
  });

  it("reports temp verification failure and preserves current", () => {
    const storage = new MemoryStorage();
    expect(saveMediaList([media("old")], storage).ok).toBe(true);
    const current = storage.getItem(MEDIA_DATA_KEYS.current);
    storage.corruptSetKey = MEDIA_DATA_KEYS.temp;
    const result = saveMediaList([media("new")], storage);
    expect(result).toMatchObject({ ok: false, code: "verification_failed" });
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBe(current);
  });

  it("restores the previous current when current read-back verification fails", () => {
    const storage = new MemoryStorage();
    expect(saveMediaList([media("old")], storage).ok).toBe(true);
    const current = storage.getItem(MEDIA_DATA_KEYS.current);
    storage.setCalls = [];
    storage.corruptSetKey = MEDIA_DATA_KEYS.current;
    storage.corruptOnce = true;
    const result = saveMediaList([media("new")], storage);
    expect(result).toMatchObject({ ok: false, code: "verification_failed" });
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBe(current);
    expect(storage.getItem(MEDIA_DATA_KEYS.backup)).toBe(current);
  });

  it("rolls media current back if the progress-log domain write fails", () => {
    const storage = new MemoryStorage();
    expect(saveLibrarySnapshot([media("old")], [log("old-log")], storage).ok).toBe(true);
    const previousMedia = storage.getItem(MEDIA_DATA_KEYS.current);
    storage.failSetKey = PROGRESS_LOG_DATA_KEYS.temp;
    const result = saveLibrarySnapshot([media("new")], [log("new-log")], storage);
    expect(result).toMatchObject({ ok: false, code: "quota_exceeded" });
    expect(storage.getItem(MEDIA_DATA_KEYS.current)).toBe(previousMedia);
    expect(loadProgressLogs(storage).data?.[0].id).toBe("old-log");
    expect(storage.getItem(MEDIA_DATA_KEYS.backup)).not.toBeNull();
  });
});
