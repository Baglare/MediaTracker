import "./helpers/admitted-rate-limit";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ server: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), storage: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.server }));
import { readStrictJsonObject, resetRateLimitsForTests, validateAuthenticatedMutationRequest } from "@/lib/api/request-security";
import * as assets from "@/app/api/social/assets/route";
import * as comments from "@/app/api/social/comments/route";
import * as feed from "@/app/api/social/feed/route";
import * as notifications from "@/app/api/social/notifications/route";
import * as preferences from "@/app/api/social/preferences/route";
import * as profile from "@/app/api/social/profile/route";
import * as reactions from "@/app/api/social/reactions/route";
import * as recommendations from "@/app/api/social/recommendations/route";
import * as relationships from "@/app/api/social/relationships/route";
import * as reports from "@/app/api/social/reports/route";
import * as themes from "@/app/api/personalization/themes/sync/route";
import * as xp from "@/app/api/xp/route";
import { POST as recommend } from "@/app/api/ai/recommend/route";

const origin = "https://tracker.example";
const id = "00000000-0000-4000-8000-000000000001";
const acceptedMetadata: Record<string, string>[] = [{}, { "Sec-Fetch-Site": "same-origin" }];
const endpoints = [
  ["social/assets", "POST", assets.POST], ["social/assets", "DELETE", assets.DELETE],
  ["social/comments", "POST", comments.POST], ["social/comments", "PATCH", comments.PATCH],
  ["social/feed", "POST", feed.POST], ["social/notifications", "PATCH", notifications.PATCH],
  ["social/preferences", "POST", preferences.POST], ["social/profile", "POST", profile.POST],
  ["social/reactions", "POST", reactions.POST], ["social/recommendations", "POST", recommendations.POST],
  ["social/recommendations", "PATCH", recommendations.PATCH], ["social/relationships", "POST", relationships.POST],
  ["social/reports", "POST", reports.POST], ["personalization/themes/sync", "PUT", themes.PUT],
  ["personalization/themes/sync", "DELETE", themes.DELETE], ["xp", "POST", xp.POST],
] as const;
const deniedHeaders: [string, Record<string, string>][] = [
  ["missing Origin", {}], ["malformed", { Origin: "not-a-url" }], ["opaque", { Origin: "null" }],
  ["attacker", { Origin: "https://attacker.example" }], ["port", { Origin: `${origin}:444` }],
  ["scheme", { Origin: "http://tracker.example" }], ["cross-site", { Origin: origin, "Sec-Fetch-Site": "cross-site" }],
  ["same-site", { Origin: origin, "Sec-Fetch-Site": "same-site" }], ["none", { Origin: origin, "Sec-Fetch-Site": "none" }],
  ["unknown metadata", { Origin: origin, "Sec-Fetch-Site": "unexpected" }],
  ["path", { Origin: `${origin}/path` }], ["credentials", { Origin: "https://user@tracker.example" }],
  ["multiple origins", { Origin: `${origin} https://attacker.example` }], ["empty metadata", { Origin: origin, "Sec-Fetch-Site": "" }],
];
function request(path: string, method: string, headers: HeadersInit, body: unknown = {}) {
  return new Request(`${origin}/api/${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id, app_metadata: { role: "admin" } } }, error: null });
  mocks.rpc.mockResolvedValue({ data: { ok: true, deleted: true }, error: null });
  mocks.server.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from, storage: { from: mocks.storage } });
  resetRateLimitsForTests();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("authenticated mutation helper", () => {
  it.each(deniedHeaders)("rejects %s", async (_name, headers) => {
    const response = validateAuthenticatedMutationRequest(request("xp", "POST", headers));
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ code: "invalid_origin" });
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });
  it.each(acceptedMetadata)("accepts exact Origin with metadata %j", (headers) => {
    expect(validateAuthenticatedMutationRequest(request("xp", "POST", { Origin: origin, ...headers }))).toBeNull();
  });
  it.each(["http://localhost:3000", "https://preview-123.vercel.app", "https://tracker.example"])("uses actual target %s without forwarded headers", (target) => {
    expect(validateAuthenticatedMutationRequest(new Request(`${target}/api/xp`, { headers: { Origin: target, Host: "attacker.example", "X-Forwarded-Host": "attacker.example" } }))).toBeNull();
  });
  it("canonicalizes equivalent default ports and hostname case", () => {
    expect(validateAuthenticatedMutationRequest(request("xp", "POST", { Origin: "https://TRACKER.example:443" }))).toBeNull();
  });
  it.each([
    ["type", { "Content-Type": "text/plain" }, "{}", 415, "unsupported_content_type"],
    ["actual size", {}, JSON.stringify({ value: "x".repeat(100) }), 413, "request_too_large"],
    ["declared size", { "Content-Length": "100" }, "{}", 413, "request_too_large"],
    ["unknown field", {}, '{"extra":true}', 400, "unknown_field"],
  ] as const)("preserves strict JSON %s guard", async (_name, headers, body, status, code) => {
    const req = new Request(`${origin}/api/test`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body });
    expect(validateAuthenticatedMutationRequest(req)).toBeNull();
    const result = await readStrictJsonObject(req, new Set(["value"]), 64);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parser rejection");
    expect(result.response.status).toBe(status);
    expect(await result.response.json()).toEqual({ code });
  });
});

describe.each(endpoints)("%s %s request boundary", (path, method, handler) => {
  it.each(deniedHeaders)("denies %s before body consumption or writes", async (_name, headers) => {
    const req = request(path, method, headers);
    const response = await handler(req);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "invalid_origin" });
    expect(req.bodyUsed).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});

describe("authorized controls and unchanged auth failures", () => {
  const controls = [
    ["comments", comments.POST, { activityId: id, body: "synthetic", dedupeKey: "test", spoiler: false }, "social_comment"],
    ["comments", comments.PATCH, { commentId: id, action: "delete" }, "social_comment_action"],
    ["feed", feed.POST, { action: "delete", activityId: id }, "social_delete_activity"],
    ["notifications", notifications.PATCH, { action: "read_all" }, "social_notification_action"],
    ["preferences", preferences.POST, { kind: "activity", values: {} }, "social_save_preferences"],
    ["profile", profile.POST, { action: "unshare_note", noteId: id }, "social_unshare_note"],
    ["reactions", reactions.POST, { activityId: id, reaction: "like" }, "social_react"],
    ["recommendations", recommendations.POST, { action: "message", recommendationId: id, message: "synthetic", dedupeKey: "test" }, "social_send_recommendation_message"],
    ["recommendations", recommendations.PATCH, { action: "accept", recommendationId: id }, "social_recommendation_transition"],
    ["relationships", relationships.POST, { action: "follow", targetId: id }, "social_follow"],
    ["reports", reports.POST, { activityId: id, category: "spam" }, "social_report"],
  ] as const;
  it.each(controls)("allows %s control to reach its original RPC", async (path, handler, body, rpc) => {
    const response = await handler(request(`social/${path}`, handler === comments.PATCH || handler === notifications.PATCH || handler === recommendations.PATCH ? "PATCH" : "POST", { Origin: origin, "Sec-Fetch-Site": "same-origin" }, body));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(rpc, expect.any(Object));
  });
  it.each([
    ["xp", xp.POST, "POST"], ["personalization/themes/sync", themes.PUT, "PUT"],
    ["personalization/themes/sync", themes.DELETE, "DELETE"], ["social/assets", assets.POST, "POST"],
    ["social/assets", assets.DELETE, "DELETE"], ["social/profile", profile.POST, "POST"], ["social/relationships", relationships.POST, "POST"],
  ] as const)("retains %s %s unauthenticated 401", async (path, handler, method) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await handler(request(path, method, { Origin: origin }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("retains RPC-enforced authentication error mapping", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "authentication_required" } });
    const response = await notifications.PATCH(request("social/notifications", "PATCH", { Origin: origin }, { action: "read_all" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Bu işlem için giriş yapmalısın." });
  });
  it("retains authenticated XP success without Fetch Metadata", async () => {
    expect((await xp.POST(request("xp", "POST", { Origin: origin }, { action: "select_title", title: "Gezgin" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("xp_select_title", { p_title: "Gezgin" });
  });
});

describe("conditional privileged AI execution", () => {
  it.each(deniedHeaders)("rejects authorized provider execution with %s before upstream work", async (_name, headers) => {
    vi.stubEnv("AI_SERVER_ACCESS_MODE", "admin_only");
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const req = new NextRequest(`${origin}/api/ai/recommend`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ message: "anime öner", mediaItems: [], progressLogs: [], researchMode: "web" }) });
    expect((await recommend(req)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

it("inventories every exported unsafe handler, separating reads and local dev writes", () => {
  const exempt = new Set(["anilist/search:POST", "tmdb/search:POST", "omdb/search:POST", "tvmaze/search:POST", "openlibrary/search:POST", "social/people:POST", "ai/interpret:POST", "dev/recommendation-annotation:POST"]);
  const protectedMethods = new Set(endpoints.map(([path, method]) => `${path}:${method}`));
  protectedMethods.add("ai/recommend:POST");
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name === "route.ts" ? [join(dir, entry.name)] : []);
  }
  const files = walk("app/api");
  const actual: string[] = [];
  for (const file of files) {
    const path = file.replaceAll("\\", "/").replace(/^app\/api\//, "").replace(/\/route.ts$/, "");
    for (const match of readFileSync(file, "utf8").matchAll(/export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\(/g)) actual.push(`${path}:${match[1]}`);
  }
  expect(files).toHaveLength(35);
  expect(actual.sort()).toEqual([...protectedMethods, ...exempt].sort());
});
