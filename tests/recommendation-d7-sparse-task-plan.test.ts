import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ASPECT_REGISTRY, type AspectId } from "@/features/recommendations/domain/aspect-registry";
import type { AnnotationToolReadModel } from "@/features/recommendations/evaluation/annotation-tool/domain/types";
import { decodeTaskGenerationSelection, MAX_EXPLICIT_TASK_PAIRS } from "@/features/recommendations/evaluation/annotation-tool/server/task-selection";
import { applyRecordImport, generateAnnotationTasks } from "@/features/recommendations/evaluation/annotation-tool/server/workflows";
import {
  MAX_SPARSE_TASK_PAIRS,
  previewAllSelectedTasks,
  previewSparseTaskPlan,
  previewSparseTaskPlanJson,
  type SparseTaskPlan,
} from "@/features/recommendations/evaluation/annotation-tool/ui/task-generation-plan";
import { emptyWorkspace, syntheticBundle } from "./recommendation-d7-annotation-test-helpers";

const PLAN_ASPECTS = [
  "political_intrigue",
  "dark",
  "character_driven",
  "power_progression",
  "fantasy",
  "romance",
  "love_triangle",
  "fanservice",
] as const satisfies readonly AspectId[];

function readModel(): AnnotationToolReadModel {
  const state = applyRecordImport(emptyWorkspace(), syntheticBundle(), true).state;
  return {
    ...state,
    validation: [],
    aspects: state.workspace.selectedAspectIds.map((id) => ({
      id,
      labelTr: ASPECT_REGISTRY[id].labelTr,
      descriptionTr: ASPECT_REGISTRY[id].descriptionTr,
      group: ASPECT_REGISTRY[id].group,
    })),
  };
}

function validPlan(): SparseTaskPlan {
  const aspectRows: readonly (readonly AspectId[])[] = [
    ["political_intrigue", "dark", "character_driven"],
    ["political_intrigue", "character_driven"],
    ["power_progression", "fantasy"],
    ["fantasy", "character_driven", "dark"],
    ["romance", "love_triangle", "character_driven"],
    ["romance", "love_triangle"],
    ["fanservice", "fantasy", "romance"],
    ["character_driven", "fantasy", "dark"],
    ["dark", "character_driven", "romance"],
    ["power_progression", "fantasy", "dark"],
  ];
  return {
    version: 1,
    workspaceId: "test-workspace",
    pairs: aspectRows.flatMap((aspects, index) => aspects.map((aspectId) => ({
      recordId: `synthetic-${String(index + 1).padStart(2, "0")}`,
      aspectId,
    }))),
  };
}

