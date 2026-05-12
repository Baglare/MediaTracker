import type { ProgressLog, ProgressLogAction } from "./types";

export function getProgressLogDedupeKey(log: ProgressLog): string {
  return [
    log.mediaId,
    log.action,
    log.previousProgress,
    log.newProgress,
    log.createdAt,
    log.amount,
    log.unit,
  ].join("|");
}

export function dedupeProgressLogs(logs: ProgressLog[]): ProgressLog[] {
  const seen = new Set<string>();
  const out: ProgressLog[] = [];

  for (const log of logs) {
    const key = getProgressLogDedupeKey(log);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(log);
  }

  return out;
}

export function sortProgressLogsByNewest(logs: ProgressLog[]): ProgressLog[] {
  return logs
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function getDisplayProgressLogs(
  logs: ProgressLog[],
  limit?: number,
): ProgressLog[] {
  const sorted = sortProgressLogsByNewest(dedupeProgressLogs(logs));
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}

export function getProgressLogActionText(action: ProgressLogAction): string {
  switch (action) {
    case "added":
      return "eklendi";
    case "increment":
      return "ilerletildi";
    case "complete":
      return "tamamlandı";
    case "manual_adjust":
      return "manuel düzenlendi";
  }
}

export function formatProgressLogAction(log: ProgressLog): string {
  return getProgressLogActionText(log.action);
}

export function formatProgressLogDetail(log: ProgressLog): string {
  if (log.action === "added") {
    return log.detail || "Kütüphaneye eklendi";
  }

  if (log.action === "complete" && log.previousProgress === log.newProgress) {
    return log.detail || "Tamamlandı";
  }

  return `${log.previousProgress} → ${log.newProgress} ${log.unit}`;
}

export function formatProgressLogDateTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatProgressLogRelativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}g`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}h`;
  return `${Math.floor(d / 30)}ay`;
}
