import { isAspectId } from "../../../domain/aspect-registry";
import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../../domain/types";
import {
  ANNOTATION_LABELS,
  DATASET_SPLITS,
  D7_TEXT_LIMITS,
  decodeAspectAnnotationRecord,
  decodeCandidateTextBundle,
  decodeDatasetManifest,
  decodeDatasetRecordProvenance,
  provenanceIdentityKey,
  type AnnotationConfidence,
  type AspectAnnotationLabel,
  type DatasetRecord,
} from "../../dataset";
import { isValidAnnotatorId, isValidBoundedId, isValidWorkspaceId } from "./ids";
import { ANNOTATION_TOOL_LIMITS } from "./constants";
import {
  ANNOTATION_TOOL_SCHEMA_VERSION,
  type AnnotationAdjudicationRecord,
  type AnnotationExportBundle,
  type AnnotationRecordIdentity,
  type AnnotationRecordImportBundle,
  type AnnotationTask,
  type AnnotationWorkspaceMetadata,
  type AnnotationWorkspaceRecord,
  type AnnotationWorkspaceState,
  type DatasetRevocationRecord,
  type StoredAspectAnnotation,
} from "./types";

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const SCRIPT_STYLE_PATTERN = /<\s*(?:script|style)\b|javascript\s*:/i;

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value: Record<string, unknown>, allowed: readonly string[], path: string): RecommendationDomainIssue[] {
  const keys = new Set(allowed);
  return Object.keys(value).filter((key) => !keys.has(key)).map((key) => (
    issue("annotation_tool_unknown_field", `${path}.${key}`, "Bilinmeyen annotation tool alanı kabul edilmez.")
  ));
}

function iso(value: unknown): value is string {
  return typeof value === "string" && ISO_PATTERN.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= max && !CONTROL_PATTERN.test(text) ? text : undefined;
}

function uniqueStrings(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const values = value.map((entry) => boundedText(entry, maxLength));
  if (values.some((entry) => entry === undefined)) return undefined;
  const parsed = values as string[];
  return new Set(parsed).size === parsed.length ? parsed : undefined;
}

function textIsSafe(value: string | undefined): boolean {
  return !value || (!CONTROL_PATTERN.test(value) && !HTML_PATTERN.test(value) && !SCRIPT_STYLE_PATTERN.test(value));
}

function decodeIdentity(value: unknown, path: string): RecommendationDecodeResult<AnnotationRecordIdentity> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_identity_invalid", path, "Identity nesne olmalıdır.")] };
  if (value.kind === "synthetic") {
    const issues = exactFields(value, ["kind", "syntheticId"], path);
    if (!isValidBoundedId(value.syntheticId)) issues.push(issue("annotation_synthetic_identity_invalid", `${path}.syntheticId`, "Sentetik identity canonical ve bounded olmalıdır."));
    return issues.length === 0
      ? { ok: true, value: { kind: "synthetic", syntheticId: value.syntheticId as string } }
      : { ok: false, issues };
  }
  if (value.kind === "provider") {
    const issues = exactFields(value, ["kind", "canonicalKey"], path);
    const canonicalKey = boundedText(value.canonicalKey, 240);
    if (!canonicalKey || !canonicalKey.includes(":")) issues.push(issue("annotation_provider_identity_invalid", `${path}.canonicalKey`, "Provider identity exact canonical key olmalıdır."));
    return issues.length === 0 && canonicalKey
      ? { ok: true, value: { kind: "provider", canonicalKey } }
      : { ok: false, issues };
  }
  return { ok: false, issues: [issue("annotation_identity_kind_invalid", `${path}.kind`, "Identity kind geçersizdir.")] };
}

