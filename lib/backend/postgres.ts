import 'server-only';
import { Pool } from 'pg';
import { getBackendProvider } from './provider';
import { nativeConfig } from './native-config';
import { runtimeRoleCheck } from './native-roles.mjs';
import { postgresTls } from './postgres-tls.mjs';

const state = globalThis as typeof globalThis & { nativePostgresPool?: Pool };
/** Infrastructure only. Protected repositories receive a transaction, never this pool. */
export function getNativePool(): Pool {
  if (getBackendProvider() !== 'native') throw new Error('native_backend_inactive');
  if (!state.nativePostgresPool) {
    const config = nativeConfig(process.env);
    const pool = new Pool({ connectionString: config.databaseUrl, max: config.max,
      ssl: postgresTls(config.ssl, config.caFile, new URL(config.databaseUrl).hostname),
      connectionTimeoutMillis: config.connectionTimeoutMillis, idleTimeoutMillis: config.idleTimeoutMillis,
      statement_timeout: config.statementTimeout, query_timeout: config.statementTimeout + 1000, idle_in_transaction_session_timeout: 10000,
      options: '-c search_path=native_auth,pg_catalog', application_name: 'mediatracker-native',
      onConnect: async client => {
        try {
          const check = runtimeRoleCheck(config.roles);
          const result = await client.query<{ safe: boolean }>(check.text, check.values);
          if (result.rows.length !== 1 || result.rows[0].safe !== true) throw new Error();
        } catch { throw new Error('native_database_role_invalid'); }
      } });
    // pg emits idle connection errors; consume without credentials/query/PII logging.
    pool.on('error', () => {});
    state.nativePostgresPool = pool;
  }
  return state.nativePostgresPool;
}
