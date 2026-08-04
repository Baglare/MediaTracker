begin;

do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'goal_cloud_v1_prerequisite_auth_users_missing';
  end if;
  if to_regprocedure('public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)') is null then
    raise exception 'goal_cloud_v1_prerequisite_d2c1_missing';
  end if;
  if to_regclass('public.goals') is not null
    or to_regclass('public.goal_sync_operations') is not null
    or to_regprocedure('public.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean)') is not null
    or to_regprocedure('public.cloud_goal_v1_definition_is_valid(text,jsonb)') is not null
    or to_regprocedure('public.cloud_goal_v1_request_hash(text,bigint,jsonb,boolean)') is not null then
    raise exception 'goal_cloud_v1_partial_or_existing_installation';
  end if;
end;
$$;

create table public.goals (
  row_pk uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  definition jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  deleted_at timestamptz null,
  last_operation_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id),
  constraint goals_id_length check (char_length(id) between 1 and 240),
  constraint goals_definition_object check (jsonb_typeof(definition)='object'),
  constraint goals_definition_id_matches check (definition->>'id'=id)
);

create index goals_owner_revision_idx on public.goals(user_id,revision);
create index goals_owner_deleted_updated_idx on public.goals(user_id,deleted_at,updated_at desc);

create table public.goal_sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  goal_id text not null,
  operation_kind text not null check (operation_kind in ('upsert','tombstone')),
  request_hash text not null,
  status text not null check (status in (
    'applied','revision_conflict','deleted_conflict','operation_id_reused','invalid_payload'
  )),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);

create index goal_sync_operations_owner_goal_idx on public.goal_sync_operations(user_id,goal_id,created_at desc);

alter table public.goals enable row level security;
alter table public.goal_sync_operations enable row level security;

create policy goals_select_own on public.goals
  for select to authenticated using (auth.uid()=user_id);
create policy goal_sync_operations_select_own on public.goal_sync_operations
  for select to authenticated using (auth.uid()=user_id);

revoke all on table public.goals from public,anon,authenticated;
revoke all on table public.goal_sync_operations from public,anon,authenticated;
grant select on table public.goals to authenticated;
grant select on table public.goal_sync_operations to authenticated;

create function public.cloud_goal_v1_definition_is_valid(p_goal_id text,p_definition jsonb)
returns boolean language plpgsql immutable
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_created_at timestamptz;
  v_updated_at timestamptz;
begin
  if jsonb_typeof(p_definition)<>'object'
    or not (p_definition ?& array['id','title','origin','scope','metric','schedule','lifecycle','createdAt','updatedAt'])
    or exists (
      select 1 from jsonb_object_keys(p_definition) key
      where key not in ('id','title','origin','scope','metric','schedule','lifecycle','createdAt','updatedAt')
    )
    or p_definition->>'id'<>p_goal_id
    or char_length(trim(coalesce(p_definition->>'title',''))) not between 1 and 200
    or p_definition->>'origin' not in ('manual','suggested')
    or p_definition->>'lifecycle' not in ('active','cancelled','archived')
    or jsonb_typeof(p_definition->'scope')<>'object'
    or jsonb_typeof(p_definition->'metric')<>'object'
    or jsonb_typeof(p_definition->'schedule')<>'object'
    or p_definition ?| array['currentValue','progressPercent','attainment','completed','completedAt','contributingLogIds','warnings','suggestions','revision'] then
    return false;
  end if;
  v_created_at:=(p_definition->>'createdAt')::timestamptz;
  v_updated_at:=(p_definition->>'updatedAt')::timestamptz;
  return v_created_at is not null and v_updated_at>=v_created_at;
exception when others then
  return false;
end;
$$;

create function public.cloud_goal_v1_request_hash(
  p_goal_id text,p_expected_revision bigint,p_definition jsonb,p_delete boolean
) returns text language sql immutable
set search_path=pg_catalog,public,pg_temp
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'goalId',p_goal_id,'expectedRevision',p_expected_revision,
    'definition',coalesce(p_definition,'null'::jsonb),'delete',p_delete
  )::text,'UTF8')),'hex');
$$;

