import "server-only";

import { randomUUID } from "node:crypto";

import { ASPECT_REGISTRY, isAspectId, type AspectId } from "../../../domain/aspect-registry";
import { decodeAspectAnnotationRecord, decodeDatasetManifest } from "../../dataset";
import { ANNOTATION_TOOL_LIMITS, DEFAULT_MVP_ASPECT_IDS } from "../domain/constants";
import { isValidAnnotatorId, isValidWorkspaceId } from "../domain/ids";
import type {
  AnnotationAdjudicationRecord,
  AnnotationAuditEvent,
  AnnotationExportPurpose,
  AnnotationToolReadModel,
  AnnotationWorkspaceState,
  DatasetRevocationRecord,
} from "../domain/types";
import { AnnotationWorkspaceRepository } from "../storage/repository";
import {
  AnnotationRevisionConflictError,
  AnnotationWorkflowError,
  addRevocation,
  adjudicateTask,
  applyRecordImport,
  changeWorkspaceStatus,
  createAnnotationExport,
  generateAnnotationTasks,
  newAnnotationId,
  previewRecordImport,
  saveAnnotation,
  validateAnnotationWorkspace,
} from "./workflows";
import { decodeTaskGenerationSelection } from "./task-selection";

export class AnnotationRequestError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 413, code: string) {
    super(code);
  }
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : undefined;
}

function actor(value: unknown): string {
  if (!isValidAnnotatorId(value)) throw new AnnotationRequestError(400, "invalid_actor_id");
  return value;
}

function workspaceId(value: unknown): string {
  if (!isValidWorkspaceId(value)) throw new AnnotationRequestError(400, "invalid_workspace_id");
  return value;
}

function event(input: Omit<AnnotationAuditEvent, "version" | "eventId" | "occurredAt">, now = new Date().toISOString()): AnnotationAuditEvent {
  return { version: 1, eventId: `evt-${randomUUID()}`, occurredAt: now, ...input };
}

export class AnnotationToolService {
  constructor(private readonly repository = new AnnotationWorkspaceRepository()) {}

  async list(): Promise<{ workspaceIds: string[] }> {
    return { workspaceIds: await this.repository.listWorkspaceIds() };
  }

  async read(id: string): Promise<AnnotationToolReadModel> {
    const state = await this.repository.readWorkspace(workspaceId(id));
    return this.readModel(state);
  }

