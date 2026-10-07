import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,relative,resolve } from 'node:path';
import { nativePrivacyAdapter,verifyNativeFilesystemAbsent,runNativePrivacyJob } from '../scripts/native-privacy-ops.mjs';
import { cleanupNativeAssets } from '../scripts/native-assets-maintenance.mjs';
import { accountExport,domains,ownerlessTables } from '../lib/privacy/account-export.mjs';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('forged disposable authority and runtime credentials cannot enter erasure',async()=>{
  await assert.rejects(runNativePrivacyJob({client:{},disposableProof:{kind:'runner-owned-disposable',containerId:'a'.repeat(64)}}),/target_unproven/);
  const client={query:async()=>({rows:[{login:'mt_runtime',operator:true}]})};
  await assert.rejects(nativePrivacyAdapter(client,'unused',user).transition(user,'ERASING'),/privacy_ops_denied/);
});
test('operator adapter preserves transition, session revocation function and Auth-last contracts',async()=>{
  const calls=[],client={query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{login:'synthetic_operator',operator:true,result:{auth:[{id:user}],lifecycle:{[user]:'ERASING'}}}]};}};
  const adapter=nativePrivacyAdapter(client,'unused',user);
  await adapter.transition(user,'ERASURE_PENDING');await adapter.assertLocked(user);await adapter.cleanupApplication(user);await adapter.deleteAuth(user);
  const sql=calls.map(c=>c[0]);assert.ok(sql.indexOf('SELECT app.transition_account($1::uuid,$2,$3)')<sql.indexOf('SELECT app.native_privacy_cleanup($1::uuid)'));
  assert.equal(calls.at(-1)[0],'SELECT app.native_privacy_finish($1::uuid,$2)');assert.equal(calls.at(-1)[1][1],`ERASE ACCOUNT ${user}`);
  await assert.rejects(adapter.deleteAuth('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),/target_changed/);
});
test('account export reuses exact allowlists and excludes secrets, unrelated owners and deleted participant messages',()=>{
  const snapshot={schemaVersion:1,synthetic:true,auth:[{id:user,email:'a@example.invalid',password:'never-export'}],assets:[],tables:Object.fromEntries([...Object.keys(domains),...ownerlessTables].map(t=>[t,[]]))};
  snapshot.tables.profiles=[{id:user,username:'synthetic',unknown:'secret',private:'never-export'}];
  snapshot.tables.media_items=[{id:'a',user_id:user,metadata:{token:'never-export',rating:5}},{id:'b',user_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'private B'}];
  const result=accountExport(snapshot,user,'a@example.invalid','2026-10-07T00:00:00Z'),text=JSON.stringify(result);
  assert.doesNotMatch(text,/never-export|private B/);assert.equal(result.categories.profiles[0].unknown,undefined);assert.equal(result.categories.media_items.length,1);
});
test('filesystem verification fails on residual files and removes only empty owned directories',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mt-native-privacy-'));
  try {
    const ownerPath=join(root,'users',user),avatar=join(ownerPath,'avatar');await mkdir(avatar,{recursive:true});await writeFile(join(avatar,'residual'),'synthetic');
    await assert.rejects(verifyNativeFilesystemAbsent(root,user),/storage_residual/);
    await rm(join(avatar,'residual'));await verifyNativeFilesystemAbsent(root,user);await verifyNativeFilesystemAbsent(root,user);
  } finally {const target=resolve(root),rel=relative(resolve(tmpdir()),target);assert.ok(rel.startsWith('mt-native-privacy-')&&!rel.startsWith('..'));await rm(target,{recursive:true,force:true});}
});
test('cleanup failures remain durable and never acknowledge a removed intent',async()=>{
  const calls=[],client={query:async(sql)=>{calls.push(sql);return {rows:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',file_key:'../unsafe'}]};}};
  assert.deepEqual(await cleanupNativeAssets(client,'unused',user),{removed:0,pending:1});assert.equal(calls.length,1);
});
