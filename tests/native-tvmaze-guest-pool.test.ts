import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({ user:vi.fn(),connect:vi.fn(),query:vi.fn(),release:vi.fn(),fetch:vi.fn() }));
vi.mock('@/lib/auth/current-user',()=>({getCurrentUser:mocks.user}));
vi.mock('@/lib/backend/postgres',()=>({getNativePool:()=>({connect:mocks.connect})}));
vi.mock('@/lib/providers/release-policy',()=>({publicProviderCapability:()=>({enabled:true})}));
import { POST as search } from '@/app/api/tvmaze/search/route';
import { GET as details } from '@/app/api/tvmaze/details/route';
import { GET as calendar } from '@/app/api/calendar/tvmaze/route';
import { consumeRateLimit, reportProviderCooldown, signRateLimitEnvelope } from '@/lib/api/distributed-rate-limit';
import { nativeSignedLimiter } from '@/lib/backend/limiter';
import { TVMAZE_GUEST_POOL } from '@/lib/api/rate-limit-identity';

const key='synthetic-guest-identity-key-000000001';
const signingKey='synthetic-guest-signing-key-000000002';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const allowed={allowed:true,reason:'allowed',retry_after_seconds:0};
function request(headers:Record<string,string>={},body:object={query:'Breaking Bad'}) {
  return new NextRequest('https://app.invalid/api/tvmaze/search',{method:'POST',headers:{'content-type':'application/json',origin:'https://app.invalid',...headers},body:JSON.stringify(body)});
}
function calls() {return mocks.query.mock.calls.filter(([sql])=>sql.includes('app.tvmaze_guest_rate_limit_v1'));}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv('BACKEND_PROVIDER','native');vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER','native');vi.stubEnv('NODE_ENV','production');
  vi.stubEnv('TRUSTED_INGRESS_MODE','unconfigured');vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_KEY',key);vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY','');
  vi.stubEnv('RATE_LIMIT_RPC_SIGNING_KEY',signingKey);vi.stubEnv('RATE_LIMIT_RPC_KEY_VERSION','v1');vi.stubEnv('RATE_LIMIT_RPC_AUDIENCE','mt:guest-test');
  mocks.user.mockResolvedValue(null);mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});
  mocks.query.mockResolvedValue({rows:[{result:allowed}]});mocks.fetch.mockImplementation(async()=>Response.json([]));vi.stubGlobal('fetch',mocks.fetch);
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('native anonymous TVMaze shared pool (offline transport)',()=>{
  it('signs server-owned guest admission; forwarded headers, IDs and cookies cannot renew the pool',async()=>{
    const attempts:Record<string,string>[]=[{},{'x-forwarded-for':'203.0.113.2','x-real-ip':'192.0.2.1','x-user-id':owner,cookie:'guest-id=forged'}];
    for(const headers of attempts) {
      expect((await search(request(headers))).status).toBe(200);
    }
    const envelopes=calls().map(([,args])=>JSON.parse(args[0]));
    expect(envelopes[0]).toMatchObject({identity_class:'guest_pool',policy_id:'tvmaze_search',ingress:[],cost:1});
    expect(envelopes[0].subjects).toEqual(envelopes[1].subjects);
    for(const [,args] of calls())expect(args[1]).toBe(createHmac('sha256',signingKey).update(args[0]).digest('hex'));
    expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('app.user_id', $1, true)",['']);
  });
  it('still uses the guest pool with trusted ingress, avoiding IP rotation around the shared cap',async()=>{
    vi.stubEnv('NODE_ENV','test');vi.stubEnv('TRUSTED_INGRESS_MODE','local-test');vi.stubEnv('RATE_LIMIT_LOCAL_TEST_IP','192.0.2.1');
    expect((await search(request())).status).toBe(200);
    expect(JSON.parse(calls()[0][1][0])).toMatchObject({identity_class:'guest_pool',ingress:[]});
  });
  it('keeps authenticated identity on the original RPC and ignores guest cookies',async()=>{
    mocks.user.mockResolvedValue({id:owner});
    expect((await search(request({cookie:'guest-id=forged'}))).status).toBe(200);
    expect(calls()).toHaveLength(0);
    const call=mocks.query.mock.calls.find(([sql])=>sql.includes('app.consume_application_rate_limit_v1'))!;
    expect(JSON.parse(call[1][0])).toMatchObject({identity_class:'user',ingress:[]});
  });
  it.each(['tvmaze_details','tvmaze_calendar','social_read','social_write','asset_write','xp_sync','settings_write'] as const)('does not extend no-ingress guest admission to %s',async policy=>{
    expect(await consumeRateLimit(request(),policy)).toMatchObject({allowed:false,source:'unavailable'});
    expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('details route stays closed to no-ingress guests',async()=>{
    expect((await details(new NextRequest('https://app.invalid/api/tvmaze/details?id=1'))).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('calendar route stays closed to no-ingress guests',async()=>{
    expect((await calendar(new NextRequest('https://app.invalid/api/calendar/tvmaze?showId=1&season=1'))).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();expect(calls()).toHaveLength(0);
  });
  it.each(['details','calendar'] as const)('authenticated %s retains original policy/cost and RPC',async route=>{
    mocks.user.mockResolvedValue({id:owner});
    mocks.fetch.mockImplementation(async(url:string)=>Response.json(url.endsWith('/episodes')?[]:{id:1,name:'Show',genres:[]}));
    const response=route==='details'?await details(new NextRequest('https://app.invalid/api/tvmaze/details?id=1'))
      :await calendar(new NextRequest('https://app.invalid/api/calendar/tvmaze?showId=1&season=1'));
    expect(response.status).toBe(200);expect(calls()).toHaveLength(0);
    const call=mocks.query.mock.calls.find(([sql])=>sql.includes('app.consume_application_rate_limit_v1'))!;
    expect(JSON.parse(call[1][0])).toMatchObject({identity_class:'user',policy_id:`tvmaze_${route}`,cost:route==='details'?2:1});
  });
  it('guest admission retains strict payload and cross-origin rejection before SQL',async()=>{
    expect((await search(request({}, {query:'Show',guestId:'forged'}))).status).toBe(400);
    expect((await search(request({origin:'https://evil.invalid'}))).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    [{allowed:false,reason:'limited',retry_after_seconds:10},429],
    [{allowed:false,reason:'capacity',retry_after_seconds:5},503],
    [{allowed:false,reason:'replay',retry_after_seconds:5},503],
    [{allowed:true,reason:'limited',retry_after_seconds:1},503],
  ])('denial %j starts no upstream call',async(result,status)=>{
    mocks.query.mockResolvedValue({rows:[{result}]});
    const response=await search(request());expect(response.status).toBe(status);expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('missing 013/SQL errors fail closed',async()=>{
    mocks.query.mockImplementation(async(sql:string)=>{if(sql.includes('app.tvmaze_guest_rate_limit_v1'))throw new Error('function missing');return {rows:[]};});
    const response=await search(request());expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'rate_limit_unavailable'});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('auth verification failure cannot fall back to the guest pool',async()=>{
    mocks.user.mockRejectedValue(new Error('auth unavailable'));
    expect((await search(request())).status).toBe(503);expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('a login between admission and the transaction fails closed',async()=>{
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({id:owner});
    expect((await search(request())).status).toBe(503);expect(calls()).toHaveLength(0);expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('a guest SQL timeout never starts a late provider request',async()=>{
    vi.useFakeTimers();let finish!:(result:unknown)=>void;
    mocks.query.mockImplementation(async(sql:string)=>sql.includes('app.tvmaze_guest_rate_limit_v1')?new Promise(resolve=>{finish=resolve;}):{rows:[]});
    const pending=search(request());await vi.advanceTimersByTimeAsync(751);expect((await pending).status).toBe(503);
    finish({rows:[{result:allowed}]});await vi.advanceTimersByTimeAsync(1);expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('invalid HMAC keys do not connect or fetch',async()=>{
    vi.stubEnv('RATE_LIMIT_IDENTITY_HMAC_KEY','invalid');
    expect((await search(request())).status).toBe(503);expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('upstream 429 persists cooldown through the same signed guest transport',async()=>{
    mocks.fetch.mockResolvedValue(new Response(null,{status:429,headers:{'Retry-After':'30'}}));
    mocks.query.mockImplementation(async(sql:string,args?:string[])=>({rows:[{result:sql.includes('app.tvmaze_guest_rate_limit_v1')&&JSON.parse(args![0]).operation==='cooldown'?{...allowed,retry_after_seconds:30}:allowed}]}));
    const response=await search(request());expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('30');
    expect(calls().map(([,args])=>JSON.parse(args[0]).operation)).toEqual(['consume','cooldown']);
  });
  it('cooldown failure returns 503',async()=>{
    mocks.query.mockRejectedValue(new Error('offline'));
    expect((await reportProviderCooldown(request(),'tvmaze_search',new Response(null,{status:429})))?.status).toBe(503);
  });
  it('rejects a forged signed envelope/identity before guest SQL',async()=>{
    const envelope={identity_class:'guest_pool',policy_id:'social_read',operation:'consume',ingress:[]};
    await expect(nativeSignedLimiter('consume',signRateLimitEnvelope(envelope,signingKey),{signingKey,audience:'mt:guest-test',keyVersion:'v1'},{kind:'guest_pool',value:TVMAZE_GUEST_POOL})).rejects.toThrow();
    expect(calls()).toHaveLength(0);
    await expect(nativeSignedLimiter('consume',{p_envelope:JSON.stringify(envelope),p_signature_hex:'0'.repeat(64)},{signingKey,audience:'mt:guest-test',keyVersion:'v1'},{kind:'guest_pool',value:TVMAZE_GUEST_POOL})).rejects.toThrow('rate_limit_proof_invalid');
  });
});
