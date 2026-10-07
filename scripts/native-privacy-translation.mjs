// Offline compiler of the CURRENT hardened privacy SQL, never remote history.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cleanupSql, captureContextSql, inspectSql } from './privacy-account-sql.mjs';
import { domains } from './privacy-account-model.mjs';
import { translateDomainSql } from './native-domain-translation.mjs';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const read=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const fn=(sql,name)=>{const result=sql.match(new RegExp(`create (?:or replace )?function ${name.replaceAll('.','\\.')}\\([\\s\\S]*?\\$\\$;`,'i'));if(!result)throw new Error(name);return result[0];};
const operator="session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL";
export function translateNativePrivacy(sql) {
  return translateDomainSql(sql).replaceAll('private_privacy_ops.account_lifecycle','app.account_lifecycle')
    .replaceAll("current_user='postgres'", "current_user='mt_owner'")
    .replaceAll("session_user='postgres'",`(${operator})`)
    .replaceAll("session_user<>'postgres'",`NOT (${operator})`)
    .replaceAll("tg_table_schema='public'","tg_table_schema='app'")
    .replaceAll("TG_TABLE_SCHEMA='public'","TG_TABLE_SCHEMA='app'")
    .replace(/,service_role/g,'').replace(/owner to postgres/gi,'owner to mt_owner');
}
export function compileNativePrivacy() {
  const admission=read('20261005130000_account_privacy_write_barrier.sql');
  let guard=fn(admission,'private_privacy_ops.guard_account_mutation_v1');
  guard=guard.replace(/  if session_user='supabase_auth_admin'[\s\S]*?then return null; end if;/,'');
  guard=guard.replace(/    if tg_table_schema='storage'[\s\S]*?end if;/,'');
  let sql=`BEGIN;
SET LOCAL ROLE mt_auth_owner;
GRANT SELECT,DELETE ON native_auth."user" TO mt_owner;
GRANT UPDATE(id) ON native_auth."user" TO mt_owner;
GRANT DELETE ON native_auth.verification TO mt_owner;
GRANT SELECT(identifier,value) ON native_auth.verification TO mt_owner;
GRANT SELECT("userId") ON native_auth.session TO mt_owner;
RESET ROLE;
CREATE SCHEMA private_privacy_ops AUTHORIZATION mt_owner;
SET LOCAL ROLE mt_owner;
REVOKE ALL ON SCHEMA private_privacy_ops FROM PUBLIC,mt_runtime;
ALTER TABLE app.account_lifecycle ADD COLUMN last_completed_stage text;
ALTER TABLE app.account_lifecycle ADD COLUMN failed_stage text;
ALTER TABLE app.account_lifecycle ADD COLUMN filesystem_clean boolean NOT NULL DEFAULT false;
`;
  const xp=read('20261005120000_privacy_xp_ops_cleanup.sql');
  sql+=translateNativePrivacy(xp.slice(xp.indexOf('create table if not exists'),xp.lastIndexOf('commit;')))+'\n';
  const detach=read('20261005140000_privacy_participant_detachment.sql');
  sql+=translateNativePrivacy(detach.replace(/^begin;|^commit;$/gm,''))+'\n';
  let nativeAdmission=readFileSync(new URL('../database/native/003_account_admission.sql',import.meta.url),'utf8');
  let assertion=fn(nativeAdmission,'app.assert_account_write').replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
  assertion=assertion.replace('  PERFORM app.assert_release_write();',`  PERFORM app.assert_release_write();\n  IF ${operator} THEN RETURN; END IF;`);
  sql+=assertion+'\n';
  sql+=`CREATE FUNCTION private_privacy_ops.assert_account_write_allowed_v1(p_users uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM app.assert_account_write(p_users); END; $$;\n`;
  sql+=translateNativePrivacy(guard)+'\n'+translateNativePrivacy(fn(admission,'public.assert_account_write_allowed'))+'\n';
  sql+='GRANT EXECUTE ON FUNCTION app.assert_account_write_allowed() TO mt_runtime;\n';
  for(const table of Object.keys(domains).filter(t=>!['media_items','progress_logs','goals','cloud_media_sync_operations','goal_sync_operations'].includes(t))) {
    sql+=`CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.${table} FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.${table} FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();\n`;
  }
  for(const t of ['xp_cleanup_context','xp_detach_context']) sql+=`ALTER TABLE private_privacy_ops.${t} FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_internal ON private_privacy_ops.${t} TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');\n`;
  const parameterize=source=>translateNativePrivacy(source).replaceAll(`'${user}'::uuid`,'p_user').replaceAll(`'ERASE XP ${user}'`,"'ERASE XP '||p_user::text");
  let inspect=parameterize(inspectSql(user)).replace(/^begin isolation level repeatable read read only;/,'').replace(/commit;\s*$/,'');
  inspect=inspect.replace(/'created_at',created_at,'email_confirmed_at',email_confirmed_at,'last_sign_in_at',last_sign_in_at/,`'created_at',"createdAt",'email_confirmed_at',CASE WHEN "emailVerified" THEN "createdAt" ELSE NULL END`);
  inspect=inspect.replace(/'assets',\(select[\s\S]*?from storage\.objects[\s\S]*?\)\)\);/,`'assets',(select coalesce(jsonb_agg(jsonb_build_object('bucket','profile-assets','name',file_key,'ownerId',user_id,'mimeType',mime,'size',size)),'[]'::jsonb) from app.native_asset_objects where user_id=p_user));`);
  const select=inspect.trim().replace(/;$/,'');
  sql+=`CREATE FUNCTION app.native_privacy_inspect(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (${operator}) THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
RETURN (${select}); END; $$;\n`;
  let cleanup=parameterize(cleanupSql(user)).replace(/^begin;|commit;\s*$/g,'').replace(/do \$\$ begin[\s\S]*?end \$\$;/,'');
  cleanup=cleanup.replace(/select private_privacy_ops\./g,'PERFORM private_privacy_ops.');
  sql+=`CREATE FUNCTION app.native_privacy_cleanup(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (${operator}) OR NOT EXISTS(SELECT FROM app.account_lifecycle WHERE user_id=p_user AND state='ERASING') THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
${parameterize(captureContextSql(user))}
${cleanup}
UPDATE app.native_asset_objects SET state='cleanup' WHERE user_id=p_user AND state<>'staging';
END; $$;\n`;
  // Owner export query uses explicit columns; the server additionally sanitizes nested user metadata.
  const categories=Object.entries(domains).map(([table,contract])=>{
    let scope=contract.columns.map(col=>`r.${col}=p_user`).join(' OR ');
    if(table==='xp_event_allocations')scope='r.event_id IN (SELECT id FROM app.xp_events WHERE user_id=p_user)';
    if(['social_recommendation_events','social_recommendation_messages'].includes(table))scope="r.recommendation_id IN (SELECT id FROM app.social_recommendations WHERE p_user IN(sender_id,recipient_id))"+(table.endsWith('messages')?' AND (r.author_id=p_user OR r.deleted_at IS NULL)':'');
    return `'${table}',(SELECT coalesce(jsonb_agg(jsonb_build_object(${contract.fields.map(f=>`'${f}',r.${f}`).join(',')})),'[]'::jsonb) FROM app.${table} r WHERE ${scope})`;
  });
  sql+=`CREATE FUNCTION app.native_account_export_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE p_user uuid:=app.current_user_id(); BEGIN
IF p_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
RETURN jsonb_build_object('schemaVersion',1,'synthetic',false,
'auth',(SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'created_at',"createdAt")) FROM native_auth."user" WHERE id=p_user),
'tables',jsonb_build_object(${categories.join(',')},'embedding_cache','[]'::jsonb,'xp_quest_definitions','[]'::jsonb,'xp_badge_definitions','[]'::jsonb),
'assets',(SELECT coalesce(jsonb_agg(jsonb_build_object('bucket','profile-assets','name',file_key,'ownerId',user_id,'mimeType',mime,'size',size)),'[]'::jsonb) FROM app.native_asset_objects WHERE user_id=p_user AND state='published'));
END; $$;
GRANT EXECUTE ON FUNCTION app.native_account_export_snapshot() TO mt_runtime;
CREATE FUNCTION app.native_privacy_finish(p_user uuid,p_confirmation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_snapshot jsonb; v_entry record; BEGIN
IF NOT (${operator}) OR p_confirmation IS DISTINCT FROM 'ERASE ACCOUNT '||p_user::text OR NOT EXISTS(SELECT FROM app.account_lifecycle WHERE user_id=p_user AND state='ERASING' AND destructive_started AND filesystem_clean) THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
v_snapshot:=app.native_privacy_inspect(p_user);
IF jsonb_array_length(v_snapshot->'assets')<>0 OR jsonb_array_length(v_snapshot->'scopedResiduals')<>0 THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
${Object.entries(domains).filter(([t])=>t!=='xp_event_allocations').map(([t,c])=>`IF EXISTS(SELECT FROM app.${t} WHERE ${c.columns.map(col=>`${col}=p_user`).join(' OR ')}) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;`).join('\n')}
IF EXISTS(SELECT FROM app.profile_blocks WHERE blocked_id=p_user) OR EXISTS(SELECT FROM app.social_notifications WHERE actor_id=p_user OR entity_id=p_user) OR EXISTS(SELECT FROM native_auth.session WHERE "userId"=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
DELETE FROM native_auth.verification WHERE identifier=(SELECT email FROM native_auth."user" WHERE id=p_user) OR identifier=p_user::text OR value=p_user::text;
DELETE FROM native_auth."user" WHERE id=p_user;
END; $$;
CREATE FUNCTION app.native_privacy_filesystem_verified(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (${operator}) OR EXISTS(SELECT FROM app.native_asset_objects WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_storage_remaining'; END IF;
UPDATE app.account_lifecycle SET filesystem_clean=true WHERE user_id=p_user AND state='ERASING' AND destructive_started;
IF NOT FOUND THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
END; $$;
CREATE FUNCTION app.native_privacy_record_stage(p_user uuid,p_stage text,p_pass boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (${operator}) OR p_stage NOT IN('lock-pending','write-denial-verify','lock-erasing','application-cleanup','storage-remove','storage-verify','application-verify','barrier-verify','auth-delete','verify') OR p_pass IS NULL THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
UPDATE app.account_lifecycle SET last_completed_stage=CASE WHEN p_pass THEN p_stage ELSE last_completed_stage END,failed_stage=CASE WHEN p_pass THEN NULL ELSE p_stage END WHERE user_id=p_user;
END; $$;
GRANT EXECUTE ON FUNCTION app.native_privacy_inspect(uuid),app.native_privacy_cleanup(uuid),app.native_privacy_finish(uuid,text),app.native_privacy_filesystem_verified(uuid),app.native_privacy_record_stage(uuid,text,boolean) TO mt_privacy_operator;
RESET ROLE;
COMMIT;\n`;
  if(/\b(?:auth\.|storage\.|vault\.|service_role\b|postgres\b)/.test(sql.replace(/--[^\n]*/g,'')))throw new Error('native_privacy_external_dependency');
  return sql;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.length!==2)throw new Error('native_privacy_no_target');
  writeFileSync(new URL('../database/native/008_privacy_lifecycle.sql',import.meta.url),compileNativePrivacy());
}
