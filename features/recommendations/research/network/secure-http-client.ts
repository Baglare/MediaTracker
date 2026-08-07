import "server-only";

import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";
import { NodeResearchDnsResolver, resolvePinnedResearchAddress } from "./dns-policy";
import { canonicalResearchRequestUrl, RESEARCH_MAX_REDIRECTS, RESEARCH_REDIRECT_STATUSES, resolveResearchRedirect } from "./redirect-policy";
import { assertResearchContentType, readBoundedResearchBody } from "./response-limits";
import { boundedResearchRetryAfterMs, shouldRetryResearchStatus } from "./retry-policy";
import { emptyResearchNetworkTelemetry, type ResearchNetworkTelemetry } from "./telemetry";
import type {
  ResearchDnsResolver,
  ResearchHttpsTransport,
  ResearchTransportRequest,
  ResearchTransportResponse,
  SecureResearchHttpClient,
  SecureResearchHttpRequest,
  SecureResearchHttpResponse,
} from "./types";
import { SecureResearchHttpError } from "./types";
import { boundedResearchNetworkErrorCode } from "./types";

const RESPONSE_HEADER_ALLOWLIST = new Set(["content-type", "content-length", "content-encoding", "etag", "last-modified", "retry-after", "location"]);
const REQUEST_HEADER_KEYS = new Set(["userAgent", "accept", "acceptEncoding", "apiUserAgent"]);
const MAX_FOUNDATION_RESPONSE_BYTES = 1024 * 1024;

function selectedHeaders(headers: IncomingHttpHeaders): Readonly<Record<string, string>> {
  const selected: Record<string, string> = {};
  for (const [key, raw] of Object.entries(headers)) {
    if (!RESPONSE_HEADER_ALLOWLIST.has(key) || raw === undefined) continue;
    selected[key] = Array.isArray(raw) ? raw.join(", ") : raw;
  }
  return selected;
}

function validateHeaderValue(value: string, name: string): void {
  if (!value.trim() || value.length > 512 || /[\r\n\0]/.test(value)) throw new SecureResearchHttpError("invalid_request", `header_${name}_invalid`);
}

function requestHeaders(input: SecureResearchHttpRequest): Readonly<Record<string, string>> {
  const runtimeHeaders = input.headers as unknown as Record<string, unknown>;
  if (Object.keys(runtimeHeaders).some((key) => !REQUEST_HEADER_KEYS.has(key))) throw new SecureResearchHttpError("invalid_request", "arbitrary_header_forbidden");
  validateHeaderValue(input.headers.userAgent, "user_agent");
  validateHeaderValue(input.headers.accept, "accept");
  if (input.headers.apiUserAgent) validateHeaderValue(input.headers.apiUserAgent, "api_user_agent");
  return {
    "user-agent": input.headers.userAgent,
    accept: input.headers.accept,
    ...(input.headers.acceptEncoding ? { "accept-encoding": input.headers.acceptEncoding } : {}),
    ...(input.headers.apiUserAgent ? { "api-user-agent": input.headers.apiUserAgent } : {}),
  };
}

export class NodeResearchHttpsTransport implements ResearchHttpsTransport {
  async request(input: ResearchTransportRequest): Promise<ResearchTransportResponse> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = httpsRequest(input.url, createPinnedHttpsRequestOptions(input), async (response: IncomingMessage) => {
        try {
          const headers = selectedHeaders(response.headers);
          const status = response.statusCode ?? 0;
          if (status >= 300) {
            response.resume();
            settled = true;
            resolve({ status, headers, contentType: headers["content-type"]?.split(";", 1)[0] ?? "", body: new Uint8Array(), bytesRead: 0 });
            return;
          }
          const contentType = assertResearchContentType(headers["content-type"], input.acceptedContentTypes);
          const body = await readBoundedResearchBody({
            stream: response,
            contentEncoding: headers["content-encoding"],
            maxBytes: input.maxResponseBytes,
          });
          settled = true;
          resolve({ status, headers, contentType, ...body });
        } catch (error) {
          settled = true;
          reject(error);
        }
      });
      const abort = () => request.destroy(new SecureResearchHttpError("aborted", "request_aborted"));
      input.signal?.addEventListener("abort", abort, { once: true });
      request.setTimeout(input.timeoutMs, () => request.destroy(new SecureResearchHttpError("timeout", "request_timeout", true)));
      request.once("error", (error) => {
        input.signal?.removeEventListener("abort", abort);
        if (settled) return;
        if (error instanceof SecureResearchHttpError) reject(error);
        else reject(classifyTransportError(error));
      });
      request.once("close", () => input.signal?.removeEventListener("abort", abort));
      request.end();
    });
  }
}

