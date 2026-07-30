begin;

-- D2B.1 fail-fast guard. This migration intentionally targets the repository
-- schema recorded in supabase/schema.sql and must stop on production drift.
do $d2b1_preflight$
declare
  v_definition text;
  v_policy_count integer;
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'd2b1_requires_postgresql_15';
  end if;
  if to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception 'd2b1_missing_sha256';
  end if;
  if to_regclass('public.media_items') is null
    or to_regclass('public.progress_logs') is null then
    raise exception 'd2b1_expected_tables_missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='media_items'
      and column_name='id' and data_type='text' and is_nullable='NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='media_items'
      and column_name='user_id' and data_type='uuid' and is_nullable='NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='media_items'
      and column_name='deleted_at'
      and data_type='timestamp with time zone'
  ) then
    raise exception 'd2b1_media_items_shape_drift';
  end if;
  if exists (
    select 1
    from (
      values
        ('id','text','NO'),('user_id','uuid','NO'),
        ('title','text','NO'),('type','text','NO'),('status','text','NO'),
        ('current_progress','integer','NO'),
        ('total_progress','integer','NO'),
        ('external_source','text','YES'),('external_id','text','YES'),
        ('cover_url','text','YES'),('backdrop_url','text','YES'),
        ('overview','text','YES'),('release_year','integer','YES'),
        ('favorite','boolean','NO'),('user_rating','integer','YES'),
        ('tags','ARRAY','NO'),('personal_notes','text','YES'),
        ('metadata','jsonb','NO'),
        ('created_at','timestamp with time zone','NO'),
        ('updated_at','timestamp with time zone','NO'),
        ('deleted_at','timestamp with time zone','YES')
    ) as expected(column_name,data_type,is_nullable)
    left join information_schema.columns actual
      on actual.table_schema='public'
      and actual.table_name='media_items'
      and actual.column_name=expected.column_name
    where actual.column_name is null
      or actual.data_type<>expected.data_type
      or actual.is_nullable<>expected.is_nullable
  ) then
    raise exception 'd2b1_media_items_full_shape_drift';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='id' and data_type='text' and is_nullable='NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='user_id' and data_type='uuid' and is_nullable='NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='media_id' and data_type='text'
  ) then
    raise exception 'd2b1_progress_logs_shape_drift';
  end if;
  if exists (
    select 1
    from (
      values
        ('id','text','NO'),('user_id','uuid','NO'),
        ('media_id','text','YES'),('media_title','text','NO'),
        ('media_type','text','NO'),('action','text','NO'),
        ('amount','integer','NO'),('unit','text','NO'),
        ('previous_progress','integer','NO'),
        ('new_progress','integer','NO'),
        ('created_at','timestamp with time zone','NO')
    ) as expected(column_name,data_type,is_nullable)
    left join information_schema.columns actual
      on actual.table_schema='public'
      and actual.table_name='progress_logs'
      and actual.column_name=expected.column_name
    where actual.column_name is null
      or actual.data_type<>expected.data_type
      or actual.is_nullable<>expected.is_nullable
  ) then
    raise exception 'd2b1_progress_logs_full_shape_drift';
  end if;

  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid='public.media_items'::regclass and contype='p';
  if v_definition <> 'PRIMARY KEY (id)' then
    raise exception 'd2b1_media_primary_key_drift: %', coalesce(v_definition,'missing');
  end if;

  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass and contype='p';
  if v_definition <> 'PRIMARY KEY (id)' then
    raise exception 'd2b1_progress_primary_key_drift: %', coalesce(v_definition,'missing');
  end if;
  if (
    with media_checks as (
      select
        c.oid,
        c.conname,
        a.attname,
        replace(replace(
          regexp_replace(
            lower(pg_get_constraintdef(c.oid)),
            '[[:space:]()"]','','g'
          ),
          '::integer',''
        ),'::numeric','') as normalized_definition
      from pg_constraint c
      cross join lateral unnest(c.conkey) key(attnum)
      join pg_attribute a
        on a.attrelid=c.conrelid and a.attnum=key.attnum
      where c.conrelid='public.media_items'::regclass
        and c.contype='c'
        and a.attname in (
          'current_progress','total_progress','user_rating'
        )
    )
    select
      count(distinct oid) filter (
        where attname='current_progress'
      )<>1
      or count(distinct oid) filter (
        where attname='current_progress'
          and conname in (
            'media_items_progress_nonneg',
            'media_items_current_progress_check'
          )
          and normalized_definition='checkcurrent_progress>=0'
      )<>1
      or count(distinct oid) filter (
        where attname='total_progress'
      )<>1
      or count(distinct oid) filter (
        where attname='total_progress'
          and conname in (
            'media_items_total_nonneg',
            'media_items_total_progress_check'
          )
          and normalized_definition='checktotal_progress>=0'
      )<>1
      or count(distinct oid) filter (
        where attname='user_rating'
      )<>1
      or count(distinct oid) filter (
        where attname='user_rating'
          and conname in (
            'media_items_user_rating_range',
            'media_items_user_rating_check'
          )
          and normalized_definition in (
            'checkuser_ratingisnulloruser_ratingbetween0and10',
            'checkuser_ratingisnulloruser_rating>=0anduser_rating<=10'
          )
      )<>1
    from media_checks
  ) then
    raise exception 'd2b1_media_check_constraint_drift';
  end if;

  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and contype='f'
    and conkey=array[
      (select attnum from pg_attribute
       where attrelid='public.progress_logs'::regclass and attname='media_id')
    ]::smallint[];
  if v_definition is null
    or v_definition not like
      'FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE SET NULL%' then
    raise exception 'd2b1_progress_media_fk_drift: %', coalesce(v_definition,'missing');
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.media_items'::regclass
      and c.relname='media_items_user_external_unique'
      and i.indisunique
  ) then
    raise exception 'd2b1_external_unique_index_missing_or_changed';
  end if;

  if not (
    select relrowsecurity from pg_class
    where oid='public.media_items'::regclass
  ) or not (
    select relrowsecurity from pg_class
    where oid='public.progress_logs'::regclass
  ) then
    raise exception 'd2b1_owner_rls_not_enabled';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies
  where schemaname='public' and tablename='media_items'
    and policyname in (
      'media_items_select_own',
      'media_items_insert_own',
      'media_items_update_own',
      'media_items_delete_own'
    );
  if v_policy_count <> 4 then
    raise exception 'd2b1_media_owner_policy_drift';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='media_items'
      and policyname in (
        'media_items_select_own',
        'media_items_insert_own',
        'media_items_update_own',
        'media_items_delete_own'
      )
      and (
        position('user_id' in coalesce(qual,''))=0
          and policyname<>'media_items_insert_own'
        or position('auth.uid()' in coalesce(qual,''))=0
          and policyname<>'media_items_insert_own'
        or position('user_id' in coalesce(with_check,''))=0
          and policyname in (
            'media_items_insert_own','media_items_update_own'
          )
        or position('auth.uid()' in coalesce(with_check,''))=0
          and policyname in (
            'media_items_insert_own','media_items_update_own'
          )
      )
  ) then
    raise exception 'd2b1_media_owner_policy_expression_drift';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies
  where schemaname='public' and tablename='progress_logs'
    and policyname in (
      'progress_logs_select_own',
      'progress_logs_insert_own',
      'progress_logs_update_own',
      'progress_logs_delete_own'
    );
  if v_policy_count <> 4 then
    raise exception 'd2b1_progress_owner_policy_drift';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='progress_logs'
      and policyname in (
        'progress_logs_select_own',
        'progress_logs_insert_own',
        'progress_logs_update_own',
        'progress_logs_delete_own'
      )
      and (
        position('user_id' in coalesce(qual,''))=0
          and policyname<>'progress_logs_insert_own'
        or position('auth.uid()' in coalesce(qual,''))=0
          and policyname<>'progress_logs_insert_own'
        or position('user_id' in coalesce(with_check,''))=0
          and policyname in (
            'progress_logs_insert_own','progress_logs_update_own'
          )
        or position('auth.uid()' in coalesce(with_check,''))=0
          and policyname in (
            'progress_logs_insert_own','progress_logs_update_own'
          )
      )
  ) then
    raise exception 'd2b1_progress_owner_policy_expression_drift';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and (
        (table_name='media_items' and column_name in (
          'row_pk','canonical_version','canonical_key','canonical_source',
          'canonical_namespace','canonical_stable_id','identity_status',
          'revision','last_operation_id'
        ))
        or
        (table_name='progress_logs' and column_name in (
          'log_pk','revision','deleted_at','last_operation_id'
        ))
      )
  ) or to_regclass('public.cloud_media_sync_operations') is not null then
    raise exception 'd2b1_target_objects_already_exist';
  end if;

  if exists (
    select 1
    from public.progress_logs p
    join public.media_items m on m.id=p.media_id
    where p.media_id is not null and p.user_id<>m.user_id
  ) then
    raise exception 'd2b1_cross_owner_progress_relation';
  end if;
