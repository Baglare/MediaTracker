// Operator-only. No runtime URL fallback, default target or automatic connection.
import { createHash } from 'node:crypto';
export const digest = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const labels = ['development','disposable','staging','production'];
export function operatorConfig(env) {
  try {
    const url = new URL(env.NATIVE_OPS_DATABASE_URL);
    const environment = env.NATIVE_OPS_ENVIRONMENT;
    if (!labels.includes(environment) || !['postgres:','postgresql:'].includes(url.protocol)
      || !url.hostname || !url.username || !url.pathname.slice(1) || url.search || url.hash
      || decodeURIComponent(url.username)==='mt_runtime'
      || !['verify-full', ...(environment==='disposable'||environment==='development'?['disable']:[])].includes(env.NATIVE_OPS_SSL_MODE)) throw new Error();
    return { url, environment, ssl:env.NATIVE_OPS_SSL_MODE==='verify-full', expected:env.NATIVE_OPS_EXPECTED_FINGERPRINT };
  } catch { throw new Error('native_operator_configuration_invalid'); }
}
export async function inspectTarget(client, config) {
  const row=(await client.query(`SELECT current_database() AS database, session_user AS role,
    current_setting('server_version_num')::integer AS version, inet_server_addr()::text AS address,
    inet_server_port() AS port, (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
    CASE WHEN EXISTS(SELECT FROM pg_roles WHERE rolname='mt_privacy_operator')
      THEN pg_has_role(session_user,(SELECT oid FROM pg_roles WHERE rolname='mt_privacy_operator'),'MEMBER') ELSE false END AS operator,
    (SELECT rolcreatedb OR rolcreaterole OR rolsuper FROM pg_roles WHERE rolname=session_user) AS provisioner`)).rows[0];
  if(!row || row.role==='mt_runtime' || !/^[a-zA-Z0-9_-]{1,63}$/.test(row.database)
    || !/^[a-zA-Z0-9_-]{1,63}$/.test(row.role) || row.version<180000
    || row.database!==decodeURIComponent(config.url.pathname.slice(1)) || row.role!==decodeURIComponent(config.url.username)) throw new Error('native_target_identity_invalid');
  const identity={environment:config.environment,host:config.url.hostname, database:row.database,
    role:row.role,server:row.address,port:row.port,oid:row.oid,major:Math.floor(row.version/10000)};
  return {...identity,version:row.version,fingerprint:digest(identity),operator:row.operator,provisioner:row.provisioner};
}
export function authorizeTarget(target, config, {operation,apply=false,confirmation,operator=false,provisioner=false}) {
  if(!/^[a-f0-9]{64}$/.test(config.expected??'') || target.fingerprint!==config.expected
    || target.environment!==config.environment || (operator && !target.operator) || (provisioner && !target.provisioner)) throw new Error('native_target_unconfirmed');
  if(apply && confirmation!==`${operation} ${target.environment} ${target.fingerprint}`) throw new Error('native_apply_confirmation_required');
  if(operation==='RESTORE' && !['development','disposable'].includes(target.environment)) throw new Error('native_restore_target_denied');
}
export async function withOperator(env, callback) {
  const config=operatorConfig(env);
  const { Client }=await import('pg');
  const client=new Client({connectionString:config.url.href,ssl:config.ssl?{rejectUnauthorized:true}:false,
    connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,lock_timeout:2000,
    application_name:'mediatracker-native-ops',options:'-c search_path=pg_catalog'});
  client.on('error',()=>{});
  try {await client.connect();return await callback(client,config,await inspectTarget(client,config));}
  finally {await client.end().catch(()=>{});}
}
