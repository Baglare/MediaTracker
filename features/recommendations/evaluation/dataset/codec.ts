import { isAspectId } from "../../domain/aspect-registry";
import {
  RECOMMENDATION_MEDIA_TYPES,
  RECOMMENDATION_PROVIDERS,
  type RecommendationDecodeResult,
  type RecommendationDomainIssue,
} from "../../domain/types";
import { createCandidateCanonicalKey } from "../../providers/candidate-identity";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import { validateDatasetPackage } from "./validation";
import {
  ANNOTATION_LABELS,
  ANNOTATION_SCHEMA_VERSION,
  ASPECT_VERIFIER_LEVELS,
  DATASET_ALLOWED_USES,
  DATASET_SCHEMA_VERSION,
  DATASET_SOURCE_TYPES,
  DATASET_SPLITS,
  DATASET_USE_CLASSES,
  VERIFIER_INPUT_SCHEMA_VERSION,
  VERIFIER_OUTPUT_SCHEMA_VERSION,
  type AnnotationEvidenceSpan,
  type AspectAnnotationRecord,
  type AspectVerifierOutput,
  type CandidateTextBundle,
  type DatasetAttributionPolicy,
  type DatasetManifest,
  type DatasetPackage,
  type DatasetRecord,
  type DatasetRecordProvenance,
  type DatasetRetentionPolicy,
  type DatasetSourcePolicy,
  type DatasetSplitPolicy,
} from "./types";

export const D7_TEXT_LIMITS = {
  title: 300,
  shortSummary: 600,
  taxonomyValue: 80,
  evidenceNote: 280,
  transformationNote: 500,
  warning: 240,
} as const;

const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{1,119}$/;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SECONDARY_ID_KINDS = ["imdb", "tmdb", "tvmaze", "anilist", "openlibrary_work", "openlibrary_edition", "thetvdb"] as const;

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownFields(value: Record<string, unknown>, allowed: readonly string[], path: string): RecommendationDomainIssue[] {
  const keys = new Set(allowed);
  return Object.keys(value).filter((key) => !keys.has(key)).map((key) => (
    issue("dataset_unknown_field", `${path}.${key}`, "Bilinmeyen D7 contract alanı kabul edilmez.")
  ));
}

function asEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && values.includes(value as T) ? value as T : undefined;
}

function textValue(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function isoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const parsed = value.map((entry) => textValue(entry, maxLength));
  if (parsed.some((entry) => entry === undefined)) return undefined;
  const result = parsed as string[];
  return new Set(result).size === result.length ? result : undefined;
}

function decodeAttribution(value: unknown, path: string): RecommendationDecodeResult<DatasetAttributionPolicy> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_attribution_invalid", path, "Attribution policy nesne olmalıdır.")] };
  const issues = unknownFields(value, ["required", "text", "url"], path);
  const text = value.text === undefined ? undefined : textValue(value.text, 400);
  const url = value.url === undefined ? undefined : textValue(value.url, 500);
  if (typeof value.required !== "boolean") issues.push(issue("dataset_attribution_required_invalid", `${path}.required`, "Attribution required boolean olmalıdır."));
  if (value.text !== undefined && !text) issues.push(issue("dataset_attribution_text_invalid", `${path}.text`, "Attribution text geçersizdir."));
  if (value.url !== undefined && (!url || !/^https:\/\//.test(url))) issues.push(issue("dataset_attribution_url_invalid", `${path}.url`, "Attribution URL HTTPS olmalıdır."));
  if (value.required === true && !text && !url) issues.push(issue("dataset_attribution_evidence_missing", path, "Zorunlu attribution text veya URL taşımalıdır."));
  if (issues.length > 0 || typeof value.required !== "boolean") return { ok: false, issues };
  return { ok: true, value: { required: value.required, ...(text ? { text } : {}), ...(url ? { url } : {}) } };
}

function decodeRetention(value: unknown, path: string): RecommendationDecodeResult<DatasetRetentionPolicy> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_retention_invalid", path, "Retention policy nesne olmalıdır.")] };
  const issues = unknownFields(value, ["mode", "maxDays", "deleteOnRevocation"], path);
  const mode = asEnum(value.mode, ["ephemeral", "bounded", "indefinite"] as const);
  const maxDays = value.maxDays;
  if (!mode) issues.push(issue("dataset_retention_mode_invalid", `${path}.mode`, "Retention mode geçersizdir."));
  if (typeof value.deleteOnRevocation !== "boolean") issues.push(issue("dataset_retention_revocation_invalid", `${path}.deleteOnRevocation`, "deleteOnRevocation boolean olmalıdır."));
  if (mode === "bounded" && (!Number.isInteger(maxDays) || (maxDays as number) < 1 || (maxDays as number) > 3650)) {
    issues.push(issue("dataset_retention_days_invalid", `${path}.maxDays`, "Bounded retention 1-3650 gün olmalıdır."));
  }
  if (mode !== "bounded" && maxDays !== undefined) issues.push(issue("dataset_retention_days_forbidden", `${path}.maxDays`, "maxDays yalnız bounded retention için kullanılabilir."));
  if (issues.length > 0 || !mode || typeof value.deleteOnRevocation !== "boolean") return { ok: false, issues };
  return { ok: true, value: { mode, ...(mode === "bounded" ? { maxDays: maxDays as number } : {}), deleteOnRevocation: value.deleteOnRevocation } };
}

