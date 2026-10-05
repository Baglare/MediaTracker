-- Forward-only, ops-only XP cleanup. NOT applied by this phase.
-- No web runtime grants, credential/GUC bypass, trigger disabling or FK changes.
begin;
create schema if not exists private_privacy_ops;
revoke all on schema private_privacy_ops from public,anon,authenticated,service_role;
create table if not exists private_privacy_ops.xp_cleanup_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  user_id uuid not null,
  primary key (backend_pid,transaction_id)
);
alter table private_privacy_ops.xp_cleanup_context enable row level security;
revoke all on table private_privacy_ops.xp_cleanup_context from public,anon,authenticated,service_role;

create or replace function public.xp_events_are_immutable()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
declare v_user uuid;
begin
  -- UPDATE is always immutable. Ordinary runtime sessions cannot read/create
  -- context. Only a postgres session within the exact cleanup transaction may
  -- delete the targeted user's events/allocations.
  if TG_OP='DELETE' and current_user='postgres' and session_user='postgres' then
    if TG_TABLE_SCHEMA='public' and TG_TABLE_NAME='xp_events' then
      v_user:=OLD.user_id;
    elsif TG_TABLE_SCHEMA='public' and TG_TABLE_NAME='xp_event_allocations' then
      select user_id into v_user from public.xp_events where id=OLD.event_id;
    end if;
    if v_user is not null and exists (
      select 1 from private_privacy_ops.xp_cleanup_context c
      where c.backend_pid=pg_catalog.pg_backend_pid()
        and c.transaction_id=pg_catalog.txid_current() and c.user_id=v_user
    ) then return OLD; end if;
  end if;
  raise exception 'xp_event_immutable';
end;
$$;

create or replace function private_privacy_ops.erase_xp_v1(p_user uuid,p_confirmation text)
returns void language plpgsql security definer
set search_path=pg_catalog,pg_temp set statement_timeout='5s' set lock_timeout='1s' as $$
begin
  if session_user<>'postgres' or p_user is null
    or p_confirmation is distinct from 'ERASE XP '||p_user::text then
    raise exception 'privacy_ops_refused';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('privacy-xp:'||p_user::text,0));
  perform 1 from auth.users where id=p_user for update;
  -- Cross-owner corrupt dependencies must stop, never delete another user's XP.
  if exists(select 1 from public.xp_legacy_imports r join public.xp_events e on e.id=r.event_id where e.user_id=p_user and r.user_id<>p_user)
    or exists(select 1 from public.xp_user_quest_progress r join public.xp_events e on e.id=r.reward_event_id where e.user_id=p_user and r.user_id<>p_user)
    or exists(select 1 from public.xp_user_badges r join public.xp_events e on e.id=r.source_event_id where e.user_id=p_user and r.user_id<>p_user)
    or exists(select 1 from public.xp_local_state_conversions r join public.xp_events e on e.id=r.correction_event_id where e.user_id=p_user and r.user_id<>p_user) then
    raise exception 'privacy_cross_owner_xp_dependency';
  end if;
  insert into private_privacy_ops.xp_cleanup_context values(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),p_user);
  delete from public.xp_local_state_conversions where user_id=p_user;
  delete from public.xp_legacy_imports where user_id=p_user;
  delete from public.xp_user_quest_progress where user_id=p_user;
  delete from public.xp_user_badges where user_id=p_user;
  delete from public.xp_event_allocations a using public.xp_events e where a.event_id=e.id and e.user_id=p_user;
  delete from public.xp_events where user_id=p_user;
  delete from public.xp_media_entitlements where user_id=p_user;
  delete from public.xp_user_world_totals where user_id=p_user;
  delete from public.xp_user_branch_totals where user_id=p_user;
  delete from public.xp_user_totals where user_id=p_user;
  delete from private_privacy_ops.xp_cleanup_context where backend_pid=pg_catalog.pg_backend_pid() and transaction_id=pg_catalog.txid_current();
end;
$$;
alter function private_privacy_ops.erase_xp_v1(uuid,text) owner to postgres;
revoke all on function private_privacy_ops.erase_xp_v1(uuid,text) from public,anon,authenticated,service_role;
-- Only the owner postgres can invoke it; schema is outside exposed public RPC.
commit;
