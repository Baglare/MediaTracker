import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import type { SocialProfilePayload } from "@/lib/social/types";

const { getSupabaseServerClientMock } = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

import SocialProfilePage, { dynamic as pageDynamic, revalidate as pageRevalidate } from "@/app/u/[username]/page";
import { dynamic as routeDynamic, GET, revalidate as routeRevalidate } from "@/app/api/social/profile/[username]/route";

function module(moduleKey: "stats" | "progression" | "favorites", visibility: "public" | "followers" = "public") {
  return { moduleKey, enabled: true, visibility, gridX: 0, gridY: 0, gridWidth: 6, gridHeight: 2, mobileOrder: 0, config: { density: "compact" } };
}

function rpcPayload(viewer: "anonymous" | "stranger" | "follower") {
  return {
    status: "available",
    profile: {
      id: "00000000-0000-4000-8000-000000000001",
      username: "protected_owner",
      displayName: "Protected Owner",
      visibilityMode: "protected",
      connectionColor: "violet",
    },
    relationship: {
      viewerFollowsOwner: viewer === "follower" ? "accepted" : null,
      ownerFollowsViewer: null,
      self: false,
      anonymous: viewer === "anonymous",
      viewerConnectionColor: "cyan",
    },
    modules: [module("stats"), module("progression"), module("favorites", "followers")],
    favorites: [{ title: "Private favorite", mediaType: "movie", world: "screen", sortOrder: 0 }],
    current: [{ title: "Private current", mediaType: "tv", world: "screen", sortOrder: 0 }],
    stats: { totalMedia: 2, completed: 1, active: 1, planning: 0, favorites: 1, rated: 1, worldCounts: { east: 0, screen: 2, arch: 0 }, snapshotAt: "2026-07-21T00:00:00.000Z" },
    progression: { version: 1, totalXp: 10, level: 1, title: "Başlangıç", tier: "basic", dominantWorld: "screen", progressPercent: 0.1, worldCounts: { screen: 2 }, snapshotAt: "2026-07-21T00:00:00.000Z" },
    sharedNotes: [{ id: "note", mediaTitle: "Secret", mediaType: "movie", content: "secret", containsSpoiler: false, visibility: "public", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z" }],
  };
}

function setup(viewer: "anonymous" | "stranger" | "follower") {
  getSupabaseServerClientMock.mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ data: rpcPayload(viewer), error: null }),
    storage: { from: vi.fn() },
  });
}

async function apiPayload(): Promise<{ response: Response; payload: SocialProfilePayload }> {
  const response = await GET(new Request("http://localhost/api/social/profile/protected_owner"), {
    params: Promise.resolve({ username: "protected_owner" }),
  });
  return { response, payload: await response.json() as SocialProfilePayload };
}

describe("viewer-specific social profile loader", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["anonymous", "stranger"] as const)("removes protected module data for %s API requests", async (viewer) => {
    setup(viewer);
    const { payload } = await apiPayload();

    expect(payload.modules).toEqual([]);
    expect(payload.favorites).toEqual([]);
    expect(payload.current).toEqual([]);
    expect(payload.sharedNotes).toEqual([]);
    expect(payload).not.toHaveProperty("stats");
    expect(payload).not.toHaveProperty("progression");
    expect(JSON.stringify(payload)).not.toContain("gridX");
    expect(JSON.stringify(payload)).not.toContain("density");
  });

  it("keeps allowed protected modules for an accepted follower", async () => {
    setup("follower");
    const { payload } = await apiPayload();

    expect(payload.modules.map((item) => item.moduleKey)).toEqual(["stats", "progression", "favorites"]);
    expect(payload.stats?.totalMedia).toBe(2);
    expect(payload.progression?.level).toBe(1);
    expect(payload.favorites).toHaveLength(1);
  });

  it("uses the same sanitized loader result for the API and server-rendered page", async () => {
    setup("anonymous");
    const { payload: api } = await apiPayload();
    const page = await SocialProfilePage({ params: Promise.resolve({ username: "protected_owner" }) }) as ReactElement<{ payload: SocialProfilePayload }>;

    expect(page.props.payload).toEqual(api);
  });

  it("marks both viewer-specific entrypoints as dynamic and non-cacheable", async () => {
    setup("anonymous");
    const { response } = await apiPayload();

    expect(routeDynamic).toBe("force-dynamic");
    expect(routeRevalidate).toBe(0);
    expect(pageDynamic).toBe("force-dynamic");
    expect(pageRevalidate).toBe(0);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
