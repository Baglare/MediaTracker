import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifyPassword } from 'better-auth/crypto';
import { nativeMigrationManifest } from '../scripts/native-migrations.mjs';
import { digest } from '../scripts/native-ops-target.mjs';
import { argumentsFor, configFor, fixtures, run, seed, inspectSeed, inspectCleanup,
  cleanup, safeSnapshot, sessionCookie, http, rlsAcceptance } from '../scripts/native-auth-rls-acceptance.mjs';

const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const identity={environment:'disposable',host:'127.0.0.1',database:'mt_p4_test',role:'mt_test_migrator',
  server:'127.0.0.1',port:5433,oid:'123',major:18};
const fingerprint=digest(identity);
const env={NATIVE_ROLE_PROFILE:'hosting-test',NATIVE_HOSTING_CAPABILITY:'shared-managed',
  NATIVE_OPS_ENVIRONMENT:'disposable',NATIVE_OPS_ROLE_KIND:'migrator',NATIVE_OPS_SSL_MODE:'verify-full',
  NATIVE_OPS_SSL_CA_FILE:'/private/ca.pem',NATIVE_OPS_EXPECTED_FINGERPRINT:fingerprint,
  NATIVE_OPS_DATABASE_URL:'postgresql://mt_test_migrator:synthetic@127.0.0.1:5433/mt_p4_test',
  NATIVE_ACCEPTANCE_RUNTIME_URL:'postgresql://mt_test_runtime:synthetic@127.0.0.1:5433/mt_p4_test',
  NATIVE_ACCEPTANCE_CLEANUP_URL:'postgresql://mt_test_privacy_login:synthetic@127.0.0.1:5433/mt_p4_test',
  NATIVE_ACCEPTANCE_HTTP_ORIGIN:'https://test.example.invalid',NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT:fingerprint,
  NATIVE_STORAGE_ROOT:'/private/storage'};
const args={mode:'execute',run:runId,confirmation:`AUTH_RLS mt_p4_test ${fingerprint} https://test.example.invalid ${runId}`};
const config=configFor(env,args), users=fixtures(runId);
function snapshot(user) {return {auth:[{id:user.id,email:user.email}],assets:[],scopedResiduals:[],tables:{
  media_items:[{id:`mt-auth-rls-${runId}-a`,user_id:user.id}],progress_logs:[],goals:[]}};}
function fake(query) {const calls=[];return {calls,query:async(sql,values)=>{
  calls.push({sql,values});return query(sql,values) ?? {rows:[{safe:true}]};}};}

