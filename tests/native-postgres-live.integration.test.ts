import { spawnSync } from 'node:child_process';
import { verifyDisposableRelay } from '../scripts/native-disposable-relay.mjs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { nativeAuthOptions } from '@/lib/auth/native-options';
vi.mock('server-only',()=>({}));
const context=vi.hoisted(()=>({headers:new Headers(),mail:[] as string[],tasks:[] as (()=>Promise<void>)[]}));
vi.mock('@/lib/auth/native-email',async importOriginal=>({...await importOriginal<typeof import('@/lib/auth/native-email')>(),smtpMailTransport:()=>async (mail:{text:string})=>{context.mail.push(mail.text);}}));
vi.mock('next/server',async importOriginal=>({...await importOriginal<typeof import('next/server')>(),after:(task:()=>Promise<void>)=>context.tasks.push(task)}));
async function verificationToken() { await Promise.all(context.tasks.splice(0).map(task=>task())); return new URLSearchParams(new URL(context.mail.at(-1)!.split('\n')[1]).hash.slice(1)).get('token')!; }
vi.mock('next/headers',()=>({headers:async()=>context.headers}));
import { getNativePool } from '@/lib/backend/postgres';
import { getNativeAuth } from '@/lib/auth/native';
import { verificationIdentifier } from '@/lib/auth/native-email';
import { getCurrentUser } from '@/lib/auth/current-user';
import { withAuthenticatedTransaction } from '@/lib/backend/transaction';
import { GET as authGET, POST as authPOST } from '@/app/api/auth/[...all]/route';
import { POST as cloudPOST } from '@/app/api/backend/cloud/route';

// Re-inspect the pinned local container and authenticate the runner's live relay
// before obtaining a DB client. Environment metadata alone is insufficient.
const configured=!!process.env.NATIVE_P1_PROOF_CONTAINER;
let approved=false;
async function assertDisposable() {
  const url=new URL(process.env.DATABASE_URL!);
  if(url.protocol!=='postgresql:' || url.pathname!=='/mt_p1_proof' || url.username!=='mt_runtime'
    || !/^[a-f0-9]{64}$/.test(url.password)) throw new Error('unsafe_test_target');
  await verifyDisposableRelay({containerId:process.env.NATIVE_P1_PROOF_CONTAINER,
    runName:process.env.NATIVE_P1_PROOF_NAME,localEndpoint:process.env.DOCKER_HOST,networkId:process.env.NATIVE_P1_PROOF_NETWORK},
    JSON.parse(process.env.NATIVE_P1_RELAY_PROOF??'null'),url.hostname,url.port);
}