export function decodeDatasetSourcePolicy(value: unknown, path = "$" ): RecommendationDecodeResult<DatasetSourcePolicy> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_source_policy_invalid", path, "DatasetSourcePolicy nesne olmalıdır.")] };
  const issues = unknownFields(value, ["sourceId", "sourceType", "useClass", "allowedUses", "licenseStatus", "attribution", "retention", "redistribution", "notes"], path);
  const sourceId = textValue(value.sourceId, 120);
  const sourceType = asEnum(value.sourceType, DATASET_SOURCE_TYPES);
  const useClass = asEnum(value.useClass, DATASET_USE_CLASSES);
  const allowedUses = Array.isArray(value.allowedUses)
    && value.allowedUses.length <= DATASET_ALLOWED_USES.length
    && value.allowedUses.every((entry) => asEnum(entry, DATASET_ALLOWED_USES))
    && new Set(value.allowedUses).size === value.allowedUses.length
    ? value.allowedUses as DatasetSourcePolicy["allowedUses"] : undefined;
  const licenseStatus = asEnum(value.licenseStatus, ["confirmed", "conditional", "unresolved"] as const);
  const redistribution = asEnum(value.redistribution, ["prohibited", "internal_only", "allowed_with_attribution", "allowed"] as const);
  const notes = stringList(value.notes, 32, D7_TEXT_LIMITS.transformationNote);
  const attribution = decodeAttribution(value.attribution, `${path}.attribution`);
  const retention = decodeRetention(value.retention, `${path}.retention`);
  if (!sourceId || !ID_PATTERN.test(sourceId)) issues.push(issue("dataset_source_id_invalid", `${path}.sourceId`, "sourceId canonical olmalıdır."));
  if (!sourceType) issues.push(issue("dataset_source_type_invalid", `${path}.sourceType`, "sourceType geçersizdir."));
  if (!useClass) issues.push(issue("dataset_use_class_invalid", `${path}.useClass`, "D7 veri kullanım sınıfı geçersizdir."));
  if (!allowedUses) issues.push(issue("dataset_allowed_uses_invalid", `${path}.allowedUses`, "allowedUses benzersiz ve tanımlı değerlerden oluşmalıdır."));
  if (!licenseStatus) issues.push(issue("dataset_license_status_invalid", `${path}.licenseStatus`, "licenseStatus geçersizdir."));
  if (!redistribution) issues.push(issue("dataset_redistribution_invalid", `${path}.redistribution`, "redistribution geçersizdir."));
  if (!notes) issues.push(issue("dataset_source_notes_invalid", `${path}.notes`, "notes bounded string listesi olmalıdır."));
  if (!attribution.ok) issues.push(...attribution.issues);
  if (!retention.ok) issues.push(...retention.issues);
  if (allowedUses && useClass !== "training_allowed" && allowedUses.includes("training")) {
    issues.push(issue("dataset_training_use_forbidden", `${path}.allowedUses`, "training kullanımı yalnız training_allowed policy'de açılabilir."));
  }
  if (allowedUses && (licenseStatus === "unresolved" || useClass === "prohibited_or_unresolved") && allowedUses.includes("publication")) {
    issues.push(issue("dataset_publication_unresolved", `${path}.allowedUses`, "Unresolved/prohibited kaynak publication izni taşıyamaz."));
  }
  if (issues.length > 0 || !sourceId || !sourceType || !useClass || !allowedUses || !licenseStatus || !redistribution || !notes || !attribution.ok || !retention.ok) {
    return { ok: false, issues };
  }
  return { ok: true, value: { sourceId, sourceType, useClass, allowedUses, licenseStatus, attribution: attribution.value, retention: retention.value, redistribution, notes } };
}

function decodeSplitPolicy(value: unknown, path: string): RecommendationDecodeResult<DatasetSplitPolicy> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_split_policy_invalid", path, "splitPolicy nesne olmalıdır.")] };
  const issues = unknownFields(value, ["strategy", "trainPercent", "validationPercent", "testPercent", "groupKeys", "holdout", "goldTestFrozen"], path);
  const rawPercentages = [value.trainPercent, value.validationPercent, value.testPercent];
  const percentages = rawPercentages.filter((entry): entry is number => (
    typeof entry === "number" && Number.isFinite(entry) && entry >= 0 && entry <= 100
  ));
  if (value.strategy !== "franchise_group_aware") issues.push(issue("dataset_split_strategy_invalid", `${path}.strategy`, "Split franchise_group_aware olmalıdır."));
  if (percentages.length !== rawPercentages.length
    || Math.abs(percentages.reduce((sum, entry) => sum + Number(entry), 0) - 100) > 0.0001) {
    issues.push(issue("dataset_split_percent_invalid", path, "Train/validation/test yüzdeleri finite olmalı ve toplamı 100 olmalıdır."));
  }
  const groupKeys = Array.isArray(value.groupKeys) && value.groupKeys.length === 2
    && value.groupKeys.includes("leakageGroupId") && value.groupKeys.includes("exactProviderIdentity")
    ? value.groupKeys as DatasetSplitPolicy["groupKeys"] : undefined;
  if (!groupKeys) issues.push(issue("dataset_split_group_keys_invalid", `${path}.groupKeys`, "Leakage group ve exact identity birlikte korunmalıdır."));
  const holdout = asEnum(value.holdout, ["none", "time", "source"] as const);
  if (!holdout) issues.push(issue("dataset_split_holdout_invalid", `${path}.holdout`, "Holdout geçersizdir."));
  if (typeof value.goldTestFrozen !== "boolean") issues.push(issue("dataset_gold_test_frozen_invalid", `${path}.goldTestFrozen`, "goldTestFrozen boolean olmalıdır."));
  if (issues.length > 0 || !groupKeys || !holdout || typeof value.goldTestFrozen !== "boolean") return { ok: false, issues };
  return { ok: true, value: value as unknown as DatasetSplitPolicy };
}

