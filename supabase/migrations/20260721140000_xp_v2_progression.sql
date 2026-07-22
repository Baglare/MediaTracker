-- BEGIN XP V2 PROGRESSION
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'media_started','media_completed','media_rated','review_published','showcase_curated',
    'recommendation_completed_recipient','recommendation_completed_sender',
    'recommendation_completion_feedback','legacy_import','quest_completed','reversal'
  )),
  trust_level text not null check (trust_level in ('local_attested','social_verified','legacy_attested','system')),
  source_type text not null,
  source_id text,
  canonical_key text,
  dedupe_key text not null,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id,dedupe_key)
);

create table if not exists public.xp_event_allocations (
  event_id uuid not null references public.xp_events(id) on delete restrict,
  axis_type text not null check (axis_type in ('general','world','branch')),
  axis_key text not null,
  amount integer not null check (amount > 0),
  primary key(event_id,axis_type,axis_key),
  check (
    (axis_type='general' and axis_key='general') or
    (axis_type='world' and axis_key in ('east','screen','arch')) or
    (axis_type='branch' and axis_key in ('tracker','explorer','critic','curator','connector'))
  )
);

create table if not exists public.xp_user_totals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  level integer not null default 1 check (level >= 1),
  current_level_start_xp bigint not null default 0,
  next_level_start_xp bigint not null default 100,
  updated_at timestamptz not null default now(),
  version integer not null default 2
);

create table if not exists public.xp_user_world_totals (
  user_id uuid not null references auth.users(id) on delete cascade,
  world_key text not null check (world_key in ('east','screen','arch')),
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  tier text not null default 'basic' check (tier in ('basic','refined','elite','master')),
  title text not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,world_key)
);

create table if not exists public.xp_user_branch_totals (
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_key text not null check (branch_key in ('tracker','explorer','critic','curator','connector')),
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  tier text not null default 'basic' check (tier in ('basic','refined','elite','master')),
  updated_at timestamptz not null default now(),
  primary key(user_id,branch_key)
);

