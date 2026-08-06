import type { MediaType } from "@/lib/types";

export type AspectId = import("./aspect-registry").AspectId;

export type AspectGroup =
  | "core"
  | "narrative"
  | "relationship"
  | "tone_content"
  | "experience";

export type AspectSupportLevel =
  | "strong"
  | "partial"
  | "experimental"
  | "unsupported";

export type AspectEvidenceStrategy =
  | "exact_taxonomy"
  | "ranked_tag"
  | "semantic_required"
  | "soft_only";

export type AspectStrengthLevel =
  | "primary"
  | "significant"
  | "incidental"
  | "absent"
  | "unknown";

export type EvidenceConfidence = "high" | "medium" | "low" | "unknown";

export type EvidenceSourceKind =
  | "provider_genre"
  | "provider_tag_rank"
  | "provider_keyword"
  | "provider_metadata"
  | "synopsis_classifier"
  | "local_semantic_verifier"
  | "remote_llm_verifier"
  | "user_feedback";

export type SemanticVerifierMode =
  | "structured_only"
  | "local_enhanced"
  | "remote_enhanced";

export type RecommendationProvider =
  | "anilist"
  | "tvmaze"
  | "tmdb"
  | "omdb"
  | "openlibrary";

export type ConstraintRole = "must" | "prefer" | "avoid";
export type ConstraintSource = "explicit" | "inferred" | "profile";
export type RecommendationStrictness = "strict" | "balanced" | "exploratory";

export type RecommendationMediaType = Extract<
  MediaType,
  "anime" | "manga" | "manhwa" | "manhua" | "tv" | "movie" | "book"
>;

export type ConstraintSafety = "safe" | "conditional" | "unsafe";

export type SemanticVerifierRequirement =
  | "not_required"
  | "recommended"
  | "required_for_hard_decision";

export const ASPECT_GROUPS: readonly AspectGroup[] = [
  "core",
  "narrative",
  "relationship",
  "tone_content",
  "experience",
];

export const ASPECT_SUPPORT_LEVELS: readonly AspectSupportLevel[] = [
  "strong",
  "partial",
  "experimental",
  "unsupported",
];

export const ASPECT_EVIDENCE_STRATEGIES: readonly AspectEvidenceStrategy[] = [
  "exact_taxonomy",
  "ranked_tag",
  "semantic_required",
  "soft_only",
];

export const ASPECT_STRENGTH_LEVELS: readonly AspectStrengthLevel[] = [
  "primary",
  "significant",
  "incidental",
  "absent",
  "unknown",
];

export const EVIDENCE_CONFIDENCES: readonly EvidenceConfidence[] = [
  "high",
  "medium",
  "low",
  "unknown",
];

export const EVIDENCE_SOURCE_KINDS: readonly EvidenceSourceKind[] = [
  "provider_genre",
  "provider_tag_rank",
  "provider_keyword",
  "provider_metadata",
  "synopsis_classifier",
  "local_semantic_verifier",
  "remote_llm_verifier",
  "user_feedback",
];

export const SEMANTIC_VERIFIER_MODES: readonly SemanticVerifierMode[] = [
  "structured_only",
  "local_enhanced",
  "remote_enhanced",
];

export const RECOMMENDATION_PROVIDERS: readonly RecommendationProvider[] = [
  "anilist",
  "tvmaze",
  "tmdb",
  "omdb",
  "openlibrary",
];

export const CONSTRAINT_ROLES: readonly ConstraintRole[] = ["must", "prefer", "avoid"];
export const CONSTRAINT_SOURCES: readonly ConstraintSource[] = ["explicit", "inferred", "profile"];
export const RECOMMENDATION_STRICTNESS_VALUES: readonly RecommendationStrictness[] = [
  "strict",
  "balanced",
  "exploratory",
];

export const RECOMMENDATION_MEDIA_TYPES: readonly RecommendationMediaType[] = [
  "anime",
  "manga",
  "manhwa",
  "manhua",
  "tv",
  "movie",
  "book",
];

export interface RecommendationDomainIssue {
  code: string;
  path: string;
  message: string;
}

export type RecommendationDecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: RecommendationDomainIssue[] };
