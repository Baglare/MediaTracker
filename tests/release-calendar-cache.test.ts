import { describe, expect, it, vi } from "vitest";

import {
  buildPersonalDataKeys,
  type PersonalStorageLike,
} from "@/lib/personal-data-storage";
import {
  createUserOwnerScope,
  GUEST_OWNER_SCOPE,
} from "@/lib/local-owner-scope";
import {
  createCanonicalMediaIdentity,
} from "@/lib/media-identity";
import type { MediaItem } from "@/lib/types";
import { PORTABLE_BACKUP_DOMAINS } from "@/lib/portable-backup";
import type {
  ReleaseEvent,
  ReleaseProvider,
} from "@/features/calendar/domain/release-calendar";
import {
  createReleaseCacheEntry,
  discardQuarantinedReleaseCacheCurrent,
  emptyReleaseCalendarCache,
  isReleaseCacheEntryStale,
  readReleaseCalendarCache,
  RELEASE_CACHE_TTL_MS,
  upsertReleaseCacheEntry,
  writeReleaseCalendarCache,
} from "@/features/calendar/data/release-cache";
import {
  buildReleaseAgendaView,
  mapWithConcurrency,
  refreshReleaseCalendarCache,
} from "@/features/calendar/services/release-calendar-service";
import type { AutomaticReleaseProviderSet } from "@/features/calendar/providers/release-providers";

class MemoryStorage implements PersonalStorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function media(id: string, overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    title: id,
    type: "movie",
    theme: "screen",
    mediaType: "movie",
    subType: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    externalSource: "tmdb",
    externalId: String(100 + id.length),
    identity: createCanonicalMediaIdentity({
      source: "tmdb",
      namespace: "movie",
      stableId: String(100 + id.length),
    }) ?? undefined,
    ...overrides,
  };
}

function event(item: MediaItem, suffix = "one"): ReleaseEvent {
  return {
    schemaVersion: 1,
    id: `${item.id}-${suffix}`,
    mediaRecordId: item.id,
    mediaIdentityKey: item.identity?.key,
    type: "movie_release",
    title: item.title,
    date: { precision: "date_only", date: "2026-02-01" },
    origin: {
      kind: "provider",
      provider: "tmdb",
      providerEventId: `${item.id}-${suffix}`,
      persistence: "reproducible_cache",
    },
  };
}

function providerSet(
  fetchEvents: ReleaseProvider<unknown>["fetchEvents"],
): AutomaticReleaseProviderSet {
  const tmdb: ReleaseProvider<unknown> = {
    id: "tmdb",
    supports: ({ media: item }) => item.type === "movie",
    fetchEvents,
    normalize: (_payload, context) => [{
      status: "valid",
      value: event(context.media),
    }],
  };
  const unsupported = (id: "tvmaze" | "anilist"): ReleaseProvider<unknown> => ({
    id,
    supports: () => false,
    fetchEvents: vi.fn(),
    normalize: () => [],
  });
  return { tmdb, tvmaze: unsupported("tvmaze"), anilist: unsupported("anilist") };
}

describe("owner-scoped release cache", () => {
  it("uses a 12 hour TTL boundary", () => {
    const item = media("ttl");
    const entry = createReleaseCacheEntry({
      item,
      provider: "tmdb",
      events: [event(item)],
      fetchedAtMs: 1000,
    });
    expect(Date.parse(entry.expiresAt) - Date.parse(entry.fetchedAt)).toBe(RELEASE_CACHE_TTL_MS);
    expect(isReleaseCacheEntryStale(entry, 1000 + RELEASE_CACHE_TTL_MS - 1)).toBe(false);
    expect(isReleaseCacheEntryStale(entry, 1000 + RELEASE_CACHE_TTL_MS)).toBe(true);
  });

  it("isolates guest and authenticated owner cache keys and values", () => {
    const storage = new MemoryStorage();
    const scopeA = createUserOwnerScope("user-a");
    const itemA = media("a");
    const itemGuest = media("guest");
    const cacheA = upsertReleaseCacheEntry(emptyReleaseCalendarCache(), createReleaseCacheEntry({
      item: itemA,
      provider: "tmdb",
      events: [event(itemA)],
    }));
    const guestCache = upsertReleaseCacheEntry(emptyReleaseCalendarCache(), createReleaseCacheEntry({
      item: itemGuest,
      provider: "tmdb",
      events: [event(itemGuest)],
    }));
    expect(writeReleaseCalendarCache(scopeA, cacheA, storage).ok).toBe(true);
    expect(writeReleaseCalendarCache(GUEST_OWNER_SCOPE, guestCache, storage).ok).toBe(true);
    expect(buildPersonalDataKeys("releaseCalendarCache", scopeA).current)
      .not.toBe(buildPersonalDataKeys("releaseCalendarCache", GUEST_OWNER_SCOPE).current);
    expect(readReleaseCalendarCache(scopeA, storage)).toMatchObject({
      status: "valid",
      data: { entries: [{ mediaRecordId: "a" }] },
    });
    expect(readReleaseCalendarCache(GUEST_OWNER_SCOPE, storage)).toMatchObject({
      status: "valid",
      data: { entries: [{ mediaRecordId: "guest" }] },
    });
    expect(PORTABLE_BACKUP_DOMAINS).not.toContain("releaseCalendarCache");
  });

  it("quarantines a corrupt current payload without deleting it", () => {
    const storage = new MemoryStorage();
    const keys = buildPersonalDataKeys("releaseCalendarCache", GUEST_OWNER_SCOPE);
    storage.setItem(keys.current, "{broken");
    const read = readReleaseCalendarCache(GUEST_OWNER_SCOPE, storage);
    expect(read.status).toBe("corrupt");
    expect(storage.getItem(keys.current)).toBe("{broken");
    expect([...storage.values.keys()].some((key) =>
      key.startsWith("mediaTracker:quarantine:personal:releaseCalendarCache:"))).toBe(true);
    if (read.status !== "corrupt" || !read.quarantineKey) {
      throw new Error("quarantine fixture missing");
    }
    expect(discardQuarantinedReleaseCacheCurrent(
      GUEST_OWNER_SCOPE,
      read.quarantineKey,
      storage,
    )).toBe(true);
    expect(storage.getItem(keys.current)).toBeNull();
    expect(storage.getItem(read.quarantineKey)).not.toBeNull();
  });
});

