import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/status";
import { enforceRateLimit } from "./request-security";
import { canonicalRateLimitIp, identityEpochs, subjectDigest, trustedRateLimitIp, type LimiterIdentity } from "./rate-limit-identity";

// Policy values belong to SQL. HTTP input never chooses policy, cost, limits or windows.
export const RATE_LIMIT_POLICIES = {
  "tvmaze_search": { scope: "search", limit: 60, provider: "tvmaze", cost: 1 },
  "openlibrary_search": { scope: "search", limit: 60, provider: "openlibrary", cost: 1 },
  "tvmaze_details": { scope: "provider_read", limit: 120, provider: "tvmaze", cost: 2 },
  "tvmaze_calendar": { scope: "provider_read", limit: 120, provider: "tvmaze", cost: 1 },
  "social_read": { scope: "social_read", limit: 60, provider: null, cost: 0 },
  "social_write": { scope: "social_write", limit: 30, provider: null, cost: 0 },
  "asset_write": { scope: "asset_write", limit: 6, provider: null, cost: 0 },
  "xp_sync": { scope: "xp_sync", limit: 6, provider: null, cost: 0 },
  "settings_write": { scope: "settings_write", limit: 30, provider: null, cost: 0 },
  "interpret": { scope: "interpret", limit: 30, provider: null, cost: 0 },
  "recommend": { scope: "recommend", limit: 20, provider: null, cost: 0 },
  "funded_ai": { scope: "funded_ai", limit: 20, provider: null, cost: 0 },
  // SQL policies remain disabled. These guards prevent accidental env-only enablement.
  "anilist_search": { scope: "search", limit: 60, provider: "anilist", cost: 1 },
  "tmdb_search": { scope: "search", limit: 60, provider: "tmdb", cost: 1 },
  "anilist_details": { scope: "provider_read", limit: 120, provider: "anilist", cost: 1 },
  "tmdb_details": { scope: "provider_read", limit: 120, provider: "tmdb", cost: 1 },
  "anilist_calendar": { scope: "provider_read", limit: 120, provider: "anilist", cost: 1 },
  "tmdb_calendar": { scope: "provider_read", limit: 120, provider: "tmdb", cost: 1 },
} as const;
export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;
export type RateLimitDecision = { allowed: boolean; retryAfterSeconds?: number; remaining?: number; source: "distributed" | "local_smoothing" | "unavailable" };
const unavailable = (): RateLimitDecision => ({ allowed: false, retryAfterSeconds: 5, source: "unavailable" });
const localSmoothingKey = randomBytes(32).toString("hex"); // RAM only, never DB authority/provisioning.

export function rateLimitResponse(decision: RateLimitDecision): Response | null {
  if (decision.allowed) return null;
  return Response.json({ code: decision.source === "unavailable" ? "rate_limit_unavailable" : "rate_limited" }, {
    status: decision.source === "unavailable" ? 503 : 429,
    headers: { "Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds ?? 5) },
  });
}

function configuration() {
  const identityKey = process.env.RATE_LIMIT_IDENTITY_HMAC_KEY;
  const signingKey = process.env.RATE_LIMIT_RPC_SIGNING_KEY;
  const keyVersion = process.env.RATE_LIMIT_RPC_KEY_VERSION;
  const audience = process.env.RATE_LIMIT_RPC_AUDIENCE;
  if (!identityKey || identityKey.length < 32 || !signingKey || signingKey.length < 32 || identityKey === signingKey
    || !keyVersion || !/^[a-zA-Z0-9_-]{1,32}$/.test(keyVersion) || !audience || !/^[a-zA-Z0-9:_-]{1,96}$/.test(audience)) return null;
  const previousKey = process.env.RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY;
  if (previousKey && (previousKey.length < 32 || previousKey === signingKey || previousKey === identityKey)) return null;
  return { identityKey, previousKey, signingKey, keyVersion, audience };
}

export function signRateLimitEnvelope(envelope: object, key: string) {
  const text = JSON.stringify(envelope);
  if (Buffer.byteLength(text) > 2048) throw new Error("rate_limit_envelope_invalid");
  return { p_envelope: text, p_signature_hex: createHmac("sha256", key).update(text).digest("hex") };
}

async function signedRpc(operation: "consume" | "cooldown", policy: RateLimitPolicy, identity: LimiterIdentity, ip: string | null, cooldown = 0, deadlineMs = 750): Promise<RateLimitDecision> {
  const config = configuration();
  const env = getSupabaseEnv();
  if (!config || !env) return unavailable();
  const now = Date.now();
  const epochs = identityEpochs(now);
  const keys = config.previousKey ? [config.previousKey, config.identityKey] : [config.identityKey];
  const digests = keys.flatMap((key) => epochs.map((epoch) => ({ epoch, digest: subjectDigest(key, config.audience, RATE_LIMIT_POLICIES[policy].scope, epoch, identity) })));
  const ipDigests = ip ? keys.flatMap((key) => epochs.map((epoch) => ({ epoch, digest: subjectDigest(key, config.audience, "ingress", epoch, { kind: "ip", value: ip }) }))) : [];
  const payload = signRateLimitEnvelope({ version: 1, operation, audience: config.audience, key_version: config.keyVersion,
    policy_id: policy, identity_class: identity.kind, subjects: digests, ingress: ipDigests,
    nonce: randomUUID(), issued_at: Math.floor(now / 1000), expires_at: Math.floor(now / 1000) + 10,
    cost: RATE_LIMIT_POLICIES[policy].cost, cooldown }, config.signingKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, deadlineMs));
  try {
    // Independent public-key client: limiter transport never refreshes a cookie session or retries.
    const client = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.rpc(operation === "consume" ? "consume_application_rate_limit_v1" : "report_provider_cooldown_v1", payload).abortSignal(controller.signal);
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return unavailable();
    const result = data as Record<string, unknown>;
    if (typeof result.allowed !== "boolean" || !["allowed", "limited", "capacity", "replay"].includes(String(result.reason))) return unavailable();
    if (result.allowed !== (result.reason === "allowed")) return unavailable();
    if (result.reason === "capacity" || result.reason === "replay") return unavailable();
    const wait = result.retry_after_seconds;
    if (!Number.isInteger(wait) || Number(wait) < 0 || Number(wait) > 86400 || (!result.allowed && Number(wait) < 1)) return unavailable();
    return { allowed: result.allowed, retryAfterSeconds: Number(wait), source: "distributed" };
  } catch { return unavailable(); }
  finally { clearTimeout(timer); }
}

