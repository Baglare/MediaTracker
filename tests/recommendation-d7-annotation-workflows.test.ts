import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decodeAnnotationRecordImportBundle,
  decodeAnnotationWorkspaceRecord,
} from "@/features/recommendations/evaluation/annotation-tool/domain/codec";
import type { AnnotationAdjudicationRecord, DatasetRevocationRecord } from "@/features/recommendations/evaluation/annotation-tool/domain/types";
import {
  AnnotationRevisionConflictError,
  addRevocation,
  adjudicateTask,
  applyRecordImport,
  changeWorkspaceStatus,
  createAnnotationExport,
  generateAnnotationTasks,
  previewRecordImport,
  saveAnnotation,
  validateAnnotationWorkspace,
} from "@/features/recommendations/evaluation/annotation-tool/server/workflows";
import { annotation, emptyWorkspace, syntheticBundle, TEST_NOW } from "./recommendation-d7-annotation-test-helpers";

function importedState() {
  return applyRecordImport(emptyWorkspace(), syntheticBundle(), true, TEST_NOW).state;
}

function taskState(requiredAnnotationCount: 1 | 2 = 1) {
  return generateAnnotationTasks(importedState(), { mode: "explicit", pairs: [{ recordId: "synthetic-01", aspectId: "romance" }] }, { requiredAnnotationCount, now: TEST_NOW }).state;
}

function withTwoAnnotations(secondLabel: "primary" | "significant" | "insufficient_evidence" = "significant") {
  const first = saveAnnotation(taskState(2), annotation(), 0, TEST_NOW).state;
  return saveAnnotation(first, annotation({ annotationId: "annotation-test-002", annotatorId: "ann_internal_02", label: secondLabel }), 0, TEST_NOW).state;
}

describe("D7-1A record import", () => {
  it("10 eserlik sentetik versioned bundle ve exact synthetic identity'yi kabul eder", () => {
    const decoded = decodeAnnotationRecordImportBundle(syntheticBundle());
    expect(decoded).toMatchObject({ ok: true, value: { records: expect.arrayContaining([expect.objectContaining({ identity: { kind: "synthetic", syntheticId: "synthetic-01" } })]) } });
    if (decoded.ok) expect(decoded.value.records).toHaveLength(10);
  });

  it("valid checksum preview sayımlarını üretir", () => {
    expect(previewRecordImport(emptyWorkspace(), syntheticBundle()).preview).toMatchObject({ total: 10, valid: 10, invalid: 0, duplicateConflict: 0, taskRecordCount: 10 });
  });

  it("invalid version'ı reddeder", () => {
    expect(decodeAnnotationRecordImportBundle({ ...syntheticBundle(), version: 2 })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "annotation_import_version_invalid" })]) });
  });

  it("missing provenance ve personalData=true değerini reddeder", () => {
    const record = syntheticBundle().records[0]!;
    expect(decodeAnnotationWorkspaceRecord({ ...record, provenance: undefined })).toMatchObject({ ok: false });
    expect(decodeAnnotationWorkspaceRecord({ ...record, personalData: true })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "annotation_personal_data_forbidden" })]) });
  });

  it("HTML/script ve overlong summary'yi reddeder", () => {
    const record = structuredClone(syntheticBundle().records[0]!);
    record.record.candidate = { ...record.record.candidate, shortSummary: "<script>alert(1)</script>" };
    expect(decodeAnnotationWorkspaceRecord(record)).toMatchObject({ ok: false });
    record.record.candidate = { ...record.record.candidate, shortSummary: "x".repeat(601) };
    expect(decodeAnnotationWorkspaceRecord(record)).toMatchObject({ ok: false });
  });

  it("provider/synthetic exact identity mismatch'ini reddeder", () => {
    const record = syntheticBundle().records[0]!;
    expect(decodeAnnotationWorkspaceRecord({ ...record, identity: { kind: "provider", canonicalKey: "anilist:anime:1" } })).toMatchObject({ ok: false });
  });

  it("aynı identity + aynı payload'u skip-same sayar", () => {
    const state = importedState();
    const bundle = syntheticBundle(); bundle.records = [bundle.records[0]!];
    expect(previewRecordImport(state, bundle).preview.duplicateSame).toBe(1);
  });

  it("aynı identity + farklı payload'u conflict yapar ve overwrite etmez", () => {
    const state = importedState();
    const bundle = syntheticBundle();
    bundle.records = [{ ...bundle.records[0]!, payloadHash: `sha256:${"f".repeat(64)}` }];
    bundle.contentHash = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const preview = previewRecordImport(state, bundle).preview;
    expect(preview.duplicateConflict).toBe(1);
    expect(() => applyRecordImport(state, bundle, true)).toThrow("annotation_import_rejected");
  });

  it("unresolved source policy'yi preview'da sayar", () => {
    const state = emptyWorkspace();
    state.workspace.manifest = { ...state.workspace.manifest, sourcePolicies: [{ ...state.workspace.manifest.sourcePolicies[0]!, useClass: "prohibited_or_unresolved", licenseStatus: "unresolved", allowedUses: ["annotation"] }] };
    expect(previewRecordImport(state, syntheticBundle()).preview.unresolvedLicense).toBe(10);
  });

  it("aktif source-policy revocation kapsamındaki kayıtları sayar", () => {
    const state = emptyWorkspace({ revocations: [revocation({ scope: "source_policy", targetId: "synthetic_internal" })] });
    expect(previewRecordImport(state, syntheticBundle()).preview.revoked).toBe(10);
  });

  it("kullanıcı onayı olmadan import mutation yapmaz", () => {
    expect(() => applyRecordImport(emptyWorkspace(), syntheticBundle(), false)).toThrow("annotation_import_confirmation_required");
  });
});

