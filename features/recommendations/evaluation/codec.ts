import { decodeRecommendationRequestV2 } from "../domain/codec";
import { ASPECT_STRENGTH_LEVELS, EVIDENCE_CONFIDENCES, RECOMMENDATION_PROVIDERS, RECOMMENDATION_MEDIA_TYPES, type RecommendationDecodeResult, type RecommendationDomainIssue } from "../domain/types";
import { isAspectId } from "../domain/aspect-registry";
import { isCandidateProviderEvidenceSnapshot } from "../providers/evidence-cache";
import { RECOMMENDATION_EVALUATION_VERSION, type RecommendationEvaluationCase } from "./types";

function issue(code: string, path: string, message: string): RecommendationDomainIssue { return { code, path, message }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactIdentity(value: unknown): boolean {
  if (!record(value)) return false;
  return value.verified === true
    && RECOMMENDATION_PROVIDERS.includes(value.primaryProvider as never)
    && RECOMMENDATION_MEDIA_TYPES.includes(value.mediaType as never)
    && typeof value.primaryExternalId === "string" && value.primaryExternalId.length > 0
    && typeof value.canonicalKey === "string" && value.canonicalKey.length > 0;
}

export function decodeRecommendationEvaluationCase(value: unknown): RecommendationDecodeResult<RecommendationEvaluationCase> {
  if (!record(value)) return { ok: false, issues: [issue("evaluation_case_invalid", "$", "Evaluation case nesne olmalıdır.")] };
  const allowed = new Set(["version", "id", "locale", "queryText", "structuredRequest", "strictness", "libraryProfileFixture", "candidates", "expectedConstraints", "candidateLabels", "expectedPrimaryIds", "expectedNearMatchIds", "notes"]);
  const issues = Object.keys(value).filter((key) => !allowed.has(key)).map((key) => issue("evaluation_unknown_field", `$.${key}`, "Bilinmeyen evaluation alanı kabul edilmez."));
  if (value.version !== RECOMMENDATION_EVALUATION_VERSION) issues.push(issue("evaluation_version_invalid", "version", "Evaluation version=1 olmalıdır."));
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(value.id)) issues.push(issue("evaluation_id_invalid", "id", "Evaluation id geçersiz."));
  if (typeof value.queryText !== "string" || !value.queryText.trim() || value.queryText.length > 4000) issues.push(issue("evaluation_query_invalid", "queryText", "Evaluation query geçersiz."));
  const request = decodeRecommendationRequestV2(value.structuredRequest);
  if (!request.ok) issues.push(...request.issues.map((entry) => ({ ...entry, path: `structuredRequest.${entry.path}` })));
  if (request.ok && value.strictness !== request.value.strictness) issues.push(issue("evaluation_strictness_mismatch", "strictness", "Case strictness structured request ile eşleşmelidir."));
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  if (!Array.isArray(value.candidates) || candidates.length > 64 || candidates.some((entry) => !isCandidateProviderEvidenceSnapshot(entry))) issues.push(issue("evaluation_candidates_invalid", "candidates", "Candidate snapshot listesi geçersiz."));
  const labels = Array.isArray(value.candidateLabels) ? value.candidateLabels : [];
  if (!Array.isArray(value.candidateLabels) || labels.length > 64) issues.push(issue("evaluation_labels_invalid", "candidateLabels", "Candidate label listesi geçersiz."));
  const candidateKeys = new Set(candidates.flatMap((entry) => isCandidateProviderEvidenceSnapshot(entry) ? [entry.candidateIdentity.canonicalKey] : []));
  for (const [index, raw] of labels.entries()) {
    if (!record(raw) || !exactIdentity(raw.candidateIdentity)) { issues.push(issue("evaluation_label_identity_invalid", `candidateLabels.${index}.candidateIdentity`, "Exact candidate identity zorunludur.")); continue; }
    const identity = raw.candidateIdentity as { canonicalKey: string };
    if (!candidateKeys.has(identity.canonicalKey)) issues.push(issue("evaluation_label_candidate_missing", `candidateLabels.${index}`, "Label candidate snapshot ile eşleşmiyor."));
    if (![0, 1, 2, 3].includes(raw.relevanceGrade as number)) issues.push(issue("evaluation_relevance_grade_invalid", `candidateLabels.${index}.relevanceGrade`, "Relevance grade 0-3 olmalıdır."));
    if (typeof raw.hardConstraintPass !== "boolean" || typeof raw.expectedAvoidViolation !== "boolean") issues.push(issue("evaluation_hard_label_invalid", `candidateLabels.${index}`, "Hard label boolean olmalıdır."));
    if (!record(raw.expectedAspectLevels) || Object.entries(raw.expectedAspectLevels).some(([id, level]) => !isAspectId(id) || !ASPECT_STRENGTH_LEVELS.includes(level as never))) issues.push(issue("evaluation_aspect_levels_invalid", `candidateLabels.${index}.expectedAspectLevels`, "Aspect level label geçersiz."));
    if (!record(raw.expectedConfidenceBounds) || Object.entries(raw.expectedConfidenceBounds).some(([id, bound]) => !isAspectId(id) || !record(bound) || !EVIDENCE_CONFIDENCES.includes(bound.min as never) || !EVIDENCE_CONFIDENCES.includes(bound.max as never))) issues.push(issue("evaluation_confidence_bounds_invalid", `candidateLabels.${index}.expectedConfidenceBounds`, "Confidence bound geçersiz."));
    if (!Array.isArray(raw.supportedExplanationClaims) || !Array.isArray(raw.forbiddenExplanationClaims)) issues.push(issue("evaluation_explanation_claims_invalid", `candidateLabels.${index}`, "Explanation claim listeleri zorunludur."));
    if (!['primary', 'near_match', 'excluded'].includes(String(raw.expectedResultKind))) issues.push(issue("evaluation_result_kind_invalid", `candidateLabels.${index}.expectedResultKind`, "Result kind geçersiz."));
    if (!['provider_metadata', 'human_annotation', 'synthetic_contract'].includes(String(raw.labelSource))) issues.push(issue("evaluation_label_source_invalid", `candidateLabels.${index}.labelSource`, "Label source geçersiz."));
  }
  const stringLists = ["expectedConstraints", "expectedPrimaryIds", "expectedNearMatchIds", "notes"] as const;
  for (const key of stringLists) if (!Array.isArray(value[key]) || (value[key] as unknown[]).some((entry) => typeof entry !== "string")) issues.push(issue("evaluation_string_list_invalid", key, `${key} string listesi olmalıdır.`));
  if (!record(value.libraryProfileFixture) || value.libraryProfileFixture.synthetic !== true) issues.push(issue("evaluation_profile_fixture_invalid", "libraryProfileFixture", "Yalnız synthetic profile fixture kabul edilir."));
  return issues.length || !request.ok ? { ok: false, issues } : { ok: true, value: value as unknown as RecommendationEvaluationCase };
}