test('default plan never connects or performs HTTP, even with malformed production environment',async()=>{
  const connect=()=>{throw new Error('must never connect');};
  const report=await run(argumentsFor([]),{DATABASE_URL:'production'}, {connect,request:connect});
  assert.equal(report.mode,'OFFLINE_PLAN');assert.equal(report.mutation,'NOT_PERFORMED');
  assert.equal(report.httpCloudSync,'BLOCKED');
});
test('parser and confirmation reject missing approval, reused run/target and extra arguments',()=>{
  for(const value of [['--execute'],['--recover'],['--connect'],['--plan','--execute']]) assert.throws(()=>argumentsFor(value));
  assert.equal(argumentsFor(['--execute','--run-id',runId,'--confirmation',args.confirmation]).run,runId);
  for(const patch of [{confirmation:''},{run:randomUUID()},{mode:'recover'}]) assert.throws(()=>configFor(env,{...args,...patch}));
});
test('all URLs, role kinds, test database, HTTPS and fingerprints are pinned before connections',()=>{
  for(const patch of [{NATIVE_ROLE_PROFILE:'hosting-production'},{NATIVE_OPS_SSL_MODE:'disable'},
    {NATIVE_ACCEPTANCE_HTTP_ORIGIN:'http://test.example.invalid'}, {NATIVE_ACCEPTANCE_HTTP_ORIGIN:'https://user:secret@test.example.invalid'},
    {NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT:'b'.repeat(64)}, {NATIVE_ACCEPTANCE_CLEANUP_URL:undefined},
    {NATIVE_STORAGE_ROOT:undefined}, {NATIVE_ACCEPTANCE_RUNTIME_URL:env.NATIVE_OPS_DATABASE_URL},
    {NATIVE_ACCEPTANCE_CLEANUP_URL:env.NATIVE_ACCEPTANCE_CLEANUP_URL.replace('mt_p4_test','mediatracker_prod')},
    {NATIVE_ACCEPTANCE_CLEANUP_URL:env.NATIVE_ACCEPTANCE_CLEANUP_URL.replace('127.0.0.1','example.invalid')}])
    assert.throws(()=>configFor({...env,...patch},args));
});
test('recovery derives only two exact UUID/email/name markers from the run; no broad email pattern',()=>{
  assert.deepEqual(fixtures(runId),users);assert.notEqual(users[0].id,users[1].id);
  assert.notDeepEqual(fixtures(randomUUID()),users);assert.ok(users.every(u=>u.email.endsWith('@example.invalid')));
  assert.throws(()=>fixtures('../anything'));
});
test('seed has real Better Auth hashes, atomic rollback and no runtime SET ROLE',async()=>{
  const sample=users.map(u=>({...u,password:randomUUID()}));
  const db=fake(sql=>sql.includes('count(*)') ? {rows:[{count:0}]} : undefined);
  await seed(db,config,sample);
  for(const call of db.calls.filter(c=>c.sql.startsWith('INSERT INTO native_auth.account'))) {
    const user=sample.find(u=>u.id===call.values[1]);
    assert.equal(await verifyPassword({hash:call.values[2],password:user.password}),true);
    assert.equal(await verifyPassword({hash:call.values[2],password:'incorrect'}),false);
    assert.notEqual(call.values[2],user.password);
  }
  assert.equal(db.calls.at(-1).sql,'COMMIT');
  assert.ok(db.calls.every(c=>!c.sql.includes('SET LOCAL ROLE mt_test_runtime')));
  const failure=fake(sql=>{if(sql.startsWith('INSERT INTO native_auth.account'))throw new Error('synthetic');
    if(sql.includes('count(*)'))return {rows:[{count:0}]};});
  await assert.rejects(seed(failure,config,sample));assert.equal(failure.calls.at(-1).sql,'ROLLBACK');
  assert.equal(failure.calls.some(c=>c.sql==='COMMIT'),false);
});
test('nonempty Auth DB and unavailable fixture privileges block without DML',async()=>{
  for(const failure of ['permission','nonempty']) {
    const db=fake(sql=>sql.includes('count(*)') ? {rows:[{count:1}]} : {rows:[{safe:failure!=='permission'}]});
    await assert.rejects(inspectSeed(db,config,users));
    assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.equal(db.calls.some(c=>/^INSERT|^DELETE/.test(c.sql)),false);
  }
});
test('cleanup login checks its own TLS/DB/server/OID/role and EXECUTE privileges, read-only',async()=>{
  for(const failure of ['db','tls','oid','permission','freeze']) {
    const db=fake(sql=>sql.includes('pg_stat_ssl') ? {rows:[{database:failure==='db'?'mediatracker_prod':'mt_p4_test',
      role:'mt_test_privacy_login',server:'127.0.0.1',port:5433,oid:failure==='oid'?'999':'123',ssl:failure!=='tls',allowed:true}]}
      : sql.includes('native_ops_state') ? {rows:[{state:{frozen:failure==='freeze'}}]} : {rows:[{safe:failure!=='permission'}]});
    await assert.rejects(inspectCleanup(db,config,identity));
    assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.equal(db.calls.some(c=>/^INSERT|^DELETE/.test(c.sql)),false);
  }
});
test('cleanup rejects foreign records, assets, social data and unrelated synthetic records',()=>{
  for(const mutate of [s=>s.auth[0].email='real@example.com',s=>s.assets.push({}),s=>s.scopedResiduals.push({}),
    s=>s.tables.profiles=[{}],s=>s.tables.media_items[0].user_id=users[1].id,
    s=>s.tables.media_items[0].id='unrelated']) {
    const s=snapshot(users[0]);mutate(s);assert.throws(()=>safeSnapshot(s,users[0],runId));
  }
  safeSnapshot(snapshot(users[0]),users[0],runId);
});
test('recovery marker mismatch blocks deletion; absent fixture is idempotent',async()=>{
  const operator=fake(sql=>sql.startsWith('SELECT id,email,name') ? {rows:[{...users[0],name:'foreign'}]} : undefined);
  const privacy=fake(()=>undefined);
  await assert.rejects(cleanup(privacy,operator,config,users,runId,async()=>{}));assert.equal(privacy.calls.length,0);
  const absent=fake(sql=>sql.startsWith('SELECT id,email,name') ? {rows:[]} : undefined);
  const gone=fake(sql=>sql.includes('native_privacy_inspect') ? {rows:[{result:{auth:[],assets:[],scopedResiduals:[],tables:{}}}]} : undefined);
  await cleanup(gone,absent,config,users,runId,async()=>{});
  assert.equal(gone.calls.at(-1).sql,'COMMIT');assert.equal(gone.calls.some(c=>c.sql.includes('transition_account')),false);
});
test('cleanup transaction rolls back both accounts if storage inspection or second deletion fails',async()=>{
  for(const failure of ['storage','second']) {
    const operator=fake((sql,v)=>sql.startsWith('SELECT id,email,name') ? {rows:[users.find(u=>u.id===v[0])]} : undefined);
    const deleted=new Set();const db=fake((sql,v)=>{
      if(sql.includes('native_privacy_inspect')) return {rows:[{result:deleted.has(v[0]) ? {auth:[],assets:[],scopedResiduals:[],tables:{}} : snapshot(users.find(u=>u.id===v[0]))}]};
      if(sql.includes('native_privacy_finish')) {if(failure==='second'&&v[0]===users[1].id)throw new Error('synthetic');deleted.add(v[0]);}
    });
    await assert.rejects(cleanup(db,operator,config,users,runId,async()=>{if(failure==='storage')throw new Error('unsafe');}));
    assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.equal(db.calls.some(c=>c.sql==='COMMIT'),false);
    assert.equal(db.calls.some(c=>/^DELETE|^TRUNCATE|^GRANT/.test(c.sql)),false);
  }
});
test('cookie rejects missing HttpOnly/Secure/SameSite and wide domain',()=>{
  const cookie='__Secure-mt-native.session_token=synthetic; Path=/; Secure; HttpOnly; SameSite=Lax';
  assert.equal(sessionCookie(new Response(null,{headers:{'Set-Cookie':cookie}})),'__Secure-mt-native.session_token=synthetic');
  for(const bad of [cookie.replace('Secure; ',''),cookie.replace('HttpOnly; ',''),cookie.replace('SameSite=Lax','SameSite=None'),cookie+'; Domain=example.invalid'])
    assert.throws(()=>sessionCookie(new Response(null,{headers:{'Set-Cookie':bad}})));
});
test('HTTP redirects, body limits and timeouts are bounded; secret response never becomes report',async()=>{
  await assert.rejects(http(config,'/api/auth/get-session',{},async(_url,options)=>{
    assert.equal(options.redirect,'error');assert.ok(options.signal);return new Response('x'.repeat(65537));}),/capacity/);
});
test('wrong live fingerprint blocks before fixture writes, HTTP and runtime connections',async()=>{
  const db=fake(sql=>{
    if(sql.includes('pg_stat_ssl'))return {rows:[{...identity,version:180006,ssl:true}]};
    if(sql.includes("to_regclass('native_migrations.ledger')"))return {rows:[{present:true}]};
    if(sql.startsWith('SELECT name,checksum'))return {rows:nativeMigrationManifest('hosting-test').map(({name,checksum})=>({name,checksum}))};
    if(sql==='SELECT session_user AS login')return {rows:[{login:'mt_test_migrator'}]};
    if(sql.includes(' AS dirty'))return {rows:[{dirty:true}]};
  });
  const badEnv={...env,NATIVE_OPS_EXPECTED_FINGERPRINT:'b'.repeat(64),NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT:'b'.repeat(64)};
  let connections=0;
  const report=await run({...args,confirmation:args.confirmation.replace(fingerprint,'b'.repeat(64))},badEnv,
    {connect:async()=>{connections++;return db;},request:async()=>{throw new Error('must not call');}});
  assert.equal(report.preflight,'BLOCKED');assert.equal(report.mutation,'NOT_PERFORMED');assert.equal(connections,1);
  assert.equal(db.calls.some(c=>/^INSERT|^DELETE/.test(c.sql)),false);
});
test('RLS executor fails on a leaked cross-owner row and rolls back unexpected SQL errors',async()=>{
  const sessions=users.map(u=>({id:u.id}));
  const dbs=users.map(user=>fake(sql=>sql.includes('SELECT user_id,revision') ? {rows:[{user_id:users.find(u=>u.id!==user.id).id,revision:1}]}
    : sql.includes('apply_cloud_goal') ? {rows:[{result:{status:'applied'}}]} : {rows:[{result:{ok:true}}]}));
  dbs.push(fake(()=>({rows:[]})));
  await assert.rejects(rlsAcceptance(dbs,sessions,users,runId),/rls_read/);
  assert.equal(dbs[0].calls.at(-1).sql,'ROLLBACK');
});

