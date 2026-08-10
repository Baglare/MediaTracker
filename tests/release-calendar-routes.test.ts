import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/providers/release-policy", () => ({
  publicProviderCapability: () => ({ enabled: true, reason: "enabled" }),
}));

import { GET as getAniList } from "@/app/api/calendar/anilist/route";
import { GET as getTmdb } from "@/app/api/calendar/tmdb/route";
import { GET as getTvmaze } from "@/app/api/calendar/tvmaze/route";

describe("release calendar API route contracts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("rejects malformed provider IDs before any upstream request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const responses = await Promise.all([
      getTvmaze(new NextRequest("http://localhost/api/calendar/tvmaze?showId=abc&season=2")),
      getAniList(new NextRequest("http://localhost/api/calendar/anilist?mediaId=-1")),
      getTmdb(new NextRequest("http://localhost/api/calendar/tmdb?movieId=1%2Fcredits")),
    ]);
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns only the requested TVMaze season inside the 90 day window", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 1, season: 2, number: 1, airdate: "2026-01-02", airstamp: "2026-01-02T20:00:00Z" },
      { id: 1, season: 2, number: 1, airdate: "2026-01-02", airstamp: "2026-01-02T20:00:00Z" },
      { id: 2, season: 3, number: 1, airdate: "2026-01-03", airstamp: "2026-01-03T20:00:00Z" },
      { id: 3, season: 2, number: 2, airdate: "2026-05-01", airstamp: "2026-05-01T20:00:00Z" },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await getTvmaze(new NextRequest(
      "http://localhost/api/calendar/tvmaze?showId=169&season=2",
    ));
    expect(await response.json()).toMatchObject({
      showId: 169,
      seasonNumber: 2,
      episodes: [{ id: 1, season: 2 }],
    });
    expect(fetcher.mock.calls[0][1]).toEqual(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it("bounds and deduplicates AniList schedules", async () => {
    const inside = Math.floor(Date.parse("2026-01-05T12:00:00Z") / 1000);
    const outside = Math.floor(Date.parse("2026-05-01T12:00:00Z") / 1000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        Page: {
          pageInfo: { hasNextPage: false },
          airingSchedules: [
            { id: 10, airingAt: inside, episode: 2 },
            { id: 10, airingAt: inside, episode: 2 },
            { id: 11, airingAt: outside, episode: 3 },
          ],
        },
      },
    }), { status: 200 })));
    const response = await getAniList(new NextRequest(
      "http://localhost/api/calendar/anilist?mediaId=21",
    ));
    expect((await response.json()).schedules).toEqual([
      { id: 10, airingAt: inside, episode: 2 },
    ]);
  });

  it("keeps the TMDB token server-side and returns only minimal future fields", async () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "server-secret");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 42,
      release_date: "2026-02-01",
      release_dates: {
        results: [{
          iso_3166_1: "TR",
          release_dates: [
            { release_date: "2026-02-02T00:00:00Z", type: 3, certification: "secret-raw" },
            { release_date: "2025-01-01T00:00:00Z", type: 4 },
          ],
        }],
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await getTmdb(new NextRequest(
      "http://localhost/api/calendar/tmdb?movieId=42",
    ));
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("server-secret");
    expect(text).not.toContain("secret-raw");
    expect(JSON.parse(text)).toEqual({
      movieId: 42,
      originalReleaseDate: "2026-02-01",
      releases: [{ region: "TR", dateTime: "2026-02-02T00:00:00Z", type: 3 }],
    });
  });

  it("maps aborted upstream requests to a safe timeout response", async () => {
    const timeout = new Error("upstream detail must not leak");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    const response = await getTvmaze(new NextRequest(
      "http://localhost/api/calendar/tvmaze?showId=169&season=2",
    ));
    expect(response.status).toBe(504);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("zaman aşımına uğradı");
    expect(text).not.toContain("upstream detail");
  });
});
