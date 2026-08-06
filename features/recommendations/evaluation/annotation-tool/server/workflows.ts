import "server-only";

import { randomUUID } from "node:crypto";

import { ASPECT_REGISTRY, getAspectDefinition, isAspectId, type AspectId } from "../../../domain/aspect-registry";
import {
  decodeDatasetPackage,
  sourcePolicyAllowsTraining,
  type AspectAnnotationRecord,
  type DatasetSourcePolicy,
} from "../../dataset";
import {
  decodeAdjudication,
  decodeAnnotationRecordImportBundle,
  decodeDatasetRevocationRecord,
  decodeStoredAspectAnnotation,
} from "../domain/codec";
import { isValidAnnotatorId } from "../domain/ids";
import type {
  AnnotationAdjudicationRecord,
  AnnotationExportBundle,
  AnnotationExportPurpose,
  AnnotationImportPreview,
  AnnotationRecordImportBundle,
  AnnotationTask,
  AnnotationValidationIssue,
  AnnotationWorkspaceRecord,
  AnnotationWorkspaceState,
  DatasetRevocationAction,
  DatasetRevocationRecord,
  StoredAspectAnnotation,
} from "../domain/types";
import { serializeCanonicalJson, sha256Text } from "../storage/atomic";

export class AnnotationRevisionConflictError extends Error {
  constructor() {
    super("annotation_revision_conflict");
  }
}

export class AnnotationWorkflowError extends Error {
  constructor(code: string) {
    super(code);
  }
}

function mutable(state: AnnotationWorkspaceState): void {
  if (state.workspace.status === "frozen" || state.workspace.status === "revoked") {
    throw new AnnotationWorkflowError("annotation_workspace_immutable");
  }
}

function nowIso(now?: string): string {
  return now ?? new Date().toISOString();
}

function identityKey(record: AnnotationWorkspaceRecord): string {
  return record.identity.kind === "provider"
    ? `provider:${record.identity.canonicalKey}`
    : `synthetic:${record.identity.syntheticId}`;
}

function activeRevocations(state: AnnotationWorkspaceState): DatasetRevocationRecord[] {
  return state.revocations.filter((entry) => entry.status === "active");
}

function revocationAppliesToRecord(revocation: DatasetRevocationRecord, record: AnnotationWorkspaceRecord, workspaceId: string): boolean {
  if (revocation.scope === "workspace") return revocation.targetId === workspaceId;
  if (revocation.scope === "record") return revocation.targetId === record.record.recordId;
  if (revocation.scope === "source_policy") return revocation.targetId === record.provenance.sourceId;
  return revocation.targetId === record.provenance.sourceReference;
}

function recordHasRevocationAction(state: AnnotationWorkspaceState, record: AnnotationWorkspaceRecord, action: DatasetRevocationAction): boolean {
  return activeRevocations(state).some((entry) => entry.actions.includes(action)
    && revocationAppliesToRecord(entry, record, state.workspace.workspaceId));
}

function sourcePolicy(state: AnnotationWorkspaceState, sourceId: string): DatasetSourcePolicy | undefined {
  return state.workspace.manifest.sourcePolicies.find((entry) => entry.sourceId === sourceId);
}

function validationIssue(
  code: string,
  severity: AnnotationValidationIssue["severity"],
  messageTr: string,
  relatedIds: readonly string[] = [],
  path = "$",
): AnnotationValidationIssue {
  return { code, severity, path, messageTr, relatedIds };
}

export type TaskGenerationSelection =
  | { mode: "all_selected" }
  | { mode: "aspect_group"; group: string }
  | { mode: "explicit"; pairs: readonly { recordId: string; aspectId: AspectId }[] }
  | { mode: "aspect_ids"; aspectIds: readonly AspectId[]; recordIds?: readonly string[] };