export function decodeDatasetManifest(value: unknown): RecommendationDecodeResult<DatasetManifest> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_manifest_invalid", "$", "DatasetManifest nesne olmalıdır.")] };
  const issues = unknownFields(value, ["version", "datasetId", "createdAt", "updatedAt", "purpose", "schemaVersion", "aspectIds", "mediaTypes", "recordCount", "sourcePolicies", "splitPolicy", "annotationPolicyVersion", "licenseAuditVersion", "contentHash", "releaseStatus"], "$" );
  const datasetId = textValue(value.datasetId, 120);
  const purpose = textValue(value.purpose, 500);
  const annotationPolicyVersion = textValue(value.annotationPolicyVersion, 120);
  const licenseAuditVersion = textValue(value.licenseAuditVersion, 120);
  const releaseStatus = asEnum(value.releaseStatus, ["draft", "internal_only", "publishable"] as const);
  if (value.version !== DATASET_SCHEMA_VERSION || value.schemaVersion !== DATASET_SCHEMA_VERSION) issues.push(issue("dataset_manifest_version_invalid", "version", "Dataset version ve schemaVersion 1 olmalıdır."));
  if (!datasetId || !ID_PATTERN.test(datasetId)) issues.push(issue("dataset_id_invalid", "datasetId", "datasetId canonical olmalıdır."));
  if (!isoInstant(value.createdAt) || !isoInstant(value.updatedAt)) issues.push(issue("dataset_timestamp_invalid", "createdAt", "createdAt/updatedAt canonical ISO instant olmalıdır."));
  if (isoInstant(value.createdAt) && isoInstant(value.updatedAt) && Date.parse(value.updatedAt) < Date.parse(value.createdAt)) issues.push(issue("dataset_timestamp_order_invalid", "updatedAt", "updatedAt createdAt'ten eski olamaz."));
  if (!purpose) issues.push(issue("dataset_purpose_invalid", "purpose", "Dataset purpose zorunlu ve bounded olmalıdır."));
  const aspectIds = Array.isArray(value.aspectIds) && value.aspectIds.length > 0 && value.aspectIds.length <= 43
    && value.aspectIds.every(isAspectId) && new Set(value.aspectIds).size === value.aspectIds.length
    ? value.aspectIds as DatasetManifest["aspectIds"] : undefined;
  if (!aspectIds) issues.push(issue("dataset_aspect_ids_invalid", "aspectIds", "Aspect ID listesi registry'den, benzersiz ve 1-43 aralığında olmalıdır."));
  const mediaTypes = Array.isArray(value.mediaTypes) && value.mediaTypes.length > 0
    && value.mediaTypes.every((entry) => RECOMMENDATION_MEDIA_TYPES.includes(entry as never))
    && new Set(value.mediaTypes).size === value.mediaTypes.length
    ? value.mediaTypes as DatasetManifest["mediaTypes"] : undefined;
  if (!mediaTypes) issues.push(issue("dataset_media_types_invalid", "mediaTypes", "Media type listesi geçersizdir."));
  if (!Number.isInteger(value.recordCount) || Number(value.recordCount) < 0 || Number(value.recordCount) > 100000) issues.push(issue("dataset_record_count_invalid", "recordCount", "recordCount 0-100000 integer olmalıdır."));
  const sourcePolicies: DatasetSourcePolicy[] = [];
  if (!Array.isArray(value.sourcePolicies) || value.sourcePolicies.length === 0 || value.sourcePolicies.length > 64) {
    issues.push(issue("dataset_source_policies_invalid", "sourcePolicies", "En az bir, en fazla 64 source policy zorunludur."));
  } else {
    value.sourcePolicies.forEach((entry, index) => {
      const decoded = decodeDatasetSourcePolicy(entry, `sourcePolicies.${index}`);
      if (decoded.ok) sourcePolicies.push(decoded.value); else issues.push(...decoded.issues);
    });
    if (new Set(sourcePolicies.map((policy) => policy.sourceId)).size !== sourcePolicies.length) issues.push(issue("dataset_source_policy_duplicate", "sourcePolicies", "sourceId tekrar edemez."));
  }
  const splitPolicy = decodeSplitPolicy(value.splitPolicy, "splitPolicy");
  if (!splitPolicy.ok) issues.push(...splitPolicy.issues);
  if (!annotationPolicyVersion || !ID_PATTERN.test(annotationPolicyVersion)) issues.push(issue("dataset_annotation_policy_version_invalid", "annotationPolicyVersion", "Annotation policy version canonical olmalıdır."));
  if (!licenseAuditVersion || !ID_PATTERN.test(licenseAuditVersion)) issues.push(issue("dataset_license_audit_version_invalid", "licenseAuditVersion", "License audit version canonical olmalıdır."));
  if (typeof value.contentHash !== "string" || !HASH_PATTERN.test(value.contentHash)) issues.push(issue("dataset_content_hash_invalid", "contentHash", "contentHash sha256:<64 hex> olmalıdır."));
  if (!releaseStatus) issues.push(issue("dataset_release_status_invalid", "releaseStatus", "releaseStatus geçersizdir."));
  if (issues.length > 0 || !datasetId || !purpose || !aspectIds || !mediaTypes || !splitPolicy.ok || !annotationPolicyVersion || !licenseAuditVersion || !releaseStatus) return { ok: false, issues };
  return { ok: true, value: { version: DATASET_SCHEMA_VERSION, datasetId, createdAt: value.createdAt as string, updatedAt: value.updatedAt as string, purpose, schemaVersion: DATASET_SCHEMA_VERSION, aspectIds, mediaTypes, recordCount: value.recordCount as number, sourcePolicies, splitPolicy: splitPolicy.value, annotationPolicyVersion, licenseAuditVersion, contentHash: value.contentHash as string, releaseStatus } };
}

