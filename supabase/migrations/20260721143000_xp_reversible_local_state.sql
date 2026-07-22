-- BEGIN XP REVERSIBLE LOCAL STATE

alter table public.xp_events
  add column if not exists event_action text not null default 'grant',
  add column if not exists effect smallint not null default 1;

alter table public.xp_events drop constraint if exists xp_events_action_check;
alter table public.xp_events add constraint xp_events_action_check
  check (event_action in ('grant','revoke','restore') and
    ((event_action='revoke' and effect=-1) or (event_action in ('grant','restore') and effect=1)));

create table if not exists public.xp_media_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_media_key text not null,
  entitlement_type text not null check (entitlement_type in ('media_started','media_completed','media_rated','review_published','showcase_curated')),
  world_key text check (world_key is null or world_key in ('east','screen','arch')),
  is_active boolean not null default false,
  activated_at timestamptz,
  deactivated_at timestamptz,
  last_state_hash text not null,
  allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(allocations)='array'),
  updated_at timestamptz not null default now(),
  primary key (user_id,canonical_media_key,entitlement_type),
  check (length(canonical_media_key) between 3 and 220),
  check ((is_active and activated_at is not null and deactivated_at is null) or not is_active)
);

create table if not exists public.xp_local_state_conversions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  correction_event_id uuid references public.xp_events(id),
  converted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object')
);

alter table public.xp_media_entitlements enable row level security;
alter table public.xp_local_state_conversions enable row level security;
drop policy if exists xp_media_entitlements_select_own on public.xp_media_entitlements;
create policy xp_media_entitlements_select_own on public.xp_media_entitlements for select to authenticated using (user_id=auth.uid());
drop policy if exists xp_local_state_conversions_select_own on public.xp_local_state_conversions;
create policy xp_local_state_conversions_select_own on public.xp_local_state_conversions for select to authenticated using (user_id=auth.uid());
revoke insert,update,delete on public.xp_media_entitlements,public.xp_local_state_conversions from anon,authenticated;
grant select on public.xp_media_entitlements,public.xp_local_state_conversions to authenticated;

