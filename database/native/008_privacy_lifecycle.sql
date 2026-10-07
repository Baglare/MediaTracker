BEGIN;
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
create table if not exists private_privacy_ops.xp_cleanup_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  user_id uuid not null,
  primary key (backend_pid,transaction_id)
);
alter table private_privacy_ops.xp_cleanup_context enable row level security;
revoke all on table private_privacy_ops.xp_cleanup_context from public,mt_runtime;

create or replace function app.xp_events_are_immutable()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
declare v_user uuid;
begin
  -- UPDATE is always immutable. Ordinary runtime sessions cannot read/create
  -- context. Only a postgres session within the exact cleanup transaction may
  -- delete the targeted user's events/allocations.
  if TG_OP='DELETE' and current_user='mt_owner' and (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) then
    if TG_TABLE_SCHEMA='app' and TG_TABLE_NAME='xp_events' then
      v_user:=OLD.user_id;
    elsif TG_TABLE_SCHEMA='app' and TG_TABLE_NAME='xp_event_allocations' then
      select user_id into v_user from app.xp_events where id=OLD.event_id;
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
  if NOT (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) or p_user is null
    or p_confirmation is distinct from 'ERASE XP '||p_user::text then
    raise exception 'privacy_ops_refused';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('privacy-xp:'||p_user::text,0));
  perform 1 from native_auth."user" where id=p_user for update;
  -- Cross-owner corrupt dependencies must stop, never delete another user's XP.
  if exists(select 1 from app.xp_legacy_imports r join app.xp_events e on e.id=r.event_id where e.user_id=p_user and r.user_id<>p_user)
    or exists(select 1 from app.xp_user_quest_progress r join app.xp_events e on e.id=r.reward_event_id where e.user_id=p_user and r.user_id<>p_user)
    or exists(select 1 from app.xp_user_badges r join app.xp_events e on e.id=r.source_event_id where e.user_id=p_user and r.user_id<>p_user)
    or exists(select 1 from app.xp_local_state_conversions r join app.xp_events e on e.id=r.correction_event_id where e.user_id=p_user and r.user_id<>p_user) then
    raise exception 'privacy_cross_owner_xp_dependency';
  end if;
  insert into private_privacy_ops.xp_cleanup_context values(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),p_user);
  delete from app.xp_local_state_conversions where user_id=p_user;
  delete from app.xp_legacy_imports where user_id=p_user;
  delete from app.xp_user_quest_progress where user_id=p_user;
  delete from app.xp_user_badges where user_id=p_user;
  delete from app.xp_event_allocations a using app.xp_events e where a.event_id=e.id and e.user_id=p_user;
  delete from app.xp_events where user_id=p_user;
  delete from app.xp_media_entitlements where user_id=p_user;
  delete from app.xp_user_world_totals where user_id=p_user;
  delete from app.xp_user_branch_totals where user_id=p_user;
  delete from app.xp_user_totals where user_id=p_user;
  delete from private_privacy_ops.xp_cleanup_context where backend_pid=pg_catalog.pg_backend_pid() and transaction_id=pg_catalog.txid_current();
end;
$$;
alter function private_privacy_ops.erase_xp_v1(uuid,text) owner to mt_owner;
revoke all on function private_privacy_ops.erase_xp_v1(uuid,text) from public,mt_runtime;
-- Only the owner postgres can invoke it; schema is outside exposed public RPC.


-- B's reply is independent of A's comment body. Preserve it as a root reply.
alter table app.social_activity_comments drop constraint social_activity_comments_parent_comment_id_fkey;
alter table app.social_activity_comments add constraint social_activity_comments_parent_comment_id_fkey
foreign key(parent_comment_id) references app.social_activity_comments(id) on delete set null;

create table private_privacy_ops.xp_detach_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  event_id uuid not null,
  canonical_key text,
  primary key(backend_pid,transaction_id,event_id)
);
alter table private_privacy_ops.xp_detach_context enable row level security;
revoke all on private_privacy_ops.xp_detach_context from public,mt_runtime;

-- Preserve immutable award amounts, identity, trust, time, effect and all XP
-- allocations/totals. Only an exact privileged detachment transaction may
-- scrub participant provenance; ordinary UPDATE/DELETE still always fail.
create or replace function app.xp_events_are_immutable() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare v_user uuid;
begin
  if current_user='mt_owner' and (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) and app.current_user_id() is null then
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
        select user_id into v_user from app.xp_events where id=old.event_id;
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
  if NOT (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) or app.current_user_id() is not null or not exists(
    select 1 from app.account_lifecycle where user_id=p_user and state='ERASING' and destructive_started
  ) then raise exception 'privacy_ops_denied'; end if;
  insert into private_privacy_ops.xp_detach_context
  select pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),e.id,
    case when e.canonical_key=p_user::text or e.canonical_key in
      (select id::text from app.social_recommendations where sender_id=p_user or recipient_id=p_user)
    then 'privacy-detached-group:'||min(e.id::text) over(partition by e.user_id,e.canonical_key)
    else e.canonical_key end
  from app.xp_events e
  where e.user_id<>p_user and (
    e.source_id in (select id::text from app.social_recommendations where sender_id=p_user or recipient_id=p_user)
    or e.metadata->>'recommendationId' in (select id::text from app.social_recommendations where sender_id=p_user or recipient_id=p_user)
    or e.source_id in (select m.id::text from app.social_recommendation_messages m join app.social_recommendations r on r.id=m.recommendation_id where r.sender_id=p_user or r.recipient_id=p_user)
  );
  update app.xp_events e set source_id='privacy-detached:'||e.id::text,
    dedupe_key='privacy-detached:'||e.id::text,
    canonical_key=(select c.canonical_key from private_privacy_ops.xp_detach_context c
      where c.backend_pid=pg_catalog.pg_backend_pid() and c.transaction_id=pg_catalog.txid_current() and c.event_id=e.id),metadata='{}'::jsonb
  where exists(select 1 from private_privacy_ops.xp_detach_context c
    where c.backend_pid=pg_catalog.pg_backend_pid() and c.transaction_id=pg_catalog.txid_current() and c.event_id=e.id);
  delete from private_privacy_ops.xp_detach_context
    where backend_pid=pg_catalog.pg_backend_pid() and transaction_id=pg_catalog.txid_current();