  async create(input: Record<string, unknown>): Promise<AnnotationToolReadModel> {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.actorId);
    const manifest = input.manifest ?? defaultWorkspaceManifest(id);
    const decodedManifest = decodeDatasetManifest(manifest);
    if (!decodedManifest.ok) throw new AnnotationRequestError(400, decodedManifest.issues[0]?.code ?? "invalid_manifest");
    const aspects = Array.isArray(input.selectedAspectIds) ? input.selectedAspectIds : DEFAULT_MVP_ASPECT_IDS;
    if (aspects.length === 0 || aspects.some((entry) => !isAspectId(entry)) || new Set(aspects).size !== aspects.length) {
      throw new AnnotationRequestError(400, "invalid_aspect_ids");
    }
    const state = await this.repository.createWorkspace({
      workspaceId: id,
      manifest: decodedManifest.value,
      actorId,
      selectedAspectIds: aspects as AspectId[],
    });
    return this.readModel(state);
  }

  async previewImport(input: Record<string, unknown>) {
    const state = await this.repository.readWorkspace(workspaceId(input.workspaceId));
    return previewRecordImport(state, input.bundle).preview;
  }

  async applyImport(input: Record<string, unknown>): Promise<AnnotationToolReadModel> {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.actorId);
    await this.repository.mutateWorkspace({
      workspaceId: id,
      actorId,
      event: { eventType: "records_imported", targetIds: [id], metadata: { confirmed: true } },
      mutate: (state) => {
        const result = applyRecordImport(state, input.bundle, input.confirmed === true);
        return { state: result.state, result: result.preview };
      },
    });
    return this.read(id);
  }

  async generateTasks(input: Record<string, unknown>): Promise<AnnotationToolReadModel> {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.actorId);
    const selection = decodeTaskGenerationSelection(input.selection);
    if (!selection) throw new AnnotationRequestError(400, "invalid_task_selection");
    await this.repository.mutateWorkspace({
      workspaceId: id,
      actorId,
      event: { eventType: "validation_run", targetIds: [id], metadata: { operation: "task_generation" } },
      mutate: (state) => {
        const generated = generateAnnotationTasks(state, selection, {
          requiredAnnotationCount: input.requiredAnnotationCount === 2 ? 2 : 1,
          priority: Number.isInteger(input.priority) ? input.priority as number : 0,
        });
        return { state: generated.state, result: generated.createdTaskIds };
      },
    });
    return this.read(id);
  }

  async saveAnnotation(input: Record<string, unknown>): Promise<AnnotationToolReadModel> {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.annotatorId);
    const recordId = text(input.recordId, 120);
    const aspectId = input.aspectId;
    if (!recordId || !isAspectId(aspectId)) throw new AnnotationRequestError(400, "invalid_annotation_target");
    const now = new Date().toISOString();
    const rawAnnotation = {
      version: 1,
      annotationId: newAnnotationId(),
      recordId,
      aspectId,
      label: input.label,
      confidence: input.confidence,
      evidenceSpans: [],
      evidenceNotes: input.evidenceNote ? [input.evidenceNote] : [],
      contradictionNotes: input.contradictionNote ? [input.contradictionNote] : [],
      annotatorId: actorId,
      annotationRound: Number.isInteger(input.annotationRound) ? input.annotationRound : 1,
      createdAt: now,
      guidelineVersion: text(input.guidelineVersion, 120) ?? "d7_annotation_v1",
      labelSource: "human_annotation",
      adjudicationStatus: "not_required",
    };
    const decoded = decodeAspectAnnotationRecord(rawAnnotation);
    if (!decoded.ok) throw new AnnotationRequestError(400, decoded.issues[0]?.code ?? "invalid_annotation");
    try {
      await this.repository.mutateWorkspace({
        workspaceId: id,
        actorId,
        now,
        event: { eventType: Number(input.expectedRevision) > 0 ? "annotation_updated" : "annotation_saved", targetIds: [recordId, aspectId], metadata: { revision: Number(input.expectedRevision) + 1 } },
        mutate: (state) => {
          const saved = saveAnnotation(state, decoded.value, Number(input.expectedRevision), now);
          return { state: saved.state, result: saved.saved };
        },
      });
    } catch (error) {
      if (error instanceof AnnotationRevisionConflictError) throw new AnnotationRequestError(409, error.message);
      throw error;
    }
    return this.read(id);
  }

  async adjudicate(input: Record<string, unknown>): Promise<AnnotationToolReadModel> {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.adjudicatorId);
    const compared = Array.isArray(input.comparedAnnotationIds) ? input.comparedAnnotationIds : [];
    const taskId = text(input.taskId, 120);
    if (!taskId) throw new AnnotationRequestError(400, "invalid_task_id");
    const now = new Date().toISOString();
    const adjudication: AnnotationAdjudicationRecord = {
      version: 1,
      adjudicationId: `adjudication-${randomUUID()}`,
      taskId,
      comparedAnnotationIds: compared as string[],
      finalLabel: input.finalLabel as AnnotationAdjudicationRecord["finalLabel"],
      finalConfidence: input.finalConfidence as AnnotationAdjudicationRecord["finalConfidence"],
      adjudicatorId: actorId,
      rationale: text(input.rationale, ANNOTATION_TOOL_LIMITS.adjudicationRationale) ?? "",
      adjudicatorWasAnnotator: input.adjudicatorWasAnnotator === true,
      createdAt: now,
    };
    await this.repository.mutateWorkspace({
      workspaceId: id,
      actorId,
      now,
      event: { eventType: "adjudication_saved", targetIds: [taskId], metadata: { comparedCount: compared.length } },
      mutate: (state) => {
        const saved = adjudicateTask(state, adjudication, now);
        return { state: saved.state, result: saved.saved };
      },
    });
    return this.read(id);
  }

  async revoke(input: Record<string, unknown>): Promise<AnnotationToolReadModel> {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.createdBy);
    const now = new Date().toISOString();
    const revocation: DatasetRevocationRecord = {
      version: 1,
      revocationId: `revocation-${randomUUID()}`,
      scope: input.scope as DatasetRevocationRecord["scope"],
      targetId: text(input.targetId, 120) ?? "",
      reasonCode: input.reasonCode as DatasetRevocationRecord["reasonCode"],
      note: text(input.note, ANNOTATION_TOOL_LIMITS.revocationNote) ?? "",
      effectiveAt: now,
      createdBy: actorId,
      createdAt: now,
      actions: Array.isArray(input.actions) ? input.actions as DatasetRevocationRecord["actions"] : [],
      status: input.status === "reversed" ? "reversed" : "active",
      ...(text(input.replacesRevocationId, 120) ? { replacesRevocationId: text(input.replacesRevocationId, 120) } : {}),
    };
    await this.repository.mutateWorkspace({
      workspaceId: id,
      actorId,
      now,
      event: { eventType: "revocation_saved", targetIds: [revocation.targetId], metadata: { scope: revocation.scope } },
      mutate: (state) => {
        const result = addRevocation(state, revocation, now);
        return { state: result.state, result: result.affectedRecordIds };
      },
    });
    return this.read(id);
  }

  async validate(input: Record<string, unknown>) {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.actorId);
    const state = await this.repository.readWorkspace(id);
    const validation = validateAnnotationWorkspace(state);
    await this.repository.appendAuditEvent(event({ workspaceId: id, actorId, eventType: "validation_run", targetIds: [id], metadata: { issueCount: validation.length } }));
    return validation;
  }

  async export(input: Record<string, unknown>) {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.actorId);
    const purpose = input.purpose as AnnotationExportPurpose;
    if (!["workspace_backup", "annotation_only", "adjudicated_labels", "training_candidate", "evaluation_candidate"].includes(purpose)) {
      throw new AnnotationRequestError(400, "invalid_export_purpose");
    }
    const state = await this.repository.readWorkspace(id);
    const bundle = createAnnotationExport(state, purpose);
    const bytes = Buffer.byteLength(JSON.stringify(bundle), "utf8");
    if (bytes > ANNOTATION_TOOL_LIMITS.exportBundleBytes) throw new AnnotationRequestError(413, "export_too_large");
    await this.repository.appendAuditEvent(event({ workspaceId: id, actorId, eventType: "export_generated", targetIds: bundle.includedRecordIds, metadata: { purpose, recordCount: bundle.includedRecordIds.length } }));
    return bundle;
  }

  async backup(input: Record<string, unknown>) {
    const id = workspaceId(input.workspaceId);
    await this.repository.createBackup(id, actor(input.actorId));
    return { ok: true };
  }

  async changeStatus(input: Record<string, unknown>): Promise<AnnotationToolReadModel> {
    const id = workspaceId(input.workspaceId);
    const actorId = actor(input.actorId);
    const allowed = ["draft", "internal_pilot", "annotation_in_progress", "ready_for_adjudication", "gold_candidate", "frozen", "revoked"];
    if (!allowed.includes(input.status as string)) throw new AnnotationRequestError(400, "invalid_workspace_status");
    await this.repository.mutateWorkspace({
      workspaceId: id,
      actorId,
      event: { eventType: "validation_run", targetIds: [id], metadata: { operation: "status_change", status: input.status as string } },
      mutate: (state) => ({ state: changeWorkspaceStatus(state, input.status as AnnotationWorkspaceState["workspace"]["status"], input.manuallyApproved === true), result: null }),
    });
    return this.read(id);
  }

  private readModel(state: AnnotationWorkspaceState): AnnotationToolReadModel {
    return {
      ...state,
      validation: validateAnnotationWorkspace(state),
      aspects: state.workspace.selectedAspectIds.map((id) => ({
        id,
        labelTr: ASPECT_REGISTRY[id].labelTr,
        descriptionTr: ASPECT_REGISTRY[id].descriptionTr,
        group: ASPECT_REGISTRY[id].group,
      })),
    };
  }
}