create or replace function public.xp_repair_selected_title(p_user uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_selected text; v_fallback text; v_known_world_title boolean; v_still_earned boolean;
begin
  select selected_title into v_selected from public.profiles where id=p_user;
  if v_selected is null then return; end if;
  select v_selected=any(array[
    'Doğu Yolcusu','Mürekkep İzleyicisi','Katana Arşivcisi','Doğu Ustası',
    'Kadraj Gezgini','Sahne Takipçisi','Projektör Avcısı','Kadraj Ustası',
    'Arşiv Yolcusu','Sayfa Toplayıcısı','Mühür Muhafızı','Arşiv Ustası'
  ]) into v_known_world_title;
  if not v_known_world_title then return; end if;
  select exists(
    select 1 from public.xp_user_world_totals w where w.user_id=p_user and (
      v_selected=public.xp_world_title(w.world_key,1) or
      (w.level>=6 and v_selected=public.xp_world_title(w.world_key,6)) or
      (w.level>=11 and v_selected=public.xp_world_title(w.world_key,11)) or
      (w.level>=21 and v_selected=public.xp_world_title(w.world_key,21))
    )
  ) into v_still_earned;
  if v_still_earned then return; end if;
  select title into v_fallback from public.xp_user_world_totals where user_id=p_user and xp>0 order by xp desc,world_key asc limit 1;
  update public.profiles set selected_title=v_fallback,updated_at=now() where id=p_user;
end;
$$;
revoke all on function public.xp_repair_selected_title(uuid) from public;

create or replace function public.xp_apply_adjustment(
  p_user uuid,p_event_type text,p_trust_level text,p_source_type text,p_source_id text,
  p_canonical_key text,p_action text,p_metadata jsonb,p_allocations jsonb,p_evaluate boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event uuid; v_allocation jsonb; v_axis text; v_key text; v_amount integer; v_delta integer; v_total bigint; v_level integer; v_dedupe text;
begin
  if p_user is null or p_action not in ('grant','revoke','restore') or jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception 'invalid_xp_adjustment'; end if;
  v_dedupe:='state:'||p_user::text||':'||coalesce(p_canonical_key,p_source_id,'global')||':'||p_event_type||':'||p_action||':'||gen_random_uuid()::text;
  insert into public.xp_events(user_id,event_type,trust_level,source_type,source_id,canonical_key,dedupe_key,metadata,event_action,effect)
  values(p_user,p_event_type,p_trust_level,p_source_type,p_source_id,p_canonical_key,v_dedupe,coalesce(p_metadata,'{}'::jsonb),p_action,case when p_action='revoke' then -1 else 1 end)
  returning id into v_event;
  for v_allocation in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    v_axis:=v_allocation->>'axisType'; v_key:=v_allocation->>'axisKey';
    if jsonb_typeof(v_allocation->'amount')<>'number' then raise exception 'invalid_xp_allocation'; end if;
    v_amount:=(v_allocation->>'amount')::integer;
    if v_amount<=0 then raise exception 'invalid_xp_allocation'; end if;
    v_delta:=case when p_action='revoke' then -v_amount else v_amount end;
    insert into public.xp_event_allocations(event_id,axis_type,axis_key,amount) values(v_event,v_axis,v_key,v_amount);
    if v_axis='general' then
      insert into public.xp_user_totals(user_id,total_xp) values(p_user,greatest(0,v_delta))
      on conflict(user_id) do update set total_xp=greatest(0,public.xp_user_totals.total_xp+v_delta),updated_at=now();
    elsif v_axis='world' then
      insert into public.xp_user_world_totals(user_id,world_key,xp,level,tier,title)
      values(p_user,v_key,greatest(0,v_delta),1,'basic',public.xp_world_title(v_key,1))
      on conflict(user_id,world_key) do update set xp=greatest(0,public.xp_user_world_totals.xp+v_delta),updated_at=now();
    elsif v_axis='branch' then
      insert into public.xp_user_branch_totals(user_id,branch_key,xp,level,tier)
      values(p_user,v_key,greatest(0,v_delta),1,'basic')
      on conflict(user_id,branch_key) do update set xp=greatest(0,public.xp_user_branch_totals.xp+v_delta),updated_at=now();
    else raise exception 'invalid_xp_axis'; end if;
  end loop;
  select coalesce(total_xp,0) into v_total from public.xp_user_totals where user_id=p_user;
  v_level:=public.xp_general_level(coalesce(v_total,0));
  update public.xp_user_totals set level=v_level,current_level_start_xp=((v_level-1)::bigint*(v_level-1)*100),next_level_start_xp=(v_level::bigint*v_level*100),updated_at=now() where user_id=p_user;
  update public.xp_user_world_totals set level=public.xp_world_level(xp),tier=public.xp_tier(public.xp_world_level(xp)),title=public.xp_world_title(world_key,public.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  update public.xp_user_branch_totals set level=public.xp_world_level(xp),tier=public.xp_tier(public.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  if p_action='revoke' then perform public.xp_repair_selected_title(p_user); elsif p_evaluate then perform public.xp_evaluate_quests(p_user); end if;
  return jsonb_build_object('ok',true,'eventId',v_event,'action',p_action,'effect',case when p_action='revoke' then -1 else 1 end,'totalXp',coalesce(v_total,0),'level',v_level);
end;
$$;
revoke all on function public.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public;

create or replace function public.xp_reconcile_entitlement(
  p_user uuid,p_canonical text,p_type text,p_desired boolean,p_world text,p_state_hash text,p_metadata jsonb,p_allocations jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.xp_media_entitlements%rowtype; v_action text; v_result jsonb; v_changed_allocations boolean;
begin
  if p_user is null or p_type not in ('media_started','media_completed','media_rated','review_published','showcase_curated') or length(p_canonical) not between 3 and 220 or length(p_state_hash) not between 1 and 128 then raise exception 'invalid_media_entitlement'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||lower(p_canonical)||':'||p_type,0));
  select * into v_existing from public.xp_media_entitlements where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type for update;
  if not found then
    if not p_desired then return jsonb_build_object('changed',false); end if;
    v_action:='grant';
    v_result:=public.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),v_action,p_metadata,p_allocations,true);
    insert into public.xp_media_entitlements(user_id,canonical_media_key,entitlement_type,world_key,is_active,activated_at,last_state_hash,allocations)
    values(p_user,lower(p_canonical),p_type,p_world,true,now(),p_state_hash,p_allocations);
    return v_result||jsonb_build_object('changed',true);
  end if;
  v_changed_allocations:=v_existing.world_key is distinct from p_world or v_existing.allocations is distinct from p_allocations;
  if v_existing.is_active and not p_desired then
    v_result:=public.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'revoke',p_metadata||jsonb_build_object('previousAllocations',v_existing.allocations),v_existing.allocations,false);
    update public.xp_media_entitlements set is_active=false,deactivated_at=now(),last_state_hash=p_state_hash,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
    return v_result||jsonb_build_object('changed',true);
  elsif v_existing.is_active and p_desired and v_changed_allocations then
    perform public.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'revoke',p_metadata||jsonb_build_object('reason','state_reallocation'),v_existing.allocations,false);
    v_result:=public.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'restore',p_metadata,p_allocations,true);
    update public.xp_media_entitlements set world_key=p_world,is_active=true,activated_at=now(),deactivated_at=null,last_state_hash=p_state_hash,allocations=p_allocations,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
    return v_result||jsonb_build_object('changed',true);
  elsif not v_existing.is_active and p_desired then
    v_result:=public.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'restore',p_metadata,p_allocations,true);
    update public.xp_media_entitlements set world_key=p_world,is_active=true,activated_at=now(),deactivated_at=null,last_state_hash=p_state_hash,allocations=p_allocations,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
    return v_result||jsonb_build_object('changed',true);
  end if;
  update public.xp_media_entitlements set last_state_hash=p_state_hash,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
  return jsonb_build_object('changed',false);
