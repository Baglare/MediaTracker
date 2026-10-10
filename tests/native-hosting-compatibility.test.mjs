import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeRoles, assertNativeRoleTarget, runtimeRoleCheck } from '../lib/backend/native-roles.mjs';
import { nativeMigrationManifest } from '../scripts/native-migrations.mjs';
import { mapNativeSql, sqlWithoutTransaction } from '../scripts/native-hosting-sql.mjs';
import { hostingMemberships, hostingSchemas, inspectHostingContract } from '../scripts/native-hosting-contract.mjs';
import { operatorConfig, authorizeTarget } from '../scripts/native-ops-target.mjs';
import { migrationHistory, runMigrations, validateHistory } from '../scripts/native-migration-runner.mjs';
import { validateBackupManifest, backupNative, restoreNative, verifyBackup } from '../scripts/native-recovery.mjs';
import { nativePrivacyAdapter, runNativePrivacyJob } from '../scripts/native-privacy-ops.mjs';

const fingerprint='a'.repeat(64);
function config(profile='hosting-test',kind='migrator') {
  const r=nativeRoles(profile);
  return operatorConfig({NATIVE_ROLE_PROFILE:profile,NATIVE_OPS_ENVIRONMENT:kind==='restore'?'disposable':profile==='hosting-test'?'disposable':'production',
    NATIVE_OPS_ROLE_KIND:kind,NATIVE_OPS_DATABASE_URL:`postgresql://${r[kind]}:synthetic@127.0.0.1:5433/${kind==='restore'?r.restoreDatabase:r.database}`,
    NATIVE_OPS_SSL_MODE:'verify-full',NATIVE_OPS_SSL_CA_FILE:'/private/root.crt',NATIVE_OPS_EXPECTED_FINGERPRINT:fingerprint});
}
const target={environment:'disposable',fingerprint,operator:true,provisioner:true};

