import { describe, expect, it, vi } from "vitest";

import {
  createReleaseProviders,
  dedupeProviderReleaseEvents,
  fetchReleaseJson,
  normalizeAniListReleaseEvents,
  normalizeTmdbReleaseEvents,
  normalizeTvmazeReleaseEvents,
  releaseProviderForMedia,
  resolveTmdbReleaseRegion,
} from "@/features/calendar/providers/release-providers";
import {
  createCanonicalMediaIdentity,
} from "@/lib/media-identity";
import type { MediaItem } from "@/lib/types";
import type {
  ReleaseEvent,
  ReleaseProviderContext,
} from "@/features/calendar/domain/release-calendar";
import {
  resolveTvSeasonIdentity,
  getReleaseEventCalendarDate,
  selectReleaseAgenda,
} from "@/features/calendar/domain/release-calendar";

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "media-1",
    title: "Example",
    type: "movie",
    theme: "screen",
    mediaType: "movie",
    subType: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    ...overrides,
  };
}

function tvContext(overrides: Partial<MediaItem> = {}): ReleaseProviderContext {
  const item = media({
    type: "tv",
    mediaType: "tv",
    subType: "tv_series",
    externalSource: "tvmaze",
    externalId: "169-season-2",
    seasonNumber: 2,
    identity: createCanonicalMediaIdentity({
      source: "tvmaze",
      namespace: "season",
      stableId: "169-season-2",
    }) ?? undefined,
    ...overrides,
  });
  const resolved = resolveTvSeasonIdentity(item);
  if (resolved.status !== "resolved") throw new Error("season fixture unresolved");
  return { media: item, seasonIdentity: resolved.value };
}

