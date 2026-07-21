import type { ProfilePreferences } from "@/lib/profile-preferences";
import type { SocialProfileInput, SocialProgressionSnapshot, SocialStatsSnapshot } from "@/lib/social/types";
import type { MediaItem } from "@/lib/types";
import type { UserProgression } from "@/lib/user-progression";

export function socialWorldFor(type: MediaItem["type"]): "east" | "screen" | "arch" {
  if (type === "movie" || type === "tv") return "screen";
  if (type === "book") return "arch";
  return "east";
}

export function buildStatsSnapshot(media: MediaItem[], now = new Date()): SocialStatsSnapshot {
  const worldCounts = { east: 0, screen: 0, arch: 0 };
  for (const item of media) worldCounts[socialWorldFor(item.type)] += 1;
  return {
    totalMedia: media.length,
    completed: media.filter((item) => item.status === "completed").length,
    active: media.filter((item) => item.status === "watching" || item.status === "reading").length,
    planning: media.filter((item) => item.status === "planning").length,
    favorites: media.filter((item) => item.favorite).length,
    rated: media.filter((item) => typeof item.userRating === "number" || typeof item.rating === "number").length,
    worldCounts,
    snapshotAt: now.toISOString(),
  };
}

export function buildProgressionSnapshot(progression: UserProgression, now = new Date()): SocialProgressionSnapshot {
  return {
    version: 1,
    totalXp: progression.totalXp,
    level: progression.level,
    title: progression.title,
    tier: progression.tier,
    dominantWorld: progression.dominantWorld,
    progressPercent: progression.progressPercent,
    worldCounts: { ...progression.worldCounts },
    snapshotAt: now.toISOString(),
  };
}

export function prefillSocialProfile(preferences: ProfilePreferences, fallbackName: string, selectedTitle: string): SocialProfileInput {
  return {
    username: "",
    displayName: preferences.displayName.trim() || fallbackName,
    bio: preferences.profileTagline.trim(),
    visibilityMode: "personal",
    connectionColor: preferences.avatarAccent === "zinc" ? "neutral" : preferences.avatarAccent,
    selectedTitle,
  };
}

export function selectedSnapshotData(media: MediaItem[]): Array<Pick<MediaItem, "id" | "title" | "type" | "externalSource" | "externalId" | "coverImage">> {
  return media.map(({ id, title, type, externalSource, externalId, coverImage }) => ({ id, title, type, externalSource, externalId, coverImage }));
}

export function mediaItemToSocialSnapshot(item: MediaItem, sortOrder: number) {
  return { title: item.title, mediaType: item.type, externalSource: item.externalSource, externalId: item.externalId, coverUrl: item.coverImage || undefined, world: socialWorldFor(item.type), sortOrder } as const;
}
