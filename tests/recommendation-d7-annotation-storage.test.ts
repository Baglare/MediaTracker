import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { atomicWriteJson, withWorkspaceWriteLock } from "@/features/recommendations/evaluation/annotation-tool/storage/atomic";
import { AnnotationWorkspaceRepository } from "@/features/recommendations/evaluation/annotation-tool/storage/repository";
import { testManifest } from "./recommendation-d7-annotation-test-helpers";

const temporary: string[] = [];
async function tempRoot() { const root = await mkdtemp(path.join(tmpdir(), "mt-d7-storage-")); temporary.push(root); return root; }
afterEach(async () => { await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true }))); });

describe("D7-1A atomic persistence", () => {
  it("temp write/read-back/checksum ve atomic commit yapar", async () => {
    const root = await tempRoot(); const target = path.join(root, "workspaces", "abc", "state.json");
    const result = await atomicWriteJson({ root, workspaceId: "abc", target, backupDirectory: path.join(root, "backups", "abc"), value: { version: 1, value: "ok" }, maxBytes: 1024 });
    expect(result.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ value: "ok", version: 1 });
    expect((await readdir(path.dirname(target))).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("oversized payload'u write öncesi reddeder", async () => {
    const root = await tempRoot();
    await expect(atomicWriteJson({ root, workspaceId: "abc", target: path.join(root, "workspaces", "abc", "state.json"), backupDirectory: path.join(root, "backups", "abc"), value: { value: "x".repeat(100) }, maxBytes: 20 })).rejects.toThrow("annotation_file_too_large");
  });

  it("mevcut geçerli dosyayı backup'a alır", async () => {
    const root = await tempRoot(); const target = path.join(root, "workspaces", "abc", "state.json"); const backups = path.join(root, "backups", "abc");
    await atomicWriteJson({ root, workspaceId: "abc", target, backupDirectory: backups, value: { revision: 1 }, maxBytes: 1024 });
    const result = await atomicWriteJson({ root, workspaceId: "abc", target, backupDirectory: backups, value: { revision: 2 }, maxBytes: 1024 });
    expect(result.backupCreated).toBe(true);
    expect(await readdir(backups)).toHaveLength(1);
  });

  it("backup sayısını deterministik sınıra indirir", async () => {
    const root = await tempRoot(); const target = path.join(root, "workspaces", "abc", "state.json"); const backups = path.join(root, "backups", "abc");
    for (let revision = 0; revision < 6; revision += 1) await atomicWriteJson({ root, workspaceId: "abc", target, backupDirectory: backups, value: { revision }, maxBytes: 1024, backupLimit: 3 });
    expect(await readdir(backups)).toHaveLength(3);
  });

  it("commit öncesi failure'da current state'i korur ve temp temizler", async () => {
    const root = await tempRoot(); const target = path.join(root, "workspaces", "abc", "state.json"); const backups = path.join(root, "backups", "abc");
    await atomicWriteJson({ root, workspaceId: "abc", target, backupDirectory: backups, value: { revision: 1 }, maxBytes: 1024 });
    await expect(atomicWriteJson({ root, workspaceId: "abc", target, backupDirectory: backups, value: { revision: 2 }, maxBytes: 1024, hooks: { beforeCommit: () => { throw new Error("synthetic_failure"); } } })).rejects.toThrow("synthetic_failure");
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ revision: 1 });
    expect((await readdir(path.dirname(target))).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("corrupt current state'i sessizce overwrite etmez", async () => {
    const root = await tempRoot(); const target = path.join(root, "workspaces", "abc", "state.json");
    await writeFile(target, "{broken", { encoding: "utf8", flag: "wx" }).catch(async () => { await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(target), { recursive: true })); await writeFile(target, "{broken", "utf8"); });
    await expect(atomicWriteJson({ root, workspaceId: "abc", target, backupDirectory: path.join(root, "backups", "abc"), value: { revision: 2 }, maxBytes: 1024 })).rejects.toThrow("annotation_current_corrupt");
    expect(await readFile(target, "utf8")).toBe("{broken");
  });

  it("workspace process-local lock mutationları sıraya koyar", async () => {
    const order: string[] = [];
    await Promise.all([
      withWorkspaceWriteLock("same", async () => { order.push("a-start"); await new Promise((resolve) => setTimeout(resolve, 20)); order.push("a-end"); }),
      withWorkspaceWriteLock("same", async () => { order.push("b-start"); order.push("b-end"); }),
    ]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });
});

describe("D7-1A workspace repository", () => {
  it("sekiz workspace dosyasıyla draft oluşturur ve checksum doğrular", async () => {
    const root = await tempRoot(); const repository = new AnnotationWorkspaceRepository(root);
    await repository.createWorkspace({ workspaceId: "test-workspace", manifest: testManifest(), actorId: "annotator-01", now: "2026-08-06T00:00:00.000Z" });
    const names = await readdir(path.join(root, "workspaces", "test-workspace"));
    expect(names.sort()).toEqual(["adjudications.json", "annotations.json", "audit-log.ndjson", "checksums.json", "records.json", "revocations.json", "tasks.json", "workspace.json"]);
    expect((await repository.readWorkspace("test-workspace")).workspace.status).toBe("draft");
  });

  it("workspace create duplicate'ini reddeder", async () => {
    const root = await tempRoot(); const repository = new AnnotationWorkspaceRepository(root);
    await repository.createWorkspace({ workspaceId: "test-workspace", manifest: testManifest(), actorId: "annotator-01" });
    await expect(repository.createWorkspace({ workspaceId: "test-workspace", manifest: testManifest(), actorId: "annotator-01" })).rejects.toThrow("annotation_workspace_exists");
  });

  it("checksum mismatch'i controlled integrity error yapar", async () => {
    const root = await tempRoot(); const repository = new AnnotationWorkspaceRepository(root);
    await repository.createWorkspace({ workspaceId: "test-workspace", manifest: testManifest(), actorId: "annotator-01" });
    await writeFile(path.join(root, "workspaces", "test-workspace", "records.json"), JSON.stringify({ version: 1, records: [{ bad: true }] }), "utf8");
    await expect(repository.readWorkspace("test-workspace")).rejects.toThrow("annotation_checksum_mismatch");
  });

  it("gerçek project private dizini yerine OS temp root kullanır", async () => {
    const root = await tempRoot();
    expect(root.startsWith(tmpdir())).toBe(true);
    expect(root).not.toContain("private/recommendation-ml");
  });
});