function decodeExactIdentity(value: unknown, path: string): RecommendationDecodeResult<RecommendationCandidateIdentity> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_exact_identity_invalid", path, "Exact provider identity nesne olmalıdır.")] };
  const issues = unknownFields(value, ["primaryProvider", "primaryExternalId", "mediaType", "verified", "secondaryIds", "canonicalKey", "verificationEvidence"], path);
  const provider = asEnum(value.primaryProvider, RECOMMENDATION_PROVIDERS);
  const mediaType = asEnum(value.mediaType, RECOMMENDATION_MEDIA_TYPES);
  const externalId = textValue(value.primaryExternalId, 200);
  if (!provider || !mediaType || !externalId || value.verified !== true) issues.push(issue("dataset_exact_identity_fields_invalid", path, "Exact identity provider, mediaType, externalId ve verified=true taşımalıdır."));
  let expectedKey: string | undefined;
  if (provider && mediaType && externalId) {
    try { expectedKey = createCandidateCanonicalKey(provider, mediaType, externalId); } catch { issues.push(issue("dataset_exact_identity_external_id_invalid", `${path}.primaryExternalId`, "External ID canonical değildir.")); }
  }
  if (!expectedKey || value.canonicalKey !== expectedKey) issues.push(issue("dataset_exact_identity_key_invalid", `${path}.canonicalKey`, "Canonical key exact provider/media/external ID'den türemelidir."));
  if (!Array.isArray(value.secondaryIds) || value.secondaryIds.some((entry) => !record(entry) || !SECONDARY_ID_KINDS.includes(entry.kind as never) || !textValue(entry.externalId, 200))) issues.push(issue("dataset_exact_identity_secondary_invalid", `${path}.secondaryIds`, "Secondary identity listesi geçersizdir."));
  if (!Array.isArray(value.verificationEvidence) || value.verificationEvidence.length === 0 || value.verificationEvidence.some((entry) => !record(entry) || !RECOMMENDATION_PROVIDERS.includes(entry.provider as never) || !textValue(entry.field, 120) || !textValue(entry.externalId, 200))) issues.push(issue("dataset_exact_identity_evidence_invalid", `${path}.verificationEvidence`, "Exact identity verification evidence zorunludur."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as unknown as RecommendationCandidateIdentity };
}

export function decodeDatasetRecordProvenance(value: unknown, path = "$" ): RecommendationDecodeResult<DatasetRecordProvenance> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_provenance_invalid", path, "DatasetRecordProvenance nesne olmalıdır.")] };
  const issues = unknownFields(value, ["recordId", "sourceId", "sourceType", "sourceReference", "exactProviderIdentity", "capturedAt", "contentOrigin", "allowedUses", "attribution", "licenseEvidence", "retainedFields", "excludedFields", "transformationNotes", "containsPersonalData", "reviewer", "reviewStatus"], path);
  const recordId = textValue(value.recordId, 120);
  const sourceId = textValue(value.sourceId, 120);
  const sourceType = asEnum(value.sourceType, DATASET_SOURCE_TYPES);
  const sourceReference = textValue(value.sourceReference, 500);
  const contentOrigin = asEnum(value.contentOrigin, ["synthetic", "human_rewritten", "open_licensed", "provider_runtime_reference"] as const);
  const allowedUses = Array.isArray(value.allowedUses) && value.allowedUses.length <= DATASET_ALLOWED_USES.length
    && value.allowedUses.every((entry) => DATASET_ALLOWED_USES.includes(entry as never)) && new Set(value.allowedUses).size === value.allowedUses.length
    ? value.allowedUses as DatasetRecordProvenance["allowedUses"] : undefined;
  const attribution = decodeAttribution(value.attribution, `${path}.attribution`);
  const licenseEvidence = stringList(value.licenseEvidence, 16, 500);
  const retainedFields = stringList(value.retainedFields, 64, 120);
  const excludedFields = stringList(value.excludedFields, 64, 120);
  const transformationNotes = stringList(value.transformationNotes, 16, D7_TEXT_LIMITS.transformationNote);
  const reviewer = textValue(value.reviewer, 80);
  const reviewStatus = asEnum(value.reviewStatus, ["pending", "approved", "rejected"] as const);
  if (!recordId || !ID_PATTERN.test(recordId)) issues.push(issue("dataset_record_id_invalid", `${path}.recordId`, "recordId canonical olmalıdır."));
  if (!sourceId || !ID_PATTERN.test(sourceId)) issues.push(issue("dataset_source_id_invalid", `${path}.sourceId`, "sourceId canonical olmalıdır."));
  if (!sourceType) issues.push(issue("dataset_source_type_invalid", `${path}.sourceType`, "sourceType geçersizdir."));
  if (!sourceReference) issues.push(issue("dataset_source_reference_invalid", `${path}.sourceReference`, "sourceReference zorunlu ve bounded olmalıdır."));
  if (!isoInstant(value.capturedAt)) issues.push(issue("dataset_captured_at_invalid", `${path}.capturedAt`, "capturedAt canonical ISO instant olmalıdır."));
  if (!contentOrigin) issues.push(issue("dataset_content_origin_invalid", `${path}.contentOrigin`, "contentOrigin geçersizdir."));
  if (!allowedUses) issues.push(issue("dataset_allowed_uses_invalid", `${path}.allowedUses`, "allowedUses geçersizdir."));
  if (!attribution.ok) issues.push(...attribution.issues);
  if (!licenseEvidence || licenseEvidence.length === 0) issues.push(issue("dataset_license_evidence_invalid", `${path}.licenseEvidence`, "En az bir bounded license evidence zorunludur."));
  if (!retainedFields) issues.push(issue("dataset_retained_fields_invalid", `${path}.retainedFields`, "retainedFields benzersiz bounded string listesi olmalıdır."));
  if (!excludedFields) issues.push(issue("dataset_excluded_fields_invalid", `${path}.excludedFields`, "excludedFields benzersiz bounded string listesi olmalıdır."));
  if (!transformationNotes) issues.push(issue("dataset_transformation_notes_invalid", `${path}.transformationNotes`, "transformationNotes bounded olmalıdır."));
  if (value.containsPersonalData !== false) issues.push(issue("dataset_personal_data_forbidden", `${path}.containsPersonalData`, "D7 dataset provenance containsPersonalData=false olmalıdır."));
  if (!reviewer || !/^rev_[a-z0-9_-]{2,60}$/.test(reviewer)) issues.push(issue("dataset_reviewer_invalid", `${path}.reviewer`, "Reviewer pseudonymous rev_* ID olmalıdır."));
  if (!reviewStatus) issues.push(issue("dataset_review_status_invalid", `${path}.reviewStatus`, "reviewStatus geçersizdir."));
  let exactProviderIdentity: RecommendationCandidateIdentity | undefined;
  if (value.exactProviderIdentity !== undefined) {
    const decoded = decodeExactIdentity(value.exactProviderIdentity, `${path}.exactProviderIdentity`);
    if (decoded.ok) exactProviderIdentity = decoded.value; else issues.push(...decoded.issues);
  }
  if (issues.length > 0 || !recordId || !sourceId || !sourceType || !sourceReference || !contentOrigin || !allowedUses || !attribution.ok || !licenseEvidence || !retainedFields || !excludedFields || !transformationNotes || !reviewer || !reviewStatus) return { ok: false, issues };
  return { ok: true, value: { recordId, sourceId, sourceType, sourceReference, ...(exactProviderIdentity ? { exactProviderIdentity } : {}), capturedAt: value.capturedAt as string, contentOrigin, allowedUses, attribution: attribution.value, licenseEvidence, retainedFields, excludedFields, transformationNotes, containsPersonalData: false, reviewer, reviewStatus } };
}