end;
$$;
revoke all on function public.xp_reconcile_entitlement(uuid,text,text,boolean,text,text,jsonb,jsonb) from public;

create or replace function public.xp_reconcile_media_state(p_user uuid,p_state jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_canonical text; v_title text; v_type text; v_status text; v_world text; v_hash text; v_progress integer; v_total integer; v_deleted boolean; v_rating boolean; v_started boolean; v_completed boolean; v_bonus integer; v_showcase boolean; v_review boolean; v_changed integer:=0; v_result jsonb; v_meta jsonb;
begin
  if jsonb_typeof(p_state)<>'object' or p_state ?| array['amount','effect','allocations','personalNotes','notes','reviewText','dataUrl','fullMedia'] then raise exception 'unsafe_media_state'; end if;
  v_canonical:=lower(btrim(coalesce(p_state->>'canonicalMediaKey',''))); v_title=btrim(coalesce(p_state->>'title','')); v_type:=p_state->>'mediaType'; v_status:=p_state->>'status'; v_hash:=p_state->>'stateHash';
  if length(v_canonical) not between 3 and 220 or length(v_title) not between 1 and 200 or v_status not in ('planning','watching','reading','completed','dropped','paused') or length(coalesce(v_hash,'')) not between 1 and 128 then raise exception 'invalid_media_state'; end if;
  v_world:=public.xp_world_for_media_type(v_type); if v_world is null then raise exception 'invalid_media_world'; end if;
  if jsonb_typeof(p_state->'progress')<>'number' or jsonb_typeof(p_state->'totalProgress')<>'number' or jsonb_typeof(p_state->'hasRating')<>'boolean' or jsonb_typeof(p_state->'deleted')<>'boolean' then raise exception 'invalid_media_state'; end if;
  v_progress:=(p_state->>'progress')::integer; v_total:=(p_state->>'totalProgress')::integer; v_rating:=(p_state->>'hasRating')::boolean; v_deleted:=(p_state->>'deleted')::boolean;
  if v_progress<0 or v_progress>100000000 or v_total<0 or v_total>100000000 then raise exception 'invalid_media_progress'; end if;
  v_started:=not v_deleted and (v_status in ('watching','reading','completed') or v_progress>0);
  v_completed:=not v_deleted and v_status='completed'; v_rating:=not v_deleted and v_rating; v_bonus:=public.xp_commitment_bonus(case when v_total>0 then v_total else null end);
  select not v_deleted and exists(select 1 from public.profile_media_showcase s where s.user_id=p_user and lower(coalesce(s.external_source,'local')||':'||coalesce(s.external_id,s.media_type||':'||s.title))=v_canonical and s.showcase_kind='favorites') into v_showcase;
  select not v_deleted and exists(select 1 from public.profile_shared_notes n where n.user_id=p_user and lower(coalesce(n.external_source,'local')||':'||coalesce(n.external_id,n.media_type||':'||n.media_title))=v_canonical and length(btrim(n.content))>=80) into v_review;
  v_meta:=jsonb_build_object('title',v_title,'mediaType',v_type,'world',v_world,'stateHash',v_hash);
  v_result:=public.xp_reconcile_entitlement(p_user,v_canonical,'media_started',v_started,v_world,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'state_reconciled' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',4),jsonb_build_object('axisType','world','axisKey',v_world,'amount',3),jsonb_build_object('axisType','branch','axisKey','tracker','amount',4))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=public.xp_reconcile_entitlement(p_user,v_canonical,'media_completed',v_completed,v_world,v_hash,v_meta||jsonb_build_object('baseXp',25,'commitmentBonus',v_bonus,'reason',case when v_deleted then 'media_deleted' else 'state_reconciled' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',25+v_bonus),jsonb_build_object('axisType','world','axisKey',v_world,'amount',20),jsonb_build_object('axisType','branch','axisKey','tracker','amount',15))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=public.xp_reconcile_entitlement(p_user,v_canonical,'media_rated',v_rating,null,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'state_reconciled' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','critic','amount',5))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=public.xp_reconcile_entitlement(p_user,v_canonical,'review_published',v_review,null,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'shared_review_state' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',12),jsonb_build_object('axisType','branch','axisKey','critic','amount',15))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=public.xp_reconcile_entitlement(p_user,v_canonical,'showcase_curated',v_showcase,null,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'showcase_state' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',2),jsonb_build_object('axisType','branch','axisKey','curator','amount',4))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  return jsonb_build_object('canonicalMediaKey',v_canonical,'changedEntitlements',v_changed);
end;
$$;
revoke all on function public.xp_reconcile_media_state(uuid,jsonb) from public;

create or replace function public.xp_convert_legacy_local_state(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_allocations jsonb; v_result jsonb; v_event uuid; v_count integer;
begin
  if exists(select 1 from public.xp_local_state_conversions where user_id=p_user) then return jsonb_build_object('converted',false,'idempotent',true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('axisType',axis_type,'axisKey',axis_key,'amount',amount) order by axis_type,axis_key),'[]'::jsonb),coalesce(sum(event_count),0)::integer into v_allocations,v_count from (
    select a.axis_type,a.axis_key,sum(a.amount*e.effect)::integer amount,count(distinct e.id)::integer event_count
    from public.xp_events e join public.xp_event_allocations a on a.event_id=e.id
    where e.user_id=p_user and (e.trust_level='legacy_attested' or (e.trust_level='local_attested' and e.source_type<>'media_state'))
    group by a.axis_type,a.axis_key having sum(a.amount*e.effect)>0
  ) q;
  if jsonb_array_length(v_allocations)>0 then
    v_result:=public.xp_apply_adjustment(p_user,'reversal','system','xp_v2_conversion',p_user::text,null,'revoke',jsonb_build_object('reason','legacy_local_baseline_replaced','correctedEventCount',v_count),v_allocations,false);
    v_event:=(v_result->>'eventId')::uuid;
  end if;
  insert into public.xp_local_state_conversions(user_id,correction_event_id,metadata) values(p_user,v_event,jsonb_build_object('correctedEventCount',v_count));
  return jsonb_build_object('converted',true,'correctionEventId',v_event,'correctedEventCount',v_count);
end;
$$;
revoke all on function public.xp_convert_legacy_local_state(uuid) from public;

create or replace function public.xp_sync_media_states(p_items jsonb,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_item jsonb; v_seen text[]:=array[]::text[]; v_canonical text; v_changed integer:=0; v_result jsonb; v_before bigint; v_after bigint; v_conversion jsonb; v_ent public.xp_media_entitlements%rowtype;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>1000 then raise exception 'invalid_media_state_batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('xp-sync:'||v_user::text,0));
  if not p_replace and not exists(select 1 from public.xp_local_state_conversions where user_id=v_user) and exists(select 1 from public.xp_events where user_id=v_user and (trust_level='legacy_attested' or (trust_level='local_attested' and source_type<>'media_state'))) then raise exception 'library_full_sync_required'; end if;
  select coalesce(total_xp,0) into v_before from public.xp_user_totals where user_id=v_user; v_before:=coalesce(v_before,0);
  v_conversion:=public.xp_convert_legacy_local_state(v_user);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_canonical:=lower(btrim(coalesce(v_item->>'canonicalMediaKey','')));
    if v_canonical=any(v_seen) then raise exception 'duplicate_media_state'; end if;
    v_seen:=array_append(v_seen,v_canonical);
    v_result:=public.xp_reconcile_media_state(v_user,v_item);
    v_changed:=v_changed+coalesce((v_result->>'changedEntitlements')::integer,0);
  end loop;
  if p_replace then
    for v_ent in select distinct on (canonical_media_key) * from public.xp_media_entitlements where user_id=v_user and is_active and not (canonical_media_key=any(v_seen)) order by canonical_media_key,entitlement_type loop
      v_item:=jsonb_build_object('canonicalMediaKey',v_ent.canonical_media_key,'title',coalesce((select metadata->>'title' from public.xp_events where user_id=v_user and canonical_key=v_ent.canonical_media_key order by recorded_at desc limit 1),'Silinen medya'),'mediaType',case v_ent.world_key when 'east' then 'anime' when 'arch' then 'book' else 'movie' end,'status','planning','progress',0,'totalProgress',0,'hasRating',false,'deleted',true,'stateHash','deleted:'||md5(v_ent.canonical_media_key));
      v_result:=public.xp_reconcile_media_state(v_user,v_item); v_changed:=v_changed+coalesce((v_result->>'changedEntitlements')::integer,0);
    end loop;
  end if;
  select coalesce(total_xp,0) into v_after from public.xp_user_totals where user_id=v_user; v_after:=coalesce(v_after,0);
  return jsonb_build_object('ok',true,'processed',jsonb_array_length(p_items),'changedEntitlements',v_changed,'xpDelta',v_after-v_before,'totalXp',v_after,'conversion',v_conversion);
end;
$$;

create or replace function public.xp_attest_local_event(p_event_type text,p_canonical_key text,p_media jsonb,p_total_progress integer default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin raise exception 'xp_state_sync_required'; end; $$;
create or replace function public.xp_import_legacy(p_media_count integer,p_progress_log_count integer,p_completed_count integer,p_rated_count integer,p_favorite_count integer,p_noted_count integer,p_world_counts jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin raise exception 'legacy_import_deprecated'; end; $$;

create or replace function public.xp_award_recommendation_completion(p_recommendation uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rec public.social_recommendations%rowtype; v_world text; v_canonical text;
begin
  select * into v_rec from public.social_recommendations where id=p_recommendation and progress_status='completed'; if not found then return; end if;
  v_world:=public.xp_world_for_media_type(v_rec.media_snapshot->>'mediaType'); v_canonical:=coalesce(v_rec.canonical_media_key,p_recommendation::text);
  perform public.xp_apply_event(v_rec.recipient_id,'recommendation_completed_recipient','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_recipient:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title','world',v_world),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',20),jsonb_build_object('axisType','branch','axisKey','explorer','amount',12),jsonb_build_object('axisType','branch','axisKey','connector','amount',8))||case when v_world is not null then jsonb_build_array(jsonb_build_object('axisType','world','axisKey',v_world,'amount',10)) else '[]'::jsonb end,true);
  perform public.xp_apply_event(v_rec.sender_id,'recommendation_completed_sender','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_sender:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title'),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',15),jsonb_build_object('axisType','branch','axisKey','connector','amount',20)),true);
end;
$$;

create or replace function public.xp_recommendation_feedback_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rec public.social_recommendations%rowtype;
begin
  select * into v_rec from public.social_recommendations where id=new.recommendation_id;
  if found and v_rec.progress_status='completed' and new.author_id=v_rec.recipient_id and length(btrim(new.body))>=40 then
    perform public.xp_apply_event(new.author_id,'recommendation_completion_feedback','social_verified','recommendation_message',new.id::text,v_rec.canonical_media_key,'recommendation_completion_feedback:'||new.recommendation_id::text||':'||new.author_id::text,jsonb_build_object('recommendationId',new.recommendation_id,'messageId',new.id,'length',length(btrim(new.body))),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','connector','amount',5)),true);
  end if;
  return new;
end;
$$;

create or replace function public.xp_profile_entitlement_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid; v_canonical text; v_old_canonical text; v_type text; v_world text; v_title text; v_old_title text; v_desired boolean; v_old_desired boolean; v_hash text; v_allocations jsonb;
begin
  v_user:=coalesce(new.user_id,old.user_id);
  if tg_table_name='profile_media_showcase' then
    v_type:='showcase_curated'; v_title:=coalesce(new.title,old.title); v_world:=null;
    v_canonical:=lower(coalesce(coalesce(new.external_source,old.external_source),'local')||':'||coalesce(coalesce(new.external_id,old.external_id),coalesce(new.media_type,old.media_type)||':'||v_title));
    if tg_op='UPDATE' then v_old_title:=old.title; v_old_canonical:=lower(coalesce(old.external_source,'local')||':'||coalesce(old.external_id,old.media_type||':'||old.title)); end if;
    select exists(select 1 from public.profile_media_showcase s where s.user_id=v_user and s.showcase_kind='favorites' and lower(coalesce(s.external_source,'local')||':'||coalesce(s.external_id,s.media_type||':'||s.title))=v_canonical) into v_desired;
    v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',2),jsonb_build_object('axisType','branch','axisKey','curator','amount',4));
  else
    v_type:='review_published'; v_title:=coalesce(new.media_title,old.media_title); v_world:=null;
    v_canonical:=lower(coalesce(coalesce(new.external_source,old.external_source),'local')||':'||coalesce(coalesce(new.external_id,old.external_id),coalesce(new.media_type,old.media_type)||':'||v_title));
    if tg_op='UPDATE' then v_old_title:=old.media_title; v_old_canonical:=lower(coalesce(old.external_source,'local')||':'||coalesce(old.external_id,old.media_type||':'||old.media_title)); end if;
    select exists(select 1 from public.profile_shared_notes n where n.user_id=v_user and length(btrim(n.content))>=80 and lower(coalesce(n.external_source,'local')||':'||coalesce(n.external_id,n.media_type||':'||n.media_title))=v_canonical) into v_desired;
    v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',12),jsonb_build_object('axisType','branch','axisKey','critic','amount',15));
  end if;
  if v_old_canonical is not null and v_old_canonical<>v_canonical then
    if v_type='showcase_curated' then select exists(select 1 from public.profile_media_showcase s where s.user_id=v_user and s.showcase_kind='favorites' and lower(coalesce(s.external_source,'local')||':'||coalesce(s.external_id,s.media_type||':'||s.title))=v_old_canonical) into v_old_desired;
    else select exists(select 1 from public.profile_shared_notes n where n.user_id=v_user and length(btrim(n.content))>=80 and lower(coalesce(n.external_source,'local')||':'||coalesce(n.external_id,n.media_type||':'||n.media_title))=v_old_canonical) into v_old_desired; end if;
    perform public.xp_reconcile_entitlement(v_user,v_old_canonical,v_type,v_old_desired,v_world,md5(v_type||':'||v_old_canonical||':'||v_old_desired::text),jsonb_build_object('title',v_old_title,'reason','profile_state_moved'),v_allocations);
  end if;
  v_hash:=md5(v_type||':'||v_canonical||':'||v_desired::text);
  perform public.xp_reconcile_entitlement(v_user,v_canonical,v_type,v_desired,v_world,v_hash,jsonb_build_object('title',v_title,'reason',case when v_desired then 'profile_state_added' else 'profile_state_removed' end),v_allocations);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists xp_showcase_curated on public.profile_media_showcase;
drop trigger if exists xp_showcase_reconcile on public.profile_media_showcase;
create constraint trigger xp_showcase_reconcile after insert or update or delete on public.profile_media_showcase deferrable initially deferred for each row execute function public.xp_profile_entitlement_trigger();
drop trigger if exists xp_shared_review_reconcile on public.profile_shared_notes;
create constraint trigger xp_shared_review_reconcile after insert or update or delete on public.profile_shared_notes deferrable initially deferred for each row execute function public.xp_profile_entitlement_trigger();

create or replace function public.xp_evaluate_quests(p_user uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_quest public.xp_quest_definitions%rowtype; v_value integer; v_existing timestamptz; v_reward jsonb; v_reward_id uuid;
begin
  for v_quest in select * from public.xp_quest_definitions where active order by quest_key loop
    if v_quest.quest_key='three_worlds' then
      select count(distinct metadata->>'world')::integer into v_value from public.xp_events where user_id=p_user and event_type='media_completed' and effect=1 and metadata->>'world' in ('east','screen','arch');
    else
      select count(distinct coalesce(canonical_key,source_id,id::text))::integer into v_value from public.xp_events where user_id=p_user and event_type=v_quest.criteria->>'eventType' and effect=1;
    end if;
    select completed_at into v_existing from public.xp_user_quest_progress where user_id=p_user and quest_key=v_quest.quest_key;
    insert into public.xp_user_quest_progress(user_id,quest_key,current_value,completed_at) values(p_user,v_quest.quest_key,least(v_value,v_quest.target),case when v_value>=v_quest.target then coalesce(v_existing,now()) else null end)
    on conflict(user_id,quest_key) do update set current_value=greatest(public.xp_user_quest_progress.current_value,excluded.current_value),completed_at=coalesce(public.xp_user_quest_progress.completed_at,excluded.completed_at),updated_at=now();
    if v_value>=v_quest.target and v_existing is null then
      v_reward:=public.xp_apply_event(p_user,'quest_completed','system','quest',v_quest.quest_key,null,'quest:'||v_quest.quest_key,jsonb_build_object('questKey',v_quest.quest_key),case when v_quest.reward_xp>0 then jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_quest.reward_xp)) else '[]'::jsonb end,false);
      v_reward_id:=(v_reward->>'eventId')::uuid; update public.xp_user_quest_progress set reward_event_id=v_reward_id where user_id=p_user and quest_key=v_quest.quest_key;
      if v_quest.badge_key is not null then insert into public.xp_user_badges(user_id,badge_key,source_event_id) values(p_user,v_quest.badge_key,v_reward_id) on conflict(user_id,badge_key) do nothing; end if;
    end if;
  end loop;
end;
$$;

create or replace function public.get_xp_dashboard(p_event_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_event_limit,25),1),50); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'version',2,'total',coalesce((select to_jsonb(t) from public.xp_user_totals t where t.user_id=v_user),jsonb_build_object('user_id',v_user,'total_xp',0,'level',1,'current_level_start_xp',0,'next_level_start_xp',100,'version',2)),
    'worlds',coalesce((select jsonb_agg(to_jsonb(w) order by w.world_key) from public.xp_user_world_totals w where w.user_id=v_user),'[]'::jsonb),
    'branches',coalesce((select jsonb_agg(to_jsonb(b) order by b.branch_key) from public.xp_user_branch_totals b where b.user_id=v_user),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'eventType',q.event_type,'trustLevel',q.trust_level,'action',q.event_action,'effect',q.effect,'occurredAt',q.occurred_at,'metadata',q.metadata,'allocations',q.allocations) order by q.recorded_at desc,q.id desc) from (select e.*,coalesce((select jsonb_agg(jsonb_build_object('axisType',a.axis_type,'axisKey',a.axis_key,'amount',a.amount)) from public.xp_event_allocations a where a.event_id=e.id),'[]'::jsonb) allocations from public.xp_events e where e.user_id=v_user order by e.recorded_at desc,e.id desc limit v_limit) q),'[]'::jsonb),
    'quests',coalesce((select jsonb_agg(jsonb_build_object('key',d.quest_key,'name',d.name,'description',d.description,'target',d.target,'rewardXp',d.reward_xp,'active',d.active,'currentValue',coalesce(p.current_value,0),'completedAt',p.completed_at) order by d.created_at,d.quest_key) from public.xp_quest_definitions d left join public.xp_user_quest_progress p on p.quest_key=d.quest_key and p.user_id=v_user),'[]'::jsonb),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('key',d.badge_key,'name',d.name,'description',d.description,'iconKey',d.icon_key,'tier',d.tier,'awardedAt',b.awarded_at,'selected',b.selected,'displayOrder',b.display_order) order by b.selected desc,b.display_order nulls last,b.awarded_at) from public.xp_user_badges b join public.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=v_user),'[]'::jsonb),
    'breakdown',jsonb_build_object(
      'localCurrentXp',coalesce((select sum((a->>'amount')::integer) from public.xp_media_entitlements m cross join lateral jsonb_array_elements(m.allocations) a where m.user_id=v_user and m.is_active and a->>'axisType'='general'),0),
      'socialXp',coalesce((select sum(a.amount*e.effect) from public.xp_events e join public.xp_event_allocations a on a.event_id=e.id where e.user_id=v_user and e.trust_level='social_verified' and a.axis_type='general'),0),
      'systemXp',coalesce((select sum(a.amount*e.effect) from public.xp_events e join public.xp_event_allocations a on a.event_id=e.id where e.user_id=v_user and e.trust_level='system' and e.source_type<>'xp_v2_conversion' and a.axis_type='general'),0),
      'legacyCorrectionXp',coalesce((select sum(a.amount*e.effect) from public.xp_events e join public.xp_event_allocations a on a.event_id=e.id where e.user_id=v_user and (e.trust_level='legacy_attested' or e.source_type='xp_v2_conversion') and a.axis_type='general'),0)
    ),
    'legacyImported',exists(select 1 from public.xp_legacy_imports l where l.user_id=v_user),
    'librarySynchronized',exists(select 1 from public.xp_local_state_conversions c where c.user_id=v_user),
    'selectedTitle',(select selected_title from public.profiles where id=v_user)
  ) into v_result; return v_result;
end;
$$;

revoke all on function public.xp_sync_media_states(jsonb,boolean) from public;
revoke all on function public.xp_attest_local_event(text,text,jsonb,integer,text),public.xp_import_legacy(integer,integer,integer,integer,integer,integer,jsonb) from anon,authenticated;
grant execute on function public.xp_sync_media_states(jsonb,boolean) to authenticated;

-- No product-level daily XP quota remains. Request throttling, if added later,
-- must protect transport only and must not change the number of eligible rewards.
-- END XP REVERSIBLE LOCAL STATE