export function decodeAnnotationWorkspaceRecord(value: unknown, path = "$"): RecommendationDecodeResult<AnnotationWorkspaceRecord> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_record_invalid", path, "Workspace record nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "record", "provenance", "identity", "titleSnapshot", "personalData", "payloadHash", "importedAt"], path);
  if (value.version !== ANNOTATION_TOOL_SCHEMA_VERSION) issues.push(issue("annotation_record_version_invalid", `${path}.version`, "Record version 1 olmalıdır."));
  const recordValue = value.record;
  let parsedRecord: DatasetRecord | undefined;
  if (!object(recordValue)) {
    issues.push(issue("annotation_dataset_record_invalid", `${path}.record`, "Dataset record nesne olmalıdır."));
  } else {
    issues.push(...exactFields(recordValue, ["recordId", "split", "leakageGroupId", "candidate"], `${path}.record`));
    const candidate = decodeCandidateTextBundle(recordValue.candidate, `${path}.record.candidate`);
    if (!candidate.ok) issues.push(...candidate.issues);
    if (!isValidBoundedId(recordValue.recordId)) issues.push(issue("annotation_record_id_invalid", `${path}.record.recordId`, "recordId canonical ve bounded olmalıdır."));
    if (!DATASET_SPLITS.includes(recordValue.split as never)) issues.push(issue("annotation_record_split_invalid", `${path}.record.split`, "Dataset split geçersizdir."));
    if (!isValidBoundedId(recordValue.leakageGroupId)) issues.push(issue("annotation_leakage_group_invalid", `${path}.record.leakageGroupId`, "leakageGroupId canonical olmalıdır."));
    if (candidate.ok && isValidBoundedId(recordValue.recordId) && DATASET_SPLITS.includes(recordValue.split as never) && isValidBoundedId(recordValue.leakageGroupId)) {
      parsedRecord = {
        recordId: recordValue.recordId,
        split: recordValue.split as DatasetRecord["split"],
        leakageGroupId: recordValue.leakageGroupId,
        candidate: candidate.value,
      };
    }
  }
  const provenance = decodeDatasetRecordProvenance(value.provenance, `${path}.provenance`);
  if (!provenance.ok) issues.push(...provenance.issues);
  const identity = decodeIdentity(value.identity, `${path}.identity`);
  if (!identity.ok) issues.push(...identity.issues);
  const titleSnapshot = boundedText(value.titleSnapshot, D7_TEXT_LIMITS.title);
  if (!titleSnapshot || !textIsSafe(titleSnapshot)) issues.push(issue("annotation_title_snapshot_invalid", `${path}.titleSnapshot`, "titleSnapshot bounded, düz metin olmalıdır."));
  if (value.personalData !== false) issues.push(issue("annotation_personal_data_forbidden", `${path}.personalData`, "personalData yalnız false olabilir."));
  if (typeof value.payloadHash !== "string" || !HASH_PATTERN.test(value.payloadHash)) issues.push(issue("annotation_payload_hash_invalid", `${path}.payloadHash`, "payloadHash sha256:<64 hex> olmalıdır."));
  if (!iso(value.importedAt)) issues.push(issue("annotation_imported_at_invalid", `${path}.importedAt`, "importedAt ISO instant olmalıdır."));
  if (parsedRecord && provenance.ok && parsedRecord.recordId !== provenance.value.recordId) {
    issues.push(issue("annotation_provenance_record_mismatch", `${path}.provenance.recordId`, "Record ve provenance ID eşleşmelidir."));
  }
  if (parsedRecord && titleSnapshot && parsedRecord.candidate.title !== titleSnapshot) {
    issues.push(issue("annotation_title_snapshot_mismatch", `${path}.titleSnapshot`, "titleSnapshot candidate title ile aynı olmalıdır."));
  }
  if (parsedRecord && !textIsSafe(parsedRecord.candidate.title) || (parsedRecord && !textIsSafe(parsedRecord.candidate.shortSummary))) {
    issues.push(issue("annotation_record_text_unsafe", `${path}.record.candidate`, "HTML, script/style veya control character kabul edilmez."));
  }
  if (provenance.ok && identity.ok) {
    const exactKey = provenanceIdentityKey(provenance.value);
    if (identity.value.kind === "provider" && exactKey !== identity.value.canonicalKey) {
      issues.push(issue("annotation_exact_identity_mismatch", `${path}.identity`, "Provider identity provenance exact identity ile eşleşmelidir."));
    }
    if (identity.value.kind === "synthetic" && provenance.value.contentOrigin !== "synthetic") {
      issues.push(issue("annotation_synthetic_origin_mismatch", `${path}.identity`, "Sentetik identity yalnız synthetic content origin ile kullanılabilir."));
    }
  }
  if (issues.length > 0 || !parsedRecord || !provenance.ok || !identity.ok || !titleSnapshot || !iso(value.importedAt)) return { ok: false, issues };
  return {
    ok: true,
    value: {
      version: ANNOTATION_TOOL_SCHEMA_VERSION,
      record: parsedRecord,
      provenance: provenance.value,
      identity: identity.value,
      titleSnapshot,
      personalData: false,
      payloadHash: value.payloadHash as string,
      importedAt: value.importedAt,
    },
  };
}

