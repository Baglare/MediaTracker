import type { MediaItem, MediaStatus, MediaType } from "@/lib/types";
import type { ModuleVisibility } from "@/lib/social/types";

export const ACTIVITY_EVENT_TYPES = ["media_started", "media_completed", "rating_shared", "favorite_shared", "shared_note_published", "recommendation_completed", "manual_media_share"] as const;
export const REACTION_TYPES = ["like", "love", "interesting", "celebrate"] as const;
export const RECOMMENDATION_PERMISSIONS = ["mutual", "following", "followers", "everyone", "none"] as const;
export const RECOMMENDATION_RESPONSE_STATUSES = ["pending", "accepted", "deferred", "rejected", "withdrawn"] as const;
export const RECOMMENDATION_PROGRESS_STATUSES = ["none", "linked", "started", "completed"] as const;
export const REPORT_CATEGORIES = ["spam", "harassment", "spoiler", "inappropriate", "other"] as const;
export const NOTIFICATION_TYPES = ["follow_request_received", "follow_request_accepted", "new_follower", "activity_comment", "comment_reply", "activity_reaction", "comment_reaction", "recommendation_received", "recommendation_accepted", "recommendation_deferred", "recommendation_started", "recommendation_completed", "recommendation_withdrawn", "recommendation_rejected", "recommendation_message"] as const;
export const RECOMMENDATION_EVENT_TYPES = ["sent", "deferred", "accepted", "rejected", "withdrawn", "linked", "started", "completed"] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];
export type ReactionType = (typeof REACTION_TYPES)[number];
export type RecommendationPermission = (typeof RECOMMENDATION_PERMISSIONS)[number];
export type RecommendationResponseStatus = (typeof RECOMMENDATION_RESPONSE_STATUSES)[number];
export type RecommendationProgressStatus = (typeof RECOMMENDATION_PROGRESS_STATUSES)[number];
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export type SocialNotificationType = (typeof NOTIFICATION_TYPES)[number];
export type RecommendationEventType = (typeof RECOMMENDATION_EVENT_TYPES)[number];

export interface SocialEntityActor {
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
}

export interface SocialMediaEntitySnapshot {
  title: string;
  mediaType: MediaType;
  externalSource?: string;
  externalId?: string;
  canonicalKey: string;
  coverUrl?: string;
  overview?: string;
  world: "east" | "screen" | "arch";
  progressSummary?: string;
}

export interface SocialActivityComment {
  id: string;
  parentCommentId?: string;
  body?: string;
  spoiler: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  author: SocialEntityActor;
  reactions: Partial<Record<ReactionType, number>>;
  viewerReaction?: ReactionType;
}

export interface SocialActivity {
  id: string;
  eventType: ActivityEventType;
  visibility: ModuleVisibility;
  media: SocialMediaEntitySnapshot;
  rating?: number;
  text?: string;
  createdAt: string;
  updatedAt: string;
  actor: SocialEntityActor;
  comments: SocialActivityComment[];
  reactions: Partial<Record<ReactionType, number>>;
  viewerReaction?: ReactionType;
  commentCount: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor?: { createdAt: string; id: string };
}

export interface SocialRecommendation {
  id: string;
  senderId: string;
  recipientId: string;
  responseStatus: RecommendationResponseStatus;
  progressStatus: RecommendationProgressStatus;
  senderNote?: string;
  recipientResponseNote?: string;
  media: SocialMediaEntitySnapshot;
  canonicalMediaKey: string;
  alreadyInLibrary: boolean;
  createdAt: string;
  respondedAt?: string;
  startedAt?: string;
  completedAt?: string;
  withdrawnAt?: string;
  updatedAt?: string;
  lastEvent?: SocialRecommendationEvent;
  lastMessagePreview?: Pick<SocialRecommendationMessage, "body" | "createdAt"> & { authorId: string };
  unreadMessageCount: number;
  other: SocialEntityActor;
}

export interface SocialRecommendationEvent {
  id: string;
  eventType: RecommendationEventType;
  actorId?: string;
  createdAt: string;
}

export interface SocialRecommendationMessage {
  id: string;
  body?: string;
  deleted: boolean;
  createdAt: string;
  author: SocialEntityActor;
}

export interface SocialRecommendationDetail {
  events: SocialRecommendationEvent[];
  messages: SocialRecommendationMessage[];
  threadOpen: boolean;
}

export interface SocialNotification {
  id: string;
  type: SocialNotificationType;
  entityType: "profile" | "activity" | "comment" | "recommendation";
  entityId?: string;
  payload: Record<string, string | number | boolean | null>;
  createdAt: string;
  readAt?: string;
  actor?: SocialEntityActor;
}

