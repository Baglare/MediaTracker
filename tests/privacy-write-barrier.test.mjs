import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { domains, ownerlessTables, accountExport, erasePlan, runErasure, syntheticAdapter, sharedPolicy, verifyErasure } from "../scripts/privacy-account-model.mjs";
import { fixture, USER_A, USER_B } from "../scripts/privacy-synthetic-fixture.mjs";
import { inspectSql, cleanupSql } from "../scripts/privacy-account-sql.mjs";
import { createOperationalAdapter, validateDisposableProof, validateGatewayConfig, validateDisposableSchema } from "../scripts/privacy-disposable-adapter.mjs";
import { mutationInventory } from "../scripts/privacy-mutation-inventory.mjs";

const execution = { execute: true, confirmation: `ERASE SYNTHETIC ${USER_A}`, acceptParticipantLoss: true };
const barrier = readFileSync("supabase/migrations/20261005130000_account_privacy_write_barrier.sql", "utf8");
const detach = readFileSync("supabase/migrations/20261005140000_privacy_participant_detachment.sql", "utf8");
const target = { environment: "disposable", fingerprint: "mediatracker-privacy-disposable-v1", url: "http://127.0.0.1:54321" };

test("same pre-lock identity succeeds ACTIVE, then every account family denies while B remains ACTIVE", async () => {
  const a = syntheticAdapter(fixture());
  const identity = USER_A;
  await a.mutate(identity, "media_items", { id: "active", user_id: identity });
  await a.transition(identity, "ERASURE_PENDING");
  for (const family of Object.keys(domains)) {
    await assert.rejects(a.mutate(identity, family, { user_id: identity }), /account_write_locked/, family);
    await a.mutate(USER_B, family, { user_id: USER_B });
  }
  assert.equal((await a.inspect()).lifecycle[identity], "ERASURE_PENDING");
  const exported = accountExport(await a.inspect(), identity, "a@example.invalid", "2026-10-05T00:00:00Z");
  assert.ok(!JSON.stringify(exported).includes("B private notes"));
  await a.transition(identity, "ERASING");
  await assert.rejects(a.mutate(identity, "media_items", { user_id: identity }), /account_write_locked/);
});

test("every migration public table is guarded including RPC bypass targets and ledgers", () => {
  const tables = new Set();
  for (const f of readdirSync("supabase/migrations").filter((s) => s.endsWith(".sql"))) {
    for (const m of readFileSync(`supabase/migrations/${f}`, "utf8").matchAll(/create table (?:if not exists )?public\.(\w+)/gi)) tables.add(m[1]);
  }
  assert.deepEqual([...tables].sort(), [...Object.keys(domains), ...ownerlessTables].sort());
  for (const table of tables) {
    assert.ok(barrier.includes(`delete on public.${table} for each statement`), table);
    assert.ok(barrier.includes(`delete on public.${table} for each row`), table);
  }
  assert.match(barrier, /before insert or update or delete.*for each statement/s);
  assert.match(barrier, /before insert or update or delete.*for each row/s);
  assert.match(barrier, /revoke truncate on public/);
  for (const key of ["actor_id", "recipient_id", "following_id", "blocked_id", "recommendation_id", "parent_comment_id", "event_id"]) assert.ok(barrier.includes(key));
  assert.match(barrier, /on storage.objects/);
});

test("all current mutation RPCs/routes terminate in guarded tables; reads and disabled tables are separate", () => {
  const inventory = mutationInventory();
  for (const fn of inventory.functions) for (const table of fn.tables) assert.ok(domains[table] || ownerlessTables.includes(table), `${fn.name}: ${table}`);
  for (const name of ["public.apply_media_item_sync_operation", "public.apply_progress_log_sync_operation", "public.apply_cloud_goal_v1", "public.xp_sync_media_states", "public.social_save_unified_profile", "public.social_comment", "public.social_react", "public.social_report", "public.save_theme_sync_state", "public.social_notification_action"]) {
    const fn = inventory.functions.find((f) => f.name === name);
    assert.equal(fn?.classification, "DB_GUARDED", name);
    assert.ok(fn.tables.length, name);
  }
  for (const route of inventory.routes) for (const table of route.tables) assert.ok(barrier.includes(`delete on public.${table} for each statement`), route.file);
});