describe("automatic release providers", () => {
  it("normalizes only the resolved TVMaze season", () => {
    const events = normalizeTvmazeReleaseEvents({
      episodes: [
        {
          id: 1,
          season: 2,
          number: 4,
          name: "Own",
          airdate: "2026-02-01",
          airstamp: "2026-02-01T20:00:00+03:00",
        },
        {
          id: 2,
          season: 3,
          number: 1,
          name: "Other",
          airdate: "2026-03-01",
          airstamp: "2026-03-01T20:00:00+03:00",
        },
      ],
    }, tvContext());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "tvmaze:1",
      episodeNumber: 4,
      seasonIdentity: { seasonNumber: 2 },
      date: { precision: "exact_datetime", dateTime: "2026-02-01T20:00:00+03:00" },
    });
  });

  it("does not support title-derived TV seasons", () => {
    const providers = createReleaseProviders();
    const item = media({
      type: "tv",
      mediaType: "tv",
      subType: "tv_series",
      title: "Show - Sezon 4",
      originalTitle: "Show Season 4",
      externalSource: undefined,
      externalId: undefined,
      seasonNumber: undefined,
      identity: undefined,
    });
    expect(releaseProviderForMedia(item, providers)).toBeNull();
  });

  it("normalizes multiple AniList schedules inside the next 90 days", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const context: ReleaseProviderContext = {
      media: media({
        type: "anime",
        mediaType: "anime",
        subType: "anime_tv",
        externalSource: "anilist",
        externalId: "21",
        identity: createCanonicalMediaIdentity({
          source: "anilist",
          namespace: "anime",
          stableId: "21",
        }) ?? undefined,
      }),
    };
    const events = normalizeAniListReleaseEvents({
      schedules: [
        { id: 10, airingAt: Math.floor((now + 86400000) / 1000), episode: 2 },
        { id: 11, airingAt: Math.floor((now + 7 * 86400000) / 1000), episode: 3 },
        { id: 12, airingAt: Math.floor((now + 91 * 86400000) / 1000), episode: 4 },
      ],
    }, context, now);
    expect(events.map((event) => event.episodeNumber)).toEqual([2, 3]);
    expect(events.every((event) => event.date.precision === "exact_datetime")).toBe(true);
  });

  it("uses explicit TMDB region, then locale, then the provider general date", () => {
    const context: ReleaseProviderContext = {
      media: media({
        externalSource: "tmdb",
        externalId: "42",
        identity: createCanonicalMediaIdentity({
          source: "tmdb",
          namespace: "movie",
          stableId: "42",
        }) ?? undefined,
      }),
    };
    const payload = {
      movieId: 42,
      originalReleaseDate: "2026-02-01",
      releases: [
        { region: "TR", dateTime: "2026-02-02T00:00:00Z", type: 3 },
        { region: "DE", dateTime: "2026-02-03T00:00:00Z", type: 4 },
      ],
    };
    expect(normalizeTmdbReleaseEvents(payload, context, {
      preferredRegion: "DE",
      locale: "tr-TR",
      today: "2026-01-01",
    })[0].metadata).toEqual({ releaseType: "digital", region: "DE" });
    expect(normalizeTmdbReleaseEvents(payload, context, {
      locale: "tr-TR",
      today: "2026-01-01",
    })[0].metadata).toEqual({ releaseType: "theatrical", region: "TR" });
    expect(normalizeTmdbReleaseEvents(payload, context, {
      locale: "en-GB",
      today: "2026-01-01",
    })[0]).toMatchObject({
      date: { precision: "date_only", date: "2026-02-01" },
      metadata: { releaseType: "general" },
    });
    expect(resolveTmdbReleaseRegion({
      preferredRegion: "US",
      locale: "tr",
      availableRegions: ["TR", "DE"],
    })).toBeUndefined();
  });

  it("does not create TBA when a provider simply returns no results", () => {
    const animeContext: ReleaseProviderContext = {
      media: media({ type: "anime", mediaType: "anime", subType: "anime_tv" }),
    };
    expect(normalizeTvmazeReleaseEvents({ episodes: [] }, tvContext())).toEqual([]);
    expect(normalizeAniListReleaseEvents({ schedules: [] }, animeContext)).toEqual([]);
    expect(normalizeTmdbReleaseEvents({
      movieId: 1,
      originalReleaseDate: null,
      releases: [],
    }, { media: media() })).toEqual([]);
    expect(normalizeTvmazeReleaseEvents({
      episodes: [{
        id: 99,
        season: 2,
        number: 9,
        name: "Undated",
        airdate: null,
        airstamp: null,
      }],
    }, tvContext())).toEqual([]);
  });

  it("deduplicates deterministically by provider and provider event ID", () => {
    const base: ReleaseEvent = {
      schemaVersion: 1,
      id: "second",
      mediaRecordId: "media-1",
      type: "episode",
      title: "Example",
      date: { precision: "date_only", date: "2026-02-02" },
      origin: {
        kind: "provider",
        provider: "tvmaze",
        providerEventId: "same",
        persistence: "reproducible_cache",
      },
    };
    const earlier = {
      ...base,
      id: "first",
      date: { precision: "date_only" as const, date: "2026-02-01" },
    };
    expect(dedupeProviderReleaseEvents([base, earlier]).map((event) => event.id))
      .toEqual(["first"]);
    expect(dedupeProviderReleaseEvents([earlier, base]).map((event) => event.id))
      .toEqual(["first"]);
  });

  it("groups exact instants on the user's local calendar day", () => {
    const instant: ReleaseEvent = {
      schemaVersion: 1,
      id: "instant",
      mediaRecordId: "media-1",
      type: "movie_release",
      title: "Example",
      date: { precision: "exact_datetime", dateTime: "2026-01-01T23:30:00Z" },
      origin: {
        kind: "provider",
        provider: "tmdb",
        providerEventId: "instant",
        persistence: "reproducible_cache",
      },
    };
    expect(selectReleaseAgenda([instant], "2026-01-02", {
      timeZone: "Europe/Istanbul",
    }).today).toEqual([instant]);
    expect(selectReleaseAgenda([instant], "2026-01-01", {
      timeZone: "America/New_York",
    }).today).toEqual([instant]);
  });

  it("uses explicit IANA zones at offset and DST boundaries", () => {
    const eventAt = (dateTime: string): ReleaseEvent => ({
      schemaVersion: 1,
      id: dateTime,
      mediaRecordId: "media-1",
      type: "episode",
      title: "Boundary",
      date: { precision: "exact_datetime", dateTime },
      origin: {
        kind: "provider",
        provider: "anilist",
        providerEventId: dateTime,
        persistence: "reproducible_cache",
      },
    });
    expect(getReleaseEventCalendarDate(eventAt("2026-01-01T00:30:00Z"), {
      timeZone: "America/Los_Angeles",
    })).toBe("2025-12-31");
    expect(getReleaseEventCalendarDate(eventAt("2026-01-01T22:30:00Z"), {
      timeZone: "Asia/Tokyo",
    })).toBe("2026-01-02");
    expect(getReleaseEventCalendarDate(eventAt("2026-03-08T07:30:00Z"), {
      timeZone: "America/New_York",
    })).toBe("2026-03-08");
    expect(getReleaseEventCalendarDate(eventAt("2026-11-01T06:30:00Z"), {
      timeZone: "America/New_York",
    })).toBe("2026-11-01");
  });
});

describe("release provider retry policy", () => {
  it("honors Retry-After for bounded 429 retry", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("{}", {
        status: 429,
        headers: { "Retry-After": "2" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchReleaseJson("/release", { fetcher, sleep })).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry permanent 4xx responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(fetchReleaseJson("/release", { fetcher })).rejects.toMatchObject({
      detail: { code: "permanent", status: 400 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries bounded network and 5xx failures", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchReleaseJson("/release", { fetcher, sleep })).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("adds a bounded abort signal to browser-to-route requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await fetchReleaseJson("/release", { fetcher, timeoutMs: 1_500 });
    expect(fetcher).toHaveBeenCalledWith("/release", expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });
});
