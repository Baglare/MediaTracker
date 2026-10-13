// Internal fixture for the attested disposable runner. No CLI or external target.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { nativeMigrationManifest } from './native-migrations.mjs';

const users=['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff'];
const payload={title:'Release sentinel',type:'movie',status:'planning',current_progress:0,total_progress:1,favorite:false,tags:[],metadata:{},identity_status:'unresolved'};
async function connection(config,user='postgres') {
  const c=new Client({...config,user,ssl:false,connectionTimeoutMillis:3000,query_timeout:5000});
  c.on('error',()=>{});
  try {await c.connect();return c;} catch(error){await c.end().catch(()=>{});throw error;}
}
async function owner(c,user,fn) {
  await c.query('BEGIN');
  try {await c.query("SELECT set_config('app.user_id',$1,true)",[user]);const result=await fn();await c.query('COMMIT');return result;}
  catch(error){await c.query('ROLLBACK');throw error;}
}
const media=(c,op,id,kind,revision,data)=>c.query('SELECT app.apply_media_item_sync_operation($1,$2,$3,$4,$5::jsonb) AS r',[op,id,kind,revision,data]).then(r=>r.rows[0].r);
async function snapshot(c) {
  const result={};
  // Include all pre-existing business rows, receipts, Auth/lifecycle, limiter state,
  // ledger timestamps, ownership/ACLs and RLS policies, not just sentinel counts.
  const tables=(await c.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('app','native_auth','private_rate_limit','private_privacy_ops','native_migrations') AND tablename<>'tvmaze_guest_pool' ORDER BY 1,2")).rows;
  for(const {schemaname,tablename} of tables) {
    assert.match(schemaname,/^[a-z_]+$/);assert.match(tablename,/^[a-zA-Z_]+$/);
    result[schemaname+'.'+tablename]=(await c.query(`SELECT to_jsonb(t) AS r FROM "${schemaname}"."${tablename}" t ORDER BY ${schemaname==='native_migrations'&&tablename==='ledger'?'name':'to_jsonb(t)::text'}`)).rows;
  }
  result.policies=(await c.query("SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('app','native_auth','private_rate_limit','private_privacy_ops') AND tablename<>'tvmaze_guest_pool' ORDER BY 1,2,3")).rows;
  result.acl=(await c.query("SELECT n.nspname,c.relname,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','native_auth','private_rate_limit','private_privacy_ops') AND c.relname NOT IN ('tvmaze_guest_pool','tvmaze_guest_pool_pkey') ORDER BY 1,2")).rows;
  result.roles=(await c.query("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolinherit,rolconfig FROM pg_roles WHERE rolname LIKE 'mt_%' ORDER BY 1")).rows;
  return result;
}
export async function prepareReleaseUpgrade(config) {
  const admin=await connection(config);let runtime;
  try {
    runtime=await connection(config,'mt_runtime');
    assert.equal(Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num)/10000|0,18);
    for(const [i,user] of users.entries()) {
      await admin.query('INSERT INTO native_auth."user"(id,name,email) VALUES($1,$2,$3)',[user,'Release '+i,'release-'+i+'@example.invalid']);
      await owner(runtime,user,async()=>{
        assert.equal((await media(runtime,'seed-'+user,'same-id','upsert',0,payload)).reason,'created');
        assert.equal((await media(runtime,'tomb-seed-'+user,'deleted-id','upsert',0,payload)).ok,true);
        assert.equal((await media(runtime,'tomb-delete-'+user,'deleted-id','delete',1,null)).ok,true);
        const goal={id:'same-goal',title:'Release goal',origin:'manual',lifecycle:'active',scope:{},metric:{},schedule:{},createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z'};
        assert.equal((await runtime.query('SELECT app.apply_cloud_goal_v1($1,$2,0,$3::jsonb,false) AS r',[user,'same-goal',goal])).rows[0].r.status,'applied');
      });
      const asset=i===0?'12121212-1212-4212-8212-121212121212':'34343434-3434-4434-8434-343434343434';
      await admin.query("INSERT INTO app.native_asset_objects(id,user_id,kind,file_key,state,mime,size) VALUES($1,$2,'avatar',$3,'published','image/jpeg',32)",[asset,user,`${user}/avatar/${asset}.jpg`]);
    }
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM native_migrations.ledger')).rows[0].n,12);
    return {config,before:await snapshot(admin)};
  } finally {await runtime?.end();await admin.end();}
}
export async function verifyReleaseUpgrade({config,before}) {
  const c=await connection(config);
  try {
    const after=await snapshot(c);
    assert.deepEqual(after['native_migrations.ledger'].slice(0,12),before['native_migrations.ledger']);
    after['native_migrations.ledger']=before['native_migrations.ledger'];
    assert.deepEqual(after,before);
    const ledger=(await c.query('SELECT name,checksum FROM native_migrations.ledger ORDER BY name')).rows;
    assert.deepEqual(ledger,nativeMigrationManifest().map(({name,checksum})=>({name,checksum})));
    assert.equal((await c.query("SELECT to_regclass('private_rate_limit.tvmaze_guest_pool_pkey') IS NOT NULL AS present")).rows[0].present,true);
  } finally {await c.end();}
}
function envelope(overrides={}) {
  const now=Math.floor(Date.now()/1000);
  return {version:1,operation:'consume',audience:'mt:release-proof',key_version:'v1',policy_id:'tvmaze_search',identity_class:'guest_pool',subjects:[{epoch:Math.floor(now/86400),digest:'a'.repeat(64)}],ingress:[],nonce:randomUUID(),issued_at:now,expires_at:now+10,cost:1,cooldown:0,...overrides};
}
async function admission(c,e=envelope()) {
  const guest=e.identity_class==='guest_pool';
  return owner(c,guest?'':users[0],async()=>{
    await c.query("SELECT set_config('app.limiter_audience','mt:release-proof',true),set_config('app.limiter_key_version','v1',true)");
    // HMAC is checked by nativeSignedLimiter before SQL. Real adapter negative
    // probes run in the same CI job; SQL only validates its transport envelope.
    return (await c.query(`SELECT app.${guest?'tvmaze_guest_rate_limit_v1':'consume_application_rate_limit_v1'}($1,$2) AS r`,[JSON.stringify(e),'0'.repeat(64)])).rows[0].r;
  });
}
export async function proveReleaseConcurrency({config}) {
  const clients=[];
  let check='connections';
  try {
    const admin=await connection(config);clients.push(admin);
    const workers=[];
    for(let i=0;i<5;i++) {const c=await connection(config,'mt_runtime');workers.push(c);clients.push(c);}
    assert.equal(new Set((await Promise.all(workers.map(c=>c.query('SELECT pg_backend_pid() AS p')))).map(r=>r.rows[0].p)).size,5);
    const reset=async()=>{
      await admin.query("UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp(),blocked_until='-infinity',disabled=false,daily_count=0,daily_epoch=0,cooldown_level=0; UPDATE private_rate_limit.tvmaze_guest_pool SET next_attempt_at='-infinity',daily_epoch=0,daily_attempts=0,admitted_total=0; DELETE FROM private_rate_limit.request_receipts; DELETE FROM private_rate_limit.buckets; UPDATE private_rate_limit.capacity SET live_rows=0,next_cleanup_at=clock_timestamp()+interval '1 hour'");
    };
    const allowed=async(e)=>assert.equal((await admission(workers[0],e)).allowed,true);
    const limited=async(e)=>assert.equal((await admission(workers[0],e)).reason,'limited');
    const negative=async(e)=>assert.rejects(admission(workers[0],e),error=>error.code==='P0001');
    await reset();
    check='guest_lock_contention';
    // Force genuine overlapping transactions; the guest RPC must fail closed
    // within its SQL lock budget while another connection owns the global lock.
    await admin.query('BEGIN');await admin.query('SELECT pg_advisory_xact_lock(207402,1)');
    try {await assert.rejects(admission(workers[0]),error=>error.code==='55P03');}
    finally {await admin.query('ROLLBACK');}
    assert.equal((await admin.query('SELECT daily_attempts FROM private_rate_limit.tvmaze_guest_pool')).rows[0].daily_attempts,0);
    await reset();
    check='guest_race';
    const results=await Promise.all(workers.map(c=>admission(c).catch(error=>{
      if(!['55P03','57014'].includes(error.code))throw error;
      return {allowed:false,reason:'bounded_contention'};
    })));
    assert.equal(results.filter(r=>r.allowed).length,1);
    assert.ok(results.every(r=>r.allowed||['limited','bounded_contention'].includes(r.reason)));
    const counters=(await admin.query('SELECT daily_attempts,admitted_total::int FROM private_rate_limit.tvmaze_guest_pool')).rows[0];
    assert.deepEqual(counters,{daily_attempts:1,admitted_total:1});
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM private_rate_limit.request_receipts')).rows[0].n,1);
    assert.equal((await admin.query("SELECT daily_count FROM private_rate_limit.global_state WHERE policy_id='dynamic'")).rows[0].daily_count,1);
    check='replay_and_ten_seconds';
    await reset();const e=envelope();await allowed(e);
    assert.equal((await admission(workers[0],e)).reason,'replay');
    await limited(envelope({subjects:[{epoch:Math.floor(Date.now()/86400000),digest:'b'.repeat(64)}]}));
    await admin.query("UPDATE private_rate_limit.tvmaze_guest_pool SET next_attempt_at=clock_timestamp()-interval '1 millisecond'");
    await admin.query('UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp()');await allowed();
    await reset();
    check='utc_daily_limit';
    await admin.query("UPDATE private_rate_limit.tvmaze_guest_pool SET daily_epoch=floor(extract(epoch FROM clock_timestamp())/86400),daily_attempts=499");
    await allowed();await admin.query("UPDATE private_rate_limit.tvmaze_guest_pool SET next_attempt_at='-infinity'");await limited();
    await admin.query('UPDATE private_rate_limit.tvmaze_guest_pool SET daily_epoch=daily_epoch-1');
    await admin.query('UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp()');await allowed();
    assert.equal((await admin.query('SELECT daily_attempts FROM private_rate_limit.tvmaze_guest_pool')).rows[0].daily_attempts,1);
    await reset();
    check='provider_reserve';
    await admin.query("UPDATE private_rate_limit.global_state SET tokens=1,refilled_at=clock_timestamp()+interval '1 hour' WHERE policy_id='tvmaze'");
    await limited();await allowed(envelope({identity_class:'user',subjects:[{epoch:Math.floor(Date.now()/86400000),digest:'c'.repeat(64)}]}));
    await limited(envelope({identity_class:'user',policy_id:'tvmaze_details',cost:2}));
    check='disabled_global_capacity';
    for(const sql of ["UPDATE private_rate_limit.global_state SET disabled=true WHERE policy_id='tvmaze'","UPDATE private_rate_limit.global_state SET daily_epoch=floor(extract(epoch FROM clock_timestamp())/86400),daily_count=5000 WHERE policy_id='dynamic'","UPDATE private_rate_limit.capacity SET live_rows=hard_cap WHERE table_kind='receipts'"]) {
      await reset();await admin.query(sql);assert.equal((await admission(workers[0])).allowed,false);
    }
    check='cooldown';
    await reset();await allowed(envelope({operation:'cooldown',cooldown:30}));await limited();
    await reset();
    check='envelope_negatives';
    for(const change of [{policy_id:'social_read'},{policy_id:'tvmaze_details'},{policy_id:'tvmaze_calendar'},{audience:'forged'},{key_version:'forged'},{ingress:[{epoch:1,digest:'b'.repeat(64)}]},{issued_at:1,expires_at:11},{cost:2},{subjects:[{epoch:0,digest:'a'.repeat(64)}]},{unexpected:true}])await negative(envelope(change));
    await admin.query("UPDATE private_rate_limit.policies SET enabled=false WHERE policy_id='tvmaze_search'");await negative(envelope());
    await admin.query("UPDATE private_rate_limit.policies SET enabled=true WHERE policy_id='tvmaze_search'");
    // A spent guest pool must not reduce the authenticated 60/minute quota.
    check='authenticated_quota';
    await reset();await admin.query("UPDATE private_rate_limit.tvmaze_guest_pool SET daily_epoch=floor(extract(epoch FROM clock_timestamp())/86400),daily_attempts=500");
    const userEnvelope=()=>envelope({identity_class:'user',subjects:[{epoch:Math.floor(Date.now()/86400000),digest:'d'.repeat(64)}]});
    for(let i=0;i<60;i++) {await admin.query('UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp()');await allowed(userEnvelope());}
    await admin.query('UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp()');await limited(userEnvelope());
    check='authenticated_race';
    await admin.query("UPDATE private_rate_limit.buckets SET count=59,window_start=clock_timestamp() WHERE policy_id='search' AND subject_digest=decode($1,'hex')",['d'.repeat(64)]);
    await admin.query('UPDATE private_rate_limit.global_state SET tokens=capacity,refilled_at=clock_timestamp()');
    const userRace=await Promise.all(workers.map(c=>admission(c,userEnvelope()).catch(error=>{
      if(!['55P03','57014'].includes(error.code))throw error;
      return {allowed:false,reason:'bounded_contention'};
    })));
    assert.equal(userRace.filter(r=>r.allowed).length,1);
    assert.ok(userRace.every(r=>r.allowed||['limited','bounded_contention'].includes(r.reason)));
    assert.equal((await admin.query("SELECT count FROM private_rate_limit.buckets WHERE policy_id='search' AND subject_digest=decode($1,'hex')",['d'.repeat(64)])).rows[0].count,60);
    // Two truly independent connections compete for the same expected revision.
    check='cloud_cas';
    const writes=await Promise.all(workers.slice(0,2).map((c,i)=>owner(c,users[0],()=>media(c,'cas-'+i,'same-id','upsert',1,{...payload,title:'CAS '+i}))));
    assert.equal(writes.filter(r=>r.ok===true).length,1);assert.equal(writes.filter(r=>r.reason==='revision_mismatch').length,1);
    check='tombstone';
    await owner(workers[0],users[0],async()=>{
      assert.equal((await media(workers[0],'delete-final','same-id','delete',2,null)).ok,true);
      assert.equal((await media(workers[0],'stale-resurrect','same-id','upsert',1,payload)).ok,false);
      assert.ok((await workers[0].query("SELECT deleted_at FROM app.media_items WHERE id='same-id'")).rows[0].deleted_at);
    });
    check='rls';
    for(const [i,c] of workers.slice(0,2).entries())await owner(c,users[i],async()=>{
      assert.ok((await c.query('SELECT user_id::text FROM app.media_items')).rows.every(r=>r.user_id===users[i]));
      assert.equal((await c.query('SELECT count(*)::int AS n FROM app.media_items WHERE user_id=$1',[users[1-i]])).rows[0].n,0);
      assert.equal((await c.query("UPDATE app.media_items SET title='forged' WHERE user_id=$1",[users[1-i]])).rowCount,0);
      assert.ok((await c.query('SELECT user_id::text FROM app.goals')).rows.every(r=>r.user_id===users[i]));
    });
  } catch(error) {error.releaseCheck=check;throw error;}
  finally {await Promise.all(clients.map(c=>c.end()));}
}
