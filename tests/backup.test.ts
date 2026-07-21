import { describe, expect, it } from "vitest";
import {
  createBackupPayload,
  parseBackupJson,
  resolveBackupImport,
} from "@/lib/backup";
import type { MediaItem, ProgressLog } from "@/lib/types";

function mediaItem(id: string, title = `Title ${id}`): MediaItem {
  return {
    id,
    title,
    type: "movie",
    status: "planning",
    coverImage: "/placeholders/movie.svg",
    currentProgress: 0,
    totalProgress: 1,
  };
}

function progressLog(id: string, mediaId: string): ProgressLog {
  return {
    id,
    mediaId,
    mediaTitle: `Title ${mediaId}`,
    mediaType: "movie",
    action: "added",
    amount: 0,
    unit: "movie",
    previousProgress: 0,
    newProgress: 0,
    createdAt: "2026-07-20T10:00:00.000Z",
  };
}

describe("backup import and merge", () => {
  it("re-imports a valid exported payload", () => {
    const payload = createBackupPayload([mediaItem("m1")], [progressLog("l1", "m1")]);
    const parsed = parseBackupJson(JSON.stringify(payload));

    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ id: "m1", title: "Title m1" });
    expect(parsed.logs).toHaveLength(1);
  });

  it("replace mode completely replaces existing items and logs", () => {
    const imported = mediaItem("new");
    const importedLog = progressLog("new-log", "new");
    const result = resolveBackupImport({
      mode: "replace",
      currentItems: [mediaItem("old")],
      importedItems: [imported],
      currentLogs: [progressLog("old-log", "old")],
      importedLogs: [importedLog],
    });

    expect(result.items).toEqual([imported]);
    expect(result.logs).toEqual([importedLog]);
  });

  it("merge mode combines new items and logs without mutating the inputs", () => {
    const current = [mediaItem("current")];
    const imported = [mediaItem("imported")];
    const currentSnapshot = structuredClone(current);
    const importedSnapshot = structuredClone(imported);

    const result = resolveBackupImport({
      mode: "merge",
      currentItems: current,
      importedItems: imported,
      currentLogs: [progressLog("current-log", "current")],
      importedLogs: [progressLog("imported-log", "imported")],
    });

    expect(result.items.map((item) => item.id)).toEqual(["current", "imported"]);
    expect(result.logs.map((log) => log.id)).toEqual(["current-log", "imported-log"]);
    expect(current).toEqual(currentSnapshot);
    expect(imported).toEqual(importedSnapshot);
  });

  it("assigns a new id to an imported item when its id already exists", () => {
    const result = resolveBackupImport({
      mode: "merge",
      currentItems: [mediaItem("same", "Existing")],
      importedItems: [mediaItem("same", "Imported")],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("same");
    expect(result.items[1].id).not.toBe("same");
    expect(result.items[1].title).toBe("Imported");
  });

  it("skips an imported duplicate with the same external source and id", () => {
    const current = { ...mediaItem("current"), externalSource: "tmdb" as const, externalId: "42" };
    const imported = { ...mediaItem("imported"), externalSource: "tmdb" as const, externalId: "42" };
    const result = resolveBackupImport({ mode: "merge", currentItems: [current], importedItems: [imported] });

    expect(result.items).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
  });

  it("returns a controlled error for invalid JSON", () => {
    expect(parseBackupJson("{not-json")).toEqual({
      valid: false,
      error: "Geçersiz JSON dosyası. Dosya bozuk olabilir.",
    });
  });

  it("handles missing or wrongly typed item fields without throwing", () => {
    const parsed = parseBackupJson(JSON.stringify({
      appName: "MediaTracker",
      data: {
        mediaItems: [null, { title: 42 }, { title: "Usable", type: 42, status: {} }],
        progressLogs: "not-an-array",
      },
    }));

    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].title).toBe("Usable");
    expect(parsed.logs).toEqual([]);
  });
});