end; $$;
revoke all on function private_privacy_ops.detach_participant_xp_v1(uuid) from public,mt_runtime;


CREATE OR REPLACE FUNCTION app.assert_account_write(p_users uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_state text;
BEGIN
  PERFORM app.assert_release_write();
  IF session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL THEN RETURN; END IF;
  FOR v_user IN SELECT DISTINCT u FROM unnest(p_users) u WHERE u IS NOT NULL ORDER BY u LOOP
    SELECT state INTO v_state FROM app.account_lifecycle WHERE user_id=v_user FOR SHARE;
    IF NOT FOUND OR v_state<>'ACTIVE' THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='account_write_locked';
    END IF;
  END LOOP;
END; $$;
CREATE FUNCTION private_privacy_ops.assert_account_write_allowed_v1(p_users uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM app.assert_account_write(p_users); END; $$;
create function private_privacy_ops.guard_account_mutation_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_row jsonb; v_rows jsonb[]; v_users uuid[]:=array[app.current_user_id()]; v_key text; v_parent uuid;
begin
  -- SECURITY DEFINER changes current_user, never session_user. No JWT/GUC
  -- unlock switch is accepted. Only a direct postgres ops session bypasses.
  if (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) and app.current_user_id() is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  -- GoTrue Auth-last invokes zero-row FK DELETE statements after verified
  -- application cleanup. Permit ONLY those statements; any leftover account
  -- row still reaches the row trigger and fails closed. This is a database
  -- login identity, never a JWT claim or a web service-role shortcut.

  if app.current_user_id() is null then raise exception 'authentication_required'; end if;
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

    -- Account participants reachable only through container/event FKs.
    if v_row->>'event_id' is not null and tg_table_name='xp_event_allocations' then
      select user_id into v_parent from app.xp_events where id=(v_row->>'event_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
    if v_row->>'activity_id' is not null then
      select actor_id into v_parent from app.social_activity_events where id=(v_row->>'activity_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
    if coalesce(v_row->>'comment_id',v_row->>'parent_comment_id') is not null then
      select author_id into v_parent from app.social_activity_comments
        where id=coalesce(v_row->>'comment_id',v_row->>'parent_comment_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
    if v_row->>'recommendation_id' is not null then
      select sender_id into v_parent from app.social_recommendations where id=(v_row->>'recommendation_id')::uuid;
      v_users:=array_append(v_users,v_parent);
      select recipient_id into v_parent from app.social_recommendations where id=(v_row->>'recommendation_id')::uuid;
      v_users:=array_append(v_users,v_parent);
    end if;
  end loop;
  perform private_privacy_ops.assert_account_write_allowed_v1(v_users);
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create function app.assert_account_write_allowed() returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if app.current_user_id() is null then raise exception 'authentication_required'; end if;
  perform private_privacy_ops.assert_account_write_allowed_v1(array[app.current_user_id()]);
end; $$;
GRANT EXECUTE ON FUNCTION app.assert_account_write_allowed() TO mt_runtime;
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profiles FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profiles FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.recommendation_feedback FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.recommendation_feedback FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_username_history FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_username_history FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_modules FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_modules FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_media_showcase FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_media_showcase FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_stats_snapshots FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_stats_snapshots FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_progression_snapshots FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_progression_snapshots FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_shared_notes FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_shared_notes FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_follows FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_follows FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.profile_blocks FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.profile_blocks FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_activity_preferences FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_activity_preferences FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_activity_events FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_activity_events FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_activity_comments FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_activity_comments FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_reactions FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_reactions FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_recommendations FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_recommendations FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_recommendation_events FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_recommendation_events FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_recommendation_messages FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_recommendation_messages FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_notification_preferences FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_notification_preferences FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_notifications FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_notifications FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.social_reports FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.social_reports FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_events FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_events FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_event_allocations FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_event_allocations FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_totals FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_totals FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_world_totals FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_world_totals FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_branch_totals FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_branch_totals FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_legacy_imports FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_legacy_imports FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_quest_progress FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_quest_progress FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_badges FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_user_badges FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_media_entitlements FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_media_entitlements FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.xp_local_state_conversions FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.xp_local_state_conversions FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_statement BEFORE INSERT OR UPDATE OR DELETE ON app.user_theme_preferences FOR EACH STATEMENT EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
CREATE TRIGGER a_privacy_row BEFORE INSERT OR UPDATE OR DELETE ON app.user_theme_preferences FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_account_mutation_v1();
ALTER TABLE private_privacy_ops.xp_cleanup_context FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_internal ON private_privacy_ops.xp_cleanup_context TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE private_privacy_ops.xp_detach_context FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_internal ON private_privacy_ops.xp_detach_context TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
CREATE FUNCTION app.native_privacy_inspect(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
RETURN (select jsonb_build_object('schemaVersion',1,'synthetic',false,
      'auth',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'created_at',"createdAt",'email_confirmed_at',CASE WHEN "emailVerified" THEN "createdAt" ELSE NULL END)),'[]'::jsonb) from native_auth."user" where id=p_user),
      'lifecycle',(select coalesce(jsonb_object_agg(user_id,state),'{}'::jsonb) from app.account_lifecycle where user_id=p_user),
      'stageState',(select coalesce(jsonb_object_agg(user_id,jsonb_build_object('lastCompletedStage',last_completed_stage,'failedStage',failed_stage,'destructiveStarted',destructive_started)),'{}'::jsonb) from app.account_lifecycle where user_id=p_user),
      'context',coalesce((select erasure_context from app.account_lifecycle where user_id=p_user),'{}'::jsonb),
      'scopedResiduals',(select coalesce(jsonb_agg(item),'[]'::jsonb) from (select jsonb_build_object('table','social_notifications','row',to_jsonb(n)) item from app.social_notifications n
    where n.entity_id::text in (select jsonb_array_elements_text(coalesce((select erasure_context from app.account_lifecycle where user_id=p_user)->'referenceIds','[]'::jsonb)))
      or n.safe_payload->>'actorId'=p_user::text or n.safe_payload->>'userId'=p_user::text
    union all select jsonb_build_object('table','xp_events','row',to_jsonb(e)) from app.xp_events e
    where e.source_id in (select jsonb_array_elements_text(coalesce((select erasure_context from app.account_lifecycle where user_id=p_user)->'referenceIds','[]'::jsonb)))
      or e.metadata->>'recommendationId' in (select jsonb_array_elements_text(coalesce((select erasure_context from app.account_lifecycle where user_id=p_user)->'referenceIds','[]'::jsonb)))
    union all select jsonb_build_object('table','social_activity_comments','row',to_jsonb(c)) from app.social_activity_comments c
    where c.id::text in (select jsonb_array_elements_text(coalesce((select erasure_context from app.account_lifecycle where user_id=p_user)->'replyIds','[]'::jsonb)))
      and c.body<>'Silinen hesaba verilen yanıt.' and exists(select 1 from jsonb_array_elements_text(coalesce((select erasure_context from app.account_lifecycle where user_id=p_user)->'identifiers','[]'::jsonb)) marker where position(marker in c.body)>0)
    union all select jsonb_build_object('table','social_activity_events','row',to_jsonb(a)) from app.social_activity_events a
      where a.source_event_id='privacy-detached:'||a.id::text and (
        length(coalesce(a.media_snapshot->>'canonicalKey','')) not between 3 and 260
        or exists(select 1 from jsonb_array_elements_text(coalesce((select erasure_context from app.account_lifecycle where user_id=p_user)->'identifiers','[]'::jsonb)) marker
          where position(marker in a.media_snapshot::text)>0))) q),
      'tables',jsonb_build_object('profiles',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profiles r where r.id=p_user),
'media_items',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.media_items r where r.user_id=p_user),
'progress_logs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.progress_logs r where r.user_id=p_user),
'recommendation_feedback',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.recommendation_feedback r where r.user_id=p_user),
'profile_username_history',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_username_history r where r.user_id=p_user),
'profile_modules',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_modules r where r.user_id=p_user),
'profile_media_showcase',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_media_showcase r where r.user_id=p_user),
'profile_stats_snapshots',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_stats_snapshots r where r.user_id=p_user),
'profile_progression_snapshots',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_progression_snapshots r where r.user_id=p_user),
'profile_shared_notes',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_shared_notes r where r.user_id=p_user),
'profile_follows',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_follows r where r.follower_id=p_user or r.following_id=p_user),
'profile_blocks',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.profile_blocks r where r.blocker_id=p_user or r.blocked_id=p_user),
'social_activity_preferences',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_activity_preferences r where r.user_id=p_user),
'social_activity_events',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_activity_events r where r.actor_id=p_user or r.source_event_id in (select 'recommendation:'||id::text from (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user) q)),
'social_activity_comments',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_activity_comments r where r.author_id=p_user or r.activity_id in (select id from app.social_activity_events where actor_id=p_user) or r.parent_comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user)) or r.id::text in
    (select jsonb_array_elements_text(coalesce((select erasure_context->'replyIds' from app.account_lifecycle where user_id=p_user),'[]'::jsonb)))),
