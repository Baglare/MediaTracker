-- Persistent native limiter. Server verifies HMAC; SQL never receives secret material.
BEGIN;
CREATE ROLE mt_limiter NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT mt_limiter TO CURRENT_USER;
CREATE SCHEMA private_rate_limit AUTHORIZATION mt_limiter;
REVOKE ALL ON SCHEMA private_rate_limit FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO mt_limiter;
GRANT CREATE ON SCHEMA app TO mt_limiter;
SET LOCAL ROLE mt_limiter;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
create table private_rate_limit.policies (
  policy_id text primary key check (length(policy_id) <= 32),
  scope text not null check (length(scope) <= 32),
  identity_limit integer not null check (identity_limit between 1 and 120),
  window_seconds integer not null default 60 check (window_seconds = 60),
  provider text check (provider in ('tvmaze','openlibrary','anilist','tmdb')),
  cost integer not null check (cost between 0 and 3),
  enabled boolean not null default true
);
insert into private_rate_limit.policies(policy_id,scope,identity_limit,provider,cost,enabled) values
('tvmaze_search','search',60,'tvmaze',1,true),
('openlibrary_search','search',60,'openlibrary',1,true),
('tvmaze_details','provider_read',120,'tvmaze',2,true),
('tvmaze_calendar','provider_read',120,'tvmaze',1,true),
('social_read','social_read',60,null,0,true),
('social_write','social_write',30,null,0,true),
('asset_write','asset_write',6,null,0,true),
('xp_sync','xp_sync',6,null,0,true),
('settings_write','settings_write',30,null,0,true),
('interpret','interpret',30,null,0,true),
('recommend','recommend',20,null,0,true),
('funded_ai','funded_ai',20,null,0,false),
('anilist_search','search',60,'anilist',1,false),
('tmdb_search','search',60,'tmdb',1,false),
('anilist_details','provider_read',120,'anilist',1,false),
('tmdb_details','provider_read',120,'tmdb',1,false),
('anilist_calendar','provider_read',120,'anilist',1,false),
('tmdb_calendar','provider_read',120,'tmdb',1,false),
('social_domain','social_domain',30,null,0,true);

create table private_rate_limit.buckets (
  policy_id text not null check (policy_id in ('search','provider_read','social_read','social_write','asset_write','xp_sync','settings_write','interpret','recommend','funded_ai','social_domain','ingress')),
  subject_digest bytea not null check (octet_length(subject_digest)=32),
  epoch bigint not null check (epoch between 0 and 100000),
  count integer not null default 0 check (count between 0 and 120),
  window_start timestamptz not null,
  expires_at timestamptz not null,
  primary key(policy_id,subject_digest,epoch)
);
create index rate_limit_buckets_expiry on private_rate_limit.buckets(expires_at);
create table private_rate_limit.request_receipts (
  nonce uuid primary key,
  envelope_digest bytea not null check (octet_length(envelope_digest)=32),
  expires_at timestamptz not null
);
create index rate_limit_receipts_expiry on private_rate_limit.request_receipts(expires_at);
create table private_rate_limit.capacity (
  table_kind text primary key check (table_kind in ('buckets','receipts')),
  live_rows integer not null check (live_rows >= 0 and live_rows <= hard_cap),
  hard_cap integer not null check (hard_cap in (10000,20000)),
  next_cleanup_at timestamptz not null default '-infinity'
);
insert into private_rate_limit.capacity(table_kind,live_rows,hard_cap) values ('buckets',0,10000),('receipts',0,20000);
create table private_rate_limit.global_state (
  policy_id text primary key check (policy_id in ('dynamic','tvmaze','openlibrary','anilist','tmdb')),
  tokens numeric not null check (tokens >= 0 and tokens <= 20),
  capacity integer not null check (capacity between 1 and 20),
  refill_rate numeric not null check (refill_rate > 0 and refill_rate <= 10),
  refilled_at timestamptz not null default clock_timestamp(),
  blocked_until timestamptz not null default '-infinity',
  cooldown_level integer not null default 0 check (cooldown_level between 0 and 12),
  disabled boolean not null default false,
  daily_count integer not null default 0 check (daily_count between 0 and 5000),
  daily_epoch bigint not null default 0
);
insert into private_rate_limit.global_state(policy_id,tokens,capacity,refill_rate) values
('dynamic',20,20,10),('tvmaze',2,2,1),('openlibrary',1,1,1),('anilist',1,1,1.0/3),('tmdb',1,1,1);
create function private_rate_limit.cleanup_v1(p_batch integer default 500) returns integer
language plpgsql security definer set search_path='' set statement_timeout='500ms' set lock_timeout='100ms' as $$
declare v_now timestamptz:=clock_timestamp(); v_batch integer:=least(500,greatest(0,coalesce(p_batch,0))); v_n integer; v_total integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(207402,1);
  delete from private_rate_limit.buckets where (policy_id,subject_digest,epoch) in
    (select policy_id,subject_digest,epoch from private_rate_limit.buckets where expires_at<=v_now order by expires_at limit v_batch);
  get diagnostics v_n=row_count;
  update private_rate_limit.capacity set live_rows=live_rows-v_n,next_cleanup_at=v_now+interval '1 minute' where table_kind='buckets';
  v_total:=v_n;
  delete from private_rate_limit.request_receipts where nonce in
    (select nonce from private_rate_limit.request_receipts where expires_at<=v_now order by expires_at limit greatest(0,v_batch-v_total));
  get diagnostics v_n=row_count;
  update private_rate_limit.capacity set live_rows=live_rows-v_n,next_cleanup_at=v_now+interval '1 minute' where table_kind='receipts';
  return v_total+v_n;
