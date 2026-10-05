import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { accountExport, domains, erasePlan, isOwnedAsset, ownerlessTables, resolveIdentity, runErasure, syntheticAdapter, verifyErasure } from "../scripts/privacy-account-model.mjs";
import { fixture, USER_A, USER_B } from "../scripts/privacy-synthetic-fixture.mjs";
import { main, parseOptions, requireSyntheticTarget } from "../scripts/privacy-account-ops.mjs";
const generated = "2026-10-05T00:00:00.000Z";
const target = { source: "synthetic", environment: "synthetic", fingerprint: "mediatracker-privacy-fixture-v1", "supabase-url": "http://127.0.0.1:54321" };
const execution = { execute: true, confirmation: `ERASE SYNTHETIC ${USER_A}`, acceptParticipantLoss: true };

test("every public table in ordered migrations is explicitly classified", () => {
  const names = new Set();
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))) {
    for (const match of readFileSync(`supabase/migrations/${file}`, "utf8").matchAll(/create table (?:if not exists )?public\.(\w+)/gi)) names.add(match[1]);
  }
  assert.deepEqual([...names].sort(), [...Object.keys(domains), ...ownerlessTables].sort());
});
test("export A spans owned domains, permitted participants, calendar and themes; B private data and Auth secrets absent", () => {
  const source = fixture();
  const exported = accountExport(source, USER_A, "a@example.invalid", generated);
  assert.equal(exported.format, "MediaTrackerAccountPrivacyExport");
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.sourceCategories.length, 36);
  for (const table of Object.keys(domains)) assert.ok(exported.categories[table].length, table);
  assert.equal(exported.categories.social_recommendation_messages[0].body, "Visible B reply");
  assert.equal(exported.categories.social_recommendation_events[0].actor_id, USER_B);
  const encoded = JSON.stringify(exported);
  for (const excluded of ["B private notes", "B hidden message", "b@example.invalid", "not-exported", "private_profile", "access_token", "safe_metadata", "safe_payload"]) assert.ok(!encoded.includes(excluded), excluded);
  assert.match(encoded, /manualCalendar/);
  assert.match(encoded, /Synthetic theme/);
  assert.match(encoded, /#101010/);
  assert.equal(exported.assets.length, 1);
  assert.equal(exported.assets[0].size, 64);
  assert.ok(exported.warnings.some((w) => w.includes("Binary assets")));
  assert.deepEqual(exported, accountExport(source, USER_A, "a@example.invalid", generated));
});
test("unknown fields, nested credential keys and signed URLs cannot enter account export", () => {
  const source = fixture();
  source.tables.profiles[0].admin_secret = "sensitive";
  source.tables.media_items[0].cover_url = "https://example.invalid/asset?token=credential";
  source.tables.media_items[0].metadata.deep = { password_hash: "sensitive", safe: "public" };
  const encoded = JSON.stringify(accountExport(source, USER_A, "a@example.invalid", generated));
  assert.ok(!encoded.includes("sensitive")); assert.ok(!encoded.includes("credential"));
  assert.match(encoded, /REDACTED/); assert.match(encoded, /public/);
});
test("exact registered email plus UUID requires unique identity", () => {
  const source = fixture();
  assert.throws(() => resolveIdentity(source, USER_A, "a"));
  assert.throws(() => resolveIdentity(source, USER_B, "a@example.invalid"));
  source.auth.push({ id: USER_B, email: "A@example.invalid" });
  assert.throws(() => resolveIdentity(source, USER_A, "a@example.invalid"));
});
test("missing source category and newly introduced table fail closed", () => {
  const source = fixture(); delete source.tables.goals;
  assert.throws(() => accountExport(source, USER_A, "a@example.invalid", generated));
  const changed = fixture(); changed.tables.new_private_table = [];
  assert.throws(() => erasePlan(changed, USER_A));
});
test("Storage boundaries reject traversal, encoded separators, other buckets and neighbouring prefixes", () => {
  for (const name of [`${USER_A}/../b.png`, `${USER_A}/%2f/b.png`, `${USER_A}x/b.png`, `${USER_A}/a\\b.png`, `${USER_B}/a.png`]) assert.equal(isOwnedAsset({ bucket: "profile-assets", name }, USER_A), false);
  assert.equal(isOwnedAsset({ bucket: "other", name: `${USER_A}/a.png` }, USER_A), false);
  assert.equal(isOwnedAsset({ bucket: "profile-assets", name: `${USER_A}/a.png`, ownerId: USER_B }, USER_A), false);
  assert.equal(isOwnedAsset({ bucket: "profile-assets", name: `${USER_A}/avatar/a.png` }, USER_A), true);
});
test("plan includes XP allocations/RESTRICT children and participant loss, Auth last", () => {
  const plan = erasePlan(fixture(), USER_A);
  assert.deepEqual(plan.blocked, []);
  assert.equal(plan.counts.xp_event_allocations, 1);
  assert.equal(plan.counts.xp_legacy_imports, 1);
  assert.equal(plan.participantLoss.social_recommendation_messages, 2);
  assert.equal(plan.detachNotifications, 1);
  assert.deepEqual(plan.stages.slice(-2), ["auth-delete", "verify"]);
});
test("dry run does not mutate, execute requires confirmation and participant acknowledgement", async () => {
  const adapter = syntheticAdapter(fixture()); const before = await adapter.inspect();
  assert.equal((await runErasure(adapter, USER_A)).executed, false);
  assert.deepEqual(await adapter.inspect(), before); assert.deepEqual(adapter.calls, []);
  await assert.rejects(runErasure(adapter, USER_A, { execute: true }));
  await assert.rejects(runErasure(adapter, USER_A, { execute: true, confirmation: execution.confirmation }));
  assert.deepEqual(await adapter.inspect(), before);
});
test("erase is ordered, idempotent, preserves unrelated B library/Auth/assets and removes attributable notification", async () => {
  const initial = fixture(); const adapter = syntheticAdapter(initial);
  const report = await runErasure(adapter, USER_A, execution);
  assert.equal(report.completed, true);
  assert.deepEqual(adapter.calls, ["lock-pending", "lock-erasing", "application-cleanup", "storage-remove", "auth-delete"]);
  const after = await adapter.inspect();
  assert.deepEqual(after.tables.media_items, initial.tables.media_items.filter((r) => r.user_id === USER_B));
  assert.deepEqual(after.auth, initial.auth.filter((r) => r.id === USER_B));
  assert.deepEqual(after.assets, initial.assets.filter((r) => r.ownerId === USER_B));
  assert.deepEqual(after.tables.social_notifications, initial.tables.social_notifications.filter((r) => r.id === "notice-b-independent"));
  assert.ok(!JSON.stringify(after.tables.social_notifications).includes(USER_A));
  assert.equal(verifyErasure(after, USER_A).applicationControlledAbsent, true);
  assert.equal((await runErasure(adapter, USER_A, execution)).completed, true);
  assert.deepEqual(await adapter.inspect(), after);
});
test("Storage/application interruption prevents Auth deletion, retry completes without recreating rows", async () => {
  for (const failAt of ["storage-remove", "application-cleanup", "auth-delete"]) {
    const interrupted = syntheticAdapter(fixture(), { failAt });
    const report = await runErasure(interrupted, USER_A, execution);
    assert.equal(report.completed, false); assert.equal(report.retryable, true);
    assert.equal((await interrupted.inspect()).auth.some((r) => r.id === USER_A), true);
    if (failAt !== "auth-delete") assert.ok(!interrupted.calls.includes("auth-delete"));
    const retry = syntheticAdapter(await interrupted.inspect());
    assert.equal((await runErasure(retry, USER_A, execution)).completed, true);
  }
});
test("malicious/cross-owner XP refs and UUID JSON residuals block before any stage", async () => {
  const source = fixture(); source.tables.xp_user_badges[1].source_event_id = source.tables.xp_events[0].id;
  assert.match(erasePlan(source, USER_A).blocked.join(), /Cross-owner XP/);
  const adapter = syntheticAdapter(source);
  await assert.rejects(runErasure(adapter, USER_A, execution)); assert.deepEqual(adapter.calls, []);
  const residual = fixture(); residual.tables.media_items[1].metadata = { former_owner: USER_A };
  assert.match(erasePlan(residual, USER_A).blocked.join(), /Unclassified residual: media_items/);
});
test("verification reports Auth/owned rows/public projection/asset residuals instead of claiming global deletion", () => {
  const report = verifyErasure(fixture(), USER_A);
  assert.equal(report.applicationControlledAbsent, false);
  assert.equal(report.publicProfileAbsent, false);
  assert.ok(report.residuals.includes("Auth present"));
  assert.ok(report.limitations.some((s) => s.includes("logs/backups")));
});
test("all remote, staging, production and loosely classified targets refused", () => {
  requireSyntheticTarget(target);
  for (const patch of [{ source: "live" }, { environment: "staging" }, { environment: "production" }, { fingerprint: "wrong" }, { "supabase-url": "http://localhost:54321" }, { "supabase-url": "https://example.supabase.co" }]) assert.throws(() => requireSyntheticTarget({ ...target, ...patch }));
  assert.throws(() => parseOptions(["--execute", "--execute"]));
  assert.throws(() => parseOptions(["--credential", "hidden"]));
});
test("CLI proof returns dry-run, never reads a supplied file/credential", async () => {
  const args = Object.entries({ ...target, mode: "erase", "user-id": USER_A, email: "a@example.invalid" }).flatMap(([k, v]) => [`--${k}`, v]);
  assert.equal((await main(args)).executed, false);
});
test("forward XP migration keeps immutable UPDATE, target-bound private context and no runtime grants", () => {
  const sql = readFileSync("supabase/migrations/20261005120000_privacy_xp_ops_cleanup.sql", "utf8");
  assert.match(sql, /TG_OP='DELETE' and current_user='postgres' and session_user='postgres'/);
  assert.match(sql, /c\.transaction_id=pg_catalog\.txid_current\(\) and c\.user_id=v_user/);
  assert.match(sql, /raise exception 'xp_event_immutable'/);
  assert.match(sql, /revoke all on function private_privacy_ops\.erase_xp_v1\(uuid,text\) from public,anon,authenticated,service_role/);
  assert.match(sql, /set search_path=pg_catalog,pg_temp/);
  assert.ok(!/grant\s+execute|disable\s+trigger|drop\s+constraint|session_replication_role|set_config/i.test(sql));
  for (const child of ["xp_local_state_conversions", "xp_legacy_imports", "xp_user_quest_progress", "xp_user_badges", "xp_event_allocations"]) assert.ok(sql.indexOf(`delete from public.${child}`) < sql.indexOf("delete from public.xp_events where"));
  assert.match(sql, /privacy_cross_owner_xp_dependency/);
});
