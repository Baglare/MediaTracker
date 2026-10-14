import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ session: vi.fn(), headers: vi.fn(), connect: vi.fn(), query: vi.fn(), release: vi.fn(), asset: vi.fn() }));
vi.mock('next/headers', () => ({ headers: m.headers }));
vi.mock('@/lib/auth/native', () => ({ getNativeAuth: () => ({ api: { getSession: m.session } }) }));
vi.mock('@/lib/backend/postgres', () => ({ getNativePool: () => ({ connect: m.connect }) }));
// No filesystem IO: keep the real route, session, domain client and signed limiter.
vi.mock('@/lib/backend/filesystem-assets', () => ({ replaceNativeAsset: m.asset }));

import { POST as upload, DELETE as removeAsset } from '@/app/api/social/assets/route';
import { POST as xp } from '@/app/api/xp/route';
import { PUT as saveTheme, DELETE as deleteTheme } from '@/app/api/personalization/themes/sync/route';
import { consumeRateLimit, RATE_LIMIT_POLICIES } from '@/lib/api/distributed-rate-limit';
import { identityEpochs, subjectDigest } from '@/lib/api/rate-limit-identity';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key = 'offline-identity-key-not-a-secret-0001', signingKey = 'offline-signing-key-not-a-secret-0002';
const allowed = { allowed: true, reason: 'allowed', retry_after_seconds: 0 };
const themeState = { exists: true, schemaVersion: 1, activeThemeSelection: { kind: 'preset', id: 'obsidian' }, customThemes: [], revision: 1, updatedAt: '2026-10-13T00:00:00.000Z' };
function request(method: string, body?: unknown, headers: Record<string, string> = {}, kind = 'avatar') {
  const h = new Headers({ origin: 'https://app.example.invalid', 'x-user-id': other, 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '203.0.113.1', ...headers });
  if (h.get('origin') === '') h.delete('origin');
  if (body && !(body instanceof FormData)) h.set('content-type', 'application/json');
  return new Request(`https://app.example.invalid/api/test?kind=${kind}&userId=${other}`, { method, headers: h,
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
}
function uploadRequest(headers?: Record<string, string>, kind = 'avatar') {
  const form = new FormData(); form.set('kind', kind);
  form.set('file', new File([new Uint8Array(16)], 'synthetic.png', { type: 'image/png' }));
  return request('POST', form, headers);
}
function limiterCalls() { return m.query.mock.calls.filter(([sql]) => sql.includes('app.consume_application_rate_limit_v1')); }
function envelope() { return JSON.parse(limiterCalls()[0][1][0]); }
function domainCalls() { return m.query.mock.calls.filter(([sql]) => /SELECT app\.(xp_|save_theme|delete_theme)/.test(sql)); }
function expectNoWrite() { expect(domainCalls()).toHaveLength(0); expect(m.asset).not.toHaveBeenCalled(); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BACKEND_PROVIDER', 'native'); vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER', 'native');
  vi.stubEnv('NATIVE_ROLE_PROFILE', 'local'); vi.stubEnv('TRUSTED_INGRESS_MODE', 'unconfigured');
  vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_KEY', key); vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY', '');
  vi.stubEnv('RATE_LIMIT_RPC_SIGNING_KEY', signingKey); vi.stubEnv('RATE_LIMIT_RPC_KEY_VERSION', 'offline-v1'); vi.stubEnv('RATE_LIMIT_RPC_AUDIENCE', 'mt:offline');
  m.headers.mockResolvedValue(new Headers({ cookie: 'synthetic-session' }));
  m.session.mockResolvedValue({ user: { id: owner, emailVerified: true } });
  m.connect.mockResolvedValue({ query: m.query, release: m.release });
  m.query.mockImplementation(async (sql: string) => ({ rows: [{ result: sql.includes('consume_application_rate_limit_v1') ? allowed : { ok: true, deleted: true, state: themeState } }] }));
  m.asset.mockResolvedValue({ ok: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const routes = [
  ['avatar upload', 'asset_write', (h?: Record<string, string>) => upload(uploadRequest(h))],
  ['avatar delete', 'asset_write', (h?: Record<string, string>) => removeAsset(request('DELETE', undefined, h))],
  ['banner upload', 'asset_write', (h?: Record<string, string>) => upload(uploadRequest(h, 'banner'))],
  ['banner delete', 'asset_write', (h?: Record<string, string>) => removeAsset(request('DELETE', undefined, h, 'banner'))],
  ['XP sync', 'xp_sync', (h?: Record<string, string>) => xp(request('POST', { action: 'sync_states', items: [], replace: true }, h))],
  ['badge selection', 'xp_sync', (h?: Record<string, string>) => xp(request('POST', { action: 'select_badges', badgeKeys: ['synthetic'] }, h))],
  ['title selection', 'xp_sync', (h?: Record<string, string>) => xp(request('POST', { action: 'select_title', title: 'Synthetic' }, h))],
  ['theme save', 'settings_write', (h?: Record<string, string>) => saveTheme(request('PUT', { expectedRevision: 0, activeThemeSelection: themeState.activeThemeSelection, customThemes: [] }, h))],
  ['theme delete', 'settings_write', (h?: Record<string, string>) => deleteTheme(request('DELETE', undefined, h))],
] as const;
for (const [name, policy, route] of routes) describe(`${name}: ingress absent (offline)`, () => {
  it('admits only verified owner through signed SQL; ignores forged header/query identities', async () => {
    expect((await route()).status).toBe(200);
    const e = envelope(); expect(e).toMatchObject({ policy_id: policy, identity_class: 'user', ingress: [], cost: 0 });
    expect(e.subjects).toEqual(identityEpochs(e.issued_at * 1000).map(epoch => ({ epoch,
      digest: subjectDigest(key, 'mt:offline', policy, epoch, { kind: 'user', value: owner }) })));
    expect(limiterCalls()).toHaveLength(1);
    expect(limiterCalls()[0][1][1]).toBe(createHmac('sha256', signingKey).update(limiterCalls()[0][1][0]).digest('hex'));
    expect(m.query).toHaveBeenCalledWith("SELECT set_config('app.user_id', $1, true)", [owner]);
    expect(domainCalls().length + m.asset.mock.calls.length).toBe(1);
  });
  it.each([null, { user: { id: 'forged', emailVerified: true } }])('denies anonymous/invalid session %j without DB work', async session => {
    m.session.mockResolvedValue(session); expect((await route()).status).toBe(session === null ? 401 : 500);
    expect(m.connect).not.toHaveBeenCalled(); expectNoWrite();
    expect(await consumeRateLimit(request('GET'), policy)).toMatchObject({ allowed: false, source: 'unavailable' });
  });
  it('auth failure stays closed without leaking diagnostics', async () => {
    m.session.mockRejectedValue(new Error('PRIVATE_AUTH_CANARY'));
    const response = await route(); expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await response.text()).not.toContain('PRIVATE_AUTH_CANARY'); expect(m.connect).not.toHaveBeenCalled(); expectNoWrite();
  });
  it.each([false, undefined, 'true'])('denies unverified session emailVerified=%s before DB work', async emailVerified => {
    m.session.mockResolvedValue({ user: { id: owner, emailVerified } });
    expect((await route()).status).toBe(401);
    expect(m.connect).not.toHaveBeenCalled(); expectNoWrite();
  });
  it('limiter session failure denies after route authentication', async () => {
    // Assets also perform an authenticated account barrier before the limiter.
    const initialSessions = policy === 'asset_write' ? 2 : 1;
    for (let i = 0; i < initialSessions; i++) m.session.mockResolvedValueOnce({ user: { id: owner, emailVerified: true } });
    m.session.mockRejectedValueOnce(new Error('PRIVATE_AUTH_CANARY'));
    expect((await route()).status).toBe(503); expect(limiterCalls()).toHaveLength(0); expectNoWrite();
  });
  it.each([null, { user: { id: other, emailVerified: true } }])('limiter transaction session loss/change %j denies before RPC', async session => {
    const initialSessions = policy === 'asset_write' ? 3 : 2;
    for (let i = 0; i < initialSessions; i++) m.session.mockResolvedValueOnce({ user: { id: owner, emailVerified: true } });
    m.session.mockResolvedValueOnce(session);
    expect((await route()).status).toBe(503); expect(limiterCalls()).toHaveLength(0); expectNoWrite();
    expect(m.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it.each([
    [{ allowed: false, reason: 'limited', retry_after_seconds: 12 }, 429],
    [{ allowed: false, reason: 'capacity', retry_after_seconds: 5 }, 503],
    [{ allowed: false, reason: 'replay', retry_after_seconds: 5 }, 503],
    [{ allowed: true, reason: 'limited', retry_after_seconds: 1 }, 503],
  ])('preserves quota/global budget/capacity decisions %j', async (result, status) => {
    const normal = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string, ...args: unknown[]) => sql.includes('consume_application_rate_limit_v1') ? { rows: [{ result }] } : normal(sql, ...args));
    const response = await route(); expect(response.status).toBe(status);
    expect(response.headers.get('retry-after')).toBe(status === 429 ? '12' : '5');
    expect(limiterCalls()).toHaveLength(1); expectNoWrite();
  });
  it('SQL failure denies without retry or write', async () => {
    const normal = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('consume_application_rate_limit_v1')) throw new Error('PRIVATE_SQL_CANARY');
      return normal(sql, ...args);
    });
    const response = await route(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'rate_limit_unavailable' });
    expect(limiterCalls()).toHaveLength(1); expectNoWrite();
  });
  it('750 ms limiter timeout denies even if SQL finishes late', async () => {
    vi.useFakeTimers(); let finish!: (value: unknown) => void;
    const normal = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string, ...args: unknown[]) => sql.includes('consume_application_rate_limit_v1') ? new Promise(resolve => { finish = resolve; }) : normal(sql, ...args));
    const pending = route(); await vi.advanceTimersByTimeAsync(751); expect((await pending).status).toBe(503);
    finish({ rows: [{ result: allowed }] }); await vi.advanceTimersByTimeAsync(1); expectNoWrite(); expect(limiterCalls()).toHaveLength(1);
  });
  it('limiter auth timeout starts no late reservation', async () => {
    vi.useFakeTimers();
    const initialSessions = policy === 'asset_write' ? 2 : 1;
    for (let i = 0; i < initialSessions; i++) m.session.mockResolvedValueOnce({ user: { id: owner, emailVerified: true } });
    m.session.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ user: { id: owner, emailVerified: true } }), 1000)));
    const pending = route(); await vi.advanceTimersByTimeAsync(751); expect((await pending).status).toBe(503);
    await vi.advanceTimersByTimeAsync(500); expect(limiterCalls()).toHaveLength(0); expectNoWrite();
  });
  it.each<Record<string, string>>([{ origin: '' }, { origin: 'https://attacker.example.invalid' }, { 'sec-fetch-site': 'cross-site' }])('retains Origin/CSRF denial %j before limiter/write', async headers => {
    expect((await route(headers)).status).toBe(403); expect(m.connect).not.toHaveBeenCalled(); expectNoWrite();
  });
  it('retains account write-lock denial', async () => {
    const normal = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
      if (/app\.(assert_account_write_allowed|xp_|save_theme|delete_theme)/.test(sql)) throw new Error('account_write_locked');
      return normal(sql, ...args);
    });
    const response = await route(); expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({ code: 'account_write_locked' }); expect(m.asset).not.toHaveBeenCalled();
    expect(m.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('keeps trusted ingress subjects alongside the user quota', async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('TRUSTED_INGRESS_MODE', 'local-test'); vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', '192.0.2.1');
    expect((await route()).status).toBe(200); expect(envelope().identity_class).toBe('user'); expect(envelope().ingress.length).toBeGreaterThan(0);
  });
});

