import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), headers: vi.fn(), connect: vi.fn(), query: vi.fn(), release: vi.fn(), notifications: vi.fn(), rpc: vi.fn(), fetch: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth/native', () => ({ getNativeAuth: () => ({ api: { getSession: mocks.session } }) }));
vi.mock('@/lib/backend/postgres', () => ({ getNativePool: () => ({ connect: mocks.connect }) }));
vi.mock('@/lib/social/interactions-server', () => ({ loadSocialNotifications: mocks.notifications }));
vi.mock('@/lib/backend/application-server', () => ({ getApplicationServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/providers/release-policy', () => ({ publicProviderCapability: () => ({ enabled: true }) }));

import { POST as search } from '@/app/api/tvmaze/search/route';
import { GET as notifications, PATCH as markRead } from '@/app/api/social/notifications/route';
import { consumeRateLimit, reportProviderCooldown } from '@/lib/api/distributed-rate-limit';
import { identityEpochs, subjectDigest } from '@/lib/api/rate-limit-identity';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key = 'offline-identity-key-not-a-secret-0001';
const signingKey = 'offline-signing-key-not-a-secret-0002';
function request(method = 'POST') {
  return new NextRequest('https://app.example.invalid/api/test?userId=' + other, { method,
    headers: { origin: 'https://app.example.invalid', 'content-type': 'application/json', 'x-user-id': other,
      'x-forwarded-for': '198.51.100.1', 'x-real-ip': '203.0.113.1' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(method === 'PATCH' ? { action: 'read_all' } : { query: 'show' }) }),
  });
}
function calls(operation = 'consume') {
  return mocks.query.mock.calls.filter(([sql]) => sql.includes(`app.${operation === 'consume' ? 'consume_application_rate_limit_v1' : 'report_provider_cooldown_v1'}`));
}
function envelope(operation = 'consume') { return JSON.parse(calls(operation)[0][1][0]); }
const allowed = { allowed: true, reason: 'allowed', retry_after_seconds: 0 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BACKEND_PROVIDER', 'native'); vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER', 'native');
  vi.stubEnv('TRUSTED_INGRESS_MODE', 'unconfigured');
  vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_KEY', key); vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY', '');
  vi.stubEnv('RATE_LIMIT_RPC_SIGNING_KEY', signingKey); vi.stubEnv('RATE_LIMIT_RPC_KEY_VERSION', 'offline-v1'); vi.stubEnv('RATE_LIMIT_RPC_AUDIENCE', 'mt:offline');
  mocks.headers.mockResolvedValue(new Headers({ cookie: 'synthetic-session' }));
  mocks.session.mockResolvedValue({ user: { id: owner } });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockImplementation(async () => ({ rows: [{ result: allowed }] }));
  mocks.notifications.mockResolvedValue({ notifications: [] }); mocks.rpc.mockResolvedValue({ data: {}, error: null });
  mocks.fetch.mockResolvedValue(Response.json([{ show: { id: 1, name: 'Show' } }])); vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const routes = [
  ['TVMaze search', () => search(request()), 'tvmaze_search', () => mocks.fetch],
  ['social notifications GET', () => notifications(request('GET')), 'social_read', () => mocks.notifications],
  ['social notifications PATCH', () => markRead(request('PATCH')), 'social_write', () => mocks.rpc],
] as const;
for (const [name, route, policy, downstream] of routes) describe(`${name}: native session admission (offline)`, () => {
  it('uses verified owner, signed user subjects and empty ingress despite forged headers', async () => {
    expect((await route()).status).toBe(200);
    const e = envelope();
    expect(e).toMatchObject({ identity_class: 'user', ingress: [], policy_id: policy });
    expect(e.subjects).toEqual(identityEpochs(e.issued_at * 1000).map(epoch => ({ epoch,
      digest: subjectDigest(key, 'mt:offline', policy === 'tvmaze_search' ? 'search' : policy, epoch, { kind: 'user', value: owner }) })));
    expect(calls()[0][1][1]).toBe(createHmac('sha256', signingKey).update(calls()[0][1][0]).digest('hex'));
    expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('app.user_id', $1, true)", [owner]);
    expect(downstream()).toHaveBeenCalledTimes(1);
  });
  it.each([null, { user: { id: 'forged' } }])('missing/invalid session %j only admits the bounded search pool', async session => {
    mocks.session.mockResolvedValue(session);
    const response = await route();
    if (policy === 'tvmaze_search' && session === null) {
      expect(response.status).toBe(200);
      const call = mocks.query.mock.calls.find(([sql]) => sql.includes('app.tvmaze_guest_rate_limit_v1'))!;
      expect(JSON.parse(call[1][0])).toMatchObject({ identity_class: 'guest_pool', ingress: [], policy_id: 'tvmaze_search' });
      expect(downstream()).toHaveBeenCalledTimes(1);
      return;
    }
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'rate_limit_unavailable' });
    expect(mocks.connect).not.toHaveBeenCalled(); expect(downstream()).not.toHaveBeenCalled();
  });
  it('denies auth errors, even with trusted ingress', async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('TRUSTED_INGRESS_MODE', 'local-test'); vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', '192.0.2.1');
    mocks.session.mockRejectedValue(new Error('PRIVATE_AUTH_CANARY'));
    expect((await route()).status).toBe(503); expect(mocks.connect).not.toHaveBeenCalled(); expect(downstream()).not.toHaveBeenCalled();
  });
  it.each([null, { user: { id: other } }])('denies session loss/change during transaction %j', async session => {
    mocks.session.mockResolvedValueOnce({ user: { id: owner } }).mockResolvedValueOnce(session);
    expect((await route()).status).toBe(503); expect(calls()).toHaveLength(0); expect(downstream()).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it.each([
    [{ allowed: false, reason: 'limited', retry_after_seconds: 12 }, 429],
    [{ allowed: false, reason: 'capacity', retry_after_seconds: 5 }, 503],
    [{ allowed: false, reason: 'replay', retry_after_seconds: 5 }, 503],
  ])('preserves exhausted quota/capacity/replay %j', async (result, status) => {
    mocks.query.mockResolvedValue({ rows: [{ result }] });
    const response = await route(); expect(response.status).toBe(status);
    expect(response.headers.get('retry-after')).toBe(String(result.retry_after_seconds));
    expect(downstream()).not.toHaveBeenCalled();
  });
  it('fails closed on PostgreSQL error without retry', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.consume_application_rate_limit_v1')) throw new Error('PRIVATE_SQL_CANARY');
      return { rows: [] };
    });
    const response = await route(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'rate_limit_unavailable' });
    expect(calls()).toHaveLength(1); expect(downstream()).not.toHaveBeenCalled();
  });
  it('auth timeout cannot start a late reservation', async () => {
    vi.useFakeTimers(); mocks.session.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ user: { id: owner } }), 1000)));
    const pending = route(); await vi.advanceTimersByTimeAsync(751); expect((await pending).status).toBe(503);
    await vi.advanceTimersByTimeAsync(500); expect(mocks.connect).not.toHaveBeenCalled(); expect(downstream()).not.toHaveBeenCalled();
  });
  it('limiter timeout cannot admit downstream even if SQL finishes late', async () => {
    vi.useFakeTimers(); let finish!: (value: unknown) => void;
    mocks.query.mockImplementation(async (sql: string) => sql.includes('app.consume_application_rate_limit_v1')
      ? new Promise(resolve => { finish = resolve; }) : { rows: [] });
    const pending = route(); await vi.advanceTimersByTimeAsync(751); expect((await pending).status).toBe(503);
    finish({ rows: [{ result: allowed }] }); await vi.advanceTimersByTimeAsync(1);
    expect(calls()).toHaveLength(1); expect(downstream()).not.toHaveBeenCalled();
  });
});