test("Auth-service zero-row cascade exception never admits leftover rows or web JWT bypass", () => {
  assert.match(barrier, /session_user='supabase_auth_admin' and auth.uid\(\) is null\s+and tg_level='STATEMENT' and tg_op='DELETE' then return null/);
  assert.match(barrier, /if auth.uid\(\) is null then raise exception 'authentication_required'/);
  assert.ok(!/session_user='(?:authenticator|service_role)'/.test(barrier));
});

test("private lifecycle and privileged functions have no normal role grants or writable claims", () => {
  assert.match(barrier, /revoke all on private_privacy_ops.account_lifecycle from public,anon,authenticated,service_role/);
  assert.match(barrier, /session_user<>'postgres' or auth.uid\(\) is not null/);
  assert.match(barrier, /revoke all on function private_privacy_ops.transition_account_v1\(uuid,text,text\) from public,anon,authenticated,service_role/);
  assert.match(barrier, /for share/);
  assert.match(barrier, /where user_id=p_user for update/);
  assert.match(barrier, /if not found or v_state<>'ACTIVE'/);
  assert.match(barrier, /references auth.users\(id\) on delete cascade/);
  assert.ok(!/user_metadata|app_metadata|grant .*private_privacy_ops/i.test(barrier));
  assert.match(barrier, /public.assert_account_write_allowed\(\)/);
  assert.match(barrier, /grant execute on function public.assert_account_write_allowed\(\) to authenticated/);
});

