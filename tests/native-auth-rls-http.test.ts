import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { hashPassword } from 'better-auth/crypto';
vi.mock('server-only',()=>({}));
const mock=vi.hoisted(()=>({handler:vi.fn()}));
vi.mock('@/lib/auth/native',()=>({getNativeAuth:()=>({handler:mock.handler})}));
import { GET, POST } from '@/app/api/auth/[...all]/route';
// Operator .mjs is intentionally exercised alongside the real Next route boundary.
import { fixtures, authAcceptance, signOutAcceptance, http } from '../scripts/native-auth-rls-acceptance.mjs';

afterEach(()=>vi.unstubAllEnvs());
it('real local HTTP + real Better Auth hashing, session cookies and revocation through the native route; synthetic DB adapter',async()=>{
  vi.stubEnv('BACKEND_PROVIDER','native');
  const origin='https://test.example.invalid';
  const users=fixtures(randomUUID()).map((u:{id:string;email:string;name:string})=>({...u,password:randomBytes(32).toString('base64url')}));
  const now=new Date();
  const store:Record<string,Record<string,unknown>[]>={user:[],account:[],session:[],verification:[],rateLimit:[]};
  for(const user of users) {
    store.user.push({id:user.id,name:user.name,email:user.email,emailVerified:true,createdAt:now,updatedAt:now});
    store.account.push({id:randomUUID(),accountId:user.id,providerId:'credential',userId:user.id,
      password:await hashPassword(user.password),createdAt:now,updatedAt:now});
  }
  const auth=betterAuth({database:memoryAdapter(store),secret:randomBytes(32).toString('hex'),baseURL:origin,
    basePath:'/api/auth',trustedOrigins:[origin],emailAndPassword:{enabled:true,disableSignUp:true},
    session:{cookieCache:{enabled:false},deferSessionRefresh:true},
    advanced:{useSecureCookies:true,database:{generateId:'uuid'},cookiePrefix:'mt-native',
      ipAddress:{ipAddressHeaders:[]},defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:true}},
    rateLimit:{enabled:true,storage:'database'},logger:{disabled:true}});
  mock.handler.mockImplementation((request:Request)=>auth.handler(request));
  let requests=0;
  const server=createServer(async(req,res)=>{
    try {
      requests++;
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers)) {
        if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
      }
      const request=new Request(`${origin}${req.url}`,{method:req.method,headers,
        ...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
      const response=await (req.method==='POST'?POST(request):GET(request));
      res.statusCode=response.status;
      for(const [key,value] of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.statusCode=500;res.end('{}');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('local server');
  // Loopback HTTP transports the synthetic request to the actual route. No external network,
  // TLS bypass, pg connection or claim of hosted TLS/RLS acceptance is involved.
  const request=(config:Parameters<typeof http>[0],path:string,options:Parameters<typeof http>[2])=>http(config,path,options,
    (url:RequestInfo|URL,init?:RequestInit)=>fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}`,init));
  const clients=users.map(()=>({query:async(sql:string,values:unknown[])=>{
    if(sql.includes('count(*)'))return {rows:[{count:store.session.filter(s=>s.token===values[0]
      && (values.length===1||s.userId===values[1])).length}]};return {rows:[]};
  }}));
  try {
    const sessions=await authAcceptance({origin},users,clients,request);
    expect(sessions.map((s:{id:string})=>s.id)).toEqual(users.map((u:{id:string})=>u.id));
    expect(store.session).toHaveLength(2);
    await signOutAcceptance({origin},sessions,clients,request);
    expect(store.session).toHaveLength(0);expect(requests).toBe(16);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);