export function decodeAnnotationRecordImportBundle(value: unknown): RecommendationDecodeResult<AnnotationRecordImportBundle> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_import_invalid", "$", "Import bundle nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "manifestReference", "records", "contentHash", "createdAt", "sourcePolicyVersion"], "$" );
  if (value.version !== ANNOTATION_TOOL_SCHEMA_VERSION) issues.push(issue("annotation_import_version_invalid", "$.version", "Import version 1 olmalıdır."));
  const manifestReference = boundedText(value.manifestReference, 240);
  const sourcePolicyVersion = boundedText(value.sourcePolicyVersion, 120);
  if (!manifestReference) issues.push(issue("annotation_manifest_reference_invalid", "$.manifestReference", "manifestReference zorunludur."));
  if (!sourcePolicyVersion) issues.push(issue("annotation_source_policy_version_invalid", "$.sourcePolicyVersion", "sourcePolicyVersion zorunludur."));
  if (typeof value.contentHash !== "string" || !HASH_PATTERN.test(value.contentHash)) issues.push(issue("annotation_import_hash_invalid", "$.contentHash", "contentHash sha256:<64 hex> olmalıdır."));
  if (!iso(value.createdAt)) issues.push(issue("annotation_import_created_at_invalid", "$.createdAt", "createdAt ISO instant olmalıdır."));
  const records: AnnotationWorkspaceRecord[] = [];
  if (!Array.isArray(value.records) || value.records.length > 5000) {
    issues.push(issue("annotation_import_records_invalid", "$.records", "records bounded array olmalıdır."));
  } else {
    value.records.forEach((entry, index) => {
      const decoded = decodeAnnotationWorkspaceRecord(entry, `$.records[${index}]`);
      if (decoded.ok) records.push(decoded.value); else issues.push(...decoded.issues);
    });
  }
  if (issues.length > 0 || !manifestReference || !sourcePolicyVersion || !iso(value.createdAt)) return { ok: false, issues };
  return { ok: true, value: { version: 1, manifestReference, records, contentHash: value.contentHash as string, createdAt: value.createdAt, sourcePolicyVersion } };
}

export function decodeAnnotationTask(value: unknown, path = "$"): RecommendationDecodeResult<AnnotationTask> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_task_invalid", path, "Task nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "taskId", "recordId", "aspectId", "annotationRound", "status", "assignedAnnotators", "requiredAnnotationCount", "priority", "createdAt", "updatedAt"], path);
  const statuses = ["pending", "in_progress", "annotated", "conflict", "adjudicated", "excluded"];
  const assigned = uniqueStrings(value.assignedAnnotators, 8, 32);
  if (value.version !== 1) issues.push(issue("annotation_task_version_invalid", `${path}.version`, "Task version 1 olmalıdır."));
  if (!isValidBoundedId(value.taskId) || !isValidBoundedId(value.recordId)) issues.push(issue("annotation_task_id_invalid", path, "Task ve record ID canonical olmalıdır."));
  if (!isAspectId(value.aspectId)) issues.push(issue("annotation_task_aspect_unknown", `${path}.aspectId`, "Aspect registry'de bulunamadı."));
  if (!Number.isInteger(value.annotationRound) || (value.annotationRound as number) < 1 || (value.annotationRound as number) > 100) issues.push(issue("annotation_round_invalid", `${path}.annotationRound`, "annotationRound 1-100 olmalıdır."));
  if (!statuses.includes(value.status as string)) issues.push(issue("annotation_task_status_invalid", `${path}.status`, "Task status geçersizdir."));
  if (!assigned || assigned.some((id) => !isValidAnnotatorId(id))) issues.push(issue("annotation_task_annotators_invalid", `${path}.assignedAnnotators`, "Annotator IDs pseudonymous ve bounded olmalıdır."));
  if (value.requiredAnnotationCount !== 1 && value.requiredAnnotationCount !== 2) issues.push(issue("annotation_required_count_invalid", `${path}.requiredAnnotationCount`, "Required annotation count 1 veya 2 olmalıdır."));
  if (!Number.isInteger(value.priority) || (value.priority as number) < -1000 || (value.priority as number) > 1000) issues.push(issue("annotation_priority_invalid", `${path}.priority`, "Priority bounded integer olmalıdır."));
  if (!iso(value.createdAt) || !iso(value.updatedAt)) issues.push(issue("annotation_task_timestamp_invalid", path, "Task timestamps ISO instant olmalıdır."));
  return issues.length === 0 ? { ok: true, value: value as unknown as AnnotationTask } : { ok: false, issues };
}

