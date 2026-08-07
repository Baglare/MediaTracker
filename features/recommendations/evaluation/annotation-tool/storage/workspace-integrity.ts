import "server-only";

import type { AspectId } from "../../../domain/aspect-registry";
import type {
  AnnotationWorkspaceState,
  WorkspaceMetadataReconcilePreview,
} from "../domain/types";
import { serializeCanonicalJson, sha256Text } from "./atomic";

function sortedBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

export function deriveTaskAspectIds(state: AnnotationWorkspaceState): AspectId[] {
  return [...new Set(state.tasks
    .filter((task) => task.status !== "excluded")
    .map((task) => task.aspectId))]
    .sort((left, right) => left.localeCompare(right));
}

export function workspaceDatasetHashInput(state: AnnotationWorkspaceState) {
  return {
    schemaVersion: state.workspace.manifest.schemaVersion,
    datasetId: state.workspace.manifest.datasetId,
    records: sortedBy(state.records.map((entry) => entry.record), (entry) => entry.recordId),
    provenance: sortedBy(state.records.map((entry) => entry.provenance), (entry) => entry.recordId),
    activeAnnotations: sortedBy(
      state.annotations.filter((entry) => entry.active),
      (entry) => entry.annotation.annotationId,
    ),
    adjudications: sortedBy(state.adjudications, (entry) => entry.adjudicationId),
    activeRevocations: sortedBy(
      state.revocations.filter((entry) => entry.status === "active"),
      (entry) => entry.revocationId,
    ),
  };
}

export function computeWorkspaceDatasetContentHash(state: AnnotationWorkspaceState): string {
  return sha256Text(serializeCanonicalJson(workspaceDatasetHashInput(state)));
}

export function computeEmptyWorkspaceDatasetContentHash(
  datasetId: string,
  schemaVersion = 1,
): string {
  return sha256Text(serializeCanonicalJson({
    schemaVersion,
    datasetId,
    records: [],
    provenance: [],
    activeAnnotations: [],
    adjudications: [],
    activeRevocations: [],
  }));
}

export function withWorkspaceDatasetContentHash(state: AnnotationWorkspaceState): AnnotationWorkspaceState {
  const contentHash = computeWorkspaceDatasetContentHash(state);
  return {
    ...state,
    workspace: {
      ...state.workspace,
      manifest: { ...state.workspace.manifest, contentHash },
    },
  };
}

export function previewWorkspaceMetadataReconcile(
  state: AnnotationWorkspaceState,
): WorkspaceMetadataReconcilePreview {
  const taskAspectIds = deriveTaskAspectIds(state);
  const computedAspectIds = taskAspectIds.length > 0
    ? taskAspectIds
    : [...state.workspace.selectedAspectIds];
  const computedContentHash = computeWorkspaceDatasetContentHash(state);
  return {
    currentContentHash: state.workspace.manifest.contentHash,
    computedContentHash,
    currentAspectIds: state.workspace.manifest.aspectIds,
    computedAspectIds,
    contentHashChanged: state.workspace.manifest.contentHash !== computedContentHash,
    aspectScopeChanged: JSON.stringify(state.workspace.manifest.aspectIds) !== JSON.stringify(computedAspectIds),
  };
}

export function reconcileWorkspaceMetadata(
  state: AnnotationWorkspaceState,
  now: string,
): AnnotationWorkspaceState {
  const preview = previewWorkspaceMetadataReconcile(state);
  return {
    ...state,
    workspace: {
      ...state.workspace,
      manifest: {
        ...state.workspace.manifest,
        aspectIds: preview.computedAspectIds,
        contentHash: preview.computedContentHash,
        updatedAt: now,
      },
      updatedAt: now,
    },
  };
}
