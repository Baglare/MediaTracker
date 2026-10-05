import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("privacy ops offline synthetic and migration contract proof", () => {
  it("passes the Node lifecycle suites without a database or network adapter", () => {
    const result = spawnSync(process.execPath, ["--import=./scripts/ci-offline.mjs", "--test", "tests/privacy-account-ops.test.mjs", "tests/privacy-retention-ops.test.mjs", "tests/privacy-erasure-race.test.mjs", "tests/privacy-write-barrier.test.mjs"], { encoding: "utf8" });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