export function decodeCandidateTextBundle(value: unknown, path = "$" ): RecommendationDecodeResult<CandidateTextBundle> {
  if (!record(value)) return { ok: false, issues: [issue("candidate_text_bundle_invalid", path, "CandidateTextBundle nesne olmalıdır.")] };
  const issues = unknownFields(value, ["version", "title", "shortSummary", "summaryOrigin", "genres", "tags", "keywords", "format", "status", "language", "country", "providerCoverage"], path);
  if (value.version !== VERIFIER_INPUT_SCHEMA_VERSION) issues.push(issue("candidate_text_version_invalid", `${path}.version`, "CandidateTextBundle version=1 olmalıdır."));
  const title = value.title === undefined ? undefined : textValue(value.title, D7_TEXT_LIMITS.title);
  const shortSummary = value.shortSummary === undefined ? undefined : textValue(value.shortSummary, D7_TEXT_LIMITS.shortSummary);
  if (value.title !== undefined && !title) issues.push(issue("candidate_title_invalid", `${path}.title`, "Title boş olamaz ve 300 karakteri aşamaz."));
  if (value.shortSummary !== undefined && !shortSummary) issues.push(issue("candidate_summary_invalid", `${path}.shortSummary`, "Short summary boş olamaz ve 600 karakteri aşamaz."));
  const summaryOrigin = asEnum(value.summaryOrigin, ["none", "synthetic", "human_rewritten", "open_licensed"] as const);
  if (!summaryOrigin) issues.push(issue("candidate_summary_origin_invalid", `${path}.summaryOrigin`, "summaryOrigin geçersizdir."));
  if ((summaryOrigin === "none") !== (shortSummary === undefined)) issues.push(issue("candidate_summary_origin_mismatch", `${path}.summaryOrigin`, "Summary yoksa origin=none; summary varsa açık origin zorunludur."));
  const genres = stringList(value.genres, 32, D7_TEXT_LIMITS.taxonomyValue);
  const keywords = stringList(value.keywords, 64, D7_TEXT_LIMITS.taxonomyValue);
  if (!genres) issues.push(issue("candidate_genres_invalid", `${path}.genres`, "Genres bounded benzersiz string listesi olmalıdır."));
  if (!keywords) issues.push(issue("candidate_keywords_invalid", `${path}.keywords`, "Keywords bounded benzersiz string listesi olmalıdır."));
  const tags: { name: string; rank?: number }[] = [];
  if (!Array.isArray(value.tags) || value.tags.length > 64) {
    issues.push(issue("candidate_tags_invalid", `${path}.tags`, "Tags en fazla 64 kayıt içermelidir."));
  } else {
    const names = new Set<string>();
    value.tags.forEach((entry, index) => {
      if (!record(entry) || Object.keys(entry).some((key) => !["name", "rank"].includes(key))) { issues.push(issue("candidate_tag_invalid", `${path}.tags.${index}`, "Tag name ve opsiyonel rank taşır.")); return; }
      const name = textValue(entry.name, D7_TEXT_LIMITS.taxonomyValue);
      if (!name || names.has(name.toLowerCase())) { issues.push(issue("candidate_tag_name_invalid", `${path}.tags.${index}.name`, "Tag name canonical ve benzersiz olmalıdır.")); return; }
      if (entry.rank !== undefined && (typeof entry.rank !== "number" || !Number.isFinite(entry.rank) || entry.rank < 0 || entry.rank > 100)) { issues.push(issue("candidate_tag_rank_invalid", `${path}.tags.${index}.rank`, "Tag rank 0-100 finite olmalıdır.")); return; }
      names.add(name.toLowerCase()); tags.push({ name, ...(typeof entry.rank === "number" ? { rank: entry.rank } : {}) });
    });
  }
  const optionalText = (["format", "status", "language", "country"] as const).reduce<Record<string, string>>((out, key) => {
    if (value[key] === undefined) return out;
    const parsed = textValue(value[key], D7_TEXT_LIMITS.taxonomyValue);
    if (!parsed) issues.push(issue("candidate_field_invalid", `${path}.${key}`, `${key} bounded string olmalıdır.`)); else out[key] = parsed;
    return out;
  }, {});
  const providerCoverage: Record<string, "available" | "partial" | "unavailable"> = {};
  if (!record(value.providerCoverage)) {
    issues.push(issue("candidate_provider_coverage_invalid", `${path}.providerCoverage`, "providerCoverage nesne olmalıdır."));
  } else {
    for (const [provider, status] of Object.entries(value.providerCoverage)) {
      if (!RECOMMENDATION_PROVIDERS.includes(provider as never) || !["available", "partial", "unavailable"].includes(String(status))) issues.push(issue("candidate_provider_coverage_entry_invalid", `${path}.providerCoverage.${provider}`, "Provider coverage entry geçersizdir."));
      else providerCoverage[provider] = status as "available" | "partial" | "unavailable";
    }
  }
  if (issues.length > 0 || !summaryOrigin || !genres || !keywords) return { ok: false, issues };
  return { ok: true, value: { version: VERIFIER_INPUT_SCHEMA_VERSION, ...(title ? { title } : {}), ...(shortSummary ? { shortSummary } : {}), summaryOrigin, genres, tags, keywords, ...optionalText, providerCoverage } };
}

