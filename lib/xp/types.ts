import type { MediaType } from "@/lib/types";

export const XP_LOCAL_EVENT_TYPES = ["media_started", "media_completed", "media_rated"] as const;
export type XpLocalEventType = (typeof XP_LOCAL_EVENT_TYPES)[number];
export type XpLocalEntitlementType = XpLocalEventType | "review_published" | "showcase_curated";
export type XpTrustLevel = "local_attested" | "social_verified" | "legacy_attested" | "system";
export type XpEventAction = "grant" | "revoke" | "restore";
export type XpWorldKey = "east" | "screen" | "arch";
export type XpBranchKey = "tracker" | "explorer" | "critic" | "curator" | "connector";
export type XpTier = "basic" | "refined" | "elite" | "master";

export interface XpSafeMediaSnapshot {
  title: string;
  mediaType: MediaType;
  externalSource?: string;
  externalId?: string;
  canonicalKey: string;
  coverUrl?: string;
  userRating?: number;
}

export interface XpSafeMediaState {
  canonicalMediaKey: string;
  title: string;
  mediaType: MediaType;
  status: MediaItemStatus;
  progress: number;
  totalProgress: number;
  hasRating: boolean;
  deleted: boolean;
  stateHash: string;
}

export interface XpAllocation {
  axisType: "general" | "world" | "branch";
  axisKey: "general" | XpWorldKey | XpBranchKey;
  amount: number;
}

export interface XpEventSummary {
  id: string;
  eventType: string;
  trustLevel: XpTrustLevel;
  action: XpEventAction;
  effect: 1 | -1;
  occurredAt: string;
  metadata: Record<string, unknown>;
  allocations: XpAllocation[];
}

export interface XpWorldSummary {
  key: XpWorldKey;
  xp: number;
  level: number;
  tier: XpTier;
  title: string;
}

export interface XpBranchSummary {
  key: XpBranchKey;
  xp: number;
  level: number;
  tier: XpTier;
}

export interface XpQuestSummary {
  key: string;
  name: string;
  description: string;
  target: number;
  rewardXp: number;
  active: boolean;
  currentValue: number;
  completedAt?: string;
}

export interface XpBadgeSummary {
  key: string;
  name: string;
  description: string;
  iconKey: string;
  tier: XpTier;
  awardedAt: string;
  selected: boolean;
  displayOrder?: number;
}

export interface XpDashboardSummary {
  version: 2;
  totalXp: number;
  level: number;
  currentLevelStartXp: number;
  nextLevelStartXp: number;
  worlds: XpWorldSummary[];
  branches: XpBranchSummary[];
  events: XpEventSummary[];
  quests: XpQuestSummary[];
  badges: XpBadgeSummary[];
  breakdown: {
    localCurrentXp: number;
    socialXp: number;
    systemXp: number;
    legacyCorrectionXp: number;
  };
  legacyImported: boolean;
  librarySynchronized: boolean;
  selectedTitle?: string;
}

type MediaItemStatus = "planning" | "watching" | "reading" | "completed" | "dropped" | "paused";

export interface PublicXpSummary {
  totalXp?: number;
  level?: number;
  selectedTitle?: string;
  worlds: XpWorldSummary[];
  branches: XpBranchSummary[];
  badges: Array<Pick<XpBadgeSummary, "key" | "name" | "description" | "iconKey" | "tier" | "displayOrder">>;
  legacyImported: boolean;
}

export interface XpLegacyAggregate {
  mediaCount: number;
  progressLogCount: number;
  completedCount: number;
  ratedCount: number;
  favoriteCount: number;
  notedCount: number;
  worldCounts: Record<XpWorldKey, number>;
}
