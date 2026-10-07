import { afterEach, expect, it, vi } from 'vitest';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('maps real Better Auth HTTP responses to the application contract without session tokens or privilege metadata',async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({user:{id,email:'synthetic@example.invalid',role:'admin'},session:{token:'secret'}}));
  vi.stubGlobal('fetch',fetch);vi.resetModules();
  const {nativeBrowserAuth}=await import('@/lib/auth/browser');
  expect(await nativeBrowserAuth.currentUser()).toEqual({id,email:'synthetic@example.invalid'});
  expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST'});
});
it('uses Better Auth email credentials and signout endpoints with JSON; returns stable redacted errors',async()=>{
  const fetch=vi.fn().mockImplementation(async()=>Response.json({error:'SQL personal secret'},{status:401}));
  vi.stubGlobal('fetch',fetch);vi.resetModules();
  const {nativeBrowserAuth}=await import('@/lib/auth/browser');
  expect(await nativeBrowserAuth.signIn('synthetic@example.invalid','synthetic')).toEqual({ok:false,error:'Oturum açılamadı.'});
  expect(fetch.mock.calls[0][0].toString()).toContain('/sign-in/email');
  expect(await nativeBrowserAuth.signOut()).toEqual({ok:false,error:'Oturum kapatılamadı.'});
  expect(fetch.mock.calls[1][1]).toMatchObject({method:'POST',body:'{}'});
});
