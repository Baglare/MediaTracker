import { isAspectId, type AspectId } from "../../../domain/aspect-registry";

import type { AnnotationToolReadModel } from "../domain/types";

export const MAX_SPARSE_TASK_PAIRS = 1000;

export interface SparseTaskPlan {
  version: 1;
  workspaceId: string;
  pairs: readonly { recordId: string; aspectId: AspectId }[];
}

export type SparseTaskPlanIssueCode =
  | "malformed_json"
  | "invalid_root"
  | "unknown_field"
  | "invalid_version"
  | "workspace_mismatch"
  | "invalid_pairs"
  | "too_many_pairs"
  | "invalid_pair"
  | "duplicate_pair"
  | "unknown_record"
  | "unknown_aspect";

export interface SparseTaskPlanPreview {
  totalPairs: number;
  uniqueRecordCount: number;
  uniqueAspectCount: number;
  duplicatePairCount: number;
  invalidRecordCount: number;
  invalidAspectCount: number;
  existingTaskCount: number;
  creatableTaskCount: number;
  issueCodes: readonly SparseTaskPlanIssueCode[];
  plan?: SparseTaskPlan;
}

export interface AllSelectedTaskPreview {
  recordCount: number;
  aspectCount: number;
  totalPairCount: number;
  existingTaskCount: number;
  creatableTaskCount: number;
  requiresConfirmation: boolean;
}

const ROOT_FIELDS = new Set(["version", "workspaceId", "pairs"]);
const PAIR_FIELDS = new Set(["recordId", "aspectId"]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => fields.has(key));
}

function emptyPreview(code: SparseTaskPlanIssueCode): SparseTaskPlanPreview {
  return {
    totalPairs: 0,
    uniqueRecordCount: 0,
    uniqueAspectCount: 0,
    duplicatePairCount: 0,
    invalidRecordCount: 0,
    invalidAspectCount: 0,
    existingTaskCount: 0,
    creatableTaskCount: 0,
    issueCodes: [code],
  };
}

export function previewSparseTaskPlanJson(
  raw: string,
  model: AnnotationToolReadModel,
): SparseTaskPlanPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return emptyPreview("malformed_json");
  }
  return previewSparseTaskPlan(parsed, model);
}

export function previewSparseTaskPlan(
  raw: unknown,
  model: AnnotationToolReadModel,
): SparseTaskPlanPreview {
  if (!object(raw)) return emptyPreview("invalid_root");

  const issues = new Set<SparseTaskPlanIssueCode>();
  if (!hasExactFields(raw, ROOT_FIELDS)) issues.add("unknown_field");
  if (raw.version !== 1) issues.add("invalid_version");
  if (raw.workspaceId !== model.workspace.workspaceId) issues.add("workspace_mismatch");
  if (!Array.isArray(raw.pairs)) {
    issues.add("invalid_pairs");
    return { ...emptyPreview("invalid_pairs"), issueCodes: [...issues] };
  }

  const totalPairs = raw.pairs.length;
  if (totalPairs > MAX_SPARSE_TASK_PAIRS) issues.add("too_many_pairs");
  const knownRecords = new Set(model.records.map((entry) => entry.record.recordId));
  const selectedAspects = new Set(model.workspace.selectedAspectIds);
  const existingTasks = new Set(model.tasks
    .filter((task) => task.annotationRound === 1)
    .map((task) => `${task.recordId}|${task.aspectId}`));
  const seen = new Set<string>();
  const validPairs: { recordId: string; aspectId: AspectId }[] = [];
  const uniqueRecords = new Set<string>();
  const uniqueAspects = new Set<AspectId>();
  let duplicatePairCount = 0;
  let invalidRecordCount = 0;
  let invalidAspectCount = 0;
  let existingTaskCount = 0;

  for (const candidate of raw.pairs) {
    if (!object(candidate) || !hasExactFields(candidate, PAIR_FIELDS)
      || typeof candidate.recordId !== "string" || typeof candidate.aspectId !== "string") {
      issues.add(object(candidate) && !hasExactFields(candidate, PAIR_FIELDS) ? "unknown_field" : "invalid_pair");
      continue;
    }
    const key = `${candidate.recordId}|${candidate.aspectId}`;
    if (seen.has(key)) {
      duplicatePairCount += 1;
      issues.add("duplicate_pair");
      continue;
    }
    seen.add(key);
    const recordValid = knownRecords.has(candidate.recordId);
    const aspectId = isAspectId(candidate.aspectId) ? candidate.aspectId : null;
    const aspectValid = aspectId !== null && selectedAspects.has(aspectId);
    if (!recordValid) {
      invalidRecordCount += 1;
      issues.add("unknown_record");
    }
    if (!aspectValid) {
      invalidAspectCount += 1;
      issues.add("unknown_aspect");
    }
    if (!recordValid || !aspectValid || aspectId === null) continue;
    uniqueRecords.add(candidate.recordId);
    uniqueAspects.add(aspectId);
    if (existingTasks.has(key)) existingTaskCount += 1;
    else validPairs.push({ recordId: candidate.recordId, aspectId });
  }

  const structurallyValid = issues.size === 0;
  return {
    totalPairs,
    uniqueRecordCount: uniqueRecords.size,
    uniqueAspectCount: uniqueAspects.size,
    duplicatePairCount,
    invalidRecordCount,
    invalidAspectCount,
    existingTaskCount,
    creatableTaskCount: validPairs.length,
    issueCodes: [...issues],
    ...(structurallyValid ? {
      plan: {
        version: 1,
        workspaceId: raw.workspaceId as string,
        pairs: raw.pairs.map((pair) => ({
          recordId: (pair as Record<string, string>).recordId,
          aspectId: (pair as Record<string, AspectId>).aspectId,
        })),
      },
    } : {}),
  };
}