function decodeDatasetRecord(value: unknown, path: string): RecommendationDecodeResult<DatasetRecord> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_record_invalid", path, "DatasetRecord nesne olmalıdır.")] };
  const issues = unknownFields(value, ["recordId", "split", "leakageGroupId", "candidate"], path);
  const recordId = textValue(value.recordId, 120);
  const split = asEnum(value.split, DATASET_SPLITS);
  const leakageGroupId = textValue(value.leakageGroupId, 160);
  const candidate = decodeCandidateTextBundle(value.candidate, `${path}.candidate`);
  if (!recordId || !ID_PATTERN.test(recordId)) issues.push(issue("dataset_record_id_invalid", `${path}.recordId`, "recordId canonical olmalıdır."));
  if (!split) issues.push(issue("dataset_split_invalid", `${path}.split`, "Dataset split geçersizdir."));
  if (!leakageGroupId || !/^[a-z0-9][a-z0-9_.:-]{1,159}$/.test(leakageGroupId)) issues.push(issue("dataset_leakage_group_invalid", `${path}.leakageGroupId`, "leakageGroupId canonical olmalıdır."));
  if (!candidate.ok) issues.push(...candidate.issues);
  if (issues.length > 0 || !recordId || !split || !leakageGroupId || !candidate.ok) return { ok: false, issues };
  return { ok: true, value: { recordId, split, leakageGroupId, candidate: candidate.value } };
}

