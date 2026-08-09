import "server-only";

import { boundedResearchRetryAfterMs } from "../../../network/retry-policy";

export type ExtractionHttpErrorKind = "invalid_request" | "aborted" | "timeout" | "network" | "oversized_response" | "content_type" | "http" | "response_invalid";
export class ExtractionHttpError extends Error { constructor(readonly kind: ExtractionHttpErrorKind, readonly status?: number) { super(`grounded_extraction_http_${kind}`); } }
export interface FixedExtractionJsonResponse { body: unknown; status: number; bytesRead: number; durationMs: number; retryCount: number; rateLimitCount: number; requestId?: string }

function abortSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false;
  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason); else parent?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent?.removeEventListener("abort", onAbort); }, timedOut: () => timedOut };
}
async function readBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!value) continue; total += value.byteLength; if (total > maxBytes) { await reader.cancel().catch(() => undefined); throw new ExtractionHttpError("oversized_response", response.status); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; } return output;
}
function retryable(status: number) { return status === 429 || status === 502 || status === 503 || status === 504; }
function boundedRequestId(value: string | null): string | undefined { return value && /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value : undefined; }

export class FixedExtractionJsonClient {
  constructor(private readonly endpoint: string, private readonly requestIdHeader: string, private readonly timeoutMs: number, private readonly maxResponseBytes: number, private readonly fetchPort: typeof fetch = fetch, private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), private readonly now: () => number = Date.now) {}
  async request(input: { apiKey: string; body: Readonly<Record<string, unknown>>; headers?: Readonly<Record<string, string>>; signal?: AbortSignal }): Promise<FixedExtractionJsonResponse> {
    if (!input.apiKey || input.apiKey.length > 512 || /[\r\n\0]/.test(input.apiKey)) throw new ExtractionHttpError("invalid_request");
    const started = this.now(); const deadline = started + this.timeoutMs; let retryCount = 0; let rateLimitCount = 0;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const remaining = deadline - this.now(); if (remaining <= 0) throw new ExtractionHttpError("timeout");
      const abort = abortSignal(input.signal, remaining); let response: Response;
      try { response = await this.fetchPort(this.endpoint, { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json", Accept: "application/json", ...input.headers }, body: JSON.stringify(input.body), signal: abort.signal, redirect: "error", cache: "no-store" }); }
      catch { const timeout = abort.timedOut(); abort.cleanup(); if (input.signal?.aborted) throw new ExtractionHttpError("aborted"); if (timeout) throw new ExtractionHttpError("timeout"); if (attempt < 2) { retryCount += 1; continue; } throw new ExtractionHttpError("network"); }
      abort.cleanup(); if (response.status === 429) rateLimitCount += 1;
      if (retryable(response.status) && attempt < 2) { await response.body?.cancel().catch(() => undefined); const delay = Math.min(boundedResearchRetryAfterMs(response.headers.get("retry-after") ?? undefined), Math.max(0, deadline - this.now())); if (delay > 0) await this.sleep(delay); retryCount += 1; continue; }
      if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new ExtractionHttpError("content_type", response.status);
      const bytes = await readBody(response, this.maxResponseBytes); if (!response.ok) throw new ExtractionHttpError("http", response.status);
      let body: unknown; try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new ExtractionHttpError("response_invalid", response.status); }
      return { body, status: response.status, bytesRead: bytes.byteLength, durationMs: Math.max(0, this.now() - started), retryCount, rateLimitCount, requestId: boundedRequestId(response.headers.get(this.requestIdHeader)) };
    }
    throw new ExtractionHttpError("network");
  }
}

