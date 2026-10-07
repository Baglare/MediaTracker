import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseEnvironment } from '../scripts/ops/release-policy.mjs';
import { checkFile, checkEnvironment } from '../scripts/ci-checks.mjs';
const env={BACKEND_PROVIDER:'native',DATABASE_URL:'postgresql://mt_runtime:synthetic@localhost/mt_test',DATABASE_SSL_MODE:'verify-full',
  BETTER_AUTH_URL:'https://app.example.invalid',BETTER_AUTH_SECRET:'s'.repeat(40),NEXT_PUBLIC_APP_URL:'https://app.example.invalid',
  AI_SERVER_ACCESS_MODE:'disabled',D7_RESEARCH_ROLLOUT_MODE:'disabled',D7_RESEARCH_SHADOW_ENABLED:'0',
  D7_RESEARCH_PUBLIC_CITATIONS_ENABLED:'0',D7_RESEARCH_EVIDENCE_CACHE_ENABLED:'0',MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE:'off'};
test('native production env requires reviewed selector, native secrets and safe transport',()=>{
  assert.equal(validateReleaseEnvironment(env,'PRODUCTION').valid,true);
  for(const key of ['BACKEND_PROVIDER','DATABASE_URL','DATABASE_SSL_MODE','BETTER_AUTH_URL','BETTER_AUTH_SECRET']) {
    const missing={...env};delete missing[key];assert.equal(validateReleaseEnvironment(missing,'PRODUCTION').valid,false);
  }
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