create table if not exists public.xp_legacy_imports (
  user_id uuid primary key references auth.users(id) on delete cascade,
  event_id uuid unique references public.xp_events(id) on delete restrict,
  aggregate jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists public.xp_quest_definitions (
  quest_key text primary key,
  name text not null,
  description text not null,
  target integer not null check (target > 0),
  reward_xp integer not null check (reward_xp >= 0),
  badge_key text,
  active boolean not null default true,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.xp_user_quest_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_key text not null references public.xp_quest_definitions(quest_key) on delete restrict,
  current_value integer not null default 0 check (current_value >= 0),
  completed_at timestamptz,
  reward_event_id uuid references public.xp_events(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key(user_id,quest_key)
);

create table if not exists public.xp_badge_definitions (
  badge_key text primary key,
  name text not null,
  description text not null,
  icon_key text not null,
  tier text not null check (tier in ('basic','refined','elite','master')),
  created_at timestamptz not null default now()
);

create table if not exists public.xp_user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null references public.xp_badge_definitions(badge_key) on delete restrict,
  awarded_at timestamptz not null default now(),
  source_event_id uuid references public.xp_events(id) on delete restrict,
  selected boolean not null default false,
  display_order smallint,
  primary key(user_id,badge_key),
  check (display_order is null or display_order between 0 and 4)
);

create index if not exists xp_events_user_recorded_idx on public.xp_events(user_id,recorded_at desc,id desc);
create index if not exists xp_events_daily_idx on public.xp_events(user_id,event_type,recorded_at desc);
create index if not exists xp_allocations_event_idx on public.xp_event_allocations(event_id);

alter table public.xp_events enable row level security;
alter table public.xp_event_allocations enable row level security;
alter table public.xp_user_totals enable row level security;
alter table public.xp_user_world_totals enable row level security;
alter table public.xp_user_branch_totals enable row level security;
alter table public.xp_legacy_imports enable row level security;
alter table public.xp_quest_definitions enable row level security;
alter table public.xp_user_quest_progress enable row level security;
alter table public.xp_badge_definitions enable row level security;
alter table public.xp_user_badges enable row level security;

drop policy if exists xp_events_select_own on public.xp_events;
create policy xp_events_select_own on public.xp_events for select to authenticated using (user_id=auth.uid());
drop policy if exists xp_allocations_select_own on public.xp_event_allocations;
create policy xp_allocations_select_own on public.xp_event_allocations for select to authenticated using (exists(select 1 from public.xp_events e where e.id=event_id and e.user_id=auth.uid()));
drop policy if exists xp_totals_select_own on public.xp_user_totals;
create policy xp_totals_select_own on public.xp_user_totals for select to authenticated using (user_id=auth.uid());
drop policy if exists xp_world_totals_select_own on public.xp_user_world_totals;
create policy xp_world_totals_select_own on public.xp_user_world_totals for select to authenticated using (user_id=auth.uid());
drop policy if exists xp_branch_totals_select_own on public.xp_user_branch_totals;
create policy xp_branch_totals_select_own on public.xp_user_branch_totals for select to authenticated using (user_id=auth.uid());
drop policy if exists xp_legacy_select_own on public.xp_legacy_imports;
create policy xp_legacy_select_own on public.xp_legacy_imports for select to authenticated using (user_id=auth.uid());
drop policy if exists xp_quest_definitions_read on public.xp_quest_definitions;
create policy xp_quest_definitions_read on public.xp_quest_definitions for select to anon,authenticated using (true);
drop policy if exists xp_quest_progress_select_own on public.xp_user_quest_progress;
create policy xp_quest_progress_select_own on public.xp_user_quest_progress for select to authenticated using (user_id=auth.uid());
drop policy if exists xp_badge_definitions_read on public.xp_badge_definitions;
create policy xp_badge_definitions_read on public.xp_badge_definitions for select to anon,authenticated using (true);
drop policy if exists xp_user_badges_select_own on public.xp_user_badges;
create policy xp_user_badges_select_own on public.xp_user_badges for select to authenticated using (user_id=auth.uid());

revoke insert,update,delete on public.xp_events,public.xp_event_allocations,public.xp_user_totals,public.xp_user_world_totals,public.xp_user_branch_totals,public.xp_legacy_imports,public.xp_user_quest_progress,public.xp_user_badges from anon,authenticated;
grant select on public.xp_events,public.xp_event_allocations,public.xp_user_totals,public.xp_user_world_totals,public.xp_user_branch_totals,public.xp_legacy_imports,public.xp_user_quest_progress,public.xp_user_badges to authenticated;
grant select on public.xp_quest_definitions,public.xp_badge_definitions to anon,authenticated;

create or replace function public.xp_general_level(p_xp bigint)
returns integer language sql immutable set search_path=public,pg_temp as $$
  select floor(sqrt(greatest(coalesce(p_xp,0),0)::numeric/100))::integer+1;
$$;

create or replace function public.xp_world_level(p_xp bigint)
returns integer language sql immutable set search_path=public,pg_temp as $$
  select floor(sqrt(greatest(coalesce(p_xp,0),0)::numeric/75))::integer+1;
$$;

create or replace function public.xp_tier(p_level integer)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case when p_level>=21 then 'master' when p_level>=11 then 'elite' when p_level>=6 then 'refined' else 'basic' end;
$$;

create or replace function public.xp_world_title(p_world text,p_level integer)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case p_world
    when 'east' then case when p_level>=21 then 'Doğu Ustası' when p_level>=11 then 'Katana Arşivcisi' when p_level>=6 then 'Mürekkep İzleyicisi' else 'Doğu Yolcusu' end
    when 'screen' then case when p_level>=21 then 'Kadraj Ustası' when p_level>=11 then 'Projektör Avcısı' when p_level>=6 then 'Sahne Takipçisi' else 'Kadraj Gezgini' end
    when 'arch' then case when p_level>=21 then 'Arşiv Ustası' when p_level>=11 then 'Mühür Muhafızı' when p_level>=6 then 'Sayfa Toplayıcısı' else 'Arşiv Yolcusu' end
    else 'Yolculuk Başlangıcı' end;
$$;

create or replace function public.xp_world_for_media_type(p_media_type text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when lower(p_media_type) in ('anime','manga','manhwa','manhua') then 'east'
    when lower(p_media_type) in ('movie','tv') then 'screen'
    when lower(p_media_type) in ('book','light_novel','web_novel','visual_novel','novel') then 'arch'
    else null end;
$$;

create or replace function public.xp_commitment_bonus(p_total_progress integer)
returns integer language sql immutable set search_path=public,pg_temp as $$
  select case when p_total_progress is null or p_total_progress<=1 then 0 when p_total_progress<=12 then 3 when p_total_progress<=50 then 7 when p_total_progress<=200 then 10 else 15 end;
$$;

create or replace function public.xp_events_are_immutable()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'xp_event_immutable'; end;
$$;
drop trigger if exists xp_events_immutable on public.xp_events;
create trigger xp_events_immutable before update or delete on public.xp_events for each row execute function public.xp_events_are_immutable();
drop trigger if exists xp_allocations_immutable on public.xp_event_allocations;
create trigger xp_allocations_immutable before update or delete on public.xp_event_allocations for each row execute function public.xp_events_are_immutable();

create or replace function public.xp_evaluate_quests(p_user uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin return; end; $$;

create or replace function public.xp_apply_event(
  p_user uuid,p_event_type text,p_trust_level text,p_source_type text,p_source_id text,
  p_canonical_key text,p_dedupe_key text,p_metadata jsonb,p_allocations jsonb,p_evaluate boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event uuid; v_allocation jsonb; v_axis text; v_key text; v_amount integer; v_total bigint; v_level integer;
begin
  if p_user is null or length(coalesce(p_dedupe_key,'')) not between 1 and 240 then raise exception 'invalid_xp_event'; end if;
  insert into public.xp_events(user_id,event_type,trust_level,source_type,source_id,canonical_key,dedupe_key,metadata)
  values(p_user,p_event_type,p_trust_level,p_source_type,p_source_id,p_canonical_key,p_dedupe_key,coalesce(p_metadata,'{}'::jsonb))
  on conflict(user_id,dedupe_key) do nothing returning id into v_event;
  if v_event is null then
    select id into v_event from public.xp_events where user_id=p_user and dedupe_key=p_dedupe_key;
    return jsonb_build_object('ok',true,'idempotent',true,'eventId',v_event);
  end if;
  if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception 'invalid_xp_allocations'; end if;
  for v_allocation in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    v_axis:=v_allocation->>'axisType'; v_key:=v_allocation->>'axisKey';
    if jsonb_typeof(v_allocation->'amount')<>'number' then raise exception 'invalid_xp_allocation'; end if;
    v_amount:=(v_allocation->>'amount')::integer;
    insert into public.xp_event_allocations(event_id,axis_type,axis_key,amount) values(v_event,v_axis,v_key,v_amount);
    if v_axis='general' then
      insert into public.xp_user_totals(user_id,total_xp) values(p_user,v_amount)
      on conflict(user_id) do update set total_xp=public.xp_user_totals.total_xp+excluded.total_xp,updated_at=now();
    elsif v_axis='world' then
      insert into public.xp_user_world_totals(user_id,world_key,xp,level,tier,title)
      values(p_user,v_key,v_amount,public.xp_world_level(v_amount),public.xp_tier(public.xp_world_level(v_amount)),public.xp_world_title(v_key,public.xp_world_level(v_amount)))
      on conflict(user_id,world_key) do update set xp=public.xp_user_world_totals.xp+excluded.xp,updated_at=now();
    elsif v_axis='branch' then
      insert into public.xp_user_branch_totals(user_id,branch_key,xp,level,tier)
      values(p_user,v_key,v_amount,public.xp_world_level(v_amount),public.xp_tier(public.xp_world_level(v_amount)))
      on conflict(user_id,branch_key) do update set xp=public.xp_user_branch_totals.xp+excluded.xp,updated_at=now();
    end if;
  end loop;
  select total_xp into v_total from public.xp_user_totals where user_id=p_user;
  v_level:=public.xp_general_level(coalesce(v_total,0));
  update public.xp_user_totals set level=v_level,current_level_start_xp=((v_level-1)::bigint*(v_level-1)*100),next_level_start_xp=(v_level::bigint*v_level*100),updated_at=now() where user_id=p_user;
  update public.xp_user_world_totals set level=public.xp_world_level(xp),tier=public.xp_tier(public.xp_world_level(xp)),title=public.xp_world_title(world_key,public.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  update public.xp_user_branch_totals set level=public.xp_world_level(xp),tier=public.xp_tier(public.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  if p_evaluate then perform public.xp_evaluate_quests(p_user); end if;
  return jsonb_build_object('ok',true,'idempotent',false,'eventId',v_event,'totalXp',coalesce(v_total,0),'level',v_level);
end;
$$;
revoke all on function public.xp_apply_event(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public;

insert into public.xp_badge_definitions(badge_key,name,description,icon_key,tier) values
('three_worlds','Üç Dünya Gezgini','Üç dünyanın her birinde bir medya tamamladı.','globe-2','refined'),
('open_to_advice','Tavsiyeye Açık','Bir arkadaş tavsiyesini tamamladı.','hand-heart','basic'),
('accurate_recommendation','İsabetli Öneri','Gönderdiği bir tavsiye tamamlandı.','target','basic'),
('showcase_curator','Vitrin Küratörü','Beş benzersiz medya öğesini vitrine ekledi.','gallery-horizontal-end','basic'),
('first_final','İlk Final','İlk medyasını tamamladı.','badge-check','basic')
on conflict(badge_key) do update set name=excluded.name,description=excluded.description,icon_key=excluded.icon_key,tier=excluded.tier;

insert into public.xp_quest_definitions(quest_key,name,description,target,reward_xp,badge_key,active,criteria) values
('first_trace','İlk İz','Bir medyaya başla.',1,10,null,true,'{"eventType":"media_started"}'::jsonb),
('first_final','İlk Final','Bir medya tamamla.',1,20,'first_final',true,'{"eventType":"media_completed"}'::jsonb),
('three_worlds','Üç Dünya','Doğu, Kadraj ve Arşiv’den en az birer medya tamamla.',3,40,'three_worlds',true,'{"distinctCompletedWorlds":3}'::jsonb),
('friend_advice','Dost Tavsiyesi','Bir arkadaş tavsiyesini tamamla.',1,25,'open_to_advice',true,'{"eventType":"recommendation_completed_recipient"}'::jsonb),
('recommendation_found','Önerin Yerini Buldu','Gönderdiğin bir tavsiye tamamlandı.',1,25,'accurate_recommendation',true,'{"eventType":"recommendation_completed_sender"}'::jsonb),
('critical_view','Eleştirel Bakış','Beş medyayı puanla ve anlamlı bir değerlendirme yayımla.',5,0,null,false,'{"rated":5,"review":1}'::jsonb),
('profile_curator','Profil Küratörü','Beş benzersiz medya öğesini vitrine ekle.',5,15,'showcase_curator',true,'{"eventType":"showcase_curated"}'::jsonb)
on conflict(quest_key) do update set name=excluded.name,description=excluded.description,target=excluded.target,reward_xp=excluded.reward_xp,badge_key=excluded.badge_key,active=excluded.active,criteria=excluded.criteria;

create or replace function public.xp_evaluate_quests(p_user uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_quest public.xp_quest_definitions%rowtype; v_value integer; v_existing timestamptz; v_reward jsonb; v_reward_id uuid;
begin
  for v_quest in select * from public.xp_quest_definitions where active order by quest_key loop
    if v_quest.quest_key='three_worlds' then
      select count(distinct metadata->>'world')::integer into v_value from public.xp_events where user_id=p_user and event_type='media_completed' and metadata->>'world' in ('east','screen','arch');
    else
      select count(*)::integer into v_value from public.xp_events where user_id=p_user and event_type=v_quest.criteria->>'eventType';
    end if;
    select completed_at into v_existing from public.xp_user_quest_progress where user_id=p_user and quest_key=v_quest.quest_key;
    insert into public.xp_user_quest_progress(user_id,quest_key,current_value,completed_at)
    values(p_user,v_quest.quest_key,least(v_value,v_quest.target),case when v_value>=v_quest.target then coalesce(v_existing,now()) else null end)
    on conflict(user_id,quest_key) do update set current_value=excluded.current_value,completed_at=coalesce(public.xp_user_quest_progress.completed_at,excluded.completed_at),updated_at=now();
    if v_value>=v_quest.target and v_existing is null then
      v_reward:=public.xp_apply_event(p_user,'quest_completed','system','quest',v_quest.quest_key,null,'quest:'||v_quest.quest_key,jsonb_build_object('questKey',v_quest.quest_key),case when v_quest.reward_xp>0 then jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_quest.reward_xp)) else '[]'::jsonb end,false);
      v_reward_id:=(v_reward->>'eventId')::uuid;
      update public.xp_user_quest_progress set reward_event_id=v_reward_id where user_id=p_user and quest_key=v_quest.quest_key;
      if v_quest.badge_key is not null then insert into public.xp_user_badges(user_id,badge_key,source_event_id) values(p_user,v_quest.badge_key,v_reward_id) on conflict(user_id,badge_key) do nothing; end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.xp_evaluate_quests(uuid) from public;

create or replace function public.xp_attest_local_event(p_event_type text,p_canonical_key text,p_media jsonb,p_total_progress integer default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_world text; v_limit integer; v_count integer; v_general integer; v_bonus integer:=0; v_allocations jsonb; v_expected text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_event_type not in ('media_started','media_completed','media_rated') then raise exception 'unsupported_local_xp_event'; end if;
  if jsonb_typeof(p_media)<>'object' or length(btrim(coalesce(p_media->>'title',''))) not between 1 and 200 or length(coalesce(p_canonical_key,'')) not between 3 and 220 then raise exception 'invalid_media_snapshot'; end if;
  if p_media ?| array['personalNotes','notes','dataUrl','reviewText'] or coalesce(p_media->>'coverUrl','') like 'data:%' then raise exception 'unsafe_media_snapshot'; end if;
  v_world:=public.xp_world_for_media_type(p_media->>'mediaType'); if v_world is null then raise exception 'invalid_media_world'; end if;
  v_expected:=p_event_type||':'||v_user::text||':'||lower(p_canonical_key);
  if p_idempotency_key is not null and p_idempotency_key<>v_expected then raise exception 'invalid_idempotency_key'; end if;
  if exists(select 1 from public.xp_events where user_id=v_user and dedupe_key=v_expected) then return jsonb_build_object('ok',true,'idempotent',true,'reason','already_recorded'); end if;
  v_limit:=case p_event_type when 'media_started' then 5 when 'media_completed' then 10 when 'media_rated' then 10 end;
  select count(*) into v_count from public.xp_events where user_id=v_user and event_type=p_event_type and recorded_at>=date_trunc('day',now()) and recorded_at<date_trunc('day',now())+interval '1 day';
  if v_count>=v_limit then return jsonb_build_object('ok',false,'reason','daily_limit','retryable',false); end if;
  if p_event_type='media_started' then v_general:=4; v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',4),jsonb_build_object('axisType','world','axisKey',v_world,'amount',3),jsonb_build_object('axisType','branch','axisKey','tracker','amount',4));
  elsif p_event_type='media_completed' then v_bonus:=public.xp_commitment_bonus(p_total_progress); v_general:=25+v_bonus; v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_general),jsonb_build_object('axisType','world','axisKey',v_world,'amount',20),jsonb_build_object('axisType','branch','axisKey','tracker','amount',15));
  else
    if jsonb_typeof(p_media->'userRating')<>'number' or (p_media->>'userRating')::numeric<0 or (p_media->>'userRating')::numeric>10 then raise exception 'invalid_rating'; end if;
    v_general:=5; v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','critic','amount',5));
  end if;
  return public.xp_apply_event(v_user,p_event_type,'local_attested','media',p_canonical_key,p_canonical_key,v_expected,jsonb_build_object('title',p_media->>'title','mediaType',p_media->>'mediaType','world',v_world,'baseXp',v_general-v_bonus,'commitmentBonus',v_bonus),v_allocations,true);
end;
$$;

create or replace function public.xp_import_legacy(p_media_count integer,p_progress_log_count integer,p_completed_count integer,p_rated_count integer,p_favorite_count integer,p_noted_count integer,p_world_counts jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_total integer; v_world_sum integer; v_event jsonb; v_event_id uuid; v_allocations jsonb; v_world text; v_count integer; v_world_pool integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if exists(select 1 from public.xp_legacy_imports where user_id=v_user) then return jsonb_build_object('ok',true,'idempotent',true,'reason','already_imported'); end if;
  if p_media_count not between 0 and 100000 or p_progress_log_count not between 0 and 1000000 or p_completed_count not between 0 and p_media_count or p_rated_count not between 0 and p_media_count or p_favorite_count not between 0 and p_media_count or p_noted_count not between 0 and p_media_count then raise exception 'invalid_legacy_aggregate'; end if;
  if jsonb_typeof(p_world_counts)<>'object' then raise exception 'invalid_legacy_world_counts'; end if;
  if coalesce((p_world_counts->>'east')::integer,-1)<0 or coalesce((p_world_counts->>'screen')::integer,-1)<0 or coalesce((p_world_counts->>'arch')::integer,-1)<0 then raise exception 'invalid_legacy_world_counts'; end if;
  v_world_sum=(p_world_counts->>'east')::integer+(p_world_counts->>'screen')::integer+(p_world_counts->>'arch')::integer;
  if v_world_sum<>p_media_count then raise exception 'invalid_legacy_world_counts'; end if;
  v_total:=p_media_count*10+p_progress_log_count*5+p_completed_count*30+p_rated_count*8+p_favorite_count*5+p_noted_count*8;
  v_allocations:=case when v_total>0 then jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_total)) else '[]'::jsonb end;
  v_world_pool:=floor(v_total*0.25)::integer;
  if p_media_count>0 and v_world_pool>0 then
    foreach v_world in array array['east','screen','arch'] loop
      v_count:=(p_world_counts->>v_world)::integer;
      if v_count>0 then v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('axisType','world','axisKey',v_world,'amount',greatest(1,floor(v_world_pool::numeric*v_count/p_media_count)::integer))); end if;
    end loop;
  end if;
  v_event:=public.xp_apply_event(v_user,'legacy_import','legacy_attested','legacy_v1',v_user::text,null,'legacy_import:'||v_user::text,jsonb_build_object('aggregate',jsonb_build_object('mediaCount',p_media_count,'progressLogCount',p_progress_log_count,'completedCount',p_completed_count,'ratedCount',p_rated_count,'favoriteCount',p_favorite_count,'notedCount',p_noted_count,'worldCounts',p_world_counts),'branchXpAwarded',false),v_allocations,true);
  v_event_id=(v_event->>'eventId')::uuid;
  insert into public.xp_legacy_imports(user_id,event_id,aggregate) values(v_user,v_event_id,jsonb_build_object('mediaCount',p_media_count,'progressLogCount',p_progress_log_count,'completedCount',p_completed_count,'ratedCount',p_rated_count,'favoriteCount',p_favorite_count,'notedCount',p_noted_count,'worldCounts',p_world_counts));
  return v_event||jsonb_build_object('legacyXp',v_total);
end;
$$;

create or replace function public.xp_award_recommendation_completion(p_recommendation uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rec public.social_recommendations%rowtype; v_world text; v_canonical text; v_count integer;
begin
  select * into v_rec from public.social_recommendations where id=p_recommendation and progress_status='completed'; if not found then return; end if;
  v_world:=public.xp_world_for_media_type(v_rec.media_snapshot->>'mediaType'); v_canonical:=coalesce(v_rec.canonical_media_key,p_recommendation::text);
  select count(*) into v_count from public.xp_events where user_id=v_rec.recipient_id and event_type='recommendation_completed_recipient' and recorded_at>=date_trunc('day',now());
  if v_count<5 then perform public.xp_apply_event(v_rec.recipient_id,'recommendation_completed_recipient','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_recipient:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title','world',v_world),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',20),jsonb_build_object('axisType','branch','axisKey','explorer','amount',12),jsonb_build_object('axisType','branch','axisKey','connector','amount',8))||case when v_world is not null then jsonb_build_array(jsonb_build_object('axisType','world','axisKey',v_world,'amount',10)) else '[]'::jsonb end,true); end if;
  select count(*) into v_count from public.xp_events where user_id=v_rec.sender_id and event_type='recommendation_completed_sender' and recorded_at>=date_trunc('day',now());
  if v_count<5 then perform public.xp_apply_event(v_rec.sender_id,'recommendation_completed_sender','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_sender:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title'),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',15),jsonb_build_object('axisType','branch','axisKey','connector','amount',20)),true); end if;
end;
$$;
revoke all on function public.xp_award_recommendation_completion(uuid) from public;

create or replace function public.xp_recommendation_event_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin if new.event_type='completed' then perform public.xp_award_recommendation_completion(new.recommendation_id); end if; return new; end; $$;
drop trigger if exists xp_recommendation_completed on public.social_recommendation_events;
create trigger xp_recommendation_completed after insert on public.social_recommendation_events for each row execute function public.xp_recommendation_event_trigger();

create or replace function public.xp_recommendation_feedback_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rec public.social_recommendations%rowtype; v_count integer;
begin
  select * into v_rec from public.social_recommendations where id=new.recommendation_id;
  if found and v_rec.progress_status='completed' and new.author_id=v_rec.recipient_id and length(btrim(new.body))>=40 then
    select count(*) into v_count from public.xp_events where user_id=new.author_id and event_type='recommendation_completion_feedback' and recorded_at>=date_trunc('day',now());
    if v_count<5 then perform public.xp_apply_event(new.author_id,'recommendation_completion_feedback','social_verified','recommendation_message',new.id::text,v_rec.canonical_media_key,'recommendation_completion_feedback:'||new.recommendation_id::text||':'||new.author_id::text,jsonb_build_object('recommendationId',new.recommendation_id,'messageId',new.id,'length',length(btrim(new.body))),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','connector','amount',5)),true); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists xp_recommendation_feedback on public.social_recommendation_messages;
create trigger xp_recommendation_feedback after insert on public.social_recommendation_messages for each row execute function public.xp_recommendation_feedback_trigger();

create or replace function public.xp_showcase_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_canonical text;
begin
  if new.showcase_kind<>'favorites' then return new; end if;
  v_canonical:=lower(coalesce(new.external_source,'local')||':'||coalesce(new.external_id,new.media_type||':'||new.title));
  if (select count(*) from public.xp_events where user_id=new.user_id and event_type='showcase_curated')<5 then
    perform public.xp_apply_event(new.user_id,'showcase_curated','local_attested','profile_showcase',new.id::text,v_canonical,'showcase_curated:'||new.user_id::text||':'||v_canonical,jsonb_build_object('title',new.title,'mediaType',new.media_type),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',2),jsonb_build_object('axisType','branch','axisKey','curator','amount',4)),true);
  end if; return new;
end;
$$;
drop trigger if exists xp_showcase_curated on public.profile_media_showcase;
create trigger xp_showcase_curated after insert on public.profile_media_showcase for each row execute function public.xp_showcase_trigger();

create or replace function public.get_xp_dashboard(p_event_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_event_limit,25),1),50); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'version',2,'total',coalesce((select to_jsonb(t) from public.xp_user_totals t where t.user_id=v_user),jsonb_build_object('user_id',v_user,'total_xp',0,'level',1,'current_level_start_xp',0,'next_level_start_xp',100,'version',2)),
    'worlds',coalesce((select jsonb_agg(to_jsonb(w) order by w.world_key) from public.xp_user_world_totals w where w.user_id=v_user),'[]'::jsonb),
    'branches',coalesce((select jsonb_agg(to_jsonb(b) order by b.branch_key) from public.xp_user_branch_totals b where b.user_id=v_user),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'eventType',q.event_type,'trustLevel',q.trust_level,'occurredAt',q.occurred_at,'metadata',q.metadata,'allocations',q.allocations) order by q.recorded_at desc,q.id desc) from (select e.*,coalesce((select jsonb_agg(jsonb_build_object('axisType',a.axis_type,'axisKey',a.axis_key,'amount',a.amount)) from public.xp_event_allocations a where a.event_id=e.id),'[]'::jsonb) allocations from public.xp_events e where e.user_id=v_user order by e.recorded_at desc,e.id desc limit v_limit) q),'[]'::jsonb),
    'quests',coalesce((select jsonb_agg(jsonb_build_object('key',d.quest_key,'name',d.name,'description',d.description,'target',d.target,'rewardXp',d.reward_xp,'active',d.active,'currentValue',coalesce(p.current_value,0),'completedAt',p.completed_at) order by d.created_at,d.quest_key) from public.xp_quest_definitions d left join public.xp_user_quest_progress p on p.quest_key=d.quest_key and p.user_id=v_user),'[]'::jsonb),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('key',d.badge_key,'name',d.name,'description',d.description,'iconKey',d.icon_key,'tier',d.tier,'awardedAt',b.awarded_at,'selected',b.selected,'displayOrder',b.display_order) order by b.selected desc,b.display_order nulls last,b.awarded_at) from public.xp_user_badges b join public.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=v_user),'[]'::jsonb),
    'legacyImported',exists(select 1 from public.xp_legacy_imports l where l.user_id=v_user),'selectedTitle',(select selected_title from public.profiles where id=v_user)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_xp_public_summary(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_username text; v_profile jsonb; v_can_progression boolean; v_can_badges boolean;
begin
  select username into v_username from public.profiles p where p.id=p_user and p.deleted_at is null;
  if v_username is null then return null; end if;
  v_profile:=public.get_social_profile(v_username);
  if coalesce(v_profile->>'status','')<>'available' then return null; end if;
  select exists(select 1 from jsonb_array_elements(coalesce(v_profile->'modules','[]'::jsonb)) m where m->>'moduleKey'='progression'),exists(select 1 from jsonb_array_elements(coalesce(v_profile->'modules','[]'::jsonb)) m where m->>'moduleKey'='badges') into v_can_progression,v_can_badges;
  if not v_can_progression and not v_can_badges then return null; end if;
  select jsonb_build_object('totalXp',case when v_can_progression then coalesce(t.total_xp,0) else null end,'level',case when v_can_progression then coalesce(t.level,1) else null end,'selectedTitle',case when v_can_progression then p.selected_title else null end,
    'worlds',case when v_can_progression then coalesce((select jsonb_agg(jsonb_build_object('key',w.world_key,'xp',w.xp,'level',w.level,'tier',w.tier,'title',w.title)) from public.xp_user_world_totals w where w.user_id=p_user),'[]'::jsonb) else '[]'::jsonb end,
    'branches',case when v_can_progression then coalesce((select jsonb_agg(jsonb_build_object('key',b.branch_key,'xp',b.xp,'level',b.level,'tier',b.tier)) from public.xp_user_branch_totals b where b.user_id=p_user),'[]'::jsonb) else '[]'::jsonb end,
    'badges',case when v_can_badges then coalesce((select jsonb_agg(jsonb_build_object('key',d.badge_key,'name',d.name,'description',d.description,'iconKey',d.icon_key,'tier',d.tier,'displayOrder',b.display_order) order by b.display_order) from public.xp_user_badges b join public.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=p_user and b.selected),'[]'::jsonb) else '[]'::jsonb end,
    'legacyImported',case when v_can_progression then exists(select 1 from public.xp_legacy_imports l where l.user_id=p_user) else false end) into v_result
  from public.profiles p left join public.xp_user_totals t on t.user_id=p.id where p.id=p_user;
  return v_result;
end;
$$;

create or replace function public.xp_select_badges(p_badge_keys text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_key text; v_order integer:=0;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if coalesce(array_length(p_badge_keys,1),0)>5 or coalesce(array_length(p_badge_keys,1),0)<>(select count(distinct x) from unnest(coalesce(p_badge_keys,array[]::text[])) x) then raise exception 'invalid_badge_selection'; end if;
  if exists(select 1 from unnest(coalesce(p_badge_keys,array[]::text[])) x where not exists(select 1 from public.xp_user_badges b where b.user_id=v_user and b.badge_key=x)) then raise exception 'badge_not_earned'; end if;
  update public.xp_user_badges set selected=false,display_order=null where user_id=v_user;
  foreach v_key in array coalesce(p_badge_keys,array[]::text[]) loop update public.xp_user_badges set selected=true,display_order=v_order where user_id=v_user and badge_key=v_key; v_order:=v_order+1; end loop;
  return jsonb_build_object('ok',true,'selected',coalesce(p_badge_keys,array[]::text[]));
end;
$$;

create or replace function public.xp_select_title(p_title text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_allowed boolean;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select exists(select 1 from public.xp_user_world_totals w where w.user_id=v_user and (p_title=public.xp_world_title(w.world_key,1) or (w.level>=6 and p_title=public.xp_world_title(w.world_key,6)) or (w.level>=11 and p_title=public.xp_world_title(w.world_key,11)) or (w.level>=21 and p_title=public.xp_world_title(w.world_key,21)))) or exists(select 1 from public.xp_user_badges b join public.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=v_user and d.name=p_title) or exists(select 1 from public.profiles p where p.id=v_user and p.selected_title=p_title) into v_allowed;
  if not v_allowed then raise exception 'title_not_earned'; end if;
  update public.profiles set selected_title=p_title,updated_at=now() where id=v_user;
  return jsonb_build_object('ok',true,'selectedTitle',p_title);
end;
$$;

revoke all on function public.xp_general_level(bigint),public.xp_world_level(bigint),public.xp_tier(integer),public.xp_world_title(text,integer),public.xp_world_for_media_type(text),public.xp_commitment_bonus(integer) from public;
revoke all on function public.xp_attest_local_event(text,text,jsonb,integer,text),public.xp_import_legacy(integer,integer,integer,integer,integer,integer,jsonb),public.get_xp_dashboard(integer),public.get_xp_public_summary(uuid),public.xp_select_badges(text[]),public.xp_select_title(text) from public;
grant execute on function public.xp_attest_local_event(text,text,jsonb,integer,text),public.xp_import_legacy(integer,integer,integer,integer,integer,integer,jsonb),public.get_xp_dashboard(integer),public.xp_select_badges(text[]),public.xp_select_title(text) to authenticated;
grant execute on function public.get_xp_public_summary(uuid) to anon,authenticated;
-- END XP V2 PROGRESSION
