export const RELEASE_ROUTE_TIMEOUT_MS = 8_000;
export const RELEASE_ROUTE_HORIZON_DAYS = 90;

export function releaseRouteSignal(): AbortSignal {
  return AbortSignal.timeout(RELEASE_ROUTE_TIMEOUT_MS);
}

export function isReleaseRouteTimeout(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function releaseDateWindow(nowMs = Date.now()): {
  start: string;
  end: string;
} {
  const start = new Date(nowMs);
  const end = new Date(nowMs + RELEASE_ROUTE_HORIZON_DAYS * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function isDateInReleaseWindow(
  value: string,
  nowMs = Date.now(),
): boolean {
  const literal = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(literal)) return false;
  const window = releaseDateWindow(nowMs);
  return literal >= window.start && literal <= window.end;
}
