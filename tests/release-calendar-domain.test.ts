import { describe, expect, it } from "vitest";

import {
  decodeReleaseEvent,
  decodeReleaseEvents,
  isReleaseEligible,
  releaseEligibilityPolicy,
  resolveTvSeasonIdentity,
  selectReleaseAgenda,
  selectReleaseEligibleMedia,
  selectReleaseEventsForMedia,
  selectReleaseEventsForMonth,
  sortReleaseEvents,
  type ReleaseDatePrecision,
  type ReleaseEvent,
  type TvSeasonIdentity,
} from "@/features/calendar/domain/release-calendar";
import { selectCalendarReadModel } from "@/features/calendar/domain/selectors";
import { createCanonicalMediaIdentity } from "@/lib/media-identity";
import type { MediaItem, MediaStatus, ProgressLog } from "@/lib/types";

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "media-1",
    title: "Structured Show",
    type: "tv",
    theme: "screen",
    mediaType: "tv",
    subType: "tv_series",
    status: "watching",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 10,
    favorite: false,
    ...overrides,
  };
}

function event(
  id: string,
  date: ReleaseDatePrecision = { precision: "date_only", date: "2026-01-01" },
  overrides: Partial<ReleaseEvent> = {},
): ReleaseEvent {
  return {
    schemaVersion: 1,
    id,
    mediaRecordId: "media-1",
    type: "episode",
    title: `Event ${id}`,
    date,
    origin: {
      kind: "provider",
      provider: "tvmaze",
      providerEventId: `provider-${id}`,
      persistence: "reproducible_cache",
    },
    ...overrides,
  };
}

describe("release eligibility policy", () => {
  it.each([
    ["watching", true],
    ["reading", true],
    ["planning", true],
    ["paused", true],
    ["completed", false],
    ["dropped", false],
  ] satisfies Array<[MediaStatus, boolean]>)(
    "evaluates %s as eligible=%s",
    (status, expected) => {
      expect(isReleaseEligible({ status })).toBe(expected);
      expect(releaseEligibilityPolicy.evaluate({ status }).eligible).toBe(expected);
    },
  );

  it("keeps completed and dropped records out while tracking planning and paused", () => {
    const selected = selectReleaseEligibleMedia([
      media({ id: "completed", status: "completed" }),
      media({ id: "dropped", status: "dropped" }),
      media({ id: "planning", status: "planning" }),
      media({ id: "paused", status: "paused" }),
    ]);
    expect(selected.map((item) => item.id)).toEqual(["planning", "paused"]);
  });
});

