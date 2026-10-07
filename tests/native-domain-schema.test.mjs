import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileNativeDomains,translateDomainSql,domainSources } from '../scripts/native-domain-translation.mjs';
import { compileNativePrivacy } from '../scripts/native-privacy-translation.mjs';
import { domains } from '../lib/privacy/account-export.mjs';
const read=p=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const sql=read('database/native/005_social_xp_themes.sql'),limiter=read('database/native/006_distributed_limiter.sql'),privacy=read('database/native/008_privacy_lifecycle.sql'),assets=read('database/native/007_filesystem_assets.sql');
test('domain and privacy artifacts reproduce the current local source exactly',()=>{
  assert.equal(sql,compileNativeDomains());assert.equal(privacy,compileNativePrivacy());
});
test('every account category has a native table and retains FORCE RLS or explicit private authority',()=>{
  const all=[read('database/native/004_cloud_goals.sql'),sql].join('\n');
  for(const table of Object.keys(domains)) {
    assert.match(all,new RegExp(`create table (?:if not exists )?app\\.${table}\\b`,'i'),table);
    assert.match(all,new RegExp(`ALTER TABLE app\\.${table} FORCE ROW LEVEL SECURITY`,'i'),table);
  }
});
test('final Social, XP and theme function bodies preserve effective business SQL',()=>{
  const latest=new Map();
  for(const file of domainSources)for(const fn of read(`supabase/migrations/${file}`).matchAll(/create (?:or replace )?function public\.(\w+)\([\s\S]*?\$\$;/gi))latest.set(fn[1],translateDomainSql(fn[0]));
  for(const name of ['social_save_unified_profile','social_follow','social_follow_action','social_block','social_unblock','list_social_connections','list_social_feed','social_comment','social_react','social_report','get_social_recommendation_detail','social_recommendation_transition','social_notification_action','xp_sync_media_states','xp_reconcile_entitlement','xp_reconcile_media_state','xp_select_title','save_theme_sync_state','get_theme_sync_state']) {
    if(!latest.has(name))throw new Error(`Missing function ${name}`);
    assert.ok(sql.includes(latest.get(name)),`${name}: source contract drift`);
  }
});
test('limiter reserve preserves the live-discovered alias repair and atomic budgets',()=>{
  const source=read('supabase/migrations/20261004124000_application_rate_limit_reserve_alias_fix_v1.sql');
  const fn=source.match(/create or replace function private_rate_limit\.reserve_v1\([\s\S]*?\$\$;/i)[0];
  assert.ok(limiter.includes(fn));assert.match(limiter,/subject_row\(value\)/);
  for(const contract of ['pg_advisory_xact_lock','request_receipts','hard_cap','blocked_until','tokens','refill_rate','replay','cleanup_v1'])assert.ok(limiter.includes(contract));
  assert.doesNotMatch(limiter.replace(/--[^\n]*/g,''),/vault\.|extensions\.|selected_secrets|decrypted_secret|hmac\(/);
});
test('runtime cannot acquire operator/limiter membership or retrieve secret material',()=>{
  for(const source of [sql,limiter,privacy,assets])assert.doesNotMatch(source,/GRANT\s+(?:mt_owner|mt_privacy_operator|mt_limiter)\s+TO\s+mt_runtime/i);
  assert.doesNotMatch(privacy,/GRANT EXECUTE ON FUNCTION app\.native_privacy_[^;]*TO mt_runtime/i);
  assert.match(limiter,/REVOKE ALL ON private_rate_limit\.request_receipts FROM PUBLIC,mt_runtime/);
});
test('participant barriers cover every newly translated mutable account table',()=>{
  for(const t of Object.keys(domains).filter(t=>!['media_items','progress_logs','goals','cloud_media_sync_operations','goal_sync_operations'].includes(t))) {
    assert.match(privacy,new RegExp(`a_privacy_row[^;]*ON app\\.${t} `,'i'),t);
    assert.match(privacy,new RegExp(`a_privacy_statement[^;]*ON app\\.${t} `,'i'),t);
  }
  for(const owner of ['actor_id','author_id','reporter_id','recipient_id','sender_id','follower_id','following_id','blocker_id','blocked_id'])assert.ok(privacy.includes(`'${owner}'`));
  assert.match(privacy,/FOR SHARE/);assert.match(privacy,/state<>'ACTIVE'/);
});
test('privacy keeps corrected detached activity, replies, XP context and Auth-last residual gates',()=>{
  for(const value of ['privacy-detached-activity:','canonicalKey','Silinen hesaba verilen yanıt.','xp_detach_context','xp_cleanup_context','xp_event_immutable','set constraints app.xp_showcase_reconcile,app.xp_shared_review_reconcile immediate','filesystem_clean','privacy_residual_before_auth'])assert.ok(privacy.includes(value));
  const finish=privacy.slice(privacy.indexOf('CREATE FUNCTION app.native_privacy_finish'),privacy.indexOf('CREATE FUNCTION app.native_privacy_filesystem_verified'));
  assert.ok(finish.indexOf('privacy_residual_before_auth')<finish.indexOf('DELETE FROM native_auth."user"'));
  assert.doesNotMatch(privacy,/disable trigger|session_replication_role/i);
});
test('asset delivery checks live reference and visibility; durable cleanup survives auth deletion',()=>{
  assert.match(assets,/p_key IN\(p.avatar_path,p.banner_path\)/);assert.match(assets,/social_profile_asset_visible/);
  assert.match(assets,/native_asset_cleanup_candidates/);assert.match(assets,/NOT EXISTS\(SELECT FROM app.profiles/);
  const table=assets.slice(assets.indexOf('CREATE TABLE'),assets.indexOf('ALTER TABLE'));
  assert.doesNotMatch(table,/REFERENCES native_auth/);assert.match(table,/state IN \('staging','published','cleanup'\)/);
});
test('new native migrations have no managed Supabase transport/schema/role dependency',()=>{
  for(const source of [sql,limiter,privacy,assets])assert.doesNotMatch(source.replace(/--[^\n]*/g,''),/\b(?:auth\.uid|auth\.users|storage\.|vault\.|service_role|authenticated|anon)\b/);
});
