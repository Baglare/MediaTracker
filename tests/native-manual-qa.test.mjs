import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { verifyPassword } from 'better-auth/crypto';
import { argumentsFor, configFor, fixtures, seed, cleanup, safeCleanup, readSecret, passwords, run } from '../scripts/native-manual-qa.mjs';
import { nativeMigrationManifest } from '../scripts/native-migrations.mjs';
import { digest } from '../scripts/native-ops-target.mjs';
import { domains, ownerlessTables } from '../lib/privacy/account-export.mjs';
const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const users=fixtures(runId);
const identity={environment:'disposable',host:'127.0.0.1',database:'mt_p4_test',role:'mt_test_migrator',server:'127.0.0.1',port:5433,oid:'123',major:18};
const fingerprint=digest(identity);
const env={NATIVE_ROLE_PROFILE:'hosting-test',NATIVE_HOSTING_CAPABILITY:'shared-managed',NATIVE_OPS_ENVIRONMENT:'disposable',NATIVE_OPS_ROLE_KIND:'migrator',
  NATIVE_OPS_SSL_MODE:'verify-full',NATIVE_OPS_SSL_CA_FILE:'/private/ca.pem',NATIVE_OPS_EXPECTED_FINGERPRINT:fingerprint,
  NATIVE_OPS_DATABASE_URL:'postgresql://mt_test_migrator:synthetic@127.0.0.1:5433/mt_p4_test',
  NATIVE_ACCEPTANCE_RUNTIME_URL:'postgresql://mt_test_runtime:synthetic@127.0.0.1:5433/mt_p4_test',
  NATIVE_ACCEPTANCE_CLEANUP_URL:'postgresql://mt_test_privacy_login:synthetic@127.0.0.1:5433/mt_p4_test',
  NATIVE_ACCEPTANCE_HTTP_ORIGIN:'https://test.example.invalid',NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT:fingerprint,NATIVE_STORAGE_ROOT:'/private/storage'};
const args={mode:'create',run:runId,confirmation:`CREATE_MANUAL_QA mt_p4_test ${fingerprint} https://test.example.invalid ${runId}`};
const config=configFor(env,args);
const empty=user=>({schemaVersion:1,auth:user?[user]:[],assets:[],scopedResiduals:[],lifecycle:user?{[user.id]:'ACTIVE'}:{},
  tables:Object.fromEntries([...Object.keys(domains),...ownerlessTables].map(table=>[table,[]]))});