export function createPinnedResearchLookup(pinnedAddress: ResearchTransportRequest["pinnedAddress"]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [pinnedAddress]);
      return;
    }
    callback(null, pinnedAddress.address, pinnedAddress.family);
  };
}

export type PinnedHttpsRequestOptions = RequestOptions & {
  autoSelectFamily: false;
  family: 4 | 6;
};

export function createPinnedHttpsRequestOptions(input: ResearchTransportRequest): PinnedHttpsRequestOptions {
  return {
    method: "GET",
    headers: { ...input.headers, host: input.hostname },
    lookup: createPinnedResearchLookup(input.pinnedAddress),
    family: input.pinnedAddress.family,
    autoSelectFamily: false,
    servername: input.hostname,
    agent: false,
  };
}

function classifyTransportError(error: unknown): SecureResearchHttpError {
  const internalCode = boundedResearchNetworkErrorCode(error);
  if (internalCode === "TLS_CERTIFICATE" || internalCode === "TLS_PROTOCOL") {
    return new SecureResearchHttpError("tls_failed", "tls_failed", false, internalCode);
  }
  if (["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH", "EPIPE"].includes(internalCode)) {
    return new SecureResearchHttpError("connect_failed", "connect_failed", true, internalCode);
  }
  return new SecureResearchHttpError("http_failed", "http_failed", true, internalCode);
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly capacity: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.capacity) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    return () => {
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }
}

export class SecureResearchHttpClientImpl implements SecureResearchHttpClient {
  private readonly inFlight = new Map<string, Promise<SecureResearchHttpResponse>>();
  private readonly globalSemaphore = new Semaphore(2);
  private readonly hostSemaphores = new Map<string, Semaphore>();
  private readonly telemetry = emptyResearchNetworkTelemetry();

  constructor(
    private readonly resolver: ResearchDnsResolver = new NodeResearchDnsResolver(),
    private readonly transport: ResearchHttpsTransport = new NodeResearchHttpsTransport(),
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly now: () => number = Date.now,
  ) {}

  snapshotTelemetry(): ResearchNetworkTelemetry {
    return { ...this.telemetry };
  }