export function decodeAspectAnnotationRecord(value: unknown, path = "$" ): RecommendationDecodeResult<AspectAnnotationRecord> {
  if (!record(value)) return { ok: false, issues: [issue("annotation_invalid", path, "AspectAnnotationRecord nesne olmalıdır.")] };
  const issues = unknownFields(value, ["version", "annotationId", "recordId", "aspectId", "label", "confidence", "evidenceSpans", "evidenceNotes", "contradictionNotes", "annotatorId", "annotationRound", "createdAt", "guidelineVersion", "labelSource", "adjudicationStatus", "finalLabel"], path);
  const annotationId = textValue(value.annotationId, 120);
  const recordId = textValue(value.recordId, 120);
  const aspectId = isAspectId(value.aspectId) ? value.aspectId : undefined;
  const label = asEnum(value.label, ANNOTATION_LABELS);
  const confidence = asEnum(value.confidence, ["low", "medium", "high"] as const);
  const annotatorId = textValue(value.annotatorId, 80);
  const guidelineVersion = textValue(value.guidelineVersion, 120);
  const labelSource = asEnum(value.labelSource, ["human_annotation", "synthetic_contract"] as const);
  const adjudicationStatus = asEnum(value.adjudicationStatus, ["not_required", "pending", "resolved"] as const);
  const finalLabel = value.finalLabel === undefined ? undefined : asEnum(value.finalLabel, ANNOTATION_LABELS);
  if (value.version !== ANNOTATION_SCHEMA_VERSION) issues.push(issue("annotation_version_invalid", `${path}.version`, "Annotation version=1 olmalıdır."));
  if (!annotationId || !ID_PATTERN.test(annotationId)) issues.push(issue("annotation_id_invalid", `${path}.annotationId`, "annotationId canonical olmalıdır."));
  if (!recordId || !ID_PATTERN.test(recordId)) issues.push(issue("annotation_record_id_invalid", `${path}.recordId`, "recordId canonical olmalıdır."));
  if (!aspectId) issues.push(issue("annotation_aspect_unknown", `${path}.aspectId`, "Aspect registry'de bulunmuyor."));
  if (!label) issues.push(issue("annotation_label_invalid", `${path}.label`, "Annotation label geçersizdir."));
  if (!confidence) issues.push(issue("annotation_confidence_invalid", `${path}.confidence`, "Annotation confidence geçersizdir."));
  const evidenceSpans: AnnotationEvidenceSpan[] = [];
  if (!Array.isArray(value.evidenceSpans) || value.evidenceSpans.length > 8) {
    issues.push(issue("annotation_spans_invalid", `${path}.evidenceSpans`, "Evidence spans en fazla 8 kayıt içermelidir."));
  } else {
    value.evidenceSpans.forEach((span, index) => {
      if (!record(span) || Object.keys(span).some((key) => !["field", "start", "end"].includes(key)) || span.field !== "shortSummary" || !Number.isInteger(span.start) || !Number.isInteger(span.end) || Number(span.start) < 0 || Number(span.end) <= Number(span.start) || Number(span.end) > D7_TEXT_LIMITS.shortSummary) issues.push(issue("annotation_span_invalid", `${path}.evidenceSpans.${index}`, "Span shortSummary içinde 0<=start<end<=600 olmalıdır."));
      else evidenceSpans.push({ field: "shortSummary", start: Number(span.start), end: Number(span.end) });
    });
  }
  const evidenceNotes = stringList(value.evidenceNotes, 4, D7_TEXT_LIMITS.evidenceNote);
  const contradictionNotes = stringList(value.contradictionNotes, 4, D7_TEXT_LIMITS.evidenceNote);
  if (!evidenceNotes) issues.push(issue("annotation_evidence_notes_invalid", `${path}.evidenceNotes`, "Evidence notes bounded benzersiz listedir."));
  if (!contradictionNotes) issues.push(issue("annotation_contradiction_notes_invalid", `${path}.contradictionNotes`, "Contradiction notes bounded benzersiz listedir."));
  if (evidenceSpans.length === 0 && evidenceNotes?.length === 0) issues.push(issue("annotation_evidence_required", path, "Her annotation kısa evidence note veya span taşımalıdır."));
  if (!annotatorId || !/^ann_[a-z0-9_-]{2,60}$/.test(annotatorId)) issues.push(issue("annotation_annotator_invalid", `${path}.annotatorId`, "Annotator pseudonymous ann_* ID olmalıdır."));
  if (!Number.isInteger(value.annotationRound) || Number(value.annotationRound) < 1 || Number(value.annotationRound) > 99) issues.push(issue("annotation_round_invalid", `${path}.annotationRound`, "annotationRound 1-99 integer olmalıdır."));
  if (!isoInstant(value.createdAt)) issues.push(issue("annotation_created_at_invalid", `${path}.createdAt`, "createdAt canonical ISO instant olmalıdır."));
  if (!guidelineVersion || !ID_PATTERN.test(guidelineVersion)) issues.push(issue("annotation_guideline_version_invalid", `${path}.guidelineVersion`, "guidelineVersion canonical olmalıdır."));
  if (!labelSource) issues.push(issue("annotation_label_source_invalid", `${path}.labelSource`, "labelSource geçersizdir."));
  if (!adjudicationStatus) issues.push(issue("annotation_adjudication_invalid", `${path}.adjudicationStatus`, "adjudicationStatus geçersizdir."));
  if (value.finalLabel !== undefined && !finalLabel) issues.push(issue("annotation_final_label_invalid", `${path}.finalLabel`, "finalLabel geçersizdir."));
  if (adjudicationStatus === "resolved" && !finalLabel) issues.push(issue("annotation_final_label_required", `${path}.finalLabel`, "Resolved adjudication finalLabel taşımalıdır."));
  if (adjudicationStatus !== "resolved" && value.finalLabel !== undefined) issues.push(issue("annotation_final_label_forbidden", `${path}.finalLabel`, "finalLabel yalnız resolved adjudication sonrasında yazılabilir."));
  if (issues.length > 0 || !annotationId || !recordId || !aspectId || !label || !confidence || !evidenceNotes || !contradictionNotes || !annotatorId || !guidelineVersion || !labelSource || !adjudicationStatus) return { ok: false, issues };
  return { ok: true, value: { version: ANNOTATION_SCHEMA_VERSION, annotationId, recordId, aspectId, label, confidence, evidenceSpans, evidenceNotes, contradictionNotes, annotatorId, annotationRound: value.annotationRound as number, createdAt: value.createdAt as string, guidelineVersion, labelSource, adjudicationStatus, ...(finalLabel ? { finalLabel } : {}) } };
}

export function decodeDatasetPackage(value: unknown): RecommendationDecodeResult<DatasetPackage> {
  if (!record(value)) return { ok: false, issues: [issue("dataset_package_invalid", "$", "Dataset package nesne olmalıdır.")] };
  const issues = unknownFields(value, ["manifest", "records", "provenance", "annotations"], "$" );
  const manifest = decodeDatasetManifest(value.manifest);
  if (!manifest.ok) issues.push(...manifest.issues.map((entry) => ({ ...entry, path: `manifest.${entry.path}` })));
  const records: DatasetRecord[] = [];
  if (!Array.isArray(value.records) || value.records.length > 100000) issues.push(issue("dataset_records_invalid", "records", "Records bounded liste olmalıdır."));
  else value.records.forEach((entry, index) => { const decoded = decodeDatasetRecord(entry, `records.${index}`); if (decoded.ok) records.push(decoded.value); else issues.push(...decoded.issues); });
  const provenance: DatasetRecordProvenance[] = [];
  if (!Array.isArray(value.provenance) || value.provenance.length > 100000) issues.push(issue("dataset_provenance_list_invalid", "provenance", "Provenance bounded liste olmalıdır."));
  else value.provenance.forEach((entry, index) => { const decoded = decodeDatasetRecordProvenance(entry, `provenance.${index}`); if (decoded.ok) provenance.push(decoded.value); else issues.push(...decoded.issues); });
  const annotations: AspectAnnotationRecord[] = [];
  if (!Array.isArray(value.annotations) || value.annotations.length > 1000000) issues.push(issue("dataset_annotations_invalid", "annotations", "Annotations bounded liste olmalıdır."));
  else value.annotations.forEach((entry, index) => { const decoded = decodeAspectAnnotationRecord(entry, `annotations.${index}`); if (decoded.ok) annotations.push(decoded.value); else issues.push(...decoded.issues); });
  if (new Set(annotations.map((entry) => entry.annotationId)).size !== annotations.length) issues.push(issue("annotation_id_duplicate", "annotations", "annotationId tekrar edemez."));
  if (issues.length > 0 || !manifest.ok) return { ok: false, issues };
  return validateDatasetPackage({ manifest: manifest.value, records, provenance, annotations });
}

