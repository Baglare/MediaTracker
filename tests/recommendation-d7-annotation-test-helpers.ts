import fixture from "./fixtures/recommendations-v2/annotation-tool/synthetic-import-bundle.json";

import { DEFAULT_MVP_ASPECT_IDS } from "@/features/recommendations/evaluation/annotation-tool/domain/constants";
import type {
  AnnotationRecordImportBundle,
  AnnotationWorkspaceState,
} from "@/features/recommendations/evaluation/annotation-tool/domain/types";
import type { AspectAnnotationRecord, DatasetManifest } from "@/features/recommendations/evaluation/dataset";

export const TEST_NOW = "2026-08-06T00:00:00.000Z";

export function testManifest(overrides: Partial<DatasetManifest> = {}): DatasetManifest {
  return {
    version: 1,
    datasetId: "d7_1a_test_workspace",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    purpose: "D7-1A synthetic contract test workspace.",
    schemaVersion: 1,
    aspectIds: DEFAULT_MVP_ASPECT_IDS,
    mediaTypes: ["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"],
    recordCount: 0,
    sourcePolicies: [{
      sourceId: "synthetic_internal",
      sourceType: "synthetic",
      useClass: "training_allowed",
      allowedUses: ["annotation", "evaluation", "training", "internal_research"],
      licenseStatus: "confirmed",
      attribution: { required: false },
      retention: { mode: "indefinite", deleteOnRevocation: true },
      redistribution: "internal_only",
      notes: ["Synthetic test policy."],
    }],
    splitPolicy: { strategy: "franchise_group_aware", trainPercent: 70, validationPercent: 15, testPercent: 15, groupKeys: ["leakageGroupId", "exactProviderIdentity"], holdout: "none", goldTestFrozen: true },
    annotationPolicyVersion: "d7_annotation_v1",
    licenseAuditVersion: "d7_license_v1",
    contentHash: `sha256:${"0".repeat(64)}`,
    releaseStatus: "draft",
    ...overrides,
  };
}

export function syntheticBundle(): AnnotationRecordImportBundle {
  return structuredClone(fixture) as AnnotationRecordImportBundle;
}

export function emptyWorkspace(overrides: Partial<AnnotationWorkspaceState> = {}): AnnotationWorkspaceState {
  return {
    workspace: {
      version: 1,
      workspaceId: "test-workspace",
      manifest: testManifest(),
      status: "draft",
      selectedAspectIds: DEFAULT_MVP_ASPECT_IDS,
      guidelineVersion: "d7_annotation_v1",
      sourcePolicyVersions: ["d7-synthetic-v1"],
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
    records: [], tasks: [], annotations: [], adjudications: [], revocations: [],
    ...overrides,
  };
}

export function annotation(overrides: Partial<AspectAnnotationRecord> = {}): AspectAnnotationRecord {
  return {
    version: 1,
    annotationId: "annotation-test-001",
    recordId: "synthetic-01",
    aspectId: "romance",
    label: "primary",
    confidence: "high",
    evidenceSpans: [],
    evidenceNotes: ["Tamamen sentetik kısa kanıt notu."],
    contradictionNotes: [],
    annotatorId: "ann_internal_01",
    annotationRound: 1,
    createdAt: TEST_NOW,
    guidelineVersion: "d7_annotation_v1",
    labelSource: "human_annotation",
    adjudicationStatus: "not_required",
    ...overrides,
  };
}
