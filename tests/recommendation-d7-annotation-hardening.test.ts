import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decodeAspectAnnotationRecord } from "@/features/recommendations/evaluation/dataset";
import type {
  AnnotationAdjudicationRecord,
  AnnotationWorkspaceState,
  StoredAspectAnnotation,
} from "@/features/recommendations/evaluation/annotation-tool/domain/types";
import { AnnotationToolService } from "@/features/recommendations/evaluation/annotation-tool/server/service";
import {
  addRevocation,
  adjudicateTask,
  applyRecordImport,
  aspectInputSufficiencyMetrics,
  changeWorkspaceStatus,
  createAnnotationExport,
  generateAnnotationTasks,
  saveAnnotation,
  validateAnnotationWorkspace,
} from "@/features/recommendations/evaluation/annotation-tool/server/workflows";
import { serializeCanonicalJson, sha256Text } from "@/features/recommendations/evaluation/annotation-tool/storage/atomic";
import {
  computeWorkspaceDatasetContentHash,
  deriveTaskAspectIds,
  previewWorkspaceMetadataReconcile,
  reconcileWorkspaceMetadata,
  withWorkspaceDatasetContentHash,
} from "@/features/recommendations/evaluation/annotation-tool/storage/workspace-integrity";
import { annotation, emptyWorkspace, syntheticBundle, TEST_NOW } from "./recommendation-d7-annotation-test-helpers";

const TASK_ASPECTS = [
  "romance",
  "fantasy",
  "political_intrigue",
  "power_progression",
  "love_triangle",
  "fanservice",
  "dark",
  "character_driven",
] as const;

function importedState() {
  return applyRecordImport(emptyWorkspace(), syntheticBundle(), true, TEST_NOW).state;
}

function oneTask(requiredAnnotationCount: 1 | 2 = 1) {
  return generateAnnotationTasks(importedState(), {
    mode: "explicit",
    pairs: [{ recordId: "synthetic-01", aspectId: "romance" }],
  }, { requiredAnnotationCount, now: TEST_NOW }).state;
}

function twoHumanAnnotations(secondMode: "independent_human" | "assisted_human") {
  const first = saveAnnotation(oneTask(2), annotation(), 0, TEST_NOW).state;
  return saveAnnotation(first, annotation({
    annotationId: "annotation-test-002",
    annotatorId: "ann_internal_02",
    assistanceMode: secondMode,
  }), 0, TEST_NOW).state;
}

function sparseTaskState() {
  return generateAnnotationTasks(importedState(), {
    mode: "explicit",
    pairs: TASK_ASPECTS.map((aspectId, index) => ({
      recordId: `synthetic-${String(index + 1).padStart(2, "0")}`,
      aspectId,
    })),
  }, { now: TEST_NOW }).state;
}

function stateWithDarkLabels(labels: readonly ("primary" | "insufficient_evidence")[]): AnnotationWorkspaceState {
  const base = importedState();
  const tasks = labels.map((_, index) => ({
    version: 1 as const,
    taskId: `task-dark-${index + 1}`,
    recordId: `synthetic-${String((index % 10) + 1).padStart(2, "0")}`,
    aspectId: "dark" as const,
    annotationRound: Math.floor(index / 10) + 1,
    status: "annotated" as const,
    assignedAnnotators: ["ann_internal_01"],
    requiredAnnotationCount: 1 as const,
    priority: 0,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  }));
  const annotations: StoredAspectAnnotation[] = labels.map((label, index) => ({
    version: 1,
    annotation: annotation({
      annotationId: `annotation-dark-${String(index + 1).padStart(3, "0")}`,
      recordId: tasks[index]!.recordId,
      aspectId: "dark",
      annotationRound: tasks[index]!.annotationRound,
      label,
    }),
    revision: 1,
    active: true,
    updatedAt: TEST_NOW,
  }));
  return withWorkspaceDatasetContentHash({ ...base, tasks, annotations });
}