export function generateAnnotationTasks(
  state: AnnotationWorkspaceState,
  selection: TaskGenerationSelection,
  options: { annotationRound?: number; requiredAnnotationCount?: 1 | 2; priority?: number; now?: string } = {},
): { state: AnnotationWorkspaceState; createdTaskIds: string[] } {
  mutable(state);
  const annotationRound = options.annotationRound ?? 1;
  const requiredAnnotationCount = options.requiredAnnotationCount ?? 1;
  const createdAt = nowIso(options.now);
  let pairs: { recordId: string; aspectId: AspectId }[] = [];
  if (selection.mode === "explicit") {
    pairs = [...selection.pairs];
  } else {
    const recordIds = selection.mode === "aspect_ids" && selection.recordIds
      ? [...selection.recordIds]
      : state.records.map((entry) => entry.record.recordId);
    const aspects = selection.mode === "all_selected"
      ? [...state.workspace.selectedAspectIds]
      : selection.mode === "aspect_group"
        ? state.workspace.selectedAspectIds.filter((id) => getAspectDefinition(id).group === selection.group)
        : [...selection.aspectIds];
    pairs = recordIds.flatMap((recordId) => aspects.map((aspectId) => ({ recordId, aspectId })));
  }
  const knownRecords = new Map(state.records.map((entry) => [entry.record.recordId, entry]));
  const existing = new Set(state.tasks.map((task) => `${task.recordId}|${task.aspectId}|${task.annotationRound}`));
  const created: AnnotationTask[] = [];
  for (const pair of pairs) {
    if (!knownRecords.has(pair.recordId)) throw new AnnotationWorkflowError("annotation_task_record_missing");
    if (!isAspectId(pair.aspectId) || !state.workspace.selectedAspectIds.includes(pair.aspectId)) throw new AnnotationWorkflowError("annotation_task_aspect_unknown");
    const key = `${pair.recordId}|${pair.aspectId}|${annotationRound}`;
    if (existing.has(key)) continue;
    existing.add(key);
    const record = knownRecords.get(pair.recordId)!;
    const policy = sourcePolicy(state, record.provenance.sourceId);
    const excluded = recordHasRevocationAction(state, record, "exclude_from_training")
      || recordHasRevocationAction(state, record, "exclude_from_evaluation")
      || !policy
      || !record.provenance.allowedUses.includes("annotation");
    created.push({
      version: 1,
      taskId: `task-${pair.recordId}-${pair.aspectId}-r${annotationRound}`,
      recordId: pair.recordId,
      aspectId: pair.aspectId,
      annotationRound,
      status: excluded ? "excluded" : "pending",
      assignedAnnotators: [],
      requiredAnnotationCount,
      priority: options.priority ?? 0,
      createdAt,
      updatedAt: createdAt,
    });
  }
  const tasks = [...state.tasks, ...created].sort((left, right) => (
    right.priority - left.priority
    || left.recordId.localeCompare(right.recordId)
    || left.aspectId.localeCompare(right.aspectId)
    || left.annotationRound - right.annotationRound
  ));
  return { state: { ...state, tasks }, createdTaskIds: created.map((entry) => entry.taskId) };
}