end $$;
create function private_rate_limit.verify_v1(p_envelope text,p_signature_hex text,p_operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e jsonb; v_key text; v_now bigint:=floor(extract(epoch from clock_timestamp())); v_day bigint:=floor(v_now/86400.0); s jsonb; a jsonb;
begin
  if p_envelope is null or octet_length(p_envelope)>2048 or p_signature_hex is null or p_signature_hex !~ '^[0-9a-f]{64}$' then return null; end if;
  e:=p_envelope::jsonb;
  if jsonb_typeof(e)<>'object' or (select count(*) from jsonb_object_keys(e))<>13
    or e - array['version','operation','audience','key_version','policy_id','identity_class','subjects','ingress','nonce','issued_at','expires_at','cost','cooldown'] <> '{}'::jsonb then return null; end if;
  if exists(select 1 from jsonb_each(e) where value='null'::jsonb)
    or exists(select 1 from jsonb_each(e) where key in ('version','issued_at','expires_at','cost','cooldown') and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]{1,12}$'))
    or exists(select 1 from jsonb_each(e) where key in ('operation','audience','key_version','policy_id','identity_class','nonce') and jsonb_typeof(value)<>'string') then return null; end if;
  -- The direct native runtime is the trusted envelope verifier; no public SQL transport exists.
  if session_user<>'mt_runtime' or e->>'audience' is distinct from current_setting('app.limiter_audience',true) or e->>'key_version' is distinct from current_setting('app.limiter_key_version',true) then return null; end if;
  if e->>'version'<>'1' or e->>'operation'<>p_operation or e->>'identity_class' not in ('user','ip')
    or (e->>'issued_at')::bigint>v_now+5 or (e->>'issued_at')::bigint<v_now-15
    or (e->>'expires_at')::bigint<v_now-5 or (e->>'expires_at')::bigint-(e->>'issued_at')::bigint not between 1 and 10
    or (e->>'nonce') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from private_rate_limit.policies where policy_id=e->>'policy_id' and enabled and cost=(e->>'cost')::integer)
    or jsonb_typeof(e->'subjects')<>'array' or jsonb_array_length(e->'subjects') not between 1 and 4
    or jsonb_typeof(e->'ingress')<>'array' or jsonb_array_length(e->'ingress')>4
    or (e->>'cooldown')::integer not between 0 and 86400
    or (p_operation='consume' and (e->>'cooldown')::integer<>0)
    or (p_operation='cooldown' and ((e->>'cooldown')::integer<1 or not exists(select 1 from private_rate_limit.policies where policy_id=e->>'policy_id' and provider is not null))) then return null; end if;
  foreach a in array array[e->'subjects',e->'ingress'] loop
    for s in select value from jsonb_array_elements(a) loop
      if jsonb_typeof(s)<>'object' or (select count(*) from jsonb_object_keys(s))<>2 or s-array['epoch','digest']<>'{}'::jsonb
        or jsonb_typeof(s->'digest')<>'string' or jsonb_typeof(s->'epoch')<>'number' or s->>'epoch' !~ '^[0-9]{1,6}$'
        or s->>'digest' !~ '^[0-9a-f]{64}$' or (s->>'epoch')::bigint not in (v_day,v_day-1)
        or ((s->>'epoch')::bigint=v_day-1 and v_now%86400>65) then return null; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(a))<>jsonb_array_length(a) then return null; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(e->'subjects') as subject_row(value) where (subject_row.value->>'epoch')::bigint=v_day)
    or (e->>'identity_class'='ip' and jsonb_array_length(e->'ingress')=0) then return null; end if;
  return e;
