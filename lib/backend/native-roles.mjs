// Closed profiles: role names are never independently supplied by environment.
export const nativeRoleProfiles = ['local', 'hosting-test', 'hosting-production'];
export function nativeRoles(profile = 'local') {
  if (!nativeRoleProfiles.includes(profile)) throw new Error('native_role_profile_invalid');
  const prefix = profile === 'local' ? 'mt_' : profile === 'hosting-test' ? 'mt_test_' : 'mt_prod_';
  return Object.freeze({ profile, hosted: profile !== 'local',
    database: profile === 'hosting-test' ? 'mt_p4_test' : profile === 'hosting-production' ? 'mediatracker_prod' : null,
    restoreDatabase: profile === 'hosting-test' ? 'mt_p4_test_restore' : profile === 'hosting-production' ? 'mediatracker_prod_restore' : null,
    runtime:prefix+'runtime', migrator:prefix+'migrator', privacy_login:prefix+'privacy_login',
    owner:prefix+'owner', auth_owner:prefix+'auth_owner', auth_access:prefix+'auth_access',
    privacy_operator:prefix+'privacy_operator', limiter:prefix+'limiter',
    backup:prefix+'backup', restore:prefix+'restore', database_owner:prefix+'database_owner',
    ledger_owner:prefix+'ledger_owner' });
}
export function assertNativeRoleTarget(roles, url, kind = 'runtime', restore = false) {
  const login = decodeURIComponent(url.username), database = decodeURIComponent(url.pathname.slice(1));
  if (!roles.hosted && (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || /^(mt_test_|mt_prod_)/.test(login)
    || ['mt_p4_test','mediatracker_prod','mt_p4_test_restore','mediatracker_prod_restore'].includes(database)))
    throw new Error('native_role_target_invalid');
  if (roles.hosted && (database !== (restore ? roles.restoreDatabase : roles.database)
    || login !== roles[kind])) throw new Error('native_role_target_invalid');
  if (!roles.hosted && (kind === 'runtime' ? login !== roles.runtime : login === roles.runtime))
    throw new Error('native_role_target_invalid');
}

// Parameters are values, including role names cast to regrole; no SQL interpolation.
export function runtimeRoleCheck(roles, session = true) {
  const actor = session ? 'current_user' : '$1::text';
  return { values: [roles.runtime, roles.auth_access, roles.database, roles.hosted], text: `SELECT
    ${session ? 'current_user=$1 AND session_user=$1 AND' : ''} ($3::text IS NULL OR current_database()=$3)
    AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
    AND NOT EXISTS (SELECT FROM pg_roles r WHERE r.rolname<>$2 AND r.oid<>me.oid
      AND pg_has_role(me.oid,r.oid,'MEMBER'))
    AND (NOT $4::boolean OR NOT pg_has_role(me.oid,$2::regrole,'SET'))
    AND pg_has_role(me.oid,$2::regrole,'USAGE')
    AND NOT EXISTS (SELECT FROM pg_database d WHERE has_database_privilege(me.oid,d.oid,'CREATE'))
    AND NOT has_database_privilege(${actor},current_database(),'TEMP')
    AND NOT EXISTS (SELECT FROM pg_namespace n WHERE has_schema_privilege(${actor},n.oid,'CREATE'))
    AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='app' AND c.relkind IN ('r','p')
      AND (c.relowner=me.oid OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS safe
    FROM pg_roles me WHERE rolname=${actor}` };
}