function fake(handler) {const calls=[];return {calls,query:async(sql,v=[])=>{calls.push({sql,v});return handler(sql,v) ?? {rows:[{safe:true}]};}};}
test('offline plan and strict UUID/confirmation parser never connect',async()=>{
  assert.equal((await run(argumentsFor([]),{DATABASE_URL:'production'},{connect:()=>assert.fail()})).mode,'OFFLINE_PLAN');
  assert.notEqual(users[0].id,users[1].id);assert.ok(users.every(u=>u.email.endsWith('@example.invalid')));
  assert.equal(argumentsFor(['--cleanup','--run-id',runId,'--confirmation','x','--user-a',users[0].id,'--user-b',users[1].id]).mode,'cleanup');
  for (const argv of [['--create'],['--cleanup','--run-id',runId,'--confirmation','x'],['--create','--run-id',runId,'--confirmation','x','--password','secret']]) assert.throws(()=>argumentsFor(argv));
  assert.throws(()=>argumentsFor(['--cleanup','--run-id',runId,'--confirmation','x','--user-a',users[1].id,'--user-b',users[0].id]));
  assert.throws(()=>configFor(env,{...args,confirmation:'wrong'}));
});
test('production, wrong DB/role/host/TLS/HTTP pin fail before connection',()=>{
  for (const patch of [{NATIVE_ROLE_PROFILE:'hosting-production'},{NATIVE_OPS_SSL_MODE:'disable'},
    {NATIVE_OPS_DATABASE_URL:env.NATIVE_OPS_DATABASE_URL.replace('mt_p4_test','mediatracker_prod')},
    {NATIVE_ACCEPTANCE_CLEANUP_URL:env.NATIVE_ACCEPTANCE_RUNTIME_URL},{NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT:'b'.repeat(64)},
    {NATIVE_ACCEPTANCE_RUNTIME_URL:env.NATIVE_ACCEPTANCE_RUNTIME_URL.replace('127.0.0.1','example.invalid')},
    {NATIVE_STORAGE_ROOT:undefined}]) assert.throws(()=>configFor({...env,...patch},args));
});
test('wrong operator URLs are rejected by the runner before any connection or password prompt',async()=>{
  for(const variable of ['NATIVE_OPS_DATABASE_URL','NATIVE_ACCEPTANCE_RUNTIME_URL','NATIVE_ACCEPTANCE_CLEANUP_URL']) {
    for(const replacement of [url=>url.replace('mt_p4_test','mediatracker_prod'),url=>url.replace(/mt_test_[a-z_]+:/,'mt_test_backup:')]) {
      let connections=0,prompts=0;
      await assert.rejects(run(args,{...env,[variable]:replacement(env[variable])},{connect:()=>{connections++;},passwords:()=>{prompts++;}}));
      assert.equal(connections,0);assert.equal(prompts,0);
    }
  }
});
test('TTY input echoes no characters; restores raw mode on success, Ctrl-C, EOF and capacity failure',async()=>{
  for (const content of ['synthetic-password\r','\x03','x'.repeat(129)]) {
    const input=new PassThrough(),output=new PassThrough();input.isTTY=true;output.isTTY=true;
    const modes=[];input.setRawMode=value=>modes.push(value);let shown='';output.on('data',v=>shown+=v);
    const promise=readSecret('QA-A',input,output);input.write(content);
    if(content.startsWith('synthetic'))assert.equal(await promise,'synthetic-password');else await assert.rejects(promise);
    assert.deepEqual(modes,[true,false]);assert.doesNotMatch(shown,/synthetic-password|xxx/);assert.equal(input.listenerCount('data'),0);
  }
  const input=new PassThrough(),output=new PassThrough();input.isTTY=true;output.isTTY=true;input.setRawMode=()=>{};
  const pending=readSecret('QA-A',input,output);input.end();await assert.rejects(pending);
  assert.throws(()=>readSecret('QA-A',new PassThrough(),output),/tty/);
  await assert.rejects(passwords(users,async label=>label==='Repeat password'?'different':'synthetic-password'),/mismatch/);
});
test('nonempty DB is preserved; atomic credential inserts use real Better Auth hash/accountId',async()=>{
  const db=fake(sql=>sql.startsWith('SELECT id,email,name')?{rows:[]}:undefined);
  await seed(db,config,users,['synthetic-password-a','synthetic-password-b']);
  assert.equal(db.calls.at(-1).sql,'COMMIT');assert.ok(!db.calls.some(c=>c.sql.includes('count(*)')));
  for(const [i,call] of db.calls.filter(c=>c.sql.startsWith('INSERT INTO native_auth.account')).entries()) {
    assert.equal(call.v[1],users[i].id);assert.equal(await verifyPassword({password:`synthetic-password-${i?'b':'a'}`,hash:call.v[2]}),true);
    assert.match(call.sql,/'credential',\$2::uuid/);
  }
  for (const failure of ['collision-id','collision-email','second']) {
    const broken=fake((sql,v)=>{if(sql.startsWith('SELECT id,email,name'))return {rows:failure==='collision-id'?[{...users[0],email:'other@example.invalid'}]:failure==='collision-email'?[{...users[0],id:users[1].id}]:[]};
      if(failure==='second'&&sql.startsWith('INSERT INTO native_auth.account')&&v[1]===users[1].id)throw new Error('secret');});
    await assert.rejects(seed(broken,config,users,['synthetic-password-a','synthetic-password-b']));assert.equal(broken.calls.at(-1).sql,'ROLLBACK');
    if(failure.startsWith('collision'))assert.ok(!broken.calls.some(c=>c.sql.startsWith('INSERT')));
  }
});
test('cleanup permits owned personal data/XP children; blocks foreign participant and assets',()=>{
  const s=empty(users[0]);s.tables.media_items=[{user_id:users[0].id,id:'manual-record'}];s.tables.xp_events=[{user_id:users[0].id,id:'event'}];s.tables.xp_event_allocations=[{event_id:'event'}];safeCleanup(s,users[0]);
  for (const mutate of [s=>s.assets.push({}),s=>s.auth[0].email='real@example.com',s=>s.scopedResiduals.push({}),
    s=>s.tables.media_items.push({user_id:users[1].id}),s=>s.tables.social_notifications.push({recipient_id:users[0].id,actor_id:users[1].id}),
    s=>s.tables.xp_event_allocations.push({event_id:'foreign'})]) {const copy=structuredClone(s);mutate(copy);assert.throws(()=>safeCleanup(copy,users[0]));}
});
test('cleanup follows existing privacy stages by UUID; second-account failure rolls back both',async()=>{
  for(const failure of [false,true]) {
    const states=new Map(users.map(u=>[u.id,empty(u)]));
    const operator=fake((sql,v)=>sql.startsWith('SELECT id,email,name')?{rows:[users.find(u=>u.id===v[0])]}:undefined);
    const privacy=fake((sql,v)=>{
      if(sql.includes('session_user AS login'))return {rows:[{login:'mt_test_privacy_login',operator:true}]};
      if(sql.includes('native_privacy_inspect'))return {rows:[{result:structuredClone(states.get(v[0]))}]};
      if(sql.includes('transition_account'))states.get(v[0]).lifecycle[v[0]]=v[1];
      if(sql.includes('native_privacy_finish')) {if(failure&&v[0]===users[1].id)throw new Error('synthetic secret');states.set(v[0],empty());}
    });
    if(failure)await assert.rejects(cleanup(privacy,operator,config,users,async()=>{}));else await cleanup(privacy,operator,config,users,async()=>{});
    assert.equal(privacy.calls.at(-1).sql,failure?'ROLLBACK':'COMMIT');
    assert.ok(privacy.calls.every(c=>!/^DELETE|^GRANT|^TRUNCATE/.test(c.sql)));
    assert.ok(privacy.calls.filter(c=>c.sql.includes('native_privacy_finish')).every(c=>users.some(u=>u.id===c.v[0])));
  }
});
test('mismatched name or unsafe second snapshot blocks cleanup before transitions; absence is idempotent',async()=>{
  for (const failure of ['name','second','absent']) {
    const operator=fake((sql,v)=>sql.startsWith('SELECT id,email,name')?{rows:failure==='absent'?[]:[{...users.find(u=>u.id===v[0]),...(failure==='name'?{name:'foreign'}:{})}]}:undefined);
    const privacy=fake((sql,v)=>{
      if(sql.includes('session_user AS login'))return {rows:[{login:'mt_test_privacy_login',operator:true}]};
      if(sql.includes('native_privacy_inspect')) {
        const snapshot=empty(failure==='absent'?null:users.find(u=>u.id===v[0]));
        if(failure==='second'&&v[0]===users[1].id)snapshot.tables.profile_follows=[{follower_id:v[0],following_id:'foreign'}];
        return {rows:[{result:snapshot}]};
      }
    });
    if(failure==='absent')await cleanup(privacy,operator,config,users,async()=>{});
    else await assert.rejects(cleanup(privacy,operator,config,users,async()=>{}));
    assert.ok(!privacy.calls.some(c=>c.sql.includes('transition_account')||c.sql.includes('native_privacy_cleanup')));
    if(failure==='absent')assert.equal(privacy.calls.at(-1).sql,'COMMIT');
  }
});
function runner(failure) {
  const calls=[],records=new Map([['foreign',{id:'foreign',email:'existing@example.invalid'}]]);
  let prompts=0;
  const connect=async url=>{
    const role=url.username;
    if(failure==='privacy'&&role==='mt_test_privacy_login')throw new Error('secret');
    return fake((sql,v)=>{
      calls.push({sql,v,role});
      if(sql.includes('pg_stat_ssl'))return {rows:[{...identity,role:failure==='role'?'mt_test_backup':role,database:failure==='database'?'mediatracker_prod':identity.database,
        version:180006,ssl:failure!=='tls',allowed:true,oid:failure==='oid'?'999':'123'}]};
      if(sql==='SELECT session_user AS login')return {rows:[{login:role}]};
      if(sql.includes("to_regclass('native_migrations.ledger')"))return {rows:[{present:true}]};
      if(sql.startsWith('SELECT name,checksum'))return {rows:nativeMigrationManifest('hosting-test').map(({name,checksum})=>({name,checksum:failure==='migration'?'bad':checksum}))};
      if(sql.includes(' AS dirty'))return {rows:[{dirty:true}]};
      if(sql.includes(' AS safe'))return {rows:[{safe:failure!=='permission'}]};
      if(sql.includes('native_ops_state'))return {rows:[{state:{frozen:failure==='freeze'}}]};
      if(sql.includes('native_runtime_ready'))return {rows:[{ready:true}]};
      if(sql.startsWith('SELECT id,email,name'))return {rows:records.has(v[0])?[records.get(v[0])]:[]};
      if(sql.includes('native_privacy_inspect'))return {rows:[{result:empty(records.get(v[0]))}]};
      if(sql.startsWith('INSERT INTO native_auth."user"'))records.set(v[0],{id:v[0],name:v[1],email:v[2]});
    });
  };
  return {connect,calls,records,storageCheck:async()=>{if(failure==='storage')throw new Error('secret');},passwords:async()=>{prompts++;return ['synthetic-password-a','synthetic-password-b'];},get prompts(){return prompts;}};
}
test('all live preflight failures block before prompting/inserts; reports redact diagnostics',async()=>{
  for(const failure of ['privacy','tls','oid','migration','permission','freeze','storage','fingerprint','role','database']) {
    const f=runner(failure),patched=failure==='fingerprint'?{...env,NATIVE_OPS_EXPECTED_FINGERPRINT:'b'.repeat(64),NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT:'b'.repeat(64)}:env;
    const report=await run({...args,confirmation:args.confirmation.replace(fingerprint,patched.NATIVE_OPS_EXPECTED_FINGERPRINT)},patched,f);
    assert.equal(report.status,'BLOCKED',failure);assert.equal(f.prompts,0,failure);assert.ok(!f.calls.some(c=>c.sql.startsWith('INSERT')));assert.doesNotMatch(JSON.stringify(report),/secret|postgresql|password/);
  }
});
test('successful runner retains two QA accounts plus existing user; passwords absent from output',async()=>{
  const f=runner();const report=await run(args,env,f);assert.equal(report.creation,'PASS');assert.equal(f.records.size,3);assert.ok(f.records.has('foreign'));
  assert.equal(f.prompts,1);assert.doesNotMatch(JSON.stringify(report),/synthetic-password|hash|postgresql/);
});
