/** Translate an SDK error to a closed application code; never propagate SQL/details/hint. */
const APPLICATION_CODES = new Set([
  "authentication_required",
  "social_not_configured",
  "social_profile_required",
  "profile_unavailable",
  "activity_unavailable",
  "activity_not_found",
  "comment_not_found",
  "parent_comment_unavailable",
  "target_unavailable",
  "recommendation_unavailable",
  "recommendation_not_found",
  "recommendation_not_allowed",
  "self_recommendation_not_allowed",
  "not_allowed",
  "invalid_transition",
  "duplicate_recommendation",
  "recipient_open_limit",
  "rate_limit",
  "duplicate_comment",
  "already_reported",
  "invalid_filter",
  "invalid_target",
  "invalid_comment",
  "invalid_reaction",
  "invalid_report",
  "invalid_media_state",
  "unsafe_media_state",
  "duplicate_media_state",
  "library_full_sync_required",
  "badge_not_earned",
  "title_not_earned",
  "theme_sync_payload_invalid"
]);

export function supabaseApplicationError(error: unknown): Error {
  try {
    const message = typeof error === "object" && error !== null ? Object.getOwnPropertyDescriptor(error, "message")?.value : undefined;
    if (typeof message === "string" && APPLICATION_CODES.has(message)) return new Error(message);
  } catch { /* Untrusted error shapes fail closed. */ }
  return new Error("database_operation_failed");
}
