import { afterEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { memoryAdapter } from 'better-auth/adapters/memory';
vi.mock('server-only',()=>({}));
const mock=vi.hoisted(()=>({handler:vi.fn(),store:{} as Record<string,Record<string,unknown>[]>,mail:[] as {text:string}[],tasks:[] as (()=>Promise<void>)[]}));
vi.mock('@/lib/backend/postgres',()=>({getNativePool:()=>Object.assign(memoryAdapter(mock.store),{query:async(_sql:string,args:string[])=>{
  const p=JSON.parse(args[0]),user=mock.store.user.find(u=>u.id===p[1]&&u.email===p[2]);
  if(_sql.includes('register_email_verification'))return {rows:[]};
  if(!user||user.emailVerified)throw new Error('rejected');
  user.emailVerified=true;return {rows:[]};
}})}));
vi.mock('@/lib/auth/native-email',async importOriginal=>({...await importOriginal<typeof import('@/lib/auth/native-email')>(),smtpMailTransport:()=>async (mail:{text:string})=>{mock.mail.push(mail);}}));
vi.mock('next/server',async importOriginal=>({...await importOriginal<typeof import('next/server')>(),after:(task:()=>Promise<void>)=>mock.tasks.push(task)}));
vi.mock('@/lib/auth/native',()=>({getNativeAuth:()=>({handler:mock.handler})}));
import { POST } from '@/app/api/auth/[...all]/route';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('real Better Auth/browser adapter signup, login, session reload, logout and shared quota; synthetic memory storage',async()=>{
  vi.stubEnv('BACKEND_PROVIDER','native');vi.stubEnv('NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED','true');
  vi.stubEnv('NATIVE_EMAIL_VERIFICATION_KEY',randomBytes(32).toString('hex'));vi.stubEnv('NATIVE_EMAIL_VERIFICATION_EPOCH','1');
  const origin='https://test.example.invalid';
  const store:Record<string,Record<string,unknown>[]>={user:[],account:[],session:[],verification:[],rateLimit:[]};
  mock.store=store;mock.mail=[];mock.tasks=[];
  for(const [key,value] of Object.entries({DATABASE_URL:'postgresql://mt_runtime:synthetic@localhost/mt_test',DATABASE_SSL_MODE:'disable',BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),
    NATIVE_SMTP_HOST:'smtp.example.invalid',NATIVE_SMTP_PORT:'465',NATIVE_SMTP_SECURITY:'tls',NATIVE_SMTP_USER:'synthetic',NATIVE_SMTP_PASSWORD:'synthetic-only',NATIVE_SMTP_FROM:'auth@example.invalid'}))vi.stubEnv(key,value);
  const {getNativeAuth}=await vi.importActual<typeof import('@/lib/auth/native')>('@/lib/auth/native');
  const auth=getNativeAuth();
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
  expect(await nativeBrowserAuth.currentUser()).toBeNull();
  expect(store.session).toHaveLength(0);
  expect(await nativeBrowserAuth.signIn(email,password)).toEqual({ok:false,error:'Oturum açılamadı.'});
  await Promise.all(mock.tasks.map(task=>task()));
  const token=new URL(mock.mail[0].text.split('\n')[1]).hash.slice('#token='.length);
  expect(await nativeBrowserAuth.verifyEmail(decodeURIComponent(token))).toEqual({ok:true});
  expect(await nativeBrowserAuth.verifyEmail(decodeURIComponent(token))).toEqual({ok:false});
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