end;
$d2b1_preflight$;

alter table public.media_items
  add column row_pk uuid generated always as (
    md5(
      'mediatracker:cloud-media-v2:media:' || user_id::text || ':' || id
    )::uuid
  ) stored,
  add column canonical_version smallint,
  add column canonical_key text,
  add column canonical_source text,
  add column canonical_namespace text,
  add column canonical_stable_id text,
  add column identity_status text,
  add column revision bigint not null default 1,
  add column last_operation_id text;

alter table public.media_items
  alter column row_pk set not null,
  add constraint media_items_row_pk_key unique (row_pk),
  add constraint media_items_owner_record_v2_key unique (user_id,id),
  add constraint media_items_revision_v2_check check (revision>=1),
  add constraint media_items_last_operation_v2_check
    check (
      last_operation_id is null
      or char_length(last_operation_id) between 8 and 240
    ),
  add constraint media_items_identity_v2_check check (
    (
      identity_status is null
      and canonical_version is null
      and canonical_key is null
      and canonical_source is null
      and canonical_namespace is null
      and canonical_stable_id is null
    )
    or (
      identity_status='unresolved'
      and canonical_version is null
      and canonical_key is null
      and canonical_source is null
      and canonical_namespace is null
      and canonical_stable_id is null
    )
    or (
      identity_status='resolved'
      and canonical_version=2
      and char_length(canonical_key) between 8 and 512
      and char_length(canonical_stable_id) between 1 and 240
      and canonical_key=(
        'v2:' || canonical_source || ':' ||
        canonical_namespace || ':' || canonical_stable_id
      )
      and (
        (canonical_source='tmdb' and canonical_namespace in ('movie','tv'))
        or (canonical_source='anilist' and canonical_namespace in ('anime','manga'))
        or (canonical_source='tvmaze' and canonical_namespace in ('show','season'))
        or (canonical_source='omdb' and canonical_namespace='title')
        or (canonical_source='openlibrary' and canonical_namespace in ('work','edition'))
        or (canonical_source='manual' and canonical_namespace='item')
        or (canonical_source='legacy' and canonical_namespace='record')
      )
    )
  );

