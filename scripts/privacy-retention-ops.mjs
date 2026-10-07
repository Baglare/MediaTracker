// Ops-only synthetic proof of the existing limiter cleanup eligibility/budget.
// The SQL implementation remains private_rate_limit.cleanup_v1; no scheduler.
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { domains, ownerlessTables } from "./privacy-account-model.mjs";
import { parseOptions, requireSyntheticTarget } from "./privacy-account-ops.mjs";

export const retentionClasses = Object.freeze(["USER_CONTROLLED", "ACCOUNT_LIFETIME", "FEATURE_LIFETIME", "SHORT_OPERATIONAL_TTL", "SECURITY_TTL", "SOFT_DELETE_GRACE", "LEGAL_HOLD_OR_REVIEW", "VENDOR_CONTROLLED", "UNKNOWN"]);
export const retentionInventory = Object.freeze({
  ...Object.fromEntries(Object.keys(domains).map((table) => [table, {
    class: "ACCOUNT_LIFETIME", automaticCleanup: false,
    rationale: /sync_operations|xp_|username_history/.test(table) ? "Preserve replay/revision/dedupe and account integrity; erase only in approved account lifecycle" : "No arbitrary active-content age purge; user/account/feature lifecycle",
  }])),
  ...Object.fromEntries(ownerlessTables.map((table) => [table, { class: table === "embedding_cache" ? "UNKNOWN" : "FEATURE_LIFETIME", automaticCleanup: false }])),
  "private_rate_limit.buckets": { class: "SECURITY_TTL", automaticCleanup: true },
  "private_rate_limit.request_receipts": { class: "SHORT_OPERATIONAL_TTL", automaticCleanup: true },
  "private_rate_limit.policies": { class: "FEATURE_LIFETIME", automaticCleanup: false },
  "private_rate_limit.capacity": { class: "FEATURE_LIFETIME", automaticCleanup: false },
  "private_rate_limit.global_state": { class: "FEATURE_LIFETIME", automaticCleanup: false },
  "private_rate_limit.secret_refs": { class: "LEGAL_HOLD_OR_REVIEW", automaticCleanup: false },
  "private_privacy_ops.xp_cleanup_context": { class: "SHORT_OPERATIONAL_TTL", automaticCleanup: false, rationale: "Candidate transaction context; helper deletes it before return, failure rolls back insertion; no scheduler" },
  "private_privacy_ops.xp_detach_context": { class: "SHORT_OPERATIONAL_TTL", automaticCleanup: false, rationale: "Transaction-only detachment context; explicit delete before return or rollback; no legal period" },
  "private_privacy_ops.account_lifecycle": { class: "ACCOUNT_LIFETIME", automaticCleanup: false, rationale: "Fail-closed lifecycle, erasure context and stage state; Auth deletion cascade after verified cleanup" },
  "private_privacy_ops.release_write_state": { class: "FEATURE_LIFETIME", automaticCleanup: false, rationale: "Global singleton control/revision, no account content; no age purge" },
  browser: { class: "USER_CONTROLLED", automaticCleanup: false },
  recovery: { class: "LEGAL_HOLD_OR_REVIEW", automaticCleanup: false },
  mailbox: { class: "LEGAL_HOLD_OR_REVIEW", automaticCleanup: false },
  vendors: { class: "VENDOR_CONTROLLED", automaticCleanup: false },
});

export function checkRetentionCompleteness(repository = process.cwd()) {
  const created = new Set();
  for (const file of readdirSync(path.join(repository,"supabase/migrations")).filter(n => n.endsWith(".sql"))) {
    const sql = readFileSync(path.join(repository,"supabase/migrations",file),"utf8").replace(/--[^\n]*|\/\*[\s\S]*?\*\//g," ");
    for (const match of sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][\w]*)\.([a-z_][\w]*)/gi)) {
      const [,schema,table]=match;
      created.add(schema.toLowerCase()==="public" ? table.toLowerCase() : `${schema.toLowerCase()}.${table.toLowerCase()}`);
    }
  }
  const missing=[...created].filter(table => !Object.hasOwn(retentionInventory,table)).sort();
  if (missing.length) throw new Error(`Unclassified source tables: ${missing.join(",")}`);
  return {createdTables:[...created].sort(),classification:"SOURCE_ONLY"};
}

