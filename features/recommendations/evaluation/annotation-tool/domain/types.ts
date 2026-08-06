import type { AspectId } from "../../../domain/aspect-registry";
import type {
  AnnotationConfidence,
  AspectAnnotationLabel,
  AspectAnnotationRecord,
  DatasetManifest,
  DatasetRecord,
  DatasetRecordProvenance,
  DatasetSourcePolicy,
} from "../../dataset";

export const ANNOTATION_TOOL_SCHEMA_VERSION = 1 as const;

export type AnnotationWorkspaceStatus =
  | "draft"
  | "internal_pilot"
  | "annotation_in_progress"
  | "ready_for_adjudication"
  | "gold_candidate"
  | "frozen"
  | "revoked";

export type AnnotationTaskStatus =
  | "pending"
  | "in_progress"
  | "annotated"
  | "conflict"
  | "adjudicated"
  | "excluded";

export interface AnnotationWorkspaceMetadata {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  workspaceId: string;
  manifest: DatasetManifest;
  status: AnnotationWorkspaceStatus;
  selectedAspectIds: readonly AspectId[];
  guidelineVersion: string;
  sourcePolicyVersions: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export type AnnotationRecordIdentity =
  | { kind: "synthetic"; syntheticId: string }
  | { kind: "provider"; canonicalKey: string };

export interface AnnotationWorkspaceRecord {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  record: DatasetRecord;
  provenance: DatasetRecordProvenance;
  identity: AnnotationRecordIdentity;
  titleSnapshot: string;
  personalData: false;
  payloadHash: string;
  importedAt: string;
}

export interface AnnotationTask {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  taskId: string;
  recordId: string;
  aspectId: AspectId;
  annotationRound: number;
  status: AnnotationTaskStatus;
  assignedAnnotators: readonly string[];
  requiredAnnotationCount: 1 | 2;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAspectAnnotation {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  annotation: AspectAnnotationRecord;
  revision: number;
  active: boolean;
  supersedesAnnotationId?: string;
  updatedAt: string;
}

export interface AnnotationAdjudicationRecord {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  adjudicationId: string;
  taskId: string;
  comparedAnnotationIds: readonly string[];
  finalLabel: AspectAnnotationLabel;
  finalConfidence: AnnotationConfidence;
  adjudicatorId: string;
  rationale: string;
  adjudicatorWasAnnotator: boolean;
  createdAt: string;
}

export type DatasetRevocationScope =
  | "source_policy"
  | "source_reference"
  | "record"
  | "workspace";

export type DatasetRevocationReason =
  | "license_changed"
  | "permission_revoked"
  | "provenance_invalid"
  | "personal_data_detected"
  | "duplicate_or_contaminated"
  | "manual_withdrawal"
  | "other";

export type DatasetRevocationAction =
  | "exclude_from_training"
  | "exclude_from_evaluation"
  | "exclude_from_export"
  | "mark_internal_only";

export interface DatasetRevocationRecord {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  revocationId: string;
  scope: DatasetRevocationScope;
  targetId: string;
  reasonCode: DatasetRevocationReason;
  note: string;
  effectiveAt: string;
  createdBy: string;
  createdAt: string;
  actions: readonly DatasetRevocationAction[];
  status: "active" | "reversed";
  replacesRevocationId?: string;
}

export interface AnnotationAuditEvent {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  eventId: string;
  workspaceId: string;
  eventType:
    | "workspace_created"
    | "records_imported"
    | "annotation_saved"
    | "annotation_updated"
    | "adjudication_saved"
    | "revocation_saved"
    | "export_generated"
    | "backup_created"
    | "validation_run";
  actorId: string;
  targetIds: readonly string[];
  occurredAt: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface AnnotationWorkspaceState {
  workspace: AnnotationWorkspaceMetadata;
  records: readonly AnnotationWorkspaceRecord[];
  tasks: readonly AnnotationTask[];
  annotations: readonly StoredAspectAnnotation[];
  adjudications: readonly AnnotationAdjudicationRecord[];
  revocations: readonly DatasetRevocationRecord[];
}

export interface AnnotationRecordImportBundle {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  manifestReference: string;
  records: readonly AnnotationWorkspaceRecord[];
  contentHash: string;
  createdAt: string;
  sourcePolicyVersion: string;
}

export interface AnnotationImportPreview {
  total: number;
  valid: number;
  invalid: number;
  duplicateSame: number;
  duplicateConflict: number;
  unresolvedLicense: number;
  revoked: number;
  taskRecordCount: number;
  issues: readonly AnnotationValidationIssue[];
}

export type AnnotationValidationSeverity = "critical" | "warning" | "info";

export interface AnnotationValidationIssue {
  code: string;
  severity: AnnotationValidationSeverity;
  path: string;
  messageTr: string;
  relatedIds: readonly string[];
}

export type AnnotationExportPurpose =
  | "workspace_backup"
  | "annotation_only"
  | "adjudicated_labels"
  | "training_candidate"
  | "evaluation_candidate";

export interface AnnotationExportBundle {
  version: typeof ANNOTATION_TOOL_SCHEMA_VERSION;
  exportPurpose: AnnotationExportPurpose;
  releaseStatus: "internal_only" | "publishable";
  manifest: DatasetManifest;
  includedRecordIds: readonly string[];
  records: readonly AnnotationWorkspaceRecord[];
  annotations: readonly StoredAspectAnnotation[];
  adjudications: readonly AnnotationAdjudicationRecord[];
  sourcePolicies: readonly DatasetSourcePolicy[];
  revocationsSummary: readonly Pick<DatasetRevocationRecord, "revocationId" | "scope" | "targetId" | "actions" | "status">[];
  limitations: readonly string[];
  contentHash: string;
  generatedAt: string;
}

export interface AnnotationToolReadModel {
  workspace: AnnotationWorkspaceMetadata;
  records: readonly AnnotationWorkspaceRecord[];
  tasks: readonly AnnotationTask[];
  annotations: readonly StoredAspectAnnotation[];
  adjudications: readonly AnnotationAdjudicationRecord[];
  revocations: readonly DatasetRevocationRecord[];
  validation: readonly AnnotationValidationIssue[];
  aspects: readonly { id: AspectId; labelTr: string; descriptionTr: string; group: string }[];
}