export function previewRecordImport(state: AnnotationWorkspaceState, rawBundle: unknown): { bundle?: AnnotationRecordImportBundle; preview: AnnotationImportPreview } {
  const decoded = decodeAnnotationRecordImportBundle(rawBundle);
  if (!decoded.ok) {
    return {
      preview: {
        total: Array.isArray((rawBundle as { records?: unknown[] } | null)?.records) ? (rawBundle as { records: unknown[] }).records.length : 0,
        valid: 0,
        invalid: decoded.issues.length,
        duplicateSame: 0,
        duplicateConflict: 0,
        unresolvedLicense: 0,
        revoked: 0,
        taskRecordCount: 0,
        issues: decoded.issues.map((entry) => validationIssue(entry.code, "critical", entry.message, [], entry.path)),
      },
    };
  }
  const bundle = decoded.value;
  const computedHash = sha256Text(serializeCanonicalJson(bundle.records));
  const issues: AnnotationValidationIssue[] = [];
  if (computedHash !== bundle.contentHash) issues.push(validationIssue("annotation_import_checksum_mismatch", "critical", "Import bundle checksum doğrulaması başarısız.", [], "$.contentHash"));
  const current = new Map(state.records.map((entry) => [identityKey(entry), entry]));
  const within = new Map<string, AnnotationWorkspaceRecord>();
  let duplicateSame = 0;
  let duplicateConflict = 0;
  let unresolvedLicense = 0;
  let revoked = 0;
  let valid = 0;
  for (const record of bundle.records) {
    const key = identityKey(record);
    const previous = within.get(key) ?? current.get(key);
    if (previous) {
      if (previous.payloadHash === record.payloadHash) duplicateSame += 1;
      else {
        duplicateConflict += 1;
        issues.push(validationIssue("annotation_import_duplicate_conflict", "critical", "Aynı exact identity farklı payload ile geldi; sessiz overwrite yapılmadı.", [record.record.recordId]));
      }
      continue;
    }
    within.set(key, record);
    const policy = sourcePolicy(state, record.provenance.sourceId);
    if (!policy || policy.licenseStatus === "unresolved" || policy.useClass === "prohibited_or_unresolved") unresolvedLicense += 1;
    if (activeRevocations(state).some((entry) => revocationAppliesToRecord(entry, record, state.workspace.workspaceId))) revoked += 1;
    valid += 1;
  }
  return {
    bundle,
    preview: {
      total: bundle.records.length,
      valid,
      invalid: issues.filter((entry) => entry.code !== "annotation_import_duplicate_conflict").length,
      duplicateSame,
      duplicateConflict,
      unresolvedLicense,
      revoked,
      taskRecordCount: Math.max(0, valid - revoked),
      issues,
    },
  };
}

export function applyRecordImport(
  state: AnnotationWorkspaceState,
  rawBundle: unknown,
  confirmed: boolean,
  now?: string,
): { state: AnnotationWorkspaceState; preview: AnnotationImportPreview; importedRecordIds: string[] } {
  mutable(state);
  if (!confirmed) throw new AnnotationWorkflowError("annotation_import_confirmation_required");
  const { bundle, preview } = previewRecordImport(state, rawBundle);
  if (!bundle || preview.invalid > 0 || preview.duplicateConflict > 0 || preview.issues.some((entry) => entry.severity === "critical")) {
    throw new AnnotationWorkflowError("annotation_import_rejected");
  }
  const existingKeys = new Set(state.records.map(identityKey));
  const imported = bundle.records.filter((entry) => !existingKeys.has(identityKey(entry)));
  const timestamp = nowIso(now);
  const nextRecords = [...state.records, ...imported];
  return {
    state: {
      ...state,
      workspace: {
        ...state.workspace,
        manifest: { ...state.workspace.manifest, recordCount: nextRecords.length, updatedAt: timestamp },
        status: state.workspace.status === "draft" ? "internal_pilot" : state.workspace.status,
        updatedAt: timestamp,
      },
      records: nextRecords,
    },
    preview,
    importedRecordIds: imported.map((entry) => entry.record.recordId),
  };
}

function activeAnnotationsForTask(state: AnnotationWorkspaceState, task: AnnotationTask): StoredAspectAnnotation[] {
  return state.annotations.filter((entry) => entry.active
    && entry.annotation.recordId === task.recordId
    && entry.annotation.aspectId === task.aspectId
    && entry.annotation.annotationRound === task.annotationRound
    && entry.annotation.labelSource === "human_annotation");
}

function statusForTask(state: AnnotationWorkspaceState, task: AnnotationTask): AnnotationTask["status"] {
  if (task.status === "excluded" || task.status === "adjudicated") return task.status;
  const active = activeAnnotationsForTask(state, task);
  if (active.length === 0) return "pending";
  if (active.length < task.requiredAnnotationCount) return "in_progress";
  return new Set(active.map((entry) => entry.annotation.label)).size > 1 ? "conflict" : "annotated";
}

