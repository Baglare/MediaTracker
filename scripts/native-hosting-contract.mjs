import { runtimeRoleCheck } from '../lib/backend/native-roles.mjs';

export function hostingMemberships(r) {
  return [
    [r.runtime,r.auth_access,true,false],
    ...[r.owner,r.auth_owner,r.limiter,r.ledger_owner].map(owner => [r.migrator,owner,false,true]),
    [r.privacy_login,r.privacy_operator,true,false],
    ...[r.backup,r.restore].map(login => [login,r.privacy_operator,false,false]),
    ...[r.owner,r.auth_owner,r.limiter,r.ledger_owner].map(owner => [r.restore,owner,true,true]),
  ].map(([member,role,inherit,set]) => ({member,role,inherit,set}));
}
export function hostingSchemas(r) {
  return [{schema:'app',owner:r.owner},{schema:'native_auth',owner:r.auth_owner},
    {schema:'private_rate_limit',owner:r.limiter},{schema:'private_privacy_ops',owner:r.owner},
    {schema:'native_migrations',owner:r.ledger_owner}];
}
export async function inspectHostingContract(client, r, restore = false, installed = false) {
  const names = ['runtime','migrator','privacy_login','owner','auth_owner','auth_access','privacy_operator','limiter','backup','restore','database_owner','ledger_owner']
    .map(key => ({name:r[key],login:['runtime','migrator','privacy_login','backup','restore'].includes(key),
      inherit:key==='runtime',bypass:key==='backup'||key==='restore',limit:key==='runtime'?5:['migrator','privacy_login','backup','restore'].includes(key)?2:-1}));
  const safe = (await client.query(`WITH expected AS (SELECT * FROM jsonb_to_recordset($1::jsonb)
      AS e(name text,login boolean,inherit boolean,bypass boolean,"limit" integer)),
    edges AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS e(member text,role text,inherit boolean,set boolean)),
    schemas AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS e(schema text,owner text))
    SELECT
      NOT EXISTS(SELECT FROM expected e LEFT JOIN pg_roles r ON r.rolname=e.name
        WHERE r.oid IS NULL OR r.rolcanlogin<>e.login OR r.rolbypassrls<>e.bypass
        OR r.rolinherit<>e.inherit OR r.rolconnlimit<>e."limit" OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
      AND NOT EXISTS(SELECT FROM edges e LEFT JOIN pg_roles member ON member.rolname=e.member
        LEFT JOIN pg_roles role ON role.rolname=e.role LEFT JOIN pg_auth_members m ON m.member=member.oid AND m.roleid=role.oid
        WHERE m.member IS NULL OR m.admin_option OR m.inherit_option<>e.inherit OR m.set_option<>e.set)
      AND NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member
        JOIN pg_roles role ON role.oid=m.roleid WHERE (member.rolname IN (SELECT name FROM expected) OR role.rolname IN (SELECT name FROM expected))
        AND NOT EXISTS(SELECT FROM edges e WHERE e.member=member.rolname AND e.role=role.rolname))
      AND NOT EXISTS(SELECT FROM schemas e LEFT JOIN pg_namespace n ON n.nspname=e.schema
        LEFT JOIN pg_roles owner ON owner.oid=n.nspowner
        WHERE (NOT $4 AND n.oid IS NULL) OR (n.oid IS NOT NULL AND owner.rolname<>e.owner))
      AND (SELECT datdba=$5::regrole FROM pg_database WHERE datname=current_database())
      AND NOT EXISTS(SELECT FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
        WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type IN ('CONNECT','CREATE','TEMPORARY'))
      AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
        LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee
        WHERE (d.datname=($6::text[])[1] AND a.privilege_type='CONNECT' AND NOT coalesce(grantee.rolname=ANY($7::text[]),false))
           OR (d.datname=($6::text[])[2] AND a.privilege_type='CONNECT' AND NOT coalesce(grantee.rolname=ANY($8::text[]),false)))
      AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
        WHERE d.datname=($6::text[])[1] AND a.privilege_type IN ('CREATE','TEMPORARY') AND a.grantee<>d.datdba)
      AND NOT EXISTS(SELECT FROM expected e JOIN pg_roles r ON r.rolname=e.name CROSS JOIN pg_database d
        WHERE d.datname IN ('mt_p4_test','mediatracker_prod','mt_p4_test_restore','mediatracker_prod_restore')
        AND d.datname<>ALL($6::text[]) AND has_database_privilege(r.oid,d.oid,'CONNECT'))
      AND NOT EXISTS(SELECT FROM expected e JOIN pg_roles r ON r.rolname=e.name CROSS JOIN pg_database d
        WHERE (d.datname=($6::text[])[1] AND has_database_privilege(r.oid,d.oid,'CONNECT')<>(e.name=ANY($7::text[])))
           OR (d.datname=($6::text[])[2] AND has_database_privilege(r.oid,d.oid,'CONNECT')<>(e.name=ANY($8::text[]))))
      AND (SELECT nspowner='pg_database_owner'::regrole FROM pg_namespace WHERE nspname='public')
      AND NOT EXISTS(SELECT FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
        WHERE n.nspname='public' AND a.privilege_type='CREATE' AND (a.grantee=0 OR a.grantee<>n.nspowner))
      AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname NOT IN
        ('public','information_schema','app','native_auth','private_rate_limit','private_privacy_ops','native_migrations') AND n.nspname NOT LIKE 'pg_%')
      AND NOT EXISTS(SELECT FROM pg_namespace n JOIN pg_depend d ON d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid
        WHERE n.nspname='public')
      AS safe`, [JSON.stringify(names),JSON.stringify(hostingMemberships(r)),JSON.stringify(hostingSchemas(r)),
        restore && !installed,r.database_owner,[r.database,r.restoreDatabase],
        [r.runtime,r.migrator,r.privacy_login,r.backup,r.database_owner],[r.restore,r.database_owner]])).rows[0]?.safe;
  if (safe !== true) throw new Error('native_hosting_contract_invalid');
  // Runtime connection checks also apply when inspecting as an operator.
  const check = runtimeRoleCheck(r,false);
  if (!restore && (await client.query(check.text,check.values)).rows[0]?.safe !== true)
    throw new Error('native_hosting_runtime_invalid');
}

export async function assertHostingEmpty(client,r) {
  // Includes functions/types/operators, not just tables. Extension/system objects
  // outside our five schemas are permitted; every managed schema must be empty.
  const dirty = (await client.query(`SELECT EXISTS(
    SELECT FROM pg_namespace n JOIN pg_depend d ON d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid
    WHERE n.nspname=ANY($1::text[])) OR EXISTS(
    SELECT FROM pg_namespace n WHERE n.nspname NOT IN ('public','information_schema')
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>ALL($1::text[])) OR EXISTS(
    SELECT FROM pg_depend d JOIN pg_namespace n ON d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid
    WHERE n.nspname='public' AND d.deptype<>'e') AS dirty`,[hostingSchemas(r).map(s=>s.schema)])).rows[0]?.dirty;
  if (dirty !== false) throw new Error('native_hosting_target_not_empty');
}
