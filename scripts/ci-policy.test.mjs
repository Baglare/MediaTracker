import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { tmpdir } from "node:os";
import net from "node:net";
import { exception, verifyAudit, verifyUpstreamVersion } from "./ci-audit.mjs";
import { checkEnvironment, checkFile, checkMigrations, checkTestIntegrity, checkWorkflow, criticalMigrations } from "./ci-checks.mjs";

function fixture() {
  // Synthetic graph: regression tests must still pass when the real advisory is fixed.
  const lock = { lockfileVersion: 3, packages: {
    "": { devDependencies: { "eslint-config-next": "16.3.8" } },
    ...Object.fromEntries(exception.chain.map((name, index) => [`node_modules/${name}`, {
      dev: true, version: exception.versions[index],
      dependencies: index < 4 ? { [exception.chain[index + 1]]: exception.versions[index + 1] } : {},
    }])),
  } };
  const vulnerabilities = Object.fromEntries(exception.chain.map((name, index) => [name, {
    name, severity: "high", isDirect: index === 0, nodes: [`node_modules/${name}`], fixAvailable: false,
    via: index < 4 ? [exception.chain[index + 1]] : [{ name: "braces", dependency: "braces", severity: "high",
      url: exception.advisory, range: "<=3.0.3", cwe: ["CWE-674"] }],
  }]));
  return { lock, report: { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { high: 5, critical: 0 } } } };
}
const reviewed = new Date("2026-10-05T00:00:00Z");

