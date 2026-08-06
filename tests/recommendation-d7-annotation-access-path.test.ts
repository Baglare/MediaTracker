import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evaluateAnnotationToolAccess, isLocalAnnotationHost } from "@/features/recommendations/evaluation/annotation-tool/access";
import { annotationApiGuard } from "@/features/recommendations/evaluation/annotation-tool/server/access";
import {
  assertPathWithinRoot,
  ensureSafeWorkspaceDirectory,
  isValidAnnotatorId,
  isValidWorkspaceId,
  workspaceDirectory,
} from "@/features/recommendations/evaluation/annotation-tool/storage/paths";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true }))); vi.unstubAllEnvs(); });

describe("D7-1A development-only access", () => {
  it("production ortamında flag açık olsa da reddeder", () => {
    expect(evaluateAnnotationToolAccess({ nodeEnv: "production", enabledFlag: "1", host: "localhost:3000" })).toEqual({ allowed: false, reason: "production" });
  });

  it("development flag kapalıyken reddeder", () => {
    expect(evaluateAnnotationToolAccess({ nodeEnv: "development", enabledFlag: "0", host: "localhost" }).allowed).toBe(false);
  });

  it("development + explicit flag + localhost için izin verir", () => {
    expect(evaluateAnnotationToolAccess({ nodeEnv: "development", enabledFlag: "1", host: "localhost:3000" })).toEqual({ allowed: true, reason: "allowed" });
  });

  it("127.0.0.1 ve IPv6 loopback'i kabul eder", () => {
    expect(isLocalAnnotationHost("127.0.0.1:3000")).toBe(true);
    expect(isLocalAnnotationHost("[::1]:3000")).toBe(true);
  });

  it("LAN ve malformed host'u reddeder", () => {
    expect(isLocalAnnotationHost("192.168.1.5:3000")).toBe(false);
    expect(isLocalAnnotationHost("localhost.evil.example")).toBe(false);
    expect(isLocalAnnotationHost("localhost\u0000.evil")).toBe(false);
  });

  it("API guard aynı policy ile 404 ve private/no-store döner", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("D7_ANNOTATION_TOOL_ENABLED", "1");
    const response = annotationApiGuard(new Request("http://localhost/api/dev/recommendation-annotation", { headers: { host: "localhost" } }));
    expect(response?.status).toBe(404);
    expect(response?.headers.get("cache-control")).toContain("private, no-store");
  });

  it("reddedilen API response path veya policy nedeni sızdırmaz", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("D7_ANNOTATION_TOOL_ENABLED", "0");
    const response = annotationApiGuard(new Request("http://localhost/api/dev/recommendation-annotation", { headers: { host: "localhost" } }))!;
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});

describe("D7-1A workspace IDs and path containment", () => {
  it("3-48 lowercase/digit/hyphen workspace ID kabul eder", () => {
    expect(isValidWorkspaceId("abc")).toBe(true);
    expect(isValidWorkspaceId("pilot-2026-01")).toBe(true);
  });

  it.each(["../escape", "a/b", "a\\b", "C:\\absolute", "-leading", "trailing-", "UPPER", "ab", `a${"b".repeat(48)}`])("geçersiz workspace ID'yi reddeder: %s", (value) => {
    expect(isValidWorkspaceId(value)).toBe(false);
  });

  it("annotator ID'yi pseudonymous bounded formatta tutar", () => {
    expect(isValidAnnotatorId("annotator-01")).toBe(true);
    expect(isValidAnnotatorId("real.person@example.com")).toBe(false);
  });

  it("root dışı absolute/relative path'i reddeder", () => {
    const root = path.resolve("C:/tmp/d7-root");
    expect(() => assertPathWithinRoot(root, path.resolve(root, "../escape"))).toThrow("annotation_path_outside_root");
    expect(() => workspaceDirectory(root, "../escape")).toThrow("annotation_workspace_id_invalid");
  });

  it("workspace path'ini yalnız server belirlenen root altında üretir", () => {
    const root = path.resolve("C:/tmp/d7-root");
    expect(workspaceDirectory(root, "valid-workspace")).toBe(path.join(root, "workspaces", "valid-workspace"));
  });

  it("junction/symlink üzerinden root dışına kaçışı reddeder", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mt-d7-path-root-")); temporary.push(root);
    const outside = await mkdtemp(path.join(tmpdir(), "mt-d7-path-outside-")); temporary.push(outside);
    await mkdir(path.join(root, "workspaces"), { recursive: true });
    await symlink(outside, path.join(root, "workspaces", "escape-link"), "junction");
    await expect(ensureSafeWorkspaceDirectory(root, "escape-link")).rejects.toThrow(/outside_root|symlink_forbidden/);
  });
});
