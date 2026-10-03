import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { safeLog, type SafeLogEvent } from "@/lib/security/safe-logging";

const correlation = new AsyncLocalStorage<{ requestId: string; route: string; method: string }>();

export function safeRouteLog(metadata: SafeLogEvent): void {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(metadata);
    for (const [key, value] of Object.entries(correlation.getStore() ?? {})) {
      descriptors[key] = { value, enumerable: true };
    }
    safeLog(Object.defineProperties({}, descriptors) as SafeLogEvent);
  } catch { /* Logging never changes request behavior. */ }
}

/** Code-owned route template; never takes headers, URL, body or the thrown value. */
export async function runSafeApiRoute(route: string, method: string, handler: () => Promise<Response>): Promise<Response> {
  const context = { requestId: randomUUID(), route, method };
  return correlation.run(context, async () => {
    const started = performance.now();
    let response: Response;
    try {
      response = await handler();
    } catch {
      response = Response.json({ error: "internal_error" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
    }
    response.headers.set("X-Request-Id", context.requestId);
    if (response.status >= 400) {
      const status = response.status;
      safeRouteLog({ event: "route_error", status, latencyMs: performance.now() - started,
        errorCode: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 429 ? "rate_limited" : status === 502 || status === 504 ? "upstream_error" : status >= 500 ? "internal_error" : "request_rejected",
        rateLimited: status === 429 });
    }
    return response;
  });
}