describe("D7-1B.1 annotation assistance provenance", () => {
  it.each(["independent_human", "assisted_human"] as const)("%s enum değerini decode eder", (assistanceMode) => {
    expect(decodeAspectAnnotationRecord(annotation({ assistanceMode }))).toMatchObject({ ok: true, value: { assistanceMode } });
  });

  it("legacy eksik assistance alanını unknown_legacy olarak normalize eder", () => {
    const legacy = annotation() as unknown as Record<string, unknown>;
    delete legacy.assistanceMode;
    expect(decodeAspectAnnotationRecord(legacy)).toMatchObject({ ok: true, value: { assistanceMode: "unknown_legacy" } });
  });

  it("invalid assistance değerini reddeder", () => {
    expect(decodeAspectAnnotationRecord({ ...annotation(), assistanceMode: "automatic" })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "annotation_assistance_mode_invalid" })]),
    });
  });

  it("yeni save için assistance provenance zorunludur", async () => {
    expect(() => saveAnnotation(oneTask(), annotation({ assistanceMode: "unknown_legacy" }), 0)).toThrow("annotation_assistance_required");
    await expect(new AnnotationToolService().saveAnnotation({
      workspaceId: "test-workspace",
      annotatorId: "ann_internal_01",
      recordId: "synthetic-01",
      aspectId: "romance",
    })).rejects.toThrow("annotation_assistance_required");
  });

  it("yalnız iki independent human annotation'ı double coverage sayar", () => {
    const independent = twoHumanAnnotations("independent_human");
    expect(validateAnnotationWorkspace(independent).some((entry) => entry.code === "annotation_double_coverage_low")).toBe(false);
    expect(changeWorkspaceStatus(independent, "gold_candidate", true).workspace.status).toBe("gold_candidate");
  });

  it("assisted ikinci annotator'ı agreement saymaz ve gold gate'i bloklar", () => {
    const assisted = twoHumanAnnotations("assisted_human");
    const issues = validateAnnotationWorkspace(assisted);
    expect(issues.some((entry) => entry.code === "annotation_assisted_human_present")).toBe(true);
    expect(issues.some((entry) => entry.code === "annotation_double_coverage_low")).toBe(true);
    expect(() => changeWorkspaceStatus(assisted, "gold_candidate", true)).toThrow("annotation_gold_requirements_unmet");
  });

  it("unknown legacy annotation'ı agreement saymaz", () => {
    const state = twoHumanAnnotations("independent_human");
    const annotations = state.annotations.map((entry, index) => index === 1
      ? { ...entry, annotation: { ...entry.annotation, assistanceMode: "unknown_legacy" as const } }
      : entry);
    const legacy = withWorkspaceDatasetContentHash({ ...state, annotations });
    expect(validateAnnotationWorkspace(legacy).map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "annotation_assistance_unknown",
      "annotation_double_coverage_low",
    ]));
  });

  it("annotation-only provenance'i korur; training/evaluation assisted ve legacy label'ları dışlar", () => {
    const assisted = twoHumanAnnotations("assisted_human");
    const annotationOnly = createAnnotationExport(assisted, "annotation_only", TEST_NOW);
    expect(annotationOnly.annotations).toHaveLength(2);
    expect(annotationOnly.annotations.some((entry) => entry.annotation.assistanceMode === "assisted_human")).toBe(true);
    const training = createAnnotationExport(assisted, "training_candidate", TEST_NOW);
    expect(training.annotations.every((entry) => entry.annotation.assistanceMode === "independent_human")).toBe(true);
    expect(training.limitations.join(" ")).toContain("assistance provenance");
    const evaluation = createAnnotationExport(assisted, "evaluation_candidate", TEST_NOW);
    expect(evaluation.annotations.some((entry) => entry.annotation.assistanceMode !== "independent_human")).toBe(false);
    const legacyAnnotations = assisted.annotations.map((entry, index) => index === 1
      ? { ...entry, annotation: { ...entry.annotation, assistanceMode: "unknown_legacy" as const } }
      : entry);
    const legacy = withWorkspaceDatasetContentHash({ ...assisted, annotations: legacyAnnotations });
    expect(createAnnotationExport(legacy, "annotation_only", TEST_NOW).annotations
      .some((entry) => entry.annotation.assistanceMode === "unknown_legacy")).toBe(true);
    expect(createAnnotationExport(legacy, "training_candidate", TEST_NOW).annotations
      .some((entry) => entry.annotation.assistanceMode === "unknown_legacy")).toBe(false);
  });
});

