import "server-only";

import { boundedResearchRetryAfterMs } from "../../../network/retry-policy";
import { boundedOpenAiRequestId, openAiStatusClass } from "./telemetry";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses" as const;
export const OPENAI_DISCOVERY_TIMEOUT_MS = 5_000;
export const OPENAI_DISCOVERY_MAX_RESPONSE_BYTES = 256 * 1024;

export type OpenAiDiscoveryErrorKind = "invalid_request" | "aborted" | "timeout" | "network" | "http" | "response_invalid" | "oversized_response";

export class OpenAiDiscoveryError extends Error {
  constructor(
    readonly kind: OpenAiDiscoveryErrorKind,
    readonly status?: number,
  ) {
    super(`openai_web_discovery_${kind}`);
    this.name = "OpenAiDiscoveryError";
  }
}

export interface OpenAiResponsesDiscoveryRequest {
  apiKey: string;
  model: string;
  input: string;
  allowedDomains: readonly string[];
  requestId: string;
  signal?: AbortSignal;
}

export interface OpenAiResponsesDiscoveryResponse {
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

function composeAbortSignal(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
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
        throw new OpenAiDiscoveryError("oversized_response");
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

function contentTypeAllowed(response: Response): boolean {
  return response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function validOpenAiDiscoveryRequest(input: OpenAiResponsesDiscoveryRequest): boolean {
  const domains = input.allowedDomains;
  return input.apiKey.length > 0 && input.apiKey.length <= 512 && !/[\r\n\0]/.test(input.apiKey)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(input.model)
    && input.input.length > 0 && input.input.length <= 8_000 && !/\0/.test(input.input)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(input.requestId)
    && domains.length > 0 && domains.length <= 100
    && new Set(domains).size === domains.length
    && domains.every((domain) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain));
}

export class OpenAiResponsesClient {
  constructor(
    private readonly fetchPort: FetchPort = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {}

  async request(input: OpenAiResponsesDiscoveryRequest): Promise<OpenAiResponsesDiscoveryResponse> {
    if (!validOpenAiDiscoveryRequest(input)) throw new OpenAiDiscoveryError("invalid_request");
    const startedAt = this.now();
    const deadline = startedAt + OPENAI_DISCOVERY_TIMEOUT_MS;
    let retryCount = 0;
    let rateLimitCount = 0;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const remaining = deadline - this.now();
      if (remaining <= 0) throw new OpenAiDiscoveryError("timeout");
      const abort = composeAbortSignal(input.signal, remaining);
      let response: Response;
      try {
        response = await this.fetchPort(OPENAI_RESPONSES_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            store: false,
            input: input.input,
            tools: [{
              type: "web_search",
              filters: { allowed_domains: [...input.allowedDomains] },
              search_context_size: "low",
            }],
            tool_choice: "required",
            include: ["web_search_call.action.sources"],
          }),
          signal: abort.signal,
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        const timedOut = abort.timedOut();
        abort.cleanup();
        if (input.signal?.aborted) throw new OpenAiDiscoveryError("aborted");
        if (timedOut) throw new OpenAiDiscoveryError("timeout");
        if (attempt < 2 && this.now() < deadline) { retryCount += 1; continue; }
        throw new OpenAiDiscoveryError("network");
      }
      abort.cleanup();
      if (response.status === 429) rateLimitCount += 1;
      if (retryableStatus(response.status) && attempt < 2) {
        await response.body?.cancel().catch(() => undefined);
        const delay = Math.min(boundedResearchRetryAfterMs(response.headers.get("retry-after") ?? undefined), Math.max(0, deadline - this.now()));
        if (delay > 0) await this.sleep(delay);
        retryCount += 1;
        continue;
      }
      if (!contentTypeAllowed(response)) throw new OpenAiDiscoveryError("response_invalid", response.status);
      const body = await readBoundedResponse(response, OPENAI_DISCOVERY_MAX_RESPONSE_BYTES);
      if (!response.ok) throw new OpenAiDiscoveryError("http", response.status);
      return {
        status: response.status,
        body,
        bytesRead: body.byteLength,
        durationMs: Math.max(0, this.now() - startedAt),
        retryCount,
        rateLimitCount,
        requestId: boundedOpenAiRequestId(response.headers.get("x-request-id")),
        statusClass: openAiStatusClass(response.status),
      };
    }
    throw new OpenAiDiscoveryError("network");
  }
}
