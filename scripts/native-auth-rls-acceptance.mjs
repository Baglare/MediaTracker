// Operator-only, offline by default. No grants, migration, storage mutation or secret output.
import { pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { Client } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { acceptanceConfig, inspectAcceptance, inspectRuntime } from './native-hosting-acceptance.mjs';
import { operatorConfig, digest } from './native-ops-target.mjs';
import { postgresTls } from '../lib/backend/postgres-tls.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tables = ['media_items', 'progress_logs', 'goals'];
const cleanupFunctions = ['app.transition_account(uuid,text,text)', 'app.native_privacy_inspect(uuid)',
  'app.native_privacy_cleanup(uuid)', 'app.native_privacy_filesystem_verified(uuid)', 'app.native_privacy_finish(uuid,text)'];
class AcceptanceError extends Error {}
const check = (value, code) => { if (!value) throw new AcceptanceError(code); };
export function fixtures(run) {
  check(uuid.test(run), 'acceptance_run_invalid');
  return ['a','b'].map(label => {
    const h = digest(`mt-auth-rls-v1:${run}:${label}`);
    const id = `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
    return { id, email: `mt-auth-rls-${run}-${label}@example.invalid`, name: `mt-auth-rls-v1:${run}:${label}` };
  });
}
export function argumentsFor(args) {
  if (!args.length || (args.length === 1 && args[0] === '--plan')) return { mode:'plan', run:randomUUID() };
  check(args.length === 5 && ['--execute','--recover'].includes(args[0]) && args[1] === '--run-id'
    && uuid.test(args[2]) && args[3] === '--confirmation', 'acceptance_arguments_invalid');
  return {mode:args[0].slice(2),run:args[2],confirmation:args[4]};
}
export function configFor(env, args) {
  check(['execute','recover'].includes(args.mode) && uuid.test(args.run), 'acceptance_arguments_invalid');
  const config = acceptanceConfig(env);
  check(config.ssl && env.NATIVE_OPS_SSL_MODE === 'verify-full', 'acceptance_tls_required');
  let origin;
  try { origin = new URL(env.NATIVE_ACCEPTANCE_HTTP_ORIGIN); } catch { throw new Error('acceptance_origin_required'); }
  check(origin.protocol === 'https:' && !origin.username && !origin.password && origin.pathname === '/'
    && !origin.search && !origin.hash && env.NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT === config.expected,
  'acceptance_http_target_unconfirmed');
  const privacy = operatorConfig({...env, NATIVE_OPS_DATABASE_URL:env.NATIVE_ACCEPTANCE_CLEANUP_URL,
    NATIVE_OPS_ROLE_KIND:'privacy_login'});
  check(privacy.url.hostname === config.url.hostname && privacy.url.port === config.url.port
    && privacy.url.protocol === config.url.protocol && !!privacy.url.password,
  'acceptance_cleanup_target_invalid');
  check(env.NATIVE_STORAGE_ROOT && isAbsolute(env.NATIVE_STORAGE_ROOT), 'acceptance_storage_required');
  const expected = `${args.mode === 'recover' ? 'RECOVER_AUTH_RLS' : 'AUTH_RLS'} mt_p4_test ${config.expected} ${origin.origin} ${args.run}`;
  check(args.confirmation === expected, 'acceptance_confirmation_required');
  return {...config, privacy, origin:origin.origin, storage:env.NATIVE_STORAGE_ROOT};
}
async function transaction(client, user, callback, readOnly = false) {
  await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
  try {
    await client.query("SELECT set_config('app.user_id',$1,true)",[user ?? '']);
    const result = await callback(client);
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
export async function absentStorage(root, user) {
  // Reuse the filesystem boundary; NEVER create or remove directories.
  const { storageRoot, safeDirectory } = await import('../lib/backend/filesystem-core.mjs');
  root = storageRoot(root); await safeDirectory(root);
  try { await safeDirectory(join(root,'users')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  try { await lstat(join(root,'users',user)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('acceptance_storage_present');
}
export async function inspectCleanup(client, config, target) {
  return transaction(client,null,async () => {
    const row = (await client.query(`SELECT current_database() AS database, session_user AS role,
      host(inet_server_addr()) AS server, inet_server_port() AS port,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl,
      pg_has_role(session_user,$1::regrole,'USAGE') AS allowed`,[config.roles.privacy_operator])).rows[0];
    check(row?.database === 'mt_p4_test' && row.role === config.roles.privacy_login && row.ssl === true
      && row.server === target.server && row.port === target.port && row.oid === target.oid && row.allowed === true,
    'acceptance_cleanup_identity_invalid');
    for (const signature of cleanupFunctions) check((await client.query(
      "SELECT has_function_privilege(current_user,$1,'EXECUTE') AS safe",[signature])).rows[0]?.safe === true,
    'acceptance_cleanup_permission_denied');
    check((await client.query('SELECT app.native_ops_state() AS state')).rows[0]?.state?.frozen === false,
      'acceptance_release_frozen');
  },true);
}
export async function inspectSeed(client, config, users, recovery = false) {
  return transaction(client,null,async () => {
    for (const role of [config.roles.auth_owner,config.roles.owner]) check((await client.query(
      "SELECT pg_has_role(session_user,$1::regrole,'SET') AS safe",[role])).rows[0]?.safe === true,
    'acceptance_seed_role_denied');
    await client.query(`SET LOCAL ROLE ${config.roles.auth_owner}`);
    for (const [table,privilege] of [['user','SELECT'],['user','INSERT'],['account','INSERT']]) check(
      (await client.query("SELECT has_table_privilege(current_user,$1,$2) AS safe",[`native_auth.\"${table}\"`,privilege])).rows[0]?.safe === true,
    'acceptance_seed_permission_denied');
    if (!recovery) check((await client.query('SELECT count(*)::integer AS count FROM native_auth."user"')).rows[0]?.count === 0,
      'acceptance_nonempty_auth_database');
    for (const user of users) {
      const row = (await client.query('SELECT id,email,name FROM native_auth."user" WHERE id=$1 OR email=$2',[user.id,user.email])).rows;
      check(recovery ? row.length === 0 || (row.length === 1 && row[0].id === user.id
        && row[0].email === user.email && row[0].name === user.name) : row.length === 0,
      'acceptance_fixture_identity_mismatch');
    }
  },true);
}
export async function seed(client, config, users) {
  return transaction(client,null,async () => {
    await client.query(`SET LOCAL ROLE ${config.roles.auth_owner}`);
    // Recheck emptiness in the transaction; no ON CONFLICT or existing account adoption.
    check((await client.query('SELECT count(*)::integer AS count FROM native_auth."user"')).rows[0]?.count === 0,
      'acceptance_nonempty_auth_database');
    for (const user of users) {
      await client.query('INSERT INTO native_auth."user"(id,name,email) VALUES($1,$2,$3)',[user.id,user.name,user.email]);
      const hash = await hashPassword(user.password);
      await client.query(`INSERT INTO native_auth.account(id,"accountId","providerId","userId",password)
        VALUES($1,$2,'credential',$2::uuid,$3)`,[randomUUID(),user.id,hash]);
    }
  });
}
export function safeSnapshot(snapshot, user, run) {
  check(snapshot && Array.isArray(snapshot.auth) && snapshot.auth.length === 1
    && snapshot.auth[0].id === user.id && snapshot.auth[0].email === user.email,
  'acceptance_cleanup_fixture_mismatch');
  check(Array.isArray(snapshot.assets) && !snapshot.assets.length
    && Array.isArray(snapshot.scopedResiduals) && !snapshot.scopedResiduals.length,
  'acceptance_cleanup_external_data');
  const allowed = new Set([...tables,'cloud_media_sync_operations','goal_sync_operations']);
  for (const [table, rows] of Object.entries(snapshot.tables ?? {})) {
    check(Array.isArray(rows), 'acceptance_cleanup_snapshot_invalid');
    if (!allowed.has(table)) check(!rows.length,'acceptance_cleanup_unexpected_data');
    else for (const row of rows) check(row.user_id === user.id
      && (table === 'goal_sync_operations' ? row.goal_id : table === 'cloud_media_sync_operations' ? row.record_id : row.id)
        ?.match(new RegExp(`^mt-auth-rls-${run}-[ab]$`)), 'acceptance_cleanup_unexpected_data');
  }
}
export async function cleanup(client, operator, config, users, run, storageCheck = absentStorage) {
  // All-or-nothing DB cleanup. Identity marker check and inspection precede every deletion.
  await inspectSeed(operator,config,users,true);
  return transaction(client,null,async () => {
    for (const user of users) {
      const snapshot = (await client.query('SELECT app.native_privacy_inspect($1::uuid) AS result',[user.id])).rows[0]?.result;
      if (Array.isArray(snapshot?.auth) && snapshot.auth.length === 0) {
        check(snapshot.assets?.length === 0 && snapshot.scopedResiduals?.length === 0
          && Object.values(snapshot.tables ?? {}).every(rows=>Array.isArray(rows) && rows.length === 0),
        'acceptance_cleanup_residual');
        continue;
      }
      safeSnapshot(snapshot,user,run);
      await storageCheck(config.storage,user.id);
      for (const state of ['ERASURE_PENDING','ERASING']) await client.query(
        'SELECT app.transition_account($1::uuid,$2,$3)',[user.id,state,`PRIVACY ${user.id}`]);
      await client.query('SELECT app.native_privacy_cleanup($1::uuid)',[user.id]);
      await storageCheck(config.storage,user.id);
      await client.query('SELECT app.native_privacy_filesystem_verified($1::uuid)',[user.id]);
      await client.query('SELECT app.native_privacy_finish($1::uuid,$2)',[user.id,`ERASE ACCOUNT ${user.id}`]);
      const after = (await client.query('SELECT app.native_privacy_inspect($1::uuid) AS result',[user.id])).rows[0]?.result;
      check(after?.auth?.length === 0 && after.assets?.length === 0 && after.scopedResiduals?.length === 0
        && Object.values(after.tables ?? {}).every(rows => Array.isArray(rows) && rows.length === 0),
      'acceptance_cleanup_residual');
    }
  });
}
export function sessionCookie(response) {
  const values = response.headers.getSetCookie();
  const cookie = values.find(value => /^(?:__Secure-)?mt-native\.session_token=/.test(value));
  check(cookie && /;\s*HttpOnly(?:;|$)/i.test(cookie) && /;\s*Secure(?:;|$)/i.test(cookie)
    && /;\s*SameSite=Lax(?:;|$)/i.test(cookie) && /;\s*Path=\/(?:;|$)/i.test(cookie)
    && !/;\s*Domain=/i.test(cookie), 'acceptance_cookie_invalid');
  return cookie.split(';')[0];
}
export async function http(config, path, {method='GET',body,cookie,origin=config.origin} = {}, fetcher=fetch) {
  const response = await fetcher(`${config.origin}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Origin:origin,'Sec-Fetch-Site':origin === config.origin ? 'same-origin' : 'cross-site',
      ...(body === undefined ? {} : {'Content-Type':'application/json'}),...(cookie ? {Cookie:cookie} : {})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  // Bound reads without ever printing response bodies, headers or token values.
  const reader = response.body?.getReader(); let bytes=0, chunks=[];
  try {
    if (reader) while (true) { const {done,value} = await reader.read(); if (done) break;
      bytes += value.length; check(bytes <= 65536,'acceptance_http_response_capacity'); chunks.push(value); }
  } finally { await reader?.cancel(); }
  let data=null;
  try { data=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* validated by caller */ }
  return {response,data};
}
export async function authAcceptance(config, users, runtimes, request = http) {
  const session = async cookie => request(config,'/api/auth/get-session',{cookie});
  const anonymous = await session(); check(anonymous.response.status === 200 && anonymous.data === null,'acceptance_anonymous_session');
  const postAnon = await request(config,'/api/auth/get-session',{method:'POST',body:{}});
  check(postAnon.response.status === 200 && postAnon.data === null,'acceptance_anonymous_post_session');
  check((await request(config,'/api/auth/sign-up/email',{method:'POST',body:{}})).response.status === 404,'acceptance_signup_open');
  check((await request(config,'/api/auth/get-session',{method:'POST',body:{},origin:'https://cross-origin.example.invalid'})).response.status === 403,
    'acceptance_csrf_allowed');
  const result=[];
  for (let i=0;i<users.length;i++) {
    // The unchanged Better Auth shared /sign-in bucket allows 3 requests / 10s.
    // Pace invalid+valid attempts for each account without bypassing the limiter.
    if (i) await pause(11000);
    const user=users[i];
    const invalid = await request(config,'/api/auth/sign-in/email',{method:'POST',body:{email:user.email,password:randomBytes(32).toString('base64url')}});
    check(invalid.response.status !== 429,'acceptance_auth_rate_limited');
    check(invalid.response.status === 401,'acceptance_invalid_credentials');
    const login=await request(config,'/api/auth/sign-in/email',{method:'POST',body:{email:user.email,password:user.password,rememberMe:false}});
    check(login.response.status !== 429,'acceptance_auth_rate_limited');
    check(login.response.status === 200 && login.data?.user?.id === user.id && typeof login.data.token === 'string','acceptance_login_failed');
    const cookie=sessionCookie(login.response);
    const get=await session(cookie);
    const post=await request(config,'/api/auth/get-session',{method:'POST',body:{},cookie});
    for (const value of [get,post]) check(value.response.status === 200 && value.data?.user?.id === user.id
      && value.data?.session?.userId === user.id && value.data.session.token === login.data.token,'acceptance_session_failed');
    // Link the real HTTP session to this exact verified runtime DB, not just an HTTP 200.
    const bound=await transaction(runtimes[i],null,async client => (await client.query(
      'SELECT count(*)::integer AS count FROM native_auth.session WHERE token=$1 AND "userId"=$2 AND "expiresAt">now()',
      [login.data.token,user.id])).rows[0]?.count,true);
    check(bound === 1,'acceptance_http_database_mismatch');
    result.push({id:get.data.user.id,cookie,token:login.data.token});
  }
  return result;
}
async function visible(client, actor, users, run, expected) {
  return transaction(client,actor,async () => {
    for (const table of tables) {
      const rows=(await client.query(`SELECT user_id,revision FROM app.${table} WHERE id=ANY($1::text[]) AND user_id=ANY($2::uuid[])`,
        [['a','b'].map(label=>`mt-auth-rls-${run}-${label}`),users.map(u=>u.id)])).rows;
      check(rows.length === expected && rows.every(r=>r.user_id === actor && Number(r.revision) === 1),'acceptance_rls_read_failed');
    }
  },true);
}
export async function rlsAcceptance(runtimes, sessions, users, run) {
  const now=new Date().toISOString();
  for (let i=0;i<2;i++) await transaction(runtimes[i],sessions[i].id,async client => {
    const id=`mt-auth-rls-${run}-${i===0 ? 'a' : 'b'}`;
    const media={title:'Synthetic acceptance',type:'book',status:'planning',current_progress:0,total_progress:1,favorite:false,tags:[],metadata:{}};
    const progress={media_id:id,media_title:'Synthetic acceptance',media_type:'book',action:'increment',amount:1,unit:'page',previous_progress:0,new_progress:1,created_at:now};
    const goal={id,title:'Synthetic acceptance',origin:'manual',scope:{},metric:{},schedule:{},lifecycle:'active',createdAt:now,updatedAt:now};
    for (const [fn,payload] of [['apply_media_item_sync_operation',media],['apply_progress_log_sync_operation',progress]]) {
      const op=randomUUID(),values=[op,id,JSON.stringify(payload)];
      const apply=async()=> (await client.query(`SELECT app.${fn}($1,$2,'upsert',0,$3::jsonb) AS result`,values)).rows[0]?.result;
      const first=await apply();check(first?.ok === true,'acceptance_rls_create_failed');
      check(JSON.stringify(await apply()) === JSON.stringify(first),'acceptance_rls_replay_failed');
    }
    check((await client.query('SELECT app.apply_cloud_goal_v1($1,$2,0,$3::jsonb,false) AS result',
      [randomUUID(),id,JSON.stringify(goal)])).rows[0]?.result?.status === 'applied','acceptance_rls_goal_failed');
  });
  for (let i=0;i<3;i++) await visible(runtimes[i],sessions[i]?.id ?? null,users,run,i===2 ? 0 : 1);
  // DML cannot nominate another owner. Permission denial or RLS zero rows is acceptable;
  // any positive mutation is a failure and the entire attempt is rolled back.
  for (let i=0;i<3;i++) for (const table of tables) for (const verb of ['UPDATE','DELETE','INSERT']) {
    await runtimes[i].query('BEGIN');
    try {
      await runtimes[i].query("SELECT set_config('app.user_id',$1,true)",[sessions[i]?.id ?? '']);
      const other=users[i===0 ? 1 : 0].id;
      const id=`mt-auth-rls-${run}-${i===0 ? 'b' : 'a'}`;
      const sql=verb === 'UPDATE' ? `UPDATE app.${table} SET user_id=$1 WHERE user_id=$1 AND id=$2`
        : verb === 'DELETE' ? `DELETE FROM app.${table} WHERE user_id=$1 AND id=$2`
          : `INSERT INTO app.${table}(user_id,id) VALUES($1,$2)`;
      try {const result=await runtimes[i].query(sql,[other,id]);
        check(verb !== 'INSERT' && result.rowCount === 0,'acceptance_rls_cross_owner_write');
      } catch(error) { if (error.code !== '42501') throw error; }
    } finally { await runtimes[i].query('ROLLBACK'); }
  }
  for (let i=0;i<2;i++) await transaction(runtimes[i],sessions[i].id,async client => {
    const otherId=`mt-auth-rls-${run}-${i===0 ? 'b' : 'a'}`;
    for (const fn of ['apply_media_item_sync_operation','apply_progress_log_sync_operation']) {
      const value=(await client.query(`SELECT app.${fn}($1,$2,'delete',1,null) AS result`,[randomUUID(),otherId])).rows[0]?.result;
      check(value?.conflict === true,'acceptance_rls_cross_owner_rpc');
    }
    check((await client.query('SELECT app.apply_cloud_goal_v1($1,$2,1,null,true) AS result',
      [randomUUID(),otherId])).rows[0]?.result?.status === 'revision_conflict','acceptance_rls_cross_owner_goal_rpc');
  });
  // Anonymous RPC denial is checked on its own real connection.
  await runtimes[2].query('BEGIN');
  try {
    await runtimes[2].query("SELECT set_config('app.user_id','',true)");
    try { await runtimes[2].query("SELECT app.apply_media_item_sync_operation($1,$2,'delete',1,null)",[randomUUID(),`mt-auth-rls-${run}-a`]);
      throw new Error('acceptance_rls_anonymous_rpc_allowed');
    } catch(error) { if (error.code !== 'P0001' || error.message !== 'authentication_required') throw error; }
  } finally { await runtimes[2].query('ROLLBACK'); }
  for (let i=0;i<3;i++) await visible(runtimes[i],sessions[i]?.id ?? null,users,run,i===2 ? 0 : 1);
}
export async function signOutAcceptance(config, sessions, runtimes, request=http) {
  for (let i=0;i<sessions.length;i++) {
    const session=sessions[i];
    const out=await request(config,'/api/auth/sign-out',{method:'POST',body:{},cookie:session.cookie});
    check(out.response.status === 200 && out.data?.success === true,'acceptance_signout_failed');
    check(out.response.headers.getSetCookie().some(value => value.startsWith(`${session.cookie.split('=')[0]}=`)
      && /;\s*Max-Age=0(?:;|$)/i.test(value)), 'acceptance_signout_cookie_not_cleared');
    const after=await request(config,'/api/auth/get-session',{cookie:session.cookie});
    check(after.response.status === 200 && after.data === null,'acceptance_session_still_valid');
    check(await transaction(runtimes[i],null,async client => (await client.query(
      'SELECT count(*)::integer AS count FROM native_auth.session WHERE token=$1',[session.token])).rows[0]?.count === 0,true),
    'acceptance_session_not_deleted');
  }
}
export async function run(args,env, dependencies={}) {
  const report={runId:args.run,preflight:'BLOCKED',fixture:'BLOCKED',httpAuth:'BLOCKED',dbRls:'BLOCKED',cleanup:'BLOCKED',
    httpCloudSync:'BLOCKED',cloudReason:'TRUSTED_INGRESS_UNCONFIGURED; DB/RLS does not prove HTTP Cloud Sync',
    backupRestore:'BLOCKED',backupReason:'NOT_VERIFIED',mutation:'NOT_PERFORMED'};
  if (args.mode === 'plan') return {...report,mode:'OFFLINE_PLAN',requiredApproval:
    'Exact mt_p4_test fingerprint + test HTTP origin + run ID; existing privacy_login + read-only storage access required'};
  const config=configFor(env,args), users=fixtures(args.run), clients=[];
  const connect=dependencies.connect ?? (async url => {
    const client=new Client({connectionString:url.href,ssl:postgresTls(true,config.caFile,url.hostname),
      connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,lock_timeout:2000,
      options:'-c search_path=pg_catalog',application_name:'mt-auth-rls-acceptance'});
    clients.push(client);client.on('error',()=>{});await client.connect();return client;
  });
  const storageCheck=dependencies.storageCheck ?? absentStorage;
  const request=dependencies.request ?? http;
  let operator,privacy,attempted=false, stage='preflight';
  try {
    operator=await connect(config.url);
    const target=(await inspectAcceptance(operator,config)).target;
    // Cooperative global lock across this tool's runs, never wait or mutate target state.
    check((await operator.query("SELECT pg_try_advisory_lock(hashtextextended('mt-auth-rls-acceptance',0)) AS safe")).rows[0]?.safe === true,
      'acceptance_concurrent_run');
    privacy=await connect(config.privacy.url);await inspectCleanup(privacy,config,target);
    await inspectSeed(operator,config,users,args.mode === 'recover');
    for (const user of users) await storageCheck(config.storage,user.id);
    if (args.mode === 'recover') {
      report.preflight='PASS';stage='cleanup';
      await cleanup(privacy,operator,config,users,args.run,storageCheck);
      return {...report,cleanup:'PASS',mutation:'RECOVERY_COMPLETED'};
    }
    const runtimes=[];
    for (let i=0;i<3;i++) {const client=await connect(config.runtime);runtimes.push(client);
      await inspectRuntime(client,config,target);
      check((await client.query('SELECT app.native_runtime_ready() AS ready')).rows[0]?.ready === true,'acceptance_release_frozen');}
    report.preflight='PASS';stage='fixture';
    for (const user of users) user.password=randomBytes(32).toString('base64url');
    attempted=true;report.mutation='FIXTURE_ATTEMPTED';
    await seed(operator,config,users);
    report.fixture='PASS';stage='httpAuth';
    const sessions=await authAcceptance(config,users,runtimes,request);
    stage='dbRls';await rlsAcceptance(runtimes,sessions,users,args.run);report.dbRls='PASS';
    stage='httpAuth';await signOutAcceptance(config,sessions,runtimes,request);report.httpAuth='PASS';
  } catch (error) {
    report[stage]=stage === 'preflight' ? 'BLOCKED' : 'FAIL';
    report.reason=error instanceof AcceptanceError ? error.message : `acceptance_${stage}_failed`;
  } finally {
    if (attempted && privacy && operator) {
      try {await inspectCleanup(privacy,config,(await inspectAcceptance(operator,config)).target);
        await cleanup(privacy,operator,config,users,args.run,storageCheck);report.cleanup='PASS';report.mutation='FIXTURES_REMOVED';}
      catch (error) {report.cleanup='FAIL';report.mutation='RECOVERY_REQUIRED';
        report.cleanupReason=error instanceof AcceptanceError ? error.message : 'acceptance_cleanup_failed';}
    }
    for (const user of users) delete user.password;
    for (const client of clients) await client.end().catch(()=>{});
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {const args=argumentsFor(process.argv.slice(2));const report=await run(args,process.env);
    console.log(JSON.stringify(report,null,2));
    if (args.mode !== 'plan' && (report.preflight !== 'PASS' || report.cleanup !== 'PASS'
      || (args.mode === 'execute' && (report.httpAuth !== 'PASS' || report.dbRls !== 'PASS')))) process.exitCode=1;
  } catch {console.error('BLOCKED: acceptance_configuration_or_confirmation_invalid');process.exitCode=1;}
}
