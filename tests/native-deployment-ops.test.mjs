import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operatorConfig, inspectTarget, authorizeTarget, digest } from '../scripts/native-ops-target.mjs';
import { validateHistory, runMigrations, parseOperatorArgs } from '../scripts/native-migration-runner.mjs';
import { nativeMigrationManifest } from '../scripts/native-migrations.mjs';
import { validateBackupManifest, verifyBackup, restoreNative, backupNative } from '../scripts/native-recovery.mjs';
import { forbiddenArtifactPath } from '../scripts/native-package.mjs';
const env={NATIVE_OPS_ENVIRONMENT:'disposable',NATIVE_OPS_DATABASE_URL:'postgresql://operator:synthetic@127.0.0.1:1/p3_test',NATIVE_OPS_SSL_MODE:'disable'};
const config=operatorConfig(env),target={fingerprint:'a'.repeat(64),environment:'disposable',operator:true,provisioner:true};
const proven={...config,expected:target.fingerprint};
const manifest=nativeMigrationManifest().map(({name,checksum})=>({name,checksum}));
const backup=()=>{const value={format:'MediaTrackerNativeBackupV1',backend:'native',consistency:'write-frozen-operator-quiesced',migrations:manifest,
  files:[{path:'database.dump',size:14,checksum:digest('synthetic dump')}]};return {...value,fingerprint:digest(value)};};
