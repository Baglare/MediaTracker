import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  applicationRoot,
  defaultD8EnvFile,
  loadD8Environment,
  resolveD8EnvFile,
} from "../scripts/d8-staging-env.mjs";

const temporaryDirectories: string[] = [];
const hardGateScript = path.join(applicationRoot, "scripts", "d8-staging-hard-gate.mjs");
const dummySecret = "dummy-secret-never-log";

function fixtureDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "media-tracker-d8-env-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFixture(directory: string) {
  const envFile = path.join(directory, "fixture.env");
  writeFileSync(envFile, [
    "D8_STAGING_CUTOVER_ENABLED=1",
    "D8_STAGING_MIGRATION_ALLOWED=1",
    "D8_STAGING_PROJECT_REF=stage-project",
    "D8_PRODUCTION_PROJECT_REF=prod-project",
    `D8_STAGING_DATABASE_URL=postgresql://postgres.stage-project:${dummySecret}@pooler.example.test/db`,
    "NEXT_PUBLIC_SUPABASE_URL=https://stage-project.supabase.co",
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${dummySecret}-app-anon`,
    `SUPABASE_SERVICE_ROLE_KEY=${dummySecret}-service-role`,
    "SUPABASE_TEST_URL=https://stage-project.supabase.co",
    `SUPABASE_TEST_ANON_KEY=${dummySecret}-test-anon`,
    "SUPABASE_TEST_USER_A_EMAIL=user-a@example.test",
    `SUPABASE_TEST_USER_A_PASSWORD=${dummySecret}-user-a`,
    "SUPABASE_TEST_USER_B_EMAIL=user-b@example.test",
    `SUPABASE_TEST_USER_B_PASSWORD=${dummySecret}-user-b`,
  ].join("\n"));
  return envFile;
}

function cleanChildEnvironment() {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith("D8_") || name.startsWith("SUPABASE_TEST_") || [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ].includes(name)) delete env[name];
  }
  return env;
}

function runHardGate(cwd: string, envFile: string) {
  return spawnSync(process.execPath, [hardGateScript], {
    cwd,
    env: { ...cleanChildEnvironment(), D8_ENV_FILE: envFile },
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("D8 staging env loader", () => {
  it("resolves the default env file from the script application root", () => {
    expect(defaultD8EnvFile).toBe(path.join(applicationRoot, ".env.local"));
    expect(resolveD8EnvFile([], {})).toBe(defaultD8EnvFile);
  });

  it.each([
    ["media-tracker cwd", applicationRoot],
    ["workspace cwd", path.dirname(applicationRoot)],
    ["unrelated temporary cwd", null],
  ])("loads the same explicit dummy fixture from %s", (_label, configuredCwd) => {
    const directory = fixtureDirectory();
    const envFile = writeFixture(directory);
    const cwd = configuredCwd ?? directory;
    const result = runHardGate(cwd, envFile);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: true });
    expect(`${result.stdout}${result.stderr}`).not.toContain(dummySecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain("user-a@example.test");
  });

  it("fails closed without a resolved env file and does not print the path", () => {
    const directory = fixtureDirectory();
    const missing = path.join(directory, "missing.env");
    const result = runHardGate(directory, missing);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("D8 environment file was not found");
    expect(result.stderr).not.toContain(missing);
  });

  it("preserves values already present in the target process environment", () => {
    const directory = fixtureDirectory();
    const envFile = writeFixture(directory);
    const env: Record<string, string | undefined> = { SUPABASE_TEST_USER_A_EMAIL: "preserved@example.test" };
    loadD8Environment({ env, envFile });
    expect(env.SUPABASE_TEST_USER_A_EMAIL).toBe("preserved@example.test");
    expect(env.SUPABASE_TEST_USER_B_EMAIL).toBe("user-b@example.test");
  });

  it("loads the shared environment contract before every SQL entry point", () => {
    for (const name of ["preflight", "postcheck", "rollback-check"]) {
      const source = readFileSync(path.join(applicationRoot, "scripts", `d8-staging-${name}.mjs`), "utf8");
      expect(source).toContain('import { loadD8Environment } from "./d8-staging-env.mjs"');
      expect(source.indexOf("loadD8Environment()")).toBeLessThan(source.indexOf("runReadOnlySql("));
    }
  });
});