export function decodeStoredAspectAnnotation(value: unknown, path = "$"): RecommendationDecodeResult<StoredAspectAnnotation> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_stored_invalid", path, "Stored annotation nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "annotation", "revision", "active", "supersedesAnnotationId", "updatedAt"], path);
  const annotation = decodeAspectAnnotationRecord(value.annotation, `${path}.annotation`);
  if (!annotation.ok) issues.push(...annotation.issues);
  if (value.version !== 1 || !Number.isInteger(value.revision) || (value.revision as number) < 1) issues.push(issue("annotation_revision_invalid", `${path}.revision`, "Revision pozitif integer olmalıdır."));
  if (typeof value.active !== "boolean") issues.push(issue("annotation_active_invalid", `${path}.active`, "active boolean olmalıdır."));
  if (value.supersedesAnnotationId !== undefined && !isValidBoundedId(value.supersedesAnnotationId)) issues.push(issue("annotation_supersedes_invalid", `${path}.supersedesAnnotationId`, "supersedesAnnotationId geçersizdir."));
  if (!iso(value.updatedAt)) issues.push(issue("annotation_updated_at_invalid", `${path}.updatedAt`, "updatedAt ISO instant olmalıdır."));
  if (issues.length > 0 || !annotation.ok) return { ok: false, issues };
  return {
    ok: true,
    value: {
      version: 1,
      annotation: annotation.value,
      revision: value.revision as number,
      active: value.active as boolean,
      ...(value.supersedesAnnotationId === undefined ? {} : { supersedesAnnotationId: value.supersedesAnnotationId as string }),
      updatedAt: value.updatedAt as string,
    },
  };
}

export function decodeAdjudication(value: unknown, path = "$"): RecommendationDecodeResult<AnnotationAdjudicationRecord> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_adjudication_invalid", path, "Adjudication nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "adjudicationId", "taskId", "comparedAnnotationIds", "finalLabel", "finalConfidence", "adjudicatorId", "rationale", "adjudicatorWasAnnotator", "createdAt"], path);
  const ids = uniqueStrings(value.comparedAnnotationIds, 8, 120);
  if (value.version !== 1 || !isValidBoundedId(value.adjudicationId) || !isValidBoundedId(value.taskId)) issues.push(issue("annotation_adjudication_id_invalid", path, "Adjudication ve task ID geçersizdir."));
  if (!ids || ids.length < 2 || ids.some((id) => !isValidBoundedId(id))) issues.push(issue("annotation_adjudication_comparison_invalid", `${path}.comparedAnnotationIds`, "En az iki benzersiz annotation ID gerekir."));
  if (!ANNOTATION_LABELS.includes(value.finalLabel as AspectAnnotationLabel)) issues.push(issue("annotation_adjudication_label_invalid", `${path}.finalLabel`, "Final label geçersizdir."));
  if (!["low", "medium", "high"].includes(value.finalConfidence as AnnotationConfidence)) issues.push(issue("annotation_adjudication_confidence_invalid", `${path}.finalConfidence`, "Final confidence geçersizdir."));
  if (!isValidAnnotatorId(value.adjudicatorId)) issues.push(issue("annotation_adjudicator_invalid", `${path}.adjudicatorId`, "Adjudicator ID pseudonymous olmalıdır."));
  if (!boundedText(value.rationale, ANNOTATION_TOOL_LIMITS.adjudicationRationale)) issues.push(issue("annotation_adjudication_rationale_invalid", `${path}.rationale`, "Rationale bounded olmalıdır."));
  if (typeof value.adjudicatorWasAnnotator !== "boolean" || !iso(value.createdAt)) issues.push(issue("annotation_adjudication_metadata_invalid", path, "Adjudication metadata geçersizdir."));
  return issues.length === 0 ? { ok: true, value: value as unknown as AnnotationAdjudicationRecord } : { ok: false, issues };
}

