import type { LocalOwnerScope } from "./local-owner-scope";
import type { ProgressLog } from "./types";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameProgressLogPayload(left: ProgressLog, right: ProgressLog): boolean {
  return stable(left) === stable(right);
}

export function classifyProgressLogReplay(current: ProgressLog, incoming: ProgressLog): "idempotent" | "conflict" {
  return sameProgressLogPayload(current, incoming) ? "idempotent" : "conflict";
}

export function canCoalescePendingProgressLog(
  scope: LocalOwnerScope | null,
): boolean {
  if (!scope) return false;
  if (scope.kind === "guest") return true;
  // Authenticated library and Cloud queue are separate safe-write keys.
  // Without a cross-key transaction, a reused ID could retain divergent
  // payloads after a crash/write failure. Prefer a fresh immutable log ID.
  return false;
}

export function buildImmutableProgressCorrection(
  prior: ProgressLog,
  newProgress: number,
  options: { id: string; createdAt: string },
): ProgressLog {
  if (!Number.isSafeInteger(newProgress) || newProgress < 0) throw new Error("progress_correction_invalid");
  return {
    ...prior,
    id: options.id,
    action: "manual_adjust",
    amount: Math.abs(newProgress - prior.newProgress),
    previousProgress: prior.newProgress,
    newProgress,
    createdAt: options.createdAt,
    detail: "Değişmez ilerleme günlüğü için düzeltme kaydı",
  };
}