export function decodeAspectVerifierOutput(value: unknown): RecommendationDecodeResult<AspectVerifierOutput> {
  if (!record(value)) return { ok: false, issues: [issue("verifier_output_invalid", "$", "AspectVerifierOutput nesne olmalıdır.")] };
  const issues = unknownFields(value, ["version", "aspectId", "probabilities", "predictedLevel", "calibratedConfidence", "abstained", "abstentionReason", "modelVersion", "inputSchemaVersion", "warnings"], "$" );
  if (value.version !== VERIFIER_OUTPUT_SCHEMA_VERSION) issues.push(issue("verifier_output_version_invalid", "version", "Verifier output version=1 olmalıdır."));
  const aspectId = isAspectId(value.aspectId) ? value.aspectId : undefined;
  if (!aspectId) issues.push(issue("verifier_aspect_unknown", "aspectId", "Aspect registry'de bulunmuyor."));
  const probabilities: Record<string, number> = {};
  const probabilityRecord = record(value.probabilities) ? value.probabilities : null;
  if (!probabilityRecord || Object.keys(probabilityRecord).length !== ASPECT_VERIFIER_LEVELS.length || ASPECT_VERIFIER_LEVELS.some((level) => !(level in probabilityRecord))) {
    issues.push(issue("verifier_probabilities_invalid", "probabilities", "Dört ordinal class probability zorunludur."));
  } else {
    for (const [key, raw] of Object.entries(probabilityRecord)) {
      if (!ASPECT_VERIFIER_LEVELS.includes(key as never) || typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) issues.push(issue("verifier_probability_invalid", `probabilities.${key}`, "Probability 0-1 finite olmalıdır."));
      else probabilities[key] = raw;
    }
    const sum = Object.values(probabilities).reduce((total, entry) => total + entry, 0);
    if (Object.keys(probabilities).length === 4 && Math.abs(sum - 1) > 0.0001) issues.push(issue("verifier_probability_sum_invalid", "probabilities", "Probability toplamı 1±0.0001 olmalıdır."));
  }
  const predictedLevel = value.predictedLevel === null ? null : asEnum(value.predictedLevel, ASPECT_VERIFIER_LEVELS);
  if (value.predictedLevel !== null && !predictedLevel) issues.push(issue("verifier_predicted_level_invalid", "predictedLevel", "predictedLevel ordinal class veya abstain için null olmalıdır."));
  if (typeof value.calibratedConfidence !== "number" || !Number.isFinite(value.calibratedConfidence) || value.calibratedConfidence < 0 || value.calibratedConfidence > 1) issues.push(issue("verifier_confidence_invalid", "calibratedConfidence", "calibratedConfidence 0-1 finite olmalıdır."));
  if (typeof value.abstained !== "boolean") issues.push(issue("verifier_abstained_invalid", "abstained", "abstained boolean olmalıdır."));
  const abstentionReason = value.abstentionReason === undefined ? undefined : textValue(value.abstentionReason, 240);
  if (value.abstained === true && (!abstentionReason || predictedLevel !== null)) issues.push(issue("verifier_abstention_invalid", "abstentionReason", "Abstain halinde reason zorunlu, predictedLevel null olmalıdır."));
  if (value.abstained === false && (predictedLevel === null || value.abstentionReason !== undefined)) issues.push(issue("verifier_prediction_invalid", "predictedLevel", "Non-abstained output predictedLevel taşır ve abstentionReason taşımaz."));
  const modelVersion = textValue(value.modelVersion, 120);
  if (!modelVersion || !/^[A-Za-z0-9][A-Za-z0-9._/:+-]{1,119}$/.test(modelVersion)) issues.push(issue("verifier_model_version_invalid", "modelVersion", "modelVersion canonical olmalıdır."));
  if (modelVersion && /(?:^|[-_.:/])(mock|hash)(?:$|[-_.:/])/i.test(modelVersion)) issues.push(issue("verifier_model_forbidden", "modelVersion", "Mock/hash model semantic verifier output'u olamaz."));
  if (value.inputSchemaVersion !== VERIFIER_INPUT_SCHEMA_VERSION) issues.push(issue("verifier_input_schema_version_invalid", "inputSchemaVersion", "inputSchemaVersion=1 olmalıdır."));
  const warnings = stringList(value.warnings, 16, D7_TEXT_LIMITS.warning);
  if (!warnings) issues.push(issue("verifier_warnings_invalid", "warnings", "Warnings bounded benzersiz string listesi olmalıdır."));
  if (issues.length > 0 || !aspectId || predictedLevel === undefined || !modelVersion || !warnings || typeof value.abstained !== "boolean" || typeof value.calibratedConfidence !== "number") return { ok: false, issues };
  return { ok: true, value: { version: VERIFIER_OUTPUT_SCHEMA_VERSION, aspectId, probabilities: probabilities as AspectVerifierOutput["probabilities"], predictedLevel, calibratedConfidence: value.calibratedConfidence, abstained: value.abstained, ...(abstentionReason ? { abstentionReason } : {}), modelVersion, inputSchemaVersion: VERIFIER_INPUT_SCHEMA_VERSION, warnings } };
}
