-- Forward only. A row lock, not a JWT claim, serializes admission with erasure.
begin;
create table private_privacy_ops.account_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'ACTIVE' check (state in ('ACTIVE','ERASURE_PENDING','ERASING')),
  destructive_started boolean not null default false,
  erasure_context jsonb not null default '{}'::jsonb,
  last_completed_stage text,
  failed_stage text,
  check (not destructive_started or state='ERASING')
);
alter table private_privacy_ops.account_lifecycle enable row level security;
revoke all on private_privacy_ops.account_lifecycle from public,anon,authenticated,service_role;
insert into private_privacy_ops.account_lifecycle(user_id) select id from auth.users;

create function private_privacy_ops.initialize_account_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  insert into private_privacy_ops.account_lifecycle(user_id) values(new.id);
  return new;
end; $$;
revoke all on function private_privacy_ops.initialize_account_v1() from public,anon,authenticated,service_role;
create trigger privacy_initialize_account after insert on auth.users
for each row execute function private_privacy_ops.initialize_account_v1();

create function private_privacy_ops.assert_account_write_allowed_v1(p_users uuid[]) returns void
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare v_user uuid; v_state text;
begin
  -- Missing lifecycle rows deny old JWTs AFTER Auth deletion as well. SELECT
  -- FOR SHARE sees the committed lock under READ COMMITTED, or raises a
  -- serialization error under an older REPEATABLE READ/SERIALIZABLE snapshot.
  for v_user in select distinct u from unnest(p_users) u where u is not null order by u loop
    select state into v_state from private_privacy_ops.account_lifecycle
      where user_id=v_user for share;
    if not found or v_state<>'ACTIVE' then
      raise exception using errcode='P0001',message='account_write_locked';
    end if;
  end loop;
end; $$;
revoke all on function private_privacy_ops.assert_account_write_allowed_v1(uuid[]) from public,anon,authenticated,service_role;

