import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), headers: vi.fn(), connect: vi.fn(), query: vi.fn(), release: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth/native', () => ({ getNativeAuth: () => ({ api: { getSession: mocks.session } }) }));
vi.mock('@/lib/backend/postgres', () => ({ getNativePool: () => ({ connect: mocks.connect }) }));

import { POST } from '@/app/api/backend/cloud/route';
import { consumeRateLimit, enforceNativeCloudRateLimit } from '@/lib/api/distributed-rate-limit';
import { identityEpochs, subjectDigest } from '@/lib/api/rate-limit-identity';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const identityKey = 'offline-identity-key-not-a-secret-0001';
function request(expectedUserId = owner, origin = 'https://app.example.invalid') {
  return new Request('https://app.example.invalid/api/backend/cloud?userId=' + other, {
    method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-user-id': other,
      'x-forwarded-for': '198.51.100.1', 'x-real-ip': '203.0.113.1' },
    body: JSON.stringify({ action: 'summary', expectedUserId, table: 'media_items', recordId: 'synthetic' }),
  });
}
function limiterCalls() {
  return mocks.query.mock.calls.filter(([sql]) => sql.includes('app.consume_application_rate_limit_v1'));
}
function envelope() { return JSON.parse(limiterCalls()[0][1][0]); }
function domainCalls() { return mocks.query.mock.calls.filter(([sql]) => sql.startsWith('SELECT id,title')); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('BACKEND_PROVIDER', 'native'); vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER', 'native');
  vi.stubEnv('TRUSTED_INGRESS_MODE', 'unconfigured');
  vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_KEY', identityKey); vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY', '');
  vi.stubEnv('RATE_LIMIT_RPC_SIGNING_KEY', 'offline-signing-key-not-a-secret-0002');
  vi.stubEnv('RATE_LIMIT_RPC_KEY_VERSION', 'offline-v1'); vi.stubEnv('RATE_LIMIT_RPC_AUDIENCE', 'mt:offline');
  mocks.headers.mockResolvedValue(new Headers({ cookie: 'synthetic-session' }));
  mocks.session.mockResolvedValue({ user: { id: owner } });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('app.consume_application_rate_limit_v1')
    ? [{ result: { allowed: true, reason: 'allowed', retry_after_seconds: 0 } }] : [] }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('native Cloud admission through session verification and SQL transport (offline)', () => {
  it('admits a verified owner with user subjects and empty ingress, ignoring header/query IDs', async () => {
    expect((await POST(request())).status).toBe(200);
    const e = envelope();
    expect(e).toMatchObject({ identity_class: 'user', ingress: [], policy_id: 'social_write', cost: 0 });
    expect(e.subjects).toEqual(identityEpochs(e.issued_at * 1000).map(epoch => ({ epoch,
      digest: subjectDigest(identityKey, 'mt:offline', 'social_write', epoch, { kind: 'user', value: owner }) })));
    expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('app.user_id', $1, true)", [owner]);
    expect(mocks.session).toHaveBeenCalledWith({ headers: await mocks.headers(), query: { disableRefresh: true } });
    expect(domainCalls()).toHaveLength(1);
  });
  it('denies anonymous requests despite forged owner fields before any DB connection', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(other))).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect((await enforceNativeCloudRateLimit(request()))?.status).toBe(503);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('rejects a body owner mismatch without changing limiter identity or executing Cloud work', async () => {
    expect((await POST(request(other))).status).toBe(503);
    expect(envelope().identity_class).toBe('user');
    expect(domainCalls()).toHaveLength(0);
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it.each([null, { user: { id: other } }])('denies session loss/change during limiter transaction: %s', async session => {
    mocks.session.mockResolvedValueOnce({ user: { id: owner } })
      .mockResolvedValueOnce({ user: { id: owner } }).mockResolvedValueOnce(session);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'rate_limit_unavailable' });
    expect(limiterCalls()).toHaveLength(0); expect(domainCalls()).toHaveLength(0);
  });
  it.each([
    [{ allowed: false, reason: 'limited', retry_after_seconds: 12 }, 429, 'rate_limited', '12'],
    [{ allowed: false, reason: 'capacity', retry_after_seconds: 5 }, 503, 'rate_limit_unavailable', '5'],
    [{ allowed: false, reason: 'replay', retry_after_seconds: 5 }, 503, 'rate_limit_unavailable', '5'],
    [{ allowed: true, reason: 'limited', retry_after_seconds: 1 }, 503, 'rate_limit_unavailable', '5'],
  ])('maps SQL admission %j to %s without Cloud side effects', async (result, status, code, retry) => {
    mocks.query.mockImplementation(async () => ({ rows: [{ result }] }));
    const response = await POST(request());
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
    expect(response.headers.get('retry-after')).toBe(retry);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(domainCalls()).toHaveLength(0); expect(limiterCalls()).toHaveLength(1);
  });
  it('fails closed on SQL error without diagnostics, retries or Cloud execution', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.consume_application_rate_limit_v1')) throw new Error('PRIVATE_SQL_CANARY');
      return { rows: [] };
    });
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'rate_limit_unavailable' });
    expect(limiterCalls()).toHaveLength(1); expect(domainCalls()).toHaveLength(0);
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('denies failed session verification and missing limiter config', async () => {
    mocks.session.mockRejectedValueOnce(new Error('PRIVATE_AUTH_CANARY'));
    expect((await POST(request())).status).toBe(503); expect(mocks.connect).not.toHaveBeenCalled();
    vi.stubEnv('RATE_LIMIT_RPC_SIGNING_KEY', '');
    expect((await POST(request())).status).toBe(503); expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('keeps trusted IP protection when available', async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('TRUSTED_INGRESS_MODE', 'local-test');
    vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', '192.0.2.1');
    expect((await POST(request())).status).toBe(200);
    expect(envelope().ingress.length).toBeGreaterThan(0);
  });
  it('retains CSRF denial before session and DB work', async () => {
    expect((await POST(request(owner, 'https://attacker.example.invalid'))).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each(['openlibrary_search', 'interpret', 'recommend', 'funded_ai', 'asset_write', 'xp_sync', 'settings_write'] as const)(
    'keeps the general %s limiter closed with no ingress even for a verified owner', async policy => {
      expect(await consumeRateLimit(request(), policy)).toMatchObject({ allowed: false, source: 'unavailable' });
      expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.connect).not.toHaveBeenCalled();
    });
  it('does not enable Cloud admission on the Supabase backend', async () => {
    vi.stubEnv('BACKEND_PROVIDER', 'supabase'); vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER', 'supabase');
    expect((await enforceNativeCloudRateLimit(request()))?.status).toBe(503);
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.connect).not.toHaveBeenCalled();
  });
});

it('SQL source permits empty ingress only for user identities and retains subject/global/capacity budgets', () => {
  const sql = readFileSync('database/native/006_distributed_limiter.sql', 'utf8');
  expect(sql).toContain("(e->>'identity_class'='ip' and jsonb_array_length(e->'ingress')=0)");
  expect(sql).toContain("jsonb_array_length(e->'subjects') not between 1 and 4");
  expect(sql).toContain("('social_write','social_write',30,null,0,true)");
  expect(sql).toContain('jsonb_array_elements(p_subjects)');
  expect(sql).toContain('jsonb_array_elements(p_ingress)');
  expect(sql).toContain("('dynamic',20,20,10)"); expect(sql).toContain('g.daily_count>=5000');
  expect(sql).toContain("'reason','capacity'"); expect(sql).toContain('pg_advisory_xact_lock');
});
