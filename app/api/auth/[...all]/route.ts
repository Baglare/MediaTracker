import { getBackendProvider } from '@/lib/backend/provider';
import { getNativeAuth } from '@/lib/auth/native';
import { apiError, readStrictJsonObject, validateAuthenticatedMutationRequest } from '@/lib/api/request-security';
import { runSafeApiRoute } from '@/lib/api/safe-route';
import { nativeSignupEnabled } from '@/lib/auth/signup-policy';
import { nativeSmtpConfig } from '@/lib/auth/smtp-config';

export const runtime = 'nodejs';
const emailRequests = ['/api/auth/request-password-reset', '/api/auth/send-verification-email'];
async function handle(request: Request) {
  try {
    if (getBackendProvider() !== 'native') return apiError('not_found', 404);
    const url = new URL(request.url);
    const path = url.pathname;
    const signup = path === '/api/auth/sign-up/email' && nativeSignupEnabled(process.env);
    const emailRequest = emailRequests.includes(path);
    const verify = path === '/api/auth/verify-email';
    const reset = path === '/api/auth/reset-password';
    const sessionOperation = ['/api/auth/sign-out', '/api/auth/get-session'].includes(path);
    if (!(request.method === 'GET' && path === '/api/auth/get-session')
      && !(request.method === 'POST' && (signup || emailRequest || verify || reset || sessionOperation || path === '/api/auth/sign-in/email'))) {
      return apiError('not_found', 404);
    }
    // No alternate query token, callback URL, redirect or client identity channel.
    if ([...url.searchParams].length) return apiError('invalid_body', 400);
    let bounded = request;
    if (request.method === 'POST') {
      const denied = validateAuthenticatedMutationRequest(request);
      if (denied) return denied;
      const bodylessSessionOperation = request.body === null && sessionOperation;
      const fields = signup ? ['email', 'password', 'name'] : emailRequest ? ['email'] : verify ? ['token']
        : reset ? ['token', 'newPassword'] : path.endsWith('/sign-in/email') ? ['email', 'password', 'rememberMe'] : [];
      const parsed = bodylessSessionOperation ? { ok: true as const, value: {} as Record<string, unknown> }
        : await readStrictJsonObject(request, new Set(fields), 8192);
      if (!parsed.ok) return parsed.response;
      const body = parsed.value;
      if (signup && (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 100
        || typeof body.email !== 'string' || body.email.length > 254
        || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128)) return apiError('invalid_body', 400);
      if (emailRequest && (typeof body.email !== 'string' || body.email.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) return apiError('invalid_body', 400);
      if ((verify || reset) && (typeof body.token !== 'string' || body.token.length < 20 || body.token.length > 2048
        || !/^[A-Za-z0-9_.-]+$/.test(body.token))) return apiError('invalid_body', 400);
      if (reset && (typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128)) return apiError('invalid_body', 400);
      // Check globally before lookup: a missing/invalid SMTP setup affects every address equally.
      if (signup || emailRequest) nativeSmtpConfig(process.env);
      const headers = new Headers(request.headers);
      // Resends remain generic even when a different account is already signed in.
      if (emailRequest) headers.delete('cookie');
      if (verify) {
        url.searchParams.set('token', body.token as string);
        headers.delete('content-type'); headers.delete('content-length');
        bounded = new Request(url, { method: 'GET', headers });
      } else bounded = new Request(request.url, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    const response = await getNativeAuth().handler(bounded);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    if (response.status >= 500) return apiError('auth_unavailable', 503);
    if (response.status >= 400) return apiError(response.status === 429 ? 'rate_limited' : 'auth_rejected', response.status,
      response.status === 429 ? { 'Retry-After': response.headers.get('Retry-After') ?? response.headers.get('X-Retry-After') ?? '60' } : undefined);
    if (emailRequest || signup || verify || reset) return Response.json({ status: true }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    if (path === '/api/auth/get-session') {
      const session = await response.clone().json();
      if (session?.user && session.user.emailVerified !== true) return Response.json(null, { headers: { 'Cache-Control': 'no-store' } });
    }
    return response;
  } catch { return apiError('auth_unavailable', 503); }
}
export function GET(request: Request) { return runSafeApiRoute('/api/auth/[...all]', 'GET', () => handle(request)); }
export function POST(request: Request) { return runSafeApiRoute('/api/auth/[...all]', 'POST', () => handle(request)); }