function runnerFixture(failure) {
  const records=new Map(),calls=[];let httpCalls=0;
  const connect=async url=>{
    const role=decodeURIComponent(url.username);
    if(failure==='missing-privacy'&&role==='mt_test_privacy_login')throw new Error('synthetic_connection_secret');
    return {query:async(sql,v=[])=>{
      calls.push({role,sql});
      if(sql.includes('pg_stat_ssl'))return {rows:[{...identity,role,version:180006,ssl:true,allowed:true}]};
      if(sql==="SELECT session_user AS login")return {rows:[{login:role}]};
      if(sql.includes("to_regclass('native_migrations.ledger')"))return {rows:[{present:true}]};
      if(sql.startsWith('SELECT name,checksum'))return {rows:nativeMigrationManifest('hosting-test').map(({name,checksum})=>({name,checksum}))};
      if(sql.includes(' AS dirty'))return {rows:[{dirty:true}]};
      if(sql.includes(' AS safe'))return {rows:[{safe:true}]};
      if(sql.includes('native_ops_state'))return {rows:[{state:{frozen:false}}]};
      if(sql.includes('native_runtime_ready'))return {rows:[{ready:true}]};
      if(sql.includes('count(*)')&&sql.includes('native_auth."user"'))return {rows:[{count:records.size}]};
      if(sql.startsWith('SELECT id,email,name'))return {rows:records.has(v[0])?[records.get(v[0])]:[]};
      if(sql.startsWith('INSERT INTO native_auth."user"'))records.set(v[0],{id:v[0],name:v[1],email:v[2]});
      if(sql.includes('native_privacy_inspect'))return {rows:[{result:records.has(v[0])
        ? {auth:[records.get(v[0])],assets:[],scopedResiduals:[],tables:{}}
        : {auth:[],assets:[],scopedResiduals:[],tables:{}}}]};
      if(sql.includes('native_privacy_finish')) {
        if(failure==='cleanup')throw new Error('SQL secret password token');records.delete(v[0]);
      }
      return {rows:[]};
    }};
  };
  const request=async()=>{httpCalls++;return {response:new Response(null,{status:503}),data:null};};
  return {records,calls,connect,request,storageCheck:async()=>{},get httpCalls(){return httpCalls;}};
}
test('runner blocks unavailable cleanup credentials before users, runtime or HTTP',async()=>{
  const f=runnerFixture('missing-privacy');const report=await run(args,env,f);
  assert.equal(report.preflight,'BLOCKED');assert.equal(f.httpCalls,0);assert.equal(f.records.size,0);
  assert.equal(f.calls.some(c=>/^INSERT/.test(c.sql)),false);
});
test('runner HTTP failure always performs scoped cleanup and keeps Cloud BLOCKED',async()=>{
  const f=runnerFixture('http');const report=await run(args,env,f);
  assert.equal(report.preflight,'PASS');assert.equal(report.httpAuth,'FAIL');assert.equal(report.dbRls,'BLOCKED');
  assert.equal(report.cleanup,'PASS');assert.equal(report.mutation,'FIXTURES_REMOVED');
  assert.equal(report.httpCloudSync,'BLOCKED');assert.equal(f.records.size,0);
  assert.equal(f.calls.filter(c=>c.role==='mt_test_runtime'&&c.sql==='BEGIN READ ONLY').length,3);
  assert.equal(f.calls.some(c=>/^GRANT|^ALTER|^TRUNCATE/.test(c.sql)),false);
});
test('runner cleanup failure retains recovery run ID, does not leak SQL diagnostics, and never claims PASS',async()=>{
  const f=runnerFixture('cleanup');const report=await run(args,env,f);
  assert.equal(report.cleanup,'FAIL');assert.equal(report.mutation,'RECOVERY_REQUIRED');assert.equal(report.runId,runId);
  assert.equal(report.httpAuth,'FAIL');assert.equal(f.records.size,2);
  assert.ok(!/password|token|postgresql|SQL secret/.test(JSON.stringify(report)));
  assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});

