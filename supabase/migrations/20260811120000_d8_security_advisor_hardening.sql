-- D8-4A.5E: least-privilege closure for the exported Production Security Advisor findings.
-- Apply through the guarded migration ledger only. Production execution belongs to D8-4B.
begin;

alter function public.set_updated_at() set search_path = pg_catalog;
revoke all on function public.set_updated_at() from public,anon,authenticated;

alter table public.embedding_cache enable row level security;
drop policy if exists embedding_cache_select_global on public.embedding_cache;
drop policy if exists embedding_cache_insert_global on public.embedding_cache;
drop policy if exists embedding_cache_update_global on public.embedding_cache;
drop policy if exists embedding_cache_delete_global on public.embedding_cache;
revoke all on table public.embedding_cache from public,anon,authenticated;

-- Start from deny-all for every SECURITY DEFINER name in the Production export.
revoke all on function public.apply_media_item_sync_operation(text,text,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.delete_theme_sync_state() from public,anon,authenticated;
revoke all on function public.get_social_person_summary(uuid) from public,anon,authenticated;
revoke all on function public.get_social_profile(text) from public,anon,authenticated;
revoke all on function public.get_social_recommendation_detail(uuid) from public,anon,authenticated;
revoke all on function public.get_theme_sync_state() from public,anon,authenticated;
revoke all on function public.get_unified_social_profile(text) from public,anon,authenticated;
revoke all on function public.get_xp_dashboard(integer) from public,anon,authenticated;
revoke all on function public.get_xp_public_summary(uuid) from public,anon,authenticated;
revoke all on function public.list_profile_activity(uuid,integer) from public,anon,authenticated;
revoke all on function public.list_social_blocks() from public,anon,authenticated;
revoke all on function public.list_social_connections(uuid,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.list_social_feed(timestamptz,uuid,integer) from public,anon,authenticated;
revoke all on function public.list_social_notifications(timestamptz,uuid,integer) from public,anon,authenticated;
revoke all on function public.list_social_recommendations(text,text,timestamptz,uuid,integer) from public,anon,authenticated;
revoke all on function public.save_theme_sync_state(bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.search_social_profiles(text,integer,integer) from public,anon,authenticated;
revoke all on function public.social_block(uuid) from public,anon,authenticated;
revoke all on function public.social_can_view_activity_row(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.social_can_view_module(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.social_comment(uuid,uuid,text,boolean,text) from public,anon,authenticated;
revoke all on function public.social_comment_action(text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.social_delete_activity(uuid) from public,anon,authenticated;
revoke all on function public.social_ensure_activity_module() from public,anon,authenticated;
revoke all on function public.social_follow(uuid) from public,anon,authenticated;
revoke all on function public.social_follow_action(text,uuid) from public,anon,authenticated;
revoke all on function public.social_get_preferences() from public,anon,authenticated;
revoke all on function public.social_insert_notification(uuid,uuid,text,text,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.social_insert_recommendation_message(uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.social_is_blocked(uuid,uuid) from public,anon,authenticated;
revoke all on function public.social_notification_action(text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.social_notification_allowed(uuid,text) from public,anon,authenticated;
revoke all on function public.social_profile_asset_visible(text,uuid) from public,anon,authenticated;
revoke all on function public.social_profile_asset_visible(text,text,uuid) from public,anon,authenticated;
revoke all on function public.social_publish_activity(text,text,jsonb,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.social_react(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.social_recommendation_transition(uuid,text,text,boolean,text,text) from public,anon,authenticated;
revoke all on function public.social_replace_showcase(text,jsonb) from public,anon,authenticated;
revoke all on function public.social_report(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.social_save_preferences(text,jsonb) from public,anon,authenticated;
revoke all on function public.social_save_profile(text,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.social_send_recommendation(uuid,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.social_send_recommendation_message(uuid,text,text) from public,anon,authenticated;
revoke all on function public.social_share_note(text,text,text,text,text,boolean,text,boolean) from public,anon,authenticated;
revoke all on function public.social_unblock(uuid) from public,anon,authenticated;
revoke all on function public.social_unshare_note(uuid) from public,anon,authenticated;
revoke all on function public.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.xp_apply_event(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.xp_award_recommendation_completion(uuid) from public,anon,authenticated;
revoke all on function public.xp_convert_legacy_local_state(uuid) from public,anon,authenticated;
revoke all on function public.xp_evaluate_quests(uuid) from public,anon,authenticated;
revoke all on function public.xp_profile_entitlement_trigger() from public,anon,authenticated;
revoke all on function public.xp_recommendation_event_trigger() from public,anon,authenticated;
revoke all on function public.xp_recommendation_feedback_trigger() from public,anon,authenticated;
revoke all on function public.xp_reconcile_entitlement(uuid,text,text,boolean,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.xp_reconcile_media_state(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.xp_repair_selected_title(uuid) from public,anon,authenticated;
revoke all on function public.xp_select_badges(text[]) from public,anon,authenticated;
revoke all on function public.xp_select_title(text) from public,anon,authenticated;
revoke all on function public.xp_showcase_trigger() from public,anon,authenticated;
revoke all on function public.xp_sync_media_states(jsonb,boolean) from public,anon,authenticated;

-- PUBLIC_READ: the SQL body enforces public/profile/module visibility.
grant execute on function public.get_social_profile(text) to anon,authenticated;
grant execute on function public.get_unified_social_profile(text) to anon,authenticated;
grant execute on function public.get_xp_public_summary(uuid) to anon,authenticated;
grant execute on function public.list_profile_activity(uuid,integer) to anon,authenticated;
grant execute on function public.list_social_connections(uuid,text,text,integer,integer) to anon,authenticated;
grant execute on function public.search_social_profiles(text,integer,integer) to anon,authenticated;
grant execute on function public.social_profile_asset_visible(text,text,uuid) to anon,authenticated;

-- AUTHENTICATED_READ: private owner/participant state or viewer relationship data.
grant execute on function public.get_social_person_summary(uuid) to authenticated;
grant execute on function public.get_social_recommendation_detail(uuid) to authenticated;
grant execute on function public.get_theme_sync_state() to authenticated;
grant execute on function public.get_xp_dashboard(integer) to authenticated;
grant execute on function public.list_social_blocks() to authenticated;
grant execute on function public.list_social_feed(timestamptz,uuid,integer) to authenticated;
grant execute on function public.list_social_notifications(timestamptz,uuid,integer) to authenticated;
grant execute on function public.list_social_recommendations(text,text,timestamptz,uuid,integer) to authenticated;
grant execute on function public.social_get_preferences() to authenticated;

-- AUTHENTICATED_MUTATION: every entry derives the owner/actor from auth.uid().
grant execute on function public.apply_media_item_sync_operation(text,text,text,bigint,jsonb) to authenticated;
grant execute on function public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb) to authenticated;
grant execute on function public.delete_theme_sync_state() to authenticated;
grant execute on function public.save_theme_sync_state(bigint,jsonb,jsonb) to authenticated;
grant execute on function public.social_block(uuid) to authenticated;
grant execute on function public.social_comment(uuid,uuid,text,boolean,text) to authenticated;
grant execute on function public.social_comment_action(text,uuid,text,boolean) to authenticated;
grant execute on function public.social_delete_activity(uuid) to authenticated;
grant execute on function public.social_follow(uuid) to authenticated;
grant execute on function public.social_follow_action(text,uuid) to authenticated;
grant execute on function public.social_notification_action(text,uuid,text,uuid) to authenticated;
grant execute on function public.social_publish_activity(text,text,jsonb,integer,text,text,text) to authenticated;
grant execute on function public.social_react(uuid,uuid,text) to authenticated;
grant execute on function public.social_recommendation_transition(uuid,text,text,boolean,text,text) to authenticated;
grant execute on function public.social_replace_showcase(text,jsonb) to authenticated;
grant execute on function public.social_report(uuid,uuid,text,text) to authenticated;
grant execute on function public.social_save_preferences(text,jsonb) to authenticated;
grant execute on function public.social_save_profile(text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) to authenticated;
grant execute on function public.social_send_recommendation(uuid,jsonb,text,text) to authenticated;
grant execute on function public.social_send_recommendation_message(uuid,text,text) to authenticated;
grant execute on function public.social_share_note(text,text,text,text,text,boolean,text,boolean) to authenticated;
grant execute on function public.social_unblock(uuid) to authenticated;
grant execute on function public.social_unshare_note(uuid) to authenticated;
grant execute on function public.xp_select_badges(text[]) to authenticated;
grant execute on function public.xp_select_title(text) to authenticated;
grant execute on function public.xp_sync_media_states(jsonb,boolean) to authenticated;

do $d8_security_advisor_postcheck$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='set_updated_at'
      and p.proconfig @> array['search_path=pg_catalog']
  ) then raise exception 'd8_set_updated_at_search_path_not_fixed'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='embedding_cache'
  ) or has_table_privilege('anon','public.embedding_cache','SELECT')
    or has_table_privilege('anon','public.embedding_cache','INSERT')
    or has_table_privilege('anon','public.embedding_cache','UPDATE')
    or has_table_privilege('anon','public.embedding_cache','DELETE')
    or has_table_privilege('authenticated','public.embedding_cache','SELECT')
    or has_table_privilege('authenticated','public.embedding_cache','INSERT')
    or has_table_privilege('authenticated','public.embedding_cache','UPDATE')
    or has_table_privilege('authenticated','public.embedding_cache','DELETE')
  then raise exception 'd8_embedding_cache_user_role_access_present'; end if;

  if has_function_privilege('anon','public.social_block(uuid)','EXECUTE')
    or has_function_privilege('anon','public.xp_sync_media_states(jsonb,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean)','EXECUTE')
    or not has_function_privilege('anon','public.get_unified_social_profile(text)','EXECUTE')
    or not has_function_privilege('authenticated','public.get_theme_sync_state()','EXECUTE')
  then raise exception 'd8_security_definer_grant_matrix_invalid'; end if;
end;
$d8_security_advisor_postcheck$;

commit;
