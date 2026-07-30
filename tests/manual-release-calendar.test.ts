import { describe, expect, it } from "vitest";

import {
  buildHiddenProviderEventKey,
  createManualReleaseEvent,
  decodeMediaReleaseCalendarData,
  deleteManualReleaseEvent,
  hideProviderReleaseEvent,
  manualReleaseEventsForMedia,
  restoreProviderReleaseEvent,
  updateManualReleaseEvent,
} from "@/features/calendar/domain/manual-release-calendar";
import type { ReleaseEvent } from "@/features/calendar/domain/release-calendar";
import {
  buildReleaseAgendaView,
  buildReleaseCalendarViewItems,
} from "@/features/calendar/services/release-calendar-service";
import {
  createReleaseCacheEntry,
  emptyReleaseCalendarCache,
  upsertReleaseCacheEntry,
} from "@/features/calendar/data/release-cache";
import { decodeMediaItem } from "@/lib/local-data-codec";
import {
  loadScopedMediaList,
  saveScopedLibrarySnapshot,
} from "@/lib/local-data-storage";
import { createUserOwnerScope } from "@/lib/local-owner-scope";
import { fromMediaRow, toMediaRow } from "@/lib/supabase/mapping";
import type {
  MediaItem,
  MediaReleaseSchedule,
} from "@/lib/types";

const NOW = "2026-07-30T12:00:00.000Z";
const EVENT_ID = "550e8400-e29b-41d4-a716-446655440000";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "media-1",
    title: "Calendar Media",
    type: "movie",
    theme: "screen",
    mediaType: "movie",
    subType: "movie",
    status: "planning",
    coverImage: "/cover.jpg",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    ...overrides,
  };
}

function providerEvent(id = "provider-1"): ReleaseEvent {
  return {
    schemaVersion: 1,
    id,
    mediaRecordId: "media-1",
    type: "movie_release",
    title: "Provider release",
    date: { precision: "date_only", date: "2026-08-01" },
    origin: {
      kind: "provider",
      provider: "tmdb",
      providerEventId: id,
      persistence: "reproducible_cache",
    },
  };
}