describe("D7-1B.1 workspace dataset content hash", () => {
  it("boş workspace için deterministic ve non-zero hash üretir", () => {
    const state = emptyWorkspace();
    const first = computeWorkspaceDatasetContentHash(state);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first).not.toBe(`sha256:${"0".repeat(64)}`);
    expect(computeWorkspaceDatasetContentHash(state)).toBe(first);
  });

  it("object key ve canonical array sırasından bağımsızdır", () => {
    expect(sha256Text(serializeCanonicalJson({ a: 1, b: { c: 2 } })))
      .toBe(sha256Text(serializeCanonicalJson({ b: { c: 2 }, a: 1 })));
    const state = importedState();
    expect(computeWorkspaceDatasetContentHash({ ...state, records: [...state.records].reverse() }))
      .toBe(computeWorkspaceDatasetContentHash(state));
  });

  it("import, save, update, adjudication ve revocation mutationlarında hash değişir", () => {
    const emptyHash = computeWorkspaceDatasetContentHash(emptyWorkspace());
    const imported = importedState();
    expect(imported.workspace.manifest.contentHash).not.toBe(emptyHash);
    const first = saveAnnotation(oneTask(2), annotation(), 0, TEST_NOW).state;
    const updated = saveAnnotation(first, annotation({ annotationId: "annotation-test-003", label: "significant" }), 1, "2026-08-06T01:00:00.000Z").state;
    expect(updated.workspace.manifest.contentHash).not.toBe(first.workspace.manifest.contentHash);

    const conflictBase = saveAnnotation(oneTask(2), annotation(), 0, TEST_NOW).state;
    const conflict = saveAnnotation(conflictBase, annotation({ annotationId: "annotation-test-002", annotatorId: "ann_internal_02", label: "significant" }), 0, TEST_NOW).state;
    const adjudication: AnnotationAdjudicationRecord = {
      version: 1,
      adjudicationId: "adjudication-test-001",
      taskId: conflict.tasks[0]!.taskId,
      comparedAnnotationIds: conflict.annotations.filter((entry) => entry.active).map((entry) => entry.annotation.annotationId),
      finalLabel: "primary",
      finalConfidence: "high",
      adjudicatorId: "adj_internal_03",
      rationale: "Sentetik guideline eşiğiyle çözümlendi.",
      adjudicatorWasAnnotator: false,
      createdAt: TEST_NOW,
    };
    const adjudicated = adjudicateTask(conflict, adjudication, TEST_NOW).state;
    expect(adjudicated.workspace.manifest.contentHash).not.toBe(conflict.workspace.manifest.contentHash);
    const revoked = addRevocation(imported, {
      version: 1,
      revocationId: "revocation-test-001",
      scope: "record",
      targetId: "synthetic-01",
      reasonCode: "manual_withdrawal",
      note: "Synthetic revocation.",
      effectiveAt: TEST_NOW,
      createdBy: "reviewer-01",
      createdAt: TEST_NOW,
      actions: ["exclude_from_training"],
      status: "active",
    }, TEST_NOW).state;
    expect(revoked.workspace.manifest.contentHash).not.toBe(imported.workspace.manifest.contentHash);
  });

  it("status-only değişikliği hash'i değiştirmez", () => {
    const state = importedState();
    expect(changeWorkspaceStatus(state, "annotation_in_progress", true).workspace.manifest.contentHash)
      .toBe(state.workspace.manifest.contentHash);
  });

  it("tamper mismatch critical üretir; reconcile hash'i düzeltir ve annotation içeriğini korur", () => {
    const annotated = saveAnnotation(oneTask(), annotation(), 0, TEST_NOW).state;
    const tampered = { ...annotated, workspace: { ...annotated.workspace, manifest: { ...annotated.workspace.manifest, contentHash: `sha256:${"f".repeat(64)}` } } };
    expect(validateAnnotationWorkspace(tampered)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "annotation_manifest_content_hash_mismatch", severity: "critical" }),
    ]));
    const before = structuredClone(tampered.annotations);
    const reconciled = reconcileWorkspaceMetadata(tampered, TEST_NOW);
    expect(reconciled.workspace.manifest.contentHash).toBe(computeWorkspaceDatasetContentHash(reconciled));
    expect(reconciled.annotations).toEqual(before);
  });
});

