import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { decodeAnnotationWorkspaceState } from "../domain/codec";
import { ANNOTATION_TOOL_LIMITS, DEFAULT_MVP_ASPECT_IDS } from "../domain/constants";
import type {
  AnnotationAuditEvent,
  AnnotationWorkspaceMetadata,
  AnnotationWorkspaceState,
} from "../domain/types";
import { atomicWriteJson, serializeCanonicalJson, sha256Text, withWorkspaceWriteLock } from "./atomic";
import { ensureSafeWorkspaceDirectory, isValidWorkspaceId, resolveAnnotationDataRoot } from "./paths";

const FILES = {
  workspace: "workspace.json",
  records: "records.json",
  tasks: "tasks.json",
  annotations: "annotations.json",
  adjudications: "adjudications.json",
  revocations: "revocations.json",
  audit: "audit-log.ndjson",
  checksums: "checksums.json",
} as const;

interface ChecksumFile {
  version: 1;
  files: Record<string, string>;
  updatedAt: string;
}

function collectionEnvelope<T>(key: string, values: readonly T[]): Record<string, unknown> {
  return { version: 1, [key]: values };
}

async function readJson(file: string, maxBytes: number): Promise<unknown> {
  const size = await stat(file).then((value) => value.size);
  if (size > maxBytes) throw new Error("annotation_file_too_large");
  const raw = await readFile(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("annotation_workspace_corrupt");
  }
}

function readEnvelopeArray(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("annotation_workspace_corrupt");
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record[key])) throw new Error("annotation_workspace_corrupt");
  return record[key] as unknown[];
}

function auditEventIsSafe(event: AnnotationAuditEvent): boolean {
  const raw = JSON.stringify(event);
  return !/(summary|evidence|note|path|api.?key|prompt|email)/i.test(raw);
}

export class AnnotationWorkspaceRepository {
  readonly root: string;

  constructor(root = resolveAnnotationDataRoot()) {
    this.root = path.resolve(root);
  }

  private async initializeRoot(): Promise<void> {
    await Promise.all(["workspaces", "exports", "backups", "model-artifacts", "logs"].map((name) => (
      mkdir(path.join(this.root, name), { recursive: true })
    )));
  }