export function retentionFixture() {
  return { buckets: [
    { key: "expired-bucket", expires_at: "2026-10-01T00:00:00.000Z" },
    { key: "active-bucket", expires_at: "2099-01-01T00:00:00.000Z" },
  ], receipts: [
    { key: "expired-receipt", expires_at: "2026-10-01T00:00:00.000Z" },
    { key: "active-receipt", expires_at: "2099-01-01T00:00:00.000Z" },
  ] };
}
export function cleanupPlan(state, { cutoff, now, batchSize = 100 } = {}) {
  const cutoffMs = Date.parse(cutoff); const nowMs = Date.parse(now);
  if (!Number.isFinite(cutoffMs) || !Number.isFinite(nowMs) || cutoffMs > nowMs
    || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Safe cutoff and batch 1..500 required");
  if (Object.keys(state).some((key) => !["buckets", "receipts"].includes(key))) throw new Error("Active/user content cannot enter cleanup");
  const selected = {}; const eligibleCounts = {}; let remaining = batchSize;
  for (const table of ["buckets", "receipts"]) {
    if (!Array.isArray(state[table]) || state[table].some((r) => !Number.isFinite(Date.parse(r.expires_at)))) throw new Error("Invalid security expiry data");
    const eligible = state[table].filter((r) => Date.parse(r.expires_at) <= cutoffMs).sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.key.localeCompare(b.key));
    eligibleCounts[table] = eligible.length;
    selected[table] = eligible.slice(0, remaining).map((r) => r.key);
    remaining -= selected[table].length;
  }
  return { dryRun: true, cutoff, batchSize, eligibleCounts, selected, rowCount: batchSize - remaining, authDeletion: false };
}
export function cleanupSynthetic(state, options) {
  const plan = cleanupPlan(state, options);
  if (!options.execute) return { executed: false, plan, state: structuredClone(state) };
  if (options.confirmation !== "CLEANUP SYNTHETIC EXPIRED SECURITY") throw new Error("Explicit cleanup confirmation required");
  const after = structuredClone(state);
  for (const table of ["buckets", "receipts"]) after[table] = after[table].filter((r) => !plan.selected[table].includes(r.key));
  const remaining = cleanupPlan(after, options);
  return { executed: true, state: after, stages: [{ stage: "bounded-expired-security-cleanup", status: "PASS" }],
    removed: plan.rowCount, remainingEligible: remaining.eligibleCounts, moreWork: Object.values(remaining.eligibleCounts).some((n) => n > 0), authDeletion: false };
}
export async function main(argv) {
  const options = parseOptions(argv); requireSyntheticTarget(options);
  if (!["inspect", "plan", "execute", "verify"].includes(options.mode)) throw new Error("Explicit retention mode required");
  if (options.execute && options.mode !== "execute") throw new Error("Execute flag only valid in execute mode");
  const now = new Date().toISOString();
  const policy = { cutoff: options.cutoff ?? now, now, batchSize: options["batch-size"] ? Number(options["batch-size"]) : 100,
    execute: options.execute === true, confirmation: options.confirm };
  if (options.mode === "inspect") return { inventory: retentionInventory, plan: cleanupPlan(retentionFixture(), policy) };
  if (options.mode === "execute") return cleanupSynthetic(retentionFixture(), policy);
  const plan = cleanupPlan(retentionFixture(), policy);
  return options.mode === "verify" ? { physicalEligibleRowsRemaining: plan.eligibleCounts, noLiveVerification: true } : plan;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch(() => { console.error("Retention ops refused/failed; only bundled synthetic expired security state supported."); process.exitCode = 1; });
}
