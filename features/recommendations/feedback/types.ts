import type { AspectId } from "../domain/aspect-registry";
import type { RecommendationMediaType, RecommendationProvider } from "../domain/types";

export const RECOMMENDATION_FEEDBACK_V2_VERSION = 2 as const;

export type RecommendationFeedbackV2Action =
  | "shown"
  | "dismissed"
  | "similar_requested"
  | "added"
  | "open_discover";

export type RecommendationFeedbackReasonCode =
  | "weak_requested_aspect"
  | "too_much_aspect"
  | "wrong_tone"
  | "too_long"
  | "ongoing_not_wanted"
  | "love_triangle"
  | "fanservice"
  | "violence_gore"
  | "already_known"
  | "reference_mismatch"
  | "not_interested_now"
  | "other";

export type RecommendationFeedbackCandidateIdentity =
  | {
      kind: "provider";
      provider: RecommendationProvider;
      externalId: string;
      mediaType: RecommendationMediaType;
    }
  | {
      kind: "library";
      libraryItemId: string;
      mediaType: RecommendationMediaType;
    };

export interface RecommendationFeedbackEventV2 {
  version: typeof RECOMMENDATION_FEEDBACK_V2_VERSION;
  id: string;
  action: RecommendationFeedbackV2Action;
  candidateIdentity: RecommendationFeedbackCandidateIdentity;
  requestId?: string;
  sessionId?: string;
  resultKind: "primary" | "near_match";
  reasonCode?: RecommendationFeedbackReasonCode;
  aspectIds: readonly AspectId[];
  constraintKeys: readonly string[];
  createdAt: string;
  metadata?: {
    fitLabel?: string;
    objectiveField?: "length" | "release_status";
  };
}
