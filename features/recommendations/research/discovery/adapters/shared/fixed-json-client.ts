import "server-only";

import { boundedResearchRetryAfterMs } from "../../../network/retry-policy";

export type DiscoveryHttpErrorKind =
  | "invalid_request"
  | "aborted"
  | "timeout"
  | "network"
  | "http"
  | "response_invalid"
  | "oversized_response";

export class DiscoveryHttpError extends Error {
  constructor(readonly kind: DiscoveryHttpErrorKind, readonly status?: number) {
    super(`research_discovery_http_${kind}`);
    this.name = "DiscoveryHttpError";
  }
}

export interface FixedJsonDiscoveryResponse {
  status: number;
  body: Uint8Array;
  bytesRead: number;
  durationMs: number;
  retryCount: number;
  rateLimitCount: number;
  requestId?: string;
  statusClass: string;
}

type FetchPort = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function composeAbortSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timeoutFired = false;
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason);
  else parent?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => { timeoutFired = true; controller.abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => { clearTimeout(timer); parent?.removeEventListener("abort", onParentAbort); },
    timedOut: () => timeoutFired,
  };
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new DiscoveryHttpError("oversized_response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function boundedRequestId(value: string | null): string | undefined {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

export class FixedJsonDiscoveryClient {
  constructor(
    private readonly endpoint: string,
    private readonly requestIdHeader: string,
    private readonly fetchPort: FetchPort = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {}

  async request(input: {
    apiKey: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxResponseBytes?: number;
    extraHeaders?: Readonly<Record<string, string>>;
  }): Promise<FixedJsonDiscoveryResponse> {
    if (!input.apiKey || input.apiKey.length > 512 || /[\r\n\0]/.test(input.apiKey)) throw new DiscoveryHttpError("invalid_request");
    const timeoutMs = input.timeoutMs ?? 5_000;
    const maxResponseBytes = input.maxResponseBytes ?? 256 * 1024;
    const startedAt = this.now();
    const deadline = startedAt + timeoutMs;
    let retryCount = 0;
    let rateLimitCount = 0;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const remaining = deadline - this.now();
      if (remaining <= 0) throw new DiscoveryHttpError("timeout");
      const abort = composeAbortSignal(input.signal, remaining);
      let response: Response;
      try {
        response = await this.fetchPort(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...input.extraHeaders,
          },
          body: JSON.stringify(input.body),
          signal: abort.signal,
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        const timedOut = abort.timedOut();
        abort.cleanup();
        if (input.signal?.aborted) throw new DiscoveryHttpError("aborted");
        if (timedOut) throw new DiscoveryHttpError("timeout");
        if (attempt < 2 && this.now() < deadline) { retryCount += 1; continue; }
        throw new DiscoveryHttpError("network");
      }
      abort.cleanup();
      if (response.status === 429) rateLimitCount += 1;
      if (retryableStatus(response.status) && attempt < 2) {
        await response.body?.cancel().catch(() => undefined);
        const delay = Math.min(
          boundedResearchRetryAfterMs(response.headers.get("retry-after") ?? undefined),
          Math.max(0, deadline - this.now()),
        );
        if (delay > 0) await this.sleep(delay);
        retryCount += 1;
        continue;
      }
      if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
        throw new DiscoveryHttpError("response_invalid", response.status);
      }
      const body = await readBoundedResponse(response, maxResponseBytes);
      if (!response.ok) throw new DiscoveryHttpError("http", response.status);
      return {
        status: response.status,
        body,
        bytesRead: body.byteLength,
        durationMs: Math.max(0, this.now() - startedAt),
        retryCount,
        rateLimitCount,
        requestId: boundedRequestId(response.headers.get(this.requestIdHeader)),
        statusClass: `${Math.floor(response.status / 100)}xx`,
      };
    }
    throw new DiscoveryHttpError("network");
  }
}