describe("D7-1B sparse task plan preview", () => {
  it("valid planı 27 pair, 10 record ve beklenen aspect ID'leriyle kabul eder", () => {
    const preview = previewSparseTaskPlan(validPlan(), readModel());
    expect(preview).toMatchObject({
      totalPairs: 27,
      uniqueRecordCount: 10,
      uniqueAspectCount: PLAN_ASPECTS.length,
      duplicatePairCount: 0,
      invalidRecordCount: 0,
      invalidAspectCount: 0,
      existingTaskCount: 0,
      creatableTaskCount: 27,
      issueCodes: [],
    });
    expect(new Set(preview.plan?.pairs.map((pair) => pair.aspectId))).toEqual(new Set(PLAN_ASPECTS));
  });

  it("wrong workspace'i fail-closed reddeder", () => {
    expect(previewSparseTaskPlan({ ...validPlan(), workspaceId: "other-workspace" }, readModel()).issueCodes).toContain("workspace_mismatch");
  });

  it("version 1 dışını reddeder", () => {
    expect(previewSparseTaskPlan({ ...validPlan(), version: 2 }, readModel()).issueCodes).toContain("invalid_version");
  });

  it("unknown record ve unknown aspect'i ayrı raporlar", () => {
    const plan = validPlan();
    expect(previewSparseTaskPlan({ ...plan, pairs: [{ recordId: "missing-record", aspectId: "romance" }] }, readModel()).issueCodes).toContain("unknown_record");
    expect(previewSparseTaskPlan({ ...plan, pairs: [{ recordId: "synthetic-01", aspectId: "unknown" }] }, readModel()).issueCodes).toContain("unknown_aspect");
  });

  it("duplicate pair'i reddeder", () => {
    const plan = validPlan();
    expect(previewSparseTaskPlan({ ...plan, pairs: [plan.pairs[0], plan.pairs[0]] }, readModel())).toMatchObject({ duplicatePairCount: 1, issueCodes: expect.arrayContaining(["duplicate_pair"]) });
  });

  it("1000 pair üstünü reddeder", () => {
    const pair = validPlan().pairs[0]!;
    const preview = previewSparseTaskPlan({ ...validPlan(), pairs: Array.from({ length: MAX_SPARSE_TASK_PAIRS + 1 }, () => pair) }, readModel());
    expect(preview.issueCodes).toContain("too_many_pairs");
    expect(preview.plan).toBeUndefined();
  });

  it("root veya pair unknown JSON field'ını fail-closed reddeder", () => {
    expect(previewSparseTaskPlan({ ...validPlan(), unexpected: true }, readModel()).issueCodes).toContain("unknown_field");
    expect(previewSparseTaskPlan({ ...validPlan(), pairs: [{ ...validPlan().pairs[0], label: "primary" }] }, readModel()).issueCodes).toContain("unknown_field");
  });

  it("malformed JSON'u kontrollü preview issue'suna dönüştürür", () => {
    expect(previewSparseTaskPlanJson("{broken", readModel())).toMatchObject({ issueCodes: ["malformed_json"], creatableTaskCount: 0 });
  });

  it("preview workspace state'inde mutation yapmaz", () => {
    const model = readModel();
    const before = structuredClone(model);
    previewSparseTaskPlan(validPlan(), model);
    expect(model).toEqual(before);
  });
});

describe("D7-1B task generation compatibility", () => {
  it("server explicit selection exact fields, limit ve duplicate kurallarını source of truth olarak uygular", () => {
    const pairs = validPlan().pairs;
    expect(decodeTaskGenerationSelection({ mode: "explicit", pairs })).toEqual({ mode: "explicit", pairs });
    expect(decodeTaskGenerationSelection({ mode: "explicit", pairs, label: "primary" })).toBeNull();
    expect(decodeTaskGenerationSelection({ mode: "explicit", pairs: [pairs[0], pairs[0]] })).toBeNull();
    expect(decodeTaskGenerationSelection({ mode: "explicit", pairs: Array.from({ length: MAX_EXPLICIT_TASK_PAIRS + 1 }, () => pairs[0]) })).toBeNull();
  });

  it("explicit generation yalnız 27 task üretir", () => {
    const model = readModel();
    const preview = previewSparseTaskPlan(validPlan(), model);
    const result = generateAnnotationTasks(model, { mode: "explicit", pairs: preview.plan!.pairs });
    expect(result.createdTaskIds).toHaveLength(27);
    expect(result.state.tasks).toHaveLength(27);
  });

  it("all_selected davranışını 10 × 12 = 120 olarak korur ve 50+ confirmation bildirir", () => {
    const model = readModel();
    expect(previewAllSelectedTasks(model)).toEqual({
      recordCount: 10,
      aspectCount: 12,
      totalPairCount: 120,
      existingTaskCount: 0,
      creatableTaskCount: 120,
      requiresConfirmation: true,
    });
    expect(generateAnnotationTasks(model, { mode: "all_selected" }).createdTaskIds).toHaveLength(120);
  });

  it("existing explicit task'i yeniden üretmez ve preview'da oluşturulabilir sayıdan düşer", () => {
    const model = readModel();
    const first = generateAnnotationTasks(model, { mode: "explicit", pairs: [validPlan().pairs[0]!] }).state;
    const preview = previewSparseTaskPlan(validPlan(), { ...model, tasks: first.tasks });
    expect(preview).toMatchObject({ existingTaskCount: 1, creatableTaskCount: 26 });
    expect(generateAnnotationTasks(first, { mode: "explicit", pairs: validPlan().pairs }).createdTaskIds).toHaveLength(26);
  });
});