export function saveAnnotation(
  state: AnnotationWorkspaceState,
  annotation: AspectAnnotationRecord,
  expectedRevision: number,
  now?: string,
): { state: AnnotationWorkspaceState; saved: StoredAspectAnnotation } {
  mutable(state);
  if (!isValidAnnotatorId(annotation.annotatorId)) throw new AnnotationWorkflowError("annotation_annotator_invalid");
  const task = state.tasks.find((entry) => entry.recordId === annotation.recordId
    && entry.aspectId === annotation.aspectId && entry.annotationRound === annotation.annotationRound);
  if (!task || task.status === "excluded") throw new AnnotationWorkflowError("annotation_task_missing_or_excluded");
  if (!state.records.some((entry) => entry.record.recordId === annotation.recordId)) throw new AnnotationWorkflowError("annotation_record_missing");
  const existing = state.annotations.find((entry) => entry.active
    && entry.annotation.recordId === annotation.recordId
    && entry.annotation.aspectId === annotation.aspectId
    && entry.annotation.annotationRound === annotation.annotationRound
    && entry.annotation.annotatorId === annotation.annotatorId);
  const currentRevision = existing?.revision ?? 0;
  if (expectedRevision !== currentRevision) throw new AnnotationRevisionConflictError();
  const timestamp = nowIso(now);
  const saved: StoredAspectAnnotation = {
    version: 1,
    annotation,
    revision: currentRevision + 1,
    active: true,
    ...(existing ? { supersedesAnnotationId: existing.annotation.annotationId } : {}),
    updatedAt: timestamp,
  };
  const decoded = decodeStoredAspectAnnotation(saved);
  if (!decoded.ok) throw new AnnotationWorkflowError(`annotation_invalid:${decoded.issues[0]?.code ?? "unknown"}`);
  const annotations = [
    ...state.annotations.map((entry) => entry === existing ? { ...entry, active: false, updatedAt: timestamp } : entry),
    decoded.value,
  ];
  const temporary = { ...state, annotations };
  const tasks = state.tasks.map((entry) => entry.taskId === task.taskId
    ? {
      ...entry,
      assignedAnnotators: [...new Set([...entry.assignedAnnotators, annotation.annotatorId])],
      updatedAt: timestamp,
      status: statusForTask(temporary, entry),
    }
    : entry);
  return {
    state: {
      ...state,
      workspace: { ...state.workspace, status: "annotation_in_progress", updatedAt: timestamp },
      annotations,
      tasks,
    },
    saved: decoded.value,
  };
}

export function adjudicateTask(
  state: AnnotationWorkspaceState,
  adjudication: AnnotationAdjudicationRecord,
  now?: string,
): { state: AnnotationWorkspaceState; saved: AnnotationAdjudicationRecord } {
  mutable(state);
  const decoded = decodeAdjudication(adjudication);
  if (!decoded.ok) throw new AnnotationWorkflowError(`annotation_adjudication_invalid:${decoded.issues[0]?.code ?? "unknown"}`);
  const task = state.tasks.find((entry) => entry.taskId === adjudication.taskId);
  if (!task) throw new AnnotationWorkflowError("annotation_adjudication_task_missing");
  const active = activeAnnotationsForTask(state, task);
  if (active.length < 2 || new Set(active.map((entry) => entry.annotation.label)).size < 2) {
    throw new AnnotationWorkflowError("annotation_adjudication_conflict_missing");
  }
  const activeIds = new Set(active.map((entry) => entry.annotation.annotationId));
  if (adjudication.comparedAnnotationIds.some((id) => !activeIds.has(id))) throw new AnnotationWorkflowError("annotation_adjudication_reference_invalid");
  if (state.adjudications.some((entry) => entry.taskId === task.taskId)) throw new AnnotationWorkflowError("annotation_adjudication_duplicate");
  const timestamp = nowIso(now);
  return {
    state: {
      ...state,
      workspace: { ...state.workspace, updatedAt: timestamp },
      adjudications: [...state.adjudications, decoded.value],
      tasks: state.tasks.map((entry) => entry.taskId === task.taskId ? { ...entry, status: "adjudicated", updatedAt: timestamp } : entry),
    },
    saved: decoded.value,
  };
}