create function public.apply_cloud_goal_v1(
  p_operation_id uuid,
  p_goal_id text,
  p_expected_revision bigint,
  p_definition jsonb default null,
  p_delete boolean default false
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_hash text;
  v_existing public.goal_sync_operations%rowtype;
  v_current public.goals%rowtype;
  v_result jsonb;
  v_now timestamptz:=now();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_operation_id is null or char_length(coalesce(p_goal_id,'')) not between 1 and 240
    or p_expected_revision is null or p_expected_revision<0 then
    return jsonb_build_object('status','invalid_payload','goalId',coalesce(p_goal_id,''),'revision',0,'deletedAt',null,'definition',null);
  end if;
  if (not p_delete and not public.cloud_goal_v1_definition_is_valid(p_goal_id,p_definition))
    or (p_delete and p_definition is not null and not public.cloud_goal_v1_definition_is_valid(p_goal_id,p_definition)) then
    return jsonb_build_object('status','invalid_payload','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
  end if;
  v_hash:=public.cloud_goal_v1_request_hash(p_goal_id,p_expected_revision,p_definition,p_delete);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_operation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':goal:' || p_goal_id,0));
  select * into v_existing from public.goal_sync_operations
    where user_id=v_user and operation_id=p_operation_id;
  if found then
    if v_existing.request_hash<>v_hash then
      return jsonb_build_object('status','operation_id_reused','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
    end if;
    return jsonb_set(v_existing.result,'{status}','"idempotent_replay"'::jsonb,true);
  end if;

  select * into v_current from public.goals
    where user_id=v_user and id=p_goal_id for update;

  if p_delete then
    if not found then
      if p_expected_revision<>0 then
        v_result:=jsonb_build_object('status','revision_conflict','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
      elsif p_definition is null then
        v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',0,'deletedAt',v_now,'definition',null);
      else
        insert into public.goals(user_id,id,definition,revision,deleted_at,last_operation_id,created_at,updated_at)
          values(v_user,p_goal_id,p_definition,1,v_now,p_operation_id,v_now,v_now) returning * into v_current;
        v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',1,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
      end if;
    elsif v_current.revision<>p_expected_revision then
      v_result:=jsonb_build_object('status','revision_conflict','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
    elsif v_current.deleted_at is not null then
      v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
    else
      update public.goals set deleted_at=v_now,revision=revision+1,last_operation_id=p_operation_id,updated_at=v_now
        where user_id=v_user and id=p_goal_id returning * into v_current;
      v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
    end if;
  elsif not found then
    if p_expected_revision<>0 then
      v_result:=jsonb_build_object('status','revision_conflict','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
    else
      insert into public.goals(user_id,id,definition,revision,deleted_at,last_operation_id,created_at,updated_at)
        values(v_user,p_goal_id,p_definition,1,null,p_operation_id,v_now,v_now) returning * into v_current;
      v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',1,'deletedAt',null,'definition',v_current.definition);
    end if;
  elsif v_current.deleted_at is not null then
    v_result:=jsonb_build_object('status','deleted_conflict','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
  elsif v_current.definition=p_definition then
    v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',null,'definition',v_current.definition);
  elsif v_current.revision<>p_expected_revision then
    v_result:=jsonb_build_object('status','revision_conflict','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',null,'definition',v_current.definition);
  else
    update public.goals set definition=p_definition,revision=revision+1,last_operation_id=p_operation_id,updated_at=v_now
      where user_id=v_user and id=p_goal_id returning * into v_current;
    v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',null,'definition',v_current.definition);
  end if;

  insert into public.goal_sync_operations(user_id,operation_id,goal_id,operation_kind,request_hash,status,result)
  values(v_user,p_operation_id,p_goal_id,case when p_delete then 'tombstone' else 'upsert' end,v_hash,v_result->>'status',v_result);
  return v_result;
end;
$$;

revoke all on function public.cloud_goal_v1_definition_is_valid(text,jsonb) from public,anon,authenticated;
revoke all on function public.cloud_goal_v1_request_hash(text,bigint,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean) from public,anon;
grant execute on function public.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean) to authenticated;

commit;
