export interface OwnProfileSummary {
  displayName?: string;
  tagline?: string;
  avatarUrl?: string;
  selectedTitle?: string;
}

export const PROFILE_SUMMARY_EVENT = "media-tracker:profile-summary";

export function publishOwnProfileSummary(summary: OwnProfileSummary): void {
  window.dispatchEvent(new CustomEvent<OwnProfileSummary>(PROFILE_SUMMARY_EVENT, { detail: summary }));
}