test("exact unexpired dev exception accepted; expiry date is inclusive UTC", () => {
  const { report, lock } = fixture();
  assert.equal(verifyAudit(report, lock, reviewed).accepted, 5);
  assert.equal(verifyAudit(report, lock, new Date("2026-11-03T23:59:59Z")).accepted, 5);
  assert.throws(() => verifyAudit(report, lock, new Date("2026-11-04T00:00:00Z")), /expired/);
});
test("patched/absent advisory passes even after exception expiry", () => {
  const report = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { high: 0, critical: 0 } } };
  assert.equal(verifyAudit(report, {}, new Date("2027-01-01")).accepted, 0);
});
test("only the already reviewed breaking ESLint downgrade is accepted", () => {
  const { report, lock } = fixture();
  for (const entry of Object.values(report.vulnerabilities)) {
    entry.fixAvailable = { name: "eslint-config-next", version: "14.2.35", isSemVerMajor: true };
  }
  assert.equal(verifyAudit(report, lock, reviewed).accepted, 5);
  report.vulnerabilities.braces.fixAvailable.version = "16.3.9";
  assert.throws(() => verifyAudit(report, lock, reviewed));
});
test("an upstream braces patch or invalid metadata blocks the active exception", () => {
  verifyUpstreamVersion("3.0.3");
  for (const value of ["3.0.4", "3.1.0", "4.0.0", "unknown", {}]) assert.throws(() => verifyUpstreamVersion(value));
});
for (const [label, mutate] of [
  ["unknown high", ({ report }) => { report.vulnerabilities.other = { severity: "high" }; report.metadata.vulnerabilities.high++; }],
  ["critical escalation", ({ report }) => { report.vulnerabilities.braces.severity = "critical"; report.metadata.vulnerabilities.high--; report.metadata.vulnerabilities.critical++; }],
  ["different GHSA", ({ report }) => { report.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-other"; }],
  ["changed affected range", ({ report }) => { report.vulnerabilities.braces.via[0].range = "*"; }],
  ["extra advisory", ({ report }) => { report.vulnerabilities.braces.via.push({ url: "unknown" }); }],
  ["unresolved inherited advisory", ({ report }) => { report.vulnerabilities.micromatch.via = ["unknown"]; }],
  ["available fix", ({ report }) => { report.vulnerabilities.braces.fixAvailable = true; }],
  ["non-dev lock entry", ({ lock }) => { lock.packages["node_modules/braces"].dev = false; }],
  ["changed version", ({ lock }) => { lock.packages["node_modules/braces"].version = "3.0.2"; }],
  ["runtime parent", ({ lock }) => { lock.packages["node_modules/runtime"] = { dependencies: { braces: "3.0.3" } }; }],
  ["duplicate package", ({ lock }) => { lock.packages["node_modules/extra/node_modules/braces"] = lock.packages["node_modules/braces"]; }],
  ["audit error", ({ report }) => { report.error = {}; }],
  ["wrong report version", ({ report }) => { report.auditReportVersion = 1; }],
  ["missing totals", ({ report }) => { delete report.metadata; }],
  ["inconsistent totals", ({ report }) => { report.metadata.vulnerabilities.high = 0; }],
]) {
  test(`audit rejects ${label}`, () => {
    const input = fixture();
    mutate(input);
    assert.throws(() => verifyAudit(input.report, input.lock, reviewed));
  });
}

test("workflow parses YAML and satisfies authority/stage contract", () => {
  checkWorkflow(readFileSync(".github/workflows/ci.yml", "utf8"));
});
for (const [label, from, to] of [
  ["write permissions", "contents: read", "contents: write"],
  ["floating action", "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803", "actions/checkout@v6"],
  ["bypassed audit", "node scripts/ci-audit.mjs", "node scripts/ci-audit.mjs || true"],
  ["missing network isolation", "NODE_OPTIONS: --import=${{ github.workspace }}/scripts/ci-offline.mjs", "NODE_OPTIONS: ''"],
]) {
  test(`workflow rejects ${label}`, () => {
    assert.throws(() => checkWorkflow(readFileSync(".github/workflows/ci.yml", "utf8").replace(from, to)));
  });
}
test("test AST ignores strings/comments and permits env-gated live declarations", () => {
  checkTestIntegrity("tests/normal.test.ts", '// it.only("x")\nconst text="describe.skip()"; it("ok",()=>{});');
  checkTestIntegrity("tests/example-live.integration.test.ts", 'describe.skipIf(!process.env.LIVE)("live",()=>{});');
});
for (const source of [
  'it.only("x",()=>{})', 'test.concurrent.only("x",()=>{})', 'describe["skip"]("x",()=>{})',
  'it.todo("x")', 'import {it as check} from "vitest"; check.only("x",()=>{})',
  'describe.skipIf(true)("x",()=>{})', 'test.runIf(false)("x",()=>{})', 'it("x",ctx=>ctx.skip())',
]) {
  test(`test integrity rejects ${source}`, () => assert.throws(() => checkTestIntegrity("tests/example-live.integration.test.ts", source)));
}
test("new conditional skips outside live contract rejected", () => {
  assert.throws(() => checkTestIntegrity("tests/unit.test.ts", 'it.skipIf(flag)("x",()=>{})'));
});
test("hygiene permits config names and synthetic API prose, rejects credential values/artifacts", () => {
  checkFile(".env.example", "NEXT_PUBLIC_SUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=\n");
  checkFile("docs/example.md", "SUPABASE_SERVICE_ROLE_KEY is forbidden. sk-example is placeholder.");
  for (const path of [".env.local", "nested/.env.production", ".next/foo", "coverage/foo", ".codex/evidence", "temp/report", "benchmark/output.json"]) {
    assert.throws(() => checkFile(path, ""));
  }
  assert.throws(() => checkFile(".env.example", "SUPABASE_SERVICE_ROLE_KEY=nonempty"));
  assert.throws(() => checkFile("lib/test.ts", "process.env.SUPABASE_SERVICE_ROLE_KEY"));
  assert.throws(() => checkFile("lib/test.ts", 'import b from "braces"'));
  assert.throws(() => checkFile("lib/test.ts", 'const b = require("micromatch")'));
  assert.throws(() => checkFile("file.txt", "ghp_" + "x".repeat(36)));
  assert.throws(() => checkFile("file.txt", "-----BEGIN " + "PRIVATE KEY-----"));
});
test("migration timestamps, source hashes and documentation references consistent", () => {
  const names = readdirSync("supabase/migrations");
  const read = (name) => readFileSync(`supabase/migrations/${name}`, "utf8");
  checkMigrations(names, read, [Object.keys(criticalMigrations).join("\n")]);
  checkMigrations(names, (name) => read(name).replace(/\r?\n/g, "\r\n"), []);
  assert.throws(() => checkMigrations([...names, "20261004120000_duplicate.sql"], read, []));
  assert.throws(() => checkMigrations([...names, "20261301120000_invalid.sql"], read, []));
  assert.throws(() => checkMigrations(names.slice(0, -1), read, []));
  assert.throws(() => checkMigrations(names, (name) => read(name) + "--changed", []));
  assert.throws(() => checkMigrations(names, read, ["20261005120000_missing.sql"]));
});
test("CI refuses local env, targets, live flags and credentials without printing values", () => {
  checkEnvironment([".env.example", "package.json"], { CI: "true", NEXT_TELEMETRY_DISABLED: "1" });
  assert.throws(() => checkEnvironment([".env.local"], {}));
  for (const key of ["SUPABASE_TEST_URL", "SUPABASE_SERVICE_ROLE_KEY", "RATE_LIMIT_RPC_SIGNING_KEY", "D7_RESEARCH_LIVE_SMOKE", "VERCEL_TOKEN"]) {
    assert.throws(() => checkEnvironment([], { [key]: "dummy-value" }), (error) => !error.message.includes("dummy-value"));
  }
});
test("offline preload denies TCP, TLS and UDP, without exposing target values", () => {
  for (const source of [
    "require('node:net').connect({port:443,host:'example.invalid'})",
    "require('node:tls').connect({port:443,host:'example.invalid'})",
    "require('node:dgram').createSocket('udp4').send('x',53,'example.invalid')",
  ]) {
    const result = spawnSync(process.execPath, ["--import=./scripts/ci-offline.mjs", "-e", source], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CI_OFFLINE_NETWORK_DENIED/);
  }
});
test("absolute preload is inherited by Node children even with unrelated cwd", () => {
  const result = spawnSync(process.execPath, ["-e", "require('node:net').connect({port:443,host:'example.invalid'})"], {
    cwd: tmpdir(), encoding: "utf8", timeout: 5000,
    env: { ...process.env, NODE_OPTIONS: `--import=${new URL("./ci-offline.mjs", import.meta.url).href}` },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CI_OFFLINE_NETWORK_DENIED/);
});
test("offline guard preserves literal loopback worker IPC", async () => {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const result = spawnSync(process.execPath, ["--import=./scripts/ci-offline.mjs", "-e",
      `const s=require('node:net').connect({port:${port},host:'127.0.0.1'},()=>s.destroy())`], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
