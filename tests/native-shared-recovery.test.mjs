import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeRoles } from '../lib/backend/native-roles.mjs';
import { nativeMigrationManifest } from '../scripts/native-migrations.mjs';
import { operatorConfig, digest } from '../scripts/native-ops-target.mjs';
import { inspectBackupCoverage, assertRecoveryInventory, canonicalConstraintDefinition } from '../scripts/native-recovery-evidence.mjs';
import { backupNative, restoreNative, verifyBackup } from '../scripts/native-recovery.mjs';
import { sealBackup, unsealBackup, recoveryKey } from '../scripts/native-recovery-seal.mjs';
import { recoveryPreflight } from '../scripts/native-recovery-preflight.mjs';
import { assertRecoveryProof, recoverySourceFingerprint, attestRecoveryRunner } from '../scripts/native-recovery-proof-contract.mjs';
const roles=nativeRoles('hosting-test','shared-managed'),fingerprint='a'.repeat(64);
const config=operatorConfig({NATIVE_ROLE_PROFILE:roles.profile,NATIVE_HOSTING_CAPABILITY:roles.capability,
  NATIVE_OPS_ROLE_KIND:'backup',NATIVE_OPS_ENVIRONMENT:'disposable',NATIVE_OPS_DATABASE_URL:`postgresql://${roles.backup}:synthetic@127.0.0.1:5433/${roles.database}`,
  NATIVE_OPS_SSL_MODE:'verify-full',NATIVE_OPS_SSL_CA_FILE:join(process.cwd(),'.codex','root.crt'),NATIVE_OPS_EXPECTED_FINGERPRINT:fingerprint});