describe.each(['asset_write', 'xp_sync', 'settings_write'] as const)('%s limiter boundary', policy => {
  it('denies DB connection failure', async () => {
    m.connect.mockRejectedValue(new Error('PRIVATE_CONNECTION_CANARY'));
    expect(await consumeRateLimit(request('GET'), policy)).toMatchObject({ allowed: false, source: 'unavailable' });
    expect(limiterCalls()).toHaveLength(0); expectNoWrite();
  });
  it('denies missing signing configuration before SQL', async () => {
    vi.stubEnv('RATE_LIMIT_RPC_SIGNING_KEY', '');
    expect(await consumeRateLimit(request('GET'), policy)).toMatchObject({ allowed: false, source: 'unavailable' });
    expect(m.connect).not.toHaveBeenCalled();
  });
  it('preserves anonymous trusted-IP identity and ingress subjects', async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('TRUSTED_INGRESS_MODE', 'local-test'); vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', '192.0.2.1');
    m.session.mockResolvedValue(null);
    expect(await consumeRateLimit(request('GET'), policy)).toMatchObject({ allowed: true, source: 'distributed' });
    expect(envelope().identity_class).toBe('ip'); expect(envelope().ingress.length).toBeGreaterThan(0);
  });
});

it('preserves SQL per-user quotas, signed contract and global all-or-none reservation', () => {
  const sql = readFileSync('database/native/006_distributed_limiter.sql', 'utf8');
  for (const policy of ['asset_write', 'xp_sync', 'settings_write'] as const) {
    expect(sql).toContain(`('${policy}','${policy}',${RATE_LIMIT_POLICIES[policy].limit},null,0,true)`);
  }
  expect(sql).toContain("(e->>'identity_class'='ip' and jsonb_array_length(e->'ingress')=0)");
  expect(sql).toContain("('dynamic',20,20,10)"); expect(sql).toContain('g.daily_count>=5000');
  expect(sql.indexOf('if v_wait>0 then')).toBeLessThan(sql.indexOf('-- Debit only after EVERY budget passed'));
  expect(sql).toContain("private_rate_limit.verify_v1(p_envelope,p_signature_hex,'consume')");
});
