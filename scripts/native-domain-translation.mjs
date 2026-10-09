// Offline source compiler. Outputs a separate fresh-native bootstrap; never connects.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const domainSources = [
  '20260721110000_social_profile_foundation.sql',
  '20260721120000_social_profile_live_smoke_fixes.sql',
  '20260721121000_social_profile_protected_visibility_fix_v2.sql',
  '20260721130000_social_interactions_recommendations.sql',
  '20260721133000_recommendation_feedback_notification_ux.sql',
  '20260721134500_recommendation_listing_regression_fix.sql',
  '20260721140000_xp_v2_progression.sql',
  '20260721143000_xp_reversible_local_state.sql',
  '20260722110000_unified_profile_presentation.sql',
  '20260722120000_profile_image_transforms.sql',
  '20260722130000_theme_cloud_sync.sql',
  '20260809120000_d8_public_profile_theme.sql',
  '20260810120000_d8_profile_asset_visibility_hardening.sql',
  '20260811120000_d8_security_advisor_hardening.sql',
];
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url),'utf8').replace(/\r\n/g,'\n');
export function translateDomainSql(sql) {
  return sql.replace(/auth\.uid\(\)/g,'app.current_user_id()')
    .replace(/auth\.users/g,'native_auth."user"').replace(/public\./g,'app.')
    .replace(/search_path\s*=\s*public,\s*pg_temp/gi,'search_path=pg_catalog,app,pg_temp')
    .replace(/\banon\s*,\s*authenticated\b/g,'mt_runtime')
    .replace(/\bauthenticated\b/g,'mt_runtime').replace(/\banon\b/g,'mt_runtime');
}
export function compileNativeDomains() {
  const baseline = read('20260721100000_core_cloud_baseline.sql');
  const profile = baseline.match(/create table public\.profiles \([\s\S]*?\n\);/i)[0];
  const feedback = baseline.match(/create table public\.recommendation_feedback \([\s\S]*?\n\);/i)[0];
  let sql = `-- P2B fresh native domain bootstrap. Historical migrations are never executed by native runtime.
BEGIN;
SET LOCAL ROLE mt_owner;
${translateDomainSql(profile)}
${translateDomainSql(feedback)}
CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON app.profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON app.profiles FOR SELECT TO mt_runtime USING(id=app.current_user_id());
CREATE POLICY profiles_update_own ON app.profiles FOR UPDATE TO mt_runtime USING(id=app.current_user_id()) WITH CHECK(id=app.current_user_id());
`;
  for (const name of domainSources) {
    let source = read(name);
    if(name==='20260721110000_social_profile_foundation.sql') source=source.slice(0,source.indexOf('insert into storage.buckets'));
    if(name==='20260810120000_d8_profile_asset_visibility_hardening.sql') source=source.slice(0,source.indexOf('drop policy if exists profile_assets_select_visible'));
    if(name==='20260811120000_d8_security_advisor_hardening.sql') {
      // embedding cache is disabled and has no native web grants. Cloud grants already live in 004.
      source=source.replace(/(?:alter table|drop policy|revoke all on table)[^;]*embedding_cache[^;]*;/gi,'')
        .replace(/(?:revoke|grant)[^;]*apply_(?:media_item|progress_log)_sync_operation[^;]*;/gi,'');
      source=source.replace(/n\.nspname='public'/g,"n.nspname='app'");
      const cacheCheckStart=source.indexOf('  if exists (\n    select 1 from pg_policies');
      const grantCheckStart=source.indexOf("  if has_function_privilege('anon'");
      if(cacheCheckStart<0 || grantCheckStart<cacheCheckStart)throw new Error('native_security_postcheck_shape_changed');
      // Native has no anonymous database login/transport and no embedding-cache table.
      // The one trusted runtime checks verified identity inside every business function.
      source=source.slice(0,cacheCheckStart)+`  if to_regclass('app.embedding_cache') is not null then raise exception 'native_dormant_cache_unexpected'; end if;\n\n`+source.slice(grantCheckStart);
      source=source.replace("has_function_privilege('anon','public.social_block(uuid)','EXECUTE')","not has_function_privilege('authenticated','public.social_block(uuid)','EXECUTE')")
        .replace("has_function_privilege('anon','public.xp_sync_media_states(jsonb,boolean)','EXECUTE')","not has_function_privilege('authenticated','public.xp_sync_media_states(jsonb,boolean)','EXECUTE')");
    }
    source=source.replace(/^\s*(?:begin|commit);\s*$/gmi,'');
    sql+=`\n-- Source ${name} sha256 ${createHash('sha256').update(read(name)).digest('hex')}\n${translateDomainSql(source)}\n`;
  }
  const tables=[...new Set([...sql.matchAll(/create table (?:if not exists )?app\.(\w+)/gi)].map(m=>m[1]))];
  // SECURITY DEFINER owner reproduces original owner-authority only inside functions.
  // FORCE RLS remains effective for runtime; mt_owner is NOLOGIN and not granted to runtime.
  for(const table of tables) sql+=`ALTER TABLE app.${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.${table} TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');\n`;
  const reads=['profiles','profile_modules','profile_media_showcase','profile_shared_notes','social_activity_preferences','social_notification_preferences'];
  for(const table of reads) sql+=`GRANT SELECT ON app.${table} TO mt_runtime;\n`;
  for(const table of ['profile_modules','profile_stats_snapshots','profile_progression_snapshots']) sql+=`GRANT SELECT,INSERT,UPDATE ON app.${table} TO mt_runtime;\n`;
  sql+='RESET ROLE;\nCOMMIT;\n';
  if(/\b(?:auth\.|storage\.|vault\.|service_role\b)/.test(sql.replace(/--[^\n]*/g,''))) throw new Error('native_translation_external_dependency');
  return sql;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.length!==2) throw new Error('native_translation_no_target');
  writeFileSync(new URL('../database/native/005_social_xp_themes.sql',import.meta.url),compileNativeDomains());
}
