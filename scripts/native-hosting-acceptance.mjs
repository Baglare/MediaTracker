// Test database only. Never migrates, commits, changes memberships or reads real user rows.
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { operatorConfig } from './native-ops-target.mjs';
import { hostingPreflight } from './native-hosting-preflight.mjs';
import { assertNativeRoleTarget, runtimeRoleCheck } from '../lib/backend/native-roles.mjs';
import { postgresTls } from '../lib/backend/postgres-tls.mjs';

const requiredFunctions = [
  'app.current_user_id()',
  'app.apply_media_item_sync_operation(text,text,text,bigint,jsonb)',
  'app.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)',
  'app.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean)',
  'app.consume_application_rate_limit_v1(text,text)',
  'app.report_provider_cooldown_v1(text,text)',
];
const businessTables = ['media_items','progress_logs','cloud_media_sync_operations','goals','goal_sync_operations'];
const authTables = ['user','session','account','verification','rateLimit'];
function requirePass(value, code) { if (value !== true) throw new Error(code); }
export function acceptanceConfig(env) {
  const config = operatorConfig(env);
  if (config.roles.profile !== 'hosting-test' || config.kind !== 'migrator'
    || config.environment !== 'disposable' || config.url.hostname !== '127.0.0.1'
    || config.url.port !== '5433' || !/^[a-f0-9]{64}$/.test(config.expected ?? ''))
    throw new Error('native_acceptance_test_target_required');
  let runtime;
  try { runtime = new URL(env.NATIVE_ACCEPTANCE_RUNTIME_URL); } catch { throw new Error('native_acceptance_runtime_required'); }
  assertNativeRoleTarget(config.roles, runtime);
  if (runtime.protocol !== config.url.protocol || runtime.hostname !== config.url.hostname
    || runtime.port !== config.url.port || runtime.search || runtime.hash || !runtime.password)
    throw new Error('native_acceptance_runtime_target_invalid');
  return {...config, runtime};
}
export async function inspectAcceptance(client, config) {
  const preflight = await hostingPreflight(client, config);
  if (preflight.target.fingerprint !== config.expected || preflight.contract !== 'PASS'
    || preflight.history !== 'VALID' || preflight.pending.length)
    throw new Error('native_acceptance_preflight_failed');
  return preflight;
}
export async function inspectRuntime(client, config, target) {
  await client.query('BEGIN READ ONLY');
  try {
    const identity = (await client.query(`SELECT current_database() AS database, session_user AS role,
      host(inet_server_addr()) AS server, inet_server_port() AS port,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl`)).rows[0];
    requirePass(!!identity && identity.database === 'mt_p4_test' && identity.role === config.roles.runtime
      && identity.server === target.server && identity.port === target.port && identity.oid === target.oid
      && identity.ssl === true, 'native_acceptance_runtime_identity_invalid');
    const check = runtimeRoleCheck(config.roles);
    requirePass((await client.query(check.text,check.values)).rows[0]?.safe, 'native_acceptance_runtime_unsafe');
    const catalog = (await client.query(`SELECT
      (SELECT count(*)=5 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='app' AND c.relname=ANY($1::text[]))
      AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='app' AND c.relkind IN ('r','p') AND
        (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS
          (SELECT FROM pg_policy p WHERE p.polrelid=c.oid)))
      AND (SELECT count(*)=5 AND bool_and(has_table_privilege(current_user,c.oid,'SELECT'))
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='native_auth' AND c.relname=ANY($2::text[]))
      AND NOT has_table_privilege(current_user,'native_auth."user"','INSERT')
      AND NOT has_table_privilege(current_user,'native_auth."user"','DELETE')
      AND has_table_privilege(current_user,'native_auth.session','INSERT')
      AND has_table_privilege(current_user,'native_auth.session','UPDATE')
      AND has_table_privilege(current_user,'native_auth.session','DELETE')
      AND NOT has_schema_privilege(current_user,'private_rate_limit','USAGE')
      AND NOT has_schema_privilege(current_user,'native_migrations','USAGE')
      AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('app','private_rate_limit') AND p.prosecdef
        AND (NOT EXISTS(SELECT FROM unnest(p.proconfig) v WHERE v LIKE 'search_path=%')
          OR EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))) AS safe`,[businessTables,authTables])).rows[0];
    requirePass(catalog?.safe,'native_acceptance_catalog_invalid');
    for (const signature of requiredFunctions) {
      requirePass((await client.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') AS safe",[signature])).rows[0]?.safe,
        'native_acceptance_function_denied');
    }
    // Resolve required adapter columns without fetching any stored identity/session.
    await client.query(`SELECT u.id,u.email,u."emailVerified",s.token,s."expiresAt",s."userId",
      a."providerId",a."accountId",a.password,v.identifier,v.value,r.key,r.count,r."lastRequest"
      FROM native_auth."user" u CROSS JOIN native_auth.session s CROSS JOIN native_auth.account a
      CROSS JOIN native_auth.verification v CROSS JOIN native_auth."rateLimit" r WHERE false`);
    return {runtime:'PASS',authSchema:'PASS',forceRls:'PASS',functionPermissions:'PASS',mutation:'NOT_PERFORMED',
      betterAuthLogin:'NOT_RUN',recovery:'PROVIDER_BACKUP_RESTORE_UNVERIFIED'};
  } finally { await client.query('ROLLBACK'); }
}

export async function rollbackAcceptance(client, config, confirmation) {
  if (config.roles.profile !== 'hosting-test' || config.kind !== 'migrator'
    || !/^[a-f0-9]{64}$/.test(config.expected ?? '')
    || confirmation !== `ROLLBACK_TEST mt_p4_test ${config.expected}`)
    throw new Error('native_acceptance_confirmation_required');
  // The current closed graph deliberately forbids this. Fail BEFORE fixture DML.
  // Never auto-grant runtime membership or weaken the hosting contract to test it.
  await client.query('BEGIN');
  try {
    const capability = (await client.query("SELECT pg_has_role(session_user,$1::regrole,'SET') AS safe",[config.roles.runtime])).rows[0]?.safe;
    requirePass(capability,'native_acceptance_blocked_runtime_set_role');
    const users = [randomUUID(),randomUUID()], id = `acceptance-${randomUUID()}`;
    await client.query(`SET LOCAL ROLE ${config.roles.auth_owner}`);
    for (const user of users) await client.query('INSERT INTO native_auth."user"(id,name,email) VALUES($1,$2,$3)',
      [user,'Synthetic acceptance',`${user}@example.invalid`]);
    await client.query(`SET LOCAL ROLE ${config.roles.runtime}`);
    const session = randomUUID(), token = randomUUID();
    await client.query('INSERT INTO native_auth.session(id,token,"expiresAt","userId") VALUES($1,$2,now()+interval \'5 minutes\',$3)',[session,token,users[0]]);
    requirePass((await client.query('SELECT "userId"=$2::uuid AND "expiresAt">now() AS safe FROM native_auth.session WHERE id=$1 AND token=$3',[session,users[0],token])).rows[0]?.safe,
      'native_acceptance_session_failed');
    const identity = async user => client.query("SELECT set_config('app.user_id',$1,true)",[user ?? '']);
    const media = {title:'Synthetic acceptance',type:'book',status:'planning',current_progress:0,total_progress:1,favorite:false,tags:[],metadata:{}};
    const now = new Date().toISOString();
    const goal = {id,title:'Synthetic acceptance',origin:'manual',scope:{},metric:{},schedule:{},lifecycle:'active',createdAt:now,updatedAt:now};
    const visible = async expected => {
      for (const table of ['media_items','goals']) {
        const result = await client.query(`SELECT count(*)::integer AS count FROM app.${table} WHERE id=$1 AND user_id=ANY($2::uuid[])`,[id,users]);
        requirePass(result.rows[0]?.count === expected,'native_acceptance_isolation_failed');
      }
    };
    await identity(users[0]);
    const operation = randomUUID();
    const applyMedia = () => client.query("SELECT app.apply_media_item_sync_operation($1,$2,'upsert',0,$3::jsonb) AS result",[operation,id,JSON.stringify(media)]);
    requirePass((await applyMedia()).rows[0]?.result?.ok,'native_acceptance_media_failed');
    requirePass((await applyMedia()).rows[0]?.result?.ok,'native_acceptance_media_replay_failed');
    requirePass((await client.query('SELECT app.apply_cloud_goal_v1($1,$2,0,$3::jsonb,false) AS result',
      [randomUUID(),id,JSON.stringify(goal)])).rows[0]?.result?.status === 'applied','native_acceptance_goal_failed');
    await visible(1);
    await identity(users[1]); await visible(0);
    requirePass((await client.query("SELECT app.apply_media_item_sync_operation($1,$2,'delete',1,null) AS result",
      [randomUUID(),id])).rows[0]?.result?.conflict,'native_acceptance_cross_owner_write');
    requirePass((await client.query('SELECT app.apply_cloud_goal_v1($1,$2,1,null,true) AS result',
      [randomUUID(),id])).rows[0]?.result?.status === 'revision_conflict','native_acceptance_cross_owner_goal_write');
    await identity(null); await visible(0);
    await client.query('SAVEPOINT denied');
    try {
      await applyMedia();
      throw new Error('native_acceptance_anonymous_write_allowed');
    } catch (error) {
      if (error.code !== 'P0001' || error.message !== 'authentication_required') throw error;
      await client.query('ROLLBACK TO SAVEPOINT denied');
    }
    await identity(users[0]); await visible(1);
    requirePass((await client.query("SELECT app.apply_media_item_sync_operation($1,$2,'delete',1,null) AS result",
      [randomUUID(),id])).rows[0]?.result?.ok,'native_acceptance_media_delete_failed');
    requirePass((await client.query('SELECT app.apply_cloud_goal_v1($1,$2,1,null,true) AS result',
      [randomUUID(),id])).rows[0]?.result?.status === 'applied','native_acceptance_goal_delete_failed');
    await client.query('DELETE FROM native_auth.session WHERE id=$1 AND "userId"=$2',[session,users[0]]);
    return {isolation:'PASS',sessionStorage:'PASS',cloudMedia:'PASS',goals:'PASS',mutation:'ROLLED_BACK',
      runtimeSessionLogin:'NOT_RUN',betterAuthLogin:'NOT_RUN'};
  } finally { await client.query('ROLLBACK'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const clients = [];
  try {
    const args = process.argv.slice(2);
    const readOnly = args.length === 1 && args[0] === '--read-only';
    const rollback = args.length === 3 && args[0] === '--rollback-test' && args[1] === '--confirmation';
    if (!readOnly && !rollback) throw new Error('native_acceptance_arguments_invalid');
    const config = acceptanceConfig(process.env);
    if (rollback && args[2] !== `ROLLBACK_TEST mt_p4_test ${config.expected}`) throw new Error('native_acceptance_confirmation_required');
    async function connect(url) {
      const client = new Client({connectionString:url.href,ssl:postgresTls(true,config.caFile,url.hostname),
        connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,lock_timeout:2000,
        options:'-c search_path=pg_catalog',application_name:'mediatracker-test-acceptance'});
      clients.push(client); client.on('error',()=>{}); await client.connect(); return client;
    }
    const operator = await connect(config.url);
    const preflight = await inspectAcceptance(operator,config);
    const runtime = await connect(config.runtime);
    const checks = await inspectRuntime(runtime,config,preflight.target);
    const result = rollback ? await rollbackAcceptance(operator,config,args[2]) : checks;
    console.log(JSON.stringify({checks:result,checksum:'PASS',betterAuthHttpAcceptance:'NOT_RUN'},null,2));
  } catch (error) {
    console.error(error.message === 'native_acceptance_blocked_runtime_set_role'
      ? 'BLOCKED_ROLE_TOPOLOGY: synthetic users and runtime execution cannot share one rollback transaction under the current closed role graph'
      : 'native_hosting_acceptance_failed');
    process.exitCode = 1;
  } finally { for (const client of clients) await client.end().catch(()=>{}); }
}
