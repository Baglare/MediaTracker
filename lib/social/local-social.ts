import { deriveActivityEvents, mediaToSocialSnapshot, type ActivityEventType, type ActivityPreferences, type SocialMediaEntitySnapshot } from "@/lib/social/interactions";
import {
  createUserOwnerScope,
  type LocalOwnerScope,
} from "@/lib/local-owner-scope";
import type { MediaItem } from "@/lib/types";
import {
  ensureMediaIdentity,
  getCanonicalMediaKeyV2,
} from "@/lib/media-identity";
import {
  resolveCanonicalMediaAlias,
  type MediaIdentityAliasRegistry,
} from "@/lib/media-identity-aliases";

export const SOCIAL_OUTBOX_KEY = "media-tracker-social-outbox";
export const SOCIAL_OUTBOX_QUARANTINE_KEY = "mediaTracker:quarantine:social-outbox:ownerless";
export const SOCIAL_RECOMMENDATION_LINKS_KEY = "media-tracker-social-recommendation-links";
const SOCIAL_PREFERENCES_CACHE_KEY = "media-tracker-social-preferences";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SocialActivityOutboxItem {
  id: string;
  type: "activity_publish";
  userId: string;
  idempotencyKey: string;
  payload: {
    eventType: ActivityEventType;
    visibility: ActivityPreferences["defaultVisibility"];
    media: SocialMediaEntitySnapshot;
    rating?: number;
    sourceEventId: string;
    dedupeKey: string;
  };
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

export interface SocialRecommendationOutboxItem {
  id: string;
  type: "recommendation_started" | "recommendation_completed";
  userId: string;
  idempotencyKey: string;
  payload: { recommendationId: string; action: "started" | "completed"; dedupeKey: string };
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

export type SocialOutboxItem = SocialActivityOutboxItem | SocialRecommendationOutboxItem;

export interface RecommendationLocalLink {
  recommendationId: string;
  localMediaId: string;
  canonicalMediaKey: string;
  linkedAt: string;
  userId: string;
}

interface CachedPreferences { userId: string; configured: boolean; activity: ActivityPreferences }

function browserStorage(): StorageLike | null { return typeof window === "undefined" ? null : window.localStorage; }

export function buildRecommendationLinksKeyForScope(scope: LocalOwnerScope): string {
  return `mediaTracker:cache:v1:${scope.storageKey}:recommendationLinks`;
}

export function buildRecommendationLinksKey(userId: string): string {
  return buildRecommendationLinksKeyForScope(createUserOwnerScope(userId));
}

function parseArray<T>(raw: string | null, guard: (value: unknown) => value is T): T[] {
  if (!raw) return [];
  try { const value = JSON.parse(raw) as unknown; return Array.isArray(value) ? value.filter(guard) : []; }
  catch { return []; }
}

function isOutboxItem(value: unknown): value is SocialOutboxItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SocialOutboxItem>;
  return typeof item.id === "string" && typeof item.userId === "string" && typeof item.idempotencyKey === "string" && typeof item.createdAt === "string" && typeof item.retryCount === "number" && ["activity_publish","recommendation_started","recommendation_completed"].includes(String(item.type));
}

function isLocalLink(value: unknown): value is RecommendationLocalLink {
  if (!value || typeof value !== "object") return false;
  const link = value as Partial<RecommendationLocalLink>;
  return [link.recommendationId,link.localMediaId,link.canonicalMediaKey,link.linkedAt,link.userId].every((part) => typeof part === "string" && part.length > 0);
}

export function loadSocialOutbox(storage: StorageLike | null = browserStorage()): SocialOutboxItem[] {
  if (!storage) return [];
  const raw = storage.getItem(SOCIAL_OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isOutboxItem);
    const invalid = parsed.filter((item) => !isOutboxItem(item));
    if (invalid.length > 0) {
      try {
        storage.setItem(SOCIAL_OUTBOX_QUARANTINE_KEY, JSON.stringify({
          version: 1,
          sourceKey: SOCIAL_OUTBOX_KEY,
          capturedAt: new Date().toISOString(),
          reason: "owner_missing_or_invalid",
          records: invalid,
        }));
      } catch { /* Preserve the original outbox if quarantine storage is unavailable. */ }
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveSocialOutbox(items: SocialOutboxItem[], storage: StorageLike | null = browserStorage()): void {
  storage?.setItem(SOCIAL_OUTBOX_KEY, JSON.stringify(items));
}

export function enqueueSocialOutbox(item: SocialOutboxItem, storage: StorageLike | null = browserStorage()): SocialOutboxItem[] {
  const items = loadSocialOutbox(storage);
  const index = items.findIndex((candidate) => candidate.userId === item.userId && candidate.idempotencyKey === item.idempotencyKey);
  const next = index >= 0 ? items.map((candidate, current) => current === index ? item : candidate) : [...items, item];
  saveSocialOutbox(next, storage);
  return next;
}

export async function flushSocialOutbox(
  userId: string,
  send: (item: SocialOutboxItem) => Promise<void>,
  storage: StorageLike | null = browserStorage(),
): Promise<SocialOutboxItem[]> {
  const own = loadSocialOutbox(storage).filter((item) => item.userId === userId);
  const successfulIds = new Set<string>();
  const failures = new Map<string, string>();
  for (const item of own) {
    try {
      await send(item);
      successfulIds.add(item.id);
    } catch (error) {
      failures.set(
        item.id,
        error instanceof Error ? error.message.slice(0, 240) : "Sosyal olay gönderilemedi.",
      );
    }
  }
  const next = loadSocialOutbox(storage)
    .filter((item) => !successfulIds.has(item.id))
    .map((item) => {
      const failure = failures.get(item.id);
      return failure
        ? { ...item, retryCount: item.retryCount + 1, lastError: failure }
        : item;
    });
  saveSocialOutbox(next, storage);
  return next;
}

export function cacheSocialActivityPreferences(userId: string, configured: boolean, activity: ActivityPreferences, storage: StorageLike | null = browserStorage()): void {
  storage?.setItem(SOCIAL_PREFERENCES_CACHE_KEY, JSON.stringify({ userId, configured, activity } satisfies CachedPreferences));
}

export function loadCachedSocialActivityPreferences(userId: string, storage: StorageLike | null = browserStorage()): CachedPreferences | null {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(SOCIAL_PREFERENCES_CACHE_KEY) ?? "null") as Partial<CachedPreferences> | null;
    return value?.userId === userId && typeof value.configured === "boolean" && value.activity && typeof value.activity === "object" ? value as CachedPreferences : null;
  } catch { return null; }
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function queueMediaSocialEvents(previous: MediaItem | undefined, next: MediaItem, userId: string | null, storage: StorageLike | null = browserStorage()): SocialOutboxItem[] {
  if (!userId || !storage) return [];
  const cached = loadCachedSocialActivityPreferences(userId, storage);
  if (!cached?.configured) return [];
  const media = mediaToSocialSnapshot(next);
  return deriveActivityEvents(previous, next, cached.activity).map((eventType) => {
    const suffix = eventType === "rating_shared" ? String(next.userRating) : eventType === "media_started" ? "first" : "true";
    const dedupeKey = `media:${media.canonicalKey}:${eventType}:${suffix}`;
    const item: SocialActivityOutboxItem = {
      id: randomId("social"), type: "activity_publish", userId, idempotencyKey: dedupeKey,
      payload: { eventType, visibility: cached.activity.defaultVisibility, media, rating: eventType === "rating_shared" ? next.userRating ?? undefined : undefined, sourceEventId: `${next.id}:${eventType}:${suffix}`, dedupeKey },
      createdAt: new Date().toISOString(), retryCount: 0,
    };
    enqueueSocialOutbox(item, storage);
    return item;
  });
}

export function queueRecommendationProgress(recommendationId: string, action: "started" | "completed", userId: string | null, storage: StorageLike | null = browserStorage()): SocialRecommendationOutboxItem | null {
  if (!userId || !storage) return null;
  const dedupeKey = `recommendation:${recommendationId}:${action}`;
  const item: SocialRecommendationOutboxItem = { id: randomId("social-rec"), type: action === "started" ? "recommendation_started" : "recommendation_completed", userId, idempotencyKey: dedupeKey, payload: { recommendationId, action, dedupeKey }, createdAt: new Date().toISOString(), retryCount: 0 };
  enqueueSocialOutbox(item, storage);
  return item;
}

export async function sendSocialOutboxItem(item: SocialOutboxItem): Promise<void> {
  const endpoint = item.type === "activity_publish" ? "/api/social/feed" : "/api/social/recommendations";
  const response = await fetch(endpoint, { method: item.type === "activity_publish" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.type === "activity_publish" ? { action: "publish", ...item.payload } : item.payload) });
  const result = await response.json().catch(() => ({})) as { message?: string };
  if (response.status === 409 && result.message?.includes("sosyal profilini")) return;
  if (!response.ok) throw new Error(result.message ?? "Sosyal olay gönderilemedi.");
}

export function loadRecommendationLinks(userId: string, storage: StorageLike | null = browserStorage()): RecommendationLocalLink[] {
  return storage
    ? parseArray(storage.getItem(buildRecommendationLinksKey(userId)), isLocalLink)
      .filter((link) => link.userId === userId)
    : [];
}

export function validRecommendationLinkIds(userId: string, media: MediaItem[], storage: StorageLike | null = browserStorage()): string[] {
  const mediaIds = new Set(media.map((item) => item.id));
  return loadRecommendationLinks(userId, storage).filter((link) => mediaIds.has(link.localMediaId)).map((link) => link.recommendationId);
}

export function saveRecommendationLink(link: RecommendationLocalLink, storage: StorageLike | null = browserStorage()): RecommendationLocalLink[] {
  if (!storage) return [];
  const key = buildRecommendationLinksKey(link.userId);
  const all = parseArray(storage.getItem(key), isLocalLink);
  const next = [...all.filter((item) => !(item.userId === link.userId && item.recommendationId === link.recommendationId)), link];
  storage.setItem(key, JSON.stringify(next));
  return next.filter((item) => item.userId === link.userId);
}

export function findMatchingLocalMedia(
  media: Pick<SocialMediaEntitySnapshot, "canonicalKey">,
  items: MediaItem[],
  aliases?: MediaIdentityAliasRegistry,
): MediaItem | undefined {
  const resolvedV2 = aliases
    ? resolveCanonicalMediaAlias(aliases, media.canonicalKey)
    : null;
  return items.find((item) => (
    (resolvedV2 !== null && getCanonicalMediaKeyV2(item) === resolvedV2)
    || getCanonicalMediaKeyV2(item) === media.canonicalKey
    || mediaToSocialSnapshot(item).canonicalKey === media.canonicalKey
  ));
}

export function recommendationToPlanningMedia(recommendationId: string, media: SocialMediaEntitySnapshot): MediaItem {
  return ensureMediaIdentity({
    id: `social-${recommendationId}`,
    title: media.title,
    type: media.mediaType,
    status: "planning",
    coverImage: media.coverUrl ?? "",
    currentProgress: 0,
    totalProgress: 0,
    favorite: false,
    userRating: null,
    externalSource: media.externalSource as MediaItem["externalSource"],
    externalId: media.externalId,
    overview: media.overview,
  }).item;
}
