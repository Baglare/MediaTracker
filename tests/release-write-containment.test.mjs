import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { releaseFreezeSql, runReleaseFreeze, main } from "../scripts/ops/release-freeze.mjs";
import { checkRetentionCompleteness } from "../scripts/privacy-retention-ops.mjs";
import { fixture, USER_A, USER_B } from "../scripts/privacy-synthetic-fixture.mjs";
import { domains, syntheticAdapter } from "../scripts/privacy-account-model.mjs";
const sql=readFileSync("supabase/migrations/20261006120000_release_write_containment.sql","utf8");
const historical=readFileSync("supabase/migrations/20261005130000_account_privacy_write_barrier.sql","utf8");

test("synthetic same identities: normal ACTIVE writes, global freeze denies both, reads survive, privacy lock survives unfreeze",async()=>{
  const adapter=syntheticAdapter(fixture());
  for(const id of [USER_A,USER_B])await adapter.mutate(id,"media_items",{user_id:id,id:`normal-${id}`});
  await adapter.transition(USER_A,"ERASURE_PENDING");
  await adapter.setReleaseFrozen(true,"postgres");
  const frozen=await adapter.inspect();
  for(const id of [USER_A,USER_B])for(const table of Object.keys(domains))await assert.rejects(adapter.mutate(id,table,{user_id:id}),/account_write_locked/);
  for(const operation of [()=>adapter.transition(USER_B,"ERASURE_PENDING"),()=>adapter.removeAssets(USER_A,[]),()=>adapter.cleanupApplication(USER_A),()=>adapter.deleteAuth(USER_A)])await assert.rejects(operation(),/account_write_locked/);
  const user={id:"33333333-3333-4333-8333-333333333333"};
  await assert.rejects(adapter.createAuth(user),/account_write_locked/);
  for(const actor of ["anon","authenticated","service_role",USER_A])await assert.rejects(adapter.setReleaseFrozen(false,actor),/release_ops_denied/);
  assert.deepEqual(await adapter.inspect(),frozen);
  await adapter.setReleaseFrozen(false,"postgres");
  await adapter.createAuth(user);assert.equal((await adapter.inspect()).lifecycle[user.id],"ACTIVE");
  await assert.rejects(adapter.mutate(USER_A,"media_items",{user_id:USER_A}),/account_write_locked/);
  await adapter.transition(USER_A,"ERASING");
  await assert.rejects(adapter.mutate(USER_A,"media_items",{user_id:USER_A}),/account_write_locked/);
  await adapter.mutate(USER_B,"media_items",{user_id:USER_B,id:"after-unfreeze"});
});