const target={environment:'disposable',fingerprint,operator:true,provisioner:false};
async function unitProof(root) {
  // Mock operator evidence exercises parsing only, never claimed as PostgreSQL proof.
  const proof={format:'MediaTrackerNativeRecoveryProofV1',status:'PASS',kind:'SYNTHETIC_PG18_ROUNDTRIP',pgMajor:18,
    sourceFingerprint:await recoverySourceFingerprint(),twoUserIsolation:'PASS',rows:'PASS',ledger:'PASS',ownershipAcl:'PASS',roleSettings:'PASS',files:'PASS'};
  proof.fingerprint=digest(proof);const path=join(root,'mock-proof.json');await writeFile(path,JSON.stringify(proof));
  return {'recovery-proof':path,'recovery-proof-fingerprint':proof.fingerprint};
}
test('shared recovery stays closed without operator-pinned PG18 evidence and rejects a forged local runner',async()=>{
  let calls=0;const client={query:async()=>{calls++;throw Error('unexpected');}};
  await assert.rejects(backupNative(client,config,target,{apply:true,confirmation:`BACKUP disposable ${fingerprint}`}),/proof_required/);
  assert.equal(calls,0);await assert.rejects(attestRecoveryRunner(client,{},{}),/runner_unproven/);
  const root=await mkdtemp(join(tmpdir(),'mt-proof-pin-'));
  try {
    const options=await unitProof(root);await assertRecoveryProof(options);
    await assert.rejects(assertRecoveryProof({...options,'recovery-proof-fingerprint':'b'.repeat(64)}),/proof_invalid/);
    const proof=JSON.parse(await readFile(options['recovery-proof'],'utf8'));proof.status='NOT_RUN';proof.fingerprint=digest({...proof,fingerprint:undefined});
    await writeFile(options['recovery-proof'],JSON.stringify(proof));
    await assert.rejects(assertRecoveryProof({...options,'recovery-proof-fingerprint':proof.fingerprint}),/proof_invalid/);
    // Repinning a historical source fingerprint must not authorize 013 recovery.
    proof.status='PASS';proof.sourceFingerprint='0'.repeat(64);proof.fingerprint=digest({...proof,fingerprint:undefined});
    await writeFile(options['recovery-proof'],JSON.stringify(proof));
    await assert.rejects(assertRecoveryProof({...options,'recovery-proof-fingerprint':proof.fingerprint}),/proof_invalid/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('shared backup configuration is isolated; shared hosting restore remains rejected',()=>{
  assert.equal(config.kind,'backup');assert.equal(config.roles.capability,'shared-managed');
  assert.throws(()=>operatorConfig({NATIVE_ROLE_PROFILE:roles.profile,NATIVE_HOSTING_CAPABILITY:roles.capability,NATIVE_OPS_ROLE_KIND:'restore'}));
});
test('010 maps only backup SELECT policies and preserves every historical SQL checksum',()=>{
  const local=nativeMigrationManifest();
  for(const profile of ['hosting-test','hosting-production']) {
    const sql=nativeMigrationManifest(profile).find(e=>e.name==='010_backup_select_policies.sql').sql,r=nativeRoles(profile);
    assert.match(sql,new RegExp(`FOR SELECT TO %I`));assert.match(sql,new RegExp(`'${r.backup}'`));
    assert.doesNotMatch(sql,/GRANT[^;]*TO mt_(test|prod)_runtime|DISABLE ROW|NO FORCE|BYPASSRLS|ALTER POLICY|DROP POLICY/);
    assert.match(sql,/NOT p.polpermissive/);assert.match(sql,/'USAGE'/);
    assert.match(sql,/REVOKE EXECUTE ON FUNCTION app.set_release_freeze/);
    assert.equal(sql.replaceAll(/--[^\n]*/g,'').includes("'mt_backup'"),false);
  }
  assert.ok(local.some(e=>e.name==='010_backup_select_policies.sql'));
});
test('011 changes only legacy PUBLIC role scope, retaining predicates and denying unexpected readers',()=>{
  const sql=nativeMigrationManifest('hosting-test').find(e=>e.name==='011_backup_policy_role_scope.sql').sql;
  assert.match(sql,/pol\.polroles=ARRAY\[0::oid\]/);assert.match(sql,/pol\.polpermissive/);
  assert.match(sql,/pol\.polcmd IN \('r','\*'\)/);assert.match(sql,/native_backup_policy_reader_unexpected/);
  assert.match(sql,/ALTER POLICY %I ON app\.%I TO %I,%I/);
  assert.doesNotMatch(sql,/GRANT EXECUTE|DISABLE ROW|NO FORCE|DROP POLICY|ALTER POLICY[^;]*USING/);
  assert.match(sql,/'mt_test_owner','mt_test_runtime'/);
});
test('CHECK canonicalization accepts AND grouping only while preserving bounds, literals, OR, NOT and arithmetic precedence',()=>{
  const canonical=canonicalConstraintDefinition;
  assert.equal(canonical('CHECK (((a > 0 AND a < 10) AND b > 0))'),canonical('CHECK ((a > 0 AND a < 10 AND b > 0))'));
  for(const changed of ['CHECK ((a > 0 AND a < 11 AND b > 0))','CHECK ((a > 0 OR a < 10 AND b > 0))','CHECK (NOT (a > 0 AND a < 10 AND b > 0))'])
    assert.notEqual(canonical('CHECK ((a > 0 AND a < 10 AND b > 0))'),canonical(changed));
  assert.notEqual(canonical('CHECK (((a + b) * c) > 0)'),canonical('CHECK ((a + (b * c)) > 0)'));
  assert.notEqual(canonical("CHECK (body <> 'AND OR')"),canonical("CHECK (body <> 'AND  OR')"));
  assert.notEqual(canonical('CHECK (a > 0) NOT VALID'),canonical('CHECK (a > 0)'));
  assert.equal(canonical('FOREIGN KEY (a) REFERENCES app.users(id)'),'FOREIGN KEY (a) REFERENCES app.users(id)');
});
test('backup coverage checks identity, SELECT-only rights, incoming role edges, FORCE RLS and restrictive policies',async()=>{
  const calls=[];const client={query:async(text,values)=>{calls.push([text,values]);return {rows:[{safe:true}]};}};
  assert.equal((await inspectBackupCoverage(client,roles)).coverage,'ALL_MANAGED_TABLES');
  const [text,values]=calls.at(-1);
  for(const contract of ['session_user=$1','pg_auth_members WHERE roleid','polpermissive','polcmd','relforcerowsecurity','has_sequence_privilege','TRUNCATE','native_backup_select'])assert.ok(text.includes(contract));
  assert.equal(values[0],roles.backup);assert.match(values[2],/CURRENT_USER.*SESSION_USER/);
  await assert.rejects(inspectBackupCoverage({query:async text=>({rows:[{safe:!text.includes('current_user=$1 AND session_user=$1')}]})},roles),/coverage_invalid/);
});
test('shared backup rejects missing existing freeze without changing database or writing a dump',async()=>{
  const calls=[];let tools=0;
  const client={query:async text=>{
    calls.push(text);if(text.includes(' AS safe'))return {rows:[{safe:true}]};
    if(text.includes('to_regclass'))return {rows:[{present:true}]};
    if(text==='SELECT name,checksum FROM native_migrations.ledger ORDER BY name')return {rows:nativeMigrationManifest(roles.profile)};
    if(text.includes('native_ops_lifecycle_state'))return {rows:[{state:{missing:0,pending:0}}]};
    if(text.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
    if(text.includes('native_ops_state'))return {rows:[{state:{frozen:false,revision:0}}]};return {rows:[]};
  }};
  const root=await mkdtemp(join(tmpdir(),'mt-shared-no-freeze-'));await mkdir(join(root,'storage'));
  try {
    await assert.rejects(backupNative(client,config,target,{...await unitProof(root),apply:true,confirmation:`BACKUP disposable ${fingerprint}`,quiesced:'ALL_WORKERS_AND_OPERATORS_STOPPED',storage:join(root,'storage'),output:join(root,'backup')},async()=>{tools++;}),/existing_freeze_required/);
    assert.equal(tools,0);assert.equal(calls.some(s=>s.includes('set_release_freeze')),false);
    assert.ok(calls.at(-1).includes('pg_advisory_unlock'));
    await assert.rejects(restoreNative(client,config,target,{}),/shared_recovery_unavailable/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('inventory rejects missing second owner rows, catalog changes and sequence drift',()=>{
  const inventory={tables:[{schema:'app',name:'media_items',count:2,checksum:digest('A and B')}],sequences:[],catalogChecksum:digest('ACL + FORCE RLS')};
  assertRecoveryInventory(inventory,structuredClone(inventory));
  for(const patch of [{tables:[{...inventory.tables[0],count:1}]},{tables:[{...inventory.tables[0],checksum:digest('A only')}]},{catalogChecksum:digest('weakened ACL')},{sequences:[{identity:'app.seq',last_value:'9'}]}])assert.throws(()=>assertRecoveryInventory({...inventory,...patch},inventory),/inventory_mismatch/);
});
test('shared backup binds dump to exported snapshot and refuses a changed source before writing its manifest',async()=>{
  const keys=['runtime','migrator','privacy_login','owner','auth_owner','auth_access','privacy_operator','limiter','backup','restore','database_owner','ledger_owner'];
  for(const change of [false,true]) {
    const root=await mkdtemp(join(tmpdir(),'mt-shared-snapshot-')),storage=join(root,'storage'),output=join(root,'backup');await mkdir(storage);
    let changed=false,fetched=false;const calls=[];
    const client={query:async text=>{
      calls.push(text);
      if(text.includes(' AS safe'))return {rows:[{safe:true}]};
      if(text.includes('to_regclass'))return {rows:[{present:true}]};
      if(text==='SELECT name,checksum FROM native_migrations.ledger ORDER BY name')return {rows:nativeMigrationManifest(roles.profile)};
      if(text.includes('native_ops_lifecycle_state'))return {rows:[{state:{missing:0,pending:0}}]};
      if(text.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
      if(text.includes('native_ops_state'))return {rows:[{state:{frozen:true,revision:1}}]};
      if(text.includes('AS schema,c.relname AS name'))return {rows:[{schema:'app',name:'media_items'}]};
      if(text.startsWith('DECLARE')){fetched=false;return {rows:[]};}
      if(text.startsWith('FETCH')){if(fetched)return {rows:[]};fetched=true;return {rows:[{row:'{"owner":"A"}'},{row:changed?'{"owner":"B","changed":true}':'{"owner":"B"}'}]};}
      if(text.includes('rolconnlimit AS "limit"'))return {rows:keys.map(key=>({name:roles[key],login:['runtime','migrator','privacy_login','backup','restore'].includes(key),inherit:key==='runtime',limit:key==='runtime'?5:['migrator','privacy_login','backup','restore'].includes(key)?2:-1}))};
      if(text.includes('datname AS name'))return {rows:[{name:roles.database,owner:'provider_owner'}]};
      if(text.includes('pg_export_snapshot'))return {rows:[{snapshot:'00000003-00000001-1'}]};
      return {rows:[]};
    }};
    try {
      const options={...await unitProof(root),apply:true,confirmation:`BACKUP disposable ${fingerprint}`,quiesced:'ALL_WORKERS_AND_OPERATORS_STOPPED',storage,output};
      const tool=async(command,configuration,path)=>{
        assert.equal(command,'pg_dump');assert.equal(configuration.snapshot,'00000003-00000001-1');
        assert.ok(calls.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
        await writeFile(path,'synthetic snapshot dump');changed=change;
      };
      if(change){await assert.rejects(backupNative(client,config,target,options,tool),/inventory_mismatch/);await assert.rejects(readFile(join(output,'manifest.json')));}
      else {await backupNative(client,config,target,options,tool);const manifest=await verifyBackup(output);assert.equal(manifest.inventory.tables[0].count,2);assert.equal(manifest.capability,'shared-managed');}
      assert.equal(calls.some(s=>s.includes('set_release_freeze')),false);assert.ok(calls.at(-1).includes('pg_advisory_unlock'));
    }finally{await rm(root,{recursive:true,force:true});}
  }
});
test('read-only preflight reports the exact 010-013 suffix and always rolls back',async()=>{
  const calls=[];const client={query:async text=>{
    calls.push(text);if(text.includes('to_regclass'))return {rows:[{present:true}]};
    if(text==='SELECT name,checksum FROM native_migrations.ledger ORDER BY name')return {rows:nativeMigrationManifest(roles.profile).slice(0,9)};
    return {rows:[]};
  }};
  const result=await recoveryPreflight(client,config,target);
  assert.deepEqual(result.pending,['010_backup_select_policies.sql','011_backup_policy_role_scope.sql','012_public_signup.sql','013_tvmaze_guest_pool.sql']);assert.equal(result.coverage,'NOT_RUN');
  assert.equal(calls[0],'BEGIN READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');
  assert.ok(!calls.some(s=>/INSERT|UPDATE|set_release_freeze/.test(s)));
});
test('encrypted package restores two private files; wrong key, changed ciphertext and wrong independent fingerprint fail',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mt-native-seal-'));
  try {
    const input=join(root,'backup');await mkdir(input,{mode:0o700});
    const files=[{path:'database.dump',data:'synthetic dump containing both owners'},
      {path:'storage/temporary-uploads/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.tmp',data:''}];
    for(const user of ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])files.push({path:`storage/users/${user}/avatar/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`,data:'private '+user});
    for(const file of files){await mkdir(join(input,file.path,'..'),{recursive:true,mode:0o700});await writeFile(join(input,file.path),file.data,{mode:0o600});}
    const value={format:'MediaTrackerNativeBackupV1',backend:'native',consistency:'write-frozen-operator-quiesced',migrations:nativeMigrationManifest().map(({name,checksum})=>({name,checksum})),files:files.map(f=>({path:f.path,size:Buffer.byteLength(f.data),checksum:digest(f.data)})).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
    value.fingerprint=digest(value);await writeFile(join(input,'manifest.json'),JSON.stringify(value),{mode:0o600});
    const keyPath=join(root,'key');await writeFile(keyPath,Buffer.alloc(32,7),{mode:0o600});const key=await recoveryKey(keyPath);
    const sealed=join(root,'sealed'),result=await sealBackup(input,sealed,key);
    const restored=join(root,'restored');await unsealBackup(sealed,restored,key,result.fingerprint);await verifyBackup(restored);
    for(const file of files)assert.equal(await readFile(join(restored,file.path),'utf8'),file.data);
    await assert.rejects(unsealBackup(sealed,join(root,'wrong-key'),Buffer.alloc(32,1),result.fingerprint));
    await assert.rejects(unsealBackup(sealed,join(root,'wrong-pin'),key,'b'.repeat(64)));
    await writeFile(join(sealed,'database.dump.aes'),'tampered');
    await assert.rejects(unsealBackup(sealed,join(root,'tampered'),key,result.fingerprint),/content_mismatch/);
    await assert.rejects(sealBackup(input,sealed,key));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('PG18 runner forbids remote targets and keeps owner/ACL restore, snapshot export, two-user probes and isolated relay',()=>{
  const source=readFileSync('scripts/native-recovery-proof.mjs','utf8');
  for(const contract of ['postgres:18-alpine','localEndpoints.includes','inspectDisposableTarget','startDisposableRelay','--snapshot=','runtimeIsolation','same-id','recovery_deny','--single-transaction'])assert.ok(source.includes(contract));
  assert.doesNotMatch(source,/docker\(\['pull'|docker\(\['build'|--publish|--no-owner['"]|--no-acl['"]/);
});