export interface ActivityPreferences {
  shareCompleted: boolean;
  shareStarted: boolean;
  shareRating: boolean;
  shareFavorite: boolean;
  shareRecommendationCompleted: boolean;
  defaultVisibility: ModuleVisibility;
}

export interface NotificationPreferences {
  follow: boolean;
  comments: boolean;
  reactions: boolean;
  recommendationReceived: boolean;
  recommendationAccepted: boolean;
  recommendationStarted: boolean;
  recommendationCompleted: boolean;
  recommendationRejected: boolean;
  recommendationWithdrawn: boolean;
}

export interface SocialPreferences {
  configured: boolean;
  recommendationPermission: RecommendationPermission;
  activity: ActivityPreferences;
  notifications: NotificationPreferences;
}

export const DEFAULT_ACTIVITY_PREFERENCES: ActivityPreferences = {
  shareCompleted: true,
  shareStarted: false,
  shareRating: false,
  shareFavorite: false,
  shareRecommendationCompleted: false,
  defaultVisibility: "followers",
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  follow: true,
  comments: true,
  reactions: true,
  recommendationReceived: true,
  recommendationAccepted: true,
  recommendationStarted: true,
  recommendationCompleted: true,
  recommendationRejected: false,
  recommendationWithdrawn: true,
};

export function canonicalMediaKey(media: Pick<MediaItem, "id" | "title" | "type" | "externalSource" | "externalId">): string {
  if (media.externalSource && media.externalId) return `${media.externalSource}:${media.externalId}`.toLowerCase();
  return `local:${media.type}:${media.title.trim().toLocaleLowerCase("tr-TR")}`;
}

export function mediaWorld(type: MediaType): SocialMediaEntitySnapshot["world"] {
  if (["anime", "manga", "manhwa", "manhua"].includes(type)) return "east";
  if (["book", "light_novel", "web_novel", "visual_novel"].includes(type)) return "arch";
  return "screen";
}

export function mediaToSocialSnapshot(media: MediaItem): SocialMediaEntitySnapshot {
  const overview = media.overview?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
  return {
    title: media.title.replace(/[<>]/g, "").trim(),
    mediaType: media.type,
    externalSource: media.externalSource,
    externalId: media.externalId,
    canonicalKey: canonicalMediaKey(media),
    coverUrl: media.coverImage?.startsWith("https://") ? media.coverImage : undefined,
    overview: overview || undefined,
    world: mediaWorld(media.type),
    progressSummary: media.totalProgress > 0 ? `${media.currentProgress}/${media.totalProgress}` : undefined,
  };
}

export function isStartedStatus(status: MediaStatus): boolean {
  return status === "watching" || status === "reading";
}

export function deriveActivityEvents(previous: MediaItem | undefined, next: MediaItem, preferences: ActivityPreferences): ActivityEventType[] {
  const events: ActivityEventType[] = [];
  if (previous && preferences.shareStarted && !isStartedStatus(previous.status) && isStartedStatus(next.status)) events.push("media_started");
  if (previous && preferences.shareCompleted && previous.status !== "completed" && next.status === "completed") events.push("media_completed");
  if (previous && preferences.shareRating && previous.userRating !== next.userRating && next.userRating !== null && next.userRating !== undefined) events.push("rating_shared");
  if (previous && preferences.shareFavorite && !previous.favorite && next.favorite) events.push("favorite_shared");
  return events;
}

export function isRecommendationTransitionAllowed(
  response: RecommendationResponseStatus,
  progress: RecommendationProgressStatus,
  action: "accept" | "defer" | "reject" | "withdraw" | "linked" | "started" | "completed",
): boolean {
  if (["accept", "defer", "reject"].includes(action)) return response === "pending" || response === "deferred";
  if (action === "withdraw") return response === "pending" || response === "deferred";
  if (response !== "accepted") return false;
  if (action === "linked") return progress === "none";
  if (action === "started") return progress === "none" || progress === "linked";
  return progress === "linked" || progress === "started" || progress === "completed";
}

export function notificationHref(notification: Pick<SocialNotification, "entityType" | "entityId" | "actor" | "payload">): string {
  if (notification.entityType === "recommendation") return `/recommendations${notification.entityId ? `#${notification.entityId}` : ""}`;
  if (notification.entityType === "activity" || notification.entityType === "comment") {
    const activityId = notification.entityType === "comment" && typeof notification.payload.activityId === "string" ? notification.payload.activityId : notification.entityId;
    return `/feed${activityId ? `#${activityId}` : ""}`;
  }
  return notification.actor?.username ? `/u/${notification.actor.username}` : "/people";
}
