begin;
-- B's reply is independent of A's comment body. Preserve it as a root reply.
alter table public.social_activity_comments drop constraint social_activity_comments_parent_comment_id_fkey;
alter table public.social_activity_comments add constraint social_activity_comments_parent_comment_id_fkey
foreign key(parent_comment_id) references public.social_activity_comments(id) on delete set null;

create table private_privacy_ops.xp_detach_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  event_id uuid not null,
  canonical_key text,
  primary key(backend_pid,transaction_id,event_id)
);
alter table private_privacy_ops.xp_detach_context enable row level security;
revoke all on private_privacy_ops.xp_detach_context from public,anon,authenticated,service_role;

-- Preserve immutable award amounts, identity, trust, time, effect and all XP
-- allocations/totals. Only an exact privileged detachment transaction may
-- scrub participant provenance; ordinary UPDATE/DELETE still always fail.
create or replace function public.xp_events_are_immutable() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare v_user uuid;
begin
  if current_user='postgres' and session_user='postgres' and auth.uid() is null then
    if tg_op='UPDATE' and tg_table_name='xp_events'
      and exists(select 1 from private_privacy_ops.xp_detach_context
        where backend_pid=pg_catalog.pg_backend_pid() and transaction_id=pg_catalog.txid_current() and event_id=old.id)
      and (to_jsonb(new)-array['source_id','canonical_key','dedupe_key','metadata'])
        =(to_jsonb(old)-array['source_id','canonical_key','dedupe_key','metadata'])
      and new.source_id='privacy-detached:'||old.id::text
      and new.dedupe_key='privacy-detached:'||old.id::text
      and new.canonical_key is not distinct from (select canonical_key from private_privacy_ops.xp_detach_context
        where backend_pid=pg_catalog.pg_backend_pid() and transaction_id=pg_catalog.txid_current() and event_id=old.id)
      and new.metadata='{}'::jsonb then return new;
    end if;
    if tg_op='DELETE' then
      if tg_table_name='xp_events' then v_user:=old.user_id;
      elsif tg_table_name='xp_event_allocations' then
        select user_id into v_user from public.xp_events where id=old.event_id;
      end if;
      if v_user is not null and exists(select 1 from private_privacy_ops.xp_cleanup_context
        where backend_pid=pg_catalog.pg_backend_pid() and transaction_id=pg_catalog.txid_current() and user_id=v_user)
      then return old; end if;
    end if;
  end if;
  raise exception 'xp_event_immutable';
end; $$;

create function private_privacy_ops.detach_participant_xp_v1(p_user uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if session_user<>'postgres' or auth.uid() is not null or not exists(
    select 1 from private_privacy_ops.account_lifecycle where user_id=p_user and state='ERASING' and destructive_started
  ) then raise exception 'privacy_ops_denied'; end if;
  insert into private_privacy_ops.xp_detach_context
  select pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),e.id,
    case when e.canonical_key=p_user::text or e.canonical_key in
      (select id::text from public.social_recommendations where sender_id=p_user or recipient_id=p_user)
    then 'privacy-detached-group:'||min(e.id::text) over(partition by e.user_id,e.canonical_key)
    else e.canonical_key end
  from public.xp_events e
  where e.user_id<>p_user and (
    e.source_id in (select id::text from public.social_recommendations where sender_id=p_user or recipient_id=p_user)
    or e.metadata->>'recommendationId' in (select id::text from public.social_recommendations where sender_id=p_user or recipient_id=p_user)
    or e.source_id in (select m.id::text from public.social_recommendation_messages m join public.social_recommendations r on r.id=m.recommendation_id where r.sender_id=p_user or r.recipient_id=p_user)
  );
  update public.xp_events e set source_id='privacy-detached:'||e.id::text,
    dedupe_key='privacy-detached:'||e.id::text,
    canonical_key=(select c.canonical_key from private_privacy_ops.xp_detach_context c
      where c.backend_pid=pg_catalog.pg_backend_pid() and c.transaction_id=pg_catalog.txid_current() and c.event_id=e.id),metadata='{}'::jsonb
  where exists(select 1 from private_privacy_ops.xp_detach_context c
    where c.backend_pid=pg_catalog.pg_backend_pid() and c.transaction_id=pg_catalog.txid_current() and c.event_id=e.id);
  delete from private_privacy_ops.xp_detach_context
    where backend_pid=pg_catalog.pg_backend_pid() and transaction_id=pg_catalog.txid_current();
end; $$;
revoke all on function private_privacy_ops.detach_participant_xp_v1(uuid) from public,anon,authenticated,service_role;
commit;
