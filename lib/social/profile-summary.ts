import type { ImageTransform } from "@/lib/personalization/image-transform";
import type { ProfilePresentationPreferences } from "@/lib/personalization/types";
import type { ProfileVisibility } from "@/lib/social/types";

export interface OwnProfileSummary {
  displayName?: string;
  tagline?: string;
  avatarUrl?: string;
  selectedTitle?: string;
  avatarTransform?: ImageTransform;
}

export interface OwnProfileHeroData extends OwnProfileSummary {
  username?: string;
  bio?: string;
  bannerUrl?: string;
  visibilityMode?: ProfileVisibility;
  presentation?: ProfilePresentationPreferences;
}

export const PROFILE_SUMMARY_EVENT = "media-tracker:profile-summary";

export function publishOwnProfileSummary(summary: OwnProfileSummary): void {
  window.dispatchEvent(new CustomEvent<OwnProfileSummary>(PROFILE_SUMMARY_EVENT, { detail: summary }));
}