create index media_items_owner_canonical_v2_idx
  on public.media_items(user_id,canonical_key)
  where canonical_key is not null;
create index media_items_owner_revision_v2_idx
  on public.media_items(user_id,revision);
create index media_items_owner_deleted_updated_v2_idx
  on public.media_items(user_id,deleted_at,updated_at);

alter table public.progress_logs
  add column log_pk uuid generated always as (
    md5(
      'mediatracker:cloud-media-v2:progress:' || user_id::text || ':' || id
    )::uuid
  ) stored,
  add column revision bigint not null default 1,
  add column deleted_at timestamptz,
  add column last_operation_id text;

alter table public.progress_logs
  alter column log_pk set not null,
  add constraint progress_logs_log_pk_key unique (log_pk),
  add constraint progress_logs_owner_record_v2_key unique (user_id,id),
  add constraint progress_logs_revision_v2_check check (revision>=1),
  add constraint progress_logs_last_operation_v2_check
    check (
      last_operation_id is null
      or char_length(last_operation_id) between 8 and 240
    ),
  add constraint progress_logs_owner_media_v2_fkey
    foreign key (user_id,media_id)
    references public.media_items(user_id,id)
    on delete set null (media_id)
    not valid;

alter table public.progress_logs
  validate constraint progress_logs_owner_media_v2_fkey;

create index progress_logs_owner_revision_v2_idx
  on public.progress_logs(user_id,revision);
create index progress_logs_owner_deleted_created_v2_idx
  on public.progress_logs(user_id,deleted_at,created_at desc);

create table public.cloud_media_sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  entity_type text not null,
  record_id text not null,
  operation_type text not null,
  request_hash text not null,
  expected_revision bigint not null,
  status text not null,
  applied_revision bigint,
  result jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  primary key (user_id,operation_id),
  constraint cloud_media_sync_operations_operation_id_check
    check (char_length(operation_id) between 8 and 240),
  constraint cloud_media_sync_operations_entity_check
    check (entity_type in ('media','progress')),
  constraint cloud_media_sync_operations_type_check
    check (operation_type in ('upsert','delete','restore')),
  constraint cloud_media_sync_operations_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint cloud_media_sync_operations_expected_revision_check
    check (expected_revision>=0),
  constraint cloud_media_sync_operations_status_check
    check (status in ('applied','conflict')),
  constraint cloud_media_sync_operations_result_check
    check (jsonb_typeof(result)='object')
);

create index cloud_media_sync_operations_owner_created_idx
  on public.cloud_media_sync_operations(user_id,created_at desc);
create index cloud_media_sync_operations_owner_record_idx
  on public.cloud_media_sync_operations(user_id,entity_type,record_id);

alter table public.cloud_media_sync_operations enable row level security;

create policy media_items_v2_owner_guard
  on public.media_items
  as restrictive
  for all
  to authenticated
  using (auth.uid()=user_id)
  with check (auth.uid()=user_id);

create policy progress_logs_v2_owner_guard
  on public.progress_logs
  as restrictive
  for all
  to authenticated
  using (auth.uid()=user_id)
  with check (auth.uid()=user_id);

create policy cloud_media_sync_operations_select_own
  on public.cloud_media_sync_operations
  for select
  to authenticated
  using (auth.uid()=user_id);

create policy cloud_media_sync_operations_owner_guard
  on public.cloud_media_sync_operations
  as restrictive
  for all
  to authenticated
  using (auth.uid()=user_id)
  with check (auth.uid()=user_id);