describe('TVMaze native shared cooldown without ingress', () => {
  it('provider budget denial returns 429 without an upstream call', async () => {
    mocks.query.mockResolvedValue({ rows: [{ result: { allowed: false, reason: 'limited', retry_after_seconds: 1 } }] });
    const response = await search(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: 'rate_limited' });
    expect(response.headers.get('retry-after')).toBe('1');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([502, 503])('upstream HTTP %s is a stable 502, not an empty search', async status => {
    mocks.fetch.mockResolvedValue(new Response(null, { status }));
    const response = await search(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: 'upstream_error' });
  });
  it('successful empty upstream search remains HTTP 200', async () => {
    mocks.fetch.mockResolvedValue(Response.json([]));
    const response = await search(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [] });
  });
  it('records signed user cooldown on upstream 429; subsequent denial starts no fetch', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '12' } }));
    mocks.query.mockImplementation(async (sql: string) => ({ rows: [{ result: sql.includes('app.report_provider_cooldown_v1')
      ? { ...allowed, retry_after_seconds: 30 } : allowed }] }));
    const response = await search(request()); expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('30');
    expect(envelope('cooldown')).toMatchObject({ operation: 'cooldown', policy_id: 'tvmaze_search', identity_class: 'user', ingress: [], cooldown: 12 });
    mocks.query.mockResolvedValue({ rows: [{ result: { allowed: false, reason: 'limited', retry_after_seconds: 30 } }] });
    expect((await search(request())).status).toBe(429); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it('cooldown DB failure is 503', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 429 }));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.report_provider_cooldown_v1')) throw new Error('PRIVATE_SQL_CANARY');
      return { rows: [{ result: allowed }] };
    });
    const response = await search(request()); expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'rate_limit_unavailable' });
  });
  it('cooldown auth timeout starts no late SQL', async () => {
    vi.useFakeTimers(); mocks.session.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ user: { id: owner } }), 1000)));
    const pending = reportProviderCooldown(request(), 'tvmaze_search', new Response(null, { status: 429 }));
    await vi.advanceTimersByTimeAsync(751); expect((await pending)?.status).toBe(503);
    await vi.advanceTimersByTimeAsync(500); expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('anonymous cooldown uses the shared pool and ignores forged ingress', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await reportProviderCooldown(request(), 'tvmaze_search', new Response(null, { status: 429 })))?.status).toBe(429);
    const call=mocks.query.mock.calls.find(([sql])=>sql.includes('app.tvmaze_guest_rate_limit_v1'))!;
    expect(JSON.parse(call[1][0])).toMatchObject({ operation: 'cooldown', identity_class: 'guest_pool', ingress: [], policy_id: 'tvmaze_search' });
  });
  it.each([null, { user: { id: other } }])('cooldown session loss/change fails closed %j', async session => {
    mocks.session.mockResolvedValueOnce({ user: { id: owner } }).mockResolvedValueOnce(session);
    expect((await reportProviderCooldown(request(), 'tvmaze_search', new Response(null, { status: 429 })))?.status).toBe(503);
    expect(calls('cooldown')).toHaveLength(0); expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('cooldown SQL timeout fails closed without retry', async () => {
    vi.useFakeTimers(); let finish!: (value: unknown) => void;
    mocks.query.mockImplementation(async (sql: string) => sql.includes('app.report_provider_cooldown_v1')
      ? new Promise(resolve => { finish = resolve; }) : { rows: [] });
    const pending = reportProviderCooldown(request(), 'tvmaze_search', new Response(null, { status: 429 }));
    await vi.advanceTimersByTimeAsync(751); expect((await pending)?.status).toBe(503);
    finish({ rows: [{ result: { ...allowed, retry_after_seconds: 30 } }] }); await vi.advanceTimersByTimeAsync(1);
    expect(calls('cooldown')).toHaveLength(1);
  });
});

it.each(['tvmaze_details', 'tvmaze_calendar'] as const)('admits explicit TVMaze policy %s with verified user only', async policy => {
  expect(await consumeRateLimit(request(), policy)).toMatchObject({ allowed: true, source: 'distributed' });
  expect(envelope()).toMatchObject({ policy_id: policy, identity_class: 'user', ingress: [], cost: policy === 'tvmaze_details' ? 2 : 1 });
});
