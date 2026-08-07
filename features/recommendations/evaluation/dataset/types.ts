import type { AspectId } from "../../domain/aspect-registry";
import type {
  RecommendationMediaType,
  RecommendationProvider,
} from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";

export const DATASET_SCHEMA_VERSION = 1 as const;
export const ANNOTATION_SCHEMA_VERSION = 1 as const;
export const VERIFIER_INPUT_SCHEMA_VERSION = 1 as const;
export const VERIFIER_OUTPUT_SCHEMA_VERSION = 1 as const;

export type DatasetUseClass =
  | "runtime_only"
  | "evaluation_snapshot_allowed"
  | "annotation_reference_only"
  | "training_allowed"
  | "training_requires_permission"
  | "prohibited_or_unresolved";

export type DatasetAllowedUse =
  | "runtime_reference"
  | "annotation"
  | "evaluation"
  | "training"
  | "internal_research"
  | "publication";

export type DatasetSourceType =
  | "provider_api"
  | "synthetic"
  | "human_rewritten"
  | "open_licensed"
  | "internal_fixture"
  | "model_or_dataset_registry";

export type DatasetLicenseStatus = "confirmed" | "conditional" | "unresolved";
export type DatasetRedistribution =
  | "prohibited"
  | "internal_only"
  | "allowed_with_attribution"
  | "allowed";
export type DatasetRetentionMode = "ephemeral" | "bounded" | "indefinite";
export type DatasetReleaseStatus = "draft" | "internal_only" | "publishable";
export type DatasetSplit = "pilot" | "train" | "validation" | "test" | "unassigned";
export type DatasetContentOrigin =
  | "synthetic"
  | "human_rewritten"
  | "open_licensed"
  | "provider_runtime_reference";

export interface DatasetAttributionPolicy {
  required: boolean;
  text?: string;
  url?: string;
}

export interface DatasetRetentionPolicy {
  mode: DatasetRetentionMode;
  maxDays?: number;
  deleteOnRevocation: boolean;
}

export interface DatasetSourcePolicy {
  sourceId: string;
  sourceType: DatasetSourceType;
  useClass: DatasetUseClass;
  allowedUses: readonly DatasetAllowedUse[];
  licenseStatus: DatasetLicenseStatus;
  attribution: DatasetAttributionPolicy;
  retention: DatasetRetentionPolicy;
  redistribution: DatasetRedistribution;
  notes: readonly string[];
}

export interface DatasetSplitPolicy {
  strategy: "franchise_group_aware";
  trainPercent: number;
  validationPercent: number;
  testPercent: number;
  groupKeys: readonly ("leakageGroupId" | "exactProviderIdentity")[];
  holdout: "none" | "time" | "source";
  goldTestFrozen: boolean;
}

export interface DatasetManifest {
  version: typeof DATASET_SCHEMA_VERSION;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  purpose: string;
  schemaVersion: typeof DATASET_SCHEMA_VERSION;
  aspectIds: readonly AspectId[];
  mediaTypes: readonly RecommendationMediaType[];
  recordCount: number;
  sourcePolicies: readonly DatasetSourcePolicy[];
  splitPolicy: DatasetSplitPolicy;
  annotationPolicyVersion: string;
  licenseAuditVersion: string;
  contentHash: string;
  releaseStatus: DatasetReleaseStatus;
}

export type DatasetReviewStatus = "pending" | "approved" | "rejected";

export interface DatasetRecordProvenance {
  recordId: string;
  sourceId: string;
  sourceType: DatasetSourceType;
  sourceReference: string;
  exactProviderIdentity?: RecommendationCandidateIdentity;
  capturedAt: string;
  contentOrigin: DatasetContentOrigin;
  allowedUses: readonly DatasetAllowedUse[];
  attribution: DatasetAttributionPolicy;
  licenseEvidence: readonly string[];
  retainedFields: readonly string[];
  excludedFields: readonly string[];
  transformationNotes: readonly string[];
  containsPersonalData: false;
  reviewer: string;
  reviewStatus: DatasetReviewStatus;
}

export interface CandidateTextTag {
  name: string;
  rank?: number;
}