describe("structured TV season identity", () => {
  it("resolves an explicit season number without reading the title", () => {
    const resolved = resolveTvSeasonIdentity(media({
      id: "manual-season",
      title: "Başlıktan çıkarılmamalı",
      seasonNumber: 2,
    }));
    expect(resolved).toEqual({
      status: "resolved",
      value: expect.objectContaining({
        key: "tv-season:record:manual-season:2",
        seasonNumber: 2,
        basis: "explicit_season_number",
      }),
    });
  });

  it("resolves a structured TVMaze season external ID", () => {
    const resolved = resolveTvSeasonIdentity(media({
      externalSource: "tvmaze",
      externalId: "169-season-3",
      identity: createCanonicalMediaIdentity({
        source: "tvmaze",
        namespace: "season",
        stableId: "169-season-3",
      }) ?? undefined,
      seasonNumber: undefined,
    }));
    expect(resolved).toEqual({
      status: "resolved",
      value: expect.objectContaining({
        key: "tv-season:tvmaze:169:3",
        seasonNumber: 3,
        providerShowId: "169",
      }),
    });
  });

  it("uses a canonical provider identity with explicit season metadata", () => {
    const identity = createCanonicalMediaIdentity({
      source: "tmdb",
      namespace: "tv",
      stableId: "42",
    });
    const resolved = resolveTvSeasonIdentity(media({
      identity: identity ?? undefined,
      externalSource: "tmdb",
      externalId: "42",
      seasonNumber: 4,
    }));
    expect(resolved).toEqual({
      status: "resolved",
      value: expect.objectContaining({
        key: "tv-season:canonical:v2%3Atmdb%3Atv%3A42:4",
        seasonNumber: 4,
        basis: "canonical_provider_identity",
      }),
    });
  });

  it("does not infer a season from title or originalTitle", () => {
    const resolved = resolveTvSeasonIdentity(media({
      title: "Example - Sezon 7",
      originalTitle: "Example Season 7",
      seasonNumber: undefined,
      externalSource: undefined,
      externalId: undefined,
      identity: undefined,
    }));
    expect(resolved).toEqual({
      status: "unresolved",
      reason: "season_number_missing",
    });
  });

  it("rejects conflicting explicit and structured TVMaze season numbers", () => {
    expect(resolveTvSeasonIdentity(media({
      externalSource: "tvmaze",
      externalId: "169-season-3",
      seasonNumber: 2,
    }))).toEqual({
      status: "unresolved",
      reason: "season_number_conflict",
    });
  });

  it("isolates TV events to the record's resolved season", () => {
    const item = media({
      externalSource: "tvmaze",
      externalId: "169-season-2",
      seasonNumber: 2,
    });
    const resolved = resolveTvSeasonIdentity(item);
    expect(resolved.status).toBe("resolved");
    const ownSeason = (resolved as { status: "resolved"; value: TvSeasonIdentity }).value;
    const otherSeason: TvSeasonIdentity = {
      ...ownSeason,
      key: "tv-season:tvmaze:169:3",
      seasonNumber: 3,
    };
    expect(selectReleaseEventsForMedia(item, [
      event("own", undefined, { seasonIdentity: ownSeason }),
      event("other", undefined, { seasonIdentity: otherSeason }),
      event("missing"),
    ]).map((entry) => entry.id)).toEqual(["own"]);
  });

  it("produces zero events for completed and dropped seasons", () => {
    const seasonIdentity: TvSeasonIdentity = {
      key: "tv-season:record:media-1:1",
      seasonNumber: 1,
      basis: "explicit_season_number",
    };
    const release = event("future", undefined, { seasonIdentity });
    expect(selectReleaseEventsForMedia(
      media({ status: "completed", seasonNumber: 1 }),
      [release],
    )).toEqual([]);
    expect(selectReleaseEventsForMedia(
      media({ status: "dropped", seasonNumber: 1 }),
      [release],
    )).toEqual([]);
  });
});

describe("release event runtime codec", () => {
  it.each([
    [{ precision: "exact_datetime", dateTime: "2026-01-02T21:30:00+03:00" }],
    [{ precision: "date_only", date: "2026-01-02" }],
    [{ precision: "month_only", month: "2026-01" }],
    [{ precision: "year_only", year: 2026 }],
    [{ precision: "tba" }],
  ] satisfies ReleaseDatePrecision[])("accepts the %s precision", (date) => {
    expect(decodeReleaseEvent(event("valid", date)).status).toBe("valid");
  });

  it("preserves manual events as persistent user data", () => {
    const result = decodeReleaseEvent(event("manual", { precision: "tba" }, {
      type: "manual",
      origin: {
        kind: "manual",
        persistence: "persistent_user_data",
      },
    }));
    expect(result).toEqual({
      status: "valid",
      value: expect.objectContaining({
        origin: {
          kind: "manual",
          persistence: "persistent_user_data",
        },
      }),
    });
  });

  it("rejects malformed payloads without silently dropping their issues", () => {
    const malformed = {
      ...event("broken"),
      type: "unknown",
      date: { precision: "date_only", date: "2026-02-30" },
      rawProviderPayload: { secret: "must-not-pass" },
    };
    const decoded = decodeReleaseEvent(malformed);
    expect(decoded.status).toBe("invalid");
    if (decoded.status === "invalid") {
      expect(decoded.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
        "unknown_field",
        "invalid_event_type",
        "invalid_date_only",
      ]));
    }
    const collection = decodeReleaseEvents([event("ok"), malformed]);
    expect(collection.ok).toBe(false);
    expect(collection.records.map((entry) => entry.id)).toEqual(["ok"]);
    expect(collection.issues.every((issue) => issue.recordIndex === 1)).toBe(true);
  });
});