describe("D7-1A deterministic task generation", () => {
  it("priority desc, recordId, aspectId sırasını deterministik tutar", () => {
    const state = importedState();
    const generated = generateAnnotationTasks(state, { mode: "explicit", pairs: [
      { recordId: "synthetic-02", aspectId: "romance" },
      { recordId: "synthetic-01", aspectId: "fantasy" },
      { recordId: "synthetic-01", aspectId: "action" },
    ] }, { priority: 3, now: TEST_NOW });
    expect(generated.state.tasks.map((task) => `${task.recordId}:${task.aspectId}`)).toEqual(["synthetic-01:action", "synthetic-01:fantasy", "synthetic-02:romance"]);
  });

  it("aynı record/aspect/round duplicate task üretmez", () => {
    const state = taskState();
    expect(generateAnnotationTasks(state, { mode: "explicit", pairs: [{ recordId: "synthetic-01", aspectId: "romance" }] }).createdTaskIds).toEqual([]);
  });

  it("sparse explicit list ve requiredAnnotationCount=2 destekler", () => {
    const state = generateAnnotationTasks(importedState(), { mode: "explicit", pairs: [{ recordId: "synthetic-01", aspectId: "romance" }] }, { requiredAnnotationCount: 2 }).state;
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.requiredAnnotationCount).toBe(2);
  });

  it("unknown aspect ve frozen workspace mutation'ını reddeder", () => {
    expect(() => generateAnnotationTasks(importedState(), { mode: "explicit", pairs: [{ recordId: "synthetic-01", aspectId: "unknown" as "romance" }] })).toThrow("annotation_task_aspect_unknown");
    const state = importedState(); state.workspace = { ...state.workspace, status: "frozen" };
    expect(() => generateAnnotationTasks(state, { mode: "all_selected" })).toThrow("annotation_workspace_immutable");
  });
});

describe("D7-1A annotation and adjudication", () => {
  it.each(["absent", "incidental", "significant", "primary", "insufficient_evidence"] as const)("beş label'dan %s değerini korur", (label) => {
    const saved = saveAnnotation(taskState(), annotation({ label, confidence: label === "insufficient_evidence" ? "low" : "medium" }), 0, TEST_NOW);
    expect(saved.saved.annotation.label).toBe(label);
  });

  it("insufficient_evidence değerini absent'e dönüştürmez", () => {
    expect(saveAnnotation(taskState(), annotation({ label: "insufficient_evidence" }), 0).saved.annotation.label).not.toBe("absent");
  });

  it("stale revision'da 409'e çevrilebilir conflict error üretir", () => {
    expect(() => saveAnnotation(taskState(), annotation(), 1)).toThrow(AnnotationRevisionConflictError);
  });

  it("update eski annotation'ı superseded history olarak korur", () => {
    const first = saveAnnotation(taskState(), annotation(), 0, TEST_NOW).state;
    const updated = saveAnnotation(first, annotation({ annotationId: "annotation-test-002", label: "significant" }), 1, TEST_NOW).state;
    expect(updated.annotations).toHaveLength(2);
    expect(updated.annotations.filter((entry) => entry.active)).toHaveLength(1);
    expect(updated.annotations[1]).toMatchObject({ revision: 2, supersedesAnnotationId: "annotation-test-001" });
  });

  it("aynı annotator ikinci geçişini bağımsız annotation saymaz", () => {
    const first = saveAnnotation(taskState(2), annotation(), 0, TEST_NOW).state;
    const second = saveAnnotation(first, annotation({ annotationId: "annotation-test-002" }), 1, TEST_NOW).state;
    expect(second.tasks[0]?.status).toBe("in_progress");
    expect(validateAnnotationWorkspace(second).some((entry) => entry.code === "annotation_single_annotator_limitation")).toBe(true);
  });

  it("iki bağımsız aynı label agreement; confidence farkı conflict değildir", () => {
    const state = withTwoAnnotations("primary");
    expect(state.tasks[0]?.status).toBe("annotated");
  });

  it("iki bağımsız farklı label conflict üretir", () => {
    expect(withTwoAnnotations("significant").tasks[0]?.status).toBe("conflict");
  });

  it("insufficient_evidence ile diğer label her zaman conflict üretir", () => {
    expect(withTwoAnnotations("insufficient_evidence").tasks[0]?.status).toBe("conflict");
  });

  it("conflict'i adjudicate eder ve kaynak annotation'ları korur", () => {
    const state = withTwoAnnotations("significant");
    const compared = state.annotations.filter((entry) => entry.active).map((entry) => entry.annotation.annotationId);
    const record: AnnotationAdjudicationRecord = { version: 1, adjudicationId: "adjudication-test-001", taskId: state.tasks[0]!.taskId, comparedAnnotationIds: compared, finalLabel: "primary", finalConfidence: "high", adjudicatorId: "adj_internal_03", rationale: "Guideline merkezilik eşiği sentetik özet üzerinde karşılandı.", adjudicatorWasAnnotator: false, createdAt: TEST_NOW };
    const result = adjudicateTask(state, record, TEST_NOW);
    expect(result.state.tasks[0]?.status).toBe("adjudicated");
    expect(result.state.annotations.filter((entry) => entry.active)).toHaveLength(2);
  });

  it("agreement veya tek annotation için adjudication kabul etmez", () => {
    expect(() => adjudicateTask(taskState(), { version: 1, adjudicationId: "adjudication-test-001", taskId: taskState().tasks[0]!.taskId, comparedAnnotationIds: ["annotation-a", "annotation-b"], finalLabel: "primary", finalConfidence: "high", adjudicatorId: "adj_internal_03", rationale: "Yeterli sentetik rationale.", adjudicatorWasAnnotator: false, createdAt: TEST_NOW })).toThrow("annotation_adjudication_conflict_missing");
  });
});