describe("D7-1B.1 sparse scope and input sufficiency", () => {
  it("sparse task scope'u 8 aspect olarak türetir; unused selected 4 coverage warning'i olmaz", () => {
    const state = sparseTaskState();
    expect(deriveTaskAspectIds(state)).toHaveLength(8);
    const issues = validateAnnotationWorkspace(state);
    expect(issues.find((entry) => entry.code === "annotation_aspect_coverage_missing")?.relatedIds).toHaveLength(8);
    expect(issues.find((entry) => entry.code === "annotation_aspect_not_in_current_plan")?.relatedIds).toHaveLength(4);
  });

  it("all-selected task scope'unda 12 aspect'i korur", () => {
    expect(deriveTaskAspectIds(generateAnnotationTasks(importedState(), { mode: "all_selected" }).state)).toHaveLength(12);
  });

  it("reconcile ve export manifest'i actual 8-aspect task scope'una getirir", () => {
    const state = sparseTaskState();
    const preview = previewWorkspaceMetadataReconcile(state);
    expect(preview.computedAspectIds).toHaveLength(8);
    expect(reconcileWorkspaceMetadata(state, TEST_NOW).workspace.manifest.aspectIds).toHaveLength(8);
    expect(createAnnotationExport(state, "annotation_only", TEST_NOW).manifest.aspectIds).toHaveLength(8);
  });

  it("n<3 için threshold warning üretmez", () => {
    expect(validateAnnotationWorkspace(stateWithDarkLabels(["insufficient_evidence", "primary"]))
      .some((entry) => entry.code === "annotation_aspect_input_insufficient")).toBe(false);
  });

  it("n=3 ve 2 insufficient için warning üretir", () => {
    const state = stateWithDarkLabels(["insufficient_evidence", "insufficient_evidence", "primary"]);
    expect(aspectInputSufficiencyMetrics(state)).toEqual([
      { aspectId: "dark", totalActiveAnnotations: 3, insufficientCount: 2, insufficientRate: 2 / 3 },
    ]);
    expect(validateAnnotationWorkspace(state).some((entry) => entry.code === "annotation_aspect_input_insufficient")).toBe(true);
  });

  it("%49 warning üretmez; %50 warning üretir ve global warning korunur", () => {
    const below = stateWithDarkLabels([
      ...Array.from({ length: 49 }, () => "insufficient_evidence" as const),
      ...Array.from({ length: 51 }, () => "primary" as const),
    ]);
    expect(validateAnnotationWorkspace(below).some((entry) => entry.code === "annotation_aspect_input_insufficient")).toBe(false);
    const threshold = stateWithDarkLabels([
      ...Array.from({ length: 50 }, () => "insufficient_evidence" as const),
      ...Array.from({ length: 50 }, () => "primary" as const),
    ]);
    expect(validateAnnotationWorkspace(threshold).some((entry) => entry.code === "annotation_aspect_input_insufficient")).toBe(true);
    expect(validateAnnotationWorkspace(stateWithDarkLabels(["insufficient_evidence", "insufficient_evidence", "insufficient_evidence", "primary", "primary"]))
      .some((entry) => entry.code === "annotation_insufficient_evidence_excessive")).toBe(true);
  });
});
