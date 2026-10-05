import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/supabase/status", () => ({ getSupabaseEnv: () => ({ url: "https://offline.invalid", anonKey: "offline-public-key" }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/providers/release-policy", () => ({ publicProviderCapability: () => ({ enabled: true, reason: "enabled" }) }));

import { canonicalRateLimitIp, identityEpochs, subjectDigest, trustedRateLimitIp } from "@/lib/api/rate-limit-identity";
import { consumeRateLimit, providerRetryAfter, rateLimitResponse, reportProviderCooldown, signRateLimitEnvelope, RATE_LIMIT_POLICIES } from "@/lib/api/distributed-rate-limit";
import { resetRateLimitsForTests } from "@/lib/api/request-security";
import { POST as tvmaze } from "@/app/api/tvmaze/search/route";
import { POST as openlibrary } from "@/app/api/openlibrary/search/route";
import { GET as details } from "@/app/api/tvmaze/details/route";
import { POST as comments } from "@/app/api/social/comments/route";
import { supabaseApplicationError } from "@/lib/supabase/safe-error";
import { safeSocialRouteError } from "@/lib/social/route-response";

const userId = "00000000-0000-4000-8000-000000000001";
const identityKey = "offline-identity-fixture-key-not-a-secret";
const signingKey = "offline-signing-fixture-key-not-a-secret";
function request(ip = "192.0.2.10", body = { query: "show" }) {
  return new NextRequest("https://app.invalid/api/tvmaze/search", { method: "POST", headers: {
    "content-type": "application/json", "x-real-ip": ip, origin: "https://app.invalid", "x-user-id": "forged-owner",
  }, body: JSON.stringify(body) });
}
function envelope(index = 0) { return JSON.parse(mocks.rpc.mock.calls[index][1].p_envelope); }

