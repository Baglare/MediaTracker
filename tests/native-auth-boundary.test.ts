import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mock = vi.hoisted(() => ({ handler: vi.fn(), session: vi.fn(), supabase: vi.fn() }));
vi.mock('@/lib/auth/native', () => ({ getNativeAuth: () => ({ handler: mock.handler, api: { getSession: mock.session } }) }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: mock.supabase }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'synthetic-cookie' }) }));
import { GET, POST } from '@/app/api/auth/[...all]/route';
import { getCurrentUser } from '@/lib/auth/current-user';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('BACKEND_PROVIDER','native'); mock.handler.mockResolvedValue(Response.json({ ok: true })); });
afterEach(() => vi.unstubAllEnvs());
function request(path: string, body: unknown={}, origin: string | null='https://app.example.invalid') {
  return new Request(`https://app.example.invalid/api/auth/${path}`, { method:'POST',
    headers:{ 'Content-Type':'application/json', ...(origin ? { Origin:origin } : {}) }, body:JSON.stringify(body) });
}
it('denies signup, metadata edits and unknown routes before auth/database work', async () => {
  for(const path of ['sign-up/email','update-user','admin/create-user','sign-in/email/extra']) expect((await POST(request(path))).status).toBe(404);
  expect(mock.handler).not.toHaveBeenCalled();
});
it('requires explicit canonical same-origin and rejects privilege/identity/body fields', async () => {
  for(const origin of [null,'null','https://attacker.invalid','https://app.example.invalid/path']) expect((await POST(request('sign-in/email',{},origin))).status).toBe(403);
  for(const body of [{ email:'x',password:'x',id },{ email:'x',password:'x',role:'admin' },{ user_metadata:{ is_admin:true } }]) expect((await POST(request('sign-in/email',body))).status).toBe(400);
  expect(mock.handler).not.toHaveBeenCalled();
});
it('bounds payload and allows only admitted auth operations', async () => {
  expect((await POST(request('sign-in/email',{email:'x',password:'x'.repeat(9000)}))).status).toBe(413);
  expect(mock.handler).not.toHaveBeenCalled();
  expect((await POST(request('sign-in/email',{email:'synthetic@example.invalid',password:'synthetic'}))).status).toBe(200);
  expect(mock.handler).toHaveBeenCalledTimes(1);
});
it('redacts adapter errors and preserves no-store and successful Set-Cookie', async () => {
  mock.handler.mockResolvedValue(new Response('SELECT password secret', { status:500 }));
  const response=await POST(request('sign-out'));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret');
  mock.handler.mockResolvedValue(new Response('{}',{headers:{'Set-Cookie':'synthetic=1; HttpOnly'}}));
  const success=await GET(new Request('https://app.example.invalid/api/auth/get-session'));
  expect(success.headers.get('Set-Cookie')).toContain('HttpOnly'); expect(success.headers.get('Cache-Control')).toBe('no-store');
});
it('Supabase mode does not expose Better Auth', async () => {
  vi.stubEnv('BACKEND_PROVIDER','supabase');
  expect((await POST(request('sign-in/email'))).status).toBe(404);
  expect(mock.handler).not.toHaveBeenCalled();
});
it('current user verifies native server session and strips provider privileges', async () => {
  mock.session.mockResolvedValue({user:{id,email:'synthetic@example.invalid',role:'admin'},session:{token:'secret'}});
  expect(await getCurrentUser()).toEqual({id,email:'synthetic@example.invalid'});
  expect(mock.session).toHaveBeenCalledWith({headers:expect.any(Headers),query:{disableRefresh:true}});
  expect(mock.supabase).not.toHaveBeenCalled();
  mock.session.mockResolvedValue(null);expect(await getCurrentUser()).toBe(null);
  mock.session.mockRejectedValue(new Error('SQL personal credentials'));
  await expect(getCurrentUser()).rejects.toThrow(/^auth_verification_failed$/);
});
it('origin-protects bodyless session refresh and signout; GET remains read-only',async()=>{
  for(const path of ['get-session','sign-out']) {
    expect((await POST(new Request(`https://app.example.invalid/api/auth/${path}`,{method:'POST'}))).status).toBe(403);
    expect((await POST(new Request(`https://app.example.invalid/api/auth/${path}`,{method:'POST',headers:{Origin:'https://app.example.invalid'}}))).status).toBe(200);
  }
});
it('Supabase current user keeps authoritative getUser, not client session data', async () => {
  vi.stubEnv('BACKEND_PROVIDER','supabase');
  const getUser=vi.fn().mockResolvedValue({data:{user:{id}},error:null});mock.supabase.mockResolvedValue({auth:{getUser}});
  expect(await getCurrentUser()).toEqual({id,email:undefined});expect(getUser).toHaveBeenCalledOnce();expect(mock.session).not.toHaveBeenCalled();
  getUser.mockResolvedValue({data:{user:{id}},error:new Error('invalid')});expect(await getCurrentUser()).toBe(null);
});
