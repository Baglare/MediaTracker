import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { nativeAuthOptions } from '@/lib/auth/native-options';
vi.mock('server-only',()=>({}));
const context=vi.hoisted(()=>({headers:new Headers()}));
vi.mock('next/headers',()=>({headers:async()=>context.headers}));
import { getNativePool } from '@/lib/backend/postgres';
import { getNativeAuth } from '@/lib/auth/native';
import { getCurrentUser } from '@/lib/auth/current-user';
import { withAuthenticatedTransaction } from '@/lib/backend/transaction';

// A flag alone cannot authorize contact. Re-inspect the runner-owned Docker
// instance and exact published loopback port BEFORE obtaining any DB client.
const configured=!!process.env.NATIVE_P1_PROOF_CONTAINER;
let approved=false;
function assertDisposable() {
  const id=process.env.NATIVE_P1_PROOF_CONTAINER!,name=process.env.NATIVE_P1_PROOF_NAME!;
  if(!/^[a-f0-9]{64}$/.test(id) || !/^mt-p1-[a-f0-9-]{36}$/.test(name)) throw new Error('unsafe_test_target');
  const inspect=(args:string[])=>{
    const r=spawnSync('docker',args,{encoding:'utf8',timeout:5000});
    if(r.status!==0) throw new Error('unsafe_test_target');return JSON.parse(r.stdout)[0];
  };
  const target=inspect(['inspect',id]),network=inspect(['network','inspect',name]);
  const bindings=target.NetworkSettings.Ports['5432/tcp'],url=new URL(process.env.DATABASE_URL!);
  if(target.Name!==`/${name}` || target.Config.Labels['mt.p1.proof']!==name || !target.State.Running
    || network.Internal!==true || network.Labels['mt.p1.proof']!==name || target.HostConfig.NetworkMode!==name
    || target.Mounts.some((m:{Type:string})=>m.Type!=='tmpfs') || bindings?.length!==1 || bindings[0].HostIp!=='127.0.0.1'
    || url.hostname!=='127.0.0.1' || url.port!==bindings[0].HostPort || url.pathname!=='/mt_p1_proof'
    || url.username!=='mt_runtime' || !/^[a-f0-9]{64}$/.test(url.password)) throw new Error('unsafe_test_target');
}
describe.runIf(configured)('runner-owned disposable native DB proof',()=>{
  beforeAll(async()=>{
    assertDisposable();
    approved=true;
    await getNativePool().query('SELECT 1'); // onConnect verifies role separation.
  });
  afterAll(async()=>{if(approved) await getNativePool().end();});
  it('creates only fresh synthetic users through Better Auth credentials; validates cookie/session and pooled RLS',async()=>{
    const pool=getNativePool();
    // Test-only provisioner: no HTTP listener, no production signup override.
    const fixture=betterAuth({...nativeAuthOptions(process.env),database:pool,emailAndPassword:{enabled:true,disableSignUp:false}});
    const password=`Synthetic-${randomUUID()}`;
    const users: { id: string; email: string }[]=[];
    for(const name of ['A','B']) {
      const email=`${randomUUID()}@example.invalid`;
      const created=await fixture.api.signUpEmail({body:{name,email,password}});
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
    const r=spawnSync('docker',['exec','-i',process.env.NATIVE_P1_PROOF_CONTAINER!,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','mt_p1_proof'],{input:setup,encoding:'utf8',timeout:5000});
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
});
