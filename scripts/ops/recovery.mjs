// Ops-only: no application imports, env loading, linked project or remote URL.
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const hash = (input) => createHash("sha256").update(input).digest("hex");
export const schemas = ["public", "private_rate_limit", "private_privacy_ops", "supabase_migrations"];
export const exclusions = ["Managed Auth credentials/users require a separately supported recovery process",
  "Storage metadata/binaries require separate verified export and restore",
  "Vault secrets must be reprovisioned separately; never embed them in a manifest",
  "Managed extensions/roles/platform metadata are prerequisites, not automatically restored",
  "Vendor logs, Vercel settings/secrets, browser copies and portable downloads are outside this package",
  "Quarantine and erased-person reconciliation are mandatory before any service reopening"];
const hex = /^[a-f0-9]{64}$/;
const migrationName = /^\d{14}_[a-z0-9_]+\.sql$/;
export function requireSafe(condition) { if (!condition) throw new Error("Operational safety/integrity contract refused"); }

export function classification(name) {
  if (/owner_scoped_primary|progress_log_relation_repair/.test(name)) return ["NON_ADDITIVE", "SECURITY_CRITICAL"];
  if (/privacy|participant_detachment|release_write_containment/.test(name)) return ["NON_ADDITIVE", "PRIVACY_CRITICAL", "SECURITY_CRITICAL"];
  if (/application_rate_limit/.test(name)) return ["ADDITIVE_WITH_RUNTIME_DEPENDENCY", "SECURITY_CRITICAL"];
  if (/security_advisor|visibility|protected/.test(name)) return ["ADDITIVE_WITH_RUNTIME_DEPENDENCY", "SECURITY_CRITICAL"];
  return ["ADDITIVE_WITH_RUNTIME_DEPENDENCY"];
}
export function migrationManifest(repository = root) {
  const names = readdirSync(path.join(repository, "supabase/migrations")).sort();
  const seen = new Set();
  return names.map((name, index) => {
    requireSafe(migrationName.test(name) && !seen.has(name.slice(0, 14)));
    seen.add(name.slice(0, 14));
    const version = name.slice(0, 14);
    const date = new Date(`${version.slice(0,4)}-${version.slice(4,6)}-${version.slice(6,8)}T${version.slice(8,10)}:${version.slice(10,12)}:${version.slice(12,14)}Z`);
    requireSafe(Number.isFinite(date.getTime()) && date.toISOString().replace(/\D/g, "").slice(0,14) === version);
    return { path: `supabase/migrations/${name}`, version,
      sha256LF: hash(readFileSync(path.join(repository, "supabase/migrations", name), "utf8").replace(/\r\n/g,"\n")),
      purpose: name.slice(15,-4).replaceAll("_", " "), classification: classification(name),
      dependency: index ? names[index-1].slice(0,14) : "platform prerequisites",
      precondition: "Ledger is an exact ordered prefix; inspect prerequisite definitions, grants and data invariants",
      failureSignal: "SQL error, drift, lock budget exceeded or failed owner/privacy postcheck",
      rollback: "Transaction abort before commit; after commit no blind down migration",
      failForward: /privacy|participant/.test(name) ? "Keep erasure locks and reconcile erased identities; reviewed forward fix only"
        : "Contain affected writes; capture definitions/ACLs; reviewed append-only repair",
      maintenance: /primary|privacy|participant|release_write_containment/.test(name) ? "Full affected-write freeze required" : "Affected subsystem containment required" };
  });
}
export function sourceSha(repository = root) {
  const sha = execFileSync("git", ["-c", `safe.directory=${repository.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  requireSafe(/^[a-f0-9]{40}$/.test(sha)); return sha;
}
export function assertTarget(options) {
  // Explicit classification + cryptographic identity, never a URL or a project ref.
  requireSafe(options.environment === "disposable" && hex.test(options.fingerprint ?? ""));
  requireSafe(!options.productionFingerprint || options.fingerprint !== options.productionFingerprint);
  requireSafe(!options.stagingFingerprint || options.fingerprint !== options.stagingFingerprint);
}
export function outsideOutput(output, repository = root) {
  const full = path.resolve(output);
  const parent = realpathSync(path.dirname(full));
  const actual = path.join(parent, path.basename(full));
  const repo = realpathSync(repository);
  const relative = path.relative(repo, actual);
  requireSafe(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
  requireSafe(!["", ".", ".."].includes(path.basename(full)));
  // mkdir without recursive/exist-ok refuses reuse and overwrite atomically.
  return actual;
}
export function keyBytes(key) { requireSafe(hex.test(key ?? "")); return Buffer.from(key, "hex"); }
export function encrypt(bytes, key) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  return Buffer.concat([Buffer.from("MTDR1"), iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
}
export function decrypt(bytes, key) {
  requireSafe(bytes.length >= 33 && bytes.subarray(0,5).toString() === "MTDR1");
  try {
    const cipher = createDecipheriv("aes-256-gcm", keyBytes(key), bytes.subarray(5,17));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(17,-16)), cipher.final()]);
  } catch { throw new Error("Encrypted artifact authentication failed"); }
}
export function artifactFile(directory, name) {
  requireSafe(typeof name === "string" && /^[a-zA-Z0-9._/-]+$/.test(name)
    && !name.includes("\\") && !path.posix.isAbsolute(name)
    && name.split("/").every((part) => part && part !== "." && part !== ".."));
  const base = realpathSync(directory);
  let current = base;
  for (const part of name.split("/")) {
    current = path.join(current, part);
    requireSafe(!lstatSync(current).isSymbolicLink());
  }
  requireSafe(lstatSync(current).isFile()); return current;
}
export function verifyPackage(directory, expectedManifestHash) {
  // Digest must arrive through independent trusted evidence; adjacent digest is not authenticity.
  requireSafe(hex.test(expectedManifestHash ?? ""));
  const bytes = readFileSync(artifactFile(directory, "manifest.json"));
  requireSafe(hash(bytes) === expectedManifestHash);
  const m = JSON.parse(bytes);
  requireSafe(m.format === "mediatracker-recovery" && m.version === 1
    && /^[a-f0-9]{40}$/.test(m.sourceCommit) && m.sourceState === "working-tree-source"
    && Number.isFinite(Date.parse(m.generatedAt)) && m.target?.classification === "disposable"
    && hex.test(m.target.fingerprint) && m.encryption === "AES-256-GCM"
    && Array.isArray(m.artifacts) && m.artifacts.length >= 3
    && Array.isArray(m.migrations) && Array.isArray(m.exclusions) && m.exclusions.length >= exclusions.length);
  const paths = new Set();
  for (const a of m.artifacts) {
    requireSafe(!paths.has(a.path.toLowerCase()) && Number.isSafeInteger(a.bytes) && a.bytes > 0 && hex.test(a.sha256));
    paths.add(a.path.toLowerCase());
    const b = readFileSync(artifactFile(directory, a.path));
    requireSafe(b.length === a.bytes && hash(b) === a.sha256);
  }
  for (const required of ["database.dump.aes", "source-verification.json.aes", "roles.json.aes"]) requireSafe(paths.has(required));
  requireSafe(m.migrations.length > 0 && m.migrations.every((entry,index) => migrationName.test(path.posix.basename(entry.path))
    && entry.version === path.posix.basename(entry.path).slice(0,14) && hex.test(entry.sha256LF)
    && (index === 0 || entry.version > m.migrations[index-1].version)));
  requireSafe(!/(?:postgres(?:ql)?:\/\/|service_role_key|access_token|password|project_ref)\s*["=:]/i.test(bytes.toString()));
  return m;
}
export const restoreOrder = ["target-proof", "integrity", "empty-target", "roles-auth-extensions-prerequisites",
  "pre-data", "data", "post-data", "managed-privacy-bindings", "database-verification", "storage-manual", "owner-rls-smoke-manual", "privacy-reconciliation-manual", "application-smoke-manual"];
export function verifyDatabase(expected, actual, migrations) {
  requireSafe(expected && actual && typeof actual === "object");
  requireSafe(Array.isArray(actual.ledger) && actual.ledger.join() === migrations.map(m => m.version).join());
  requireSafe(Array.isArray(actual.tables) && ["media_items", "profiles", "progress_logs", "goals"]
    .every(name => actual.tables.some(t => t.schema === "public" && t.name === name && t.rls === true
      && t.constraints?.some(c => c[1] === "p" && c[3] === true)
      && ["a_privacy_row","a_privacy_statement"].every(trigger => t.triggers?.some(tg => tg[0] === trigger && tg[1] === "O")))));
  requireSafe(actual.tables.find(t => t.schema === "public" && t.name === "progress_logs")?.constraints?.some(c => c[1] === "f" && c[3] === true));
  requireSafe(actual.tables.some(t => t.schema === "private_privacy_ops" && t.name === "account_lifecycle")
    && actual.tables.some(t => t.schema === "private_rate_limit" && t.name === "buckets"));
  requireSafe(Array.isArray(actual.functions) && ["assert_account_write_allowed", "consume_application_rate_limit_v1"]
    .every(name => actual.functions.some(f => f.name === name)));
  requireSafe(actual.unsafePrivateGrants === false);
  requireSafe(Array.isArray(actual.managedBindings) && actual.managedBindings.length === (migrations.some(m => m.version === "20261006120000") ? 5 : 2)
    && actual.managedBindings.some(s => s.includes("privacy_initialize_account") && s.includes("auth.users"))
    && actual.managedBindings.some(s => s.includes("a_privacy_storage") && s.includes("storage.objects")));
  if (migrations.some(m => m.version === "20261006120000")) requireSafe(
    actual.managedBindings.some(s => s.includes("a_release_auth") && s.includes("auth.users"))
    && actual.managedBindings.some(s => s.includes("a_release_storage") && s.includes("storage.objects"))
    && actual.managedBindings.some(s => s.includes("a_release_storage_truncate") && s.includes("storage.objects")));
  // Sorted catalog projection includes columns, constraints, triggers, policies,
  // function definition hashes, table/function ACLs, roles, row counts/digests.
  requireSafe(JSON.stringify(actual) === JSON.stringify(expected));
  return { database: "DB_RESTORE_VERIFIED", disasterRecovery: "LIVE_UNVERIFIED",
    remaining: restoreOrder.slice(9) };
}
export function createPackage({ output, key, fingerprint, database, verification, roles, versions, repository = root }) {
  assertTarget({environment: "disposable", fingerprint}); keyBytes(key);
  const destination = outsideOutput(output, repository);
  const migrations = migrationManifest(repository);
  verifyDatabase(verification, verification, migrations);
  requireSafe(Buffer.isBuffer(database) && database.subarray(0,5).toString() === "PGDMP");
  requireSafe(Array.isArray(roles) && roles.every(role => typeof role === "string" && /^[a-zA-Z0-9_]+$/.test(role)));
  requireSafe(versions && Object.keys(versions).sort().join() === "pg_dump,pg_restore,psql"
    && Object.values(versions).every(v => /^\d+\.\d+(?:\.\d+)?$/.test(v)));
  mkdirSync(destination, {mode: 0o700});
  const artifacts = [];
  const add = (name, bytes, encrypted = true) => {
    requireSafe(bytes.length > 0);
    const saved = encrypted ? encrypt(bytes, key) : bytes;
    writeFileSync(path.join(destination, name), saved, {flag: "wx", mode: 0o600});
    artifacts.push({path: name, bytes: saved.length, sha256: hash(saved)});
  };
  add("database.dump.aes", database);
  add("source-verification.json.aes", Buffer.from(JSON.stringify(verification)));
  add("roles.json.aes", Buffer.from(JSON.stringify(roles)));
  mkdirSync(path.join(destination,"migrations"));
  for (const m of migrations) add(`migrations/${path.basename(m.path)}`, readFileSync(path.join(repository,m.path)), false);
  mkdirSync(path.join(destination,"operations"));
  for (const part of ["06A_BACKUP_AND_RESTORE", "06B_INCIDENT_AND_RECOVERY", "06C_MONITORING_AND_ALERTS", "06D_RELEASE_OPERATIONS", "06E_OPERATIONAL_RELEASE_GATE"]) {
    const name = `V1_HARDENING_${part}.md`;
    add(`operations/${name}`, readFileSync(path.join(repository,"docs",name)), false);
  }
  const manifest = {format: "mediatracker-recovery", version: 1, generatedAt: new Date().toISOString(),
    sourceCommit: sourceSha(repository), sourceState: "working-tree-source", target: {classification:"disposable",fingerprint},
    encryption:"AES-256-GCM", tools: versions, artifacts, migrations,
    storage: {status:"LIVE_UNVERIFIED", objectsIncluded:0, binariesIncluded:0}, exclusions};
  const bytes = Buffer.from(JSON.stringify(manifest,null,2)+"\n");
  writeFileSync(path.join(destination,"manifest.json"),bytes,{flag:"wx",mode:0o600});
  return {status:"PACKAGE_CREATED", manifestSha256: hash(bytes), artifacts:artifacts.length,
    disasterRecovery:"LIVE_UNVERIFIED"};
}
export async function rehearse({directory, manifestHash, options, key, adapter}) {
  assertTarget(options);
  const manifest = verifyPackage(directory, manifestHash);
  if (!options.execute) return {status:"PLAN_ONLY", order:restoreOrder, exclusions:manifest.exclusions};
  requireSafe(options.acknowledgeTrustedBackup === true && options.acknowledgeQuarantine === true);
  const expected = JSON.parse(decrypt(readFileSync(artifactFile(directory,"source-verification.json.aes")),key));
  const roles = JSON.parse(decrypt(readFileSync(artifactFile(directory,"roles.json.aes")),key));
  const dump = decrypt(readFileSync(artifactFile(directory,"database.dump.aes")),key);
  requireSafe(dump.subarray(0,5).toString() === "PGDMP");
  verifyDatabase(expected, expected, manifest.migrations);
  await adapter.prove(options.fingerprint); // Must be positively proven BEFORE DB access.
  const prerequisites = await adapter.prerequisites();
  requireSafe(prerequisites.empty === true && prerequisites.authIdentityHash === expected.authIdentityHash
    && JSON.stringify(prerequisites.roles) === JSON.stringify(roles)
    && JSON.stringify(prerequisites.roleConfiguration) === JSON.stringify(expected.roleConfiguration)
    && JSON.stringify(prerequisites.memberships) === JSON.stringify(expected.memberships)
    && JSON.stringify(prerequisites.extensions) === JSON.stringify(expected.extensions));
  for (const section of ["pre-data", "data", "post-data"]) await adapter.restore(section,dump);
  await adapter.restoreBindings(expected.managedBindings);
  return verifyDatabase(expected,await adapter.inspect(),manifest.migrations);
}