test("forward repair drains Auth creation before missing-only backfill; non-ACTIVE remains unchanged",()=>{
  assert.ok(historical.indexOf("insert into private_privacy_ops.account_lifecycle")<historical.indexOf("create trigger privacy_initialize_account"));
  assert.ok(sql.indexOf("lock table auth.users in share row exclusive mode")<sql.indexOf("insert into private_privacy_ops.account_lifecycle"));
  assert.match(sql,/where not exists\(select 1 from private_privacy_ops.account_lifecycle l where l.user_id=u.id\)/);
  assert.match(sql,/on conflict\(user_id\) do nothing/);
  assert.ok(!sql.includes("update private_privacy_ops.account_lifecycle"));
});
test("DB containment covers all source table mutation families, RPC and private operations; no JWT bypass",()=>{
  const tables=checkRetentionCompleteness().createdTables.filter(t=>!t.includes("."));
  assert.ok(tables.includes("goals") && tables.includes("recommendation_feedback") && tables.includes("user_theme_preferences"));
  for(const table of tables) assert.ok(sql.includes(`before insert or update or delete or truncate on public.${table}\nfor each statement`),table);
  for(const table of ["account_lifecycle","xp_cleanup_context","xp_detach_context"])assert.match(sql,new RegExp(`before insert or update or delete or truncate on private_privacy_ops.${table}`));
  assert.match(sql,/perform private_privacy_ops.assert_release_write_allowed_v1\(\);[\s\S]*for v_user/);
  assert.match(sql,/where singleton for share/);
  assert.match(sql,/if not found or v_frozen then/);
  assert.match(sql,/v_state<>'ACTIVE'/);
  const guard=sql.slice(sql.indexOf("create function private_privacy_ops.guard_release_mutation"),sql.indexOf("-- All current"));
  assert.ok(!guard.includes("session_user") && !guard.includes("auth.uid()"));
  assert.ok(!/before select|after select|next_public/i.test(sql));
});
test("Auth creation and privileged Storage mutations including truncate are contained",()=>{
  assert.match(sql,/a_release_auth before insert or update or delete or truncate on auth.users[\s\S]*for each statement/);
  assert.match(sql,/a_release_storage before insert or update or delete on storage.objects\s+for each row\s+execute/);
  assert.match(sql,/a_release_storage_truncate before truncate on storage.objects/);
  assert.match(sql,/new.bucket_id<>'profile-assets' and old.bucket_id<>'profile-assets'/);
  assert.match(historical,/privacy_initialize_account after insert on auth.users/);
});
test("freeze is private with exact revoked privilege and fixed privileged search_path",()=>{
  assert.match(sql,/default false/);
  assert.match(sql,/release_write_state enable row level security/);
  for(const name of ["assert_release_write_allowed_v1()","guard_release_mutation_v1()","set_release_freeze_v1(boolean,bigint)"])assert.ok(sql.includes(`function private_privacy_ops.${name} from public,anon,authenticated,service_role;`));
  assert.match(sql,/session_user<>'postgres' or auth.uid\(\) is not null/);
  assert.ok(!/grant execute|grant all/i.test(sql));
  assert.equal((sql.match(/security definer/g)??[]).length,(sql.match(/set search_path=pg_catalog,pg_temp/g)??[]).length);
});
test("default plan never touches a transport; unknown/hosted target refuses",async()=>{
  assert.equal((await main([])).status,"PLAN_ONLY");
  assert.equal((await main(["--mode","freeze"])).status,"PLAN_ONLY");
  for(const environment of ["production","staging","preview","unknown"])await assert.rejects(runReleaseFreeze({mode:"freeze",execute:true,environment,fingerprint:"a".repeat(64)}));
});
test("operational failure never removes freeze; deliberate unfreeze requires verification",async()=>{
  const calls=[];let frozen=true;
  const adapter={async prove(){calls.push("proof");},async releaseControl(mode){calls.push(mode);throw new Error("postcheck failed");}};
  const options={environment:"disposable",fingerprint:"a".repeat(64),mode:"unfreeze",execute:true,revision:1,confirmation:`RELEASE UNFREEZE ${"a".repeat(64)}`};
  await assert.rejects(runReleaseFreeze(options,adapter));assert.deepEqual(calls,[]);
  await assert.rejects(runReleaseFreeze({...options,acknowledgePostchecks:true},adapter));
  assert.equal(frozen,true);assert.ok(!calls.includes("freeze"));
  const query=releaseFreezeSql("unfreeze",1);
  assert.ok(query.indexOf("release_lifecycle_postcheck")<query.indexOf("set_release_freeze_v1(false,1)"));
  assert.match(query,/lock table auth.users in share row exclusive mode/);
  assert.match(query,/for update/);assert.match(query,/release_ledger_postcheck/);assert.match(query,/release_binding_postcheck/);assert.match(query,/release_privilege_postcheck/);
  assert.match(query,/t.tgtype=62 and t.tgqual is null and t.tgnargs=0/);
  assert.match(query,/t.tgtype=b.mask and t.tgfoid=b.fn::regprocedure/);
  await assert.rejects(runReleaseFreeze({...options,acknowledgePostchecks:true},{async prove(){},async releaseControl(){return {frozen:false,revision:2,postchecks:false};}}));
});