create function private_privacy_ops.guard_account_mutation_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_row jsonb; v_rows jsonb[]; v_users uuid[]:=array[auth.uid()]; v_key text; v_parent uuid;
begin
  -- SECURITY DEFINER changes current_user, never session_user. No JWT/GUC
  -- unlock switch is accepted. Only a direct postgres ops session bypasses.
  if session_user='postgres' and auth.uid() is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  -- GoTrue Auth-last invokes zero-row FK DELETE statements after verified
  -- application cleanup. Permit ONLY those statements; any leftover account
  -- row still reaches the row trigger and fails closed. This is a database
  -- login identity, never a JWT claim or a web service-role shortcut.
  if session_user='supabase_auth_admin' and auth.uid() is null
    and tg_level='STATEMENT' and tg_op='DELETE' then return null; end if;
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if tg_level='STATEMENT' then
    perform private_privacy_ops.assert_account_write_allowed_v1(v_users);
    return null;
  end if;
  if tg_op='INSERT' then v_rows:=array[to_jsonb(new)];
  elsif tg_op='DELETE' then v_rows:=array[to_jsonb(old)];
  else v_rows:=array[to_jsonb(old),to_jsonb(new)]; end if;
  foreach v_row in array v_rows loop
    foreach v_key in array array['user_id','actor_id','author_id','reporter_id','recipient_id','sender_id','follower_id','following_id','blocker_id','blocked_id'] loop
      if v_row->>v_key is not null then v_users:=array_append(v_users,(v_row->>v_key)::uuid); end if;
    end loop;
    if tg_table_name='profiles' then v_users:=array_append(v_users,(v_row->>'id')::uuid); end if;
    if tg_table_schema='storage' and v_row->>'bucket_id'='profile-assets' then
      v_users:=array_append(v_users,split_part(v_row->>'name','/',1)::uuid);
    end if;
    -- Account participants reachable only through container/event FKs.
    if v_row->>'event_id' is not null and tg_table_name='xp_event_allocations' then
      select user_id into v_parent from public.xp_events where id=(v_row->>'event_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
    if v_row->>'activity_id' is not null then
      select actor_id into v_parent from public.social_activity_events where id=(v_row->>'activity_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
    if coalesce(v_row->>'comment_id',v_row->>'parent_comment_id') is not null then
      select author_id into v_parent from public.social_activity_comments
        where id=coalesce(v_row->>'comment_id',v_row->>'parent_comment_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
    if v_row->>'recommendation_id' is not null then
      select sender_id into v_parent from public.social_recommendations where id=(v_row->>'recommendation_id')::uuid;
      v_users:=array_append(v_users,v_parent);
      select recipient_id into v_parent from public.social_recommendations where id=(v_row->>'recommendation_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
  end loop;
  perform private_privacy_ops.assert_account_write_allowed_v1(v_users);
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function private_privacy_ops.guard_account_mutation_v1() from public,anon,authenticated,service_role;

revoke truncate on public.profiles from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profiles for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profiles for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.media_items from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.media_items for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.media_items for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.progress_logs from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.progress_logs for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.progress_logs for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.recommendation_feedback from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.recommendation_feedback for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.recommendation_feedback for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_username_history from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_username_history for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_username_history for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_modules from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_modules for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_modules for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_media_showcase from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_media_showcase for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_media_showcase for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_stats_snapshots from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_stats_snapshots for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_stats_snapshots for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_progression_snapshots from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_progression_snapshots for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_progression_snapshots for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_shared_notes from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_shared_notes for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_shared_notes for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_follows from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_follows for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_follows for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.profile_blocks from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.profile_blocks for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.profile_blocks for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_activity_preferences from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_activity_preferences for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_activity_preferences for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_activity_events from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_activity_events for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_activity_events for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_activity_comments from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_activity_comments for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_activity_comments for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_reactions from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_reactions for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_reactions for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_recommendations from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_recommendations for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_recommendations for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_recommendation_events from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_recommendation_events for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_recommendation_events for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_recommendation_messages from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_recommendation_messages for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_recommendation_messages for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_notification_preferences from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_notification_preferences for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_notification_preferences for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_notifications from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_notifications for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_notifications for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.social_reports from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.social_reports for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.social_reports for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_events from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_events for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_events for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_event_allocations from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_event_allocations for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_event_allocations for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_user_totals from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_user_totals for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_user_totals for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_user_world_totals from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_user_world_totals for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_user_world_totals for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_user_branch_totals from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_user_branch_totals for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_user_branch_totals for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_legacy_imports from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_legacy_imports for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_legacy_imports for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_user_quest_progress from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_user_quest_progress for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_user_quest_progress for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_user_badges from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_user_badges for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_user_badges for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_media_entitlements from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_media_entitlements for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_media_entitlements for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_local_state_conversions from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_local_state_conversions for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_local_state_conversions for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.user_theme_preferences from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.user_theme_preferences for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.user_theme_preferences for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.goals from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.goals for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.goals for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.cloud_media_sync_operations from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.cloud_media_sync_operations for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.cloud_media_sync_operations for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.goal_sync_operations from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.goal_sync_operations for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.goal_sync_operations for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.embedding_cache from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.embedding_cache for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.embedding_cache for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_quest_definitions from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_quest_definitions for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_quest_definitions for each row execute function private_privacy_ops.guard_account_mutation_v1();
revoke truncate on public.xp_badge_definitions from anon,authenticated;
create trigger a_privacy_statement before insert or update or delete on public.xp_badge_definitions for each statement execute function private_privacy_ops.guard_account_mutation_v1();
create trigger a_privacy_row before insert or update or delete on public.xp_badge_definitions for each row execute function private_privacy_ops.guard_account_mutation_v1();
-- Storage service operations use their separate privileged API. Normal JWT
-- uploads/deletes/overwrites must pass the same barrier, including after Auth removal.
create trigger a_privacy_storage before insert or update or delete on storage.objects
for each row when (auth.uid() is not null)
execute function private_privacy_ops.guard_account_mutation_v1();

create function private_privacy_ops.transition_account_v1(p_user uuid,p_state text,p_confirmation text) returns text
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_row private_privacy_ops.account_lifecycle%rowtype;
begin
  if session_user<>'postgres' or auth.uid() is not null or p_user is null
    or p_confirmation is distinct from 'PRIVACY '||p_user::text then raise exception 'privacy_ops_denied'; end if;
  select * into v_row from private_privacy_ops.account_lifecycle where user_id=p_user for update;
  if not found then raise exception 'privacy_target_absent'; end if;
  if p_state='ACTIVE' then
    if v_row.state<>'ERASURE_PENDING' or v_row.destructive_started then raise exception 'privacy_unlock_denied'; end if;
  elsif p_state='ERASURE_PENDING' then
    -- A retry must never downgrade ERASING or clear destructive_started.
    if v_row.state='ERASING' then return v_row.state; end if;
  elsif p_state='ERASING' then
    if v_row.state not in ('ERASURE_PENDING','ERASING') then raise exception 'privacy_transition_denied'; end if;
  else raise exception 'privacy_transition_denied'; end if;
  update private_privacy_ops.account_lifecycle set state=p_state where user_id=p_user;
  return p_state;
end; $$;
revoke all on function private_privacy_ops.transition_account_v1(uuid,text,text) from public,anon,authenticated,service_role;

-- An own-account assertion only. No target input, no transition or admin power.
create function public.assert_account_write_allowed() returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform private_privacy_ops.assert_account_write_allowed_v1(array[auth.uid()]);
end; $$;
revoke all on function public.assert_account_write_allowed() from public,anon,service_role;
grant execute on function public.assert_account_write_allowed() to authenticated;
commit;
