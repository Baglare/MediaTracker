import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { posix } from "node:path";
import ts from "typescript";
import yaml from "js-yaml";
import { exception } from "./ci-audit.mjs";
import { checkOperationalSources } from "./ops/verify-source.mjs";

export const criticalMigrations = {
  "20261004120000_application_rate_limit_v1.sql": "08e2c5b6798df8200820df3e2687a8f649fd45ae8a1ab775f735133bdd060ff9",
  "20261004123000_application_rate_limit_forward_fix_v1.sql": "7163173c55cfb9764d95929f83b8e3cae659414d5fa5e44d647535b740339d79",
  "20261004124000_application_rate_limit_reserve_alias_fix_v1.sql": "27fc11b118013897b913efecc62f382499416c2bf4ffb83f8d6386e98c027834",
};
const migrationDocs = ["docs/V1_HARDENING_02D.md", "docs/D8_PRODUCTION_CUTOVER_RUNBOOK.md",
  "docs/D8_RELEASE_CANDIDATE_ACCEPTANCE.md", "docs/PRODUCTION_CLOUD_V2_CUTOVER.md", "docs/V1_HARDENING_03.md"];

function requireContract(condition, message) {
  if (!condition) throw new Error(message);
}

export function checkMigrations(names, read, docs) {
  const ordered = [...names].sort();
  const seen = new Set();
  for (const name of ordered) {
    requireContract(/^\d{14}_[a-z0-9_]+\.sql$/.test(name), "Invalid migration filename");
    const stamp = name.slice(0, 14);
    const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`;
    const date = new Date(iso);
    requireContract(Number.isFinite(date.getTime()) && date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) === stamp,
      "Invalid migration timestamp");
    requireContract(!seen.has(stamp), "Duplicate migration timestamp");
    seen.add(stamp);
  }
  for (const [name, hash] of Object.entries(criticalMigrations)) {
    requireContract(names.includes(name), "Missing critical 02D migration");
    const actual = createHash("sha256").update(read(name).replace(/\r\n/g, "\n")).digest("hex");
    requireContract(actual === hash, "Applied-history 02D migration changed; use a reviewed forward migration");
  }
  for (const text of docs) {
    for (const match of text.matchAll(/\b\d{14}_[a-z0-9_]+\.sql\b/g)) {
      requireContract(names.includes(match[0]), "Release/history documentation references a missing migration");
    }
  }
  const critical = Object.keys(criticalMigrations);
  requireContract(critical.every((name, index) => index === 0 || ordered.indexOf(critical[index - 1]) < ordered.indexOf(name)),
    "02D dependency ordering changed");
}

export function checkTestIntegrity(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const aliases = new Set(["it", "test", "describe", "suite"]);
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === "vitest") {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements) {
          if (["it", "test", "describe", "suite"].includes((item.propertyName ?? item.name).text)) aliases.add(item.name.text);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) aliases.add(bindings.name.text);
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "skip" && !aliases.has(node.expression.expression.getText(source))) {
      // The existing live Goal test may skip only after its schema probe fails.
      const block = node.parent.parent;
      const guard = block.parent;
      requireContract(path === "tests/goal-cloud-v1-live.integration.test.ts"
        && node.expression.expression.getText(source) === "context"
        && ts.isIfStatement(guard) && guard.expression.getText(source) === "schemaProbe.error",
      `Unreviewed runtime test skip: ${path}`);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const property = ts.isPropertyAccessExpression(node) ? node.name.text
        : ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : "";
      let root = node.expression;
      while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root) || ts.isCallExpression(root)) root = root.expression;
      if (ts.isIdentifier(root) && aliases.has(root.text)) {
        requireContract(!["only", "skip", "todo"].includes(property), `Forbidden test modifier: ${path}`);
        if (["skipIf", "runIf"].includes(property)) {
          requireContract(path.endsWith("-live.integration.test.ts"), `Conditional tests must use the live-test contract: ${path}`);
          const call = node.parent;
          requireContract(ts.isCallExpression(call) && call.arguments.length === 1
            && ![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.StringLiteral].includes(call.arguments[0].kind),
          `Literal conditional skip is forbidden: ${path}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

export function checkFile(path, text) {
  requireContract(!/(^|\/)\.env(?:\.|$)/.test(path) || path === ".env.example", `Tracked env file: ${path}`);
  requireContract(!/(^|\/)(?:\.next|\.codex|\.vercel|\.knowledge-compiler|node_modules|coverage|tmp|temp|benchmarks?)(?:\/|$)/i.test(path)
    && !/\.(?:tsbuildinfo|log)$/.test(path), `Tracked generated/private artifact: ${path}`);
  if (path === ".env.example") {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && /(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|SUPABASE.*URL|HMAC)/.test(match[1])) {
        requireContract(match[2].trim() === "", "Credential/target value in env template");
      }
    }
  }
  // High-specificity signatures; report only filenames, never matched values.
  requireContract(!/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,}\b|\bAKIA[A-Z0-9]{16}\b|\bAIza[A-Za-z0-9_-]{35}\b|\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}\b)/.test(text),
    `Potential private key/token: ${path}`);
  if (/^(?:app|lib|features|components|hooks)\//.test(path) && /\.[cm]?[jt]sx?$/.test(path)) {
    if (text.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      requireContract(path === "lib/ai/persistent-embedding-cache.ts"
        && text.includes('process.env.MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE !== "on"')
        && text.includes('process.env.MEDIA_TRACKER_EMBEDDING_CACHE === "off"'), "Unreviewed runtime service-role use");
    }
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    function nativeBoundary(name, typeOnly=false) {
      if (!name || typeOnly) return;
      const target=(name.startsWith("@/")?name.slice(2):name.startsWith(".")?posix.normalize(posix.join(posix.dirname(path),name)):name).replace(/\.[cm]?[jt]s$/, "");
      if (target==="lib/backend/postgres") requireContract(["lib/auth/native.ts","lib/backend/transaction.ts"].includes(path), "Protected repositories require authenticated transaction context, not the native pool");
      if (name==="pg" || name.startsWith("pg/")) requireContract(path==="lib/backend/postgres.ts", "Native pg belongs only to server infrastructure");
      if (name==="better-auth" || name.startsWith("better-auth/")) requireContract(path.startsWith("lib/auth/"), "Provider SDK belongs only to the auth adapter");
    }
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const name = node.moduleSpecifier?.text;
        nativeBoundary(name,ts.isImportDeclaration(node)?node.importClause?.isTypeOnly:node.isTypeOnly);
        requireContract(!name?.includes("scripts/ops") && !name?.includes("scripts/privacy-"), "Ops tooling imported by runtime");
        requireContract(!exception.chain.some((pkg) => name === pkg || name?.startsWith(`${pkg}/`)), "Dev advisory chain imported by runtime");
      }
      if (ts.isCallExpression(node) && ["require", "import"].includes(node.expression.getText(source))) {
        const name = node.arguments[0]?.text;
        nativeBoundary(name);
        requireContract(!name?.includes("scripts/ops") && !name?.includes("scripts/privacy-"), "Ops tooling imported by runtime");
        requireContract(!exception.chain.some((pkg) => name === pkg || name?.startsWith(`${pkg}/`)), "Dev advisory chain imported by runtime");
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  if (/^(?:tests\/.*\.[cm]?[jt]sx?|scripts\/.*\.test\.mjs)$/.test(path)) checkTestIntegrity(path, text);
}