describe("release calendar selectors", () => {
  it("keeps date-only calendar days stable without Date timezone conversion", () => {
    const release = event("date-only", { precision: "date_only", date: "2026-03-29" });
    expect(selectReleaseAgenda([release], "2026-03-29").today).toEqual([release]);
    expect(selectReleaseEventsForMonth([release], "2026-03")).toEqual([release]);
  });

  it("uses inclusive 7, 30 and 90 day boundaries", () => {
    const events = [
      event("today", { precision: "date_only", date: "2026-01-01" }),
      event("day-7", { precision: "date_only", date: "2026-01-08" }),
      event("day-30", { precision: "date_only", date: "2026-01-31" }),
      event("day-90", { precision: "date_only", date: "2026-04-01" }),
      event("day-91", { precision: "date_only", date: "2026-04-02" }),
      event("month", { precision: "month_only", month: "2026-05" }),
      event("tba", { precision: "tba" }),
    ];
    const agenda = selectReleaseAgenda(events, "2026-01-01");
    expect(agenda.today.map((entry) => entry.id)).toEqual(["today"]);
    expect(agenda.next7Days.map((entry) => entry.id)).toEqual(["day-7"]);
    expect(agenda.next30Days.map((entry) => entry.id)).toEqual(["day-30"]);
    expect(agenda.later.map((entry) => entry.id)).toEqual(["day-90"]);
    expect(agenda.tba.map((entry) => entry.id)).toEqual(["month", "tba"]);
    expect(Object.values(agenda).flat().some((entry) => entry.id === "day-91")).toBe(false);
  });

  it("sorts deterministically regardless of input order", () => {
    const events = [
      event("b", { precision: "date_only", date: "2026-01-02" }),
      event("a", { precision: "date_only", date: "2026-01-02" }),
      event("later", { precision: "date_only", date: "2026-01-03" }),
      event("exact", { precision: "exact_datetime", dateTime: "2026-01-02T10:00:00Z" }),
    ];
    const expected = sortReleaseEvents(events).map((entry) => entry.id);
    expect(sortReleaseEvents([...events].reverse()).map((entry) => entry.id)).toEqual(expected);
    expect(expected).toEqual(["exact", "a", "b", "later"]);
  });

  it("preserves the existing calendar read-model selectors", () => {
    const logs: ProgressLog[] = [
      {
        id: "older",
        mediaId: "media-1",
        mediaTitle: "Old",
        mediaType: "tv",
        action: "increment",
        amount: 1,
        unit: "episode",
        previousProgress: 0,
        newProgress: 1,
        createdAt: "2026-01-01T10:00:00Z",
      },
      {
        id: "newer",
        mediaId: "media-2",
        mediaTitle: "New",
        mediaType: "book",
        action: "increment",
        amount: 1,
        unit: "page",
        previousProgress: 0,
        newProgress: 1,
        createdAt: "2026-01-02T10:00:00Z",
      },
    ];
    const result = selectCalendarReadModel([
      media({ id: "planning", status: "planning" }),
      media({ id: "watching", status: "watching" }),
      media({ id: "paused", status: "paused" }),
    ], logs);
    expect(result.recentLogs.map((log) => log.id)).toEqual(["newer", "older"]);
    expect(result.plannedItems.map((item) => item.id)).toEqual(["planning"]);
    expect(result.activeItems.map((item) => item.id)).toEqual(["watching"]);
  });
});
