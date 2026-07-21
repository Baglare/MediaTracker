import { MODULE_VISIBILITIES, type ModuleVisibility } from "@/lib/social/types";
import {
  ACTIVITY_EVENT_TYPES,
  DEFAULT_ACTIVITY_PREFERENCES,
  NOTIFICATION_TYPES,
  REACTION_TYPES,
  RECOMMENDATION_PERMISSIONS,
  RECOMMENDATION_PROGRESS_STATUSES,
  RECOMMENDATION_RESPONSE_STATUSES,
  REPORT_CATEGORIES,
  type ActivityEventType,
  type ActivityPreferences,
  type NotificationPreferences,
  type ReactionType,
  type RecommendationPermission,
  type RecommendationProgressStatus,
  type RecommendationResponseStatus,
  type ReportCategory,
  type SocialMediaEntitySnapshot,
  type SocialNotificationType,
} from "@/lib/social/interactions";
import type { MediaType } from "@/lib/types";
import type { ValidationResult } from "@/lib/social/validation";

const MEDIA_TYPES = new Set<MediaType>(["movie", "tv", "anime", "manga", "manhwa", "manhua", "book", "light_novel", "web_novel", "visual_novel"]);
const EXTERNAL_SOURCES = new Set(["tmdb", "tvmaze", "openlibrary", "anilist", "omdb"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function socialRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function safeSocialText(value: unknown, max: number, required = false): ValidationResult<string | undefined> {
  if (value === undefined || value === null || value === "") return required ? { ok: false, error: "Metin gerekli." } : { ok: true, value: undefined };
  if (typeof value !== "string" || /[<>]/.test(value)) return { ok: false, error: "HTML içermeyen düz metin kullan." };
  const text = value.trim();
  if ((required && !text) || text.length > max) return { ok: false, error: `Metin en fazla ${max} karakter olabilir.` };
  return { ok: true, value: text || undefined };
}

export function validateUuid(value: unknown, label = "Kimlik"): ValidationResult<string> {
  return typeof value === "string" && UUID.test(value) ? { ok: true, value } : { ok: false, error: `${label} geçersiz.` };
}

export function validateActivityType(value: unknown): ValidationResult<ActivityEventType> {
  return ACTIVITY_EVENT_TYPES.includes(value as ActivityEventType) ? { ok: true, value: value as ActivityEventType } : { ok: false, error: "Aktivite türü geçersiz." };
}

export function validateActivityVisibility(value: unknown): ValidationResult<ModuleVisibility> {
  return MODULE_VISIBILITIES.includes(value as ModuleVisibility) ? { ok: true, value: value as ModuleVisibility } : { ok: false, error: "Aktivite görünürlüğü geçersiz." };
}

export function validateSocialMediaSnapshot(value: unknown): ValidationResult<SocialMediaEntitySnapshot> {
  const record = socialRecord(value);
  const title = safeSocialText(record?.title, 180, true);
  if (!record || !title.ok || !title.value) return { ok: false, error: title.ok ? "Medya bilgisi geçersiz." : title.error };
  if (!MEDIA_TYPES.has(record.mediaType as MediaType)) return { ok: false, error: "Medya türü geçersiz." };
  if (!(["east", "screen", "arch"] as const).includes(record.world as SocialMediaEntitySnapshot["world"])) return { ok: false, error: "Medya dünyası geçersiz." };
  const canonicalKey = safeSocialText(record.canonicalKey, 260, true);
  if (!canonicalKey.ok || !canonicalKey.value || canonicalKey.value.length < 3) return { ok: false, error: "Canonical medya anahtarı geçersiz." };
  const overview = safeSocialText(record.overview, 600);
  if (!overview.ok) return overview;
  const progressSummary = safeSocialText(record.progressSummary, 80);
  if (!progressSummary.ok) return progressSummary;
  const externalSource = safeSocialText(record.externalSource, 40);
  const externalId = safeSocialText(record.externalId, 160);
  if (!externalSource.ok || !externalId.ok) return { ok: false, error: "Harici medya kimliği geçersiz." };
  if (externalSource.value && !EXTERNAL_SOURCES.has(externalSource.value)) return { ok: false, error: "Harici medya kaynağı desteklenmiyor." };
  let coverUrl: string | undefined;
  if (record.coverUrl !== undefined && record.coverUrl !== "") {
    if (typeof record.coverUrl !== "string" || record.coverUrl.length > 1000) return { ok: false, error: "Kapak URL'si geçersiz." };
    try { const url = new URL(record.coverUrl); if (url.protocol !== "https:") throw new Error(); coverUrl = url.toString(); }
    catch { return { ok: false, error: "Kapak URL'si HTTPS olmalı." }; }
  }
  return { ok: true, value: { title: title.value, mediaType: record.mediaType as MediaType, externalSource: externalSource.value, externalId: externalId.value, canonicalKey: canonicalKey.value, coverUrl, overview: overview.value, world: record.world as SocialMediaEntitySnapshot["world"], progressSummary: progressSummary.value } };
}

export function validateReactionType(value: unknown): ValidationResult<ReactionType> {
  return REACTION_TYPES.includes(value as ReactionType) ? { ok: true, value: value as ReactionType } : { ok: false, error: "Tepki türü geçersiz." };
}

export function validateRecommendationPermission(value: unknown): ValidationResult<RecommendationPermission> {
  return RECOMMENDATION_PERMISSIONS.includes(value as RecommendationPermission) ? { ok: true, value: value as RecommendationPermission } : { ok: false, error: "Öneri izni geçersiz." };
}

export function validateRecommendationResponseStatus(value: unknown): ValidationResult<RecommendationResponseStatus> {
  return RECOMMENDATION_RESPONSE_STATUSES.includes(value as RecommendationResponseStatus) ? { ok: true, value: value as RecommendationResponseStatus } : { ok: false, error: "Öneri cevap durumu geçersiz." };
}

export function validateRecommendationProgressStatus(value: unknown): ValidationResult<RecommendationProgressStatus> {
  return RECOMMENDATION_PROGRESS_STATUSES.includes(value as RecommendationProgressStatus) ? { ok: true, value: value as RecommendationProgressStatus } : { ok: false, error: "Öneri ilerleme durumu geçersiz." };
}

export function validateReportCategory(value: unknown): ValidationResult<ReportCategory> {
  return REPORT_CATEGORIES.includes(value as ReportCategory) ? { ok: true, value: value as ReportCategory } : { ok: false, error: "Rapor kategorisi geçersiz." };
}

export function validateNotificationType(value: unknown): ValidationResult<SocialNotificationType> {
  return NOTIFICATION_TYPES.includes(value as SocialNotificationType) ? { ok: true, value: value as SocialNotificationType } : { ok: false, error: "Bildirim türü geçersiz." };
}

function bool(record: Record<string, unknown>, key: string, fallback: boolean): boolean { return typeof record[key] === "boolean" ? record[key] as boolean : fallback; }

export function validateActivityPreferences(value: unknown): ValidationResult<ActivityPreferences> {
  const record = socialRecord(value);
  if (!record) return { ok: false, error: "Aktivite tercihleri geçersiz." };
  const visibility = validateActivityVisibility(record.defaultVisibility ?? DEFAULT_ACTIVITY_PREFERENCES.defaultVisibility);
  if (!visibility.ok) return visibility;
  return { ok: true, value: { shareCompleted: bool(record,"shareCompleted",true), shareStarted: bool(record,"shareStarted",false), shareRating: bool(record,"shareRating",false), shareFavorite: bool(record,"shareFavorite",false), shareRecommendationCompleted: bool(record,"shareRecommendationCompleted",false), defaultVisibility: visibility.value } };
}

export function validateNotificationPreferences(value: unknown): ValidationResult<NotificationPreferences> {
  const record = socialRecord(value);
  if (!record) return { ok: false, error: "Bildirim tercihleri geçersiz." };
  return { ok: true, value: { follow: bool(record,"follow",true), comments: bool(record,"comments",true), reactions: bool(record,"reactions",true), recommendationReceived: bool(record,"recommendationReceived",true), recommendationAccepted: bool(record,"recommendationAccepted",true), recommendationStarted: bool(record,"recommendationStarted",true), recommendationCompleted: bool(record,"recommendationCompleted",true), recommendationRejected: bool(record,"recommendationRejected",false), recommendationWithdrawn: bool(record,"recommendationWithdrawn",true) } };
}

export function validateCursor(search: URLSearchParams): ValidationResult<{ createdAt?: string; id?: string; limit: number }> {
  const createdAt = search.get("cursorCreatedAt") ?? undefined;
  const id = search.get("cursorId") ?? undefined;
  const rawLimit = Number(search.get("limit") ?? 20);
  if ((createdAt && Number.isNaN(Date.parse(createdAt))) || (id && !UUID.test(id))) return { ok: false, error: "Sayfalama imleci geçersiz." };
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) return { ok: false, error: "Sayfa limiti geçersiz." };
  return { ok: true, value: { createdAt, id, limit: rawLimit } };
}