revoke all on table public.cloud_media_sync_operations
  from public,anon,authenticated;
grant select on table public.cloud_media_sync_operations to authenticated;

create function public.cloud_media_v2_request_hash(
  p_entity_type text,
  p_record_id text,
  p_operation_type text,
  p_expected_revision bigint,
  p_payload jsonb
) returns text
language sql
immutable
set search_path=pg_catalog,public,pg_temp
as $$
  select encode(
    sha256(
      convert_to(
        jsonb_build_object(
          'entityType',p_entity_type,
          'recordId',p_record_id,
          'operationType',p_operation_type,
          'expectedRevision',p_expected_revision,
          'payload',coalesce(p_payload,'null'::jsonb)
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );
$$;

create function public.cloud_media_v2_payload_is_valid(
  p_payload jsonb
) returns boolean
language plpgsql
immutable
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_key text;
  v_identity_status text;
  v_source text;
  v_namespace text;
  v_stable_id text;
begin
  if jsonb_typeof(p_payload)<>'object'
    or not (p_payload ?& array[
      'title','type','status','current_progress','total_progress',
      'favorite','tags','metadata'
    ])
    or exists (
      select 1
      from jsonb_object_keys(p_payload) as key
      where key not in (
        'title','type','status','current_progress','total_progress',
        'external_source','external_id','cover_url','backdrop_url',
        'overview','release_year','favorite','user_rating','tags',
        'personal_notes','metadata','identity_status','canonical_version',
        'canonical_key','canonical_source','canonical_namespace',
        'canonical_stable_id'
      )
    ) then
    return false;
  end if;

  if char_length(trim(coalesce(p_payload->>'title',''))) not between 1 and 500
    or coalesce(p_payload->>'type','') not in (
      'movie','tv','anime','manga','manhwa','manhua','book',
      'light_novel','web_novel','visual_novel'
    )
    or coalesce(p_payload->>'status','') not in (
      'planning','watching','reading','completed','dropped','paused'
    )
    or jsonb_typeof(p_payload->'current_progress')<>'number'
    or jsonb_typeof(p_payload->'total_progress')<>'number'
    or (p_payload->>'current_progress') !~ '^[0-9]+$'
    or (p_payload->>'total_progress') !~ '^[0-9]+$'
    or (p_payload->>'current_progress')::numeric>2147483647
    or (p_payload->>'total_progress')::numeric>2147483647
    or jsonb_typeof(p_payload->'favorite')<>'boolean'
    or jsonb_typeof(p_payload->'tags')<>'array'
    or jsonb_array_length(p_payload->'tags')>100
    or exists (
      select 1 from jsonb_array_elements(p_payload->'tags') value
      where jsonb_typeof(value)<>'string'
        or char_length(value#>>'{}')>120
    )
    or jsonb_typeof(p_payload->'metadata')<>'object'
    or octet_length((p_payload->'metadata')::text)>1048576 then
    return false;
  end if;

  if p_payload ? 'release_year'
    and jsonb_typeof(p_payload->'release_year') not in ('number','null') then
    return false;
  end if;
  if jsonb_typeof(p_payload->'release_year')='number'
    and (
      (p_payload->>'release_year') !~ '^-?[0-9]+$'
      or (p_payload->>'release_year')::numeric not between -2147483648 and 2147483647
    ) then
    return false;
  end if;
  if p_payload ? 'user_rating'
    and jsonb_typeof(p_payload->'user_rating') not in ('number','null') then
    return false;
  end if;
  if jsonb_typeof(p_payload->'user_rating')='number'
    and (
      (p_payload->>'user_rating') !~ '^[0-9]+$'
      or (p_payload->>'user_rating')::integer not between 0 and 10
    ) then
    return false;
  end if;

  foreach v_key in array array[
    'external_source','external_id','cover_url','backdrop_url',
    'overview','personal_notes'
  ]
  loop
    if p_payload ? v_key
      and jsonb_typeof(p_payload->v_key) not in ('string','null') then
      return false;
    end if;
  end loop;
  if char_length(coalesce(p_payload->>'external_source',''))>40
    or char_length(coalesce(p_payload->>'external_id',''))>240
    or char_length(coalesce(p_payload->>'cover_url',''))>2000
    or char_length(coalesce(p_payload->>'backdrop_url',''))>2000
    or char_length(coalesce(p_payload->>'overview',''))>20000
    or char_length(coalesce(p_payload->>'personal_notes',''))>100000 then
    return false;
  end if;

  v_identity_status:=coalesce(p_payload->>'identity_status','unresolved');
  if v_identity_status='unresolved' then
    return not exists (
      select 1
      from unnest(array[
        'canonical_version','canonical_key','canonical_source',
        'canonical_namespace','canonical_stable_id'
      ]) field
      where p_payload->field is not null
        and jsonb_typeof(p_payload->field)<>'null'
    );
  end if;
  if v_identity_status<>'resolved'
    or jsonb_typeof(p_payload->'canonical_version')<>'number'
    or p_payload->>'canonical_version'<>'2'
    or jsonb_typeof(p_payload->'canonical_key')<>'string'
    or jsonb_typeof(p_payload->'canonical_source')<>'string'
    or jsonb_typeof(p_payload->'canonical_namespace')<>'string'
    or jsonb_typeof(p_payload->'canonical_stable_id')<>'string' then
    return false;
  end if;

  v_source:=p_payload->>'canonical_source';
  v_namespace:=p_payload->>'canonical_namespace';
  v_stable_id:=p_payload->>'canonical_stable_id';
  if char_length(coalesce(v_stable_id,'')) not between 1 and 240
    or p_payload->>'canonical_key'<>(
      'v2:' || v_source || ':' || v_namespace || ':' || v_stable_id
    ) then
    return false;
  end if;
  return (
    (v_source='tmdb' and v_namespace in ('movie','tv'))
    or (v_source='anilist' and v_namespace in ('anime','manga'))
    or (v_source='tvmaze' and v_namespace in ('show','season'))
    or (v_source='omdb' and v_namespace='title')
    or (v_source='openlibrary' and v_namespace in ('work','edition'))
    or (v_source='manual' and v_namespace='item')
    or (v_source='legacy' and v_namespace='record')
  );
exception when others then
  return false;
end;
$$;

create function public.cloud_progress_v2_payload_is_valid(
  p_payload jsonb
) returns boolean
language plpgsql
immutable
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_created_at timestamptz;
begin
  if jsonb_typeof(p_payload)<>'object'
    or not (p_payload ?& array[
      'media_title','media_type','action','amount','unit',
      'previous_progress','new_progress','created_at'
    ])
    or exists (
      select 1
      from jsonb_object_keys(p_payload) as key
      where key not in (
        'media_id','media_title','media_type','action','amount','unit',
        'previous_progress','new_progress','created_at'
      )
    ) then
    return false;
  end if;
  if p_payload ? 'media_id'
    and jsonb_typeof(p_payload->'media_id') not in ('string','null') then
    return false;
  end if;
  if char_length(coalesce(p_payload->>'media_id',''))>240
    or char_length(trim(coalesce(p_payload->>'media_title',''))) not between 1 and 500
    or coalesce(p_payload->>'media_type','') not in (
      'movie','tv','anime','manga','manhwa','manhua','book',
      'light_novel','web_novel','visual_novel'
    )
    or coalesce(p_payload->>'action','') not in (
      'increment','complete','manual_adjust','added'
    )
    or coalesce(p_payload->>'unit','') not in (
      'episode','chapter','page','movie'
    ) then
    return false;
  end if;
  if exists (
    select 1
    from unnest(array['amount','previous_progress','new_progress']) field
    where jsonb_typeof(p_payload->field)<>'number'
      or (p_payload->>field) !~ '^-?[0-9]+$'
      or (p_payload->>field)::numeric not between -2147483648 and 2147483647
  ) then
    return false;
  end if;
  if (p_payload->>'previous_progress')::integer<0
    or (p_payload->>'new_progress')::integer<0 then
    return false;
  end if;
  v_created_at:=(p_payload->>'created_at')::timestamptz;
  return v_created_at is not null;
exception when others then
  return false;
end;
$$;

create function public.cloud_media_v2_revision_guard()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_operation_id text:=nullif(
    current_setting('mediatracker.cloud_operation_id',true),
    ''
  );
begin
  if tg_op='INSERT' then
    new.revision:=1;
    new.last_operation_id:=v_operation_id;
  else
    new.revision:=old.revision+1;
    new.last_operation_id:=coalesce(v_operation_id,old.last_operation_id);
  end if;
  return new;
end;
$$;

create trigger media_items_v2_revision_guard
  before insert or update on public.media_items
  for each row execute function public.cloud_media_v2_revision_guard();

create trigger progress_logs_v2_revision_guard
  before insert or update on public.progress_logs
  for each row execute function public.cloud_media_v2_revision_guard();

create function public.apply_media_item_sync_operation(
  p_operation_id text,
  p_record_id text,
  p_operation_type text,
  p_expected_revision bigint,
  p_payload jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_hash text;
  v_existing_operation public.cloud_media_sync_operations%rowtype;
  v_current public.media_items%rowtype;
  v_result jsonb;
  v_revision bigint;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(coalesce(p_operation_id,'')) not between 8 and 240
    or char_length(coalesce(p_record_id,'')) not between 1 and 240
    or p_operation_type not in ('upsert','delete','restore')
    or p_expected_revision is null
    or p_expected_revision<0 then
    raise exception 'cloud_media_operation_invalid';
  end if;
  if p_operation_type='upsert'
    and not public.cloud_media_v2_payload_is_valid(p_payload) then
    raise exception 'cloud_media_payload_invalid';
  end if;
  if p_operation_type in ('delete','restore') and p_payload is not null then
    raise exception 'cloud_media_payload_not_allowed';
  end if;

  v_hash:=public.cloud_media_v2_request_hash(
    'media',p_record_id,p_operation_type,p_expected_revision,p_payload
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_operation_id,0)
  );

  select * into v_existing_operation
  from public.cloud_media_sync_operations
  where user_id=v_user and operation_id=p_operation_id;
  if found then
    if v_existing_operation.request_hash<>v_hash then
      raise exception 'cloud_operation_id_reused';
    end if;
    return v_existing_operation.result;
  end if;

  select * into v_current
  from public.media_items
  where user_id=v_user and id=p_record_id
  for update;

  if not found and exists (
    select 1 from public.media_items
    where id=p_record_id and user_id<>v_user
  ) then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','record_id_unavailable',
      'entityType','media','recordId',p_record_id,'revision',0
    );
    insert into public.cloud_media_sync_operations(
      user_id,operation_id,entity_type,record_id,operation_type,
      request_hash,expected_revision,status,applied_revision,result
    ) values (
      v_user,p_operation_id,'media',p_record_id,p_operation_type,
      v_hash,p_expected_revision,'conflict',null,v_result
    );
    return v_result;
  end if;

  if p_operation_type='upsert' then
    if not found then
      if p_expected_revision<>0 then
        v_result:=jsonb_build_object(
          'ok',false,'conflict',true,'reason','revision_mismatch',
          'entityType','media','recordId',p_record_id,'revision',0
        );
      else
        perform set_config(
          'mediatracker.cloud_operation_id',p_operation_id,true
        );
        insert into public.media_items(
          id,user_id,title,type,status,current_progress,total_progress,
          external_source,external_id,cover_url,backdrop_url,overview,
          release_year,favorite,user_rating,tags,personal_notes,metadata,
          identity_status,canonical_version,canonical_key,canonical_source,
          canonical_namespace,canonical_stable_id
        ) values (
          p_record_id,v_user,p_payload->>'title',p_payload->>'type',
          p_payload->>'status',(p_payload->>'current_progress')::integer,
          (p_payload->>'total_progress')::integer,p_payload->>'external_source',
          p_payload->>'external_id',p_payload->>'cover_url',
          p_payload->>'backdrop_url',p_payload->>'overview',
          (p_payload->>'release_year')::integer,
          (p_payload->>'favorite')::boolean,
          (p_payload->>'user_rating')::integer,
          array(select jsonb_array_elements_text(p_payload->'tags')),
          p_payload->>'personal_notes',p_payload->'metadata',
          coalesce(p_payload->>'identity_status','unresolved'),
          (p_payload->>'canonical_version')::smallint,
          p_payload->>'canonical_key',p_payload->>'canonical_source',
          p_payload->>'canonical_namespace',
          p_payload->>'canonical_stable_id'
        )
        returning revision into v_revision;
        v_result:=jsonb_build_object(
          'ok',true,'conflict',false,'reason','created',
          'entityType','media','recordId',p_record_id,
          'revision',v_revision,'deletedAt',null
        );
      end if;
    elsif v_current.deleted_at is not null then
      v_result:=jsonb_build_object(
        'ok',false,'conflict',true,'reason','tombstoned',
        'entityType','media','recordId',p_record_id,
        'revision',v_current.revision,'deletedAt',v_current.deleted_at
      );
    elsif v_current.revision<>p_expected_revision then
      v_result:=jsonb_build_object(
        'ok',false,'conflict',true,'reason','revision_mismatch',
        'entityType','media','recordId',p_record_id,
        'revision',v_current.revision,'deletedAt',v_current.deleted_at
      );
    else
      perform set_config(
        'mediatracker.cloud_operation_id',p_operation_id,true
      );
      update public.media_items set
        title=p_payload->>'title',
        type=p_payload->>'type',
        status=p_payload->>'status',
        current_progress=(p_payload->>'current_progress')::integer,
        total_progress=(p_payload->>'total_progress')::integer,
        external_source=p_payload->>'external_source',
        external_id=p_payload->>'external_id',
        cover_url=p_payload->>'cover_url',
        backdrop_url=p_payload->>'backdrop_url',
        overview=p_payload->>'overview',
        release_year=(p_payload->>'release_year')::integer,
        favorite=(p_payload->>'favorite')::boolean,
        user_rating=(p_payload->>'user_rating')::integer,
        tags=array(select jsonb_array_elements_text(p_payload->'tags')),
        personal_notes=p_payload->>'personal_notes',
        metadata=p_payload->'metadata',
        identity_status=coalesce(
          p_payload->>'identity_status','unresolved'
        ),
        canonical_version=(p_payload->>'canonical_version')::smallint,
        canonical_key=p_payload->>'canonical_key',
        canonical_source=p_payload->>'canonical_source',
        canonical_namespace=p_payload->>'canonical_namespace',
        canonical_stable_id=p_payload->>'canonical_stable_id'
      where user_id=v_user and id=p_record_id
      returning revision into v_revision;
      v_result:=jsonb_build_object(
        'ok',true,'conflict',false,'reason','updated',
        'entityType','media','recordId',p_record_id,
        'revision',v_revision,'deletedAt',null
      );
    end if;
  elsif not found then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','not_found',
      'entityType','media','recordId',p_record_id,'revision',0
    );
  elsif v_current.revision<>p_expected_revision then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','revision_mismatch',
      'entityType','media','recordId',p_record_id,
      'revision',v_current.revision,'deletedAt',v_current.deleted_at
    );
  elsif p_operation_type='delete' and v_current.deleted_at is not null then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','already_tombstoned',
      'entityType','media','recordId',p_record_id,
      'revision',v_current.revision,'deletedAt',v_current.deleted_at
    );
  elsif p_operation_type='restore' and v_current.deleted_at is null then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','not_tombstoned',
      'entityType','media','recordId',p_record_id,
      'revision',v_current.revision,'deletedAt',null
    );
  else
    perform set_config(
      'mediatracker.cloud_operation_id',p_operation_id,true
    );
    update public.media_items set
      deleted_at=case
        when p_operation_type='delete' then now()
        else null
      end
    where user_id=v_user and id=p_record_id
    returning revision,deleted_at into v_revision,v_current.deleted_at;
    v_result:=jsonb_build_object(
      'ok',true,'conflict',false,'reason',p_operation_type || 'd',
      'entityType','media','recordId',p_record_id,
      'revision',v_revision,'deletedAt',v_current.deleted_at
    );
  end if;

  insert into public.cloud_media_sync_operations(
    user_id,operation_id,entity_type,record_id,operation_type,
    request_hash,expected_revision,status,applied_revision,result
  ) values (
    v_user,p_operation_id,'media',p_record_id,p_operation_type,
    v_hash,p_expected_revision,
    case when (v_result->>'ok')::boolean then 'applied' else 'conflict' end,
    case when (v_result->>'ok')::boolean
      then (v_result->>'revision')::bigint else null end,
    v_result
  );
  return v_result;
