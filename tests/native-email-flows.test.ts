import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createHmac, randomBytes } from 'node:crypto';
import { nativeSmtpConfig } from '@/lib/auth/smtp-config';
vi.mock('server-only', () => ({}));
const mock = vi.hoisted(() => ({ store: {} as Record<string, Record<string, unknown>[]>, replays: new Set<string>(), tasks: [] as (() => Promise<void>)[], send: vi.fn() }));
vi.mock('@/lib/backend/postgres', () => ({ getNativePool: () => Object.assign(memoryAdapter(mock.store), { query: async (_sql: string, args: string[]) => {
  const p = JSON.parse(args[0]); const user = mock.store.user.find(u => u.id === p[1] && u.email === p[2]);
  if (!user || user.emailVerified || mock.replays.has(p[7])) throw new Error('rejected');
  mock.replays.add(p[7]); user.emailVerified = true; return { rows: [] };
} }) }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: mock.send }) } }));
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: (task: () => Promise<void>) => mock.tasks.push(task) }));
const smtp = { NATIVE_SMTP_HOST: 'smtp.example.invalid', NATIVE_SMTP_PORT: '465', NATIVE_SMTP_SECURITY: 'tls', NATIVE_SMTP_USER: 'synthetic', NATIVE_SMTP_PASSWORD: 'synthetic-only', NATIVE_SMTP_FROM: 'auth@example.invalid' };
const origin = 'https://app.example.invalid', email = 'synthetic@example.invalid', password = 'Synthetic-password-only';
beforeEach(() => {
  vi.resetModules(); mock.replays = new Set(); mock.store = { user: [], account: [], session: [], verification: [], rateLimit: [] }; mock.tasks = [];
  mock.send.mockReset().mockResolvedValue({ accepted: [email], rejected: [] });
  for (const [key, value] of Object.entries({ ...smtp, NATIVE_EMAIL_VERIFICATION_KEY: randomBytes(32).toString('hex'), NATIVE_EMAIL_VERIFICATION_EPOCH: '1', BACKEND_PROVIDER: 'native', DATABASE_URL: 'postgresql://mt_runtime:synthetic@localhost/mt_test', DATABASE_SSL_MODE: 'disable', BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED: 'true' })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function runtime() {
  const { POST, GET } = await import('@/app/api/auth/[...all]/route');
  const call = (path: string, body: unknown, cookie = '', requestOrigin: string | null = origin) => POST(new Request(`${origin}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': `198.51.100.${Math.floor(Math.random()*200)+1}`, 'X-Real-IP': '203.0.113.1', ...(requestOrigin ? { Origin: requestOrigin } : {}) }, body: JSON.stringify(body) }));
  return { call, GET };
}
async function drain() { const tasks = mock.tasks.splice(0); await Promise.all(tasks.map(task => task())); }
function tokenFromMail(index = 0) { return new URLSearchParams(new URL(mock.send.mock.calls[index][0].text.split('\n')[1]).hash.slice(1)).get('token')!; }
it('validates exact encrypted SMTP pairs, complete secrets and injection/certificate restrictions', () => {
  expect(nativeSmtpConfig(smtp)).toMatchObject({ port: 465, secure: true, tls: { rejectUnauthorized: true } });
  expect(nativeSmtpConfig({ ...smtp, NATIVE_SMTP_PORT: '587', NATIVE_SMTP_SECURITY: 'starttls' })).toMatchObject({ requireTLS: true, secure: false });
  for (const patch of [{ NATIVE_SMTP_HOST: 'smtp://evil.invalid' }, { NATIVE_SMTP_PORT: '25' }, { NATIVE_SMTP_PORT: '587' }, { NATIVE_SMTP_SECURITY: 'false' }, { NATIVE_SMTP_PASSWORD: '' }, { NATIVE_SMTP_FROM: 'x@example.invalid\r\nBcc:evil@example.invalid' }]) expect(() => nativeSmtpConfig({ ...smtp, ...patch })).toThrow(/^native_smtp_configuration_invalid$/);
});
it('requires verification, consumes tokens once across racing requests and never auto-signs in', async () => {
  const { call } = await runtime();
  expect((await call('sign-up/email', { email, password, name: 'Synthetic' })).status).toBe(200);
  expect(mock.store.session).toHaveLength(0);
  expect((await call('sign-in/email', { email, password })).status).toBe(403);
  expect(mock.store.session).toHaveLength(0);
  await drain(); const token = tokenFromMail();
  const statuses = await Promise.all([call('verify-email', { token }), call('verify-email', { token })]);
  expect(statuses.map(r => r.status).sort()).toEqual([200, 400]);
  expect(mock.store.user[0].emailVerified).toBe(true); expect(mock.store.session).toHaveLength(0);
  expect((await call('sign-in/email', { email, password })).status).toBe(200);
});
it('rejects tampered/expired verification; expired and replayed reset; revokes all sessions on success', async () => {
  const { call } = await runtime();
  await call('sign-up/email', { email, password, name: 'Synthetic' }); await drain();
  const verificationToken = tokenFromMail();
  expect((await call('verify-email', { token: verificationToken + 'tampered' })).status).toBe(400);
  const [header, payload] = verificationToken.split('.');
  const expired = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), iat: 1, exp: 2 })).toString('base64url');
  const expiredToken = header + '.' + expired + '.' + createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(header + '.' + expired).digest('base64url');
  expect((await call('verify-email', { token: expiredToken })).status).toBe(400);
  await call('send-verification-email', { email }); await drain();
  const freshToken = tokenFromMail(1);
  expect((await call('verify-email', { token: freshToken })).status).toBe(200);
  const login = await call('sign-in/email', { email, password });
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  expect(mock.store.session).toHaveLength(1);
  await call('request-password-reset', { email }); await drain();
  const resetToken = tokenFromMail(2);
  mock.store.verification.forEach(v => { v.expiresAt = new Date(Date.now() - 1000); });
  expect((await call('reset-password', { token: resetToken, newPassword: 'Replacement-password' })).status).toBe(400);
  await call('request-password-reset', { email }); await drain(); const freshReset = tokenFromMail(3);
  expect((await call('reset-password', { token: freshReset, newPassword: 'short' })).status).toBe(400);
  const completed = await Promise.all([call('reset-password', { token: freshReset, newPassword: 'Replacement-password' }), call('reset-password', { token: freshReset, newPassword: 'Replacement-password' })]);
  expect(completed.map(r => r.status).sort()).toEqual([200, 400]); expect(mock.store.session).toHaveLength(0);
  expect(await (await call('get-session', {}, cookie)).json()).toBeNull();
  expect((await call('sign-in/email', { email, password })).status).toBe(401);
  expect((await call('sign-in/email', { email, password: 'Replacement-password' })).status).toBe(200);
});
it('generic request responses and shared forged-IP-resistant quotas include SMTP delivery failure', async () => {
  const { call } = await runtime();
  await call('sign-up/email', { email, password, name: 'Synthetic' }); await drain();
  const existing = await call('request-password-reset', { email });
  const absent = await call('request-password-reset', { email: 'absent@example.invalid' });
  expect(existing.status).toBe(absent.status); expect(await existing.json()).toEqual(await absent.json());
  const logs = vi.spyOn(console, 'warn').mockImplementation(() => {});
  mock.send.mockRejectedValue(new Error('private SMTP password and address'));
  await drain(); expect(logs).toHaveBeenCalledTimes(1);
  expect(JSON.parse(logs.mock.calls[0][0])).toEqual({ event: 'native_auth_mail_delivery_failed', errorCode: 'operation_failed', timestamp: expect.any(String) });
  for (const privateValue of [email, tokenFromMail(0), smtp.NATIVE_SMTP_PASSWORD, 'private SMTP password and address']) expect(logs.mock.calls[0][0]).not.toContain(privateValue);
  expect(mock.store.session).toHaveLength(0);
  for (let i = 0; i < 3; i++) expect((await call('request-password-reset', { email: `absent-${i}@example.invalid` })).status).toBe(200);
  const quota = await call('request-password-reset', { email }); expect(quota.status).toBe(429); expect(Number(quota.headers.get('Retry-After'))).toBeGreaterThan(3500);
  // All verification rows are removable by the existing Auth-last privacy cleanup.
  expect(mock.store.verification.every(row => row.value === mock.store.user[0].id)).toBe(true);
});
it('rejects origin, redirect, query/body identity and malformed tokens before mail work; SMTP absence fails closed', async () => {
  const { call, GET } = await runtime();
  for (const path of ['request-password-reset', 'send-verification-email', 'reset-password', 'verify-email']) {
    for (const source of [null, 'https://attacker.invalid']) expect((await call(path, { email }, '', source)).status).toBe(403);
  }
  for (const body of [{ email, redirectTo: 'https://attacker.invalid' }, { email, callbackURL: '/' }, { email, id: 'admin' }]) expect((await call('request-password-reset', body)).status).toBe(400);
  expect((await call('reset-password?token=' + 'a'.repeat(24), { token: 'a'.repeat(24), newPassword: password })).status).toBe(400);
  expect((await GET(new Request(`${origin}/api/auth/verify-email?token=${'a'.repeat(24)}`))).status).toBe(404);
  vi.stubEnv('NATIVE_SMTP_PASSWORD', '');
  for (const address of [email, 'absent@example.invalid']) expect((await call('request-password-reset', { email: address })).status).toBe(503);
  expect((await call('sign-up/email', { email, password, name: 'Synthetic' })).status).toBe(503);
  expect(mock.store.user).toHaveLength(0); expect(mock.tasks).toHaveLength(0); expect(mock.send).not.toHaveBeenCalled();
});
