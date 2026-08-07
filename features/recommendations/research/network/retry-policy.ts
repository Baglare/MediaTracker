export const RESEARCH_MAX_RETRY_AFTER_MS = 1_000;
export const RESEARCH_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export function boundedResearchRetryAfterMs(value: string | undefined, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  const raw = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : Math.max(0, Date.parse(value) - now);
  return Number.isFinite(raw) ? Math.min(RESEARCH_MAX_RETRY_AFTER_MS, Math.round(raw)) : 0;
}

export function shouldRetryResearchStatus(status: number, attempt: number, maxAttempts: number): boolean {
  return attempt < maxAttempts && RESEARCH_RETRYABLE_STATUSES.has(status);
}