export function previewAllSelectedTasks(model: AnnotationToolReadModel): AllSelectedTaskPreview {
  const recordIds = new Set(model.records.map((entry) => entry.record.recordId));
  const aspectIds = new Set(model.workspace.selectedAspectIds);
  const totalPairCount = recordIds.size * aspectIds.size;
  const existingTaskCount = new Set(model.tasks
    .filter((task) => task.annotationRound === 1 && recordIds.has(task.recordId) && aspectIds.has(task.aspectId))
    .map((task) => `${task.recordId}|${task.aspectId}`)).size;
  const creatableTaskCount = Math.max(0, totalPairCount - existingTaskCount);
  return {
    recordCount: recordIds.size,
    aspectCount: aspectIds.size,
    totalPairCount,
    existingTaskCount,
    creatableTaskCount,
    requiresConfirmation: creatableTaskCount > 50,
  };
}

export function sparseTaskPlanIssueMessageTr(code: SparseTaskPlanIssueCode): string {
  return ({
    malformed_json: "Sparse plan JSON biçimi geçersiz.",
    invalid_root: "Sparse plan bir JSON nesnesi olmalıdır.",
    unknown_field: "Sparse plan yalnız version, workspaceId ve pairs; pair içinde yalnız recordId ve aspectId alanlarını kabul eder.",
    invalid_version: "Sparse plan version değeri 1 olmalıdır.",
    workspace_mismatch: "Sparse plan workspaceId değeri aktif workspace ile eşleşmiyor.",
    invalid_pairs: "Sparse plan pairs alanı bir dizi olmalıdır.",
    too_many_pairs: "Sparse plan en fazla 1000 pair içerebilir.",
    invalid_pair: "Sparse planda geçersiz recordId/aspectId pair'i var.",
    duplicate_pair: "Sparse planda yinelenen recordId/aspectId pair'i var.",
    unknown_record: "Sparse planda aktif workspace'te bulunmayan record var.",
    unknown_aspect: "Sparse planda registry veya workspace seçiminde bulunmayan aspect var.",
  } satisfies Record<SparseTaskPlanIssueCode, string>)[code];
}

export function taskGenerationErrorMessageTr(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "annotation_task_record_missing") return "Task planında workspace içinde bulunmayan kayıt var.";
  if (code === "annotation_task_aspect_unknown") return "Task planında seçili olmayan veya bilinmeyen aspect var.";
  if (code === "annotation_workspace_immutable") return "Frozen veya revoked workspace için task üretilemez.";
  return "Task üretilemedi; planı ve aktif workspace'i yeniden doğrulayın.";
}
