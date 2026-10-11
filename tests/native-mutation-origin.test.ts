import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mock = vi.hoisted(() => ({ handler: vi.fn() }));
vi.mock('@/lib/auth/native', () => ({ getNativeAuth: () => ({ handler: mock.handler }) }));
import { POST } from '@/app/api/auth/[...all]/route';
import { readStrictJsonObject, validateAuthenticatedMutationRequest } from '@/lib/api/request-security';
import { nativeRoles } from '@/lib/backend/native-roles.mjs';
import { nativeAuthOptions } from '@/lib/auth/native-options';

const origin = 'https://app.example.invalid';
const internal = 'http://127.0.0.1:3000';
function configure(profile = 'hosting-production') {
  const roles = nativeRoles(profile);
  const env = {
    NODE_ENV: 'production', BACKEND_PROVIDER: 'native', NATIVE_ROLE_PROFILE: profile,
    NATIVE_HOSTING_CAPABILITY: 'shared-managed',
    DATABASE_URL: `postgresql://${roles.runtime}:synthetic@127.0.0.1:5433/${roles.database}`,
    DATABASE_SSL_MODE: 'verify-full', DATABASE_SSL_CA_FILE: resolve('.codex/synthetic-ca.crt'),
    BETTER_AUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin, BETTER_AUTH_SECRET: 's'.repeat(40),
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return env;
}
function request(path = 'get-session', headers: Record<string, string> = { Origin: origin }, body?: string, target = internal) {
  return new Request(`${target}/api/auth/${path}`, {
    method: 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body,
  });
}
beforeEach(() => {
  vi.clearAllMocks(); configure();
  mock.handler.mockResolvedValue(Response.json(null));
});
afterEach(() => vi.unstubAllEnvs());

describe('native hosted production canonical mutation origin', () => {
  it.each(['hosting-production', 'hosting-test'])('accepts the canonical origin behind HTTP proxy in %s', async profile => {
    configure(profile);
    const metadataCases: Record<string, string>[] = [{}, { 'Sec-Fetch-Site': 'same-origin' }];
    for (const metadata of metadataCases) {
      expect(validateAuthenticatedMutationRequest(request('get-session', { Origin: origin, ...metadata }))).toBeNull();
    }
    const response = await POST(request('get-session', { Origin: origin, 'Sec-Fetch-Site': 'same-origin' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(mock.handler).toHaveBeenCalledOnce();
  });
  it.each(['get-session', 'sign-out', 'sign-in/email'])('passes both origin guards for JSON %s', async path => {
    const body = path === 'sign-in/email' ? { email: 'synthetic@example.invalid', password: 'synthetic' } : {};
    expect((await POST(request(path, { Origin: origin, 'Sec-Fetch-Site': 'same-origin' }, JSON.stringify(body)))).status).toBe(200);
    expect(mock.handler).toHaveBeenCalledOnce();
    const forwarded = mock.handler.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe(`${internal}/api/auth/${path}`);
    expect(forwarded.headers.get('origin')).toBe(origin);
    expect(await forwarded.json()).toEqual(body);
  });
  const hostileHeaders: Record<string, string>[] = [
    {}, { Origin: 'null' }, { Origin: 'not-a-url' }, { Origin: internal },
    { Origin: 'https://attacker.invalid' }, { Origin: 'http://app.example.invalid' },
    { Origin: `${origin}:444` }, { Origin: `${origin}/` }, { Origin: `${origin}/path` },
    { Origin: `${origin}?query=1` }, { Origin: `${origin}#fragment` },
    { Origin: 'https://user:password@app.example.invalid' },
    { Origin: 'https://app.example.invalid\\attacker' },
    { Origin: `${origin} https://attacker.invalid` },
    ...['cross-site', 'same-site', 'none', '', 'unexpected'].map(site => ({ Origin: origin, 'Sec-Fetch-Site': site })),
  ];
  it.each(hostileHeaders)('rejects hostile headers %j before body consumption or auth', async headers => {
    const req = request('sign-in/email', headers, '{}');
    const response = await POST(req);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'invalid_origin' });
    expect(req.bodyUsed).toBe(false);
    expect(mock.handler).not.toHaveBeenCalled();
  });
  it('ignores forged Host and forwarded host/protocol for both allowed and denied origins', async () => {
    for (const source of [origin, 'https://attacker.invalid']) {
      const req = request('get-session', {
        Origin: source, Host: 'attacker.invalid', 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'https',
      }, '{}', 'https://attacker.invalid');
      expect((await POST(req)).status).toBe(source === origin ? 200 : 403);
    }
    expect(mock.handler).toHaveBeenCalledOnce();
  });
  it.each([
    ['BETTER_AUTH_URL', ''], ['BETTER_AUTH_URL', 'http://app.example.invalid'],
    ['BETTER_AUTH_URL', `${origin}/path`], ['BETTER_AUTH_URL', 'https://user@app.example.invalid'],
    ['NEXT_PUBLIC_APP_URL', ''], ['NEXT_PUBLIC_APP_URL', 'https://other.invalid'],
    ['BETTER_AUTH_SECRET', 'short'], ['DATABASE_SSL_MODE', 'disable'], ['NATIVE_ROLE_PROFILE', 'invalid'],
  ])('fails closed on invalid server configuration %s', async (key, value) => {
    vi.stubEnv(key, value);
    // Even a matching internal URL cannot become a fallback trust source.
    expect((await POST(request('get-session', { Origin: internal }))).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(mock.handler).not.toHaveBeenCalled();
  });
  it('keeps JSON payload bounds and allowed fields after canonical origin admission', async () => {
    for (const [body, status] of [['{"extra":true}', 400], [JSON.stringify({ value: 'x'.repeat(100) }), 413]] as const) {
      const result = await readStrictJsonObject(request('get-session', { Origin: origin }, body), new Set(['value']), 64);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(status);
    }
  });
  it('keeps Better Auth canonical trusted origins and signup/CSRF policy', () => {
    const options = nativeAuthOptions(configure());
    expect(options.baseURL).toBe(origin);
    expect(options.trustedOrigins).toEqual([origin]);
    expect(options.emailAndPassword.disableSignUp).toBe(true);
    expect(options.advanced).not.toHaveProperty('disableOriginCheck');
    expect(options.advanced).not.toHaveProperty('disableCSRFCheck');
    expect(options.advanced).not.toHaveProperty('trustedProxyHeaders');
  });
  it('keeps signup inaccessible behind the proxy', async () => {
    expect((await POST(request('sign-up/email', { Origin: origin }, '{}'))).status).toBe(404);
    expect(mock.handler).not.toHaveBeenCalled();
  });
  it.each([
    ['NODE_ENV', 'development'], ['NODE_ENV', 'test'], ['BACKEND_PROVIDER', 'supabase'],
  ])('preserves request URL origin outside native production: %s=%s', (key, value) => {
    vi.stubEnv(key, value);
    expect(validateAuthenticatedMutationRequest(request())).toHaveProperty('status', 403);
    expect(validateAuthenticatedMutationRequest(request('get-session', { Origin: internal }))).toBeNull();
  });
  it('preserves request URL origin for native local production', () => {
    vi.stubEnv('NATIVE_ROLE_PROFILE', 'local'); vi.stubEnv('NATIVE_HOSTING_CAPABILITY', 'dedicated');
    vi.stubEnv('DATABASE_URL', 'postgresql://mt_runtime:synthetic@127.0.0.1:5433/local_test');
    expect(validateAuthenticatedMutationRequest(request())).toHaveProperty('status', 403);
    expect(validateAuthenticatedMutationRequest(request('get-session', { Origin: internal }))).toBeNull();
  });
});