'social_reactions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_reactions r where r.user_id=p_user or r.activity_id in (select id from app.social_activity_events where actor_id=p_user) or r.comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user))),
'social_recommendations',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_recommendations r where r.sender_id=p_user or r.recipient_id=p_user),
'social_recommendation_events',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_recommendation_events r where r.actor_id=p_user or r.recommendation_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user)),
'social_recommendation_messages',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_recommendation_messages r where r.author_id=p_user or r.recommendation_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user)),
'social_notification_preferences',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_notification_preferences r where r.user_id=p_user),
'social_notifications',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_notifications r where r.recipient_id=p_user or r.actor_id=p_user or r.entity_id=p_user or r.entity_id in (select id from app.social_activity_events where actor_id=p_user) or r.entity_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user)) or r.entity_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user) or r.safe_payload->>'actorId'=p_user::text or r.safe_payload->>'userId'=p_user::text),
'social_reports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.social_reports r where r.reporter_id=p_user or r.activity_id in (select id from app.social_activity_events where actor_id=p_user) or r.comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user))),
'xp_events',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_events r where r.user_id=p_user or r.source_id in (select id::text from (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user) q) or r.source_id in (select id::text from (select id from app.social_recommendation_messages where author_id=p_user or recommendation_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user)) q) or r.metadata->>'recommendationId' in (select id::text from (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user) q)),
'xp_event_allocations',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_event_allocations r where r.event_id in (select id from app.xp_events where user_id=p_user)),
'xp_user_totals',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_user_totals r where r.user_id=p_user),
'xp_user_world_totals',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_user_world_totals r where r.user_id=p_user),
'xp_user_branch_totals',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_user_branch_totals r where r.user_id=p_user),
'xp_legacy_imports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_legacy_imports r where r.user_id=p_user or r.event_id in (select id from app.xp_events where user_id=p_user)),
'xp_user_quest_progress',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_user_quest_progress r where r.user_id=p_user or r.reward_event_id in (select id from app.xp_events where user_id=p_user)),
'xp_user_badges',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_user_badges r where r.user_id=p_user or r.source_event_id in (select id from app.xp_events where user_id=p_user)),
'xp_media_entitlements',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_media_entitlements r where r.user_id=p_user),
'xp_local_state_conversions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.xp_local_state_conversions r where r.user_id=p_user or r.correction_event_id in (select id from app.xp_events where user_id=p_user)),
'user_theme_preferences',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.user_theme_preferences r where r.user_id=p_user),
'goals',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.goals r where r.user_id=p_user),
'cloud_media_sync_operations',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.cloud_media_sync_operations r where r.user_id=p_user),
'goal_sync_operations',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from app.goal_sync_operations r where r.user_id=p_user),
'embedding_cache','[]'::jsonb,
'xp_quest_definitions','[]'::jsonb,
'xp_badge_definitions','[]'::jsonb),
      'assets',(select coalesce(jsonb_agg(jsonb_build_object('bucket','profile-assets','name',file_key,'ownerId',user_id,'mimeType',mime,'size',size)),'[]'::jsonb) from app.native_asset_objects where user_id=p_user))); END; $$;
