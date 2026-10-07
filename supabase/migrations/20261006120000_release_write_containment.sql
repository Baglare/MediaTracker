-- Forward only. No hosted application in this source-remediation phase.
begin;
-- Drain concurrent Auth inserts, then repair only absent rows. The installed
-- AFTER INSERT initializer handles accounts created after this lock is released.
lock table auth.users in share row exclusive mode;
insert into private_privacy_ops.account_lifecycle(user_id)
select u.id from auth.users u
where not exists(select 1 from private_privacy_ops.account_lifecycle l where l.user_id=u.id)
on conflict(user_id) do nothing;

create table private_privacy_ops.release_write_state (
  singleton boolean primary key default true check(singleton),
  frozen boolean not null default false,
  revision bigint not null default 0 check(revision>=0)
);
insert into private_privacy_ops.release_write_state(singleton) values(true);
alter table private_privacy_ops.release_write_state enable row level security;
revoke all on private_privacy_ops.release_write_state from public,anon,authenticated,service_role;

create function private_privacy_ops.assert_release_write_allowed_v1() returns void
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare v_frozen boolean;
begin
  -- Held until transaction end. Turning freeze ON drains admitted writers;
  -- a stale transaction snapshot raises a serialization error, never unlocks.
  select frozen into v_frozen from private_privacy_ops.release_write_state
    where singleton for share;
  if not found or v_frozen then
    raise exception using errcode='P0001',message='account_write_locked';
  end if;
end; $$;
revoke all on function private_privacy_ops.assert_release_write_allowed_v1() from public,anon,authenticated,service_role;

create function private_privacy_ops.guard_release_mutation_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  -- This precedes existing postgres/Auth/service bypasses. Even ops erasure
  -- and data-changing migration SQL must wait for deliberate unfreeze.
  if tg_table_schema='storage' then
    if tg_op='INSERT' and new.bucket_id<>'profile-assets' then return new; end if;
    if tg_op='DELETE' and old.bucket_id<>'profile-assets' then return old; end if;
    if tg_op='UPDATE' and new.bucket_id<>'profile-assets' and old.bucket_id<>'profile-assets' then return new; end if;
  end if;
  perform private_privacy_ops.assert_release_write_allowed_v1();
  if tg_level='STATEMENT' then return null; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function private_privacy_ops.guard_release_mutation_v1() from public,anon,authenticated,service_role;

-- All current application tables, including direct RPC/table and definition
-- paths. No route/client switch, JWT, role or session GUC can bypass this gate.
create trigger a_release_write before insert or update or delete or truncate on public.cloud_media_sync_operations
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.embedding_cache
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.goal_sync_operations
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.goals
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.media_items
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_blocks
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_follows
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_media_showcase
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_modules
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_progression_snapshots
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_shared_notes
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_stats_snapshots
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profile_username_history
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.profiles
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.progress_logs
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.recommendation_feedback
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_activity_comments
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_activity_events
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_activity_preferences
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_notification_preferences
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_notifications
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_reactions
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_recommendation_events
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_recommendation_messages
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_recommendations
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.social_reports
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.user_theme_preferences
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_badge_definitions
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_event_allocations
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_events
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_legacy_imports
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_local_state_conversions
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_media_entitlements
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_quest_definitions
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_user_badges
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_user_branch_totals
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_user_quest_progress
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_user_totals
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on public.xp_user_world_totals
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on private_privacy_ops.account_lifecycle
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on private_privacy_ops.xp_cleanup_context
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_write before insert or update or delete or truncate on private_privacy_ops.xp_detach_context
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_auth before insert or update or delete or truncate on auth.users
for each statement execute function private_privacy_ops.guard_release_mutation_v1();
-- No WHEN auth.uid() shortcut: managed Storage writes also encounter the gate.
create trigger a_release_storage before insert or update or delete on storage.objects
for each row
execute function private_privacy_ops.guard_release_mutation_v1();
create trigger a_release_storage_truncate before truncate on storage.objects
for each statement execute function private_privacy_ops.guard_release_mutation_v1();

create or replace function private_privacy_ops.assert_account_write_allowed_v1(p_users uuid[]) returns void
language plpgsql volatile security definer set search_path=pg_catalog,pg_temp as $$
declare v_user uuid; v_state text;
begin
  perform private_privacy_ops.assert_release_write_allowed_v1();
  for v_user in select distinct u from unnest(p_users) u where u is not null order by u loop
    select state into v_state from private_privacy_ops.account_lifecycle where user_id=v_user for share;
    if not found or v_state<>'ACTIVE' then
      raise exception using errcode='P0001',message='account_write_locked';
    end if;
  end loop;
end; $$;
revoke all on function private_privacy_ops.assert_account_write_allowed_v1(uuid[]) from public,anon,authenticated,service_role;

-- Only direct database operator sessions, never web/service-role RPC access.
-- Unfreeze is controlled by the ops tool's catalog/ledger/owner postchecks.
create function private_privacy_ops.set_release_freeze_v1(p_frozen boolean,p_revision bigint) returns bigint
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_revision bigint;
begin
  if session_user<>'postgres' or auth.uid() is not null or p_frozen is null or p_revision is null
    then raise exception 'release_ops_denied'; end if;
  update private_privacy_ops.release_write_state set frozen=p_frozen,revision=revision+1
    where singleton and revision=p_revision returning revision into v_revision;
  if not found then raise exception 'release_state_conflict'; end if;
  return v_revision;
end; $$;
revoke all on function private_privacy_ops.set_release_freeze_v1(boolean,bigint) from public,anon,authenticated,service_role;
commit;
