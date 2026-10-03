/** Application telemetry only. Unknown keys and values are dropped, never stringified. */
export type SafeLogEvent = {
  event: "route_error" | "provider_error" | "cloud_error" | "client_error" | "storage_error" | "social_parse_skipped";
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  latencyMs?: number;
  provider?: string;
  errorCode?: "request_rejected" | "unauthorized" | "forbidden" | "rate_limited" | "upstream_error" | "internal_error" | "operation_failed";
  deploymentSha?: string;
  schemaStage?: "D2C1" | "v1";
  rateLimited?: boolean;
};

const EVENTS = new Set(["route_error", "provider_error", "cloud_error", "client_error", "storage_error", "social_parse_skipped"]);
const CODES = new Set(["request_rejected", "unauthorized", "forbidden", "rate_limited", "upstream_error", "internal_error", "operation_failed"]);
const PROVIDERS = new Set(["tvmaze", "openlibrary", "tmdb", "anilist", "omdb", "openai", "groq", "gemini", "openrouter", "supabase"]);
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const ROUTES = new Set([
  "/api/ai/interpret", "/api/ai/recommend", "/api/anilist/details", "/api/anilist/search",
  "/api/calendar/anilist", "/api/calendar/tmdb", "/api/calendar/tvmaze",
  "/api/cloud/rollout", "/api/ai/capabilities", "/api/providers/capabilities", "/api/social/profile/[username]", "/api/social/profile/hero", "/api/social/profile/summary", "/api/dev/recommendation-annotation", "/api/omdb/details", "/api/omdb/search",
  "/api/openlibrary/search", "/api/personalization/themes/sync", "/api/tmdb/details", "/api/tmdb/search",
  "/api/tvmaze/details", "/api/tvmaze/search", "/api/xp",
  ...["assets", "comments", "connections", "feed", "notifications", "people", "preferences", "profile", "reactions", "recommendations", "relationships", "reports"].map((name) => `/api/social/${name}`),
]);

export function safeLog(metadata: SafeLogEvent): void {
  try {
    // Do not enumerate input, invoke getters/toJSON, or descend into objects.
    const read = (key: string): unknown => Object.getOwnPropertyDescriptor(metadata, key)?.value;
    const event = read("event");
    if (typeof event !== "string" || !EVENTS.has(event)) return;
    const output: Record<string, string | number | boolean> = { event, timestamp: new Date().toISOString() };
    for (const [key, values] of [["route", ROUTES], ["method", METHODS], ["provider", PROVIDERS], ["errorCode", CODES], ["schemaStage", new Set(["D2C1", "v1"])]] as const) {
      const value = read(key);
      if (typeof value === "string" && values.has(value)) output[key] = value;
    }
    const requestId = read("requestId");
    if (typeof requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) output.requestId = requestId;
    const sha = read("deploymentSha");
    if (typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha)) output.deploymentSha = sha;
    const status = read("status");
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) output.status = status;
    const latency = read("latencyMs");
    if (typeof latency === "number" && Number.isFinite(latency) && latency >= 0) output.latencyMs = Math.min(Math.round(latency), 3_600_000);
    const rateLimited = read("rateLimited");
    if (typeof rateLimited === "boolean") output.rateLimited = rateLimited;
    console.warn(JSON.stringify(output));
  } catch {
    // Telemetry failure must never change application behavior.
  }
}
