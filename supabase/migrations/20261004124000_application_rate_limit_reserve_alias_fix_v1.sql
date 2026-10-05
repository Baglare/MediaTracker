-- Append-only follow-up discovered by the 02D.3A live admission rehearsal.
-- Disambiguate the SQL table alias from the existing PL/pgSQL bucket variable.
begin;
grant media_tracker_limiter to postgres;
grant create on schema private_rate_limit to media_tracker_limiter;
set local role media_tracker_limiter;
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
reset role;
revoke create on schema private_rate_limit from media_tracker_limiter;
revoke media_tracker_limiter from postgres;
commit;