export function checkWorkflow(text) {
  const workflow = yaml.load(text);
  requireContract(JSON.stringify(workflow.permissions) === JSON.stringify({ contents: "read" }), "CI permissions must be contents: read only");
  requireContract(Object.keys(workflow.on).sort().join() === "pull_request,push"
    && JSON.stringify(workflow.on.push.branches) === JSON.stringify(["main", "release/**"])
    && workflow.on.pull_request === null, "CI trigger contract changed");
  requireContract(workflow.concurrency?.group === "ci-${{ github.ref }}" && workflow.concurrency["cancel-in-progress"] === true, "Missing ref concurrency");
  requireContract(Object.keys(workflow.jobs).join() === "validate,native-linux-artifact", "Unexpected CI job");
  const job = workflow.jobs.validate;
  requireContract(job["runs-on"] === "ubuntu-24.04" && job["timeout-minutes"] === 20
    && !job.permissions && !job.environment && !job.container, "Unexpected CI job authority/runtime");
  const actions = job.steps.filter((step) => step.uses);
  requireContract(actions.length === 2
    && actions[0].uses === "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803"
    && actions[0].with["persist-credentials"] === false && actions[0].with["fetch-depth"] === 2
    && actions[1].uses === "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38"
    && actions[1].with["node-version"] === "24.x" && actions[1].with.cache === "npm"
    && actions[1].with["cache-dependency-path"] === "package-lock.json", "Action pin/cache contract changed");
  requireContract(!/secrets\.|pull_request_target|npm install|--prod|continue-on-error|\|\|\s*true/.test(text), "Unsafe CI escape/credential/deployment");
  const runs = job.steps.filter((step) => step.run).map((step) => step.run.trim());
  requireContract(JSON.stringify(runs) === JSON.stringify([
    "npm ci", "node --test scripts/ci-policy.test.mjs", "node scripts/ci-checks.mjs",
    "npm audit --omit=dev --audit-level=high", "node scripts/ci-audit.mjs",
    "node node_modules/next/dist/bin/next typegen\nnode node_modules/typescript/bin/tsc --noEmit --incremental false",
    "npm run lint", "npm run test:run", "npm run build", "git diff --exit-code",
  ]), "Validation stages changed");
  for (const step of job.steps.filter((step) => /typegen|test:run|run build/.test(step.run ?? ""))) {
    requireContract(step.env?.NODE_OPTIONS === "--import=${{ github.workspace }}/scripts/ci-offline.mjs", "Missing offline network guard");
  }
  requireContract(job.steps.find(step => step.run === "npm run build")?.env?.BACKEND_PROVIDER === "supabase", "Missing explicit offline build provider");
  const artifact = workflow.jobs['native-linux-artifact'];
  requireContract(artifact.needs === 'validate'
    && artifact.if === "github.event_name == 'push' && github.ref == 'refs/heads/release/v1-hardening'"
    && artifact['runs-on'] === 'ubuntu-24.04' && artifact['timeout-minutes'] === 20
    && JSON.stringify(artifact.permissions) === JSON.stringify({contents:'read'})
    && !artifact.environment && !artifact.container, 'Unsafe native artifact job authority/trigger');
  const artifactActions = artifact.steps.filter(step => step.uses);
  requireContract(artifactActions.length === 3
    && JSON.stringify(artifactActions[0]) === JSON.stringify(actions[0])
    && artifactActions[1].uses === actions[1].uses && artifactActions[1].with['node-version'] === '24.21.0'
    && artifactActions[1].with.cache === 'npm' && artifactActions[1].with['cache-dependency-path'] === 'package-lock.json'
    && artifactActions[2].uses === 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'
    && artifactActions[2].with['retention-days'] === 7 && artifactActions[2].with['if-no-files-found'] === 'error',
    'Native artifact action pin/retention contract');
  const build = artifact.steps.find(step => step.run?.includes('npm run build'));
  requireContract(build?.env?.BACKEND_PROVIDER === 'native'
    && build.env.NODE_OPTIONS === '--import=${{ github.workspace }}/scripts/ci-offline.mjs'
    && build.run.includes('validateReleaseEnvironment') && build.run.includes("'PRODUCTION'")
    && build.run.includes('node scripts/native-package.mjs create "$package"')
    && build.run.includes('node scripts/native-package.mjs verify "$package"')
    && build.run.includes('node scripts/native-artifact-check.mjs "$package"'), 'Native artifact build/verification contract');
  requireContract(artifact.steps.some(step => step.run === 'npm ci')
    && artifact.steps.some(step => step.run === 'node scripts/ci-checks.mjs --environment-only')
    && artifact.steps.some(step => step.run?.includes('tar -czf') && step.run.includes('-C "$package" .') && step.run.includes('sha256sum')),
    'Native artifact install/archive contract');
}