function defaultWorkspaceManifest(workspaceId: string) {
  const now = new Date().toISOString();
  return {
    version: 1,
    datasetId: `annotation_${workspaceId}`,
    createdAt: now,
    updatedAt: now,
    purpose: "D7-1A local annotation workspace; gerçek gold dataset değildir.",
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
      notes: ["Yalnız bağımsız sentetik kısa içerik; provider veya kullanıcı verisi değildir."],
    }],
    splitPolicy: {
      strategy: "franchise_group_aware",
      trainPercent: 70,
      validationPercent: 15,
      testPercent: 15,
      groupKeys: ["leakageGroupId", "exactProviderIdentity"],
      holdout: "none",
      goldTestFrozen: true,
    },
    annotationPolicyVersion: "d7_annotation_v1",
    licenseAuditVersion: "d7_license_v1",
    contentHash: `sha256:${"0".repeat(64)}`,
    releaseStatus: "draft",
  };
}

export function mapAnnotationServiceError(error: unknown): AnnotationRequestError {
  if (error instanceof AnnotationRequestError) return error;
  if (error instanceof AnnotationRevisionConflictError) return new AnnotationRequestError(409, error.message);
  if (error instanceof AnnotationWorkflowError) return new AnnotationRequestError(400, error.message);
  if (error instanceof Error && /missing|not_found/.test(error.message)) return new AnnotationRequestError(404, "workspace_not_found");
  if (error instanceof Error && /too_large/.test(error.message)) return new AnnotationRequestError(413, "payload_too_large");
  if (error instanceof Error && /corrupt|checksum/.test(error.message)) return new AnnotationRequestError(409, "workspace_integrity_error");
  return new AnnotationRequestError(400, "annotation_request_failed");
}