export function addRevocation(
  state: AnnotationWorkspaceState,
  revocation: DatasetRevocationRecord,
  now?: string,
): { state: AnnotationWorkspaceState; affectedRecordIds: string[] } {
  const decoded = decodeDatasetRevocationRecord(revocation);
  if (!decoded.ok) throw new AnnotationWorkflowError(`annotation_revocation_invalid:${decoded.issues[0]?.code ?? "unknown"}`);
  if (state.revocations.some((entry) => entry.revocationId === revocation.revocationId)) throw new AnnotationWorkflowError("annotation_revocation_duplicate");
  if (revocation.replacesRevocationId && !state.revocations.some((entry) => entry.revocationId === revocation.replacesRevocationId)) {
    throw new AnnotationWorkflowError("annotation_revocation_replacement_missing");
  }
  const timestamp = nowIso(now);
  const revocations = [
    ...state.revocations.map((entry) => entry.revocationId === revocation.replacesRevocationId ? { ...entry, status: "reversed" as const } : entry),
    decoded.value,
  ];
  const probe = { ...state, revocations };
  const affected = state.records.filter((record) => revocationAppliesToRecord(decoded.value, record, state.workspace.workspaceId));
  const affectedIds = new Set(affected.map((entry) => entry.record.recordId));
  return {
    state: {
      ...state,
      workspace: {
        ...state.workspace,
        status: revocation.scope === "workspace" && revocation.status === "active" ? "revoked" : state.workspace.status,
        updatedAt: timestamp,
      },
      revocations,
      tasks: state.tasks.map((task) => {
        const record = state.records.find((entry) => entry.record.recordId === task.recordId);
        return record && recordHasRevocationAction(probe, record, "exclude_from_export")
          ? { ...task, status: "excluded", updatedAt: timestamp }
          : task;
      }),
    },
    affectedRecordIds: [...affectedIds].sort(),
  };
}