describe.runIf(configured)('runner-owned disposable native DB proof',()=>{
  beforeAll(async()=>{
    await assertDisposable();
    approved=true;
    await getNativePool().query('SELECT 1'); // onConnect verifies role separation.
    (getNativeAuth().options as BetterAuthOptions).onAPIError={onError(error){
      const value=error as {code?:unknown;name?:unknown;message?:unknown};
      if(typeof value.code==='string'&&/^[0-9A-Z]{5}$/.test(value.code)) console.error(`PG18_AUTH_SQLSTATE=${value.code}`);
      const category=value.message==='timeout exceeded when trying to connect'?'pool_acquisition_timeout'
        :value.name==='SchemaMismatchError'?'schema_mismatch':value.name==='APIError'?'api_error':'unknown';
      console.error(`PG18_AUTH_ERROR=${category}`);
    }};
  });
  afterAll(async()=>{if(approved) await getNativePool().end();});
  it.runIf(process.env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED !== 'true')('creates only fresh synthetic users through Better Auth credentials; validates cookie/session and pooled RLS',async()=>{
    const pool=getNativePool();
    // Test-only provisioner: no HTTP listener, no production signup override.
    const fixture=betterAuth({...nativeAuthOptions(process.env),database:pool,emailAndPassword:{enabled:true,disableSignUp:false}});
    const password=`Synthetic-${randomUUID()}`;
    const users: { id: string; email: string }[]=[];
    for(const name of ['A','B']) {
      const email=`${randomUUID()}@example.invalid`;
      const created=await fixture.api.signUpEmail({body:{name,email,password}});
      await getNativeAuth().api.sendVerificationEmail({body:{email}});
      await getNativeAuth().api.verifyEmail({query:{token:await verificationToken()}});
      users.push({id:created.user.id,email});
      expect(created.user.id).toMatch(/^[a-f0-9-]{36}$/);
    }
    await expect(getNativeAuth().api.signUpEmail({body:{name:'Denied',email:`${randomUUID()}@example.invalid`,password}})).rejects.toThrow();
    async function login(email:string) {
      const response=await getNativeAuth().handler(new Request('http://localhost:3000/api/auth/sign-in/email',{
        method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email,password})}));
      expect(response.status).toBe(200);
      const cookies=response.headers.getSetCookie();expect(cookies.join(';')).toContain('HttpOnly');
      expect(cookies.join(';').toLowerCase()).toContain('samesite=lax');
      context.headers=new Headers({cookie:cookies.map(c=>c.split(';')[0]).join('; ')});
      return getCurrentUser();
    }
    // Fixture table creation belongs to the operator, not the runtime; create via
    // the isolated container's local operator connection.
    const setup=`SET ROLE mt_owner; CREATE TABLE app.p1_live(owner_id uuid PRIMARY KEY,value text NOT NULL);
      ALTER TABLE app.p1_live ENABLE ROW LEVEL SECURITY; ALTER TABLE app.p1_live FORCE ROW LEVEL SECURITY;
      CREATE POLICY owner_policy ON app.p1_live TO mt_runtime USING(owner_id=app.current_user_id()) WITH CHECK(owner_id=app.current_user_id());
      GRANT SELECT,INSERT,UPDATE ON app.p1_live TO mt_runtime;`;
    const r=spawnSync('docker',['--host',process.env.DOCKER_HOST!,'exec','-i',process.env.NATIVE_P1_PROOF_CONTAINER!,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','mt_p1_proof'],{input:setup,encoding:'utf8',timeout:5000});
    expect(r.status).toBe(0);
    expect((await login(users[0].email))?.id).toBe(users[0].id);
    await withAuthenticatedTransaction(async tx=>{await tx.query('INSERT INTO app.p1_live VALUES($1,$2)',[tx.userId,'A']);});
    expect((await pool.query('SELECT app.current_user_id() AS id')).rows[0].id).toBe(null);
    expect((await login(users[1].email))?.id).toBe(users[1].id);
    await withAuthenticatedTransaction(async tx=>{
      expect((await tx.query('SELECT * FROM app.p1_live')).rows).toHaveLength(0);
      await tx.query('INSERT INTO app.p1_live VALUES($1,$2)',[tx.userId,'B']);
    });
    await expect(withAuthenticatedTransaction(async tx=>{await tx.query('INSERT INTO app.p1_live VALUES($1,$2)',[users[0].id,'forged']);})).rejects.toThrow('database_operation_failed');
    expect((await pool.query('SELECT app.current_user_id() AS id')).rows[0].id).toBe(null);
    context.headers=new Headers();expect(await getCurrentUser()).toBe(null);
    await expect(withAuthenticatedTransaction(async()=>{})).rejects.toThrow('authentication_required');
  },30000);
  it.runIf(process.env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED === 'true')('public signup, login, session, Cloud refresh, second-owner denial, logout and shared signup quota on PG18 001–013',async()=>{
    const origin='http://localhost:3000',password=`Synthetic-${randomUUID()}`;
    const call=(path:string,body:unknown,cookie='')=>authPOST(new Request(`${origin}/api/auth/${path}`,{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,
        'X-Forwarded-For':`198.51.100.${Math.floor(Math.random()*200)+1}`,'X-Real-IP':'192.0.2.1'},body:JSON.stringify(body)}));
    const cookies=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    const users: {id:string;email:string;cookie:string}[]=[];
    for(const name of ['A','B']) {
      const email=`${randomUUID()}@example.invalid`;
      const signup=await call('sign-up/email',{name,email,password});
      expect(signup.status).toBe(200);
      expect(await signup.json()).toEqual({status:true});
      const created={user:(await getNativePool().query('SELECT id,email,"emailVerified" FROM native_auth."user" WHERE email=$1',[email])).rows[0]};
      expect(created.user.emailVerified).toBe(false);
      const signupCookie=cookies(signup);
      expect(signupCookie).toBe('');
      const token=await verificationToken();
      expect((await call('verify-email',{token})).status).toBe(200);
      const adapter=(await getNativeAuth().$context).internalAdapter;
      const marker=await adapter.consumeVerificationValue(verificationIdentifier(token)).catch(error=>{
        const code=error?.code;
        throw new Error(typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?`PG18_AUTH_SQLSTATE=${code}`:'PG18_AUTH_DRIVER_FAILURE');
      });
      expect(marker).toBeNull();
      expect((await call('verify-email',{token})).status).toBe(400);
      const login=await call('sign-in/email',{email,password});expect(login.status).toBe(200);
      const cookie=cookies(login);expect(login.headers.getSetCookie().join(';')).toContain('HttpOnly');
      context.headers=new Headers({Cookie:cookie});
      expect((await getCurrentUser())?.id).toBe(created.user.id);
      users.push({id:created.user.id,email,cookie});
    }
    const cloud=(body:unknown,cookie:string)=>{
      context.headers=new Headers({Cookie:cookie});
      return cloudPOST(new Request(`${origin}/api/backend/cloud`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)}));
    };
    const [a,b]=users;
    const args={p_operation_id:randomUUID(),p_record_id:'signup-sentinel',p_operation_type:'upsert',p_expected_revision:0,
      p_payload:{title:'Private signup sentinel',type:'movie',status:'planning',current_progress:0,total_progress:1,favorite:false,tags:[],metadata:{},identity_status:'unresolved'}};
    const write=await cloud({action:'rpc',expectedUserId:a.id,name:'apply_media_item_sync_operation',args},a.cookie);
    expect(write.status).toBe(200);expect((await write.json()).data.ok).toBe(true);
    const read={action:'read',expectedUserId:a.id,table:'media_items',includeDeleted:false};
    // Fresh request context/session verification models reload without cached client identity.
    context.headers=new Headers({Cookie:a.cookie});
    const session=await authGET(new Request(`${origin}/api/auth/get-session`,{headers:context.headers}));
    expect((await session.json()).user.id).toBe(a.id);
    const refreshed=await cloud(read,a.cookie);expect(refreshed.status).toBe(200);
    expect((await refreshed.json()).data).toEqual([expect.objectContaining({id:'signup-sentinel',user_id:a.id,revision:1})]);
    const ownB=await cloud({...read,expectedUserId:b.id},b.cookie);
    expect(ownB.status).toBe(200);expect((await ownB.json()).data).toEqual([]);
    expect((await cloud(read,b.cookie)).status).toBe(503);
    expect((await cloud({action:'rpc',expectedUserId:a.id,name:'apply_media_item_sync_operation',args},b.cookie)).status).toBe(503);
    await withAuthenticatedTransaction(async tx=>{
      expect((await tx.query('SELECT * FROM app.media_items WHERE user_id=$1',[a.id])).rows).toHaveLength(0);
      await expect(tx.query('UPDATE app.media_items SET title=$1 WHERE user_id=$2',['forged',a.id])).rejects.toThrow();
    }).catch(error=>{expect(error.message).toBe('database_operation_failed');});
    expect((await call('sign-out',{},a.cookie)).status).toBe(200);
    expect((await cloud(read,a.cookie)).status).toBe(401);
    const revoked=await authGET(new Request(`${origin}/api/auth/get-session`,{headers:{Cookie:a.cookie}}));
    expect(await revoked.json()).toBeNull();
    // Keep admitted concurrent hashes within the existing two-slot capacity guard.
    expect((await call('sign-up/email',{name:'Quota seed',email:`${randomUUID()}@example.invalid`,password})).status).toBe(200);
    // Three attempts consumed quota. Forged IPs cannot split the atomic DB counter.
    const race=await Promise.all(Array.from({length:3},()=>call('sign-up/email',{name:'Quota',email:`${randomUUID()}@example.invalid`,password})));
    expect(race.filter(r=>r.status===200)).toHaveLength(2);
    expect(race.filter(r=>r.status===429)).toHaveLength(1);
    const limited=await call('sign-up/email',{name:'Denied',email:`${randomUUID()}@example.invalid`,password});
    expect(limited.status).toBe(429);expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(3500);
  },30000);
});
