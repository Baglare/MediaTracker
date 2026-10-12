// Production-only read inspection. No fixtures, migrations, DDL or write probes.
import { pathToFileURL } from 'node:url';
import { withOperator, authorizeTarget, digest } from './native-ops-target.mjs';
import { nativeConfig } from '../lib/backend/native-config.ts';
import { nativeRoles, runtimeRoleCheck } from '../lib/backend/native-roles.mjs';
import { postgresTls } from '../lib/backend/postgres-tls.mjs';
import { migrationHistory, validateHistory } from './native-migration-runner.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { inspectBackupCoverage, quoteIdentifier } from './native-recovery-evidence.mjs';

function exactProduction(url, roles) {
  if (roles.profile !== 'hosting-production' || roles.capability !== 'shared-managed'
    || url.hostname !== '127.0.0.1' || url.port !== '5433' || decodeURIComponent(url.pathname.slice(1)) !== 'mediatracker_prod')
    throw new Error('native_production_target_invalid');
}
export async function productionInspection(client, config, target) {
  exactProduction(config.url, config.roles);
  if (config.expected) authorizeTarget(target, config, {operation:config.kind === 'backup' ? 'BACKUP' : config.kind === 'privacy_login' ? 'MAINTAIN' : 'MIGRATE'});
  await client.query('BEGIN READ ONLY');
  try {
    const history = await migrationHistory(client, config.roles);
    const pending = validateHistory(history, nativeMigrationManifest(config.roles.profile)).map(e => e.name);
    let data = history.length ? 'UNKNOWN' : 'EMPTY';
    if (config.kind === 'backup' && history.length >= 11) {
      await inspectBackupCoverage(client, config.roles);
      const tables = (await client.query(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('app','native_auth','private_privacy_ops','private_rate_limit') AND c.relkind IN ('r','p')
        AND NOT (n.nspname='app' AND c.relname='release_write_state') ORDER BY n.nspname,c.relname`)).rows;
      let populated = false;
      for (const table of tables) {
        const row = (await client.query(`SELECT EXISTS(SELECT FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} LIMIT 1) AS populated`)).rows[0];
        if (row?.populated !== false && row?.populated !== true) throw new Error('native_inventory_invalid');
        populated ||= row.populated;
      }
      data = populated ? 'PRESENT' : 'EMPTY';
    }
    return {target,roleGraph:'PASS',history:history.length,pending,data,migrationAuthority:data === 'EMPTY' ? 'EMPTY_TARGET_ONLY' : 'STOP_PRESERVATION_AND_TRANSFER_DECISION_REQUIRED'};
  } finally { await client.query('ROLLBACK'); }
}
export async function runtimeInspection(env) {
  const config = nativeConfig({...env,NODE_ENV:'production'}), url = new URL(config.databaseUrl);
  exactProduction(url,config.roles);
  const {Client} = await import('pg');
  const client = new Client({connectionString:config.databaseUrl,ssl:postgresTls(true,config.caFile,url.hostname),
    connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,options:'-c search_path=pg_catalog'});
  client.on('error',()=>{});
  try {
    await client.connect(); await client.query('BEGIN READ ONLY');
    const check = runtimeRoleCheck(config.roles);
    if ((await client.query(check.text,check.values)).rows[0]?.safe !== true) throw new Error('native_runtime_invalid');
    const row = (await client.query(`SELECT current_database() AS database,session_user AS role,host(inet_server_addr()) AS server,
      inet_server_port() AS port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
      current_setting('server_version_num')::integer AS version`)).rows[0];
    const identity={environment:'production',host:url.hostname,database:row.database,role:row.role,server:row.server,port:row.port,oid:row.oid,major:Math.floor(row.version/10000)};
    if (identity.major !== 18 || row.role !== nativeRoles('hosting-production','shared-managed').runtime) throw new Error('native_runtime_target_invalid');
    const fingerprint=digest(identity);
    if (env.NATIVE_RUNTIME_EXPECTED_FINGERPRINT && env.NATIVE_RUNTIME_EXPECTED_FINGERPRINT !== fingerprint) throw new Error('native_runtime_target_changed');
    await client.query('ROLLBACK');
    return {target:{...identity,fingerprint},runtimeBoundary:'PASS'};
  } finally { await client.end().catch(()=>{}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const kind=process.argv[2];
    if (process.argv.length !== 3 || !['operator','runtime'].includes(kind)) throw new Error('native_production_arguments_invalid');
    console.log(JSON.stringify(kind === 'runtime' ? await runtimeInspection(process.env) : await withOperator(process.env,productionInspection),null,2));
  } catch {console.error('native_production_preflight_failed');process.exitCode=1;}
}
