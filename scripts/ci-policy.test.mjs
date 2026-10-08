import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { tmpdir } from "node:os";
import net from "node:net";
import yaml from "js-yaml";
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
for (const [label, mutate] of [
  ['PR trigger', job => { job.if = "github.event_name == 'pull_request'"; }],
  ['main trigger', job => { job.if = "github.event_name == 'push' && github.ref == 'refs/heads/main'"; }],
  ['unconditional trigger', job => { job.if = 'always()'; }],
  ['missing trigger', job => { delete job.if; }],
  ['missing validate dependency', job => { delete job.needs; }],
  ['other dependency', job => { job.needs = 'native-linux-artifact'; }],
  ['self-hosted runner', job => { job['runs-on'] = 'self-hosted'; }],
  ['other Ubuntu version', job => { job['runs-on'] = 'ubuntu-latest'; }],
  ['unbounded runtime', job => { delete job['timeout-minutes']; }],
  ['write permission', job => { job.permissions.contents = 'write'; }],
  ['extra permission', job => { job.permissions['id-token'] = 'write'; }],
  ['deployment environment', job => { job.environment = 'production'; }],
  ['job failure masking', job => { job['continue-on-error'] = true; }],
  ['job container', job => { job.container = 'postgres:17-alpine'; }],
  ['service database', job => { job.services = {postgres: {image: 'postgres:17-alpine'}}; }],
  ['Docker TCP override', job => { job.env.DOCKER_HOST = 'tcp://example.invalid:2375'; }],
  ['Docker SSH override', job => { job.env.DOCKER_HOST = 'ssh://example.invalid'; }],
  ['Docker context override', job => { job.env.DOCKER_CONTEXT = 'remote'; }],
  ['external database target', job => { job.env.DATABASE_URL = 'postgresql://example.invalid/db'; }],
  ['secret expression', job => { job.env.SUPABASE_SERVICE_ROLE_KEY = '${{ secrets.FORBIDDEN }}'; }],
  ['Node preload', job => { job.env.NODE_OPTIONS = '--import=./unexpected.mjs'; }],
  ['floating checkout action', job => { job.steps[0].uses = 'actions/checkout@v6'; }],
  ['persisted checkout credentials', job => { job.steps[0].with['persist-credentials'] = true; }],
  ['Node 22', job => { job.steps[1].with['node-version'] = '22.x'; }],
  ['missing environment guard', job => { job.steps.splice(2, 1); }],
  ['missing Docker guard', job => { job.steps.splice(3, 1); }],
  ['removed Docker override rejection', job => { job.steps[3].run = job.steps[3].run.replace('DOCKER_*|', ''); }],
  ['removed Linux check', job => { job.steps[3].run = job.steps[3].run.split('\n').slice(0, -2).join('\n'); }],
  ['remote socket preparation', job => { job.steps[5].run = job.steps[5].run.replaceAll('unix:///var/run/docker.sock', 'tcp://example.invalid:2375'); }],
  ['other image', job => { job.steps[5].run = job.steps[5].run.replaceAll('postgres:17-alpine', 'postgres:latest'); }],
  ['unbounded image pull', job => { job.steps[5].run = job.steps[5].run.replace('timeout 180s ', ''); }],
  ['missing local image inspect', job => { job.steps[5].run = job.steps[5].run.split('\n').slice(0, -2).join('\n'); }],
  ['image preparation after proof', job => { [job.steps[5], job.steps[6]] = [job.steps[6], job.steps[5]]; }],
  ['reversed P1/P2 order', job => { [job.steps[6], job.steps[7]] = [job.steps[7], job.steps[6]]; }],
  ['omitted P2', job => { job.steps.pop(); }],
  ['proof target argument', job => { job.steps[6].run += ' --target example.invalid'; }],
  ['proof success replacement', job => { job.steps[6].run = 'echo success'; }],
  ['proof failure masking', job => { job.steps[7]['continue-on-error'] = true; }],
  ['conditional proof skip', job => { job.steps[6].if = 'false'; }],
  ['step database target', job => { job.steps[7].env = {DATABASE_URL: 'postgresql://example.invalid/db'}; }],
  ['step shell override', job => { job.steps[6].shell = 'bash {0}'; }],
  ['privileged Docker', job => { job.steps.push({run: 'docker run --privileged postgres:17-alpine'}); }],
  ['host network', job => { job.steps.push({run: 'docker run --network host postgres:17-alpine'}); }],
  ['persistent volume', job => { job.steps.push({run: 'docker run -v pgdata:/var/lib/postgresql/data postgres:17-alpine'}); }],
  ['credential artifact upload', job => { job.steps.push({uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02', with: {path: 'dump.sql'}}); }],
]) {
  test(`disposable PostgreSQL workflow rejects ${label}`, () => {
    const workflow = yaml.load(readFileSync('.github/workflows/ci.yml', 'utf8'));
    // YAML reserialization must pass before applying the attack mutation.
    checkWorkflow(yaml.dump(workflow));
    mutate(workflow.jobs['native-postgres-disposable-proof']);
    assert.throws(() => checkWorkflow(yaml.dump(workflow)));
  });
}
for (const key of ['env', 'defaults']) {
  test(`disposable PostgreSQL workflow rejects inherited ${key}`, () => {
    const workflow = yaml.load(readFileSync('.github/workflows/ci.yml', 'utf8'));
    workflow[key] = key === 'env' ? {DOCKER_HOST: 'ssh://example.invalid'} : {run: {shell: 'bash {0}'}};
    assert.throws(() => checkWorkflow(yaml.dump(workflow)), /Inherited disposable proof configuration denied/);
  });
}
for (const provider of [undefined, "native", "invalid"]) {
  test(`workflow rejects typegen backend provider ${provider ?? "missing"}`, () => {
    const workflow = yaml.load(readFileSync(".github/workflows/ci.yml", "utf8"));
    const step = workflow.jobs.validate.steps.find(step => step.run?.includes("next typegen"));
    if (provider === undefined) delete step.env.BACKEND_PROVIDER;
    else step.env.BACKEND_PROVIDER = provider;
    assert.throws(() => checkWorkflow(yaml.dump(workflow)), /Missing explicit offline typegen provider/);
  });
}
for (const [label, from, to] of [
  ['PR/main artifact trigger', "github.event_name == 'push' && github.ref == 'refs/heads/release/v1-hardening'", 'always()'],
  ['validation dependency removed', 'needs: validate', 'needs: []'],
  ['floating upload action', 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02', 'actions/upload-artifact@v4'],
  ['extended retention', 'retention-days: 7', 'retention-days: 90'],
  ['omitted package verification', 'node scripts/native-package.mjs verify "$package"', 'echo omitted'],
  ['omitted safety scan', 'node scripts/native-artifact-check.mjs "$package"', 'echo omitted'],
  ['wrong native selector', 'BACKEND_PROVIDER: native', 'BACKEND_PROVIDER: supabase'],
]) {
  test(`workflow rejects ${label}`, () => {
    assert.throws(() => checkWorkflow(readFileSync('.github/workflows/ci.yml', 'utf8').replace(from, to)));
  });
}
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
  // A new forward migration can be last; remove the required migration by
  // identity so this negative case continues testing applied-history integrity.
  assert.throws(() => checkMigrations(names.filter((name) => name !== Object.keys(criticalMigrations).at(-1)), read, []));
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
