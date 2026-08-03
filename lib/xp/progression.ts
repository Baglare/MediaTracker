import { canonicalMediaKey, mediaWorld } from "@/lib/social/interactions";
import type { MediaItem, ProgressLog } from "@/lib/types";
import { tierForLevel, type UserProgression, type UserProgressionWorld } from "@/lib/user-progression";
import type { XpDashboardSummary, XpEventAction, XpLegacyAggregate, XpLocalEntitlementType, XpSafeMediaSnapshot, XpSafeMediaState, XpTrustLevel, XpWorldKey } from "@/lib/xp/types";

export function generalLevel(totalXp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, totalXp) / 100)) + 1;
}

export function worldLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 75)) + 1;
}

const WORLD_TITLES: Record<XpWorldKey, [string,string,string,string]> = {
  east: ["Doğu Yolcusu","Mürekkep İzleyicisi","Katana Arşivcisi","Doğu Ustası"],
  screen: ["Kadraj Gezgini","Sahne Takipçisi","Projektör Avcısı","Kadraj Ustası"],
  arch: ["Arşiv Yolcusu","Sayfa Toplayıcısı","Mühür Muhafızı","Arşiv Ustası"],
};

export function earnedWorldTitles(world: XpWorldKey, level: number): string[] {
  const count = level >= 21 ? 4 : level >= 11 ? 3 : level >= 6 ? 2 : 1;
  return WORLD_TITLES[world].slice(0, count);
}

export function levelBounds(level: number): { current: number; next: number } {
  const safe = Math.max(1, Math.floor(level));
  return { current: (safe - 1) ** 2 * 100, next: safe ** 2 * 100 };
}

export function commitmentBonus(totalProgress: number | null | undefined): number {
  if (!totalProgress || totalProgress <= 1) return 0;
  if (totalProgress <= 12) return 3;
  if (totalProgress <= 50) return 7;
  if (totalProgress <= 200) return 10;
  return 15;
}

export function buildSafeMediaSnapshot(item: MediaItem): XpSafeMediaSnapshot {
  return {
    title: item.title.replace(/[<>]/g, "").trim().slice(0, 200),
    mediaType: item.type,
    externalSource: item.externalSource,
    externalId: item.externalId,
    canonicalKey: canonicalMediaKey(item),
    coverUrl: item.coverImage.startsWith("https://") ? item.coverImage : undefined,
    userRating: typeof item.userRating === "number" ? item.userRating : undefined,
  };
}

function stableStateHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v2-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildSafeMediaState(item: MediaItem, deleted = false): XpSafeMediaState {
  const snapshot = buildSafeMediaSnapshot(item);
  const state = {
    canonicalMediaKey: snapshot.canonicalKey.toLowerCase(),
    title: snapshot.title,
    mediaType: snapshot.mediaType,
    status: item.status,
    progress: Math.max(0, Math.floor(item.currentProgress)),
    totalProgress: Math.max(0, Math.floor(item.totalProgress)),
    hasRating: typeof item.userRating === "number" || typeof item.rating === "number",
    deleted,
  };
  return { ...state, stateHash: stableStateHash(JSON.stringify(state)) };
}

