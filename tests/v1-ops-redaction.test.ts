import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ops logging redaction", () => {
  it("drops arbitrary SDK/URL/credential failures but preserves known gate diagnostics", () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { safeOpsError } from './scripts/safe-ops-error.mjs';
      const fixtures = ['postgres://user:private-password@private-project/db', 'private@example.test', 'sb_secret_fixture', 'Bearer private-token', 'SUPABASE_TEST_USER_A_PASSWORD=private-password', 'eyJ.fixture.signature'];
      console.log(JSON.stringify(fixtures.map(value => safeOpsError(new Error(value), 'ops_failed'))));
      console.log(safeOpsError(new Error('D8 environment file was not found at the resolved application root'), 'ops_failed'));
      console.log(safeOpsError(new Error('Eksik environment değişkenleri: SUPABASE_TEST_USER_B_PASSWORD'), 'ops_failed'));
    `], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.trim().split("\n");
    expect(JSON.parse(lines[0])).toEqual(Array(6).fill("ops_failed"));
    expect(lines[1]).toContain("D8 environment file was not found");
    expect(lines[2]).toContain("SUPABASE_TEST_USER_B_PASSWORD");
    for (const secret of ["private-password", "private-project", "private@example.test", "sb_secret_fixture", "private-token", "eyJ.fixture.signature"]) expect(result.stdout).not.toContain(secret);
  });
  it("DB/CLI subprocesses cannot forward raw SQL or credentials to the terminal", () => {
    for (const file of ["scripts/d8-staging-target.mjs", "scripts/d8-security-advisor-staging.mjs"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('stdio: "ignore"');
      expect(source).not.toContain('stdio: "inherit"');
    }
  });
  it("browser auth fallback never returns an arbitrary SDK message", () => {
    const source = readFileSync("hooks/use-auth.ts", "utf8");
    expect(source).not.toContain('return err.message');
    expect(source).toContain('return "İşlem sırasında bir hata oluştu."');
  });
});
