export interface AnnotationToolAccessInput {
  nodeEnv: string | undefined;
  enabledFlag: string | undefined;
  host: string | null | undefined;
}

export interface AnnotationToolAccessDecision {
  allowed: boolean;
  reason: "allowed" | "production" | "disabled" | "non_local_host";
}

function normalizedHostname(host: string | null | undefined): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]");
    return closing > 0 ? trimmed.slice(1, closing) : null;
  }
  return trimmed.split(":", 1)[0] ?? null;
}

export function isLocalAnnotationHost(host: string | null | undefined): boolean {
  const hostname = normalizedHostname(host);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function evaluateAnnotationToolAccess(input: AnnotationToolAccessInput): AnnotationToolAccessDecision {
  if (input.nodeEnv === "production") return { allowed: false, reason: "production" };
  if (input.nodeEnv !== "development" || input.enabledFlag !== "1") {
    return { allowed: false, reason: "disabled" };
  }
  if (!isLocalAnnotationHost(input.host)) return { allowed: false, reason: "non_local_host" };
  return { allowed: true, reason: "allowed" };
}
