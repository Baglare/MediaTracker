import { XP_LOCAL_EVENT_TYPES, type PublicXpSummary, type XpDashboardSummary, type XpLegacyAggregate, type XpLocalEventType, type XpSafeMediaSnapshot, type XpSafeMediaState } from "@/lib/xp/types";

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function integer(value: unknown, min = 0, max = 100_000): number | null {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

export function validateLocalEventPayload(value: unknown): Validation<{ eventType: XpLocalEventType; canonicalMediaKey: string; media: XpSafeMediaSnapshot; totalProgress?: number; idempotencyKey: string }> {
  const root = recordOf(value);
  const media = recordOf(root?.media);
  const eventType = root?.eventType;
  const canonicalMediaKey = typeof root?.canonicalMediaKey === "string" ? root.canonicalMediaKey : "";
  const idempotencyKey = typeof root?.idempotencyKey === "string" ? root.idempotencyKey : "";
  if (!XP_LOCAL_EVENT_TYPES.includes(eventType as XpLocalEventType) || canonicalMediaKey.length < 3 || canonicalMediaKey.length > 220 || idempotencyKey.length < 3 || idempotencyKey.length > 240 || !media) return { ok: false, error: "XP olayı geçersiz." };
  const title = typeof media.title === "string" ? media.title.trim() : "";
  const mediaType = typeof media.mediaType === "string" ? media.mediaType : "";
  const safeTypes = ["movie", "tv", "anime", "manga", "manhwa", "manhua", "book", "light_novel", "web_novel", "visual_novel"];
  if (!title || title.length > 200 || !safeTypes.includes(mediaType) || media.canonicalKey !== canonicalMediaKey || Object.keys(media).some((key) => ["personalNotes", "notes", "dataUrl", "reviewText"].includes(key))) return { ok: false, error: "Medya özeti geçersiz." };
  const totalProgress = root?.totalProgress === undefined || root.totalProgress === null ? undefined : integer(root.totalProgress, 0, 1_000_000);
  if (root?.totalProgress !== undefined && root.totalProgress !== null && totalProgress === null) return { ok: false, error: "Toplam ilerleme geçersiz." };
  return { ok: true, value: { eventType: eventType as XpLocalEventType, canonicalMediaKey, media: media as unknown as XpSafeMediaSnapshot, totalProgress: totalProgress ?? undefined, idempotencyKey } };
}

export function validateLegacyAggregate(value: unknown): Validation<XpLegacyAggregate> {
  const root = recordOf(value);
  const worlds = recordOf(root?.worldCounts);
  if (!root || !worlds) return { ok: false, error: "Yerel ilerleme özeti geçersiz." };
  const fields = ["mediaCount", "progressLogCount", "completedCount", "ratedCount", "favoriteCount", "notedCount"] as const;
  const parsed = Object.fromEntries(fields.map((field) => [field, integer(root[field], 0, field === "progressLogCount" ? 1_000_000 : 100_000)])) as Record<(typeof fields)[number], number | null>;
  const east = integer(worlds.east); const screen = integer(worlds.screen); const arch = integer(worlds.arch);
  if (fields.some((field) => parsed[field] === null) || east === null || screen === null || arch === null) return { ok: false, error: "Yerel ilerleme sayıları geçersiz." };
  const mediaCount = parsed.mediaCount ?? 0;
  if (["completedCount", "ratedCount", "favoriteCount", "notedCount"].some((field) => (parsed[field as keyof typeof parsed] ?? 0) > mediaCount) || east + screen + arch !== mediaCount) return { ok: false, error: "Yerel ilerleme sayıları birbiriyle uyumsuz." };
  return { ok: true, value: { mediaCount, progressLogCount: parsed.progressLogCount ?? 0, completedCount: parsed.completedCount ?? 0, ratedCount: parsed.ratedCount ?? 0, favoriteCount: parsed.favoriteCount ?? 0, notedCount: parsed.notedCount ?? 0, worldCounts: { east, screen, arch } } };
}

export function validateMediaStateBatch(value: unknown): Validation<{ items: XpSafeMediaState[]; replace: boolean }> {
  const root = recordOf(value);
  if (!root || !Array.isArray(root.items) || root.items.length > 1000 || (root.replace !== undefined && typeof root.replace !== "boolean")) return { ok: false, error: "Kütüphane XP eşitleme verisi geçersiz." };
  const items: XpSafeMediaState[] = [];
  const seen = new Set<string>();
  const safeTypes = ["movie", "tv", "anime", "manga", "manhwa", "manhua", "book", "light_novel", "web_novel", "visual_novel"];
  const safeStatuses = ["planning", "watching", "reading", "completed", "dropped", "paused"];
  for (const entry of root.items) {
    const item = recordOf(entry);
    if (!item || Object.keys(item).some((key) => ["amount", "effect", "allocations", "personalNotes", "notes", "reviewText", "dataUrl", "fullMedia"].includes(key))) return { ok: false, error: "Güvensiz medya alanı eşitlemeye eklenemez." };
    const canonicalMediaKey = typeof item.canonicalMediaKey === "string" ? item.canonicalMediaKey.trim().toLowerCase() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const progress = integer(item.progress, 0, 100_000_000);
    const totalProgress = integer(item.totalProgress, 0, 100_000_000);
    if (canonicalMediaKey.length < 3 || canonicalMediaKey.length > 220 || title.length < 1 || title.length > 200 || !safeTypes.includes(String(item.mediaType)) || !safeStatuses.includes(String(item.status)) || progress === null || totalProgress === null || typeof item.hasRating !== "boolean" || typeof item.deleted !== "boolean" || typeof item.stateHash !== "string" || item.stateHash.length < 1 || item.stateHash.length > 128 || seen.has(canonicalMediaKey)) return { ok: false, error: "Medya state kaydı geçersiz." };
    seen.add(canonicalMediaKey);
    items.push({ canonicalMediaKey, title, mediaType: item.mediaType as XpSafeMediaState["mediaType"], status: item.status as XpSafeMediaState["status"], progress, totalProgress, hasRating: item.hasRating, deleted: item.deleted, stateHash: item.stateHash });
  }
  return { ok: true, value: { items, replace: root.replace === true } };
}

export function parseXpDashboard(value: unknown): XpDashboardSummary | null {
  const root = recordOf(value); const total = recordOf(root?.total);
  if (!root || root.version !== 2 || !total) return null;
  const totalXp = integer(total.total_xp, 0, Number.MAX_SAFE_INTEGER); const level = integer(total.level, 1, 1_000_000);
  const current = integer(total.current_level_start_xp, 0, Number.MAX_SAFE_INTEGER); const next = integer(total.next_level_start_xp, 1, Number.MAX_SAFE_INTEGER);
  if (totalXp === null || level === null || current === null || next === null) return null;
  const arrays = ["worlds", "branches", "events", "quests", "badges"] as const;
  if (arrays.some((key) => !Array.isArray(root[key]))) return null;
  const worlds = (root.worlds as unknown[]).flatMap((entry) => {
    const item = recordOf(entry); const key = item?.world_key; const xp = integer(item?.xp, 0, Number.MAX_SAFE_INTEGER); const itemLevel = integer(item?.level, 1, 1_000_000);
    return item && ["east", "screen", "arch"].includes(String(key)) && xp !== null && itemLevel !== null && typeof item.title === "string" && ["basic", "refined", "elite", "master"].includes(String(item.tier)) ? [{ key, xp, level: itemLevel, tier: item.tier, title: item.title } as XpDashboardSummary["worlds"][number]] : [];
  });
  const branches = (root.branches as unknown[]).flatMap((entry) => {
    const item = recordOf(entry); const key = item?.branch_key; const xp = integer(item?.xp, 0, Number.MAX_SAFE_INTEGER); const itemLevel = integer(item?.level, 1, 1_000_000);
    return item && ["tracker", "explorer", "critic", "curator", "connector"].includes(String(key)) && xp !== null && itemLevel !== null && ["basic", "refined", "elite", "master"].includes(String(item.tier)) ? [{ key, xp, level: itemLevel, tier: item.tier } as XpDashboardSummary["branches"][number]] : [];
  });
  const events = (root.events as unknown[]).flatMap((entry) => { const item = recordOf(entry); const action = item?.action ?? "grant"; const effect = item?.effect ?? 1; return item && typeof item.id === "string" && typeof item.eventType === "string" && ["local_attested", "social_verified", "legacy_attested", "system"].includes(String(item.trustLevel)) && ["grant", "revoke", "restore"].includes(String(action)) && (effect === 1 || effect === -1) && typeof item.occurredAt === "string" && Array.isArray(item.allocations) ? [{ id: item.id, eventType: item.eventType, trustLevel: item.trustLevel, action, effect, occurredAt: item.occurredAt, metadata: recordOf(item.metadata) ?? {}, allocations: item.allocations } as XpDashboardSummary["events"][number]] : []; });
  const rawBreakdown = recordOf(root.breakdown);
  const breakdown = {
    localCurrentXp: integer(rawBreakdown?.localCurrentXp, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    socialXp: integer(rawBreakdown?.socialXp, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    systemXp: integer(rawBreakdown?.systemXp, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    legacyCorrectionXp: Number.isInteger(rawBreakdown?.legacyCorrectionXp) ? Number(rawBreakdown?.legacyCorrectionXp) : 0,
  };
  return { version: 2, totalXp, level, currentLevelStartXp: current, nextLevelStartXp: next, worlds, branches, events, quests: root.quests as XpDashboardSummary["quests"], badges: root.badges as XpDashboardSummary["badges"], breakdown, legacyImported: root.legacyImported === true, librarySynchronized: root.librarySynchronized === true, selectedTitle: typeof root.selectedTitle === "string" ? root.selectedTitle : undefined };
}

export function parsePublicXpSummary(value: unknown): PublicXpSummary | undefined {
  const root = recordOf(value); const totalXp = root?.totalXp === null ? undefined : integer(root?.totalXp, 0, Number.MAX_SAFE_INTEGER); const level = root?.level === null ? undefined : integer(root?.level, 1, 1_000_000);
  if (!root || (root.totalXp !== null && totalXp === null) || (root.level !== null && level === null) || !Array.isArray(root.worlds) || !Array.isArray(root.branches) || !Array.isArray(root.badges)) return undefined;
  return { totalXp: totalXp ?? undefined, level: level ?? undefined, selectedTitle: typeof root.selectedTitle === "string" ? root.selectedTitle : undefined, worlds: root.worlds as PublicXpSummary["worlds"], branches: root.branches as PublicXpSummary["branches"], badges: root.badges as PublicXpSummary["badges"], legacyImported: root.legacyImported === true };
}
