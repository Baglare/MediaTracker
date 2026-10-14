// Runs only through the already attested disposable PG18 runner, no CLI target.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Client } from 'pg';
export async function emailVerificationPg18(config,key,epoch,lifecycle=true) {
  const connect=async(user)=>{const c=new Client({...config,user,ssl:false,connectionTimeoutMillis:3000,query_timeout:5000});await c.connect();return c;};
  const admin=await connect('postgres'),a=await connect('mt_runtime'),b=await connect('mt_runtime');
  try {
    assert.equal((await admin.query("SELECT to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL AS ok")).rows[0].ok,true);
    // RFC 4231 cases 1,2,3,4,6,7, including binary input and >block-size keys.
    const vectors=[
      [Buffer.alloc(20,11),Buffer.from('Hi There'),'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'],
      [Buffer.from('Jefe'),Buffer.from('what do ya want for nothing?'),'5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'],
      [Buffer.alloc(20,170),Buffer.alloc(50,221),'773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'],
      [Buffer.from(Array.from({length:25},(_,i)=>i+1)),Buffer.alloc(50,205),'82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b'],
      [Buffer.alloc(131,170),Buffer.from('Test Using Larger Than Block-Size Key - Hash Key First'),'60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'],
      [Buffer.alloc(131,170),Buffer.from('This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.'),'9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2'],
    ];
    for(const [k,data,expected] of vectors) {
      assert.equal(createHmac('sha256',k).update(data).digest('hex'),expected);
      assert.equal((await admin.query("SELECT encode(native_auth.hmac_sha256($1,$2),'hex') AS h",[k,data])).rows[0].h,expected);
    }
    await admin.query('INSERT INTO native_auth.email_verification_key(epoch,key) VALUES($1,$2)',[epoch,Buffer.from(key,'hex')]);
    await admin.query('INSERT INTO native_auth.email_verification_epoch(epoch,key_hash) VALUES($1,sha256($2::bytea))',[epoch,Buffer.from(key,'hex')]);
    const denied=async(q,args=[])=>assert.rejects(a.query(q,args));
    for(const table of ['email_verification_key','email_verification_epoch','email_verification_replay','email_verification_issuance']) {
      await denied(`SELECT * FROM native_auth.${table}`);
      await denied(`DELETE FROM native_auth.${table}`);
      await denied(`UPDATE native_auth.${table} SET singleton=true`);
    }
    await denied("SELECT native_auth.hmac_sha256('a'::bytea,'b'::bytea)");
    const fresh=async()=>{const id=randomUUID(),email=id+'@example.invalid';await a.query('INSERT INTO native_auth."user"(id,name,email,"emailVerified") VALUES($1,$2,$3,false)',[id,'Synthetic verification',email]);return {id,email};};
    const now=Math.floor(Date.now()/1000);
    const envelope=(u,patch={})=>{const issued=Math.floor(Date.now()/1000);return JSON.stringify(Object.assign([1,u.id,u.email,'email-verification',issued,issued+3600,Number(epoch),randomUUID().replaceAll('-','').padEnd(64,'0')],patch));};
    const sign=text=>createHmac('sha256',Buffer.from(key,'hex')).update(text).digest('hex');
    const verify=(c,text,sig=sign(text))=>c.query('SELECT native_auth.verify_email($1,$2)',[text,sig]);
    const issue=async(text)=>{const p=JSON.parse(text);p[3]='email-verification-issue';const t=JSON.stringify(p);await a.query('SELECT native_auth.register_email_verification($1,$2)',[t,sign(t)]);};
    const user=await fresh(),other=await fresh();
    await denied('INSERT INTO native_auth."user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[randomUUID(),'Forged',randomUUID()+'@example.invalid']);
    await denied('UPDATE native_auth."user" SET "emailVerified"=true WHERE id=$1',[user.id]);
    await denied('UPDATE native_auth."user" SET "emailVerified"=false WHERE id=$1',[user.id]);
    const text=envelope(user);
    await assert.rejects(verify(a,text)); // valid signature without trusted issuance
    await issue(text);
    const otherAccount=JSON.parse(text);otherAccount[1]=other.id;otherAccount[2]=other.email;
    await assert.rejects(verify(a,JSON.stringify(otherAccount))); // even a correctly signed different UUID cannot consume it
    await assert.rejects(verify(a,text,'0'.repeat(64)));
    await assert.rejects(verify(a,text.replace(user.id,other.id),sign(text)));
    for(const patch of [{2:other.email},{3:'password-reset'},{4:now-7200,5:now-3600},{6:Number(epoch)+1},{4:0},{5:now+3601}])await assert.rejects(verify(a,envelope(user,patch)));
    // Runtime-controlled Better Auth marker rows cannot authorize anything.
    await a.query('INSERT INTO native_auth.verification(identifier,value,"expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',['email-verification:forged',user.id]);
    await assert.rejects(verify(a,envelope(user),'f'.repeat(64)));
    const results=await Promise.allSettled([verify(a,text),verify(b,text)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    await assert.rejects(verify(a,text));
    assert.equal((await a.query('SELECT "emailVerified" AS v FROM native_auth."user" WHERE id=$1',[user.id])).rows[0].v,true);
    assert.equal((await a.query('SELECT "emailVerified" AS v FROM native_auth."user" WHERE id=$1',[other.id])).rows[0].v,false);
    if(lifecycle) {
      const guarded=await fresh(),p=envelope(guarded);
      await issue(p);
      await admin.query('UPDATE app.release_write_state SET frozen=true WHERE singleton');
      await assert.rejects(verify(a,p));
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM native_auth.email_verification_replay WHERE replay=$1',[JSON.parse(p)[7]])).rows[0].n,0);
      await admin.query('UPDATE app.release_write_state SET frozen=false WHERE singleton');
      await admin.query("UPDATE app.account_lifecycle SET state='ERASURE_PENDING' WHERE user_id=$1",[guarded.id]);
      await assert.rejects(verify(a,p));
      await admin.query('DELETE FROM native_auth."user" WHERE id=$1',[guarded.id]);
      await assert.rejects(verify(a,p));
    }
    // Restored, missing, stale and wrong secret pins all fail closed.
    const p=envelope(other);
    await issue(p);
    await admin.query('DELETE FROM native_auth.email_verification_key');await assert.rejects(verify(a,p));
    await admin.query('INSERT INTO native_auth.email_verification_key(epoch,key) VALUES($1,$2)',[epoch,Buffer.alloc(32)]);await assert.rejects(verify(a,p));
    await admin.query('UPDATE native_auth.email_verification_key SET key=$1,epoch=epoch+1',[Buffer.from(key,'hex')]);await assert.rejects(verify(a,p));
    await admin.query('UPDATE native_auth.email_verification_key SET epoch=$1',[epoch]);await verify(a,p);
    console.log('PASS: PG18 RFC4231 vectors, HMAC negatives, verified DML denial, atomic replay race, freeze/lifecycle and key pins');
  } finally {await Promise.all([a.end(),b.end(),admin.end()]);}
}
