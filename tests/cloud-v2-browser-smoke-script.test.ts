import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = path.join(root, "scripts", "cloud-v2-browser-smoke.mjs");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const safeEnvironment = {
  ...process.env,
  SUPABASE_TEST_URL: "https://test-project.supabase.co",
  SUPABASE_TEST_ANON_KEY: "test-anon-placeholder",
  SUPABASE_TEST_USER_A_EMAIL: "a@example.test",
  SUPABASE_TEST_USER_A_PASSWORD: "password-a",
  SUPABASE_TEST_USER_B_EMAIL: "b@example.test",
  SUPABASE_TEST_USER_B_PASSWORD: "password-b",
  SUPABASE_PRODUCTION_URL: "https://production-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: "",
};

describe("D2C.2 local browser smoke runner", () => {
  it("is exposed through the requested npm command", () => {
    expect(packageJson.scripts["test:cloud-v2-browser-smoke"])
      .toBe("node scripts/cloud-v2-browser-smoke.mjs");
  });

  it("accepts a distinct explicit test origin without logging credentials", () => {
    const result = spawnSync(
      process.execPath,
      [script, "--preflight-only"],
      { cwd: root, env: safeEnvironment, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("preflight başarılı");
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      safeEnvironment.SUPABASE_TEST_USER_A_PASSWORD,
    );
  });

  it("fails closed when the test origin equals production", () => {
    const result = spawnSync(
      process.execPath,
      [script, "--preflight-only"],
      {
        cwd: root,
        env: {
          ...safeEnvironment,
          SUPABASE_PRODUCTION_URL: safeEnvironment.SUPABASE_TEST_URL,
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DURDURULDU.*production/i);
  });

  it("fails before starting Next when credentials are missing", () => {
    const env: Record<string, string | undefined> = { ...safeEnvironment };
    delete env.SUPABASE_TEST_USER_B_PASSWORD;
    const result = spawnSync(
      process.execPath,
      [script, "--preflight-only"],
      { cwd: root, env, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SUPABASE_TEST_USER_B_PASSWORD");
  });
});
