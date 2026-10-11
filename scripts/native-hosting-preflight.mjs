// Read-only hosting diagnostics. No mutation/apply flag, secrets or raw SQL errors.
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { operatorConfig, digest } from './native-ops-target.mjs';
import { postgresTls } from '../lib/backend/postgres-tls.mjs';
import { hostingSchemas, inspectHostingContract, assertHostingEmpty } from './native-hosting-contract.mjs';
import { migrationHistory, validateHistory } from './native-migration-runner.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';

export async function hostingPreflight(client, config) {
  if(config.roles.profile!=='hosting-test' || config.kind!=='migrator')
    throw new Error('native_preflight_test_target_required');
  await client.query('BEGIN READ ONLY');
  try {
    const row=(await client.query(`SELECT current_database() AS database, session_user AS role,
      current_setting('server_version_num')::integer AS version, host(inet_server_addr()) AS server,
      inet_server_port() AS port, (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl`)).rows[0];
    if(!row || row.database!==config.roles.database || row.role!==config.roles.migrator
      || row.version<180000 || row.ssl!==true || row.port!==5433 || !['127.0.0.1','::1'].includes(row.server))
      throw new Error('native_target_identity_invalid');
    const identity={environment:config.environment,host:config.url.hostname,database:row.database,
      role:row.role,server:row.server,port:row.port,oid:row.oid,major:Math.floor(row.version/10000)};
    const schemas=(await client.query(`SELECT n.nspname AS schema,r.rolname AS owner,
      NOT EXISTS(SELECT FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0) AS public_denied
      FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname`,
      [hostingSchemas(config.roles).map(s=>s.schema)])).rows;
    const privileges=(await client.query(`SELECT r.rolname AS role,d.datname AS database,
      owner.rolname AS owner,has_database_privilege(r.oid,d.oid,'CONNECT') AS connect,
      has_database_privilege(r.oid,d.oid,'CREATE') AS create,has_database_privilege(r.oid,d.oid,'TEMP') AS temp
      FROM pg_roles r CROSS JOIN pg_database d JOIN pg_roles owner ON owner.oid=d.datdba
      WHERE r.rolname=ANY($1::text[]) AND d.datname=ANY($2::text[]) ORDER BY d.datname,r.rolname`,
      [[config.roles.runtime,config.roles.migrator,config.roles.privacy_login],['mt_p4_test','mediatracker_prod']])).rows;
    const memberships=(await client.query(`SELECT member.rolname AS member,role.rolname AS role,
      m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS set
      FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles role ON role.oid=m.roleid
      WHERE member.rolname=ANY($1::text[]) OR role.rolname=ANY($1::text[]) ORDER BY member.rolname,role.rolname`,
      [Object.values(config.roles).filter(v=>typeof v==='string' && v.startsWith('mt_test_'))])).rows;
    let contract='FAIL',empty=false,history='UNVERIFIED',pending=[];
    try {await inspectHostingContract(client,config.roles);contract='PASS';} catch { /* fixed status only */ }
    try {await assertHostingEmpty(client,config.roles);empty=true;} catch { /* occupied/unknown */ }
    if(contract==='PASS') {
      try {
        const rows=await migrationHistory(client,config.roles);
        pending=validateHistory(rows,nativeMigrationManifest(config.roles.profile)).map(e=>e.name);
        history=rows.length===0?'EMPTY':'VALID';
      } catch {history='FAIL';}
    }
    return {target:{...identity,version:row.version,fingerprint:digest(identity)},tls:'VERIFY_FULL',
      capability:config.roles.capability,schemas,memberships,privileges,contract,empty,history,pending,
      mutation:'NOT_PERFORMED',approvalRequired:true,recovery:'PROVIDER_BACKUP_RESTORE_UNVERIFIED'};
  } finally {await client.query('ROLLBACK');}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  let client;
  try {
    if(process.argv.slice(2).join(' ')!=='--connect')throw new Error('native_preflight_arguments_invalid');
    const config=operatorConfig(process.env);
    if(config.roles.profile!=='hosting-test' || config.kind!=='migrator'
      || config.url.hostname!=='127.0.0.1' || config.url.port!=='5433')
      throw new Error('native_preflight_test_target_required');
    client=new Client({connectionString:config.url.href,ssl:postgresTls(config.ssl,config.caFile,config.url.hostname),
      connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,
      options:'-c search_path=pg_catalog,pg_temp',application_name:'mediatracker-hosting-preflight'});
    client.on('error',()=>{});
    await client.connect();
    const result=await hostingPreflight(client,config);
    console.log(JSON.stringify(result,null,2));
    if(result.contract!=='PASS' || !['EMPTY','VALID'].includes(result.history))process.exitCode=1;
  } catch {console.error('native_hosting_preflight_failed');process.exitCode=1;}
  finally {await client?.end().catch(()=>{});}
}