export function validateAnnotationWorkspace(state: AnnotationWorkspaceState): AnnotationValidationIssue[] {
  const issues: AnnotationValidationIssue[] = [];
  const activeAnnotations = state.annotations.filter((entry) => entry.active).map((entry) => entry.annotation);
  const dataset = decodeDatasetPackage({
    manifest: { ...state.workspace.manifest, recordCount: state.records.length },
    records: state.records.map((entry) => entry.record),
    provenance: state.records.map((entry) => entry.provenance),
    annotations: activeAnnotations,
  });
  if (!dataset.ok) {
    issues.push(...dataset.issues.map((entry) => validationIssue(entry.code, "critical", entry.message, [], entry.path)));
  }
  const keys = new Map<string, AnnotationWorkspaceRecord>();
  for (const record of state.records) {
    if (record.personalData !== false) issues.push(validationIssue("annotation_personal_data_forbidden", "critical", "Kişisel veri işaretli kayıt workspace'te bulunamaz.", [record.record.recordId]));
    const key = identityKey(record);
    const prior = keys.get(key);
    if (prior && prior.payloadHash !== record.payloadHash) issues.push(validationIssue("annotation_duplicate_conflicting_record", "critical", "Aynı exact identity farklı payload taşıyor.", [prior.record.recordId, record.record.recordId]));
    keys.set(key, record);
    const policy = sourcePolicy(state, record.provenance.sourceId);
    if (!policy) issues.push(validationIssue("annotation_source_policy_missing", "warning", "Kayıt için source policy bulunamadı.", [record.record.recordId]));
    else if (record.record.split === "train" && !sourcePolicyAllowsTraining(policy)) issues.push(validationIssue("dataset_training_license_unresolved", "critical", "Training-eligible kayıt için lisans/izin çözülmemiş.", [record.record.recordId]));
    if (activeRevocations(state).some((entry) => revocationAppliesToRecord(entry, record, state.workspace.workspaceId))) {
      issues.push(validationIssue("annotation_revoked_data_present", "critical", "Aktif revocation kapsamındaki kayıt workspace'te işaretlenmiş durumda.", [record.record.recordId]));
    }
  }
  const activeByTask = new Map<string, StoredAspectAnnotation[]>();
  for (const task of state.tasks) activeByTask.set(task.taskId, activeAnnotationsForTask(state, task));
  const doubleAnnotated = [...activeByTask.values()].filter((entries) => new Set(entries.map((entry) => entry.annotation.annotatorId)).size >= 2).length;
  const coverage = state.tasks.length === 0 ? 0 : (doubleAnnotated / state.tasks.length) * 100;
  if (state.tasks.length > 0 && doubleAnnotated === 0) issues.push(validationIssue("annotation_single_annotator_limitation", "warning", "Workspace yalnız tek annotator kanıtı taşıyor; agreement hesaplanamaz."));
  if (state.tasks.length > 0 && coverage < 20) issues.push(validationIssue("annotation_double_coverage_low", "warning", "Bağımsız çift annotation kapsamı yüzde 20'nin altında."));
  const conflicts = state.tasks.filter((task) => task.status === "conflict");
  if (conflicts.length > 0) issues.push(validationIssue("annotation_conflict_unresolved", "warning", "Çözülmemiş annotation conflict bulunuyor.", conflicts.map((entry) => entry.taskId)));
  const coveredAspects = new Set(activeAnnotations.map((entry) => entry.aspectId));
  const missingAspects = state.workspace.selectedAspectIds.filter((id) => !coveredAspects.has(id));
  if (missingAspects.length > 0) issues.push(validationIssue("annotation_aspect_coverage_missing", "warning", "Seçili bazı aspect'lerde aktif annotation yok.", missingAspects));
  const insufficient = activeAnnotations.filter((entry) => entry.label === "insufficient_evidence").length;
  if (activeAnnotations.length >= 5 && insufficient / activeAnnotations.length > 0.5) issues.push(validationIssue("annotation_insufficient_evidence_excessive", "warning", "Yetersiz kanıt etiketi oranı yüzde 50'nin üzerinde."));
  issues.push(validationIssue("annotation_progress", "info", `${state.tasks.filter((task) => ["annotated", "adjudicated"].includes(task.status)).length}/${state.tasks.length} görev tamamlandı.`));
  for (const aspectId of state.workspace.selectedAspectIds) {
    const labels = activeAnnotations.filter((entry) => entry.aspectId === aspectId);
    issues.push(validationIssue("annotation_aspect_distribution", "info", `${ASPECT_REGISTRY[aspectId].labelTr}: ${labels.length} aktif annotation.`, [aspectId]));
  }
  return issues;
}

export function changeWorkspaceStatus(
  state: AnnotationWorkspaceState,
  status: AnnotationWorkspaceState["workspace"]["status"],
  manuallyApproved: boolean,
  now?: string,
): AnnotationWorkspaceState {
  if (state.workspace.status === "revoked") throw new AnnotationWorkflowError("annotation_revoked_status_locked");
  if (state.workspace.status === "frozen" && status !== "revoked") throw new AnnotationWorkflowError("annotation_frozen_status_locked");
  if (status === "gold_candidate") {
    if (!manuallyApproved) throw new AnnotationWorkflowError("annotation_gold_manual_approval_required");
    if (state.tasks.length === 0) throw new AnnotationWorkflowError("annotation_gold_requirements_unmet");
    const blocking = validateAnnotationWorkspace(state).filter((entry) => entry.severity === "critical"
      || entry.code === "annotation_double_coverage_low" || entry.code === "annotation_conflict_unresolved");
    if (blocking.length > 0) throw new AnnotationWorkflowError("annotation_gold_requirements_unmet");
  }
  return { ...state, workspace: { ...state.workspace, status, updatedAt: nowIso(now) } };
}

