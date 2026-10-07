import 'server-only';
import { Pool } from 'pg';
import { getBackendProvider } from './provider';
import { nativeConfig } from './native-config';

const state = globalThis as typeof globalThis & { nativePostgresPool?: Pool };
/** Infrastructure only. Protected repositories receive a transaction, never this pool. */
export function getNativePool(): Pool {
  if (getBackendProvider() !== 'native') throw new Error('native_backend_inactive');
  if (!state.nativePostgresPool) {
    const config = nativeConfig(process.env);
    const pool = new Pool({ connectionString: config.databaseUrl, max: config.max,
      ssl: config.ssl ? { rejectUnauthorized: true } : false,
      connectionTimeoutMillis: config.connectionTimeoutMillis, idleTimeoutMillis: config.idleTimeoutMillis,
      statement_timeout: config.statementTimeout, query_timeout: config.statementTimeout + 1000, idle_in_transaction_session_timeout: 10000,
      options: '-c search_path=native_auth,pg_catalog', application_name: 'mediatracker-native',
      onConnect: async client => {
        try {
          const result = await client.query<{ safe: boolean }>(`SELECT
            current_user = 'mt_runtime' AND session_user = 'mt_runtime'
            AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
            AND NOT pg_has_role(current_user, 'mt_owner', 'MEMBER')
            AND NOT pg_has_role(current_user, 'mt_auth_owner', 'MEMBER')
            AND NOT pg_has_role(current_user, 'mt_privacy_operator', 'MEMBER')
            AND NOT EXISTS (SELECT FROM pg_roles WHERE rolname='mt_limiter' AND pg_has_role(current_user,oid,'MEMBER'))
            AND NOT has_schema_privilege(current_user, 'app', 'CREATE')
            AND NOT has_schema_privilege(current_user, 'native_auth', 'CREATE')
            AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
            AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='app' AND c.relkind IN ('r','p')
              AND (c.relowner = (SELECT oid FROM pg_roles WHERE rolname=current_user)
                OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS safe
            FROM pg_roles WHERE rolname=current_user`);
          if (result.rows.length !== 1 || result.rows[0].safe !== true) throw new Error();
        } catch { throw new Error('native_database_role_invalid'); }
      } });
    // pg emits idle connection errors; consume without credentials/query/PII logging.
    pool.on('error', () => {});
    state.nativePostgresPool = pool;
  }
  return state.nativePostgresPool;
}
