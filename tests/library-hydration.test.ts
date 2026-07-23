import { describe, expect, it } from "vitest";
import { guardXpFullSync, materializeDemoDatasetMutation, resolveLibraryHydration } from "@/lib/library-hydration";
import type { StorageReadResult, StorageReadStatus } from "@/lib/local-data-storage";
import type { MediaItem, ProgressLog } from "@/lib/types";

const demo: MediaItem = {
  id: "demo",
  title: "Demo",
  type: "movie",
  status: "planning",
  coverImage: "",
  currentProgress: 0,
  totalProgress: 0,
};

function read<T>(status: StorageReadStatus, data?: T): StorageReadResult<T> {
  return { status, data, sourceKey: "test", issues: [] };
}

describe("library hydration state", () => {
  it("uses demo data only for an explicit missing first install", () => {
    const result = resolveLibraryHydration({
      media: read<MediaItem[]>("missing"),
      progressLogs: read<ProgressLog[]>("missing"),
      demoItems: [demo],
    });
    expect(result).toMatchObject({
      integrity: "valid",
      mediaItems: [{ id: "demo" }],
      usedDemoData: true,
      datasetOrigin: "demo",
      requiresInitialWrite: true,
    });
  });

  it("opens an authenticated missing namespace as a real empty library", () => {
    const result = resolveLibraryHydration({
      media: read<MediaItem[]>("missing"),
      progressLogs: read<ProgressLog[]>("missing"),
      demoItems: [demo],
      allowDemoData: false,
    });
    expect(result).toMatchObject({
      integrity: "valid",
      mediaItems: [],
      usedDemoData: false,
      datasetOrigin: "user",
      requiresInitialWrite: true,
    });
  });

  it("keeps only real or changed records when a demo dataset is first mutated", () => {
    const changed = { ...demo, favorite: true };
    const real = { ...demo, id: "real", title: "Real" };
    expect(materializeDemoDatasetMutation([demo], [changed, real])).toEqual([changed, real]);
    expect(materializeDemoDatasetMutation([demo], [demo, real])).toEqual([real]);
  });

  it("keeps an intentionally empty library empty", () => {
    const result = resolveLibraryHydration({
      media: read("empty", []),
      progressLogs: read("empty", []),
      demoItems: [demo],
    });
    expect(result).toMatchObject({ integrity: "valid", mediaItems: [], usedDemoData: false });
  });

  it("hydrates valid library and logs without initial rewrite", () => {
    const result = resolveLibraryHydration({
      media: read("valid", [demo]),
      progressLogs: read("empty", []),
      demoItems: [],
    });
    expect(result).toMatchObject({ integrity: "valid", requiresInitialWrite: false });
  });

  it.each(["corrupt", "unsupported_version", "migration_failed", "storage_unavailable"] as const)(
    "never turns %s into demo or empty usable data",
    (status) => {
      const result = resolveLibraryHydration({
        media: read(status),
        progressLogs: read("empty", []),
        demoItems: [demo],
      });
      expect(result).toMatchObject({
        integrity: status,
        mediaItems: [],
        usedDemoData: false,
        requiresInitialWrite: false,
      });
    },
  );
});

describe("XP full-sync guard", () => {
  it("allows valid data and a genuinely valid empty library", () => {
    expect(guardXpFullSync(read("valid", [demo]))).toMatchObject({ allowed: true, items: [demo] });
    expect(guardXpFullSync(read("empty", []))).toEqual({ allowed: true, items: [] });
  });

  it("blocks corrupt, future, migration-failed and hydration-pending reads with reasons", () => {
    expect(guardXpFullSync(read("corrupt"))).toEqual({
      allowed: false,
      reason: "library_data_corrupt",
    });
    expect(guardXpFullSync(read("unsupported_version"))).toEqual({
      allowed: false,
      reason: "library_migration_required",
    });
    expect(guardXpFullSync(read("migration_failed"))).toEqual({
      allowed: false,
      reason: "library_migration_required",
    });
    expect(guardXpFullSync(read("missing"))).toEqual({
      allowed: false,
      reason: "library_data_unavailable",
    });
  });
});