export function decodeDatasetRevocationRecord(value: unknown, path = "$"): RecommendationDecodeResult<DatasetRevocationRecord> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_revocation_invalid", path, "Revocation nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "revocationId", "scope", "targetId", "reasonCode", "note", "effectiveAt", "createdBy", "createdAt", "actions", "status", "replacesRevocationId"], path);
  const scopes = ["source_policy", "source_reference", "record", "workspace"];
  const reasons = ["license_changed", "permission_revoked", "provenance_invalid", "personal_data_detected", "duplicate_or_contaminated", "manual_withdrawal", "other"];
  const actionValues = ["exclude_from_training", "exclude_from_evaluation", "exclude_from_export", "mark_internal_only"];
  const actions = uniqueStrings(value.actions, 4, 40);
  if (value.version !== 1 || !isValidBoundedId(value.revocationId) || !isValidBoundedId(value.targetId)) issues.push(issue("annotation_revocation_id_invalid", path, "Revocation ve target ID canonical olmalıdır."));
  if (!scopes.includes(value.scope as string) || !reasons.includes(value.reasonCode as string)) issues.push(issue("annotation_revocation_kind_invalid", path, "Revocation scope veya reason geçersizdir."));
  if (!boundedText(value.note, ANNOTATION_TOOL_LIMITS.revocationNote)) issues.push(issue("annotation_revocation_note_invalid", `${path}.note`, "Revocation note bounded olmalıdır."));
  if (!isValidAnnotatorId(value.createdBy) || !iso(value.effectiveAt) || !iso(value.createdAt)) issues.push(issue("annotation_revocation_metadata_invalid", path, "Revocation actor/timestamp geçersizdir."));
  if (!actions || actions.length === 0 || actions.some((action) => !actionValues.includes(action))) issues.push(issue("annotation_revocation_actions_invalid", `${path}.actions`, "En az bir tanımlı revocation action gerekir."));
  if (value.status !== "active" && value.status !== "reversed") issues.push(issue("annotation_revocation_status_invalid", `${path}.status`, "Revocation status geçersizdir."));
  if (value.replacesRevocationId !== undefined && !isValidBoundedId(value.replacesRevocationId)) issues.push(issue("annotation_revocation_replacement_invalid", `${path}.replacesRevocationId`, "Replacement ID geçersizdir."));
  return issues.length === 0 ? { ok: true, value: value as unknown as DatasetRevocationRecord } : { ok: false, issues };
}

export function decodeAnnotationWorkspaceMetadata(value: unknown): RecommendationDecodeResult<AnnotationWorkspaceMetadata> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_workspace_invalid", "$", "Workspace metadata nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "workspaceId", "manifest", "status", "selectedAspectIds", "guidelineVersion", "sourcePolicyVersions", "createdAt", "updatedAt"], "$" );
  const manifest = decodeDatasetManifest(value.manifest);
  if (!manifest.ok) issues.push(...manifest.issues);
  const statuses = ["draft", "internal_pilot", "annotation_in_progress", "ready_for_adjudication", "gold_candidate", "frozen", "revoked"];
  const aspects = Array.isArray(value.selectedAspectIds) && value.selectedAspectIds.length > 0 && value.selectedAspectIds.every(isAspectId) && new Set(value.selectedAspectIds).size === value.selectedAspectIds.length
    ? value.selectedAspectIds : undefined;
  const policyVersions = uniqueStrings(value.sourcePolicyVersions, 32, 120);
  if (value.version !== 1 || !isValidWorkspaceId(value.workspaceId)) issues.push(issue("annotation_workspace_id_invalid", "$.workspaceId", "Workspace ID 3-48 lowercase/digit/hyphen olmalıdır."));
  if (!statuses.includes(value.status as string)) issues.push(issue("annotation_workspace_status_invalid", "$.status", "Workspace status geçersizdir."));
  if (!aspects) issues.push(issue("annotation_workspace_aspects_invalid", "$.selectedAspectIds", "Aspect IDs registry'den, benzersiz olmalıdır."));
  if (!boundedText(value.guidelineVersion, 120) || !policyVersions) issues.push(issue("annotation_workspace_policy_invalid", "$", "Guideline/source policy versionları geçersizdir."));
  if (!iso(value.createdAt) || !iso(value.updatedAt)) issues.push(issue("annotation_workspace_timestamp_invalid", "$", "Workspace timestamps ISO instant olmalıdır."));
  return issues.length === 0 ? { ok: true, value: value as unknown as AnnotationWorkspaceMetadata } : { ok: false, issues };
}

