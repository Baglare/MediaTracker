// Private operator CLI only. No HTTP, grants, migration or runtime imports.
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { Client } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { configFor as acceptanceConfig, fixtures as acceptanceFixtures, inspectCleanup, inspectSeed, absentStorage } from './native-auth-rls-acceptance.mjs';
import { inspectAcceptance, inspectRuntime } from './native-hosting-acceptance.mjs';
import { postgresTls } from '../lib/backend/postgres-tls.mjs';
import { nativePrivacyAdapter } from './native-privacy-ops.mjs';
import { runErasure, erasePlan, domains } from './privacy-account-model.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const check = (ok, code) => { if (!ok) throw new Error(code); };
const safeReasons=new Set(['qa_concurrent_run','qa_cleanup_permission','qa_release_frozen','qa_collision',
  'qa_private_tty_required','qa_password_invalid','qa_password_mismatch','qa_secret_aborted',
  'qa_identity_mismatch','qa_external_data','qa_snapshot_invalid','qa_shared_or_unknown_data','qa_participant_data','qa_cleanup_failed',
  'acceptance_cleanup_identity_invalid','acceptance_cleanup_permission_denied','acceptance_release_frozen',
  'acceptance_seed_role_denied','acceptance_seed_permission_denied','acceptance_fixture_identity_mismatch','acceptance_storage_present',
  'native_acceptance_preflight_failed','native_acceptance_runtime_identity_invalid','native_acceptance_runtime_unsafe',
  'native_acceptance_catalog_invalid','native_acceptance_function_denied','native_target_identity_invalid']);