exception when others then return null;
end $$;
create or replace function private_rate_limit.reserve_v1(p_policy text,p_subjects jsonb,p_ingress jsonb,p_nonce uuid,p_envelope_digest bytea,p_cooldown integer default 0) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='500ms' set lock_timeout='100ms' as $$
declare p private_rate_limit.policies%rowtype; b private_rate_limit.buckets%rowtype; g private_rate_limit.global_state%rowtype;
 v_now timestamptz; v_day bigint; v_wait integer:=0; v_n integer; v_needed integer; s record; v_tokens numeric; v_count integer;
begin
  -- One fixed transaction lock orders all shared admission/bucket/capacity locks.
  -- Serializes missing rows and ALL affected budgets; contention fails within 100ms.
  perform pg_catalog.pg_advisory_xact_lock(207402,1);
  v_now:=clock_timestamp(); v_day:=floor(extract(epoch from v_now)/86400);
  select * into strict p from private_rate_limit.policies where policy_id=p_policy and enabled;
  if exists(select 1 from private_rate_limit.capacity where next_cleanup_at<=v_now) then perform private_rate_limit.cleanup_v1(500); end if;
  if p_nonce is not null then
    if exists(select 1 from private_rate_limit.request_receipts where nonce=p_nonce) then return jsonb_build_object('allowed',false,'reason','replay','retry_after_seconds',5); end if;
    if exists(select 1 from private_rate_limit.capacity where table_kind='receipts' and live_rows>=hard_cap) then return jsonb_build_object('allowed',false,'reason','capacity','retry_after_seconds',5); end if;
    insert into private_rate_limit.request_receipts values(p_nonce,p_envelope_digest,v_now+interval '60 seconds');
    update private_rate_limit.capacity set live_rows=live_rows+1 where table_kind='receipts';
  end if;
  if p_cooldown>0 then
    update private_rate_limit.global_state set blocked_until=greatest(blocked_until,v_now+make_interval(secs=>least(86400,greatest(p_cooldown,30*power(2,least(11,cooldown_level))::integer)))),
      disabled=disabled or p_cooldown>=86400,cooldown_level=least(12,cooldown_level+1) where policy_id=p.provider;
    select least(86400,ceil(extract(epoch from blocked_until-v_now))::integer) into v_wait from private_rate_limit.global_state where policy_id=p.provider;
    return jsonb_build_object('allowed',true,'reason','allowed','retry_after_seconds',v_wait);
  end if;
  select count(*) into v_needed from (
    select p.scope scope,decode(value->>'digest','hex') digest,(value->>'epoch')::bigint epoch from jsonb_array_elements(p_subjects)
    union select 'ingress',decode(value->>'digest','hex'),(value->>'epoch')::bigint from jsonb_array_elements(p_ingress)
  ) x where not exists(select 1 from private_rate_limit.buckets as stored_bucket where stored_bucket.policy_id=x.scope and stored_bucket.subject_digest=x.digest and stored_bucket.epoch=x.epoch);
  if exists(select 1 from private_rate_limit.capacity where table_kind='buckets' and live_rows+v_needed>hard_cap) then return jsonb_build_object('allowed',false,'reason','capacity','retry_after_seconds',5); end if;
  for s in select p.scope scope,decode(value->>'digest','hex') digest,(value->>'epoch')::bigint epoch,p.identity_limit quota from jsonb_array_elements(p_subjects)
    union select 'ingress',decode(value->>'digest','hex'),(value->>'epoch')::bigint,120 from jsonb_array_elements(p_ingress)
    order by 1,2,3 loop
    insert into private_rate_limit.buckets(policy_id,subject_digest,epoch,window_start,expires_at)
      values(s.scope,s.digest,s.epoch,v_now,v_now+interval '16 minutes') on conflict do nothing;
    get diagnostics v_n=row_count;
    update private_rate_limit.capacity set live_rows=live_rows+v_n where table_kind='buckets';
    select * into strict b from private_rate_limit.buckets where policy_id=s.scope and subject_digest=s.digest and epoch=s.epoch for update;
    if b.window_start+interval '60 seconds'>v_now and b.count>=s.quota then v_wait:=greatest(v_wait,ceil(extract(epoch from b.window_start+interval '60 seconds'-v_now))::integer); end if;
  end loop;
  for g in select * from private_rate_limit.global_state where (policy_id='dynamic' and p_policy<>'social_domain') or policy_id=p.provider order by policy_id for update loop
    v_tokens:=least(g.capacity,g.tokens+greatest(0,extract(epoch from v_now-g.refilled_at))*g.refill_rate);
    v_count:=case when g.policy_id='dynamic' then 1 else p.cost end;
    if v_tokens<v_count then v_wait:=greatest(v_wait,ceil((v_count-v_tokens)/g.refill_rate)::integer); end if;
    if g.blocked_until>v_now then v_wait:=greatest(v_wait,ceil(extract(epoch from g.blocked_until-v_now))::integer); end if;
    if g.disabled then v_wait:=86400; end if;
    if g.policy_id='dynamic' and g.daily_epoch=v_day and g.daily_count>=5000 then v_wait:=greatest(v_wait,ceil((v_day+1)*86400-extract(epoch from v_now))::integer); end if;
  end loop;
  if v_wait>0 then return jsonb_build_object('allowed',false,'reason','limited','retry_after_seconds',least(86400,greatest(1,v_wait))); end if;
  -- Debit only after EVERY budget passed; denials never partially debit quotas.
  for s in select p.scope scope,decode(value->>'digest','hex') digest,(value->>'epoch')::bigint epoch from jsonb_array_elements(p_subjects)
    union select 'ingress',decode(value->>'digest','hex'),(value->>'epoch')::bigint from jsonb_array_elements(p_ingress) loop
    update private_rate_limit.buckets set count=case when window_start+interval '60 seconds'<=v_now then 1 else count+1 end,
      window_start=case when window_start+interval '60 seconds'<=v_now then v_now else window_start end,
      expires_at=case when window_start+interval '60 seconds'<=v_now then v_now+interval '16 minutes' else window_start+interval '16 minutes' end
      where policy_id=s.scope and subject_digest=s.digest and epoch=s.epoch;
  end loop;
  update private_rate_limit.global_state set tokens=least(capacity,tokens+greatest(0,extract(epoch from v_now-refilled_at))*refill_rate)-case when policy_id='dynamic' then 1 else p.cost end,
    refilled_at=v_now,daily_count=case when policy_id='dynamic' then case when daily_epoch=v_day then daily_count+1 else 1 end else daily_count end,
    daily_epoch=case when policy_id='dynamic' then v_day else daily_epoch end,
    cooldown_level=case when blocked_until<v_now-interval '1 hour' then 0 else cooldown_level end
    where (policy_id='dynamic' and p_policy<>'social_domain') or policy_id=p.provider;
  return jsonb_build_object('allowed',true,'reason','allowed','retry_after_seconds',0);
