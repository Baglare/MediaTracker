import "server-only";

import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { isValidWorkspaceId } from "../domain/ids";

export { isValidAnnotatorId, isValidBoundedId, isValidWorkspaceId } from "../domain/ids";

export function resolveAnnotationDataRoot(cwd = process.cwd(), configured = process.env.D7_ANNOTATION_DATA_DIR): string {
  const base = path.resolve(cwd);
  const root = path.resolve(base, configured?.trim() || "private/recommendation-ml");
  if (root === base) throw new Error("annotation_data_root_invalid");
  return root;
}

export function assertPathWithinRoot(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("annotation_path_outside_root");
  }
  return resolvedCandidate;
}

export function workspaceDirectory(root: string, workspaceId: string): string {
  if (!isValidWorkspaceId(workspaceId)) throw new Error("annotation_workspace_id_invalid");
  return assertPathWithinRoot(root, path.join(root, "workspaces", workspaceId));
}

export async function ensureSafeWorkspaceDirectory(root: string, workspaceId: string, create = false): Promise<string> {
  const directory = workspaceDirectory(root, workspaceId);
  if (create) await mkdir(directory, { recursive: true });
  const rootReal = await realpath(root).catch(() => path.resolve(root));
  const directoryReal = await realpath(directory).catch(() => directory);
  assertPathWithinRoot(rootReal, directoryReal);
  const stats = await lstat(directory).catch(() => null);
  if (stats?.isSymbolicLink()) throw new Error("annotation_workspace_symlink_forbidden");
  return directory;
}

export async function assertNoSymlinkEscape(root: string, candidate: string): Promise<void> {
  const resolved = assertPathWithinRoot(root, candidate);
  const rootReal = await realpath(root).catch(() => path.resolve(root));
  const parentReal = await realpath(path.dirname(resolved)).catch(() => path.dirname(resolved));
  assertPathWithinRoot(rootReal, path.join(parentReal, path.basename(resolved)));
}