async function consumeWithinDeadline(request: Request, policy: RateLimitPolicy, deadline: number): Promise<RateLimitDecision> {
  if (!Object.hasOwn(RATE_LIMIT_POLICIES, policy)) return unavailable();
  const ip = trustedRateLimitIp(request);
  let identity: LimiterIdentity | null = null;
  try {
    const client = await getSupabaseServerClient();
    if (client) {
      const { data, error } = await client.auth.getUser();
      if (!error && data.user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.user.id)) identity = { kind: "user", value: data.user.id.toLowerCase() };
    }
  } catch { /* Never use an unverified user ID. */ }
  if (!identity && ip) identity = { kind: "ip", value: ip };
  if (!identity) return unavailable();
  if (performance.now() >= deadline) return unavailable();
  const decision = await signedRpc("consume", policy, identity, ip, 0, deadline - performance.now());
  if (decision.source !== "unavailable" || (policy !== "interpret" && policy !== "recommend")) return decision;
  // Only bounded deterministic library work may fail soft. This is BEST_EFFORT_SMOOTHING.
  const now = Date.now();
  const key = subjectDigest(localSmoothingKey, "local_smoothing", policy, identityEpochs(now).at(-1)!, identity);
  const denied = enforceRateLimit(policy, key, RATE_LIMIT_POLICIES[policy].limit, 60000, now);
  return denied ? { allowed: false, source: denied.status === 503 ? "unavailable" : "local_smoothing", retryAfterSeconds: Number(denied.headers.get("retry-after")) } : { allowed: true, source: "local_smoothing" };
}

export async function consumeRateLimit(request: Request, policy: RateLimitPolicy): Promise<RateLimitDecision> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([consumeWithinDeadline(request, policy, performance.now() + 750),
      new Promise<RateLimitDecision>((resolve) => { timer = setTimeout(() => resolve(unavailable()), 750); })]);
  } finally { clearTimeout(timer); }
}

export async function enforceDistributedRateLimit(request: Request, policy: RateLimitPolicy) {
  return rateLimitResponse(await consumeRateLimit(request, policy));
}

export function providerRetryAfter(value: string | null, now = Date.now()): number {
  if (!value || value.length > 128) return 30;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  // Excessive waits block the provider for the full supported day; ops must recover it.
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, Math.ceil(seconds)) : 30;
}

export async function reportProviderCooldown(request: Request, policy: RateLimitPolicy, response: Response) {
  if (response.status !== 429) return null;
  const wait = providerRetryAfter(response.headers.get("retry-after"));
  const ip = trustedRateLimitIp(request);
  if (!ip) return rateLimitResponse(unavailable());
  const result = await signedRpc("cooldown", policy, { kind: "ip", value: ip }, ip, wait);
  if (result.source === "unavailable") return rateLimitResponse(result);
  return rateLimitResponse({ allowed: false, source: "distributed", retryAfterSeconds: result.retryAfterSeconds || wait });
}

// Explicit test IP adapters use environment configuration, never an HTTP override.
export { canonicalRateLimitIp };
