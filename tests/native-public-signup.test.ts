import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { nativeAuthOptions } from '@/lib/auth/native-options';
vi.mock('server-only',()=>({}));
const mock=vi.hoisted(()=>({handler:vi.fn()}));
vi.mock('@/lib/auth/native',()=>({getNativeAuth:()=>({handler:mock.handler})}));
import { POST } from '@/app/api/auth/[...all]/route';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('real Better Auth/browser adapter signup, login, session reload, logout and shared quota; synthetic memory storage',async()=>{
  vi.stubEnv('BACKEND_PROVIDER','native');vi.stubEnv('NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED','true');
  const origin='https://test.example.invalid';
  const store:Record<string,Record<string,unknown>[]>={user:[],account:[],session:[],verification:[],rateLimit:[]};
  const options=nativeAuthOptions({NODE_ENV:'production',DATABASE_URL:'postgresql://mt_runtime:synthetic@localhost/test',
    DATABASE_SSL_MODE:'verify-full',BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED:'true'});
  const auth=betterAuth({...options,database:memoryAdapter(store)});
  mock.handler.mockImplementation((r:Request)=>auth.handler(r));
  let cookie='',ip=0;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const headers=new Headers(init?.headers);headers.set('Origin',origin);headers.set('Cookie',cookie);
    headers.set('X-Forwarded-For',`198.51.100.${++ip}`);headers.set('X-Real-IP',`192.0.2.${ip}`);
    const response=await POST(new Request(new URL(String(input),origin),{...init,headers}));
    const next=response.headers.getSetCookie();if(next.length)cookie=next.map(c=>c.split(';')[0]).join('; ');
    return response;
  }));
  vi.resetModules();const {nativeBrowserAuth}=await import('@/lib/auth/browser');
  const email='public-signup@example.invalid',password='Synthetic-password-only';
  expect(await nativeBrowserAuth.signUp(email,password,'Synthetic')).toEqual({ok:true});
  expect(store.user).toHaveLength(1);expect(store.user[0].emailVerified).toBe(false);
  expect(await nativeBrowserAuth.currentUser()).toEqual({id:store.user[0].id,email,user_metadata:{name:'Synthetic'}});
  expect(await nativeBrowserAuth.signOut()).toEqual({ok:true});
  expect(await nativeBrowserAuth.currentUser()).toBeNull();
  expect(await nativeBrowserAuth.signIn(email,password)).toEqual({ok:true});
  // A fresh module/client must resolve the persisted cookie, without client user state.
  vi.resetModules();const reloaded=(await import('@/lib/auth/browser')).nativeBrowserAuth;
  expect(await reloaded.currentUser()).toEqual({id:store.user[0].id,email,user_metadata:{name:'Synthetic'}});
  expect(await reloaded.signOut()).toEqual({ok:true});expect(await reloaded.currentUser()).toBeNull();
  for(let i=1;i<5;i++)expect(await reloaded.signUp(`quota-${i}@example.invalid`,password,'Quota')).toEqual({ok:true});
  expect(store.user).toHaveLength(5);
  const denied=await POST(new Request(`${origin}/api/auth/sign-up/email`,{method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json','X-Forwarded-For':'203.0.113.1','X-Real-IP':'203.0.113.2'},
    body:JSON.stringify({name:'Denied',email:'denied@example.invalid',password})}));
  expect(denied.status).toBe(429);expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(3500);
  expect(store.user).toHaveLength(5);
},15000);