CREATE FUNCTION app.native_privacy_cleanup(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) OR NOT EXISTS(SELECT FROM app.account_lifecycle WHERE user_id=p_user AND state='ERASING') THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
update app.account_lifecycle set erasure_context=jsonb_build_object(
    'referenceIds',(select coalesce(jsonb_agg(id),'[]'::jsonb) from (select id from app.social_activity_events where actor_id=p_user union select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user) union select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user
      union select id from app.social_recommendation_messages where recommendation_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user)) q),
    'replyIds',(select coalesce(jsonb_agg(id),'[]'::jsonb) from app.social_activity_comments where author_id<>p_user and parent_comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user)) and activity_id not in (select id from app.social_activity_events where actor_id=p_user)),
    'identifiers',jsonb_build_array(p_user::text)||(select coalesce(jsonb_agg(v),'[]'::jsonb) from app.profiles p,
      lateral unnest(array[p.username,p.display_name,p.avatar_path,p.banner_path]) v where p.id=p_user and v is not null and v<>''))
    where user_id=p_user and erasure_context='{}'::jsonb;

    
    update app.account_lifecycle set destructive_started=true where user_id=p_user;
    PERFORM private_privacy_ops.detach_participant_xp_v1(p_user);
    update app.social_activity_events set source_event_id='privacy-detached:'||id::text,
      dedupe_key='privacy-detached:'||id::text,short_text=null,
      media_snapshot=jsonb_build_object('title','Silinen öneri','mediaType',coalesce(media_snapshot->>'mediaType','movie'),
        'canonicalKey','privacy-detached-activity:'||id::text)
      where actor_id<>p_user and source_event_id in (select 'recommendation:'||id::text from (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user) q);
    delete from app.social_notifications where recipient_id=p_user or actor_id=p_user or entity_id=p_user
      or safe_payload->>'actorId'=p_user::text or safe_payload->>'userId'=p_user::text
      or entity_id in (select id from app.social_activity_events where actor_id=p_user) or entity_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user)) or entity_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user);
    -- Delete reports carrying A authorship or referring to erased containers.
    -- No invented moderation/legal retention. B's unrelated reports survive.
    delete from app.social_reports where reporter_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user) or comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user));
    delete from app.social_reactions where user_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user) or comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user));
    update app.social_activity_comments c set body='Silinen hesaba verilen yanıt.'
      where author_id<>p_user and parent_comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user)) and activity_id not in (select id from app.social_activity_events where actor_id=p_user)
        and exists(select 1 from app.account_lifecycle l,
          jsonb_array_elements_text(l.erasure_context->'identifiers') marker where l.user_id=p_user and position(marker in c.body)>0);
    update app.social_activity_comments set parent_comment_id=null where author_id<>p_user and parent_comment_id in (select id from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user)) and activity_id not in (select id from app.social_activity_events where actor_id=p_user);
    delete from app.social_activity_comments where author_id=p_user or activity_id in (select id from app.social_activity_events where actor_id=p_user);
    delete from app.social_activity_events where actor_id=p_user;
    delete from app.social_recommendation_messages where author_id=p_user or recommendation_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user);
    delete from app.social_recommendation_events where actor_id=p_user or recommendation_id in (select id from app.social_recommendations where sender_id=p_user or recipient_id=p_user);
    delete from app.social_recommendations where sender_id=p_user or recipient_id=p_user;
    delete from app.profile_follows where follower_id=p_user or following_id=p_user;
    delete from app.profile_blocks where blocker_id=p_user or blocked_id=p_user;
    delete from app.media_items where user_id=p_user;