export function fixtures(run) {
  return acceptanceFixtures(run).map((user, i) => ({...user,
    email: `mt-manual-qa-${run}-${i ? 'b' : 'a'}@example.invalid`,
    name: `mt-manual-qa-v1:${run}:QA-${i ? 'B' : 'A'}`}));
}
export function argumentsFor(args) {
  if (!args.length || args.join(' ') === '--plan') return {mode:'plan',run:randomUUID()};
  check(['--create','--cleanup'].includes(args[0]) && args[1] === '--run-id' && uuid.test(args[2]), 'qa_arguments_invalid');
  const cleanup = args[0] === '--cleanup';
  check(args.length === (cleanup ? 9 : 5) && args[3] === '--confirmation', 'qa_arguments_invalid');
  if (cleanup) check(args[5] === '--user-a' && uuid.test(args[6]) && args[7] === '--user-b' && uuid.test(args[8])
    && fixtures(args[2])[0].id === args[6] && fixtures(args[2])[1].id === args[8], 'qa_uuid_mismatch');
  return {mode:cleanup ? 'cleanup' : 'create',run:args[2],confirmation:args[4]};
}
export function configFor(env, args) {
  check(['create','cleanup'].includes(args.mode), 'qa_arguments_invalid');
  check(args.confirmation === `${args.mode === 'create' ? 'CREATE' : 'CLEANUP'}_MANUAL_QA mt_p4_test ${env.NATIVE_OPS_EXPECTED_FINGERPRINT} ${env.NATIVE_ACCEPTANCE_HTTP_ORIGIN} ${args.run}`, 'qa_confirmation_required');
  return acceptanceConfig(env,{mode:args.mode === 'create' ? 'execute' : 'recover',run:args.run,
    confirmation:`${args.mode === 'create' ? 'AUTH_RLS' : 'RECOVER_AUTH_RLS'} mt_p4_test ${env.NATIVE_OPS_EXPECTED_FINGERPRINT} ${env.NATIVE_ACCEPTANCE_HTTP_ORIGIN} ${args.run}`});
}
export function readSecret(label, input=process.stdin, output=process.stderr) {
  check(input.isTTY && output.isTTY && typeof input.setRawMode === 'function' && !input.isRaw, 'qa_private_tty_required');
  return new Promise((resolve,reject) => {
    let value=''; const decoder=new StringDecoder('utf8');
    const finish=(error) => {
      input.removeListener('data',data); input.removeListener('end',ended); input.removeListener('error',failed);
      input.setRawMode(false); input.pause(); output.write('\n');
      const result=value; value=''; if (error) reject(error); else resolve(result);
    };
    const ended=()=>finish(new Error('qa_secret_aborted'));
    const failed=()=>finish(new Error('qa_secret_aborted'));
    const data=chunk => {
      const text=decoder.write(chunk);
      for (let i=0;i<text.length;i++) {
        const char=text[i];
        if (char === '\r' || char === '\n') {
          return finish(i !== text.length-1 || value.length < 8 ? new Error('qa_password_invalid') : undefined);
        }
        if (char === '\x7f' || char === '\b') value=Array.from(value).slice(0,-1).join('');
        else if (char.charCodeAt(0)<32) return finish(new Error('qa_secret_aborted'));
        else value+=char;
        if (value.length>128) return finish(new Error('qa_password_invalid'));
      }
    };
    output.write(`${label} (hidden, 8–128 characters): `);
    input.setRawMode(true); input.on('data',data); input.once('end',ended); input.once('error',failed); input.resume();
  });
}
export async function passwords(users, reader=readSecret) {
  const result=[];
  try {
    for (const user of users) {
      const first=await reader(user.name.endsWith('QA-A') ? 'QA-A password' : 'QA-B password');
      check(first.length>=8 && first.length<=128, 'qa_password_invalid');
      check(await reader('Repeat password') === first, 'qa_password_mismatch');
      result.push(first);
    }
    return result;
  } catch (error) {result.fill('');throw error;}
}
async function transaction(client, callback) {
  await client.query('BEGIN');
  try {const result=await callback(); await client.query('COMMIT'); return result;}
  catch (error) {await client.query('ROLLBACK'); throw error;}
}
export async function seed(client, config, users, secrets) {
  check(secrets.length === 2 && secrets.every(p=>typeof p==='string' && p.length>=8 && p.length<=128), 'qa_password_invalid');
  const hashes=await Promise.all(secrets.map(p=>hashPassword(p)));
  try {return await transaction(client,async()=>{
    await client.query(`SET LOCAL ROLE ${config.roles.auth_owner}`);
    // Block inserts/updates/deletes during collision recheck. Never adopt/upsert a user.
    await client.query('LOCK TABLE native_auth."user" IN SHARE ROW EXCLUSIVE MODE');
    for (const user of users) check((await client.query('SELECT id,email,name FROM native_auth."user" WHERE id=$1 OR email=$2',[user.id,user.email])).rows.length === 0, 'qa_collision');
    for (let i=0;i<users.length;i++) {
      const user=users[i];
      await client.query('INSERT INTO native_auth."user"(id,name,email) VALUES($1,$2,$3)',[user.id,user.name,user.email]);
      await client.query(`INSERT INTO native_auth.account(id,"accountId","providerId","userId",password) VALUES($1,$2,'credential',$2::uuid,$3)`,[randomUUID(),user.id,hashes[i]]);
    }
  });} finally {hashes.fill('');}
}
export function safeCleanup(snapshot, user) {
  check(snapshot?.auth?.length === 0 || (snapshot?.auth?.length === 1 && snapshot.auth[0].id === user.id && snapshot.auth[0].email === user.email), 'qa_identity_mismatch');
  check(Array.isArray(snapshot.assets) && !snapshot.assets.length && Array.isArray(snapshot.scopedResiduals) && !snapshot.scopedResiduals.length, 'qa_external_data');
  const events=new Set((snapshot.tables?.xp_events ?? []).filter(row=>row.user_id===user.id).map(row=>row.id));
  const participantColumns=['user_id','actor_id','author_id','recipient_id','sender_id','blocker_id','blocked_id','follower_id','following_id','reporter_id'];
  for (const [table, rows] of Object.entries(snapshot.tables ?? {})) {
    check(Array.isArray(rows), 'qa_snapshot_invalid');
    if (rows.length) check(domains[table] && rows.every(row=>
      (table === 'xp_event_allocations' ? events.has(row.event_id) : domains[table].columns.every(column=>row[column] === user.id))
      && participantColumns.every(column=>row[column] == null || row[column] === user.id)), 'qa_shared_or_unknown_data');
  }
  const plan=erasePlan(snapshot,user.id);
  check(!plan.blocked.length && !Object.keys(plan.participantLoss).length && !plan.detachNotifications && !plan.anonymizeReplies, 'qa_participant_data');
}
export async function cleanup(client, operator, config, users, storageCheck=absentStorage) {
  await inspectSeed(operator,config,users,true);
  return transaction(client,async()=>{
    const adapters=users.map(user=>nativePrivacyAdapter(client,config.storage,user.id,config.roles));
    // Validate BOTH before locking/deleting either account.
    for (let i=0;i<users.length;i++) {safeCleanup(await adapters[i].inspect(),users[i]); await storageCheck(config.storage,users[i].id);}
    for (let i=0;i<users.length;i++) {
      const snapshot=await adapters[i].inspect();
      if (snapshot.auth.length) await adapters[i].transition(users[i].id,'ERASURE_PENDING');
    }
    for (let i=0;i<users.length;i++) safeCleanup(await adapters[i].inspect(),users[i]);
    for (let i=0;i<users.length;i++) {
      const user=users[i],adapter=adapters[i];
      if (!(await adapter.inspect()).auth.length) continue;
      // No filesystem mutation and no unscoped temporary-file cleanup.
      adapter.removeAssets=async()=>storageCheck(config.storage,user.id);
      adapter.verifyAssets=async()=>{await storageCheck(config.storage,user.id); await client.query('SELECT app.native_privacy_filesystem_verified($1::uuid)',[user.id]);};
      const result=await runErasure(adapter,user.id,{execute:true,confirmation:`ERASE DISPOSABLE ${user.id}`});
      check(result.completed === true, 'qa_cleanup_failed');
    }
  });
}
export async function run(args, env, dependencies={}) {
  const users=fixtures(args.run);
  if (args.mode === 'plan') return {mode:'OFFLINE_PLAN',runId:args.run,users,mutation:'NOT_PERFORMED'};
  const config=configFor(env,args), clients=[];
  const connect=dependencies.connect ?? (async url=>{
    const client=new Client({connectionString:url.href,ssl:postgresTls(true,config.caFile,url.hostname),
      connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,lock_timeout:2000,
      options:'-c search_path=pg_catalog',application_name:'mt-manual-qa'});
    clients.push(client);client.on('error',()=>{});await client.connect();return client;
  });
  const storageCheck=dependencies.storageCheck ?? absentStorage;
  let stage='preflight', secrets=[];
  try {
    const operator=await connect(config.url);
    const target=(await inspectAcceptance(operator,config)).target;
    check((await operator.query("SELECT pg_try_advisory_lock(hashtextextended('mt-auth-rls-acceptance',0)) AS safe")).rows[0]?.safe === true, 'qa_concurrent_run');
    const privacy=await connect(config.privacy.url); await inspectCleanup(privacy,config,target);
    check((await privacy.query("SELECT has_function_privilege(current_user,'app.native_privacy_record_stage(uuid,text,boolean)','EXECUTE') AS safe")).rows[0]?.safe === true, 'qa_cleanup_permission');
    await inspectSeed(operator,config,users,true);
    const runtime=await connect(config.runtime); await inspectRuntime(runtime,config,target);
    check((await runtime.query('SELECT app.native_runtime_ready() AS ready')).rows[0]?.ready === true, 'qa_release_frozen');
    if (args.mode === 'cleanup') {
      stage='cleanup'; await cleanup(privacy,operator,config,users,storageCheck);
      return {runId:args.run,users,preflight:'PASS',cleanup:'PASS',mutation:'ACCOUNTS_REMOVED'};
    }
    // Recovery inspection permits existing markers; creation always rejects them.
    for (const user of users) {
      await storageCheck(config.storage,user.id);
      const snapshot=(await privacy.query('SELECT app.native_privacy_inspect($1::uuid) AS result',[user.id])).rows[0]?.result;
      safeCleanup(snapshot,user);
      check(!snapshot.auth.length && Object.values(snapshot.tables).every(rows=>!rows.length), 'qa_collision');
    }
    stage='password'; secrets=await (dependencies.passwords ?? passwords)(users);
    stage='create'; await seed(operator,config,users,secrets);
    return {runId:args.run,users,preflight:'PASS',creation:'PASS',mutation:'ACCOUNTS_CREATED',browserE2E:'NOT_RUN'};
  } catch (error) {
    return {runId:args.run,users,status:'BLOCKED',stage,mutation:['create','cleanup'].includes(stage) ? 'COMMIT_UNCERTAIN_USE_EXACT_CLEANUP' : 'NOT_PERFORMED',
      reason:safeReasons.has(error.message) ? error.message : stage === 'cleanup' ? 'qa_cleanup_blocked_or_failed' : 'qa_checks_or_operation_failed'};
  } finally {
    secrets.fill('');
    for (const client of clients) await client.end().catch(()=>{});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {const report=await run(argumentsFor(process.argv.slice(2)),process.env);console.log(JSON.stringify(report,null,2));if(report.status==='BLOCKED')process.exitCode=1;}
  catch {console.error('BLOCKED: qa_configuration_or_confirmation_invalid');process.exitCode=1;}
}
