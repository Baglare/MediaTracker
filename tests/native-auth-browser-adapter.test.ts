import { afterEach, expect, it, vi } from 'vitest';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('maps real Better Auth HTTP responses to the application contract without session tokens or privilege metadata',async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({user:{id,email:'synthetic@example.invalid',emailVerified:true,role:'admin'},session:{token:'secret'}}));
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
it('uses the bounded email signup endpoint without privilege fields',async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({error:'private SQL'},{status:400}));
  vi.stubGlobal('fetch',fetch);vi.resetModules();
  const {nativeBrowserAuth}=await import('@/lib/auth/browser');
  expect(await nativeBrowserAuth.signUp('synthetic@example.invalid','synthetic-password','Synthetic')).toEqual({ok:false,error:'Hesap oluşturulamadı.'});
  expect(fetch.mock.calls[0][0].toString()).toContain('/sign-up/email');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({email:'synthetic@example.invalid',password:'synthetic-password',name:'Synthetic'});
});

it('uses bounded reset and resend API payloads and returns generic delivery errors',async()=>{
  const fetch=vi.fn().mockImplementation(async()=>Response.json({status:true}));
  vi.stubGlobal('fetch',fetch);vi.resetModules();
  const {nativeBrowserAuth}=await import('@/lib/auth/browser');
  expect(await nativeBrowserAuth.requestPasswordReset('synthetic@example.invalid')).toEqual({ok:true});
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({email:'synthetic@example.invalid'});
  expect(fetch.mock.calls[0][0].toString()).toContain('/request-password-reset');
  expect(await nativeBrowserAuth.resendVerification('synthetic@example.invalid')).toEqual({ok:true});
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({email:'synthetic@example.invalid'});
  fetch.mockResolvedValue(Response.json({code:'private SMTP credentials'},{status:503}));
  expect(await nativeBrowserAuth.requestPasswordReset('absent@example.invalid')).toEqual({ok:false,error:'İşlem şu anda tamamlanamadı. Daha sonra tekrar dene.'});
});
it('never resolves an unverified application identity from a stale session',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({user:{id,email:'synthetic@example.invalid',emailVerified:false},session:{token:'secret'}})));vi.resetModules();
  expect(await (await import('@/lib/auth/browser')).nativeBrowserAuth.currentUser()).toBeNull();
});
