import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import { ANNOTATION_TOOL_LIMITS } from "../domain/constants";
import { assertNoSymlinkEscape, assertPathWithinRoot } from "./paths";

const workspaceLocks = new Map<string, Promise<void>>();
let backupSequence = 0;

export function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeJson(entry)]));
  }
  return value;
}

export function serializeCanonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;
}

export async function withWorkspaceWriteLock<T>(workspaceId: string, operation: () => Promise<T>): Promise<T> {
  const previous = workspaceLocks.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  workspaceLocks.set(workspaceId, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (workspaceLocks.get(workspaceId) === queued) workspaceLocks.delete(workspaceId);
  }
}

export interface AtomicWriteHooks {
  afterTempReadBack?: () => void | Promise<void>;
  beforeCommit?: () => void | Promise<void>;
  afterCommit?: () => void | Promise<void>;
}

export interface AtomicWriteResult {
  checksum: string;
  bytes: number;
  backupCreated: boolean;
}

async function pathExists(value: string): Promise<boolean> {
  return stat(value).then(() => true, () => false);
}

async function trimBackups(backupDirectory: string, limit: number): Promise<void> {
  const names = (await readdir(backupDirectory).catch(() => []))
    .filter((name) => name.endsWith(".bak"))
    .sort((left, right) => left.localeCompare(right));
  const remove = names.slice(0, Math.max(0, names.length - limit));
  await Promise.all(remove.map((name) => rm(path.join(backupDirectory, name), { force: true })));
}

export async function atomicWriteJson(options: {
  root: string;
  workspaceId: string;
  target: string;
  backupDirectory: string;
  value: unknown;
  maxBytes: number;
  backupLimit?: number;
  validateCurrent?: (value: unknown) => boolean;
  validateCurrentRaw?: (value: string) => boolean;
  serialize?: (value: unknown) => string;
  hooks?: AtomicWriteHooks;
}): Promise<AtomicWriteResult> {
  const target = assertPathWithinRoot(options.root, options.target);
  const backupDirectory = assertPathWithinRoot(options.root, options.backupDirectory);
  await mkdir(path.dirname(target), { recursive: true });
  await mkdir(backupDirectory, { recursive: true });
  await assertNoSymlinkEscape(options.root, target);
  const serialized = options.serialize?.(options.value) ?? serializeCanonicalJson(options.value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > options.maxBytes) throw new Error("annotation_file_too_large");
  const checksum = sha256Text(serialized);
  const suffix = `${process.pid}-${Date.now()}-${randomBytes(6).toString("hex")}`;
  const temp = assertPathWithinRoot(options.root, path.join(path.dirname(target), `.${path.basename(target)}.${suffix}.tmp`));
  const previous = assertPathWithinRoot(options.root, path.join(path.dirname(target), `.${path.basename(target)}.${suffix}.previous`));
  let previousMoved = false;
  let committed = false;
  let backupCreated = false;
  try {
    const currentExists = await pathExists(target);
    let currentRaw: string | null = null;
    if (currentExists) {
      currentRaw = await readFile(target, "utf8");
      if (options.validateCurrentRaw) {
        if (!options.validateCurrentRaw(currentRaw)) throw new Error("annotation_current_corrupt");
      } else {
        let currentValue: unknown;
        try {
          currentValue = JSON.parse(currentRaw);
        } catch {
          throw new Error("annotation_current_corrupt");
        }
        if (options.validateCurrent && !options.validateCurrent(currentValue)) {
          throw new Error("annotation_current_corrupt");
        }
      }
    }

    const handle = await open(temp, "wx");
    try {
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    const tempRaw = await readFile(temp, "utf8");
    if (sha256Text(tempRaw) !== checksum || tempRaw !== serialized) throw new Error("annotation_temp_verification_failed");
    await options.hooks?.afterTempReadBack?.();

    if (currentRaw !== null) {
      backupSequence += 1;
      const backupName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${String(backupSequence).padStart(6, "0")}-${path.basename(target)}.bak`;
      const backupPath = assertPathWithinRoot(options.root, path.join(backupDirectory, backupName));
      await copyFile(target, backupPath);
      if (sha256Text(await readFile(backupPath, "utf8")) !== sha256Text(currentRaw)) {
        await rm(backupPath, { force: true });
        throw new Error("annotation_backup_verification_failed");
      }
      backupCreated = true;
      await trimBackups(backupDirectory, options.backupLimit ?? ANNOTATION_TOOL_LIMITS.maxBackupsPerWorkspace);
    }

    await options.hooks?.beforeCommit?.();
    if (currentRaw !== null) {
      await rename(target, previous);
      previousMoved = true;
    }
    try {
      await rename(temp, target);
      committed = true;
    } catch (error) {
      if (previousMoved) {
        await rename(previous, target).catch(() => undefined);
        previousMoved = false;
      }
      throw error;
    }
    const finalRaw = await readFile(target, "utf8");
    if (finalRaw !== serialized || sha256Text(finalRaw) !== checksum) {
      if (previousMoved) {
        await rm(target, { force: true });
        await rename(previous, target);
        previousMoved = false;
      }
      throw new Error("annotation_final_verification_failed");
    }
    await options.hooks?.afterCommit?.();
    if (previousMoved) {
      await rm(previous, { force: true });
      previousMoved = false;
    }
    return { checksum, bytes, backupCreated };
  } finally {
    if (!committed) await rm(temp, { force: true }).catch(() => undefined);
    if (previousMoved) await rename(previous, target).catch(() => undefined);
  }
}
