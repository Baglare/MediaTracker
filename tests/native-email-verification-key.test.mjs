import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { installEmailVerificationKey } from '../scripts/native-email-verification-key.mjs';
import { nativeRoles } from '../lib/backend/native-roles.mjs';

test('key CLI offers a connection-free plan, rejects secret arguments and requires explicit connection for apply',()=>{
  const call=args=>spawnSync(process.execPath,['scripts/native-email-verification-key.mjs',...args],{encoding:'utf8'});
  const plan=call(['--mode','install']);assert.equal(plan.status,0);assert.match(plan.stdout,/^EMAIL_KEY_PLAN=/);
  for(const args of [[],['--mode','invalid'],['--mode','install','--apply'],['--mode','install','--key','private-value']]) {
    const r=call(args);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr.trim(),'EMAIL_KEY=REFUSED; diagnostics redacted');
  }
});
test('key installation requires freeze and monotonic rotation; restore requires matching protected pin',async()=>{
  const roles=nativeRoles(),key=randomBytes(32).toString('hex'),epoch='1';
  const hash=createHash('sha256').update(Buffer.from(key,'hex')).digest();
  const fixture=(frozen,pin)=>{
    const sql=[];
    return {sql,query:async(text,args)=>{sql.push(text);assert.ok(!text.includes(key));
      if(text.startsWith('SELECT frozen'))return {rows:[{frozen}]};
      if(text.startsWith('SELECT epoch'))return {rows:pin?[pin]:[]};
      if(text.startsWith('INSERT INTO native_auth.email_verification_key'))assert.equal(args[1].toString('hex'),key);
      return {rows:[]};}};
  };
  for(const [mode,frozen,pin,valid] of [['install',true,null,true],['install',false,null,false],['install',true,{epoch,key_hash:hash},false],
    ['rotate',true,{epoch,key_hash:hash},false],['rotate',true,{epoch:'0',key_hash:hash},true],
    ['restore',true,{epoch,key_hash:hash},true],['restore',true,{epoch:'2',key_hash:hash},false],
    ['restore',true,{epoch,key_hash:Buffer.alloc(32)},false]]) {
    const client=fixture(frozen,pin),run=installEmailVerificationKey(client,roles,{key,epoch,mode});
    if(valid){await run;assert.equal(client.sql.at(-1),'COMMIT');}
    else{await assert.rejects(run,/^Error: native_email_key_install_refused$/);assert.equal(client.sql.at(-1),'ROLLBACK');}
  }
});