test("new migration order/search_path and every tracked historical SQL byte remain intact", () => {
  const names = readdirSync("supabase/migrations").filter((s) => s.endsWith(".sql")).sort();
  assert.ok(names.indexOf("20261005120000_privacy_xp_ops_cleanup.sql") < names.indexOf("20261005130000_account_privacy_write_barrier.sql"));
  assert.ok(names.indexOf("20261005130000_account_privacy_write_barrier.sql") < names.indexOf("20261005140000_privacy_participant_detachment.sql"));
  for (const sql of [barrier, detach]) {
    for (const fn of sql.matchAll(/create (?:or replace )?function\s+([\w.]+)[\s\S]*?\$\$;/gi)) {
      assert.match(fn[0], /set search_path=pg_catalog,pg_temp/);
      if (fn[0].includes("security definer") && fn[1].startsWith("private_privacy_ops.")) assert.ok(sql.includes(`revoke all on function ${fn[1]}`));
    }
    assert.ok(!/disable trigger|session_replication_role|grant .*private_privacy_ops/i.test(sql));
  }
  const gitRoot = process.env.PRIVACY_TEST_BASELINE_REPO ?? process.cwd();
  const tracked = execFileSync("git", ["-C", gitRoot, "ls-files", "supabase/migrations"], { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const path of tracked) assert.equal(readFileSync(path, "utf8").replace(/\r\n/g, "\n"), execFileSync("git", ["-C", gitRoot, "show", `HEAD:${path}`], { encoding: "utf8" }).replace(/\r\n/g, "\n"), path);
});

test("independent B replies and earned XP survive with A provenance detached; dependent containers delete", async () => {
  const initial = fixture();
  initial.tables.social_activity_comments.push({ id: "b-reply", author_id: USER_B, activity_id: initial.tables.social_activity_events[1].id, parent_comment_id: initial.tables.social_activity_comments[0].id, body: "B independent reply" });
  initial.tables.xp_events[1].source_id = "thread-ab";
  initial.tables.xp_events[1].canonical_key = "provider:movie:independent-b";
  initial.tables.xp_events[1].metadata = { recommendationId: "thread-ab", actorId: USER_A, username: "synthetic-a", avatarPath: `${USER_A}/avatar/synthetic.png` };
  const a = syntheticAdapter(initial);
  const report = await runErasure(a, USER_A, execution);
  assert.equal(report.completed, true);
  const after = await a.inspect();
  assert.equal(after.tables.social_activity_comments.find((r) => r.id === "b-reply").parent_comment_id, null);
  assert.equal(after.tables.social_activity_comments.find((r) => r.id === "b-reply").body, "B independent reply");
  assert.deepEqual(after.tables.xp_events[0].metadata, {});
  assert.equal(after.tables.xp_events[0].source_id, `privacy-detached:${initial.tables.xp_events[1].id}`);
  assert.equal(after.tables.xp_events[0].canonical_key, "provider:movie:independent-b");
  assert.deepEqual(after.tables.xp_user_totals, initial.tables.xp_user_totals.filter((r) => r.user_id === USER_B));
  assert.deepEqual(after.tables.xp_event_allocations, initial.tables.xp_event_allocations.filter((r) => r.event_id === initial.tables.xp_events[1].id));
  for (const marker of [USER_A, "synthetic-a", "thread-ab"]) assert.ok(!JSON.stringify(after).includes(marker));
  assert.equal(sharedPolicy.independentParticipantXp, "RETAIN_NON_IDENTIFYING");
  assert.match(detach, /to_jsonb\(new\)-array\['source_id','canonical_key','dedupe_key','metadata'\]/);
  assert.match(detach, /new.metadata='\{\}'::jsonb/);
});

test("no automatic unlock after failure, deliberate pre-destruction abort only, retry preserves lock", async () => {
  const abort = syntheticAdapter(fixture());
  await abort.transition(USER_A, "ERASURE_PENDING"); await abort.unlock(USER_A);
  await abort.mutate(USER_A, "goals", { user_id: USER_A });
  for (const failAt of ["application-cleanup", "storage-remove", "auth-delete"]) {
    const a = syntheticAdapter(fixture(), { failAt });
    const report = await runErasure(a, USER_A, execution);
    assert.equal(report.completed, false); assert.equal(report.failedStage, failAt);
    assert.equal((await a.inspect()).lifecycle[USER_A], "ERASING");
    assert.equal((await a.inspect()).stageState[USER_A].failedStage, failAt);
    await assert.rejects(a.unlock(USER_A), /privacy_unlock_denied/);
    await assert.rejects(a.mutate(USER_A, "media_items", { user_id: USER_A }), /account_write_locked/);
    const retry = syntheticAdapter(await a.inspect());
    assert.equal((await runErasure(retry, USER_A, execution)).completed, true);
    await assert.rejects(retry.mutate(USER_A, "media_items", { user_id: USER_A }), /account_write_locked/);
  }
});

test("known participant text attribution is anonymized and verified without searching unrelated B text", async () => {
  const source = fixture(); source.tables.profiles[0].username = "synthetic-a"; source.tables.profiles[0].display_name = "Synthetic A";
  source.tables.social_activity_comments.push({ id: "attributed-b-reply", author_id: USER_B, activity_id: source.tables.social_activity_events[1].id,
    parent_comment_id: source.tables.social_activity_comments[0].id, body: "Reply to @synthetic-a (Synthetic A)" });
  source.scopedResiduals = [{ table: "social_activity_comments", row: source.tables.social_activity_comments.at(-1) }];
  assert.equal(erasePlan(source, USER_A).anonymizeReplies, 1);
  assert.deepEqual(erasePlan(source, USER_A).blocked, []);
  delete source.scopedResiduals; // SQL snapshots recompute this after cleanup.
  const a = syntheticAdapter(source); assert.equal((await runErasure(a, USER_A, execution)).completed, true);
  const reply = (await a.inspect()).tables.social_activity_comments.find((r) => r.id === "attributed-b-reply");
  assert.equal(reply.body, "Silinen hesaba verilen yanıt."); assert.equal(reply.parent_comment_id, null);
  const residual = await a.inspect(); residual.context = { identifiers: ["synthetic-a"], replyIds: [reply.id] };
  residual.tables.social_activity_comments.find((r) => r.id === reply.id).body = "Unclean actor @synthetic-a";
  assert.match(verifyErasure(residual, USER_A).residuals.join(), /Participant text residual/);
});

test("SQL compiler scopes every domain, snapshots omit Auth secrets, participant context and XP order explicit", () => {
  const inspect = inspectSql(USER_A); const cleanup = cleanupSql(USER_A);
  for (const t of Object.keys(domains)) assert.ok(inspect.includes(`public.${t}`), t);
  assert.match(inspect, /repeatable read read only/);
  assert.ok(!/encrypted_password|refresh_token|select \* from auth.users/i.test(inspect));
  assert.ok(cleanup.indexOf("detach_participant_xp_v1") < cleanup.indexOf("delete from public.social_recommendations"));
  assert.ok(cleanup.indexOf("erase_xp_v1") < cleanup.indexOf("delete from public.profiles"));
  assert.ok(cleanup.indexOf("delete from public.profile_media_showcase") < cleanup.indexOf("set constraints public.xp_showcase_reconcile"));
  assert.ok(cleanup.indexOf("set constraints public.xp_showcase_reconcile") < cleanup.indexOf("erase_xp_v1"));
  assert.ok(!cleanup.includes("delete from auth.users"));
  assert.throws(() => cleanupSql(`${USER_A}'`));
});

function operationalHarness({ failAt, residual = false } = {}) {
  const model = syntheticAdapter(fixture(), { failAt });
  const calls = [];
  const sql = async (query) => {
    calls.push(query);
    if (query.includes("/* privacy-stage */")) {
      const success = query.match(/last_completed_stage='([^']+)'/);
      const failure = query.match(/failed_stage='([^']+)'/);
      return model.recordStage(USER_A, (success ?? failure)[1], success ? "PASS" : "FAIL");
    }
    if (query.includes("isolation level repeatable read")) {
      const source = await model.inspect();
      source.auth = source.auth.filter((r) => r.id === USER_A);
      source.assets = source.assets.filter((r) => r.ownerId === USER_A);
      return source;
    }
    if (query.includes("transition_account_v1")) return model.transition(USER_A, query.includes("'ERASING'") ? "ERASING" : "ERASURE_PENDING");
    if (query.includes("set local role authenticated")) return model.assertLocked(USER_A);
    if (query.includes("detach_participant_xp_v1")) return model.cleanupApplication(USER_A);
    throw new Error("Unknown SQL contract");
  };
  const admin = {
    storage: { from(bucket) {
      assert.equal(bucket, "profile-assets");
      return {
        async list(prefix) {
          const objects = (await model.inspect()).assets.filter((r) => r.name.startsWith(`${prefix}/`));
          const children = [...new Set(objects.map((r) => r.name.slice(prefix.length + 1).split("/")[0]))];
          return { data: children.map((name) => ({ name, id: prefix === USER_A ? null : "object-id" })).concat(residual ? [{ name: "unverified.bin", id: "residual" }] : []), error: null };
        },
        async remove(names) { calls.push("storage-delete"); await model.removeAssets(USER_A, names); return { error: null }; },
      };
    } },
    auth: { admin: {
      async deleteUser(id, soft) { calls.push("AUTH_DELETE_LAST"); assert.equal(id, USER_A); assert.equal(soft, false); await model.deleteAuth(id); return { error: null }; },
      async getUserById(id) { const user = (await model.inspect()).auth.find((r) => r.id === id); return { data: { user }, error: user ? null : { status: 404 } }; },
    } },
  };
  return { model, calls, adapter: createOperationalAdapter({ sql, admin, target, userId: USER_A }) };
}

