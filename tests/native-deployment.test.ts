import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { nativeDeploymentConfig } from '@/lib/backend/deployment-config.mjs';
import { nativeConfig } from '@/lib/backend/native-config';
import { GET as live } from '@/app/api/health/live/route';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({ready:vi.fn(),safe:vi.fn(),access:vi.fn()}));
vi.mock('@/lib/backend/transaction',()=>({nativeDatabaseReady:mocks.ready}));
vi.mock('@/lib/backend/filesystem-core.mjs',async original=>({...(await original<typeof import('@/lib/backend/filesystem-core.mjs')>()),safeDirectory:mocks.safe}));
vi.mock('node:fs/promises',()=>({access:mocks.access,constants:{R_OK:4,W_OK:2,X_OK:1}}));
import { GET as ready } from '@/app/api/health/ready/route';
import { register } from '../instrumentation';
import { resolveTrustedIngress } from '@/lib/api/rate-limit-identity';
const env={NODE_ENV:'production' as const,BACKEND_PROVIDER:'native',DATABASE_URL:'postgresql://mt_runtime:synthetic@127.0.0.1/test',
  DATABASE_SSL_MODE:'verify-full',BETTER_AUTH_SECRET:'s'.repeat(40),BETTER_AUTH_URL:'https://app.example.invalid',NEXT_PUBLIC_APP_URL:'https://app.example.invalid',
  NATIVE_STORAGE_ROOT:resolve(process.cwd(),'..','p3-synthetic-data'),TRUSTED_INGRESS_MODE:'passenger',
  RATE_LIMIT_IDENTITY_HMAC_KEY:'h'.repeat(40),RATE_LIMIT_RPC_SIGNING_KEY:'k'.repeat(40),RATE_LIMIT_RPC_KEY_VERSION:'v1',RATE_LIMIT_RPC_AUDIENCE:'mt',
  AI_SERVER_ACCESS_MODE:'disabled',D7_RESEARCH_ROLLOUT_MODE:'disabled',D7_RESEARCH_SHADOW_ENABLED:'0',D7_RESEARCH_PUBLIC_CITATIONS_ENABLED:'0',
  D7_RESEARCH_EVIDENCE_CACHE_ENABLED:'0',MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE:'off'};