end $$;
create function app.consume_application_rate_limit_v1(p_envelope text,p_signature_hex text) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='500ms' set lock_timeout='100ms' as $$
declare e jsonb;
begin
  e:=private_rate_limit.verify_v1(p_envelope,p_signature_hex,'consume');
  if e is null then raise exception using message='rate_limit_proof_invalid',errcode='42501'; end if;
  return private_rate_limit.reserve_v1(e->>'policy_id',e->'subjects',e->'ingress',(e->>'nonce')::uuid,pg_catalog.sha256(convert_to(p_envelope,'UTF8')));
end $$;
create function app.report_provider_cooldown_v1(p_envelope text,p_signature_hex text) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='500ms' set lock_timeout='100ms' as $$
declare e jsonb;
begin
  e:=private_rate_limit.verify_v1(p_envelope,p_signature_hex,'cooldown');
  if e is null then raise exception using message='rate_limit_proof_invalid',errcode='42501'; end if;
  return private_rate_limit.reserve_v1(e->>'policy_id',e->'subjects',e->'ingress',(e->>'nonce')::uuid,pg_catalog.sha256(convert_to(p_envelope,'UTF8')),(e->>'cooldown')::integer);
end $$;
CREATE FUNCTION private_rate_limit.consume_authenticated_v1(p_policy text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_subjects jsonb; v_result jsonb; v_user uuid:=app.current_user_id(); v_day bigint:=floor(extract(epoch from clock_timestamp())/86400);
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 IF p_policy<>'social_domain' THEN RAISE EXCEPTION 'rate_limit_policy_invalid'; END IF;
 v_subjects:=nullif(current_setting('app.social_subjects',true),'')::jsonb;
 IF v_subjects IS NULL OR jsonb_typeof(v_subjects)<>'array' OR jsonb_array_length(v_subjects) NOT BETWEEN 1 AND 4 OR EXISTS(SELECT FROM jsonb_array_elements(v_subjects) s WHERE s->>'digest' !~ '^[0-9a-f]{64}$' OR (s->>'epoch')::bigint NOT BETWEEN v_day-1 AND v_day) THEN RAISE EXCEPTION 'rate_limit_unavailable'; END IF;
 v_result:=private_rate_limit.reserve_v1(p_policy,v_subjects,'[]'::jsonb,null,null);
 IF NOT (v_result->>'allowed')::boolean THEN
  IF v_result->>'reason'='limited' THEN RAISE EXCEPTION 'rate_limited'; END IF;
  RAISE EXCEPTION 'rate_limit_unavailable';
 END IF;
END; $$;
REVOKE ALL ON FUNCTION private_rate_limit.consume_authenticated_v1(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA private_rate_limit TO mt_owner,mt_privacy_operator;
GRANT EXECUTE ON FUNCTION private_rate_limit.consume_authenticated_v1(text) TO mt_owner;
GRANT EXECUTE ON FUNCTION private_rate_limit.cleanup_v1(integer) TO mt_privacy_operator;
REVOKE ALL ON FUNCTION app.consume_application_rate_limit_v1(text,text),app.report_provider_cooldown_v1(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_application_rate_limit_v1(text,text),app.report_provider_cooldown_v1(text,text) TO mt_runtime;
ALTER TABLE private_rate_limit.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_rate_limit.policies FORCE ROW LEVEL SECURITY;
CREATE POLICY limiter_internal ON private_rate_limit.policies TO mt_limiter USING(current_user='mt_limiter') WITH CHECK(current_user='mt_limiter');
REVOKE ALL ON private_rate_limit.policies FROM PUBLIC,mt_runtime;
ALTER TABLE private_rate_limit.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_rate_limit.buckets FORCE ROW LEVEL SECURITY;
CREATE POLICY limiter_internal ON private_rate_limit.buckets TO mt_limiter USING(current_user='mt_limiter') WITH CHECK(current_user='mt_limiter');
REVOKE ALL ON private_rate_limit.buckets FROM PUBLIC,mt_runtime;
ALTER TABLE private_rate_limit.request_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_rate_limit.request_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY limiter_internal ON private_rate_limit.request_receipts TO mt_limiter USING(current_user='mt_limiter') WITH CHECK(current_user='mt_limiter');
REVOKE ALL ON private_rate_limit.request_receipts FROM PUBLIC,mt_runtime;
ALTER TABLE private_rate_limit.capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_rate_limit.capacity FORCE ROW LEVEL SECURITY;
CREATE POLICY limiter_internal ON private_rate_limit.capacity TO mt_limiter USING(current_user='mt_limiter') WITH CHECK(current_user='mt_limiter');
REVOKE ALL ON private_rate_limit.capacity FROM PUBLIC,mt_runtime;
ALTER TABLE private_rate_limit.global_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_rate_limit.global_state FORCE ROW LEVEL SECURITY;
CREATE POLICY limiter_internal ON private_rate_limit.global_state TO mt_limiter USING(current_user='mt_limiter') WITH CHECK(current_user='mt_limiter');
REVOKE ALL ON private_rate_limit.global_state FROM PUBLIC,mt_runtime;
RESET ROLE;
SET LOCAL ROLE mt_owner;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO mt_limiter;
create or replace function app.social_comment(p_activity uuid,p_parent uuid,p_body text,p_spoiler boolean,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=app.current_user_id(); v_activity app.social_activity_events%rowtype; v_parent app.social_activity_comments%rowtype; v_root uuid; v_id uuid; v_target uuid; v_type text;
begin
  -- Same transaction: auth.uid quota and serialization of existing domain limits.
  perform private_rate_limit.consume_authenticated_v1('social_domain');
  if v_user is null then raise exception 'authentication_required'; end if;
  if length(btrim(coalesce(p_body,''))) not between 1 and 1000 or p_body ~ '[<>]' then raise exception 'invalid_comment'; end if;
  select * into v_activity from app.social_activity_events where id=p_activity and deleted_at is null;
  if not found or not app.social_can_view_activity_row(v_activity.actor_id,v_activity.visibility,v_user) then raise exception 'activity_unavailable'; end if;
  if (select count(*) from app.social_activity_comments where author_id=v_user and created_at>=now()-interval '1 hour')>=60 then raise exception 'rate_limit'; end if;
  if exists(select 1 from app.social_activity_comments where author_id=v_user and activity_id=p_activity and body=btrim(p_body) and created_at>=now()-interval '2 minutes') then raise exception 'duplicate_comment'; end if;
  if p_parent is not null then
    select * into v_parent from app.social_activity_comments where id=p_parent and activity_id=p_activity and deleted_at is null and hidden_by_owner_at is null;
    if not found then raise exception 'parent_comment_unavailable'; end if;
    v_root:=coalesce(v_parent.parent_comment_id,v_parent.id); v_target:=v_parent.author_id; v_type:='comment_reply';
  else v_root:=null; v_target:=v_activity.actor_id; v_type:='activity_comment'; end if;
  insert into app.social_activity_comments(activity_id,author_id,parent_comment_id,body,spoiler,dedupe_key)
  values(p_activity,v_user,v_root,btrim(p_body),coalesce(p_spoiler,false),p_dedupe_key) returning id into v_id;
  perform app.social_insert_notification(v_target,v_user,v_type,case when v_type='comment_reply' then 'comment' else 'activity' end,case when v_type='comment_reply' then v_id else p_activity end,jsonb_build_object('activityId',p_activity),v_type||':'||v_id::text);
  return jsonb_build_object('ok',true,'id',v_id,'parentCommentId',v_root);
end;
$$;

create or replace function app.social_react(p_activity uuid,p_comment uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=app.current_user_id(); v_existing text; v_activity app.social_activity_events%rowtype; v_comment app.social_activity_comments%rowtype; v_owner uuid; v_id uuid; v_type text;
begin
  -- Same transaction: auth.uid quota and serialization of existing domain limits.
  perform private_rate_limit.consume_authenticated_v1('social_domain');
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_reaction not in ('like','love','interesting','celebrate') then raise exception 'invalid_reaction'; end if;
  if (p_activity is null)::integer+(p_comment is null)::integer<>1 then raise exception 'invalid_target'; end if;
  if (select count(*) from app.social_reactions where user_id=v_user and created_at>=now()-interval '1 hour')>=120 then raise exception 'rate_limit'; end if;
  if p_activity is not null then
    select * into v_activity from app.social_activity_events where id=p_activity and deleted_at is null;
    v_owner:=v_activity.actor_id; v_type:='activity_reaction';
    if not found or not app.social_can_view_activity_row(v_owner,v_activity.visibility,v_user) then raise exception 'target_unavailable'; end if;
    select reaction_type into v_existing from app.social_reactions where user_id=v_user and activity_id=p_activity;
    if v_existing=p_reaction then delete from app.social_reactions where user_id=v_user and activity_id=p_activity; return jsonb_build_object('ok',true,'reaction',null); end if;
    insert into app.social_reactions(user_id,activity_id,reaction_type) values(v_user,p_activity,p_reaction)
    on conflict(user_id,activity_id) where activity_id is not null do update set reaction_type=excluded.reaction_type,updated_at=now() returning id into v_id;
  else
    select c.*
    into v_comment
    from app.social_activity_comments c
    where c.id=p_comment
      and c.deleted_at is null
      and c.hidden_by_owner_at is null;

    if not found then
      raise exception 'target_unavailable';
    end if;

    select a.*
    into v_activity
    from app.social_activity_events a
    where a.id=v_comment.activity_id
      and a.deleted_at is null;

    if not found then
      raise exception 'target_unavailable';
    end if;

    v_owner:=v_comment.author_id;
    v_type:='comment_reaction';
    if not app.social_can_view_activity_row(v_activity.actor_id,v_activity.visibility,v_user) then raise exception 'target_unavailable'; end if;
    select reaction_type into v_existing from app.social_reactions where user_id=v_user and comment_id=p_comment;
    if v_existing=p_reaction then delete from app.social_reactions where user_id=v_user and comment_id=p_comment; return jsonb_build_object('ok',true,'reaction',null); end if;
    insert into app.social_reactions(user_id,comment_id,reaction_type) values(v_user,p_comment,p_reaction)
    on conflict(user_id,comment_id) where comment_id is not null do update set reaction_type=excluded.reaction_type,updated_at=now() returning id into v_id;
  end if;
  perform app.social_insert_notification(v_owner,v_user,v_type,case when p_activity is not null then 'activity' else 'comment' end,coalesce(p_activity,p_comment),jsonb_build_object('reaction',p_reaction),v_type||':'||coalesce(p_activity,p_comment)::text||':'||v_user::text);
  return jsonb_build_object('ok',true,'reaction',p_reaction);
end;
$$;

create or replace function app.social_send_recommendation(p_recipient uuid,p_media jsonb,p_sender_note text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=app.current_user_id(); v_permission text; v_mode text; v_key text; v_id uuid;
begin
  -- Same transaction: auth.uid quota and serialization of existing domain limits.
  perform private_rate_limit.consume_authenticated_v1('social_domain');
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_recipient=v_user then raise exception 'self_recommendation_not_allowed'; end if;
  if app.social_is_blocked(v_user,p_recipient) then raise exception 'profile_unavailable'; end if;
  select recommendation_permission,visibility_mode into v_permission,v_mode from app.profiles where id=p_recipient and username is not null and deleted_at is null;
  if v_mode is null or v_mode='personal' or v_permission='none' then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='mutual' and not (exists(select 1 from app.profile_follows where follower_id=v_user and following_id=p_recipient and status='accepted') and exists(select 1 from app.profile_follows where follower_id=p_recipient and following_id=v_user and status='accepted')) then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='following' and not exists(select 1 from app.profile_follows where follower_id=p_recipient and following_id=v_user and status='accepted') then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='followers' and not exists(select 1 from app.profile_follows where follower_id=v_user and following_id=p_recipient and status='accepted') then raise exception 'recommendation_not_allowed'; end if;
  if jsonb_typeof(p_media)<>'object' or length(coalesce(p_media->>'title','')) not between 1 and 180 or coalesce(p_media->>'mediaType','') not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') or coalesce(p_media->>'world','') not in ('east','screen','arch') then raise exception 'invalid_media_snapshot'; end if;
  if length(coalesce(p_sender_note,''))>500 or coalesce(p_sender_note,'') ~ '[<>]' then raise exception 'invalid_sender_note'; end if;
  v_key:=case when nullif(p_media->>'externalSource','') is not null and nullif(p_media->>'externalId','') is not null
    then lower((p_media->>'externalSource')||':'||(p_media->>'externalId'))
    else lower('local:'||(p_media->>'mediaType')||':'||(p_media->>'title')) end;
  if length(coalesce(v_key,''))<3 then raise exception 'invalid_media_key'; end if;
  if (select count(*) from app.social_recommendations where sender_id=v_user and created_at>=date_trunc('day',now()))>=10 then raise exception 'rate_limit'; end if;
  if (select count(*) from app.social_recommendations where sender_id=v_user and recipient_id=p_recipient and (response_status in ('pending','deferred') or (response_status='accepted' and progress_status<>'completed')))>=5 then raise exception 'recipient_open_limit'; end if;
  if exists(select 1 from app.social_recommendations where sender_id=v_user and recipient_id=p_recipient and canonical_media_key=v_key and (response_status in ('pending','deferred') or (response_status='accepted' and progress_status<>'completed'))) then raise exception 'duplicate_recommendation'; end if;
  insert into app.social_recommendations(sender_id,recipient_id,sender_note,media_snapshot,canonical_media_key,dedupe_key)
  values(v_user,p_recipient,nullif(btrim(p_sender_note),''),p_media||jsonb_build_object('canonicalKey',v_key),v_key,p_dedupe_key) returning id into v_id;
  insert into app.social_recommendation_events(recommendation_id,actor_id,event_type,dedupe_key) values(v_id,v_user,'sent','sent:'||p_dedupe_key);
  perform app.social_insert_notification(p_recipient,v_user,'recommendation_received','recommendation',v_id,jsonb_build_object('title',p_media->>'title'),'recommendation_received:'||v_id::text);
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function app.social_send_recommendation_message(p_recommendation uuid,p_body text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=app.current_user_id(); v_id uuid;
begin
  -- Same transaction: auth.uid quota and serialization of existing domain limits.
  perform private_rate_limit.consume_authenticated_v1('social_domain');
  if v_user is null then raise exception 'authentication_required'; end if;
  v_id:=app.social_insert_recommendation_message(p_recommendation,v_user,p_body,p_dedupe_key,false);
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function app.social_publish_activity(p_event_type text,p_visibility text,p_media jsonb,p_rating integer,p_short_text text,p_source_event_id text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=app.current_user_id(); v_id uuid; v_profile_mode text;
begin
  perform private_rate_limit.consume_authenticated_v1('social_domain');
  if v_user is null then raise exception 'authentication_required'; end if;
  select visibility_mode into v_profile_mode from app.profiles where id=v_user and username is not null and deleted_at is null;
  if v_profile_mode is null then raise exception 'social_profile_required'; end if;
  if p_event_type not in ('media_started','media_completed','rating_shared','favorite_shared','shared_note_published','recommendation_completed','manual_media_share') then raise exception 'invalid_activity_type'; end if;
  if p_visibility not in ('public','followers','mutual','self') then raise exception 'invalid_visibility'; end if;
  if jsonb_typeof(p_media)<>'object' or length(coalesce(p_media->>'title','')) not between 1 and 180 or coalesce(p_media->>'mediaType','') not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') or coalesce(p_media->>'world','') not in ('east','screen','arch') then raise exception 'invalid_media_snapshot'; end if;
  if p_event_type='manual_media_share' and (select count(*) from app.social_activity_events where actor_id=v_user and event_type='manual_media_share' and created_at >= now()-interval '1 day') >= 30 then raise exception 'rate_limit'; end if;
  insert into app.social_activity_events(actor_id,event_type,visibility,media_snapshot,rating,short_text,source_event_id,dedupe_key)
  values(v_user,p_event_type,case when v_profile_mode='personal' then 'self' else p_visibility end,p_media,p_rating,nullif(btrim(p_short_text),''),p_source_event_id,p_dedupe_key)
  on conflict(actor_id,dedupe_key) do update set updated_at=app.social_activity_events.updated_at returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function app.social_recommendation_transition(
  p_recommendation uuid,
  p_action text,
  p_response_note text default null,
  p_already_in_library boolean default false,
  p_dedupe_key text default null,
  p_response_message text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=app.current_user_id(); v_rec app.social_recommendations%rowtype; v_event text; v_notify text; v_recipient uuid; v_message_id uuid;
begin
  perform private_rate_limit.consume_authenticated_v1('social_domain');
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from app.social_recommendations where id=p_recommendation for update;
  if not found then raise exception 'recommendation_not_found'; end if;
  if app.social_is_blocked(v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if length(coalesce(p_response_note,''))>300 or coalesce(p_response_note,'') ~ '[<>]' then raise exception 'invalid_response_note'; end if;
  if p_response_message is not null and (length(btrim(p_response_message)) not between 1 and 500 or p_response_message ~ '[<>]') then raise exception 'invalid_recommendation_message'; end if;
  if p_action in ('accept','defer','reject') then
    if v_user<>v_rec.recipient_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    if p_action='accept' then update app.social_recommendations set response_status='accepted',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='accepted'; v_notify:='recommendation_accepted';
    elsif p_action='defer' then update app.social_recommendations set response_status='deferred',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='deferred'; v_notify:='recommendation_deferred';
    else update app.social_recommendations set response_status='rejected',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='rejected'; v_notify:='recommendation_rejected'; end if;
    v_recipient:=v_rec.sender_id;
  elsif p_action='withdraw' then
    if v_user<>v_rec.sender_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    update app.social_recommendations set response_status='withdrawn',withdrawn_at=now() where id=p_recommendation; v_event:='withdrawn'; v_notify:='recommendation_withdrawn'; v_recipient:=v_rec.recipient_id;
  elsif p_action in ('linked','started','completed') then
    if v_user<>v_rec.recipient_id or v_rec.response_status<>'accepted' then raise exception 'invalid_transition'; end if;
    if p_action='linked' and v_rec.progress_status='none' then update app.social_recommendations set progress_status='linked',already_in_library=coalesce(p_already_in_library,false) where id=p_recommendation;
    elsif p_action='started' and v_rec.progress_status in ('linked','none') then update app.social_recommendations set progress_status='started',started_at=coalesce(started_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status in ('linked','started') then update app.social_recommendations set progress_status='completed',started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status='completed' then return jsonb_build_object('ok',true,'idempotent',true);
    else raise exception 'invalid_transition'; end if;
    v_event:=p_action; v_notify:=case when p_action='started' then 'recommendation_started' when p_action='completed' then 'recommendation_completed' else null end; v_recipient:=v_rec.sender_id;
  else raise exception 'invalid_transition'; end if;
  insert into app.social_recommendation_events(recommendation_id,actor_id,event_type,dedupe_key,safe_metadata)
  values(p_recommendation,v_user,v_event,coalesce(nullif(p_dedupe_key,''),v_event||':'||p_recommendation::text),jsonb_build_object('alreadyInLibrary',coalesce(p_already_in_library,false))) on conflict(recommendation_id,dedupe_key) do nothing;
  if v_notify is not null then perform app.social_insert_notification(v_recipient,v_user,v_notify,'recommendation',p_recommendation,jsonb_build_object('title',v_rec.media_snapshot->>'title'),v_notify||':'||p_recommendation::text); end if;
  if nullif(btrim(coalesce(p_response_message,'')),'') is not null then
    if p_action not in ('accept','defer','reject') then raise exception 'response_message_not_allowed'; end if;
    v_message_id:=app.social_insert_recommendation_message(p_recommendation,v_user,p_response_message,'response:'||coalesce(nullif(p_dedupe_key,''),v_event||':'||p_recommendation::text),p_action='reject');
  end if;
  if v_event='completed' and coalesce((select share_recommendation_completed from app.social_activity_preferences where user_id=v_user),false) then
    insert into app.social_activity_events(actor_id,event_type,visibility,media_snapshot,source_event_id,dedupe_key)
    values(v_user,'recommendation_completed',coalesce((select default_visibility from app.social_activity_preferences where user_id=v_user),'followers'),v_rec.media_snapshot,'recommendation:'||p_recommendation::text,'recommendation_completed:'||p_recommendation::text)
    on conflict(actor_id,dedupe_key) do nothing;
  end if;
  return jsonb_build_object('ok',true,'recommendationId',p_recommendation,'responseStatus',(select response_status from app.social_recommendations where id=p_recommendation),'progressStatus',(select progress_status from app.social_recommendations where id=p_recommendation),'messageId',v_message_id,'media',v_rec.media_snapshot);
end;
$$;

-- Scheduler/admin uses private cleanup. No public reset or introspection.


RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM mt_limiter;
COMMIT;