test('operator configuration never falls back to runtime credentials or an unspecified environment',()=>{
  assert.throws(()=>operatorConfig({DATABASE_URL:env.NATIVE_OPS_DATABASE_URL}));
  for(const patch of [{NATIVE_OPS_ENVIRONMENT:'unknown'},{NATIVE_OPS_DATABASE_URL:env.NATIVE_OPS_DATABASE_URL.replace('operator:','mt_runtime:')},
    {NATIVE_OPS_ENVIRONMENT:'production'},{NATIVE_OPS_DATABASE_URL:env.NATIVE_OPS_DATABASE_URL+'?sslmode=disable'}])assert.throws(()=>operatorConfig({...env,...patch}));
});
test('target fingerprint proves actual role/database and never contains credential material',async()=>{
  const client={query:async()=>({rows:[{database:'p3_test',role:'operator',version:180006,address:'127.0.0.1',port:5432,oid:'1',operator:true,provisioner:true}]})};
  const inspected=await inspectTarget(client,config);
  assert.match(inspected.fingerprint,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(inspected).includes('synthetic'));
  await assert.rejects(inspectTarget(client,{...config,url:new URL('postgresql://other:private@127.0.0.1/p3_test')}));
});
test('every apply requires exact fingerprint, environment, capability and operation confirmation',()=>{
  authorizeTarget(target,proven,{operation:'MIGRATE',apply:true,confirmation:`MIGRATE disposable ${target.fingerprint}`,provisioner:true});
  for(const patch of [{expected:undefined},{expected:'b'.repeat(64)},{environment:'production'}])assert.throws(()=>authorizeTarget(target,{...proven,...patch},{operation:'MIGRATE'}));
  assert.throws(()=>authorizeTarget(target,proven,{operation:'MIGRATE',apply:true,confirmation:`BACKUP disposable ${target.fingerprint}`}));
  assert.throws(()=>authorizeTarget({...target,operator:false},proven,{operation:'BACKUP',operator:true}));
  assert.throws(()=>authorizeTarget({...target,environment:'production'},{...proven,environment:'production'},{operation:'RESTORE'}));
});
test('ledger rejects historical checksum drift, holes, reordering and unknown future migrations',()=>{
  assert.equal(validateHistory(manifest).length,0);assert.equal(validateHistory(manifest.slice(0,3)).length,6);
  for(const rows of [[manifest[1]],[{...manifest[0],checksum:'b'.repeat(64)}],[...manifest,{name:'future',checksum:'a'.repeat(64)}]])assert.throws(()=>validateHistory(rows));
  assert.deepEqual(JSON.parse(readFileSync('lib/backend/native-migration-state.json','utf8')),manifest);
});
test('migration plan has no mutation; rejected confirmation performs zero SQL',async()=>{
  let calls=0;const client={query:async text=>{calls++;return text.includes('to_regclass')?{rows:[{present:true}]}:{rows:manifest};}};
  assert.deepEqual((await runMigrations(client,proven,target)).pending,[]);
  const before=calls;await assert.rejects(runMigrations(client,proven,target,{apply:true}));assert.equal(calls,before);
});
test('failed migration rolls back, unlocks and never inserts its ledger entry',async()=>{
  const calls=[];const client={query:async text=>{
    calls.push(text);if(text.includes('to_regclass'))return {rows:[{present:true}]};
    if(text==='SELECT name,checksum FROM native_migrations.ledger ORDER BY name')return {rows:manifest.slice(0,8)};
    if(text.includes('CREATE FUNCTION app.native_migration_state'))throw new Error('private SQL/password');return {rows:[]};}};
  await assert.rejects(runMigrations(client,proven,target,{apply:true,confirmation:`MIGRATE disposable ${target.fingerprint}`}),/^Error: native_migration_apply_failed$/);
  assert.ok(calls.includes('ROLLBACK'));assert.ok(calls.at(-1).includes('pg_advisory_unlock'));assert.ok(!calls.some(s=>s.startsWith('INSERT INTO native_migrations')));
});
test('CLI rejects unknown flags, accidental apply and missing values',()=>{
  for(const args of [['--apply'],['--confirmation'],['--remote'],['--input','--apply'],['--connect','--connect']])assert.throws(()=>parseOperatorArgs(args,['--input']));
});
test('restore fails production authority and wrong backup before database mutation',async()=>{
  let calls=0;const client={query:async()=>{calls++;throw new Error('unexpected SQL');}};
  await assert.rejects(restoreNative(client,{...proven,environment:'production'},{...target,environment:'production'},{apply:true,confirmation:`RESTORE production ${target.fingerprint}`}));
  assert.equal(calls,0);
});
test('backup requires quiescence before freeze, files or subprocess work',async()=>{
  const client={query:async text=>text.includes('to_regclass')?{rows:[{present:true}]}:text.includes(' AS safe')?{rows:[{safe:true}]}:
    text.includes('native_ops_lifecycle_state')?{rows:[{state:{missing:0,pending:0}}]}:{rows:manifest}};
  await assert.rejects(backupNative(client,proven,target,{apply:true,confirmation:`BACKUP disposable ${target.fingerprint}`}),/quiescence/);
});
test('synthetic backup and disposable restore preserve ledger, files and freeze without invoking PostgreSQL',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mt-p3-roundtrip-'));
  const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg';
  const storage=join(root,'storage'),output=join(root,'backup'),restored=join(root,'restored');
  let frozen=false,dump=0,restore=0;
  const client={query:async (text,values)=>{
    if(text.includes('to_regclass'))return {rows:[{present:true}]};
    if(text==='SELECT name,checksum FROM native_migrations.ledger ORDER BY name')return {rows:manifest};
    if(text.includes(' AS safe'))return {rows:[{safe:true}]};
    if(text.includes('native_ops_lifecycle_state'))return {rows:[{state:{pending:1,missing:0}}]};
    if(text.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
    if(text.includes('native_ops_state'))return {rows:[{state:{frozen,revision:0}}]};
    if(text.includes('set_release_freeze')){frozen=values?.[0]===true||text.includes('(true,');return {rows:[]};}
    if(text.includes('native_ops_assets'))return {rows:[{file_key:key,size:3}]};
    if(text.includes(' AS occupied'))return {rows:[{occupied:false}]};
    return {rows:[]};
  }};
  const tool=async command=>{if(command==='pg_dump'){dump++;await writeFile(join(output,'database.dump'),'synthetic dump only');}else restore++;};
  try {
    await mkdir(join(storage,'users',key.substring(0,key.lastIndexOf('/'))),{recursive:true});
    await writeFile(join(storage,'users',key),'abc');await mkdir(restored);
    const result=await backupNative(client,proven,target,{apply:true,confirmation:`BACKUP disposable ${target.fingerprint}`,quiesced:'ALL_WORKERS_AND_OPERATORS_STOPPED',storage,output},tool);
    assert.equal(result.writeState,'FROZEN');assert.equal(dump,1);const verified=await verifyBackup(output);
    const recovered=await restoreNative(client,proven,target,{apply:true,confirmation:`RESTORE disposable ${target.fingerprint}`,quiesced:'ALL_WORKERS_AND_OPERATORS_STOPPED',storage:restored,input:output,'backup-fingerprint':verified.fingerprint},tool);
    assert.equal(recovered.status,'RESTORED_FROZEN');assert.equal(recovered.databaseState.pendingPrivacyAccounts,1);assert.equal(restore,1);
    assert.equal(readFileSync(join(restored,'users',key),'utf8'),'abc');
    await assert.rejects(restoreNative(client,proven,target,{storage:restored,input:output,'backup-fingerprint':verified.fingerprint}));
  } finally {await rm(root,{recursive:true,force:true});}
});
test('backup manifest rejects traversal, secrets, duplicates, incomplete ledger and tampering',()=>{
  validateBackupManifest(backup());
  for(const path of ['../secret','.env','storage/../../private','storage/users/no-identity.jpg','database.dump/../secret']) {
    const value=backup();value.files[0].path=path;value.fingerprint=digest({...value,fingerprint:undefined});assert.throws(()=>validateBackupManifest(value));
  }
  const tampered=backup();tampered.files[0].size=100;assert.throws(()=>validateBackupManifest(tampered));
});
test('backup verifier checks streamed file contents and rejects residual unexpected files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mt-p3-recovery-'));
  try {
    await writeFile(join(root,'database.dump'),'synthetic dump');await writeFile(join(root,'manifest.json'),JSON.stringify(backup()));
    await verifyBackup(root);await writeFile(join(root,'database.dump'),'tamper');await assert.rejects(verifyBackup(root));
    await writeFile(join(root,'database.dump'),'synthetic dump');await mkdir(join(root,'private'));await writeFile(join(root,'private','extra'),'secret');await assert.rejects(verifyBackup(root));
  } finally {await rm(root,{recursive:true,force:true});}
});
test('deployment artifact path rejects secrets, validation trees, tests and caches',()=>{
  for(const path of ['.git/config','.env.local','lib/.env','node_modules/pkg/__tests__/a.js','.codex/check/server.js','backups/db.dump','tests/a.ts','lib/a.test.ts','.cache/x'])assert.equal(forbiddenArtifactPath(path),true);
  for(const path of ['server.js','.next/static/chunks/a.js','node_modules/next/dist/server/next-server.js','public/icon.png'])assert.equal(forbiddenArtifactPath(path),false);
});
test('deployment SQL privileges remain separate from runtime and no historical migration changed',()=>{
  const sql=readFileSync('database/native/009_deployment_operations.sql','utf8');
  assert.match(sql,/SET search_path=pg_catalog/);assert.doesNotMatch(sql,/GRANT.*native_ops[^;]*TO mt_runtime/);
  assert.match(sql,/cardinality\(p_ids\)>500/);assert.match(sql,/LIMIT 10001/);
});