describe('native production deployment boundary',()=>{
  it('accepts an explicit complete contract without Supabase or operator credentials',()=>{
    expect(nativeDeploymentConfig(env).max).toBe(2);
  });
  it('never trusts a forged IP header without the complete operator-reviewed ingress tuple',()=>{
    const request=new Request('https://app.example.invalid',{headers:{'x-synthetic-client-ip':'198.51.100.7','x-forwarded-for':'192.0.2.1'}});
    expect(resolveTrustedIngress(request,env).ip).toBeNull();
    const tuple={...env,TRUSTED_INGRESS_HEADER:'x-synthetic-client-ip',TRUSTED_INGRESS_PROOF_SHA256:'a'.repeat(64),TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED:'1'};
    expect(nativeDeploymentConfig(tuple).ingress).toBe('passenger');
    expect(resolveTrustedIngress(request,tuple).ip).toBe('198.51.100.7');
    for(const name of ['TRUSTED_INGRESS_PROOF_SHA256','TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED']) {
      const partial={...tuple,[name]:undefined};expect(resolveTrustedIngress(request,partial).ip).toBeNull();expect(()=>nativeDeploymentConfig(partial)).toThrow();
    }
    const multiple=new Request('https://app.example.invalid',{headers:{'x-synthetic-client-ip':'198.51.100.7, 192.0.2.1'}});
    expect(resolveTrustedIngress(multiple,tuple).ip).toBeNull();
  });
  it('bounds native Next optimizer/cache resources while retaining Supabase defaults',async()=>{
    const original=process.env;process.env={...env};
    try {
      vi.resetModules();const native=(await import('../next.config')).default;
      expect(native.images?.maximumResponseBody).toBe(10*1024*1024);
      expect(native.experimental).toMatchObject({imgOptConcurrency:1,imgOptMaxInputPixels:16_777_216,imgOptTimeoutInSeconds:5,imgOptOperationCache:false});
      expect(native.cacheMaxMemorySize).toBe(16*1024*1024);
      process.env.BACKEND_PROVIDER='supabase';vi.resetModules();const fallback=(await import('../next.config')).default;
      expect(fallback.images?.maximumResponseBody).toBe(50_000_000);expect(fallback.experimental).toEqual({});expect(fallback.cacheMaxMemorySize).toBeUndefined();
    } finally {process.env=original;}
  });
  it.each(['NATIVE_STORAGE_ROOT','TRUSTED_INGRESS_MODE','RATE_LIMIT_IDENTITY_HMAC_KEY','RATE_LIMIT_RPC_SIGNING_KEY',
    'RATE_LIMIT_RPC_KEY_VERSION','RATE_LIMIT_RPC_AUDIENCE','NEXT_PUBLIC_APP_URL','AI_SERVER_ACCESS_MODE'])('rejects missing %s',name=>{
    expect(()=>nativeDeploymentConfig({...env,[name]:undefined})).toThrow(/^native_deployment_configuration_invalid$/);
  });
  it.each([{NATIVE_STORAGE_ROOT:process.cwd()},{NATIVE_STORAGE_ROOT:resolve(process.cwd(),'public','data')},
    {SUPABASE_SERVICE_ROLE_KEY:'private'},{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid'},
    {NATIVE_OPS_DATABASE_URL:'private'},{VERCEL:'1'},{OPENAI_API_KEY:'private'},{TRUSTED_INGRESS_MODE:'vercel'},
    {RATE_LIMIT_RPC_SIGNING_KEY:env.BETTER_AUTH_SECRET},{AI_SERVER_ACCESS_MODE:'admin'}])('rejects unsafe runtime configuration %#',patch=>{
    expect(()=>nativeDeploymentConfig({...env,...patch})).toThrow(/^native_deployment_configuration_invalid$/);
  });
  it.each(['0','6','NaN','1.5'])('rejects excessive/invalid pool %s',value=>expect(()=>nativeConfig({...env,DATABASE_POOL_MAX:value})).toThrow());
  it.each([{DATABASE_CONNECTION_TIMEOUT_MS:'0'},{DATABASE_IDLE_TIMEOUT_MS:'30001'},{DATABASE_STATEMENT_TIMEOUT_MS:'5001'}])('bounds queue and query timeouts %#',patch=>{
    expect(()=>nativeConfig({...env,...patch})).toThrow(/^native_configuration_invalid$/);
  });
  it('liveness requires no DB or filesystem and exposes minimal no-store status',async()=>{
    const response=await live();expect(await response.json()).toEqual({status:'alive'});expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('boot validates required configuration before accepting requests and creates only required private directories',async()=>{
    const original=process.env;process.env={...env,NEXT_RUNTIME:'nodejs'};
    try {
      mocks.safe.mockReset().mockResolvedValue(undefined);mocks.access.mockReset().mockResolvedValue(undefined);
      await register();expect(mocks.safe).toHaveBeenCalledWith(env.NATIVE_STORAGE_ROOT,true);
      expect(mocks.safe).toHaveBeenCalledTimes(3);
      delete process.env.BACKEND_PROVIDER;await expect(register()).rejects.toThrow('backend_configuration_invalid');
    } finally {process.env=original;}
  });
  it('readiness reports actual dependency failure without sensitive diagnostics',async()=>{
    // Stub the environment fully; historical developer/operator variables stay absent.
    const original=process.env;process.env={...env};
    try {
      mocks.safe.mockResolvedValue(undefined);mocks.access.mockResolvedValue(undefined);mocks.ready.mockResolvedValue(false);
      const unavailable=await ready();expect(unavailable.status).toBe(503);expect(await unavailable.json()).toEqual({status:'unavailable'});
      mocks.ready.mockResolvedValue(true);expect((await ready()).status).toBe(200);
      mocks.access.mockRejectedValue(new Error('password secret private path'));const failure=await ready();
      expect(failure.status).toBe(503);expect(await failure.text()).not.toContain('password');
    } finally {process.env=original;}
  });
});
