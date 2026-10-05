import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanupPlan, cleanupSynthetic, retentionClasses, retentionFixture, retentionInventory, main } from "../scripts/privacy-retention-ops.mjs";
import { domains } from "../scripts/privacy-account-model.mjs";
const policy = { cutoff: "2026-10-05T00:00:00.000Z", now: "2026-10-05T00:00:00.000Z", batchSize: 1 };
test("all account/ownerless/private/vendor/device categories have valid retention classes; no active-content cleanup", () => {
  for (const [table, value] of Object.entries(retentionInventory)) {
    assert.ok(retentionClasses.includes(value.class), table);
    if (domains[table]) assert.equal(value.automaticCleanup, false, table);
  }
  assert.equal(Object.keys(retentionInventory).length, 50);
  assert.equal(retentionInventory.mailbox.automaticCleanup, false);
});
test("cutoff preview is expiry-based and shared batch budget bounds both security tables", () => {
  const plan = cleanupPlan(retentionFixture(), policy);
  assert.equal(plan.rowCount, 1);
  assert.deepEqual(plan.selected, { buckets: ["expired-bucket"], receipts: [] });
  assert.deepEqual(plan.eligibleCounts, { buckets: 1, receipts: 1 });
  assert.equal(plan.authDeletion, false);
});
test("dry-run and execute-without-flag are read-only; destructive confirmation is required", () => {
  const state = retentionFixture(); const before = structuredClone(state);
  const report = cleanupSynthetic(state, policy);
  assert.equal(report.executed, false); assert.deepEqual(state, before);
  assert.throws(() => cleanupSynthetic(state, { ...policy, execute: true }));
  assert.deepEqual(state, before);
});
test("bounded batches can stop/retry; repeated cleanup cannot delete unexpired records or Auth", () => {
  let state = retentionFixture();
  for (const expected of [1, 1, 0]) {
    const report = cleanupSynthetic(state, { ...policy, execute: true, confirmation: "CLEANUP SYNTHETIC EXPIRED SECURITY" });
    assert.equal(report.removed, expected); state = report.state;
    assert.equal(report.authDeletion, false);
  }
  assert.deepEqual(state.buckets.map((r) => r.key), ["active-bucket"]);
  assert.deepEqual(state.receipts.map((r) => r.key), ["active-receipt"]);
});
test("future cutoff, malformed timestamps, out-of-bound batches and active-content state are refused", () => {
  for (const batchSize of [0, -1, 501, 1.5, NaN]) assert.throws(() => cleanupPlan(retentionFixture(), { ...policy, batchSize }));
  assert.throws(() => cleanupPlan(retentionFixture(), { ...policy, cutoff: "2099-01-01" }));
  assert.throws(() => cleanupPlan(retentionFixture(), { ...policy, cutoff: "invalid" }));
  assert.throws(() => cleanupPlan({ ...retentionFixture(), media_items: [] }, policy));
  assert.throws(() => cleanupPlan({ buckets: [{ key: "bad", expires_at: "invalid" }], receipts: [] }, policy));
});
test("physical SQL cleanup already exists and is bounded; final reserve fix uses it", () => {
  const sql = readFileSync("supabase/migrations/20261004120000_application_rate_limit_v1.sql", "utf8");
  assert.match(sql, /create function private_rate_limit\.cleanup_v1/);
  assert.match(sql, /least\(500,greatest\(0,coalesce\(p_batch,0\)\)\)/);
  assert.match(sql, /expires_at<=v_now/);
  assert.match(sql, /live_rows=live_rows-v_n/);
  const final = readFileSync("supabase/migrations/20261004124000_application_rate_limit_reserve_alias_fix_v1.sql", "utf8");
  assert.match(final, /perform private_rate_limit\.cleanup_v1\(500\)/);
  assert.match(final, /interval '60 seconds'/); assert.match(final, /interval '16 minutes'/);
});
test("CLI execution needs both explicit mode/flag; remote targets are refused", async () => {
  const args = ["--source", "synthetic", "--environment", "synthetic", "--supabase-url", "http://127.0.0.1:54321", "--fingerprint", "mediatracker-privacy-fixture-v1", "--mode", "execute"];
  assert.equal((await main(args)).executed, false);
  await assert.rejects(main([...args, "--execute"]));
  assert.equal((await main([...args, "--execute", "--confirm", "CLEANUP SYNTHETIC EXPIRED SECURITY"])).executed, true);
  await assert.rejects(main(args.map((arg) => arg === "synthetic" ? "production" : arg)));
});
