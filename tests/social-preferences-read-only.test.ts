import "./helpers/admitted-rate-limit";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ACTIVITY_PREFERENCES, DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/social/interactions";

const mocks = vi.hoisted(() => ({ server: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.server }));
import { GET, POST } from "@/app/api/social/preferences/route";

const owner = "00000000-0000-4000-8000-000000000001";
const queries: { table: string; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; is: ReturnType<typeof vi.fn> }[] = [];
const rows = new Map<string, unknown>();
const errors = new Map<string, { message: string }>();
const defaults = { configured: true, recommendationPermission: "mutual", activity: DEFAULT_ACTIVITY_PREFERENCES, notifications: DEFAULT_NOTIFICATION_PREFERENCES };

beforeEach(() => {
  vi.clearAllMocks(); queries.length = 0; rows.clear(); errors.clear();
  rows.set("profiles", { username: "owner", recommendation_permission: "mutual" });
  mocks.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      table, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: rows.get(table) ?? null, error: errors.get(table) ?? null })),
    };
    queries.push(query); return query;
  });
  mocks.server.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc });
});

describe("GET social preferences has no initialization writes", () => {
  it("returns virtual defaults repeatedly without RPC or persisted rows", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("private, no-store");
      expect(await response.json()).toEqual(defaults);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect([...rows.keys()]).toEqual(["profiles"]);
    for (const query of queries) {
      expect(query.eq).toHaveBeenCalledWith(query.table === "profiles" ? "id" : "user_id", owner);
      if (query.table === "profiles") expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    }
  });
  it.each([null, { username: null, recommendation_permission: "everyone" }])("keeps missing/unconfigured profile defaults: %j", async (profile) => {
    rows.set("profiles", profile);
    expect(await (await GET()).json()).toEqual({ ...defaults, configured: false });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("maps saved choices and leaves a separately absent notification row virtual", async () => {
    rows.set("profiles", { username: "owner", recommendation_permission: "none" });
    rows.set("social_activity_preferences", { share_completed: false, share_started: true, share_rating: true, share_favorite: true, share_recommendation_completed: true, default_visibility: "self" });
    expect(await (await GET()).json()).toEqual({
      ...defaults, recommendationPermission: "none",
      activity: { shareCompleted: false, shareStarted: true, shareRating: true, shareFavorite: true, shareRecommendationCompleted: true, defaultVisibility: "self" },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves every saved notification field", async () => {
    rows.set("social_notification_preferences", { follow_notifications: false, comment_notifications: false, reaction_notifications: false, recommendation_received: false, recommendation_accepted: false, recommendation_started: false, recommendation_completed: false, recommendation_rejected: true, recommendation_withdrawn: false });
    expect(await (await GET()).json()).toEqual({ ...defaults, notifications: { follow: false, comments: false, reactions: false, recommendationReceived: false, recommendationAccepted: false, recommendationStarted: false, recommendationCompleted: false, recommendationRejected: true, recommendationWithdrawn: false } });
  });
  it.each(["profiles", "social_activity_preferences", "social_notification_preferences"])("fails closed on %s query errors instead of pretending rows are absent", async (table) => {
    errors.set(table, { message: "permission denied private details" });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Sosyal işlem tamamlanamadı." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("retains guest/local-first unconfigured defaults when Supabase is absent", async () => {
    mocks.server.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ ...defaults, configured: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("retains unauthenticated 401 before reading tables", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("initializes through the existing authenticated save RPC only after a user save", async () => {
    mocks.rpc.mockResolvedValue({ data: defaults, error: null });
    const response = await POST(new Request("https://tracker.example/api/social/preferences", { method: "POST", headers: { Origin: "https://tracker.example", "Content-Type": "application/json" }, body: JSON.stringify({ kind: "activity", values: DEFAULT_ACTIVITY_PREFERENCES }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(defaults);
    expect(mocks.rpc).toHaveBeenCalledWith("social_save_preferences", { p_kind: "activity", p_values: DEFAULT_ACTIVITY_PREFERENCES });
    const sql = readFileSync("supabase/migrations/20260721130000_social_interactions_recommendations.sql", "utf8");
    const save = sql.slice(sql.indexOf("create or replace function public.social_save_preferences"), sql.indexOf("create or replace function public.social_publish_activity"));
    expect(save).toContain("insert into public.social_activity_preferences");
    expect(save).toContain("insert into public.social_notification_preferences");
    expect(save).toContain("return public.social_get_preferences()");
  });
});
