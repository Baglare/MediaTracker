import { getBackendProvider } from '@/lib/backend/provider';
import { getNativeAuth } from '@/lib/auth/native';
import { apiError, readStrictJsonObject, validateAuthenticatedMutationRequest } from '@/lib/api/request-security';
import { runSafeApiRoute } from '@/lib/api/safe-route';
import { nativeSignupEnabled } from '@/lib/auth/signup-policy';

export const runtime = 'nodejs';

async function handle(request: Request) {
  try {
    if (getBackendProvider() !== 'native') return apiError('not_found', 404);
    // Signup is a separate release admission; metadata/plugin endpoints stay closed.
    const path = new URL(request.url).pathname;
    const signup = path === '/api/auth/sign-up/email' && nativeSignupEnabled(process.env);
    if (!(request.method === 'GET' && path === '/api/auth/get-session')
      && !(request.method === 'POST' && (signup || ['/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/get-session'].includes(path)))) {
      return apiError('not_found', 404);
    }
    let bounded = request;
    if (request.method === 'POST') {
      const denied = validateAuthenticatedMutationRequest(request);
      if (denied) return denied;
      const bodylessSessionOperation = request.body === null && !signup && !path.endsWith('/sign-in/email');
      if (!bodylessSessionOperation && !request.headers.get('content-type')?.startsWith('application/json')) return apiError('invalid_content_type', 415);
      const parsed = bodylessSessionOperation ? { ok: true as const, value: {} }
        : await readStrictJsonObject(request,
          new Set(signup ? ['email', 'password', 'name'] : path.endsWith('/sign-in/email') ? ['email', 'password', 'rememberMe'] : []), 8192);
      if (!parsed.ok) return parsed.response;
      if (signup && (typeof parsed.value.name !== 'string' || parsed.value.name.trim().length < 1 || parsed.value.name.length > 100
        || typeof parsed.value.email !== 'string' || parsed.value.email.length > 254
        || typeof parsed.value.password !== 'string' || parsed.value.password.length < 8 || parsed.value.password.length > 128)) return apiError('invalid_body', 400);
      bounded = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(parsed.value) });
    }
    const response = await getNativeAuth().handler(bounded);
    response.headers.set('Cache-Control', 'no-store');
    // Never forward adapter/SQL diagnostics to clients.
    if (response.status >= 500) return apiError('auth_unavailable', 503);
    if (response.status >= 400) return apiError(response.status === 429 ? 'rate_limited' : 'auth_rejected', response.status,
      response.status === 429 ? { 'Retry-After': response.headers.get('Retry-After') ?? '60' } : undefined);
    return response;
  } catch { return apiError('auth_unavailable', 503); }
}
export function GET(request: Request) { return runSafeApiRoute("/api/auth/[...all]", "GET", () => handle(request)); }
export function POST(request: Request) { return runSafeApiRoute("/api/auth/[...all]", "POST", () => handle(request)); }
