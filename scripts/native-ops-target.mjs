// Operator-only. No runtime URL fallback, default target or automatic connection.
import { createHash } from 'node:crypto';
import { nativeRoles, assertNativeRoleTarget } from '../lib/backend/native-roles.mjs';
import { postgresTls } from '../lib/backend/postgres-tls.mjs';
import { inspectHostingContract } from './native-hosting-contract.mjs';
import { isAbsolute } from 'node:path';
const connectedOperators = new WeakMap();
export function assertHostedOperatorClient(client,config,target) {
  const proven=connectedOperators.get(client);
  if(!proven || proven.config!==config || proven.target!==target || !config.roles?.hosted)
    throw new Error('native_operator_client_unproven');
}
export const digest = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const labels = ['development','disposable','staging','production'];
export function operatorConfig(env) {
  try {
    const url = new URL(env.NATIVE_OPS_DATABASE_URL);
    const environment = env.NATIVE_OPS_ENVIRONMENT;
    const roles = nativeRoles(env.NATIVE_ROLE_PROFILE);
    const kind = env.NATIVE_OPS_ROLE_KIND ?? 'migrator';
    if(env.NATIVE_OPS_SSL_CA_FILE && (!isAbsolute(env.NATIVE_OPS_SSL_CA_FILE) || env.NATIVE_OPS_SSL_MODE!=='verify-full'))throw new Error();
    if (!['migrator','privacy_login','backup','restore'].includes(kind)) throw new Error();
    assertNativeRoleTarget(roles,url,kind,kind==='restore');
    if (roles.hosted && (env.NATIVE_OPS_SSL_MODE!=='verify-full' || !env.NATIVE_OPS_SSL_CA_FILE
      || (kind==='restore' ? environment!=='disposable' : environment!==(roles.profile==='hosting-test'?'disposable':'production')))) throw new Error();
    if (!labels.includes(environment) || !['postgres:','postgresql:'].includes(url.protocol)
      || !url.hostname || !url.username || !url.pathname.slice(1) || url.search || url.hash
      || decodeURIComponent(url.username)==='mt_runtime'
      || !['verify-full', ...(environment==='disposable'||environment==='development'?['disable']:[])].includes(env.NATIVE_OPS_SSL_MODE)) throw new Error();
    return { url, environment, roles, kind, caFile:env.NATIVE_OPS_SSL_CA_FILE, ssl:env.NATIVE_OPS_SSL_MODE==='verify-full', expected:env.NATIVE_OPS_EXPECTED_FINGERPRINT };
  } catch { throw new Error('native_operator_configuration_invalid'); }
}
export async function inspectTarget(client, config) {
  const row=(await client.query(`SELECT current_database() AS database, session_user AS role,
    current_setting('server_version_num')::integer AS version, inet_server_addr()::text AS address,
    inet_server_port() AS port, (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
    CASE WHEN EXISTS(SELECT FROM pg_roles WHERE rolname=$1)
      THEN pg_has_role(session_user,(SELECT oid FROM pg_roles WHERE rolname=$1),'MEMBER') ELSE false END AS operator,
    (SELECT rolcreatedb OR rolcreaterole OR rolsuper FROM pg_roles WHERE rolname=session_user) AS provisioner`,[config.roles?.privacy_operator ?? 'mt_privacy_operator'])).rows[0];
  if(!row || row.role==='mt_runtime' || !/^[a-zA-Z0-9_-]{1,63}$/.test(row.database)
    || !/^[a-zA-Z0-9_-]{1,63}$/.test(row.role) || row.version<180000
    || row.database!==decodeURIComponent(config.url.pathname.slice(1)) || row.role!==decodeURIComponent(config.url.username)) throw new Error('native_target_identity_invalid');
  if(config.roles?.hosted) await inspectHostingContract(client,config.roles,config.kind==='restore');
  const identity={environment:config.environment,host:config.url.hostname, database:row.database,
    role:row.role,server:row.address,port:row.port,oid:row.oid,major:Math.floor(row.version/10000)};
  return {...identity,version:row.version,fingerprint:digest(identity),operator:row.operator,provisioner:config.roles?.hosted?config.kind==='migrator'||config.kind==='restore':row.provisioner};
}
export function authorizeTarget(target, config, {operation,apply=false,confirmation,operator=false,provisioner=false}) {
  if(!/^[a-f0-9]{64}$/.test(config.expected??'') || target.fingerprint!==config.expected
    || target.environment!==config.environment || (operator && !target.operator) || (provisioner && !target.provisioner)) throw new Error('native_target_unconfirmed');
  if(config.roles?.hosted && ((operation==='MIGRATE' && config.kind!=='migrator') || (operation==='BACKUP' && config.kind!=='backup') || (operation==='RESTORE' && config.kind!=='restore') || (operation==='MAINTAIN' && config.kind!=='privacy_login'))) throw new Error('native_operator_role_denied');
  if(apply && confirmation!==`${operation} ${target.environment} ${target.fingerprint}`) throw new Error('native_apply_confirmation_required');
  if(operation==='RESTORE' && !['development','disposable'].includes(target.environment)) throw new Error('native_restore_target_denied');
}
export async function withOperator(env, callback) {
  const config=operatorConfig(env);
  const { Client }=await import('pg');
  const client=new Client({connectionString:config.url.href,ssl:postgresTls(config.ssl,config.caFile,config.url.hostname),
    connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,lock_timeout:2000,
    application_name:'mediatracker-native-ops',options:'-c search_path=pg_catalog'});
  client.on('error',()=>{});
  try {
    await client.connect();const target=await inspectTarget(client,config);
    connectedOperators.set(client,{config,target});
    return await callback(client,config,target);
  } finally {connectedOperators.delete(client);await client.end().catch(()=>{});}
}