export function activeMediaEntitlements(state: XpSafeMediaState, profileState: { hasPublicReview?: boolean; isShowcased?: boolean } = {}): XpLocalEntitlementType[] {
  if (state.deleted) return [];
  const active: XpLocalEntitlementType[] = [];
  if (["watching", "reading", "completed"].includes(state.status) || state.progress > 0) active.push("media_started");
  if (state.status === "completed") active.push("media_completed");
  if (state.hasRating) active.push("media_rated");
  if (profileState.hasPublicReview) active.push("review_published");
  if (profileState.isShowcased) active.push("showcase_curated");
  return active;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildLegacyAggregate(media: MediaItem[], logs: ProgressLog[]): XpLegacyAggregate {
  const worldCounts: Record<XpWorldKey, number> = { east: 0, screen: 0, arch: 0 };
  let completedCount = 0;
  let ratedCount = 0;
  let favoriteCount = 0;
  let notedCount = 0;
  for (const item of media) {
    worldCounts[mediaWorld(item.type)] += 1;
    if (item.status === "completed") completedCount += 1;
    if (typeof item.userRating === "number" || typeof item.rating === "number") ratedCount += 1;
    if (item.favorite) favoriteCount += 1;
    if (hasText(item.personalNotes) || hasText((item as MediaItem & { notes?: unknown }).notes)) notedCount += 1;
  }
  return { mediaCount: media.length, progressLogCount: logs.length, completedCount, ratedCount, favoriteCount, notedCount, worldCounts };
}

export function calculateLegacyXp(aggregate: XpLegacyAggregate): number {
  return aggregate.mediaCount * 10 + aggregate.progressLogCount * 5 + aggregate.completedCount * 30 + aggregate.ratedCount * 8 + aggregate.favoriteCount * 5 + aggregate.notedCount * 8;
}

export function dominantWorld(worlds: Array<{ key: XpWorldKey; xp: number }>): XpWorldKey | "mixed" {
  const all = (["east", "screen", "arch"] as const).map((key) => ({ key, xp: worlds.find((item) => item.key === key)?.xp ?? 0 }));
  const max = Math.max(...all.map((item) => item.xp));
  if (max <= 0 || all.filter((item) => item.xp === max).length !== 1) return "mixed";
  return all.find((item) => item.xp === max)?.key ?? "mixed";
}

export function summaryToLegacyProgression(summary: XpDashboardSummary): UserProgression {
  const bounds = levelBounds(summary.level);
  const currentLevelXp = summary.totalXp - bounds.current;
  const nextLevelXp = bounds.next - bounds.current;
  const dominant = dominantWorld(summary.worlds);
  const primary = dominant === "mixed" ? undefined : summary.worlds.find((world) => world.key === dominant);
  const worldCounts: Record<UserProgressionWorld, number> = { east: 0, screen: 0, arch: 0, mixed: 0 };
  for (const world of summary.worlds) worldCounts[world.key] = world.xp;
  return {
    totalXp: summary.totalXp,
    level: summary.level,
    title: summary.selectedTitle ?? primary?.title ?? "Dünya Takipçisi",
    tier: tierForLevel(summary.level),
    dominantWorld: dominant,
    currentLevelStartXp: bounds.current,
    nextLevelStartXp: bounds.next,
    currentLevelXp,
    nextLevelXp,
    progressPercent: nextLevelXp > 0 ? Math.min(1, Math.max(0, currentLevelXp / nextLevelXp)) : 0,
    worldCounts,
    worldMetric: "xp",
  };
}

export const XP_TRUST_LABELS: Record<XpTrustLevel, string> = {
  local_attested: "Yerel etkinlik",
  social_verified: "Sosyal olarak doğrulandı",
  legacy_attested: "Eski ilerlemeden aktarıldı",
  system: "Sistem ödülü",
};

export const XP_EVENT_LABELS: Record<string, string> = {
  media_started: "Medyaya başlandı",
  media_completed: "Medya tamamlandı",
  media_rated: "İlk puan verildi",
  review_published: "Değerlendirme yayımlandı",
  showcase_curated: "Profil vitrini düzenlendi",
  recommendation_completed_recipient: "Arkadaş tavsiyesi tamamlandı",
  recommendation_completed_sender: "Gönderilen tavsiye tamamlandı",
  recommendation_completion_feedback: "Tamamlama geri bildirimi",
  legacy_import: "Yerel ilerleme aktarıldı",
  quest_completed: "Görev tamamlandı",
  reversal: "XP düzeltmesi",
};

const REVOKE_LABELS: Record<string, string> = {
  media_started: "Başlama durumu kaldırıldı",
  media_completed: "Tamamlanma durumu kaldırıldı",
  media_rated: "Puan kaldırıldı",
  review_published: "Paylaşılan değerlendirme kaldırıldı",
  showcase_curated: "Medya vitrinden çıkarıldı",
  reversal: "Eski yerel XP dengelendi",
};

const RESTORE_LABELS: Record<string, string> = {
  media_started: "Medyaya yeniden başlandı",
  media_completed: "Medya yeniden tamamlandı",
  media_rated: "Medya yeniden puanlandı",
  review_published: "Değerlendirme yeniden paylaşıldı",
  showcase_curated: "Medya yeniden vitrine eklendi",
};

export function xpEventLabel(eventType: string, action: XpEventAction): string {
  if (action === "revoke") return REVOKE_LABELS[eventType] ?? "İlerleme geri alındı";
  if (action === "restore") return RESTORE_LABELS[eventType] ?? XP_EVENT_LABELS[eventType] ?? "İlerleme yeniden kazanıldı";
  return XP_EVENT_LABELS[eventType] ?? "İlerleme olayı";
}
