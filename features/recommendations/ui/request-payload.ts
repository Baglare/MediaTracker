import type { MediaItem } from "@/lib/types";

export const RECOMMENDATION_MEDIA_PAYLOAD_LIMIT = 1000;
export const INTERPRET_REFERENCE_PAYLOAD_LIMIT = 500;

export interface RecommendationPayloadToggles {
  ratings: boolean;
  favorites: boolean;
  progress: boolean;
  notes: boolean;
  profile: boolean;
}

export function buildInterpretReferencePayload(items: readonly MediaItem[]) {
  return items.slice(0, INTERPRET_REFERENCE_PAYLOAD_LIMIT).map((item) => ({
    title: item.title,
    type: item.type,
    externalSource: item.externalSource,
    externalId: item.externalId,
  }));
}

export function buildRecommendationMediaPayload(
  items: readonly MediaItem[],
  toggles: RecommendationPayloadToggles,
): MediaItem[] {
  return items.slice(0, RECOMMENDATION_MEDIA_PAYLOAD_LIMIT).map((item) => {
    const sanitized: MediaItem = { ...item, currentProgress: toggles.progress ? item.currentProgress : 0 };
    delete sanitized.releaseCalendar;
    if (!toggles.ratings) { delete sanitized.userRating; delete sanitized.rating; }
    if (!toggles.favorites) delete sanitized.favorite;
    if (!toggles.profile) delete sanitized.tags;
    if (!toggles.notes) delete sanitized.personalNotes;
    return sanitized;
  });
}
