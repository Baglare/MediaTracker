import type { RecommendationProvider } from "../domain/types";

export interface ProviderRequestBudget {
  timeoutMs: number;
  maxAttempts: number;
  maxConcurrency: number;
  retryableStatuses: readonly number[];
  retryAfterSupported: boolean;
  maximumCandidateCount: number;
  maximumEnrichmentCount: number;
  maximumQueryCount: number;
}

export interface ProviderRequestTelemetry {
  provider: RecommendationProvider;
  requestCount: number;
  attemptCount: number;
  retryCount: number;
  timeoutCount: number;
  rateLimitCount: number;
  unavailableCount: number;
  fallbackCount: number;
  retryAfterAppliedMs: number;
}

export const PROVIDER_REQUEST_BUDGETS: Readonly<Record<RecommendationProvider, ProviderRequestBudget>> = {
  anilist: { timeoutMs: 4_000, maxAttempts: 2, maxConcurrency: 2, retryableStatuses: [429, 500, 502, 503, 504], retryAfterSupported: true, maximumCandidateCount: 24, maximumEnrichmentCount: 0, maximumQueryCount: 4 },
  tvmaze: { timeoutMs: 4_000, maxAttempts: 2, maxConcurrency: 1, retryableStatuses: [429, 500, 502, 503, 504], retryAfterSupported: true, maximumCandidateCount: 16, maximumEnrichmentCount: 0, maximumQueryCount: 4 },
  tmdb: { timeoutMs: 3_500, maxAttempts: 2, maxConcurrency: 2, retryableStatuses: [429, 500, 502, 503, 504], retryAfterSupported: true, maximumCandidateCount: 16, maximumEnrichmentCount: 8, maximumQueryCount: 4 },
  omdb: { timeoutMs: 3_500, maxAttempts: 2, maxConcurrency: 2, retryableStatuses: [429, 500, 502, 503, 504], retryAfterSupported: true, maximumCandidateCount: 8, maximumEnrichmentCount: 8, maximumQueryCount: 4 },
  openlibrary: { timeoutMs: 4_500, maxAttempts: 2, maxConcurrency: 1, retryableStatuses: [429, 500, 502, 503, 504], retryAfterSupported: true, maximumCandidateCount: 12, maximumEnrichmentCount: 8, maximumQueryCount: 4 },
};

const MAX_RETRY_AFTER_MS = 1_000;

export function emptyProviderRequestTelemetry(provider: RecommendationProvider): ProviderRequestTelemetry {
  return { provider, requestCount: 0, attemptCount: 0, retryCount: 0, timeoutCount: 0, rateLimitCount: 0, unavailableCount: 0, fallbackCount: 0, retryAfterAppliedMs: 0 };
}

export function mergeProviderRequestTelemetry(
  target: ProviderRequestTelemetry,
  source: ProviderRequestTelemetry,
): ProviderRequestTelemetry {
  return {
    provider: target.provider,
    requestCount: target.requestCount + source.requestCount,
    attemptCount: target.attemptCount + source.attemptCount,
    retryCount: target.retryCount + source.retryCount,
    timeoutCount: target.timeoutCount + source.timeoutCount,
    rateLimitCount: target.rateLimitCount + source.rateLimitCount,
    unavailableCount: target.unavailableCount + source.unavailableCount,
    fallbackCount: target.fallbackCount + source.fallbackCount,
    retryAfterAppliedMs: target.retryAfterAppliedMs + source.retryAfterAppliedMs,
  };
}

export function boundedRetryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  const raw = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : Math.max(0, Date.parse(value) - now);
  return Number.isFinite(raw) ? Math.min(Math.round(raw), MAX_RETRY_AFTER_MS) : 0;
}

export class ProviderRequestError extends Error {
  constructor(
    readonly kind: "timeout" | "network" | "aborted",
    readonly telemetry: ProviderRequestTelemetry,
  ) {
    super(`provider_request_${kind}`);
    this.name = "ProviderRequestError";
  }
}

export async function fetchWithProviderRequestPolicy(input: {
  provider: RecommendationProvider;
  url: string;
  init?: RequestInit;
  fetchImpl?: typeof fetch;
  budget?: ProviderRequestBudget;
  sleepImpl?: (milliseconds: number) => Promise<void>;
}): Promise<{ response: Response; telemetry: ProviderRequestTelemetry }> {
  const budget = input.budget ?? PROVIDER_REQUEST_BUDGETS[input.provider];
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleepImpl = input.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const telemetry = emptyProviderRequestTelemetry(input.provider);
  telemetry.requestCount = 1;
  let lastErrorKind: ProviderRequestError["kind"] = "network";

  for (let attempt = 1; attempt <= budget.maxAttempts; attempt += 1) {
    telemetry.attemptCount += 1;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, budget.timeoutMs);
    const parentSignal = input.init?.signal;
    const abortFromParent = () => controller.abort();
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    try {
      if (parentSignal?.aborted) throw new ProviderRequestError("aborted", telemetry);
      const response = await fetchImpl(input.url, { ...input.init, signal: controller.signal });
      if (response.status === 429) telemetry.rateLimitCount += 1;
      const retryable = budget.retryableStatuses.includes(response.status);
      if (!retryable || attempt >= budget.maxAttempts) {
        if (!response.ok) telemetry.unavailableCount += 1;
        return { response, telemetry };
      }
      telemetry.retryCount += 1;
      const retryAfterMs = budget.retryAfterSupported
        ? boundedRetryAfterMs(response.headers.get("retry-after"))
        : 0;
      telemetry.retryAfterAppliedMs += retryAfterMs;
      if (retryAfterMs > 0) await sleepImpl(retryAfterMs);
    } catch (error) {
      if (error instanceof ProviderRequestError && error.kind === "aborted") throw error;
      lastErrorKind = parentSignal?.aborted ? "aborted" : timedOut ? "timeout" : "network";
      if (lastErrorKind === "timeout") telemetry.timeoutCount += 1;
      if (attempt >= budget.maxAttempts || lastErrorKind === "aborted") {
        telemetry.unavailableCount += 1;
        throw new ProviderRequestError(lastErrorKind, telemetry);
      }
      telemetry.retryCount += 1;
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  }

  telemetry.unavailableCount += 1;
  throw new ProviderRequestError(lastErrorKind, telemetry);
}
