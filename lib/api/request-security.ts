import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const API_NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
export const SEARCH_QUERY_MAX_LENGTH = 200;
export const SEARCH_REQUEST_MAX_BYTES = 4_096;
export const AI_REQUEST_MAX_BYTES = 1_048_576;
export const UPSTREAM_TIMEOUT_MS = 8_000;

type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse };

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function apiError(code: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { code },
    { status, headers: { ...API_NO_STORE_HEADERS, ...headers } },
  );
}

export function validateSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    if (new URL(origin).origin === new URL(request.url).origin) return null;
  } catch {
    // Invalid origins fail closed.
  }
  return apiError("invalid_origin", 403);
}

export async function readStrictJsonObject(
  request: Request,
  allowedFields: ReadonlySet<string>,
  maxBytes: number,
): Promise<JsonObjectResult> {
  const originError = validateSameOrigin(request);
  if (originError) return { ok: false, response: originError };

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, response: apiError("unsupported_content_type", 415) };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, response: apiError("request_too_large", 413) };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: apiError("invalid_json", 400) };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, response: apiError("request_too_large", 413) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError("invalid_json", 400) };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, response: apiError("invalid_payload", 400) };
  }
  const value = parsed as Record<string, unknown>;
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    return { ok: false, response: apiError("unknown_field", 400) };
  }
  return { ok: true, value };
}

export function parseSearchQuery(value: unknown, required = true) {
  if (value === undefined && !required) return { ok: true as const, value: "" };
  if (typeof value !== "string") return { ok: false as const };
  const query = value.trim();
  if (!query || query.length > SEARCH_QUERY_MAX_LENGTH) return { ok: false as const };
  return { ok: true as const, value: query };
}

function fallbackIpKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = forwarded || realIp;
  return candidate && /^[0-9a-f:.]{3,64}$/i.test(candidate) ? `ip:${candidate}` : "ip:unknown";
}

export async function resolveRateLimitIdentity(request: Request) {
  try {
    const client = await getSupabaseServerClient();
    if (client) {
      const { data, error } = await client.auth.getUser();
      if (!error && data.user?.id) return `user:${data.user.id}`;
    }
  } catch {
    // Anonymous routes retain a bounded IP fallback when auth is unavailable.
  }
  return fallbackIpKey(request);
}

export function enforceRateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): NextResponse | null {
  const key = `${bucket}:${identity}`;
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (current.count >= limit) {
    return apiError("rate_limited", 429, {
      "Retry-After": String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))),
    });
  }
  current.count += 1;
  return null;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = UPSTREAM_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

export function noStoreJson(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...API_NO_STORE_HEADERS, ...init.headers },
  });
}

export function resetRateLimitsForTests() {
  rateLimitBuckets.clear();
}