test("actual operational adapter compiles scoped SQL, exact Storage calls, Auth-last, absence and stable rerun", async () => {
  const { adapter, calls, model } = operationalHarness();
  const run = { ...execution, confirmation: `ERASE DISPOSABLE ${USER_A}` };
  assert.equal((await runErasure(adapter, USER_A)).executed, false);
  assert.ok(!calls.includes("AUTH_DELETE_LAST"));
  const result = await runErasure(adapter, USER_A, run);
  assert.equal(result.completed, true, JSON.stringify(result));
  assert.ok(calls.indexOf("storage-delete") < calls.indexOf("AUTH_DELETE_LAST"));
  assert.equal((await model.inspect()).auth.length, 1);
  assert.equal(verifyErasure(await adapter.inspect(), USER_A).applicationControlledAbsent, true);
  assert.equal((await runErasure(adapter, USER_A, run)).completed, true);
  assert.equal(calls.filter((c) => c === "AUTH_DELETE_LAST").length, 1);
});

test("operational adapter refuses Auth delete on residuals or Storage failure; preserves erasure lock", async () => {
  for (const options of [{ failAt: "storage-remove" }, { residual: true }]) {
    const { adapter, calls, model } = operationalHarness(options);
    const report = await runErasure(adapter, USER_A, { ...execution, confirmation: `ERASE DISPOSABLE ${USER_A}` });
    assert.equal(report.completed, false);
    assert.ok(!calls.includes("AUTH_DELETE_LAST"));
    assert.equal((await model.inspect()).lifecycle[USER_A], "ERASING");
  }
});