function git(...args) {
  return execFileSync("git", ["-c", `safe.directory=${process.cwd().replace(/\\/g, "/")}`, ...args], { encoding: "utf8" });
}

export function checkEnvironment(names, environment) {
  requireContract(names.every((name) => !/^\.env(?:\.|$)/.test(name) || name === ".env.example"),
    "Use a clean checkout without local env files for CI validation");
  requireContract(Object.keys(environment).every((name) => !/^(?:SUPABASE_|NEXT_PUBLIC_SUPABASE_|D8_STAGING_|RATE_LIMIT_|D7_|D6_PROVIDER_LIVE_SMOKE|AI_SERVER_|MEDIA_TRACKER_|OPENAI_|GROQ_|GEMINI_|OPENROUTER_|TMDB_|OMDB_|DATABASE_|PG|BETTER_AUTH_|BACKEND_PROVIDER|NEXT_PUBLIC_BACKEND_PROVIDER|VERCEL_TOKEN|PRIVACY_(?!TEST_BASELINE_REPO$)|MEDIATRACKER_DR_)/.test(name)),
    "Unexpected application/live/credential environment in CI validation");
}

function main() {
  requireContract(process.argv.slice(2).every((arg) => ["--repository-only", "--environment-only"].includes(arg)), "Unknown CI check option");
  if (process.argv.includes("--environment-only")) {
    checkEnvironment(readdirSync("."), process.env);
    console.log("PASS: clean credential-free validation environment");
    return;
  }
  requireContract(process.versions.node.split(".")[0] === "24", "Node 24.x required");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  requireContract(pkg.engines.node === "24.x" && lock.lockfileVersion === 3
    && lock.packages[""].engines.node === "24.x" && pkg.dependencies.next === "16.3.8"
    && lock.packages["node_modules/next"].version === "16.3.8", "Node/Next/lock baseline changed; review CI contract");
  const npmVersion = execFileSync(process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32" ? ["/d", "/s", "/c", "npm --version"] : ["--version"], { encoding: "utf8" }).trim();
  requireContract(npmVersion.split(".")[0] === "11", "npm 11.x required");
  console.log(`Node ${process.versions.node}; npm ${npmVersion}; lockfile v3`);
  // Include untracked source additions during local review; CI uses committed source only.
  const paths = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  requireContract(paths.includes("package-lock.json"), "Lockfile must be tracked");
  for (const path of paths) {
    const buffer = readFileSync(path);
    checkFile(path, buffer.includes(0) ? "" : buffer.toString("utf8"));
  }
  git("diff", "--check", "HEAD");
  git("diff", "--cached", "--check");
  if (process.env.GITHUB_ACTIONS === "true") git("diff", "--check", "HEAD^", "HEAD");
  checkWorkflow(readFileSync(".github/workflows/ci.yml", "utf8"));
  checkMigrations(readdirSync("supabase/migrations"), (name) => readFileSync(`supabase/migrations/${name}`, "utf8"),
    migrationDocs.map((path) => readFileSync(path, "utf8")));
  checkOperationalSources();
  // CI must not inherit local credentials/flags or let Next load populated local env files.
  if (!process.argv.includes("--repository-only")) checkEnvironment(readdirSync("."), process.env);
  console.log("PASS: workflow, hygiene, test integrity, runtime dependency boundary, migrations");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
