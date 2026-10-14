import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
vi.mock('server-only',()=>({}));
import { emailVerificationProof } from '@/lib/auth/email-verification-proof';
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'synthetic@example.invalid'};
const secret='synthetic-better-auth-secret-only',now=1800000000;
let env: Record<string,string>;
function token(payload: unknown={email:user.email,iat:now,exp:now+3600}) {
  const input=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
  return input+'.'+createHmac('sha256',secret).update(input).digest('base64url');
}
beforeEach(()=>{env={NATIVE_EMAIL_VERIFICATION_KEY:randomBytes(32).toString('hex'),NATIVE_EMAIL_VERIFICATION_EPOCH:String(now)};});
afterEach(()=>vi.restoreAllMocks());
it('binds authenticated JWT, account, purpose, time, epoch and canonical replay identity to standard Node HMAC',()=>{
  const t=token(),p=emailVerificationProof(t,secret,user,env,now);
  expect(JSON.parse(p.envelope).slice(0,7)).toEqual([1,user.id,user.email,'email-verification',now,now+3600,now]);
  expect(p.signature).toBe(createHmac('sha256',Buffer.from(env.NATIVE_EMAIL_VERIFICATION_KEY,'hex')).update(p.envelope).digest('hex'));
  expect(JSON.parse(p.envelope)[7]).toMatch(/^[a-f0-9]{64}$/);
  expect(()=>emailVerificationProof(t,secret,{...user,email:'other@example.invalid'},env,now)).toThrow();
});
it('rejects JOSE-valid signature pad-bit aliases, tampering, malformed and extended tokens before proof issuance',()=>{
  const t=token(),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const alias=t.slice(0,-1)+alphabet[alphabet.indexOf(t.at(-1)!)^1];
  expect(Buffer.from(alias.split('.')[2],'base64url')).toEqual(Buffer.from(t.split('.')[2],'base64url'));
  for(const bad of [alias,t+'=',t+'.x','garbage',t.replace(t[4],t[4]==='a'?'b':'a')])expect(()=>emailVerificationProof(bad,secret,user,env,now)).toThrow();
});
it('rejects expired/future/old-epoch, wrong purpose and email-change JWT payloads',()=>{
  for(const patch of [{iat:now-3601,exp:now-1},{iat:now+1},{exp:now+3601},{iat:now-1},{updateTo:'other@example.invalid'},{requestType:'change-email-verification'}])
    expect(()=>emailVerificationProof(token({email:user.email,iat:now,exp:now+3600,...patch}),secret,user,env,now)).toThrow();
});
it('missing, malformed and mismatched signing configuration fails closed',()=>{
  for(const patch of [{NATIVE_EMAIL_VERIFICATION_KEY:''},{NATIVE_EMAIL_VERIFICATION_KEY:'x'.repeat(64)},{NATIVE_EMAIL_VERIFICATION_EPOCH:'0'},{NATIVE_EMAIL_VERIFICATION_EPOCH:String(now+1)}])
    expect(()=>emailVerificationProof(token(),secret,user,{...env,...patch},now)).toThrow();
});