export function createAnnotationExport(
  state: AnnotationWorkspaceState,
  purpose: AnnotationExportPurpose,
  now?: string,
): AnnotationExportBundle {
  if (state.workspace.status === "revoked") throw new AnnotationWorkflowError("annotation_export_workspace_revoked");
  if (state.records.some((entry) => entry.personalData !== false)) throw new AnnotationWorkflowError("annotation_export_personal_data");
  if (purpose === "evaluation_candidate" && state.tasks.some((entry) => entry.status === "conflict")) {
    throw new AnnotationWorkflowError("annotation_export_unresolved_conflict");
  }
  const limitations: string[] = [];
  const active = state.annotations.filter((entry) => entry.active);
  const distinctAnnotators = new Set(active.map((entry) => entry.annotation.annotatorId));
  if (distinctAnnotators.size < 2) limitations.push("single-annotator limitation: bağımsız agreement kanıtı yoktur.");
  const includedRecords = state.records.filter((record) => {
    if (recordHasRevocationAction(state, record, "exclude_from_export")) return false;
    if (purpose === "training_candidate") {
      const policy = sourcePolicy(state, record.provenance.sourceId);
      return Boolean(policy && sourcePolicyAllowsTraining(policy) && record.provenance.allowedUses.includes("training")
        && !recordHasRevocationAction(state, record, "exclude_from_training"));
    }
    if (purpose === "evaluation_candidate") {
      return record.provenance.allowedUses.includes("evaluation")
        && !recordHasRevocationAction(state, record, "exclude_from_evaluation");
    }
    return true;
  });
  if (includedRecords.length < state.records.length) limitations.push("Lisans veya revocation nedeniyle bazı kayıtlar export dışında bırakıldı.");
  const includedIds = new Set(includedRecords.map((entry) => entry.record.recordId));
  const annotations = active.filter((entry) => includedIds.has(entry.annotation.recordId));
  const taskByAnnotation = new Map<string, AnnotationTask>();
  for (const task of state.tasks) {
    for (const annotation of activeAnnotationsForTask(state, task)) taskByAnnotation.set(annotation.annotation.annotationId, task);
  }
  const filteredAnnotations = purpose === "adjudicated_labels" || purpose === "evaluation_candidate"
    ? annotations.filter((entry) => taskByAnnotation.get(entry.annotation.annotationId)?.status === "adjudicated")
    : annotations;
  const generatedAt = nowIso(now);
  const withoutHash = {
    version: 1 as const,
    exportPurpose: purpose,
    releaseStatus: "internal_only" as const,
    manifest: { ...state.workspace.manifest, releaseStatus: "internal_only" as const, recordCount: includedRecords.length, updatedAt: generatedAt },
    includedRecordIds: includedRecords.map((entry) => entry.record.recordId).sort(),
    records: includedRecords,
    annotations: filteredAnnotations,
    adjudications: state.adjudications.filter((entry) => entry.comparedAnnotationIds.some((id) => filteredAnnotations.some((annotation) => annotation.annotation.annotationId === id))),
    sourcePolicies: state.workspace.manifest.sourcePolicies,
    revocationsSummary: state.revocations.map(({ revocationId, scope, targetId, actions, status }) => ({ revocationId, scope, targetId, actions, status })),
    limitations,
    generatedAt,
  };
  return { ...withoutHash, contentHash: sha256Text(serializeCanonicalJson(withoutHash)) };
}

export function newAnnotationId(): string {
  return `annotation-${randomUUID()}`;
}
