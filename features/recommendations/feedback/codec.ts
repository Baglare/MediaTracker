import { isAspectId } from "../domain/aspect-registry";
import { RECOMMENDATION_MEDIA_TYPES, RECOMMENDATION_PROVIDERS, type RecommendationDecodeResult, type RecommendationDomainIssue } from "../domain/types";
import {
  RECOMMENDATION_FEEDBACK_V2_VERSION,
  type RecommendationFeedbackEventV2,
  type RecommendationFeedbackReasonCode,
  type RecommendationFeedbackV2Action,
} from "./types";

const ACTIONS = new Set<RecommendationFeedbackV2Action>(["shown", "dismissed", "similar_requested", "added", "open_discover"]);
const REASONS = new Set<RecommendationFeedbackReasonCode>(["weak_requested_aspect", "too_much_aspect", "wrong_tone", "too_long", "ongoing_not_wanted", "love_triangle", "fanservice", "violence_gore", "already_known", "reference_mismatch", "not_interested_now", "other"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
}

export function decodeRecommendationFeedbackEventV2(value: unknown): RecommendationDecodeResult<RecommendationFeedbackEventV2> {
  if (!record(value)) return { ok: false, issues: [issue("feedback_not_object", "$", "Feedback nesne olmalıdır.")] };
  const issues: RecommendationDomainIssue[] = [];
  if (value.version !== RECOMMENDATION_FEEDBACK_V2_VERSION) issues.push(issue("feedback_version_invalid", "version", "Feedback V2 version=2 olmalıdır."));
  const id = text(value.id, 128);
  if (!id) issues.push(issue("feedback_id_invalid", "id", "Feedback id geçersiz."));
  if (!ACTIONS.has(value.action as RecommendationFeedbackV2Action)) issues.push(issue("feedback_action_invalid", "action", "Feedback action geçersiz."));
  if (value.resultKind !== "primary" && value.resultKind !== "near_match") issues.push(issue("feedback_result_kind_invalid", "resultKind", "Result kind geçersiz."));
  if (value.reasonCode !== undefined && !REASONS.has(value.reasonCode as RecommendationFeedbackReasonCode)) issues.push(issue("feedback_reason_invalid", "reasonCode", "Feedback nedeni geçersiz."));
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) issues.push(issue("feedback_created_at_invalid", "createdAt", "createdAt geçersiz."));
  if (!record(value.candidateIdentity)) issues.push(issue("feedback_identity_required", "candidateIdentity", "Exact candidate identity zorunludur."));
  const identity = record(value.candidateIdentity) ? value.candidateIdentity : {};
  if (identity.kind === "provider") {
    if (!RECOMMENDATION_PROVIDERS.includes(identity.provider as never) || !text(identity.externalId, 160)) issues.push(issue("feedback_provider_identity_invalid", "candidateIdentity", "Provider ve externalId zorunludur."));
  } else if (identity.kind === "library") {
    if (!text(identity.libraryItemId, 160)) issues.push(issue("feedback_library_identity_invalid", "candidateIdentity", "Library item id zorunludur."));
  } else issues.push(issue("feedback_identity_kind_invalid", "candidateIdentity.kind", "Identity kind geçersiz."));
  if (!RECOMMENDATION_MEDIA_TYPES.includes(identity.mediaType as never)) issues.push(issue("feedback_media_type_invalid", "candidateIdentity.mediaType", "Media type geçersiz."));
  const aspectIds = Array.isArray(value.aspectIds) ? [...new Set(value.aspectIds)] : [];
  if (!Array.isArray(value.aspectIds) || aspectIds.some((entry) => !isAspectId(entry))) issues.push(issue("feedback_aspects_invalid", "aspectIds", "Aspect id listesi geçersiz."));
  const constraintKeys = Array.isArray(value.constraintKeys) ? [...new Set(value.constraintKeys)].filter((entry): entry is string => Boolean(text(entry, 240))) : [];
  if (!Array.isArray(value.constraintKeys) || constraintKeys.length !== new Set(value.constraintKeys).size) issues.push(issue("feedback_constraints_invalid", "constraintKeys", "Constraint key listesi geçersiz."));
  if (issues.length || !id) return { ok: false, issues };
  return { ok: true, value: { version: 2, id, action: value.action as RecommendationFeedbackV2Action, candidateIdentity: identity as RecommendationFeedbackEventV2["candidateIdentity"], ...(typeof value.requestId === "string" ? { requestId: value.requestId.slice(0, 128) } : {}), ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId.slice(0, 128) } : {}), resultKind: value.resultKind as "primary" | "near_match", ...(value.reasonCode ? { reasonCode: value.reasonCode as RecommendationFeedbackReasonCode } : {}), aspectIds: aspectIds as RecommendationFeedbackEventV2["aspectIds"], constraintKeys, createdAt: value.createdAt as string, ...(record(value.metadata) ? { metadata: { ...(typeof value.metadata.fitLabel === "string" ? { fitLabel: value.metadata.fitLabel.slice(0, 120) } : {}), ...(value.metadata.objectiveField === "length" || value.metadata.objectiveField === "release_status" ? { objectiveField: value.metadata.objectiveField } : {}) } } : {}) } };
}