describe("manual release calendar domain", () => {
  it.each([
    { precision: "exact_datetime", dateTime: "2026-08-01T20:00:00+03:00" },
    { precision: "date_only", date: "2026-08-01" },
    { precision: "month_only", month: "2026-08" },
    { precision: "year_only", year: 2027 },
    { precision: "tba" },
  ] satisfies MediaReleaseSchedule[])("creates every schedule precision: $precision", (schedule) => {
    const result = createManualReleaseEvent(media(), {
      eventKind: "manual",
      title: "Takvim notu",
      schedule,
    }, { id: EVENT_ID, now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event).toMatchObject({
        id: EVENT_ID,
        mediaId: "media-1",
        schedule,
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(manualReleaseEventsForMedia(result.item)[0]).toMatchObject({
        id: EVENT_ID,
        mediaRecordId: "media-1",
        origin: { kind: "manual", persistence: "persistent_user_data" },
      });
    }
  });

  it("edits without changing id/media/createdAt and deletes explicitly", () => {
    const created = createManualReleaseEvent(media(), {
      eventKind: "publication",
      title: "İlk",
      schedule: { precision: "date_only", date: "2026-08-01" },
    }, { id: EVENT_ID, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = updateManualReleaseEvent(created.item, EVENT_ID, {
      eventKind: "publication",
      title: "Güncel",
      schedule: { precision: "month_only", month: "2026-09" },
      note: "Kişisel not",
    }, "2026-07-31T12:00:00.000Z");
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.event).toMatchObject({
      id: EVENT_ID,
      mediaId: "media-1",
      createdAt: NOW,
      updatedAt: "2026-07-31T12:00:00.000Z",
      title: "Güncel",
    });
    expect(deleteManualReleaseEvent(updated.item, EVENT_ID).releaseCalendar?.manualEvents)
      .toEqual([]);
  });

  it("generates a non-counter UUID once and preserves it through editing", () => {
    const created = createManualReleaseEvent(media(), {
      eventKind: "manual",
      title: "Generated",
      schedule: { precision: "tba" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const updated = updateManualReleaseEvent(created.item, created.event.id, {
      eventKind: "manual",
      title: "Updated",
      schedule: { precision: "tba" },
    });
    expect(updated.ok && updated.event.id).toBe(created.event.id);
  });

  it("rejects invalid payload and completed/dropped creation", () => {
    const invalid = createManualReleaseEvent(media(), {
      eventKind: "manual",
      title: "",
      schedule: { precision: "date_only", date: "2026-02-30" },
    }, { id: "counter-1", now: NOW });
    expect(invalid.ok).toBe(false);
    expect(createManualReleaseEvent(media({ status: "completed" }), {
      eventKind: "manual",
      title: "Hidden",
      schedule: { precision: "tba" },
    }, { id: EVENT_ID, now: NOW }).ok).toBe(false);
    expect(createManualReleaseEvent(media({ status: "dropped" }), {
      eventKind: "manual",
      title: "Hidden",
      schedule: { precision: "tba" },
    }, { id: EVENT_ID, now: NOW }).ok).toBe(false);
  });

  it("keeps stored manual events hidden only while status is ineligible", () => {
    const created = createManualReleaseEvent(media(), {
      eventKind: "manual",
      title: "Stored",
      schedule: { precision: "date_only", date: "2026-08-01" },
    }, { id: EVENT_ID, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(manualReleaseEventsForMedia({ ...created.item, status: "completed" })).toEqual([]);
    expect(manualReleaseEventsForMedia({ ...created.item, status: "dropped" })).toEqual([]);
    expect(manualReleaseEventsForMedia({ ...created.item, status: "planning" })).toHaveLength(1);
  });

  it("preserves valid records while reporting corrupt metadata", () => {
    const decoded = decodeMediaReleaseCalendarData({
      version: 1,
      manualEvents: [{
        id: EVENT_ID,
        mediaId: "media-1",
        eventKind: "manual",
        title: "Valid",
        schedule: { precision: "tba" },
        createdAt: NOW,
        updatedAt: NOW,
      }, {
        id: "bad",
        mediaId: "foreign",
        eventKind: "unknown",
        title: "",
        schedule: { precision: "date_only", date: "bad" },
        createdAt: "bad",
        updatedAt: "bad",
      }],
      hiddenProviderEventKeys: ["invalid-key"],
    }, "media-1");
    expect(decoded.ok).toBe(false);
    expect(decoded.value.manualEvents.map((entry) => entry.id)).toEqual([EVENT_ID]);
    expect(decoded.value.hiddenProviderEventKeys).toEqual([]);
    expect(decoded.issues.length).toBeGreaterThan(0);
    const local = decodeMediaItem({
      ...media(),
      releaseCalendar: {
        version: 1,
        manualEvents: [{ id: "bad" }],
        hiddenProviderEventKeys: ["invalid-key"],
      },
    });
    expect(local.status).toBe("invalid");
    if (local.status === "invalid") {
      expect(local.issues.map((entry) => entry.code))
        .toContain("invalid_manual_event_id");
    }
    const staleHiddenOnly = decodeMediaItem({
      ...media(),
      releaseCalendar: {
        version: 1,
        manualEvents: [],
        hiddenProviderEventKeys: ["legacy-invalid-key"],
      },
    });
    expect(staleHiddenOnly.status).not.toBe("invalid");
    if (staleHiddenOnly.status !== "invalid") {
      expect(staleHiddenOnly.value.releaseCalendar?.hiddenProviderEventKeys).toEqual([]);
      expect(staleHiddenOnly.warnings.map((entry) => entry.code))
        .toContain("invalid_hidden_provider_key");
    }
  });

  it("hides only the stable provider event and restores it without changing cache", () => {
    const first = providerEvent("release-1");
    const second = providerEvent("release-2");
    const hidden = hideProviderReleaseEvent(media(), first);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(buildHiddenProviderEventKey(first)).toBe("tmdb:release-1");
    expect(buildHiddenProviderEventKey({
      ...first,
      origin: { ...first.origin, providerEventId: "" },
    })).toBeNull();
    const cache = upsertReleaseCacheEntry(
      emptyReleaseCalendarCache(),
      createReleaseCacheEntry({
        item: media(),
        provider: "tmdb",
        events: [first, second],
        fetchedAtMs: Date.parse(NOW),
      }),
    );
    expect(buildReleaseCalendarViewItems({
      items: [hidden.item],
      cache,
      nowMs: Date.parse(NOW),
    }).map(({ event }) => event.id)).toEqual(["release-2"]);
    expect(cache.entries[0].events).toEqual([first, second]);
    expect(buildReleaseCalendarViewItems({
      items: [restoreProviderReleaseEvent(hidden.item, hidden.key)],
      cache,
      nowMs: Date.parse(NOW),
    }).map(({ event }) => event.id)).toEqual(["release-1", "release-2"]);
    const refreshedCache = upsertReleaseCacheEntry(
      cache,
      createReleaseCacheEntry({
        item: media(),
        provider: "tmdb",
        events: [{
          ...first,
          title: "Provider refresh changed title/date",
          date: { precision: "date_only", date: "2026-08-02" },
        }],
        fetchedAtMs: Date.parse(NOW) + 1,
      }),
    );
    expect(buildReleaseCalendarViewItems({
      items: [hidden.item],
      cache: refreshedCache,
      nowMs: Date.parse(NOW) + 1,
    })).toEqual([]);
  });

  it("safe-writes and isolates manual calendar data by owner scope", () => {
    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    const created = createManualReleaseEvent(media(), {
      eventKind: "manual",
      title: "Owner A event",
      schedule: { precision: "tba" },
    }, { id: EVENT_ID, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(saveScopedLibrarySnapshot(
      userA,
      [created.item],
      [],
      "user",
      storage,
    ).ok).toBe(true);
    expect(saveScopedLibrarySnapshot(userB, [], [], "user", storage).ok).toBe(true);

    expect(loadScopedMediaList(userA, storage).data?.[0].releaseCalendar)
      .toEqual(created.item.releaseCalendar);
    expect(loadScopedMediaList(userB, storage).data).toEqual([]);
  });

  it("roundtrips through the local codec and cloud metadata without replacing other metadata", () => {
    const created = createManualReleaseEvent(media({ genres: ["Drama"] }), {
      eventKind: "movie_release",
      title: "Özel gösterim",
      schedule: { precision: "date_only", date: "2026-08-10" },
    }, { id: EVENT_ID, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const local = decodeMediaItem(JSON.parse(JSON.stringify(created.item)));
    expect(local.status).not.toBe("invalid");
    if (local.status === "invalid") return;
    expect(local.value.releaseCalendar).toEqual(created.item.releaseCalendar);

    const row = toMediaRow("user-a", created.item);
    expect(row.metadata).toMatchObject({
      genres: ["Drama"],
      releaseCalendar: created.item.releaseCalendar,
    });
    const cloud = fromMediaRow({
      ...row,
      created_at: NOW,
      updated_at: NOW,
    } as never);
    expect(cloud.releaseCalendar).toEqual(created.item.releaseCalendar);
    expect(cloud.genres).toEqual(["Drama"]);
  });

  it("feeds the same manual/hidden event set into agenda and monthly consumers", () => {
    const created = createManualReleaseEvent(media(), {
      eventKind: "manual",
      title: "Manual",
      schedule: { precision: "date_only", date: "2026-08-01" },
    }, { id: EVENT_ID, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const hidden = hideProviderReleaseEvent(created.item, providerEvent());
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    const cache = upsertReleaseCacheEntry(
      emptyReleaseCalendarCache(),
      createReleaseCacheEntry({
        item: media(),
        provider: "tmdb",
        events: [providerEvent()],
        fetchedAtMs: Date.parse(NOW),
      }),
    );
    const agenda = buildReleaseAgendaView({
      items: [hidden.item],
      cache,
      today: "2026-07-30",
      nowMs: Date.parse(NOW),
    });
    expect([...agenda.next7Days, ...agenda.next30Days].map(({ event }) => event.id))
      .toEqual([EVENT_ID]);
  });
});
