import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), limiter: vi.fn(), supabase: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: mocks.user }));
vi.mock('@/lib/backend/limiter', () => ({ nativeSignedLimiter: mocks.limiter }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: mocks.supabase }));
vi.mock('@/lib/supabase/status', () => ({ getSupabaseEnv: () => ({ url: 'https://offline.invalid', anonKey: 'synthetic' }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc }) }));

import { resolveTrustedIngress } from '@/lib/api/rate-limit-identity';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/distributed-rate-limit';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function request(headers: HeadersInit = {}) {
  return new Request('https://app.example.invalid', { headers });
}
function envelope(index = 0) {
  return JSON.parse(mocks.limiter.mock.calls[index][1].p_envelope);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BACKEND_PROVIDER', 'native');
  vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER', 'native');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('TRUSTED_INGRESS_MODE', 'local-test');
  vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', '192.0.2.10');
  vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_KEY', 'offline-identity-key-not-a-secret-0001');
  vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY', '');
  vi.stubEnv('RATE_LIMIT_RPC_SIGNING_KEY', 'offline-signing-key-not-a-secret-0002');
  vi.stubEnv('RATE_LIMIT_RPC_KEY_VERSION', 'offline-v1');
  vi.stubEnv('RATE_LIMIT_RPC_AUDIENCE', 'mt:offline');
  mocks.user.mockResolvedValue({ id: owner });
  mocks.limiter.mockResolvedValue({ allowed: true, reason: 'allowed', retry_after_seconds: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('P4 ingress source contract (no hosting proof)', () => {
  const forged = request({ 'x-forwarded-for': '198.51.100.77', 'x-real-ip': '203.0.113.88',
    'trusted-ingress-mode': 'passenger', 'x-user-id': owner });
  it.each([undefined, '', 'unconfigured', 'unknown', ' passenger '])('does not infer native trust from mode %s or VERCEL', mode => {
    expect(resolveTrustedIngress(forged, { BACKEND_PROVIDER: 'native', VERCEL: '1', TRUSTED_INGRESS_MODE: mode }).ip).toBeNull();
  });
  // Syntax fixtures only: these values are never deployment evidence or runtime configuration.
  const tuple = { BACKEND_PROVIDER: 'native', TRUSTED_INGRESS_MODE: 'passenger', TRUSTED_INGRESS_HEADER: 'x-real-ip',
    TRUSTED_INGRESS_PROOF_SHA256: 'a'.repeat(64), TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED: '1' };
  it.each([
    { TRUSTED_INGRESS_HEADER: undefined }, { TRUSTED_INGRESS_HEADER: 'X-Real-IP' },
    { TRUSTED_INGRESS_HEADER: 'forwarded' }, { TRUSTED_INGRESS_PROOF_SHA256: undefined },
    { TRUSTED_INGRESS_PROOF_SHA256: 'A'.repeat(64) }, { TRUSTED_INGRESS_PROOF_SHA256: 'a'.repeat(63) },
    { TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED: undefined }, { TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED: 'true' },
  ])('denies incomplete/invalid Passenger tuple %#', patch => {
    expect(resolveTrustedIngress(forged, { ...tuple, ...patch }).status).toBe('unavailable');
  });
  it.each(['198.51.100.1, 203.0.113.1', '198.51.100.1:443', '01.2.3.4', '2001:::1', '[::1]', 'fe80::1%eth0', 'unknown'])('denies invalid configured header %s without falling back to XFF', ip => {
    expect(resolveTrustedIngress(request({ 'x-real-ip': ip, 'x-forwarded-for': '192.0.2.1' }), tuple).ip).toBeNull();
  });
  it('denies missing or duplicated configured header', () => {
    expect(resolveTrustedIngress(request({ 'x-forwarded-for': '192.0.2.1' }), tuple).ip).toBeNull();
    const headers = new Headers(); headers.append('x-real-ip', '192.0.2.1'); headers.append('x-real-ip', '192.0.2.2');
    expect(resolveTrustedIngress(request(headers), tuple).ip).toBeNull();
  });
  it('never uses local-test identity in production', () => {
    expect(resolveTrustedIngress(forged, { NODE_ENV: 'production', TRUSTED_INGRESS_MODE: 'local-test', RATE_LIMIT_LOCAL_TEST_IP: '192.0.2.1' }).ip).toBeNull();
  });
});

describe('native admission with offline local-test identity', () => {
  it.each([null, { id: owner }])('unconfigured ingress denies before auth or either backend, user=%s', async user => {
    vi.stubEnv('TRUSTED_INGRESS_MODE', 'unconfigured'); mocks.user.mockResolvedValue(user);
    expect(await consumeRateLimit(request({ 'x-real-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.2' }), 'social_write')).toMatchObject({ allowed: false, source: 'unavailable' });
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('keeps user scope across IP changes and ingress across user/anonymous changes', async () => {
    await consumeRateLimit(request({ 'x-user-id': 'forged' }), 'tvmaze_search');
    vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', '192.0.2.11');
    await consumeRateLimit(request(), 'openlibrary_search');
    expect(envelope(0).subjects).toEqual(envelope(1).subjects);
    expect(envelope(0).ingress).not.toEqual(envelope(1).ingress);
    mocks.user.mockResolvedValue({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    await consumeRateLimit(request(), 'tvmaze_search');
    mocks.user.mockResolvedValue(null); await consumeRateLimit(request(), 'tvmaze_search');
    expect(envelope(1).ingress).toEqual(envelope(2).ingress); expect(envelope(2).ingress).toEqual(envelope(3).ingress);
    expect(envelope(1).subjects).not.toEqual(envelope(2).subjects); expect(envelope(2).subjects).not.toEqual(envelope(3).subjects);
    expect(envelope(3).identity_class).toBe('ip');
  });
  it.each([['192.0.2.10', '::ffff:c000:20a'], ['2001:db8:1:2::1', '2001:0DB8:0001:0002:ffff::2']])('canonical equivalents %s and %s preserve both quotas', async (a, b) => {
    mocks.user.mockResolvedValue(null); vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', a);
    await consumeRateLimit(request(), 'tvmaze_search'); vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP', b);
    await consumeRateLimit(request(), 'tvmaze_search');
    expect(envelope(0).subjects).toEqual(envelope(1).subjects); expect(envelope(0).ingress).toEqual(envelope(1).ingress);
  });
  it.each(['tvmaze_search', 'interpret', 'recommend'] as const)('DB failure never uses native memory smoothing for %s', async policy => {
    mocks.limiter.mockRejectedValue(new Error('PRIVATE_SQL_CANARY'));
    const response = rateLimitResponse(await consumeRateLimit(request(), policy))!;
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'rate_limit_unavailable' });
    expect(mocks.limiter).toHaveBeenCalledTimes(1); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, { allowed: true, reason: 'limited', retry_after_seconds: 1 },
    { allowed: false, reason: 'capacity', retry_after_seconds: 5 }, { allowed: false, reason: 'replay', retry_after_seconds: 5 },
    { allowed: false, reason: 'limited', retry_after_seconds: 0 }, { allowed: true, reason: 'allowed', retry_after_seconds: 86401 }])('rejects inconsistent native decision %#', async data => {
    mocks.limiter.mockResolvedValue(data);
    expect(await consumeRateLimit(request(), 'social_write')).toMatchObject({ allowed: false, source: 'unavailable' });
  });
  it('returns native exhaustion as 429 with a bounded Retry-After', async () => {
    mocks.limiter.mockResolvedValue({ allowed: false, reason: 'limited', retry_after_seconds: 12 });
    const response = rateLimitResponse(await consumeRateLimit(request(), 'social_write'))!;
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('12');
  });
  it('native timeout denies without retry even when reservation finishes late', async () => {
    vi.useFakeTimers(); let finish!: (value: unknown) => void;
    mocks.limiter.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = consumeRateLimit(request(), 'social_write'); await vi.advanceTimersByTimeAsync(751);
    expect(await pending).toMatchObject({ allowed: false, source: 'unavailable' });
    finish({ allowed: true, reason: 'allowed', retry_after_seconds: 0 }); await vi.advanceTimersByTimeAsync(1);
    expect(mocks.limiter).toHaveBeenCalledTimes(1);
  });
});
