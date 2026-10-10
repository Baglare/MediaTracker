import { nativeRoles } from '../lib/backend/native-roles.mjs';

// Lexer, not text substitution: comments are opaque; dollar-quoted code is
// recursively scanned; only complete known role identifiers/literals are mapped.
export function mapNativeSql(sql, roles, transactions = undefined) {
  const local = nativeRoles();
  const names = new Map(Object.keys(local).filter(k => typeof local[k] === 'string' && local[k].startsWith('mt_'))
    .map(k => [local[k], roles[k]]));
  let out = '', i = 0;
  while (i < sql.length) {
    const start = i, c = sql[i];
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end + 1;
    } else if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; } else i++;
      }
      if (depth) throw new Error('native_sql_token_invalid');
    } else if (c === "'" || c === '"') {
      i++; let value = '', closed = false;
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) { value += c; i += 2; }
          else { i++; closed = true; break; }
        } else { value += sql[i++]; }
      }
      if (!closed) throw new Error('native_sql_token_invalid');
      if (names.has(value)) { out += c + names.get(value) + c; continue; }
    } else if (c === '$' && /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/.test(sql.slice(i))) {
      const tag = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end < 0) throw new Error('native_sql_token_invalid');
      out += tag + mapNativeSql(sql.slice(i + tag.length, end), roles) + tag;
      i = end + tag.length; continue;
    } else if (/[a-zA-Z_]/.test(c)) {
      i++; while (i < sql.length && /[a-zA-Z_0-9$]/.test(sql[i])) i++;
      const token = sql.slice(start, i);
      if (transactions && ['BEGIN','COMMIT'].includes(token.toUpperCase()) && /^\s*;/.test(sql.slice(i))) {
        transactions.push(token.toUpperCase());
        i += sql.slice(i).match(/^\s*;/)[0].length;
        continue;
      }
      out += names.get(token) ?? token; continue;
    } else i++;
    out += sql.slice(start, i);
  }
  return out;
}
export function sqlWithoutTransaction(sql) {
  const boundaries=[];
  const result=mapNativeSql(sql,nativeRoles(),boundaries);
  if(boundaries.join(',')!=='BEGIN,COMMIT')throw new Error('native_migration_transaction_invalid');
  return result;
}
function exact(sql, before, after) {
  if (sql.split(before).length !== 2) throw new Error('native_hosting_source_drift');
  return sql.replace(before, after);
}
export function hostingSql(name, sql, roles) {
  if (!roles.hosted) return sql;
  if (name === '001_security_foundation.sql') {
    const marker = 'SET LOCAL ROLE mt_owner;';
    const end = sql.indexOf(marker);
    if (end < 0 || !sql.startsWith('-- Fresh native database only.')) throw new Error('native_hosting_source_drift');
    sql = `BEGIN;
SET LOCAL ROLE mt_auth_owner;
REVOKE ALL ON SCHEMA native_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA native_auth TO mt_auth_access;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
SET LOCAL ROLE mt_owner;
REVOKE ALL ON SCHEMA app, private_privacy_ops FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO mt_runtime;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
` + sql.slice(end);
  }
  if (name === '006_distributed_limiter.sql') {
    const prefix = `CREATE ROLE mt_limiter NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT mt_limiter TO CURRENT_USER;
CREATE SCHEMA private_rate_limit AUTHORIZATION mt_limiter;
REVOKE ALL ON SCHEMA private_rate_limit FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO mt_limiter;
GRANT CREATE ON SCHEMA app TO mt_limiter;`;
    sql = exact(sql, prefix, `SET LOCAL ROLE mt_owner;
GRANT USAGE, CREATE ON SCHEMA app TO mt_limiter;
RESET ROLE;
SET LOCAL ROLE mt_limiter;
REVOKE ALL ON SCHEMA private_rate_limit FROM PUBLIC;
RESET ROLE;`);
    sql = exact(sql, 'REVOKE CREATE ON SCHEMA app FROM mt_limiter;',
      'SET LOCAL ROLE mt_owner;\nREVOKE CREATE ON SCHEMA app FROM mt_limiter;\nRESET ROLE;');
  }
  if (name === '008_privacy_lifecycle.sql')
    sql = exact(sql, 'CREATE SCHEMA private_privacy_ops AUTHORIZATION mt_owner;', '-- Schema preprovisioned and validated.');
  if (name === '009_deployment_operations.sql') sql = exact(sql, 'BEGIN;\n', 'BEGIN;\nSET LOCAL ROLE mt_ledger_owner;\n');
  if (name === '009_deployment_operations.sql') sql = exact(sql, 'SET LOCAL ROLE mt_owner;', 'RESET ROLE;\nSET LOCAL ROLE mt_owner;');
  // Scoped read ACLs for the isolated BYPASSRLS backup login, including future objects.
  const grants = name === '009_deployment_operations.sql' ? `
SET LOCAL ROLE mt_owner;
GRANT USAGE ON SCHEMA app,private_privacy_ops TO ${roles.backup};
GRANT SELECT ON ALL TABLES IN SCHEMA app,private_privacy_ops TO ${roles.backup};
GRANT EXECUTE ON FUNCTION app.set_release_freeze(boolean,bigint),app.native_ops_state(),app.native_ops_assets(),app.native_ops_lifecycle_state() TO ${roles.backup};
GRANT SELECT ON ALL SEQUENCES IN SCHEMA app,private_privacy_ops TO ${roles.backup};
ALTER DEFAULT PRIVILEGES IN SCHEMA app,private_privacy_ops GRANT SELECT ON TABLES TO ${roles.backup};
ALTER DEFAULT PRIVILEGES IN SCHEMA app,private_privacy_ops GRANT SELECT ON SEQUENCES TO ${roles.backup};
RESET ROLE;
SET LOCAL ROLE mt_auth_owner;
GRANT USAGE ON SCHEMA native_auth TO ${roles.backup};
GRANT SELECT ON ALL TABLES IN SCHEMA native_auth TO ${roles.backup};
GRANT SELECT ON ALL SEQUENCES IN SCHEMA native_auth TO ${roles.backup};
ALTER DEFAULT PRIVILEGES IN SCHEMA native_auth GRANT SELECT ON TABLES TO ${roles.backup};
ALTER DEFAULT PRIVILEGES IN SCHEMA native_auth GRANT SELECT ON SEQUENCES TO ${roles.backup};
RESET ROLE;
SET LOCAL ROLE mt_limiter;
GRANT USAGE ON SCHEMA private_rate_limit TO ${roles.backup};
GRANT SELECT ON ALL TABLES IN SCHEMA private_rate_limit TO ${roles.backup};
GRANT SELECT ON ALL SEQUENCES IN SCHEMA private_rate_limit TO ${roles.backup};
ALTER DEFAULT PRIVILEGES IN SCHEMA private_rate_limit GRANT SELECT ON TABLES TO ${roles.backup};
ALTER DEFAULT PRIVILEGES IN SCHEMA private_rate_limit GRANT SELECT ON SEQUENCES TO ${roles.backup};
RESET ROLE;
SET LOCAL ROLE ${roles.ledger_owner};
GRANT USAGE ON SCHEMA native_migrations TO ${roles.backup};
GRANT SELECT ON native_migrations.ledger TO ${roles.backup};
GRANT USAGE ON SCHEMA native_migrations TO ${roles.migrator};
GRANT SELECT ON native_migrations.ledger TO ${roles.migrator};
RESET ROLE;
` : '';
  return mapNativeSql(sql, roles) + grants;
}