describe("D7-1A revocation, validation and export", () => {
  it("record revocation training/evaluation/export dışlama uygular", () => {
    const state = importedState();
    const result = addRevocation(state, revocation(), TEST_NOW);
    expect(result.affectedRecordIds).toEqual(["synthetic-01"]);
    expect(createAnnotationExport(result.state, "training_candidate").includedRecordIds).not.toContain("synthetic-01");
    expect(createAnnotationExport(result.state, "evaluation_candidate").includedRecordIds).not.toContain("synthetic-01");
  });

  it("frozen workspace bile revocation kabul eder", () => {
    const state = importedState(); state.workspace = { ...state.workspace, status: "frozen" };
    expect(addRevocation(state, revocation()).state.revocations).toHaveLength(1);
  });

  it("workspace revocation export'u fail-closed yapar", () => {
    const result = addRevocation(importedState(), revocation({ scope: "workspace", targetId: "test-workspace" })).state;
    expect(result.workspace.status).toBe("revoked");
    expect(() => createAnnotationExport(result, "annotation_only")).toThrow("annotation_export_workspace_revoked");
  });

  it("replacement/reversal eski revocation'ı silmeden reversed işaretler", () => {
    const first = addRevocation(importedState(), revocation()).state;
    const second = addRevocation(first, revocation({ revocationId: "revocation-test-002", status: "reversed", replacesRevocationId: "revocation-test-001" })).state;
    expect(second.revocations).toHaveLength(2);
    expect(second.revocations[0]?.status).toBe("reversed");
  });

  it("evaluation candidate unresolved conflict'i içermez ve fail eder", () => {
    expect(() => createAnnotationExport(withTwoAnnotations("significant"), "evaluation_candidate")).toThrow("annotation_export_unresolved_conflict");
  });

  it("annotation-only export checksum, provenance, policy ve single annotator limitation taşır", () => {
    const state = saveAnnotation(taskState(), annotation(), 0).state;
    const bundle = createAnnotationExport(state, "annotation_only", TEST_NOW);
    expect(bundle.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(bundle.releaseStatus).toBe("internal_only");
    expect(bundle.records[0]?.provenance.containsPersonalData).toBe(false);
    expect(bundle.limitations.join(" ")).toContain("single-annotator");
  });

  it("gold_candidate'i tool otomatik yapmaz; manual approval ve gates ister", () => {
    expect(() => changeWorkspaceStatus(importedState(), "gold_candidate", false)).toThrow("annotation_gold_manual_approval_required");
    expect(() => changeWorkspaceStatus(importedState(), "gold_candidate", true)).toThrow("annotation_gold_requirements_unmet");
  });

  it("validation Türkçe machine-readable critical/warning/info issue üretir", () => {
    const issues = validateAnnotationWorkspace(taskState(2));
    expect(issues.some((entry) => entry.severity === "warning" && entry.code === "annotation_single_annotator_limitation")).toBe(true);
    expect(issues.some((entry) => entry.severity === "info" && entry.messageTr.includes("görev"))).toBe(true);
  });
});

function revocation(overrides: Partial<DatasetRevocationRecord> = {}): DatasetRevocationRecord {
  return {
    version: 1,
    revocationId: "revocation-test-001",
    scope: "record",
    targetId: "synthetic-01",
    reasonCode: "manual_withdrawal",
    note: "Synthetic fixture revocation.",
    effectiveAt: TEST_NOW,
    createdBy: "reviewer-01",
    createdAt: TEST_NOW,
    actions: ["exclude_from_training", "exclude_from_evaluation", "exclude_from_export"],
    status: "active",
    ...overrides,
  };
}