function rlsModel(denial='42501') {
  const records=new Map();
  return [0,1,2].map(index=>{
    let actor='';const replay=new Map();
    return fake((sql,v=[])=>{
      if(sql.includes("set_config('app.user_id'"))actor=v[0] ?? '';
      if(sql.includes('SELECT user_id,revision'))return {rows:[...records.values()].filter(row=>row.user_id===actor)};
      if(/^UPDATE|^DELETE|^INSERT/.test(sql)) {
        if(denial==='allowed')return {rows:[],rowCount:1};
        throw Object.assign(new Error('synthetic'),{code:denial});
      }
      if(sql.includes('apply_')) {
        if(!actor)throw Object.assign(new Error('authentication_required'),{code:'P0001'});
        if(sql.includes("'delete'"))return {rows:[{result:{conflict:true}}]};
        if(sql.includes('apply_cloud_goal'))return {rows:[{result:{status:sql.includes(',1,null,true)')?'revision_conflict':'applied'}}]};
        const existing=replay.get(v[0]);if(existing)return {rows:[{result:existing}]};
        records.set(actor,{user_id:actor,revision:1});const result={ok:true};replay.set(v[0],result);
        return {rows:[{result}]};
      }
      // Prove the anonymous third client does not inherit A/B transaction identity.
      if(sql==='COMMIT' && index===2)assert.equal(actor,'');
    });
  });
}
test('RLS sequence uses three distinct clients, commits owner rows and rolls back every denial probe',async()=>{
  const clients=rlsModel();await rlsAcceptance(clients,users.map(u=>({id:u.id})),users,runId);
  for(const client of clients)assert.equal(client.calls.filter(c=>c.sql==='ROLLBACK').length,client===clients[2]?10:9);
  for(const client of clients)assert.equal(client.calls.some(c=>c.sql.startsWith('SET ROLE')),false);
});
test('RLS does not count positive cross-owner mutation or unrelated SQL errors as denial PASS',async()=>{
  for(const denial of ['allowed','23502']) {
    const clients=rlsModel(denial);await assert.rejects(rlsAcceptance(clients,users.map(u=>({id:u.id})),users,runId));
    assert.equal(clients[0].calls.at(-1).sql,'ROLLBACK');
  }
});
