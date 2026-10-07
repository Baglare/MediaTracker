import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({user:vi.fn(),connect:vi.fn(),query:vi.fn(),release:vi.fn(),supabase:vi.fn()}));
vi.mock('@/lib/auth/current-user',()=>({getCurrentUser:mocks.user}));
vi.mock('@/lib/backend/postgres',()=>({getNativePool:()=>({connect:mocks.connect})}));
vi.mock('@/lib/supabase/server',()=>({getSupabaseServerClient:mocks.supabase}));
import { getApplicationServerClient } from '@/lib/backend/application-server';
import { createNativeDomainClient,executeNativeDomainOperation } from '@/lib/backend/domain-client';
import { withAuthenticatedTransaction,withReadTransaction,type AuthenticatedTransaction } from '@/lib/backend/transaction';
import { nativeSocialSubjects,verifyNativeLimiterEnvelope,nativeSignedLimiter } from '@/lib/backend/limiter';
import { consumeRateLimit } from '@/lib/api/distributed-rate-limit';
import { nativeAssetUrl,deliverNativeAsset,replaceNativeAsset } from '@/lib/backend/filesystem-assets';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('BACKEND_PROVIDER','native');vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER','native');
  mocks.user.mockResolvedValue({id:owner,email:'a@example.invalid'});
  mocks.query.mockResolvedValue({rows:[{result:{ok:true}}],rowCount:1});
  mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});
});
afterEach(()=>vi.unstubAllEnvs());
it('selects native without constructing any Supabase transport',async()=>{
  const client=await getApplicationServerClient();await client!.auth.getUser();await client!.rpc('social_follow',{p_target:other});
  expect(mocks.supabase).not.toHaveBeenCalled();
  expect(mocks.query).toHaveBeenCalledWith('SELECT app.social_follow(p_target => $1::uuid) AS result',[other]);
  expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('app.user_id', $1, true)",[owner]);
});
it('preserves fallback selection without opening native PostgreSQL',async()=>{
  vi.stubEnv('BACKEND_PROVIDER','supabase');vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER','supabase');mocks.supabase.mockResolvedValue({marker:'fallback'});
  expect(await getApplicationServerClient()).toEqual({marker:'fallback'});expect(mocks.connect).not.toHaveBeenCalled();
});
it.each([
  ['social_follow',{p_target:other}],['social_follow_action',{p_action:'accept',p_other:other}],
  ['social_follow_action',{p_action:'reject',p_other:other}],['social_unblock',{p_target:other}],['social_block',{p_target:other}],
  ['social_comment',{p_activity:other,p_parent:null,p_body:'Synthetic',p_spoiler:false,p_dedupe_key:'op-1'}],
  ['social_react',{p_activity:other,p_comment:null,p_reaction:'like'}],
  ['social_notification_action',{p_action:'read_all',p_notification:null,p_entity_type:null,p_entity_id:null}],
  ['social_report',{p_activity:other,p_comment:null,p_category:'spam',p_note:null}],
  ['get_social_recommendation_detail',{p_recommendation:other}],
  ['xp_sync_media_states',{p_items:[],p_replace:true}],['xp_select_title',{p_title:'Synthetic'}],
  ['xp_select_badges',{p_badge_keys:['synthetic']}],['save_theme_sync_state',{p_expected_revision:3,p_active_theme_selection:{},p_custom_themes:[]}],
  ['social_save_preferences',{p_kind:'activity',p_values:{}}],
] as [string,Record<string,unknown>][])('dispatches %s through verified identity and a fixed parameterized contract',async(name,args)=>{
  await withAuthenticatedTransaction(tx=>executeNativeDomainOperation(tx,name,args));
  expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith(`SELECT app.${name}(`))).toBe(true);
  expect(mocks.query.mock.calls.at(-1)).toEqual(['COMMIT']);expect(mocks.supabase).not.toHaveBeenCalled();
});
it.each(['pg_sleep','native_privacy_cleanup','xp_award_event','social_insert_notification','social_follow);DROP TABLE app.profiles;--'])('denies unregistered/internal RPC %s',async name=>{
  const result=await createNativeDomainClient().rpc(name,{});expect(result.error?.message).toBe('database_operation_failed');
  expect(mocks.query.mock.calls.some(([sql])=>sql.includes(`app.${name}(`))).toBe(false);
});
it('denies submitted viewer identity and missing required arguments',async()=>{
  for(const args of [{p_target:other,p_user:other},{p_target:other,p_viewer:other},{}]) {
    const result=await createNativeDomainClient().rpc('social_follow',args);expect(result.error).toBeTruthy();
  }
});
it('denies forged transaction objects',async()=>{
  await expect(executeNativeDomainOperation({userId:owner,query:mocks.query} as AuthenticatedTransaction,'social_follow',{p_target:other})).rejects.toThrow('transaction_context_required');
  expect(mocks.query).not.toHaveBeenCalled();
});
it('binds anonymous public reads to empty identity and never to a resource owner',async()=>{
  mocks.user.mockResolvedValue(null);await withReadTransaction(tx=>executeNativeDomainOperation(tx,'get_unified_social_profile',{p_username:'synthetic'}));
  expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('app.user_id', $1, true)",['']);
  await expect(withAuthenticatedTransaction(async()=>{})).rejects.toThrow('authentication_required');
});
it('rejects cross-owner direct reads before a table statement',async()=>{
  const result=await createNativeDomainClient().from('profiles').select('username').eq('id',other).maybeSingle();
  expect(result.error).toBeTruthy();expect(mocks.query.mock.calls.some(([sql])=>sql.includes('FROM app.profiles'))).toBe(false);
});
it('rejects unsafe table/column syntax and arbitrary update access',()=>{
  const client=createNativeDomainClient();expect(()=>client.from('xp_events')).toThrow('operation_denied');
  expect(()=>client.from('profiles').select('password')).toThrow('operation_invalid');
  expect(()=>client.from('profiles').select('id;DROP TABLE app.profiles')).toThrow('operation_invalid');
  expect(()=>client.from('profiles').upsert({id:owner})).toThrow('operation_denied');
});
it('denies owner-spoofed module writes before INSERT',async()=>{
  const result=await createNativeDomainClient().from('profile_modules').upsert({user_id:other,module_key:'stats',enabled:true},{onConflict:'user_id,module_key'});
  expect(result.error).toBeTruthy();expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('returns lifecycle denial without leaking SQL diagnostics',async()=>{
  mocks.query.mockImplementation(async(sql:string)=>{if(sql.startsWith('SELECT app.social_follow'))throw new Error('account_write_locked');return {rows:[]};});
  const result=await createNativeDomainClient().rpc('social_follow',{p_target:other});expect(result.error?.message).toBe('account_write_locked');expect(mocks.release).toHaveBeenCalledWith(true);
});
it('HMAC pseudonyms are deterministic by owner/scope/epoch and contain no plaintext identity',()=>{
  const env={RATE_LIMIT_IDENTITY_HMAC_KEY:'a'.repeat(32),RATE_LIMIT_RPC_AUDIENCE:'native-test'};
  const a=nativeSocialSubjects(owner,env,120000),b=nativeSocialSubjects(other,env,120000);
  expect(a).toEqual(nativeSocialSubjects(owner,env,120000));expect(a).not.toEqual(b);expect(JSON.stringify(a)).not.toContain(owner);expect(a?.[0].digest).toMatch(/^[a-f0-9]{64}$/);
  expect(nativeSocialSubjects(owner,{},120000)).toBeNull();
});
it('verifies HMAC without sending a secret to SQL and rejects altered signatures',()=>{
  const key='a'.repeat(32),text='{"nonce":"synthetic"}',signature=createHmac('sha256',key).update(text).digest('hex');
  expect(verifyNativeLimiterEnvelope(text,signature,key)).toBe(true);expect(verifyNativeLimiterEnvelope(text+' ',signature,key)).toBe(false);expect(verifyNativeLimiterEnvelope(text,'bad',key)).toBe(false);
});
it('native production fails closed without trusted ingress even for an authenticated owner',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('TRUSTED_INGRESS_MODE','passenger');
  const result=await consumeRateLimit(new Request('https://app.example.invalid',{headers:{'x-forwarded-for':'192.0.2.1'}}),'social_write');
  expect(result).toMatchObject({allowed:false,source:'unavailable'});expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.supabase).not.toHaveBeenCalled();
});
it('limiter uses persistent SQL authority for cooldown and receipt replay decisions',async()=>{
  const config={signingKey:'s'.repeat(32),audience:'native-test',keyVersion:'v1'},text='{}',signature=createHmac('sha256',config.signingKey).update(text).digest('hex');
  mocks.query.mockResolvedValue({rows:[{result:{allowed:false,reason:'replay',retry_after_seconds:5}}]});
  expect(await nativeSignedLimiter('cooldown',{p_envelope:text,p_signature_hex:signature},config,{kind:'user',value:owner})).toMatchObject({reason:'replay'});
  expect(mocks.query).toHaveBeenCalledWith('SELECT app.report_provider_cooldown_v1($1::text,$2::text) AS result',[text,signature]);
  expect(mocks.query.mock.calls.flat(3)).not.toContain(config.signingKey);
});
it('asset URL and delivery fail closed for invisible/stale/blocked assets',async()=>{
  mocks.query.mockResolvedValue({rows:[{result:null}]});
  const key=`${owner}/avatar/${other}.png`;
  await expect(nativeAssetUrl(key)).rejects.toThrow();await expect(deliverNativeAsset(key)).rejects.toThrow();
  expect(mocks.supabase).not.toHaveBeenCalled();
});
it('denies upload admission before creating a file intent',async()=>{
  vi.stubEnv('NATIVE_STORAGE_ROOT',join(tmpdir(),'mt-synthetic-assets'));
  mocks.query.mockImplementation(async(sql:string)=>{if(sql.includes('assert_account_write_allowed'))throw new Error('account_write_locked');return {rows:[]};});
  await expect(replaceNativeAsset('avatar',new File([new Uint8Array(12)],'avatar.png',{type:'image/png'}))).rejects.toThrow('account_write_locked');
  expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
