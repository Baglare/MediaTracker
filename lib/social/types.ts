import type { MediaType } from "@/lib/types";
import type { ProfilePresentationPreferences } from "@/lib/personalization/types";
import type { PublicXpSummary } from "@/lib/xp/types";

export const PROFILE_VISIBILITIES = ["public", "protected", "personal"] as const;
export const MODULE_VISIBILITIES = ["public", "followers", "mutual", "self"] as const;
export const CONNECTION_COLORS = [
  "neutral",
  "violet",
  "blue",
  "cyan",
  "emerald",
  "amber",
  "orange",
  "red",
  "rose",
  "pink",
] as const;
export const PROFILE_MODULE_KEYS = [
  "favorites",
  "current",
  "stats",
  "progression",
  "badges",
  "follows",
  "shared_lists",
  "shared_notes",
  "activity",
] as const;

export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export type ModuleVisibility = (typeof MODULE_VISIBILITIES)[number];
export type ConnectionColor = (typeof CONNECTION_COLORS)[number];
export type ProfileModuleKey = (typeof PROFILE_MODULE_KEYS)[number];
export type SocialProfileStatus = "available" | "personal" | "not_found" | "unavailable" | "not_configured";
export type FollowStatus = "pending" | "accepted";
export type ViewerPreviewMode = "public" | "followers" | "mutual" | "self";

export interface SocialProfileInput {
  username: string;
  displayName: string;
  tagline: string;
  bio: string;
  location?: string;
  language?: string;
  visibilityMode: ProfileVisibility;
  connectionColor: ConnectionColor;
  selectedTitle?: string;
  presentation: ProfilePresentationPreferences;
}

export interface ProfileModuleLayout {
  moduleKey: ProfileModuleKey;
  enabled: boolean;
  visibility: ModuleVisibility;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  mobileOrder: number;
  config: Record<string, string | number | boolean | null>;
}

export interface SocialMediaSnapshot {
  title: string;
  mediaType: MediaType;
  externalSource?: string;
  externalId?: string;
  coverUrl?: string;
  world: "east" | "screen" | "arch";
  sortOrder: number;
}

export interface SocialStatsSnapshot {
  totalMedia: number;
  completed: number;
  active: number;
  planning: number;
  favorites: number;
  rated: number;
  worldCounts: { east: number; screen: number; arch: number };
  snapshotAt: string;
}

export interface SocialProgressionSnapshot {
  version: 1;
  totalXp: number;
  level: number;
  title: string;
  tier: string;
  dominantWorld: string;
  progressPercent: number;
  worldCounts: Record<string, number>;
  snapshotAt: string;
}

export interface SharedNoteInput {
  mediaTitle: string;
  mediaType: MediaType;
  externalSource?: string;
  externalId?: string;
  content: string;
  containsSpoiler: boolean;
  visibility: Exclude<ModuleVisibility, "self">;
  confirmed: boolean;
}

export interface RelationshipFacts {
  viewerFollowsOwner: FollowStatus | null;
  ownerFollowsViewer: FollowStatus | null;
  self: boolean;
  anonymous: boolean;
}

export type ConnectionState =
  | "none"
  | "viewer_follows"
  | "owner_follows"
  | "mutual"
  | "outbound_pending"
  | "inbound_pending"
  | "self"
  | "anonymous";

export interface SocialRelationshipSummary extends RelationshipFacts {
  state: ConnectionState;
  ownerColor: ConnectionColor;
  viewerColor: ConnectionColor;
}

export interface PublicSocialProfile {
  id: string;
  username: string;
  displayName: string;
  tagline: string;
  bio: string;
  location?: string;
  language?: string;
  visibilityMode: ProfileVisibility;
  connectionColor: ConnectionColor;
  avatarUrl?: string;
  bannerUrl?: string;
  joinedAt: string;
  selectedTitle?: string;
  presentation: ProfilePresentationPreferences;
  followerCount?: number;
  followingCount?: number;
}

export interface SocialProfilePayload {
  status: SocialProfileStatus;
  profile?: PublicSocialProfile;
  relationship?: SocialRelationshipSummary;
  modules: ProfileModuleLayout[];
  favorites: SocialMediaSnapshot[];
  current: SocialMediaSnapshot[];
  stats?: SocialStatsSnapshot;
  progression?: SocialProgressionSnapshot;
  xp?: PublicXpSummary;
  sharedNotes: Array<Omit<SharedNoteInput, "confirmed"> & { id: string; createdAt: string; updatedAt: string }>;
  activity?: Array<{ id: string; eventType: string; visibility: ModuleVisibility; media: { title: string; mediaType: MediaType; coverUrl?: string }; rating?: number; text?: string; createdAt: string }>;
  redirectUsername?: string;
}

export interface SocialPersonSummary {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  visibilityMode: ProfileVisibility;
  connectionColor: ConnectionColor;
  avatarUrl?: string;
  relationship: SocialRelationshipSummary;
  status?: FollowStatus;
}

export interface SocialProfileEditorData {
  configured: boolean;
  authenticated: boolean;
  profile?: SocialProfileInput & {
    avatarUrl?: string;
    bannerUrl?: string;
    usernameChangedAt?: string;
  };
  modules: ProfileModuleLayout[];
  favorites: SocialMediaSnapshot[];
  current: SocialMediaSnapshot[];
  sharedNotes: SocialProfilePayload["sharedNotes"];
  blockedAccounts: Array<{ id: string; username?: string; displayName: string }>;
}

export const DEFAULT_PROFILE_MODULES: readonly ProfileModuleLayout[] = [
  { moduleKey: "favorites", enabled: true, visibility: "public", gridX: 0, gridY: 0, gridWidth: 8, gridHeight: 2, mobileOrder: 0, config: {} },
  { moduleKey: "current", enabled: true, visibility: "followers", gridX: 8, gridY: 0, gridWidth: 4, gridHeight: 2, mobileOrder: 1, config: {} },
  { moduleKey: "stats", enabled: true, visibility: "public", gridX: 0, gridY: 2, gridWidth: 6, gridHeight: 2, mobileOrder: 2, config: {} },
  { moduleKey: "progression", enabled: true, visibility: "public", gridX: 6, gridY: 2, gridWidth: 6, gridHeight: 2, mobileOrder: 3, config: {} },
  { moduleKey: "badges", enabled: false, visibility: "public", gridX: 0, gridY: 4, gridWidth: 4, gridHeight: 2, mobileOrder: 4, config: {} },
  { moduleKey: "follows", enabled: true, visibility: "public", gridX: 4, gridY: 4, gridWidth: 4, gridHeight: 2, mobileOrder: 5, config: {} },
  { moduleKey: "shared_lists", enabled: false, visibility: "public", gridX: 8, gridY: 4, gridWidth: 4, gridHeight: 2, mobileOrder: 6, config: {} },
  { moduleKey: "shared_notes", enabled: true, visibility: "self", gridX: 0, gridY: 6, gridWidth: 12, gridHeight: 2, mobileOrder: 7, config: {} },
  { moduleKey: "activity", enabled: true, visibility: "followers", gridX: 0, gridY: 8, gridWidth: 12, gridHeight: 2, mobileOrder: 8, config: {} },
] as const;