describe("release cache refresh orchestration", () => {
  it("shows stale data while revalidating and preserves it on refresh failure", async () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("user-a");
    const item = media("stale");
    const oldEntry = createReleaseCacheEntry({
      item,
      provider: "tmdb",
      events: [event(item, "old")],
      fetchedAtMs: 0,
    });
    const cache = upsertReleaseCacheEntry(emptyReleaseCalendarCache(), oldEntry);
    const before = buildReleaseAgendaView({
      items: [item],
      cache,
      today: "2026-01-01",
      nowMs: RELEASE_CACHE_TTL_MS + 1,
    });
    expect(before.later[0]).toMatchObject({ stale: true });
    const result = await refreshReleaseCalendarCache({
      scope,
      items: [item],
      cache,
      providers: providerSet(async () => {
        throw new Error("offline");
      }),
      nowMs: RELEASE_CACHE_TTL_MS + 1,
      storage,
    });
    expect(result.failures).toHaveLength(1);
    expect(result.cache).toEqual(cache);
    expect(result.cache.entries[0].events[0].id).toBe("stale-old");
  });

  it("isolates provider failures and keeps successful refreshes", async () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("user-a");
    const good = media("good");
    const bad = media("bad");
    const result = await refreshReleaseCalendarCache({
      scope,
      items: [good, bad],
      cache: emptyReleaseCalendarCache(),
      providers: providerSet(async (request) => {
        if (request.mediaRecordId === "bad") throw new Error("failed");
        return {};
      }),
      nowMs: Date.parse("2026-01-01T00:00:00Z"),
      storage,
    });
    expect(result.refreshedRecordIds).toEqual(["good"]);
    expect(result.failures.map((failure) => failure.mediaRecordId)).toEqual(["bad"]);
    expect(result.cache.entries.map((entry) => entry.mediaRecordId)).toEqual(["good"]);
  });

  it("skips fresh entries automatically but manual refresh forces the provider", async () => {
    const storage = new MemoryStorage();
    const scope = createUserOwnerScope("user-a");
    const item = media("fresh");
    const nowMs = Date.parse("2026-01-01T00:00:00Z");
    const cache = upsertReleaseCacheEntry(emptyReleaseCalendarCache(), createReleaseCacheEntry({
      item,
      provider: "tmdb",
      events: [event(item, "cached")],
      fetchedAtMs: nowMs,
    }));
    const fetchEvents = vi.fn().mockResolvedValue({});
    await refreshReleaseCalendarCache({
      scope,
      items: [item],
      cache,
      providers: providerSet(fetchEvents),
      nowMs: nowMs + 1,
      storage,
    });
    expect(fetchEvents).not.toHaveBeenCalled();
    await refreshReleaseCalendarCache({
      scope,
      items: [item],
      cache,
      providers: providerSet(fetchEvents),
      force: true,
      nowMs: nowMs + 1,
      storage,
    });
    expect(fetchEvents).toHaveBeenCalledTimes(1);
  });

  it("does not surface cached events for completed or dropped media", () => {
    const completed = media("completed", { status: "completed" });
    const dropped = media("dropped", { status: "dropped" });
    let cache = emptyReleaseCalendarCache();
    cache = upsertReleaseCacheEntry(cache, createReleaseCacheEntry({
      item: completed,
      provider: "tmdb",
      events: [event(completed)],
    }));
    cache = upsertReleaseCacheEntry(cache, createReleaseCacheEntry({
      item: dropped,
      provider: "tmdb",
      events: [event(dropped)],
    }));
    const agenda = buildReleaseAgendaView({
      items: [completed, dropped],
      cache,
      today: "2026-01-01",
    });
    expect(Object.values(agenda).flat()).toEqual([]);
  });

  it("limits provider work to three concurrent requests", async () => {
    let active = 0;
    let peak = 0;
    const values = Array.from({ length: 8 }, (_, index) => index);
    await mapWithConcurrency(values, 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return true;
    });
    expect(peak).toBe(3);
  });
});
