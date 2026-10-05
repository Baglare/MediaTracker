import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("V1-HARDENING-06 operational source proof", () => {
  it("passes offline recovery, release and integrity scenarios without DB or remote access", () => {
    const result = spawnSync(process.execPath, ["--import=./scripts/ci-offline.mjs", "--test", "tests/v1-operations.test.mjs"], { encoding: "utf8" });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
