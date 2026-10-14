import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseEnvironment, environmentContract } from '../scripts/ops/release-policy.mjs';
import { checkFile, checkEnvironment } from '../scripts/ci-checks.mjs';
const env={BACKEND_PROVIDER:'native',DATABASE_URL:'postgresql://mt_runtime:synthetic@localhost/mt_test',DATABASE_SSL_MODE:'verify-full',
  BETTER_AUTH_URL:'https://app.example.invalid',BETTER_AUTH_SECRET:'s'.repeat(40),NEXT_PUBLIC_APP_URL:'https://app.example.invalid',
  NATIVE_STORAGE_ROOT:process.platform==='win32'?'C:\\mt-native-data':'/var/lib/mt-native-data',TRUSTED_INGRESS_MODE:'passenger',
  RATE_LIMIT_IDENTITY_HMAC_KEY:'h'.repeat(40),RATE_LIMIT_RPC_SIGNING_KEY:'k'.repeat(40),RATE_LIMIT_RPC_KEY_VERSION:'v1',RATE_LIMIT_RPC_AUDIENCE:'mt-native',
  AI_SERVER_ACCESS_MODE:'disabled',D7_RESEARCH_ROLLOUT_MODE:'disabled',D7_RESEARCH_SHADOW_ENABLED:'0',
  D7_RESEARCH_PUBLIC_CITATIONS_ENABLED:'0',D7_RESEARCH_EVIDENCE_CACHE_ENABLED:'0',MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE:'off'};
test('native verification env pairs stay server-only, independent and absent from credential-free CI',()=>{
  const pair={NATIVE_EMAIL_VERIFICATION_KEY:'ab'.repeat(32),NATIVE_EMAIL_VERIFICATION_EPOCH:'1'};
  assert.equal(validateReleaseEnvironment({...env,...pair},'PRODUCTION').valid,true);
  for(const patch of [{NATIVE_EMAIL_VERIFICATION_KEY:''},{NATIVE_EMAIL_VERIFICATION_EPOCH:''},{NATIVE_EMAIL_VERIFICATION_EPOCH:'0'},
    {BETTER_AUTH_SECRET:pair.NATIVE_EMAIL_VERIFICATION_KEY},{BACKEND_PROVIDER:'supabase'}])
    assert.equal(validateReleaseEnvironment({...env,...pair,...patch},'PRODUCTION').valid,false);
  for(const name of Object.keys(pair))assert.throws(()=>checkEnvironment(['package.json'],{[name]:pair[name]}));
  assert.equal(environmentContract().find(e=>e.name==='NATIVE_EMAIL_VERIFICATION_KEY').visibility,'server secret');
});
test('native production env requires reviewed selector, native secrets and safe transport',()=>{
  assert.equal(validateReleaseEnvironment(env,'PRODUCTION').valid,true);
  for(const key of ['BACKEND_PROVIDER','DATABASE_URL','DATABASE_SSL_MODE','BETTER_AUTH_URL','BETTER_AUTH_SECRET']) {
    const missing={...env};delete missing[key];assert.equal(validateReleaseEnvironment(missing,'PRODUCTION').valid,false);
  }
});

test('shared managed capability requires a hosted role profile and stays forbidden for Supabase',()=>{
  const shared={...env,NATIVE_ROLE_PROFILE:'hosting-test',NATIVE_HOSTING_CAPABILITY:'shared-managed',
    DATABASE_URL:'postgresql://mt_test_runtime:synthetic@127.0.0.1:5433/mt_p4_test',
    DATABASE_SSL_CA_FILE:process.platform==='win32'?'C:/private/root.crt':'/private/root.crt'};
  assert.equal(validateReleaseEnvironment(shared,'PRODUCTION').valid,true);
  for(const patch of [{NATIVE_ROLE_PROFILE:'local'},{NATIVE_HOSTING_CAPABILITY:'unknown'},{BACKEND_PROVIDER:'supabase'}])
    assert.equal(validateReleaseEnvironment({...shared,...patch},'PRODUCTION').valid,false);
});
test('source boundary confines pg, pool and Better Auth imports to their server/adapter owners',()=>{
  for(const source of ['import {getNativePool} from "@/lib/backend/postgres";',
    'const pool = import("../backend/postgres");','const pg = require("pg");','export {betterAuth} from "better-auth";'])
    assert.throws(()=>checkFile('lib/domain/repository.ts',source));
  checkFile('lib/backend/transaction.ts','import { getNativePool } from "./postgres"; import type {QueryResult} from "pg";');
  checkFile('lib/auth/native.ts','import {betterAuth} from "better-auth"; import {getNativePool} from "../backend/postgres";');
});
test('Supabase and invalid mode forbid DATABASE_URL; PG* stays forbidden in native',()=>{
  for(const patch of [{BACKEND_PROVIDER:'supabase'},{BACKEND_PROVIDER:'wrong'},{PGPASSWORD:'secret'},
    {DATABASE_SSL_MODE:'disable'},{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co'},
    {NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED:'true'},{BETTER_AUTH_URL:'https://other.example.invalid'}]) {
    const result=validateReleaseEnvironment({...env,...patch},'PRODUCTION');
    assert.equal(result.valid,false);assert.equal(JSON.stringify(result).includes('synthetic@'),false);
  }
  assert.equal(validateReleaseEnvironment({},'CI').valid,true);
  assert.equal(validateReleaseEnvironment({BACKEND_PROVIDER:'supabase'},'PRODUCTION').valid,false);
  for(const name of ['BETTER_AUTH_SECRET','DATABASE_POOL_MAX','PGHOST','BACKEND_PROVIDER'])
    assert.throws(()=>checkEnvironment(['package.json'],{[name]:'synthetic'}));
});

test('native SMTP allowlist is server-only and requires exact complete encrypted configuration',()=>{
  const smtp={NATIVE_SMTP_HOST:'smtp.example.invalid',NATIVE_SMTP_PORT:'465',NATIVE_SMTP_SECURITY:'tls',NATIVE_SMTP_USER:'synthetic',NATIVE_SMTP_PASSWORD:'synthetic-only',NATIVE_SMTP_FROM:'auth@example.invalid'};
  assert.equal(validateReleaseEnvironment({...env,...smtp},'PRODUCTION').valid,true);
  for(const patch of [{NATIVE_SMTP_PORT:'25'},{NATIVE_SMTP_PASSWORD:''},{NATIVE_SMTP_PORT:'587'},{NEXT_PUBLIC_NATIVE_SMTP_PASSWORD:'synthetic-only'},{BACKEND_PROVIDER:'supabase'}])
    assert.equal(validateReleaseEnvironment({...env,...smtp,...patch},'PRODUCTION').valid,false);
  assert.equal(validateReleaseEnvironment({...env,NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED:'true'},'PRODUCTION').valid,false);
  assert.equal(validateReleaseEnvironment({...env,...smtp,NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED:'true'},'PRODUCTION').valid,true);
  assert.throws(()=>checkEnvironment(['package.json'],{NATIVE_SMTP_PASSWORD:'synthetic-only'}));
  assert.throws(()=>checkEnvironment(['package.json'],{NEXT_PUBLIC_NATIVE_SMTP_PASSWORD:'synthetic-only'}));
  for(const entry of environmentContract().filter(e=>e.name.startsWith('NATIVE_SMTP_'))) assert.equal(entry.visibility,'server secret');
});
