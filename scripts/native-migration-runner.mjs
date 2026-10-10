import { pathToFileURL } from 'node:url';
import { assertHostingEmpty, inspectHostingContract } from './native-hosting-contract.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { sqlWithoutTransaction } from './native-hosting-sql.mjs';
import { authorizeTarget, withOperator } from './native-ops-target.mjs';
export function validateHistory(rows, manifest=nativeMigrationManifest()) {
  if(rows.length>manifest.length || rows.some((row,i)=>row.name!==manifest[i].name || row.checksum!==manifest[i].checksum)) throw new Error('native_migration_history_invalid');
  return manifest.slice(rows.length);
}
export async function migrationHistory(client, roles = undefined) {
  const exists=(await client.query("SELECT to_regclass('native_migrations.ledger') IS NOT NULL AS present")).rows[0]?.present;
  if(!exists) {
    if(roles?.hosted) {await assertHostingEmpty(client,roles);return [];}
    const state=(await client.query(`SELECT EXISTS(SELECT FROM pg_namespace WHERE nspname IN ('app','native_auth','native_migrations'))
      OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','S','v','m')
        AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')) AS dirty`)).rows[0];
    if(state?.dirty)throw new Error('native_migration_ledger_missing');
    return [];
  }
  return (await client.query('SELECT name,checksum FROM native_migrations.ledger ORDER BY name')).rows;
}
export async function runMigrations(client,config,target,options={}) {
  authorizeTarget(target,config,{operation:'MIGRATE',...options,provisioner:true});
  const roles=config.roles;
  if(roles?.hosted) await inspectHostingContract(client,roles);
  const manifest=nativeMigrationManifest(roles?.profile);
  if(!options.apply)return {target,pending:validateHistory(await migrationHistory(client, roles),manifest).map(e=>e.name)};
  // Session lock owns the entire ordered run, including ledger creation/history check.
  await client.query('SELECT pg_advisory_lock(207403,1)');
  try {
    const pending=validateHistory(await migrationHistory(client, roles),manifest);
    await client.query(`${roles?.hosted?`SET ROLE ${roles.ledger_owner};`:'CREATE SCHEMA IF NOT EXISTS native_migrations;'}
      REVOKE ALL ON SCHEMA native_migrations FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS native_migrations.ledger(name text PRIMARY KEY,checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'),applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
      REVOKE ALL ON native_migrations.ledger FROM PUBLIC;
      ${roles?.hosted?`GRANT USAGE ON SCHEMA native_migrations TO ${roles.migrator}; GRANT SELECT ON native_migrations.ledger TO ${roles.migrator}; RESET ROLE;`:""}`);
    for(const entry of pending) {
      await client.query('BEGIN');
      try {
        await client.query(sqlWithoutTransaction(entry.sql));
        if(roles?.hosted)await client.query(`SET LOCAL ROLE ${roles.ledger_owner}`);
        await client.query('INSERT INTO native_migrations.ledger(name,checksum) VALUES($1,$2)',[entry.name,entry.checksum]);
        await client.query('COMMIT');
      } catch {await client.query('ROLLBACK');throw new Error('native_migration_apply_failed');}
    }
    if(validateHistory(await migrationHistory(client, roles),manifest).length)throw new Error('native_migration_incomplete');
    return {target,applied:pending.map(e=>e.name)};
  } finally {await client.query('SELECT pg_advisory_unlock(207403,1)');}
}
export function parseOperatorArgs(args,extra=[]) {
  const options={apply:false,connect:false};
  const seen=new Set();
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(seen.has(arg))throw new Error('native_cli_option_invalid');seen.add(arg);
    if(arg==='--apply')options.apply=true;
    else if(arg==='--connect')options.connect=true;
    else if(['--confirmation',...extra].includes(arg)) {if(!args[i+1] || args[i+1].startsWith('--'))throw new Error('native_cli_option_invalid');options[arg.slice(2)]=args[++i];}
    else throw new Error('native_cli_option_invalid');
  }
  if(options.apply&&!options.connect)throw new Error('native_cli_connection_required');
  return options;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const options=parseOperatorArgs(process.argv.slice(2));
    const result=options.connect?await withOperator(process.env,(client,config,target)=>
      config.expected?runMigrations(client,config,target,options):options.apply?Promise.reject(new Error('native_target_unconfirmed')):{target}):
      {mode:'OFFLINE',migrations:nativeMigrationManifest(process.env.NATIVE_ROLE_PROFILE).map(({name,checksum})=>({name,checksum}))};
    console.log(JSON.stringify(result,null,2));
  } catch {console.error('native_migration_command_failed');process.exitCode=1;}
}