end;
$$;

create function public.apply_progress_log_sync_operation(
  p_operation_id text,
  p_record_id text,
  p_operation_type text,
  p_expected_revision bigint,
  p_payload jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_hash text;
  v_existing_operation public.cloud_media_sync_operations%rowtype;
  v_current public.progress_logs%rowtype;
  v_result jsonb;
  v_revision bigint;
  v_media_id text;
  v_created_at timestamptz;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(coalesce(p_operation_id,'')) not between 8 and 240
    or char_length(coalesce(p_record_id,'')) not between 1 and 240
    or p_operation_type not in ('upsert','delete','restore')
    or p_expected_revision is null
    or p_expected_revision<0 then
    raise exception 'cloud_progress_operation_invalid';
  end if;
  if p_operation_type='upsert'
    and not public.cloud_progress_v2_payload_is_valid(p_payload) then
    raise exception 'cloud_progress_payload_invalid';
  end if;
  if p_operation_type in ('delete','restore') and p_payload is not null then
    raise exception 'cloud_progress_payload_not_allowed';
  end if;

  v_hash:=public.cloud_media_v2_request_hash(
    'progress',p_record_id,p_operation_type,p_expected_revision,p_payload
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_operation_id,0)
  );

  select * into v_existing_operation
  from public.cloud_media_sync_operations
  where user_id=v_user and operation_id=p_operation_id;
  if found then
    if v_existing_operation.request_hash<>v_hash then
      raise exception 'cloud_operation_id_reused';
    end if;
    return v_existing_operation.result;
  end if;

  select * into v_current
  from public.progress_logs
  where user_id=v_user and id=p_record_id
  for update;

  if not found and exists (
    select 1 from public.progress_logs
    where id=p_record_id and user_id<>v_user
  ) then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','record_id_unavailable',
      'entityType','progress','recordId',p_record_id,'revision',0
    );
  elsif p_operation_type='upsert' then
    v_media_id:=nullif(p_payload->>'media_id','');
    v_created_at:=(p_payload->>'created_at')::timestamptz;
    if v_media_id is not null and not exists (
      select 1 from public.media_items
      where user_id=v_user and id=v_media_id
    ) then
      v_result:=jsonb_build_object(
        'ok',false,'conflict',true,'reason','media_target_unavailable',
        'entityType','progress','recordId',p_record_id,'revision',0
      );
    elsif not found then
      if p_expected_revision<>0 then
        v_result:=jsonb_build_object(
          'ok',false,'conflict',true,'reason','revision_mismatch',
          'entityType','progress','recordId',p_record_id,'revision',0
        );
      else
        perform set_config(
          'mediatracker.cloud_operation_id',p_operation_id,true
        );
        insert into public.progress_logs(
          id,user_id,media_id,media_title,media_type,action,amount,unit,
          previous_progress,new_progress,created_at
        ) values (
          p_record_id,v_user,v_media_id,p_payload->>'media_title',
          p_payload->>'media_type',p_payload->>'action',
          (p_payload->>'amount')::integer,p_payload->>'unit',
          (p_payload->>'previous_progress')::integer,
          (p_payload->>'new_progress')::integer,v_created_at
        )
        returning revision into v_revision;
        v_result:=jsonb_build_object(
          'ok',true,'conflict',false,'reason','created',
          'entityType','progress','recordId',p_record_id,
          'revision',v_revision,'deletedAt',null
        );
      end if;
    elsif v_current.deleted_at is not null then
      v_result:=jsonb_build_object(
        'ok',false,'conflict',true,'reason','tombstoned',
        'entityType','progress','recordId',p_record_id,
        'revision',v_current.revision,'deletedAt',v_current.deleted_at
      );
    elsif v_current.media_id is not distinct from v_media_id
      and v_current.media_title=p_payload->>'media_title'
      and v_current.media_type=p_payload->>'media_type'
      and v_current.action=p_payload->>'action'
      and v_current.amount=(p_payload->>'amount')::integer
      and v_current.unit=p_payload->>'unit'
      and v_current.previous_progress=(
        p_payload->>'previous_progress'
      )::integer
      and v_current.new_progress=(p_payload->>'new_progress')::integer
      and v_current.created_at=v_created_at then
      v_result:=jsonb_build_object(
        'ok',true,'conflict',false,'reason','unchanged',
        'entityType','progress','recordId',p_record_id,
        'revision',v_current.revision,'deletedAt',null
      );
    else
      v_result:=jsonb_build_object(
        'ok',false,'conflict',true,'reason','immutable_log_conflict',
        'entityType','progress','recordId',p_record_id,
        'revision',v_current.revision,'deletedAt',v_current.deleted_at
      );
    end if;
  elsif not found then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','not_found',
      'entityType','progress','recordId',p_record_id,'revision',0
    );
  elsif v_current.revision<>p_expected_revision then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','revision_mismatch',
      'entityType','progress','recordId',p_record_id,
      'revision',v_current.revision,'deletedAt',v_current.deleted_at
    );
  elsif p_operation_type='delete' and v_current.deleted_at is not null then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','already_tombstoned',
      'entityType','progress','recordId',p_record_id,
      'revision',v_current.revision,'deletedAt',v_current.deleted_at
    );
  elsif p_operation_type='restore' and v_current.deleted_at is null then
    v_result:=jsonb_build_object(
      'ok',false,'conflict',true,'reason','not_tombstoned',
      'entityType','progress','recordId',p_record_id,
      'revision',v_current.revision,'deletedAt',null
    );
  else
    perform set_config(
      'mediatracker.cloud_operation_id',p_operation_id,true
    );
    update public.progress_logs set
      deleted_at=case
        when p_operation_type='delete' then now()
        else null
      end
    where user_id=v_user and id=p_record_id
    returning revision,deleted_at into v_revision,v_current.deleted_at;
    v_result:=jsonb_build_object(
      'ok',true,'conflict',false,'reason',p_operation_type || 'd',
      'entityType','progress','recordId',p_record_id,
      'revision',v_revision,'deletedAt',v_current.deleted_at
    );
  end if;

  insert into public.cloud_media_sync_operations(
    user_id,operation_id,entity_type,record_id,operation_type,
    request_hash,expected_revision,status,applied_revision,result
  ) values (
    v_user,p_operation_id,'progress',p_record_id,p_operation_type,
    v_hash,p_expected_revision,
    case when (v_result->>'ok')::boolean then 'applied' else 'conflict' end,
    case when (v_result->>'ok')::boolean
      then (v_result->>'revision')::bigint else null end,
    v_result
  );
  return v_result;
end;
$$;

revoke all on function public.cloud_media_v2_request_hash(
  text,text,text,bigint,jsonb
) from public,anon,authenticated;
revoke all on function public.cloud_media_v2_payload_is_valid(jsonb)
  from public,anon,authenticated;
revoke all on function public.cloud_progress_v2_payload_is_valid(jsonb)
  from public,anon,authenticated;
revoke all on function public.cloud_media_v2_revision_guard()
  from public,anon,authenticated;
revoke all on function public.apply_media_item_sync_operation(
  text,text,text,bigint,jsonb
) from public,anon;
revoke all on function public.apply_progress_log_sync_operation(
  text,text,text,bigint,jsonb
) from public,anon;

grant execute on function public.apply_media_item_sync_operation(
  text,text,text,bigint,jsonb
) to authenticated;
grant execute on function public.apply_progress_log_sync_operation(
  text,text,text,bigint,jsonb
) to authenticated;

commit;