test('closed profiles bind every login to its exact environment/database and operation',()=>{
  for(const p of ['hosting-test','hosting-production']) {
    const r=nativeRoles(p),c=config(p),t={...target,environment:c.environment};
    assertNativeRoleTarget(r,new URL(`postgresql://${r.runtime}@localhost/${r.database}`));
    for(const login of [r.owner,r.privacy_login,'mt_runtime',nativeRoles(p==='hosting-test'?'hosting-production':'hosting-test').runtime])
      assert.throws(()=>assertNativeRoleTarget(r,new URL(`postgresql://${login}@localhost/${r.database}`)));
    assert.throws(()=>assertNativeRoleTarget(r,new URL(`postgresql://${r.runtime}@localhost/other`)));
    authorizeTarget(t,c,{operation:'MIGRATE',provisioner:true});
    for(const kind of ['privacy_login','backup','restore']) {
      const denied=config(p,kind);
      assert.throws(()=>authorizeTarget({...t,environment:denied.environment},denied,{operation:'MIGRATE'}));
    }
    assert.throws(()=>authorizeTarget(t,c,{operation:'MAINTAIN'}));
  }
  assert.throws(()=>nativeRoles('custom'));assert.throws(()=>config('unknown'));
  assert.throws(()=>assertNativeRoleTarget(nativeRoles(),new URL('postgresql://mt_prod_runtime@localhost/mediatracker_prod')));
});
test('PostgreSQL 18 graph has no runtime SET/admin or cross-environment membership',()=>{
  for(const p of ['hosting-test','hosting-production']) {
    const r=nativeRoles(p),edges=hostingMemberships(r);
    assert.deepEqual(edges.filter(e=>e.member===r.runtime),[{member:r.runtime,role:r.auth_access,inherit:true,set:false}]);
    assert.deepEqual(edges.filter(e=>e.member===r.migrator).map(e=>[e.role,e.inherit,e.set]),
      [r.owner,r.auth_owner,r.limiter,r.ledger_owner].map(role=>[role,false,true]));
    assert.equal(edges.some(e=>e.role===r.database_owner),false);
    const check=runtimeRoleCheck(r);
    for(const property of ['rolbypassrls','rolsuper','rolcreaterole','rolcreatedb','rolreplication','has_schema_privilege','has_database_privilege','relforcerowsecurity'])assert.ok(check.text.includes(property));
    assert.ok(check.text.includes("pg_has_role(me.oid,$2::regrole,'SET')"));
    assert.deepEqual(hostingSchemas(r).map(e=>e.owner),[r.owner,r.auth_owner,r.limiter,r.owner,r.ledger_owner]);
  }
});
test('lexer maps identifiers and exact role literals inside SECURITY DEFINER code, preserving data/comments',()=>{
  const r=nativeRoles('hosting-test');
  const sql=`-- mt_runtime\n/* mt_owner /* nested */ */ GRANT "mt_auth_access" TO mt_runtime; DO $body$ BEGIN
IF session_user='mt_runtime' THEN PERFORM 'prefix mt_runtime'; END IF; END $body$; SELECT 'mt_runtime_suffix';`;
  assert.equal(mapNativeSql(sql,r),`-- mt_runtime\n/* mt_owner /* nested */ */ GRANT "mt_test_auth_access" TO mt_test_runtime; DO $body$ BEGIN
IF session_user='mt_test_runtime' THEN PERFORM 'prefix mt_runtime'; END IF; END $body$; SELECT 'mt_runtime_suffix';`);
  for(const broken of ["SELECT 'unterminated",'/* comment','DO $$ nope'])assert.throws(()=>mapNativeSql(broken,r));
  assert.equal(sqlWithoutTransaction('BEGIN; DO $$ BEGIN; END $$; COMMIT;'),' DO $$ BEGIN; END $$; ');
  assert.throws(()=>sqlWithoutTransaction('BEGIN; SELECT 1;'));
});
test('hosting execution manifest covers transformed SQL and keeps historical local checksums immutable',()=>{
  const snapshots=JSON.parse(readFileSync('lib/backend/native-hosting-migration-state.json','utf8'));
  const local=nativeMigrationManifest();
  assert.deepEqual(local.map(({name,checksum})=>({name,checksum})),JSON.parse(readFileSync('lib/backend/native-migration-state.json','utf8')));
  for(const p of ['hosting-test','hosting-production']) {
    const entries=nativeMigrationManifest(p);
    assert.deepEqual(entries.map(({name,checksum})=>({name,checksum})),snapshots[p]);
    for(const entry of entries) {
      assert.doesNotMatch(entry.sql,/CREATE ROLE|CREATE SCHEMA|TO CURRENT_USER|ALTER ROLE/);
      assert.notEqual(entry.checksum,local.find(e=>e.name===entry.name).checksum);
      assert.doesNotMatch(entry.sql.replaceAll(/--[^\n]*/g,''),/\b(?:TO|ROLE) mt_runtime\b|'mt_runtime'/i);
    }
    assert.equal(validateHistory(snapshots[p],entries).length,0);
    assert.throws(()=>validateHistory(snapshots[p],nativeMigrationManifest(p==='hosting-test'?'hosting-production':'hosting-test')));
    assert.throws(()=>validateBackupManifest({roleProfile:p,migrations:snapshots.local}));
  }
});
test('hosting bootstrap accepts proven empty schemas and rejects objects or unverified owners/ACLs',async()=>{
  const r=nativeRoles('hosting-test');
  const client={query:async text=>({rows:[text.includes('to_regclass')?{present:false}:text.includes(' AS dirty')?{dirty:false}:{safe:true}]})};
  assert.deepEqual(await migrationHistory(client,r),[]);
  await inspectHostingContract(client,r);
  await assert.rejects(migrationHistory({query:async text=>({rows:[text.includes('to_regclass')?{present:false}:{dirty:true}]})},r),/not_empty/);
  await assert.rejects(inspectHostingContract({query:async()=>({rows:[{safe:false}]})},r),/contract_invalid/);
});
test('hosting bootstrap/retry is locked and transactional without provisioning mutation',async()=>{
  const c=config(),entries=nativeMigrationManifest(c.roles.profile),calls=[],history=[];
  let ledger=false;
  const client={query:async(text,values)=>{
    calls.push(text);
    if(text.includes(' AS safe'))return {rows:[{safe:true}]};
    if(text.includes('to_regclass'))return {rows:[{present:ledger}]};
    if(text.includes(' AS dirty'))return {rows:[{dirty:false}]};
    if(text==='SELECT name,checksum FROM native_migrations.ledger ORDER BY name')return {rows:[...history]};
    if(text.includes('CREATE TABLE IF NOT EXISTS native_migrations.ledger'))ledger=true;
    if(text.startsWith('INSERT INTO native_migrations.ledger'))history.push({name:values[0],checksum:values[1]});
    return {rows:[]};
  }};
  const options={apply:true,confirmation:`MIGRATE disposable ${fingerprint}`};
  assert.equal((await runMigrations(client,c,target,options)).applied.length,9);
  assert.deepEqual((await runMigrations(client,c,target,options)).applied,[]);
  assert.equal(calls.filter(s=>s==='COMMIT').length,9);
  assert.equal(calls.filter(s=>s.startsWith('INSERT INTO native_migrations.ledger')).length,9);
  assert.ok(calls.at(-1).includes('pg_advisory_unlock'));
  assert.equal(validateHistory(history,entries).length,0);
  history[0].checksum='b'.repeat(64);
  await assert.rejects(runMigrations(client,c,target,options),/history_invalid/);
});
test('privacy uses mapped role with inherited privileges and refuses missing hosted target proof',async()=>{
  const r=nativeRoles('hosting-production'),calls=[];
  const adapter=nativePrivacyAdapter({query:async(text,values)=>{
    calls.push([text,values]);return {rows:[{operator:false,login:r.runtime}]};
  }},'/private','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',r);
  await assert.rejects(adapter.inspect(),/privacy_ops_denied/);
  assert.equal(calls[0][1][0],r.privacy_operator);
  assert.equal(adapter.environment,'production');
  await assert.rejects(runNativePrivacyJob({roles:r,client:{},user:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),/privacy_ops_denied/);
  await assert.rejects(runNativePrivacyJob({roles:r,hostingConfig:config('hosting-production','privacy_login'),
    hostingTarget:{...target,environment:'production'},client:{}}),/client_unproven/);
});
test('hosted synthetic backup/restore preserves profile, ledger and freeze with isolated operator kinds',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mt-hosted-recovery-'));
  const storage=join(root,'source'),output=join(root,'backup'),restored=join(root,'restored');
  const c=config('hosting-test','backup'),history=nativeMigrationManifest(c.roles.profile).map(({name,checksum})=>({name,checksum}));
  const calls=[];
  const client={query:async text=>{
    if(text.includes('to_regclass'))return {rows:[{present:true}]};
    if(text==='SELECT name,checksum FROM native_migrations.ledger ORDER BY name')return {rows:history};
    if(text.includes(' AS safe'))return {rows:[{safe:true}]};
    if(text.includes('native_ops_lifecycle_state'))return {rows:[{state:{missing:0,pending:0}}]};
    if(text.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
    if(text.includes('native_ops_state'))return {rows:[{state:{frozen:true,revision:0}}]};
    if(text.includes(' AS occupied'))return {rows:[{occupied:false}]};
    return {rows:[]};
  }};
  const tool=async command=>{calls.push(command);if(command==='pg_dump')await writeFile(join(output,'database.dump'),'synthetic hosted dump');};
  try {
    await mkdir(storage);await mkdir(restored);
    const options={apply:true,quiesced:'ALL_WORKERS_AND_OPERATORS_STOPPED',storage,output,confirmation:`BACKUP disposable ${fingerprint}`};
    await backupNative(client,c,{...target,provisioner:false},options,tool);
    const manifest=await verifyBackup(output);assert.equal(manifest.roleProfile,'hosting-test');
    assert.deepEqual(manifest.migrations,history);
    const restoreOptions={...options,storage:restored,input:output,'backup-fingerprint':manifest.fingerprint,confirmation:`RESTORE disposable ${fingerprint}`};
    const result=await restoreNative(client,config('hosting-test','restore'),target,restoreOptions,tool);
    assert.equal(result.status,'RESTORED_FROZEN');assert.deepEqual(calls,['pg_dump','pg_restore']);
    await assert.rejects(restoreNative(client,config('hosting-production','restore'),target,restoreOptions,tool),/profile_mismatch/);
    assert.equal(calls.length,2);
  } finally {await rm(root,{recursive:true,force:true});}
});