  async listWorkspaceIds(): Promise<string[]> {
    await this.initializeRoot();
    const entries = await readdir(path.join(this.root, "workspaces"), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && isValidWorkspaceId(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  async createWorkspace(input: {
    workspaceId: string;
    manifest: AnnotationWorkspaceMetadata["manifest"];
    actorId: string;
    selectedAspectIds?: AnnotationWorkspaceMetadata["selectedAspectIds"];
    guidelineVersion?: string;
    sourcePolicyVersions?: readonly string[];
    now?: string;
  }): Promise<AnnotationWorkspaceState> {
    return withWorkspaceWriteLock(input.workspaceId, async () => {
      await this.initializeRoot();
      const directory = await ensureSafeWorkspaceDirectory(this.root, input.workspaceId, true);
      const workspaceFile = path.join(directory, FILES.workspace);
      if (await stat(workspaceFile).then(() => true, () => false)) throw new Error("annotation_workspace_exists");
      const now = input.now ?? new Date().toISOString();
      const state: AnnotationWorkspaceState = {
        workspace: {
          version: 1,
          workspaceId: input.workspaceId,
          manifest: { ...input.manifest, aspectIds: input.selectedAspectIds ?? DEFAULT_MVP_ASPECT_IDS, recordCount: 0, updatedAt: now },
          status: "draft",
          selectedAspectIds: input.selectedAspectIds ?? DEFAULT_MVP_ASPECT_IDS,
          guidelineVersion: input.guidelineVersion ?? "d7_annotation_v1",
          sourcePolicyVersions: input.sourcePolicyVersions ?? ["d7_license_v1"],
          createdAt: now,
          updatedAt: now,
        },
        records: [],
        tasks: [],
        annotations: [],
        adjudications: [],
        revocations: [],
      };
      const decoded = decodeAnnotationWorkspaceState(state);
      if (!decoded.ok) throw new Error(`annotation_workspace_invalid:${decoded.issues[0]?.code ?? "unknown"}`);
      await this.writeStateUnlocked(decoded.value, false);
      await this.writeAuditUnlocked(input.workspaceId, [{
        version: 1,
        eventId: `evt-${randomUUID()}`,
        workspaceId: input.workspaceId,
        eventType: "workspace_created",
        actorId: input.actorId,
        targetIds: [input.workspaceId],
        occurredAt: now,
        metadata: { selectedAspectCount: decoded.value.workspace.selectedAspectIds.length },
      }]);
      return decoded.value;
    });
  }

  async readWorkspace(workspaceId: string): Promise<AnnotationWorkspaceState> {
    await this.initializeRoot();
    const directory = await ensureSafeWorkspaceDirectory(this.root, workspaceId, false);
    const checksums = await readJson(path.join(directory, FILES.checksums), ANNOTATION_TOOL_LIMITS.workspaceManifestBytes) as ChecksumFile;
    if (!checksums || checksums.version !== 1 || typeof checksums.files !== "object") throw new Error("annotation_checksums_corrupt");
    if (checksums.files[FILES.audit]) {
      const auditRaw = await readFile(path.join(directory, FILES.audit), "utf8");
      if (sha256Text(auditRaw) !== checksums.files[FILES.audit]) throw new Error("annotation_checksum_mismatch");
      auditRaw.trim().split("\n").filter(Boolean).forEach((line) => JSON.parse(line));
    }
    const rawFiles = await Promise.all([
      FILES.workspace,
      FILES.records,
      FILES.tasks,
      FILES.annotations,
      FILES.adjudications,
      FILES.revocations,
    ].map(async (name) => {
      const raw = await readFile(path.join(directory, name), "utf8");
      if (sha256Text(raw) !== checksums.files[name]) throw new Error("annotation_checksum_mismatch");
      return JSON.parse(raw) as unknown;
    }));
    const [workspace, records, tasks, annotations, adjudications, revocations] = rawFiles;
    const decoded = decodeAnnotationWorkspaceState({
      workspace,
      records: readEnvelopeArray(records, "records"),
      tasks: readEnvelopeArray(tasks, "tasks"),
      annotations: readEnvelopeArray(annotations, "annotations"),
      adjudications: readEnvelopeArray(adjudications, "adjudications"),
      revocations: readEnvelopeArray(revocations, "revocations"),
    });
    if (!decoded.ok) throw new Error(`annotation_workspace_corrupt:${decoded.issues[0]?.code ?? "unknown"}`);
    return decoded.value;
  }

  async mutateWorkspace<T>(input: {
    workspaceId: string;
    actorId: string;
    event: Omit<AnnotationAuditEvent, "version" | "eventId" | "workspaceId" | "actorId" | "occurredAt">;
    mutate: (state: AnnotationWorkspaceState) => { state: AnnotationWorkspaceState; result: T };
    now?: string;
  }): Promise<T> {
    return withWorkspaceWriteLock(input.workspaceId, async () => {
      const current = await this.readWorkspace(input.workspaceId);
      const mutation = input.mutate(current);
      const decoded = decodeAnnotationWorkspaceState(mutation.state);
      if (!decoded.ok) throw new Error(`annotation_workspace_invalid:${decoded.issues[0]?.code ?? "unknown"}`);
      await this.writeStateUnlocked(decoded.value, true);
      const now = input.now ?? new Date().toISOString();
      await this.writeAuditUnlocked(input.workspaceId, [{
        version: 1,
        eventId: `evt-${randomUUID()}`,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        occurredAt: now,
        ...input.event,
      }]);
      return mutation.result;
    });
  }

  async createBackup(workspaceId: string, actorId: string): Promise<void> {
    return withWorkspaceWriteLock(workspaceId, async () => {
      const state = await this.readWorkspace(workspaceId);
      await this.writeStateUnlocked(state, true);
      await this.writeAuditUnlocked(workspaceId, [{
        version: 1,
        eventId: `evt-${randomUUID()}`,
        workspaceId,
        eventType: "backup_created",
        actorId,
        targetIds: [workspaceId],
        occurredAt: new Date().toISOString(),
        metadata: { files: 7 },
      }]);
    });
  }

  async appendAuditEvent(event: AnnotationAuditEvent): Promise<void> {
    return withWorkspaceWriteLock(event.workspaceId, async () => {
      await this.readWorkspace(event.workspaceId);
      await this.writeAuditUnlocked(event.workspaceId, [event]);
    });
  }

  private async writeStateUnlocked(state: AnnotationWorkspaceState, backup: boolean): Promise<void> {
    const directory = await ensureSafeWorkspaceDirectory(this.root, state.workspace.workspaceId, true);
    const backupDirectory = path.join(this.root, "backups", state.workspace.workspaceId);
    const payloads: [string, unknown, number][] = [
      [FILES.workspace, state.workspace, ANNOTATION_TOOL_LIMITS.workspaceManifestBytes],
      [FILES.records, collectionEnvelope("records", state.records), ANNOTATION_TOOL_LIMITS.importBundleBytes],
      [FILES.tasks, collectionEnvelope("tasks", state.tasks), ANNOTATION_TOOL_LIMITS.annotationStateBytes],
      [FILES.annotations, collectionEnvelope("annotations", state.annotations), ANNOTATION_TOOL_LIMITS.annotationStateBytes],
      [FILES.adjudications, collectionEnvelope("adjudications", state.adjudications), ANNOTATION_TOOL_LIMITS.annotationStateBytes],
      [FILES.revocations, collectionEnvelope("revocations", state.revocations), ANNOTATION_TOOL_LIMITS.annotationStateBytes],
    ];
    const checksums: Record<string, string> = {};
    for (const [name, value, maxBytes] of payloads) {
      const result = await atomicWriteJson({
        root: this.root,
        workspaceId: state.workspace.workspaceId,
        target: path.join(directory, name),
        backupDirectory,
        value,
        maxBytes,
        backupLimit: backup ? ANNOTATION_TOOL_LIMITS.maxBackupsPerWorkspace : 0,
      });
      checksums[name] = result.checksum;
    }
    await atomicWriteJson({
      root: this.root,
      workspaceId: state.workspace.workspaceId,
      target: path.join(directory, FILES.checksums),
      backupDirectory,
      value: { version: 1, files: checksums, updatedAt: state.workspace.updatedAt } satisfies ChecksumFile,
      maxBytes: ANNOTATION_TOOL_LIMITS.workspaceManifestBytes,
      backupLimit: backup ? ANNOTATION_TOOL_LIMITS.maxBackupsPerWorkspace : 0,
    });
  }

  private async writeAuditUnlocked(workspaceId: string, events: readonly AnnotationAuditEvent[]): Promise<void> {
    if (events.some((event) => !auditEventIsSafe(event))) throw new Error("annotation_audit_event_unsafe");
    const directory = await ensureSafeWorkspaceDirectory(this.root, workspaceId, true);
    const file = path.join(directory, FILES.audit);
    const existing = await readFile(file, "utf8").catch(() => "");
    const next = `${existing}${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
    const validateNdjson = (raw: string): boolean => {
      try {
        raw.trim().split("\n").filter(Boolean).forEach((line) => JSON.parse(line));
        return true;
      } catch {
        return false;
      }
    };
    const auditResult = await atomicWriteJson({
      root: this.root,
      workspaceId,
      target: file,
      backupDirectory: path.join(this.root, "backups", workspaceId),
      value: next,
      serialize: (value) => String(value),
      validateCurrentRaw: validateNdjson,
      maxBytes: ANNOTATION_TOOL_LIMITS.auditLogBytes,
    });
    const checksumsFile = path.join(directory, FILES.checksums);
    const checksums = await readJson(checksumsFile, ANNOTATION_TOOL_LIMITS.workspaceManifestBytes) as ChecksumFile;
    await atomicWriteJson({
      root: this.root,
      workspaceId,
      target: checksumsFile,
      backupDirectory: path.join(this.root, "backups", workspaceId),
      value: { ...checksums, files: { ...checksums.files, [FILES.audit]: auditResult.checksum }, updatedAt: events.at(-1)?.occurredAt ?? checksums.updatedAt },
      maxBytes: ANNOTATION_TOOL_LIMITS.workspaceManifestBytes,
    });
  }
}

export function workspaceStateChecksum(state: AnnotationWorkspaceState): string {
  return sha256Text(serializeCanonicalJson(state));
}