  async request(input: SecureResearchHttpRequest): Promise<SecureResearchHttpResponse> {
    this.validateInput(input);
    const canonicalUrl = canonicalResearchRequestUrl(input.sourceId, input.url);
    const key = [input.sourceId, canonicalUrl, input.timeoutMs, input.maxResponseBytes, [...input.acceptedContentTypes].sort().join(",")].join("|");
    const active = this.inFlight.get(key);
    if (active) {
      this.telemetry.coalescedRequests += 1;
      return active;
    }
    const pending = this.perform(input, canonicalUrl).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, pending);
    return pending;
  }

  private validateInput(input: SecureResearchHttpRequest): void {
    if ((input.method as string) !== "GET") throw new SecureResearchHttpError("invalid_request", "method_not_allowed");
    if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 8_000) throw new SecureResearchHttpError("invalid_request", "timeout_invalid");
    if (!Number.isInteger(input.maxResponseBytes) || input.maxResponseBytes < 1 || input.maxResponseBytes > MAX_FOUNDATION_RESPONSE_BYTES) throw new SecureResearchHttpError("invalid_request", "response_limit_invalid");
    if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(input.requestId)) throw new SecureResearchHttpError("invalid_request", "request_id_invalid");
    if (input.redirectPolicy.mode !== "manual" || input.redirectPolicy.maxRedirects < 0 || input.redirectPolicy.maxRedirects > RESEARCH_MAX_REDIRECTS) throw new SecureResearchHttpError("invalid_request", "redirect_policy_invalid");
    if (input.acceptedContentTypes.length === 0) throw new SecureResearchHttpError("invalid_request", "accepted_content_types_empty");
    requestHeaders(input);
  }

  private async perform(input: SecureResearchHttpRequest, initialUrl: string): Promise<SecureResearchHttpResponse> {
    const startedAt = this.now();
    const headers = requestHeaders(input);
    const redirectChain: string[] = [];
    const visited = new Set([initialUrl]);
    const allAddresses = new Map<string, { address: string; family: 4 | 6 }>();
    const warnings = new Set<string>();
    const maxAttempts = input.maxAttempts ?? 2;
    let retryCount = 0;
    let currentUrl = initialUrl;
    let finalResponse: ResearchTransportResponse | null = null;

    for (let redirects = 0; redirects <= input.redirectPolicy.maxRedirects; redirects += 1) {
      const parsed = new URL(currentUrl);
      this.telemetry.dnsLookupCount += 1;
      let resolved;
      try {
        resolved = await resolvePinnedResearchAddress({ hostname: parsed.hostname, resolver: this.resolver });
        this.telemetry.dnsDurationMs += resolved.durationMs;
      } catch (error) {
        if (error instanceof SecureResearchHttpError) {
          if (error.kind === "dns_security_rejected") this.telemetry.privateAddressRejects += 1;
          if (error.kind === "dns_lookup_failed") {
            this.telemetry.dnsLookupFailures += 1;
            if (error.internalCode) this.telemetry.dnsLastErrorCode = error.internalCode;
          }
        }
        throw error;
      }
      for (const address of resolved.addresses) allAddresses.set(`${address.family}:${address.address}`, address);
      let response: ResearchTransportResponse | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          this.telemetry.requestCount += 1;
          response = await this.runTransport(parsed.hostname, {
            url: currentUrl,
            hostname: parsed.hostname,
            pinnedAddress: resolved.pinnedAddress,
            headers,
            timeoutMs: input.timeoutMs,
            maxResponseBytes: input.maxResponseBytes,
            acceptedContentTypes: input.acceptedContentTypes,
            signal: input.signal,
          });
          this.telemetry.bytesRead += response.bytesRead;
          if (response.status === 429) this.telemetry.rateLimits += 1;
          if (!shouldRetryResearchStatus(response.status, attempt, maxAttempts)) break;
          retryCount += 1;
          this.telemetry.retries += 1;
          await this.sleep(boundedResearchRetryAfterMs(response.headers["retry-after"]));
        } catch (error) {
          if (error instanceof SecureResearchHttpError) {
            if (error.kind === "timeout") this.telemetry.timeouts += 1;
            if (error.kind === "connect_failed") this.telemetry.connectFailures += 1;
            if (error.kind === "tls_failed") this.telemetry.tlsFailures += 1;
            if (error.kind === "http_failed") this.telemetry.httpFailures += 1;
            if (error.kind === "oversized_content") this.telemetry.oversizedRejects += 1;
            if (error.kind === "content_type_rejected") this.telemetry.contentTypeRejects += 1;
            if (error.retryable && attempt < maxAttempts) {
              retryCount += 1;
              this.telemetry.retries += 1;
              continue;
            }
          }
          throw error;
        }
      }
      if (!response) throw new SecureResearchHttpError("http_failed", "response_missing");
      if (!RESEARCH_REDIRECT_STATUSES.has(response.status)) {
        finalResponse = response;
        break;
      }
      if (redirects >= input.redirectPolicy.maxRedirects) {
        this.telemetry.redirectRejects += 1;
        throw new SecureResearchHttpError("redirect_rejected", "redirect_limit_exceeded");
      }
      try {
        const next = resolveResearchRedirect({ sourceId: input.sourceId, fromUrl: currentUrl, location: response.headers.location, visited });
        redirectChain.push(next);
        visited.add(next);
        currentUrl = next;
        warnings.add("unexpected_redirect");
      } catch (error) {
        this.telemetry.redirectRejects += 1;
        throw error;
      }
    }

    if (!finalResponse) throw new SecureResearchHttpError("redirect_rejected", "final_response_missing");
    return {
      finalUrl: currentUrl,
      status: finalResponse.status,
      headers: finalResponse.headers,
      body: finalResponse.body,
      bytesRead: finalResponse.bytesRead,
      contentType: finalResponse.contentType,
      durationMs: this.now() - startedAt,
      redirectChain,
      resolvedAddresses: [...allAddresses.values()],
      retryCount,
      warnings: [...warnings],
    };
  }

  private async runTransport(hostname: string, input: ResearchTransportRequest): Promise<ResearchTransportResponse> {
    const releaseGlobal = await this.globalSemaphore.acquire();
    const host = this.hostSemaphores.get(hostname) ?? new Semaphore(1);
    this.hostSemaphores.set(hostname, host);
    const releaseHost = await host.acquire();
    try {
      return await this.transport.request(input);
    } finally {
      releaseHost();
      releaseGlobal();
    }
  }
}