delete from app.progress_logs where user_id=p_user;
delete from app.recommendation_feedback where user_id=p_user;
delete from app.profile_username_history where user_id=p_user;
delete from app.profile_modules where user_id=p_user;
delete from app.profile_media_showcase where user_id=p_user;
delete from app.profile_stats_snapshots where user_id=p_user;
delete from app.profile_progression_snapshots where user_id=p_user;
delete from app.profile_shared_notes where user_id=p_user;
delete from app.social_activity_preferences where user_id=p_user;
delete from app.social_notification_preferences where user_id=p_user;
delete from app.user_theme_preferences where user_id=p_user;
delete from app.goals where user_id=p_user;
delete from app.cloud_media_sync_operations where user_id=p_user;
delete from app.goal_sync_operations where user_id=p_user;
    -- Deferred showcase/review reconciliation can create reversal XP at COMMIT.
    -- Flush it while Auth/XP still exist, then erase all resulting XP last.
    -- No trigger is disabled and no ordinary XP contract is relaxed.
    set constraints app.xp_showcase_reconcile,app.xp_shared_review_reconcile immediate;
    PERFORM private_privacy_ops.erase_xp_v1(p_user,'ERASE XP '||p_user::text);
    delete from app.profiles where id=p_user;
    
UPDATE app.native_asset_objects SET state='cleanup' WHERE user_id=p_user AND state<>'staging';
END; $$;
CREATE FUNCTION app.native_account_export_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE p_user uuid:=app.current_user_id(); BEGIN
IF p_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
RETURN jsonb_build_object('schemaVersion',1,'synthetic',false,
'auth',(SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'created_at',"createdAt")) FROM native_auth."user" WHERE id=p_user),
'tables',jsonb_build_object('profiles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'display_name',r.display_name,'username',r.username,'tagline',r.tagline,'bio',r.bio,'location',r.location,'language',r.language,'visibility_mode',r.visibility_mode,'connection_color',r.connection_color,'avatar_path',r.avatar_path,'banner_path',r.banner_path,'selected_title',r.selected_title,'follow_list_visibility',r.follow_list_visibility,'layout_mode',r.layout_mode,'joined_at',r.joined_at,'created_at',r.created_at,'updated_at',r.updated_at,'deleted_at',r.deleted_at,'username_changed_at',r.username_changed_at,'recommendation_permission',r.recommendation_permission,'profile_palette_id',r.profile_palette_id,'banner_mode',r.banner_mode,'banner_position',r.banner_position,'overlay_strength',r.overlay_strength,'avatar_frame',r.avatar_frame,'surface_style',r.surface_style,'motif_intensity',r.motif_intensity,'banner_focal_x',r.banner_focal_x,'banner_focal_y',r.banner_focal_y,'banner_zoom',r.banner_zoom,'avatar_focal_x',r.avatar_focal_x,'avatar_focal_y',r.avatar_focal_y,'avatar_zoom',r.avatar_zoom,'profile_theme_visibility',r.profile_theme_visibility,'public_theme_preset',r.public_theme_preset,'public_theme_snapshot',r.public_theme_snapshot)),'[]'::jsonb) FROM app.profiles r WHERE r.id=p_user),'media_items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'title',r.title,'type',r.type,'status',r.status,'current_progress',r.current_progress,'total_progress',r.total_progress,'external_source',r.external_source,'external_id',r.external_id,'cover_url',r.cover_url,'backdrop_url',r.backdrop_url,'overview',r.overview,'release_year',r.release_year,'favorite',r.favorite,'user_rating',r.user_rating,'tags',r.tags,'personal_notes',r.personal_notes,'metadata',r.metadata,'created_at',r.created_at,'updated_at',r.updated_at,'deleted_at',r.deleted_at,'canonical_version',r.canonical_version,'canonical_key',r.canonical_key,'canonical_source',r.canonical_source,'canonical_namespace',r.canonical_namespace,'canonical_stable_id',r.canonical_stable_id,'identity_status',r.identity_status,'revision',r.revision)),'[]'::jsonb) FROM app.media_items r WHERE r.user_id=p_user),'progress_logs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'media_id',r.media_id,'media_title',r.media_title,'media_type',r.media_type,'action',r.action,'amount',r.amount,'unit',r.unit,'previous_progress',r.previous_progress,'new_progress',r.new_progress,'created_at',r.created_at,'detached_media_id',r.detached_media_id,'detached_at',r.detached_at,'revision',r.revision,'deleted_at',r.deleted_at)),'[]'::jsonb) FROM app.progress_logs r WHERE r.user_id=p_user),'recommendation_feedback',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'action',r.action,'recommendation_id',r.recommendation_id,'title',r.title,'media_type',r.media_type,'source',r.source,'external_source',r.external_source,'external_id',r.external_id,'session_id',r.session_id,'prompt',r.prompt,'metadata',r.metadata,'created_at',r.created_at)),'[]'::jsonb) FROM app.recommendation_feedback r WHERE r.user_id=p_user),'profile_username_history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'username',r.username,'claimed_at',r.claimed_at,'released_at',r.released_at,'reserved_until',r.reserved_until)),'[]'::jsonb) FROM app.profile_username_history r WHERE r.user_id=p_user),'profile_modules',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'module_key',r.module_key,'enabled',r.enabled,'visibility',r.visibility,'grid_x',r.grid_x,'grid_y',r.grid_y,'grid_width',r.grid_width,'grid_height',r.grid_height,'mobile_order',r.mobile_order,'config',r.config,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.profile_modules r WHERE r.user_id=p_user),'profile_media_showcase',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'showcase_kind',r.showcase_kind,'title',r.title,'media_type',r.media_type,'external_source',r.external_source,'external_id',r.external_id,'cover_url',r.cover_url,'world',r.world,'sort_order',r.sort_order,'created_at',r.created_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.profile_media_showcase r WHERE r.user_id=p_user),'profile_stats_snapshots',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'total_media',r.total_media,'completed',r.completed,'active',r.active,'planning',r.planning,'favorites',r.favorites,'rated',r.rated,'world_counts',r.world_counts,'snapshot_at',r.snapshot_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.profile_stats_snapshots r WHERE r.user_id=p_user),'profile_progression_snapshots',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'version',r.version,'total_xp',r.total_xp,'level',r.level,'title',r.title,'tier',r.tier,'dominant_world',r.dominant_world,'progress_percent',r.progress_percent,'world_counts',r.world_counts,'snapshot_at',r.snapshot_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.profile_progression_snapshots r WHERE r.user_id=p_user),'profile_shared_notes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'media_title',r.media_title,'media_type',r.media_type,'external_source',r.external_source,'external_id',r.external_id,'content',r.content,'contains_spoiler',r.contains_spoiler,'visibility',r.visibility,'confirmed_at',r.confirmed_at,'created_at',r.created_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.profile_shared_notes r WHERE r.user_id=p_user),'profile_follows',(SELECT coalesce(jsonb_agg(jsonb_build_object('follower_id',r.follower_id,'following_id',r.following_id,'status',r.status,'requested_at',r.requested_at,'responded_at',r.responded_at,'created_at',r.created_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.profile_follows r WHERE r.follower_id=p_user OR r.following_id=p_user),'profile_blocks',(SELECT coalesce(jsonb_agg(jsonb_build_object('blocker_id',r.blocker_id,'blocked_id',r.blocked_id,'created_at',r.created_at)),'[]'::jsonb) FROM app.profile_blocks r WHERE r.blocker_id=p_user),'social_activity_preferences',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'share_completed',r.share_completed,'share_started',r.share_started,'share_rating',r.share_rating,'share_favorite',r.share_favorite,'share_recommendation_completed',r.share_recommendation_completed,'default_visibility',r.default_visibility,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.social_activity_preferences r WHERE r.user_id=p_user),'social_activity_events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'actor_id',r.actor_id,'event_type',r.event_type,'visibility',r.visibility,'media_snapshot',r.media_snapshot,'rating',r.rating,'short_text',r.short_text,'created_at',r.created_at,'updated_at',r.updated_at,'deleted_at',r.deleted_at)),'[]'::jsonb) FROM app.social_activity_events r WHERE r.actor_id=p_user),'social_activity_comments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'activity_id',r.activity_id,'author_id',r.author_id,'parent_comment_id',r.parent_comment_id,'body',r.body,'spoiler',r.spoiler,'created_at',r.created_at,'updated_at',r.updated_at,'deleted_at',r.deleted_at,'hidden_by_owner_at',r.hidden_by_owner_at)),'[]'::jsonb) FROM app.social_activity_comments r WHERE r.author_id=p_user),'social_reactions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'activity_id',r.activity_id,'comment_id',r.comment_id,'reaction_type',r.reaction_type,'created_at',r.created_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.social_reactions r WHERE r.user_id=p_user),'social_recommendations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'sender_id',r.sender_id,'recipient_id',r.recipient_id,'response_status',r.response_status,'progress_status',r.progress_status,'sender_note',r.sender_note,'recipient_response_note',r.recipient_response_note,'media_snapshot',r.media_snapshot,'canonical_media_key',r.canonical_media_key,'already_in_library',r.already_in_library,'created_at',r.created_at,'responded_at',r.responded_at,'started_at',r.started_at,'completed_at',r.completed_at,'withdrawn_at',r.withdrawn_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.social_recommendations r WHERE r.sender_id=p_user OR r.recipient_id=p_user),'social_recommendation_events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'recommendation_id',r.recommendation_id,'actor_id',r.actor_id,'event_type',r.event_type,'occurred_at',r.occurred_at)),'[]'::jsonb) FROM app.social_recommendation_events r WHERE r.recommendation_id IN (SELECT id FROM app.social_recommendations WHERE p_user IN(sender_id,recipient_id))),'social_recommendation_messages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'recommendation_id',r.recommendation_id,'author_id',r.author_id,'body',r.body,'created_at',r.created_at,'deleted_at',r.deleted_at)),'[]'::jsonb) FROM app.social_recommendation_messages r WHERE r.recommendation_id IN (SELECT id FROM app.social_recommendations WHERE p_user IN(sender_id,recipient_id)) AND (r.author_id=p_user OR r.deleted_at IS NULL)),'social_notification_preferences',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'follow_notifications',r.follow_notifications,'comment_notifications',r.comment_notifications,'reaction_notifications',r.reaction_notifications,'recommendation_received',r.recommendation_received,'recommendation_accepted',r.recommendation_accepted,'recommendation_started',r.recommendation_started,'recommendation_completed',r.recommendation_completed,'recommendation_rejected',r.recommendation_rejected,'recommendation_withdrawn',r.recommendation_withdrawn,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.social_notification_preferences r WHERE r.user_id=p_user),'social_notifications',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'recipient_id',r.recipient_id,'actor_id',r.actor_id,'notification_type',r.notification_type,'entity_type',r.entity_type,'entity_id',r.entity_id,'created_at',r.created_at,'read_at',r.read_at,'deleted_at',r.deleted_at)),'[]'::jsonb) FROM app.social_notifications r WHERE r.recipient_id=p_user),'social_reports',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reporter_id',r.reporter_id,'activity_id',r.activity_id,'comment_id',r.comment_id,'category',r.category,'note',r.note,'created_at',r.created_at)),'[]'::jsonb) FROM app.social_reports r WHERE r.reporter_id=p_user),'xp_events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'event_type',r.event_type,'trust_level',r.trust_level,'source_type',r.source_type,'source_id',r.source_id,'canonical_key',r.canonical_key,'occurred_at',r.occurred_at,'recorded_at',r.recorded_at,'metadata',r.metadata,'event_action',r.event_action,'effect',r.effect)),'[]'::jsonb) FROM app.xp_events r WHERE r.user_id=p_user),'xp_event_allocations',(SELECT coalesce(jsonb_agg(jsonb_build_object('event_id',r.event_id,'axis_type',r.axis_type,'axis_key',r.axis_key,'amount',r.amount)),'[]'::jsonb) FROM app.xp_event_allocations r WHERE r.event_id IN (SELECT id FROM app.xp_events WHERE user_id=p_user)),'xp_user_totals',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'total_xp',r.total_xp,'level',r.level,'current_level_start_xp',r.current_level_start_xp,'next_level_start_xp',r.next_level_start_xp,'updated_at',r.updated_at,'version',r.version)),'[]'::jsonb) FROM app.xp_user_totals r WHERE r.user_id=p_user),'xp_user_world_totals',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'world_key',r.world_key,'xp',r.xp,'level',r.level,'tier',r.tier,'title',r.title,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.xp_user_world_totals r WHERE r.user_id=p_user),'xp_user_branch_totals',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'branch_key',r.branch_key,'xp',r.xp,'level',r.level,'tier',r.tier,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.xp_user_branch_totals r WHERE r.user_id=p_user),'xp_legacy_imports',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'event_id',r.event_id,'aggregate',r.aggregate,'imported_at',r.imported_at)),'[]'::jsonb) FROM app.xp_legacy_imports r WHERE r.user_id=p_user),'xp_user_quest_progress',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'quest_key',r.quest_key,'current_value',r.current_value,'completed_at',r.completed_at,'reward_event_id',r.reward_event_id,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.xp_user_quest_progress r WHERE r.user_id=p_user),'xp_user_badges',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'badge_key',r.badge_key,'awarded_at',r.awarded_at,'source_event_id',r.source_event_id,'selected',r.selected,'display_order',r.display_order)),'[]'::jsonb) FROM app.xp_user_badges r WHERE r.user_id=p_user),'xp_media_entitlements',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'canonical_media_key',r.canonical_media_key,'entitlement_type',r.entitlement_type,'world_key',r.world_key,'is_active',r.is_active,'activated_at',r.activated_at,'deactivated_at',r.deactivated_at,'last_state_hash',r.last_state_hash,'allocations',r.allocations,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.xp_media_entitlements r WHERE r.user_id=p_user),'xp_local_state_conversions',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'correction_event_id',r.correction_event_id,'converted_at',r.converted_at)),'[]'::jsonb) FROM app.xp_local_state_conversions r WHERE r.user_id=p_user),'user_theme_preferences',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'schema_version',r.schema_version,'active_theme_selection',r.active_theme_selection,'custom_themes',r.custom_themes,'revision',r.revision,'created_at',r.created_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.user_theme_preferences r WHERE r.user_id=p_user),'goals',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'definition',r.definition,'revision',r.revision,'deleted_at',r.deleted_at,'created_at',r.created_at,'updated_at',r.updated_at)),'[]'::jsonb) FROM app.goals r WHERE r.user_id=p_user),'cloud_media_sync_operations',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'operation_id',r.operation_id,'entity_type',r.entity_type,'record_id',r.record_id,'operation_type',r.operation_type,'expected_revision',r.expected_revision,'status',r.status,'applied_revision',r.applied_revision,'created_at',r.created_at,'completed_at',r.completed_at)),'[]'::jsonb) FROM app.cloud_media_sync_operations r WHERE r.user_id=p_user),'goal_sync_operations',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'operation_id',r.operation_id,'goal_id',r.goal_id,'operation_kind',r.operation_kind,'status',r.status,'created_at',r.created_at)),'[]'::jsonb) FROM app.goal_sync_operations r WHERE r.user_id=p_user),'embedding_cache','[]'::jsonb,'xp_quest_definitions','[]'::jsonb,'xp_badge_definitions','[]'::jsonb),
'assets',(SELECT coalesce(jsonb_agg(jsonb_build_object('bucket','profile-assets','name',file_key,'ownerId',user_id,'mimeType',mime,'size',size)),'[]'::jsonb) FROM app.native_asset_objects WHERE user_id=p_user AND state='published'));
END; $$;
GRANT EXECUTE ON FUNCTION app.native_account_export_snapshot() TO mt_runtime;
CREATE FUNCTION app.native_privacy_finish(p_user uuid,p_confirmation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_snapshot jsonb; v_entry record; BEGIN
IF NOT (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) OR p_confirmation IS DISTINCT FROM 'ERASE ACCOUNT '||p_user::text OR NOT EXISTS(SELECT FROM app.account_lifecycle WHERE user_id=p_user AND state='ERASING' AND destructive_started AND filesystem_clean) THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
v_snapshot:=app.native_privacy_inspect(p_user);
IF jsonb_array_length(v_snapshot->'assets')<>0 OR jsonb_array_length(v_snapshot->'scopedResiduals')<>0 THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profiles WHERE id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.media_items WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.progress_logs WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.recommendation_feedback WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_username_history WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_modules WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_media_showcase WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_stats_snapshots WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_progression_snapshots WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_shared_notes WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_follows WHERE follower_id=p_user OR following_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_blocks WHERE blocker_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_activity_preferences WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_activity_events WHERE actor_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_activity_comments WHERE author_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_reactions WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_recommendations WHERE sender_id=p_user OR recipient_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_recommendation_events WHERE actor_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_recommendation_messages WHERE author_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_notification_preferences WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_notifications WHERE recipient_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.social_reports WHERE reporter_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_events WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_user_totals WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_user_world_totals WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_user_branch_totals WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_legacy_imports WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_user_quest_progress WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_user_badges WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_media_entitlements WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.xp_local_state_conversions WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.user_theme_preferences WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.goals WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.cloud_media_sync_operations WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.goal_sync_operations WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
IF EXISTS(SELECT FROM app.profile_blocks WHERE blocked_id=p_user) OR EXISTS(SELECT FROM app.social_notifications WHERE actor_id=p_user OR entity_id=p_user) OR EXISTS(SELECT FROM native_auth.session WHERE "userId"=p_user) THEN RAISE EXCEPTION 'privacy_residual_before_auth'; END IF;
DELETE FROM native_auth.verification WHERE identifier=(SELECT email FROM native_auth."user" WHERE id=p_user) OR identifier=p_user::text OR value=p_user::text;
DELETE FROM native_auth."user" WHERE id=p_user;
END; $$;
CREATE FUNCTION app.native_privacy_filesystem_verified(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) OR EXISTS(SELECT FROM app.native_asset_objects WHERE user_id=p_user) THEN RAISE EXCEPTION 'privacy_storage_remaining'; END IF;
UPDATE app.account_lifecycle SET filesystem_clean=true WHERE user_id=p_user AND state='ERASING' AND destructive_started;
IF NOT FOUND THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
END; $$;
CREATE FUNCTION app.native_privacy_record_stage(p_user uuid,p_stage text,p_pass boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
IF NOT (session_user<>'mt_runtime' AND pg_has_role(session_user,'mt_privacy_operator','MEMBER') AND app.current_user_id() IS NULL) OR p_stage NOT IN('lock-pending','write-denial-verify','lock-erasing','application-cleanup','storage-remove','storage-verify','application-verify','barrier-verify','auth-delete','verify') OR p_pass IS NULL THEN RAISE EXCEPTION 'privacy_ops_denied'; END IF;
UPDATE app.account_lifecycle SET last_completed_stage=CASE WHEN p_pass THEN p_stage ELSE last_completed_stage END,failed_stage=CASE WHEN p_pass THEN NULL ELSE p_stage END WHERE user_id=p_user;
END; $$;
GRANT EXECUTE ON FUNCTION app.native_privacy_inspect(uuid),app.native_privacy_cleanup(uuid),app.native_privacy_finish(uuid,text),app.native_privacy_filesystem_verified(uuid),app.native_privacy_record_stage(uuid,text,boolean) TO mt_privacy_operator;
RESET ROLE;
COMMIT;
