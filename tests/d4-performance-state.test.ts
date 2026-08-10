import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OWN_PROFILE_CACHE_TTL_MS,
  loadOwnProfileCache,
  readOwnProfileCache,
  resetOwnProfileCacheForTests,
  updateOwnProfileCache,
} from "@/lib/social/own-profile-cache";
import { calculateUserProgression } from "@/lib/user-progression";
import { summaryToLegacyProgression } from "@/lib/xp/progression";
import type { MediaItem, ProgressLog } from "@/lib/types";

beforeEach(() => resetOwnProfileCacheForTests());
afterEach(() => vi.unstubAllGlobals());

describe("D4 owner-scoped profile cache", () => {
  it("coalesces concurrent summary requests for the same owner", async () => {
    const fetcher = vi.fn(async () => ({ displayName: "User A", avatarUrl: "https://example.test/a.png" }));
    const request = { ownerId: "user-a", resource: "summary" as const, fetcher };

    const [first, second] = await Promise.all([
      loadOwnProfileCache(request),
      loadOwnProfileCache(request),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("serves a fresh session cache and revalidates after TTL", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ avatarUrl: "https://example.test/old.png" })
      .mockResolvedValueOnce({ avatarUrl: "https://example.test/new.png" });
    const base = { ownerId: "user-a", resource: "summary" as const, fetcher };

    await loadOwnProfileCache({ ...base, now: 1_000 });
    await loadOwnProfileCache({ ...base, now: 1_000 + OWN_PROFILE_CACHE_TTL_MS - 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await loadOwnProfileCache({ ...base, now: 1_000 + OWN_PROFILE_CACHE_TTL_MS });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("isolates owners and updates avatar/banner independently", () => {
    updateOwnProfileCache("user-a", { avatarUrl: "https://example.test/a.png" });
    updateOwnProfileCache("user-a", { bannerUrl: "https://example.test/banner.png" });

    expect(readOwnProfileCache<{ avatarUrl?: string; bannerUrl?: string }>("user-a", "hero")).toMatchObject({
      avatarUrl: "https://example.test/a.png",
      bannerUrl: "https://example.test/banner.png",
    });
    expect(readOwnProfileCache("user-b", "hero")).toBeUndefined();
  });

  it("preserves a valid session snapshot when an asset update happens after reload", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
    await loadOwnProfileCache({
      ownerId: "user-a",
      resource: "summary",
      fetcher: async () => ({ displayName: "User A", tagline: "Saved", avatarUrl: "old" }),
    });
    resetOwnProfileCacheForTests();
    updateOwnProfileCache("user-a", { avatarUrl: "new" });
    expect(readOwnProfileCache("user-a", "summary")).toMatchObject({
      displayName: "User A",
      tagline: "Saved",
      avatarUrl: "new",
    });
  });
});

describe("D4 world metric semantics", () => {
  it("labels local world values as media counts", () => {
    const media = [
      { id: "anime", title: "Anime", type: "anime", status: "planning", coverImage: "", currentProgress: 0, totalProgress: 12 },
      { id: "movie", title: "Movie", type: "movie", status: "completed", coverImage: "", currentProgress: 1, totalProgress: 1 },
      { id: "book", title: "Book", type: "book", status: "reading", coverImage: "", currentProgress: 2, totalProgress: 10 },
    ] as MediaItem[];
    const result = calculateUserProgression(media, []);

    expect(result.worldMetric).toBe("media_count");
    expect(result.worldCounts).toMatchObject({ east: 1, screen: 1, arch: 1 });
    expect(result.totalXp).toBeGreaterThan(3);
  });

  it("keeps server world XP separate from bonus/global XP", () => {
    const result = summaryToLegacyProgression({
      version: 2,
      totalXp: 500,
      level: 3,
      currentLevelStartXp: 400,
      nextLevelStartXp: 900,
      selectedTitle: null,
      worlds: [
        { key: "east", xp: 100, level: 2, tier: "basic", title: "Doğu" },
        { key: "screen", xp: 120, level: 2, tier: "basic", title: "Kadraj" },
        { key: "arch", xp: 80, level: 2, tier: "basic", title: "Arşiv" },
      ],
      branches: [],
      events: [],
      quests: [],
      badges: [],
      breakdown: { localCurrentXp: 300, socialXp: 100, systemXp: 100, legacyCorrectionXp: 0 },
      legacyImported: false,
      librarySynchronized: true,
    });

    expect(result.worldMetric).toBe("xp");
    expect(result.worldCounts.east + result.worldCounts.screen + result.worldCounts.arch).toBe(300);
    expect(result.totalXp).toBe(500);
    expect(result.dominantWorld).toBe("screen");
  });

  it("does not count a replayed progress log ID twice in local fallback XP", () => {
    const log = {
      id: "log-1",
      mediaId: "media-1",
      mediaTitle: "Media",
      mediaType: "movie",
      action: "increment",
      previousProgress: 0,
      newProgress: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
    } as ProgressLog;

    expect(calculateUserProgression([], [log, { ...log }]).totalXp).toBe(5);
  });
});
