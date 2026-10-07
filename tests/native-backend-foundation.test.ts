import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveBackendProvider } from '@/lib/backend/provider';
import { nativeConfig } from '@/lib/backend/native-config';
import { nativeAuthOptions } from '@/lib/auth/native-options';
import { applicationUser } from '@/lib/auth/identity';
import { isSupabaseConfigured } from '@/lib/supabase/status';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ current: vi.fn(), connect: vi.fn(), query: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: mocks.current }));
vi.mock('@/lib/backend/postgres', () => ({ getNativePool: () => ({ connect: mocks.connect }) }));
import { withAuthenticatedTransaction, requireAuthenticatedTransaction, type AuthenticatedTransaction } from '@/lib/backend/transaction';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env = { DATABASE_URL: 'postgresql://mt_runtime:synthetic@localhost/mt_p1_test', DATABASE_SSL_MODE: 'disable',
  BETTER_AUTH_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: 's'.repeat(40) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.current.mockResolvedValue({ id });
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});
afterEach(() => vi.unstubAllEnvs());
describe('backend configuration', () => {
  it('defaults only locally and fails closed for invalid or missing production selection', () => {
    expect(resolveBackendProvider(undefined)).toBe('supabase');
    for (const value of ['', 'bogus', ' native ']) expect(() => resolveBackendProvider(value)).toThrow('backend_configuration_invalid');
    expect(() => resolveBackendProvider(undefined, true)).toThrow();
    expect(resolveBackendProvider('native', true)).toBe('native');
    expect(resolveBackendProvider('supabase', true)).toBe('supabase');
  });
  it('preserves Supabase pairing and disables it in native mode even with old env', () => {
    vi.stubEnv('BACKEND_PROVIDER', 'supabase');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://synthetic.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic');
    expect(isSupabaseConfigured()).toBe(true);
    vi.stubEnv('BACKEND_PROVIDER', 'native');
    expect(isSupabaseConfigured()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER', 'supabase');
    expect(() => isSupabaseConfigured()).toThrow('backend_configuration_invalid');
  });
  it('bounds pools and forbids privileged credentials and insecure production transport', () => {
    expect(nativeConfig(env).max).toBe(2);
    for (const patch of [{ DATABASE_POOL_MAX: '6' }, { DATABASE_POOL_MAX: '0' }, { DATABASE_POOL_MAX: '2.5' },
      { DATABASE_URL: 'postgresql://postgres:secret@localhost/db' }, { DATABASE_URL: env.DATABASE_URL + '?sslmode=disable' },
      { BETTER_AUTH_SECRET: 'short' }, { BETTER_AUTH_URL: 'http://user:password@localhost' }, { NODE_ENV: 'production' }]) {
      expect(() => nativeConfig({ ...env, ...patch })).toThrow('native_configuration_invalid');
    }
    expect(nativeConfig({ ...env, NODE_ENV: 'production', DATABASE_SSL_MODE: 'verify-full', BETTER_AUTH_URL: 'https://app.example.invalid' }).ssl).toBe(true);
  });
});
describe('native identity transaction', () => {
  it('pins BEGIN, transaction-local identity, callback and COMMIT to one client', async () => {
    let captured: AuthenticatedTransaction | undefined;
    await withAuthenticatedTransaction(async tx => {
      requireAuthenticatedTransaction(tx); captured = tx;
      expect(tx.userId).toBe(id);
      await tx.query('SELECT $1', ['value']);
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls).toEqual([['BEGIN'], ["SELECT set_config('app.user_id', $1, true)", [id]], ['SELECT $1', ['value']], ['COMMIT']]);
    expect(mocks.release).toHaveBeenCalledWith(false);
    expect(() => requireAuthenticatedTransaction(captured!)).toThrow();
    expect(() => captured!.query('SELECT 1')).toThrow('transaction_context_expired');
  });
  it('never accepts caller-submitted identity and refuses forged transaction contexts', async () => {
    mocks.current.mockResolvedValue(null);
    await expect(withAuthenticatedTransaction(async () => {})).rejects.toThrow('authentication_required');
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(() => requireAuthenticatedTransaction({ userId: id, query: mocks.query })).toThrow('transaction_context_required');
  });
  it('rolls back, discards and redacts callback SQL/credentials/errors', async () => {
    await expect(withAuthenticatedTransaction(async () => { throw new Error('password SQL personal-body'); })).rejects.toThrow(/^database_operation_failed$/);
    expect(mocks.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
    expect(mocks.release).toHaveBeenCalledWith(true);
  });
  it('discards even when rollback fails; connect errors are redacted', async () => {
    mocks.query.mockRejectedValue(new Error('secret'));
    await expect(withAuthenticatedTransaction(async () => {})).rejects.toThrow(/^database_operation_failed$/);
    expect(mocks.release).toHaveBeenCalledWith(true);
    mocks.release.mockClear(); mocks.connect.mockRejectedValue(new Error('postgresql://secret'));
    await expect(withAuthenticatedTransaction(async () => {})).rejects.toThrow(/^database_operation_failed$/);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it('does not release or commit before callback resolves', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const transaction = withAuthenticatedTransaction(async () => pending);
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(2));
    expect(mocks.release).not.toHaveBeenCalled(); finish(); await transaction;
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it('bounds callback lifetime and expires leaked contexts before rollback/release', async () => {
    vi.useFakeTimers();
    try {
      let captured: AuthenticatedTransaction | undefined;
      const operation=withAuthenticatedTransaction(async tx=>{captured=tx;return new Promise<void>(()=>{});});
      const rejected=expect(operation).rejects.toThrow('database_operation_failed');
      await vi.advanceTimersByTimeAsync(10_001);await rejected;
      expect(mocks.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);expect(mocks.release).toHaveBeenCalledWith(true);
      expect(()=>captured!.query('SELECT 1')).toThrow('transaction_context_expired');
    } finally {vi.useRealTimers();}
  });
});
describe('auth foundation', () => {
  it('uses server DB sessions, fixed trusted origin, UUIDs and hardened cookies', () => {
    const options = nativeAuthOptions({ ...env, NODE_ENV: 'production', DATABASE_SSL_MODE: 'verify-full', BETTER_AUTH_URL: 'https://app.example.invalid' });
    expect(options.trustedOrigins).toEqual(['https://app.example.invalid']);
    expect(options.advanced.defaultCookieAttributes).toEqual({ httpOnly: true, sameSite: 'lax', secure: true });
    expect(options.advanced.database.generateId).toBe('uuid');
    expect(options.emailAndPassword).toEqual({ enabled: true, disableSignUp: true });
    expect(options.session.cookieCache.enabled).toBe(false);
    expect(options.rateLimit.storage).toBe('database');
  });
  it('returns minimal UUID identity without privilege/session data', () => {
    const raw = { id, email: 'synthetic@example.invalid', role: 'admin', app_metadata: { role: 'admin' }, token: 'secret' };
    expect(applicationUser(raw)).toEqual({ id, email: raw.email });
    expect(applicationUser(null)).toBe(null);
    expect(() => applicationUser({ id: 'not-a-uuid' })).toThrow('identity_invalid');
  });
  it('keeps native role ownership and historical managed migration paths separate', () => {
    const sql = readFileSync('database/native/001_security_foundation.sql', 'utf8');
    expect(sql).toContain('mt_runtime LOGIN NOSUPERUSER NOBYPASSRLS');
    expect(sql).toContain('SECURITY INVOKER SET search_path = pg_catalog');
    expect(sql).not.toContain('GRANT mt_owner TO mt_runtime');
    expect(sql).not.toContain('auth.uid()');
    const proof = readFileSync('database/native/rls-proof.sql', 'utf8');
    for (const pattern of ['FORCE ROW LEVEL SECURITY', 'WITH CHECK', 'ROLLBACK', 'cross update allowed', 'anonymous insert allowed', 'privileged membership']) expect(proof).toContain(pattern);
  });
});