beforeEach(() => {
  vi.stubEnv("MEDIA_TRACKER_PROVIDER_USER_AGENT", "MediaTracker/1.0 (mediatracker.contact@gmail.com)");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("RATE_LIMIT_IDENTITY_HMAC_KEY", identityKey);
  vi.stubEnv("RATE_LIMIT_RPC_SIGNING_KEY", signingKey);
  vi.stubEnv("RATE_LIMIT_RPC_KEY_VERSION", "offline-v1");
  vi.stubEnv("RATE_LIMIT_RPC_AUDIENCE", "media-tracker:test");
  vi.stubEnv("RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY", "");
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.abortSignal.mockResolvedValue({ data: { allowed: true, reason: "allowed", retry_after_seconds: 0 }, error: null });
  mocks.rpc.mockImplementation(() => ({ abortSignal: mocks.abortSignal }));
  resetRateLimitsForTests();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("identity and HMAC", () => {
  it.each([
    ["192.0.2.1", "192.0.2.1"], ["::ffff:192.0.2.1", "192.0.2.1"], ["0:0:0:0:0:ffff:c000:201", "192.0.2.1"],
    ["2001:db8:1:2::1", "2001:0db8:0001:0002::/64"], ["2001:0db8:0001:0002:ffff::1", "2001:0db8:0001:0002::/64"],
  ])("canonicalizes %s", (value, expected) => expect(canonicalRateLimitIp(value)).toBe(expected));
  it.each(["", "unknown", "999.1.1.1", "2001:::1", "fe80::1%eth0", "[::1]", "1.2.3.4:443", "1.2.3.4,5.6.7.8", " 1.2.3.4"])('rejects malformed %s', (ip) => expect(canonicalRateLimitIp(ip)).toBeNull());
  it("never trusts an off-platform forged header and requires explicit local adapter", () => {
    vi.stubEnv("VERCEL", ""); vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_LOCAL_TEST_IP", "192.0.2.5");
    expect(trustedRateLimitIp(request())).toBeNull();
    vi.stubEnv("NODE_ENV", "test");
    expect(trustedRateLimitIp(request())).toBe("192.0.2.5");
  });
  it("has deterministic, separated project/environment/policy/day/user/IP namespaces", () => {
    const args = [identityKey, "media-tracker:test", "search", 20000, { kind: "user", value: userId }] as const;
    const digest = subjectDigest(...args);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(subjectDigest(...args)).toBe(digest);
    expect(new Set([digest,
      subjectDigest(signingKey, ...args.slice(1) as [string,string,number,{kind:"user";value:string}]),
      subjectDigest(identityKey,"media-tracker:production","search",20000,args[4]),
      subjectDigest(identityKey,args[1],"ingress",20000,args[4]),
      subjectDigest(identityKey,args[1],"search",20001,args[4]),
      subjectDigest(identityKey,args[1],"search",20000,{kind:"ip",value:userId}),
    ]).size).toBe(6);
    expect(digest).not.toContain(userId);
  });
  it("signs exact bounded UTF-8 bytes", () => {
    const signed = signRateLimitEnvelope({ version: 1, policy_id: "social_read" }, signingKey);
    expect(signed.p_signature_hex).toBe(createHmac("sha256", signingKey).update(signed.p_envelope).digest("hex"));
    expect(() => signRateLimitEnvelope({ x: "x".repeat(2049) }, signingKey)).toThrow("rate_limit_envelope_invalid");
  });
  it("checks both daily epochs during active-window overlap", () => {
    const midnight = Date.parse("2026-10-04T00:00:00Z");
    expect(identityEpochs(midnight)).toEqual([20729,20730]);
    expect(identityEpochs(midnight+60000)).toEqual([20730]);
  });
  it("verified user keeps same bucket across IP changes; forged headers/body ignored", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    await consumeRateLimit(request("192.0.2.1", { query: "a" }),"tvmaze_search");
    await consumeRateLimit(request("192.0.2.2", { query: "b" }),"tvmaze_search");
    expect(envelope(0).subjects).toEqual(envelope(1).subjects);
    expect(envelope(0).ingress).not.toEqual(envelope(1).ingress);
    expect(envelope(0).identity_class).toBe("user");
    expect(mocks.rpc.mock.calls[0][1].p_envelope).not.toMatch(/192\.0\.2|forged-owner|00000000-0000/);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000002" } }, error: null });
    await consumeRateLimit(request(),"tvmaze_search");
    expect(envelope(0).subjects).not.toEqual(envelope(2).subjects);
  });
  it("canonical equivalent IPs share quota, different /64s do not", async () => {
    await consumeRateLimit(request("2001:db8::1"),"tvmaze_search");
    await consumeRateLimit(request("2001:0db8:0:0::ff"),"tvmaze_search");
    await consumeRateLimit(request("2001:db8:0:1::1"),"tvmaze_search");
    expect(envelope(0).subjects).toEqual(envelope(1).subjects);
    expect(envelope(0).subjects).not.toEqual(envelope(2).subjects);
  });
  it("rotation reserves previous and new key buckets together", async () => {
    vi.stubEnv("RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY", "offline-previous-identity-fixture-key");
    await consumeRateLimit(request(),"tvmaze_search");
    const subjects = envelope().subjects;
    expect(subjects.length).toBe(identityEpochs(Date.now()).length*2);
    expect(new Set(subjects.map((s: {digest:string})=>s.digest)).size).toBe(subjects.length);
  });
});

describe("bounded transport, failure and routes", () => {
  it.each([["rate_limited",429,"60"],["rate_limit_unavailable",503,"5"]] as const)("internal guard %s preserves stable HTTP mapping",async(code,status,wait)=>{
    const response=safeSocialRouteError(supabaseApplicationError({message:code,details:"PRIVATE_SQL_CANARY"}));
    expect(response.status).toBe(status);expect(await response.json()).toEqual({code});expect(response.headers.get("retry-after")).toBe(wait);
  });
  it.each(["RATE_LIMIT_IDENTITY_HMAC_KEY","RATE_LIMIT_RPC_SIGNING_KEY","RATE_LIMIT_RPC_KEY_VERSION","RATE_LIMIT_RPC_AUDIENCE"])("missing %s fails closed before RPC", async (name) => {
    vi.stubEnv(name, ""); expect(await consumeRateLimit(request(),"tvmaze_search")).toMatchObject({allowed:false,source:"unavailable"});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("anonymous unresolved IP and unknown policy never call DB", async () => {
    expect(await consumeRateLimit(request("malformed"),"tvmaze_search")).toMatchObject({source:"unavailable"});
    expect(await consumeRateLimit(request(),"caller_policy" as never)).toMatchObject({source:"unavailable"});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["capacity","replay"])("maps %s to stable unavailability", async reason => {
    mocks.abortSignal.mockResolvedValue({data:{allowed:false,reason,retry_after_seconds:5},error:null});
    const response=rateLimitResponse(await consumeRateLimit(request(),"tvmaze_search"))!;
    expect(response.status).toBe(503); expect(await response.json()).toEqual({code:"rate_limit_unavailable"});
  });
  it("deadline never retries uncertain consume or exposes error/envelope", async () => {
    vi.useFakeTimers(); mocks.abortSignal.mockReturnValue(new Promise(()=>{}));
    const pending=consumeRateLimit(request(),"tvmaze_search");
    await vi.advanceTimersByTimeAsync(751);
    expect(await pending).toMatchObject({source:"unavailable"}); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("slow auth cannot start a late reservation", async () => {
    vi.useFakeTimers(); mocks.getUser.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({data:{user:{id:userId}},error:null}),1000)));
    const pending=consumeRateLimit(request(),"tvmaze_search"); await vi.advanceTimersByTimeAsync(751);
    expect(await pending).toMatchObject({source:"unavailable"}); await vi.advanceTimersByTimeAsync(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([tvmaze,openlibrary])("admitted search works; denied or unavailable starts no upstream",async route=>{
    const fetcher=vi.fn(async()=>Response.json(route===tvmaze?[{show:{id:1,name:"Show"}}]:{docs:[],numFound:0}));vi.stubGlobal("fetch",fetcher);
    expect((await route(request())).status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();mocks.abortSignal.mockResolvedValue({data:{allowed:false,reason:"limited",retry_after_seconds:2},error:null});
    const exhausted=await route(request());expect(exhausted.status).toBe(429);expect(exhausted.headers.get("retry-after")).toBe("2");expect(await exhausted.json()).toEqual({code:"rate_limited"});
    mocks.abortSignal.mockResolvedValue({data:null,error:{message:"PRIVATE_SQL_CANARY"}});
    const failed=await route(request()); expect(failed.status).toBe(503);expect(await failed.json()).toEqual({code:"rate_limit_unavailable"});expect(fetcher).not.toHaveBeenCalled();
  });
  it("TVMaze details reserve exactly two upstream calls",async()=>{
    vi.stubGlobal("fetch",vi.fn(async(input)=>String(input).endsWith("episodes")?Response.json([]):Response.json({id:1,name:"show"})));
    expect((await details(new NextRequest("https://app.invalid/api/tvmaze/details?id=1",{headers:{"x-real-ip":"192.0.2.1"}}))).status).toBe(200);
    expect(envelope()).toMatchObject({policy_id:"tvmaze_details",cost:2});
  });
  it("auth write denied by limiter has no domain side effect",async()=>{
    mocks.getUser.mockResolvedValue({data:{user:{id:userId}},error:null});
    mocks.abortSignal.mockResolvedValue({data:{allowed:false,reason:"limited",retry_after_seconds:6},error:null});
    const response=await comments(new Request("https://app.invalid/api/social/comments",{method:"POST",headers:{origin:"https://app.invalid","content-type":"application/json"},body:JSON.stringify({owner:userId})}));
    expect(response.status).toBe(429);expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(["consume_application_rate_limit_v1"]);
    expect(envelope().identity_class).toBe("user");
  });
  it("deterministic-only outage permits bounded best-effort smoothing",async()=>{
    mocks.abortSignal.mockResolvedValue({data:null,error:{message:"offline"}});
    for(let i=0;i<30;i++) expect(await consumeRateLimit(request(),"interpret")).toMatchObject({allowed:true,source:"local_smoothing"});
    expect(await consumeRateLimit(request(),"interpret")).toMatchObject({allowed:false,source:"local_smoothing"});
    expect(await consumeRateLimit(request(),"funded_ai")).toMatchObject({allowed:false,source:"unavailable"});
  });
  it("upstream 429 signs shared cooldown and bounds unsafe headers",async()=>{
    const fetcher=vi.fn(async()=>new Response(null,{status:429,headers:{"Retry-After":"12"}}));vi.stubGlobal("fetch",fetcher);
    mocks.abortSignal.mockResolvedValueOnce({data:{allowed:true,reason:"allowed",retry_after_seconds:0},error:null}).mockResolvedValueOnce({data:{allowed:true,reason:"allowed",retry_after_seconds:30},error:null});
    const response=await tvmaze(request());expect(response.status).toBe(429);expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.rpc.mock.calls[1][0]).toBe("report_provider_cooldown_v1");expect(envelope(1).cooldown).toBe(12);
    expect(providerRetryAfter("not-a-date")).toBe(30);expect(providerRetryAfter("99999999999999")).toBe(86400);
    expect(providerRetryAfter("Thu, 01 Jan 1970 00:00:10 GMT",0)).toBe(10);
  });
  it("cooldown failure returns unavailable rather than silently losing shared backoff",async()=>{
    mocks.abortSignal.mockResolvedValue({data:null,error:{message:"offline"}});
    expect((await reportProviderCooldown(request(),"tvmaze_search",new Response(null,{status:429})))?.status).toBe(503);
  });
  it("Open Library 429 reports bounded shared cooldown and the next search cannot fetch", async () => {
    const fetcher = vi.fn(async () => new Response("raw private error", { status: 429, headers: { "Retry-After": "99999999999999" } }));
    vi.stubGlobal("fetch", fetcher);
    mocks.abortSignal.mockResolvedValueOnce({ data: { allowed: true, reason: "allowed", retry_after_seconds: 0 }, error: null })
      .mockResolvedValueOnce({ data: { allowed: false, reason: "limited", retry_after_seconds: 86400 }, error: null })
      .mockResolvedValue({ data: { allowed: false, reason: "limited", retry_after_seconds: 86400 }, error: null });
    const response = await openlibrary(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("86400");
    expect(await response.json()).toEqual({ code: "rate_limited" });
    expect(mocks.rpc.mock.calls[1][0]).toBe("report_provider_cooldown_v1");
    expect(envelope(1)).toMatchObject({ policy_id: "openlibrary_search", operation: "cooldown", cooldown: 86400 });
    expect((await openlibrary(request())).status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(envelope(2)).toMatchObject({ policy_id: "openlibrary_search", operation: "consume" });
  });
});

describe("offline SQL security contract (not live ACL/atomicity proof)",()=>{
  const sql=readFileSync("supabase/migrations/20261004120000_application_rate_limit_v1.sql","utf8");
  it("private state is bounded, indexed, RLS-enabled and inaccessible to clients",()=>{
    for(const table of ["policies","buckets","request_receipts","capacity","global_state","secret_refs"])expect(sql).toContain(`alter table private_rate_limit.${table} enable row level security`);
    expect(sql).toContain("revoke all on all tables in schema private_rate_limit from public,anon,authenticated");
    expect(sql).toContain("primary key(policy_id,subject_digest,epoch)");expect(sql).toContain("rate_limit_buckets_expiry");expect(sql).toContain("rate_limit_receipts_expiry");
    expect(sql).toContain("live_rows+v_needed>hard_cap");expect(sql).toContain("nonce uuid primary key");
    expect(sql).not.toMatch(/\b(raw_ip|user_id|email)\s+(text|uuid|inet)|service_role|execute\s+format\s*\(/i);
  });
  it("exact proof is required before writes; bounded allowlist prevents limit/window overrides",()=>{
    expect(sql).toContain("octet_length(p_envelope)>2048");expect(sql).toContain("extensions.hmac(convert_to(p_envelope,'UTF8')");
    expect(sql).toContain("e:=private_rate_limit.verify_v1(p_envelope,p_signature_hex,'consume')");
    expect(sql.indexOf("if e is null then raise exception")).toBeLessThan(sql.indexOf("return private_rate_limit.reserve_v1(e->>"));
    expect(sql).toContain("cost=(e->>'cost')::integer");expect(sql).toContain("not between 1 and 10");expect(sql).toContain("reason','replay'");
    expect(sql).not.toMatch(/p_limit|p_window|p_subject_hash/);expect(sql).toContain("grant execute on function public.consume_application_rate_limit_v1");
    for(const policy of Object.keys(RATE_LIMIT_POLICIES))expect(sql).toContain(`('${policy}'`);
  });
  it("new functions use fixed safe search paths and least-privilege owner, no dynamic SQL",()=>{
    const definitions=[...sql.matchAll(/create(?: or replace)? function[\s\S]*?\$\$;/gi)].map(m=>m[0]);
    expect(definitions.length).toBe(13);
    for(const definition of definitions)expect(definition).toContain("set search_path=''");
    expect(sql).toContain("nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls");
    expect(sql).toContain("alter function public.consume_application_rate_limit_v1(text,text) owner to media_tracker_limiter");
    expect(sql).not.toMatch(/grant.*vault\.decrypted_secrets.*media_tracker_limiter/i);
  });
  it("transaction lock guards missing-row admission and all-or-none debit; cleanup bounded",()=>{
    expect(sql).toContain("pg_advisory_xact_lock(207402,1)");expect(sql).toContain("on conflict do nothing");expect(sql).toContain("for update");
    expect(sql.indexOf("if v_wait>0 then return")).toBeLessThan(sql.indexOf("-- Debit only after EVERY budget"));
    expect(sql).toContain("least(500,greatest(0,coalesce(p_batch,0)))");expect(sql).toContain("live_rows=live_rows-v_n");
    expect(sql).toContain("interval '60 seconds'");expect(sql).toContain("interval '16 minutes'");
    expect(sql).not.toMatch(/create extension|cron\.schedule|pg_advisory_lock\(/i);
  });
  it("direct mutators derive auth.uid quota within their existing business transaction",()=>{
    expect(sql).toContain("v_user uuid:=auth.uid()");expect(sql.match(/perform private_rate_limit.consume_authenticated_v1\('social_domain'\)/g)).toHaveLength(6);
    expect(sql).toContain("count(*) from public.social_activity_comments");expect(sql).toContain("count(*) from public.social_recommendations");
    expect(sql).toContain("revoke all on all functions in schema private_rate_limit from public,anon,authenticated");
  });
});