export function decodeAnnotationWorkspaceState(value: unknown): RecommendationDecodeResult<AnnotationWorkspaceState> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_workspace_state_invalid", "$", "Workspace state nesne olmalıdır.")] };
  const issues = exactFields(value, ["workspace", "records", "tasks", "annotations", "adjudications", "revocations"], "$" );
  const workspace = decodeAnnotationWorkspaceMetadata(value.workspace);
  if (!workspace.ok) issues.push(...workspace.issues);
  const decoders = [
    ["records", value.records, decodeAnnotationWorkspaceRecord],
    ["tasks", value.tasks, decodeAnnotationTask],
    ["annotations", value.annotations, decodeStoredAspectAnnotation],
    ["adjudications", value.adjudications, decodeAdjudication],
    ["revocations", value.revocations, decodeDatasetRevocationRecord],
  ] as const;
  const parsed: Record<string, unknown[]> = {};
  for (const [key, values, decoder] of decoders) {
    if (!Array.isArray(values)) {
      issues.push(issue("annotation_workspace_collection_invalid", `$.${key}`, `${key} array olmalıdır.`));
      continue;
    }
    parsed[key] = [];
    values.forEach((entry, index) => {
      const decoded = decoder(entry, `$.${key}[${index}]`) as RecommendationDecodeResult<unknown>;
      if (decoded.ok) parsed[key].push(decoded.value); else issues.push(...decoded.issues);
    });
  }
  if (issues.length > 0 || !workspace.ok) return { ok: false, issues };
  return {
    ok: true,
    value: {
      workspace: workspace.value,
      records: parsed.records as AnnotationWorkspaceRecord[],
      tasks: parsed.tasks as AnnotationTask[],
      annotations: parsed.annotations as StoredAspectAnnotation[],
      adjudications: parsed.adjudications as AnnotationAdjudicationRecord[],
      revocations: parsed.revocations as DatasetRevocationRecord[],
    },
  };
}

export function decodeAnnotationExportBundle(value: unknown): RecommendationDecodeResult<AnnotationExportBundle> {
  if (!object(value)) return { ok: false, issues: [issue("annotation_export_invalid", "$", "Export bundle nesne olmalıdır.")] };
  const issues = exactFields(value, ["version", "exportPurpose", "releaseStatus", "manifest", "includedRecordIds", "records", "annotations", "adjudications", "sourcePolicies", "revocationsSummary", "limitations", "contentHash", "generatedAt"], "$" );
  if (value.version !== 1 || !["workspace_backup", "annotation_only", "adjudicated_labels", "training_candidate", "evaluation_candidate"].includes(value.exportPurpose as string)) issues.push(issue("annotation_export_version_or_purpose_invalid", "$", "Export version/purpose geçersizdir."));
  if (value.releaseStatus !== "internal_only" && value.releaseStatus !== "publishable") issues.push(issue("annotation_export_release_invalid", "$.releaseStatus", "Export release status geçersizdir."));
  if (typeof value.contentHash !== "string" || !HASH_PATTERN.test(value.contentHash) || !iso(value.generatedAt)) issues.push(issue("annotation_export_hash_or_time_invalid", "$", "Export hash/timestamp geçersizdir."));
  const manifest = decodeDatasetManifest(value.manifest);
  if (!manifest.ok) issues.push(...manifest.issues);
  if (!Array.isArray(value.records) || !Array.isArray(value.annotations) || !Array.isArray(value.adjudications) || !Array.isArray(value.sourcePolicies) || !Array.isArray(value.revocationsSummary)) issues.push(issue("annotation_export_collections_invalid", "$", "Export collections array olmalıdır."));
  return issues.length === 0 ? { ok: true, value: value as unknown as AnnotationExportBundle } : { ok: false, issues };
}

export function bodyByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