test("unknown/remote/name-only disposable target proofs are refused before transports", () => {
  for (const patch of [{ url: "https://staging.supabase.co" }, { environment: "production" }, { fingerprint: "mediatracker-privacy-fixture-v1" }]) assert.throws(() => createOperationalAdapter({ target: { ...target, ...patch }, userId: USER_A }));
  assert.throws(() => validateDisposableProof({ Name: "/mediatracker_privacy_05f_db" }, {}));
  const gateway = { services: [{ url: "http://mediatracker_privacy_05f_auth:9999" }, { url: "http://mediatracker_privacy_05f_storage:5000" }] };
  validateGatewayConfig(gateway);
  assert.throws(() => validateGatewayConfig({ services: [{ url: "https://production.supabase.co" }, gateway.services[1]] }));
  assert.throws(() => validateGatewayConfig({ ...gateway, plugins: [{ name: "serverless-functions" }] }));
  const tables = [...Object.keys(domains), ...ownerlessTables];
  const schema = { tables, guardedTables: tables, storageGuard: true, unsafePrivateGrants: false, helperSearchPath: "search_path=pg_catalog, pg_temp" };
  validateDisposableSchema(schema);
  for (const patch of [{ tables: [...tables, "unclassified_accounts"] }, { guardedTables: tables.slice(1) }, { unsafePrivateGrants: true }, { storageGuard: false }]) assert.throws(() => validateDisposableSchema({ ...schema, ...patch }));
});

test("ops import graph and credentials remain outside application/browser modules", () => {
  const visit = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? visit(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  for (const file of ["app", "components", "features", "hooks", "lib"].flatMap(visit).filter((f) => /\.[cm]?[jt]sx?$/.test(f))) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/privacy-(?:account-(?:ops|model|sql)|disposable-adapter)|PRIVACY_DISPOSABLE_SERVICE_ROLE_KEY|auth\.admin\.deleteUser/.test(text), file);
  }
  assert.match(readFileSync("next.config.ts", "utf8"), /outputFileTracingExcludes: \{ "\/\*": \["\.\/scripts\/privacy-\*\.mjs"\] \}/);
});

test("privacy page and retention keep factual limits; no lock orphan or new retention period", () => {
  const page = readFileSync("app/privacy/page.tsx", "utf8");
  assert.match(page, /teknik kapsamı ayrıca/);
  assert.match(page, /Çıkış yapmak veri silmek değildir/);
  assert.match(page, /yedek|backup/);
  assert.match(barrier, /references auth.users\(id\) on delete cascade/);
  const retention = readFileSync("scripts/privacy-retention-ops.mjs", "utf8");
  assert.ok(!retention.includes("deleteAuth"));
});

test("unclassified JSON UUID and captured participant residual prevent erasure closure", () => {
  const source = fixture(); source.tables.media_items[1].metadata = { actor: { userId: USER_A } };
  assert.match(erasePlan(source, USER_A).blocked.join(), /Unclassified residual/);
  const residual = fixture(); residual.scopedResiduals = [{ table: "xp_events", row: { id: "unknown-retained", user_id: USER_B, metadata: { actorId: USER_A } } }];
  assert.match(erasePlan(residual, USER_A).blocked.join(), /Participant residual/);
});
