import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { MediaItem } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  loadMediaList: vi.fn(),
  loadProgressLogs: vi.fn(),
  saveLibrarySnapshot: vi.fn(),
  enqueueMediaUpsert: vi.fn(),
  enqueueProgressLog: vi.fn(),
  queueXpMediaState: vi.fn(),
  flushXpOutbox: vi.fn(),
  queueMediaSocialEvents: vi.fn(),
  flushSocialOutbox: vi.fn(),
  sendXpOutboxBatch: vi.fn(),
  sendSocialOutboxItem: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  loadMediaList: mocks.loadMediaList,
  loadProgressLogs: mocks.loadProgressLogs,
  saveLibrarySnapshot: mocks.saveLibrarySnapshot,
}));
vi.mock("@/lib/sync-manager", () => ({
  enqueueMediaUpsert: mocks.enqueueMediaUpsert,
  enqueueProgressLog: mocks.enqueueProgressLog,
}));
vi.mock("@/lib/xp/outbox", () => ({
  queueXpMediaState: mocks.queueXpMediaState,
  flushXpOutbox: mocks.flushXpOutbox,
  sendXpOutboxBatch: mocks.sendXpOutboxBatch,
}));
vi.mock("@/lib/social/local-social", () => ({
  queueMediaSocialEvents: mocks.queueMediaSocialEvents,
  flushSocialOutbox: mocks.flushSocialOutbox,
  sendSocialOutboxItem: mocks.sendSocialOutboxItem,
}));

const item: MediaItem = {
  id: "m1",
  title: "Dune",
  type: "movie",
  status: "planning",
  coverImage: "",
  currentProgress: 0,
  totalProgress: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class CustomEvent {
    constructor(public type: string) {}
  });
  mocks.loadMediaList.mockReturnValue({ status: "empty", data: [], sourceKey: "media", issues: [] });
  mocks.loadProgressLogs.mockReturnValue({ status: "empty", data: [], sourceKey: "logs", issues: [] });
  mocks.saveLibrarySnapshot.mockReturnValue({
    ok: true,
    writtenAt: "2026-07-23T10:00:00.000Z",
    backupCreated: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persist-before-side-effect ordering", () => {
  it("does not enqueue cloud, XP or social work after a failed local write", async () => {
    mocks.saveLibrarySnapshot.mockReturnValue({
      ok: false,
      code: "quota_exceeded",
      message: "quota",
      recoverable: true,
    });
    const { addRecommendationToLocalLibrary } = await import("@/lib/recommendation-library-adapter");
    const result = addRecommendationToLocalLibrary(item, "user-1");

    expect(result).toMatchObject({ ok: false, message: "quota" });
    expect(mocks.enqueueMediaUpsert).not.toHaveBeenCalled();
    expect(mocks.enqueueProgressLog).not.toHaveBeenCalled();
    expect(mocks.queueXpMediaState).not.toHaveBeenCalled();
    expect(mocks.queueMediaSocialEvents).not.toHaveBeenCalled();
  });

  it("runs each side effect once only after a successful local snapshot", async () => {
    const { addRecommendationToLocalLibrary } = await import("@/lib/recommendation-library-adapter");
    const result = addRecommendationToLocalLibrary(item, "user-1");

    expect(result).toMatchObject({ ok: true, alreadyPresent: false });
    expect(mocks.saveLibrarySnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueMediaUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueProgressLog).toHaveBeenCalledTimes(1);
    expect(mocks.queueXpMediaState).toHaveBeenCalledTimes(1);
    expect(mocks.queueMediaSocialEvents).toHaveBeenCalledTimes(1);
  });

  it("treats a repeated recommendation add as already present without duplicate effects", async () => {
    mocks.loadMediaList.mockReturnValue({ status: "valid", data: [item], sourceKey: "media", issues: [] });
    const { addRecommendationToLocalLibrary } = await import("@/lib/recommendation-library-adapter");
    const result = addRecommendationToLocalLibrary(item, "user-1");

    expect(result).toMatchObject({ ok: true, alreadyPresent: true });
    expect(mocks.saveLibrarySnapshot).not.toHaveBeenCalled();
    expect(mocks.enqueueMediaUpsert).not.toHaveBeenCalled();
    expect(mocks.queueXpMediaState).not.toHaveBeenCalled();
  });
});

describe("recommendation inbox persistence boundary", () => {
  it("uses the canonical adapter and no longer writes the legacy media key directly", () => {
    const source = readFileSync("components/social/recommendation-inbox.tsx", "utf8");
    expect(source).toContain("addRecommendationToLocalLibrary");
    expect(source).not.toContain("saveMediaList");
    expect(source).not.toContain("localStorage.setItem");
    expect(source).not.toContain("media-tracker-list");
  });

  it("keeps cloud and import success feedback behind the local write result", () => {
    const cloud = readFileSync("components/cloud-data-status-card.tsx", "utf8");
    const dataManagement = readFileSync("components/data-management-panel.tsx", "utf8");
    expect(cloud).toContain("if (!onReplaceData(");
    expect(dataManagement).toContain("const persisted = onImport(");
    expect(dataManagement).toContain('persisted ? "success" : "error"');
  });
});
