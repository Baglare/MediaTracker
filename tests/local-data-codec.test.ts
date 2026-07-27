import { describe, expect, it } from "vitest";
import {
  decodeMediaItem,
  decodeMediaItems,
  decodeProgressLog,
} from "@/lib/local-data-codec";
import type { MediaItem, ProgressLog } from "@/lib/types";

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "m1",
    identity: {
      version: 2,
      key: "v2:manual:item:550e8400-e29b-41d4-a716-446655440000",
      source: "manual",
      namespace: "item",
      manualId: "550e8400-e29b-41d4-a716-446655440000",
    },
    title: "Dune",
    type: "movie",
    theme: "screen",
    mediaType: "movie",
    subType: "movie",
    status: "planning",
    coverImage: "/covers/dune.jpg",
    currentProgress: 0,
    totalProgress: 0,
    favorite: false,
    ...overrides,
  };
}

function log(overrides: Partial<ProgressLog> = {}): ProgressLog {
  return {
    id: "l1",
    mediaId: "m1",
    mediaTitle: "Dune",
    mediaType: "movie",
    action: "added",
    amount: 0,
    unit: "movie",
    previousProgress: 0,
    newProgress: 0,
    createdAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("MediaItem runtime codec", () => {
  it("accepts a valid modern record and preserves totalProgress zero", () => {
    const result = decodeMediaItem(media());
    expect(result.status).toBe("valid");
    if (result.status === "invalid") return;
    expect(result.value.totalProgress).toBe(0);
  });

  it("normalizes supported legacy numeric fields and rating alias explicitly", () => {
    const result = decodeMediaItem({
      ...media(),
      currentProgress: "2",
      totalProgress: "12",
      rating: "8",
      userRating: undefined,
    });
    expect(result.status).toBe("repairable");
    if (result.status !== "repairable") return;
    expect(result.value).toMatchObject({ currentProgress: 2, totalProgress: 12, userRating: 8 });
    expect(result.repairs.map((repair) => repair.code)).toContain("legacy_rating_alias");
  });

  it("defaults a missing optional favorite and infers missing classification", () => {
    const value = media();
    delete value.favorite;
    delete value.theme;
    delete value.mediaType;
    delete value.subType;
    const result = decodeMediaItem(value);
    expect(result.status).toBe("repairable");
    if (result.status !== "repairable") return;
    expect(result.value).toMatchObject({
      favorite: false,
      theme: "screen",
      mediaType: "movie",
      subType: "movie",
    });
  });

  it.each([
    ["title", { title: "   " }],
    ["status", { status: "unknown" }],
    ["negative progress", { currentProgress: -1 }],
    ["NaN", { currentProgress: Number.NaN }],
    ["Infinity", { totalProgress: Number.POSITIVE_INFINITY }],
    ["rating range", { userRating: 11 }],
  ])("rejects invalid %s without fallback", (_label, overrides) => {
    expect(decodeMediaItem({ ...media(), ...overrides }).status).toBe("invalid");
  });

  it("preserves personal notes, data URLs and plain metadata in this phase", () => {
    const result = decodeMediaItem({
      ...media(),
      coverImage: "data:image/png;base64,private",
      personalNotes: "kişisel not",
      metadata: { providerFlag: true },
    });
    expect(result.status).not.toBe("invalid");
    if (result.status === "invalid") return;
    expect(result.value.personalNotes).toBe("kişisel not");
    expect(result.value.coverImage).toContain("data:image");
    expect((result.value as MediaItem & { metadata?: unknown }).metadata).toEqual({ providerFlag: true });
  });

  it("reports invalid records instead of silently dropping them", () => {
    const result = decodeMediaItems([media(), { ...media({ id: "bad" }), title: "" }]);
    expect(result.ok).toBe(false);
    expect(result.records).toHaveLength(1);
    expect(result.issues).toMatchObject([{ recordIndex: 1, recordId: "bad" }]);
  });
});

describe("ProgressLog runtime codec", () => {
  it("accepts a valid log and does not require its media to exist", () => {
    const result = decodeProgressLog(log({ mediaId: "deleted-media" }));
    expect(result.status).toBe("valid");
  });

  it.each([
    ["action", { action: "mystery" }],
    ["media id", { mediaId: "" }],
    ["progress", { newProgress: -1 }],
    ["date", { createdAt: "not-a-date" }],
  ])("rejects invalid %s", (_label, overrides) => {
    expect(decodeProgressLog({ ...log(), ...overrides }).status).toBe("invalid");
  });

  it("repairs missing snapshot title and derives media type from a known unit", () => {
    const value = { ...log(), mediaTitle: undefined, mediaType: undefined, unit: "chapter" };
    const result = decodeProgressLog(value);
    expect(result.status).toBe("repairable");
    if (result.status !== "repairable") return;
    expect(result.value).toMatchObject({ mediaTitle: "Bilinmeyen medya", mediaType: "manga" });
  });
});