export interface CandidateTextBundle {
  version: typeof VERIFIER_INPUT_SCHEMA_VERSION;
  title?: string;
  shortSummary?: string;
  summaryOrigin: "none" | "synthetic" | "human_rewritten" | "open_licensed";
  genres: readonly string[];
  tags: readonly CandidateTextTag[];
  keywords: readonly string[];
  format?: string;
  status?: string;
  language?: string;
  country?: string;
  providerCoverage: Readonly<Partial<Record<RecommendationProvider, "available" | "partial" | "unavailable">>>;
}

export interface DatasetRecord {
  recordId: string;
  split: DatasetSplit;
  leakageGroupId: string;
  candidate: CandidateTextBundle;
}

export type AspectAnnotationLabel =
  | "absent"
  | "incidental"
  | "significant"
  | "primary"
  | "insufficient_evidence";
export type AnnotationConfidence = "low" | "medium" | "high";
export type AnnotationAdjudicationStatus = "not_required" | "pending" | "resolved";
export type AnnotationLabelSource = "human_annotation" | "synthetic_contract";
export type AnnotationAssistanceMode =
  | "independent_human"
  | "assisted_human"
  | "unknown_legacy";

export interface AnnotationEvidenceSpan {
  field: "shortSummary";
  start: number;
  end: number;
}

export interface AspectAnnotationRecord {
  version: typeof ANNOTATION_SCHEMA_VERSION;
  annotationId: string;
  recordId: string;
  aspectId: AspectId;
  label: AspectAnnotationLabel;
  confidence: AnnotationConfidence;
  evidenceSpans: readonly AnnotationEvidenceSpan[];
  evidenceNotes: readonly string[];
  contradictionNotes: readonly string[];
  annotatorId: string;
  annotationRound: number;
  createdAt: string;
  guidelineVersion: string;
  labelSource: AnnotationLabelSource;
  assistanceMode: AnnotationAssistanceMode;
  adjudicationStatus: AnnotationAdjudicationStatus;
  finalLabel?: AspectAnnotationLabel;
}

export interface DatasetPackage {
  manifest: DatasetManifest;
  records: readonly DatasetRecord[];
  provenance: readonly DatasetRecordProvenance[];
  annotations: readonly AspectAnnotationRecord[];
}

export type AspectVerifierLevel = "absent" | "incidental" | "significant" | "primary";

export interface AspectVerifierOutput {
  version: typeof VERIFIER_OUTPUT_SCHEMA_VERSION;
  aspectId: AspectId;
  probabilities: Readonly<Record<AspectVerifierLevel, number>>;
  predictedLevel: AspectVerifierLevel | null;
  calibratedConfidence: number;
  abstained: boolean;
  abstentionReason?: string;
  modelVersion: string;
  inputSchemaVersion: typeof VERIFIER_INPUT_SCHEMA_VERSION;
  warnings: readonly string[];
}

export const DATASET_USE_CLASSES: readonly DatasetUseClass[] = [
  "runtime_only",
  "evaluation_snapshot_allowed",
  "annotation_reference_only",
  "training_allowed",
  "training_requires_permission",
  "prohibited_or_unresolved",
];

export const DATASET_ALLOWED_USES: readonly DatasetAllowedUse[] = [
  "runtime_reference",
  "annotation",
  "evaluation",
  "training",
  "internal_research",
  "publication",
];

export const DATASET_SOURCE_TYPES: readonly DatasetSourceType[] = [
  "provider_api",
  "synthetic",
  "human_rewritten",
  "open_licensed",
  "internal_fixture",
  "model_or_dataset_registry",
];

export const DATASET_SPLITS: readonly DatasetSplit[] = ["pilot", "train", "validation", "test", "unassigned"];
export const ANNOTATION_LABELS: readonly AspectAnnotationLabel[] = [
  "absent",
  "incidental",
  "significant",
  "primary",
  "insufficient_evidence",
];
export const ANNOTATION_ASSISTANCE_MODES: readonly AnnotationAssistanceMode[] = [
  "independent_human",
  "assisted_human",
  "unknown_legacy",
];
export const ASPECT_VERIFIER_LEVELS: readonly AspectVerifierLevel[] = [
  "absent",
  "incidental",
  "significant",
  "primary",
];
