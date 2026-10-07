-- Native effective Cloud Media D2C.1 + Goal Cloud V1 snapshot. Fresh native DB only.
-- Reviewed source: core baseline, D2B.1 validators/constraints, final D2C.1 RPCs,
-- Goal Cloud V1. No historical migration is executed by this bootstrap.
-- Generated physical UUIDs, owner keys, request hashes and function bodies retained.
BEGIN;
SET LOCAL ROLE mt_auth_owner;
GRANT REFERENCES ON native_auth."user" TO mt_owner;
RESET ROLE;
SET LOCAL ROLE mt_owner;
create table app.media_items (
  id text not null,
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  title text not null,
  type text not null,
  status text not null,
  current_progress integer not null default 0,
  total_progress integer not null default 1,
  external_source text,
  external_id text,
  cover_url text,
  backdrop_url text,
  overview text,
  release_year integer,
  favorite boolean not null default false,
  user_rating integer,
  tags text[] not null default '{}',
  personal_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint media_items_progress_nonneg check (current_progress >= 0),
  constraint media_items_total_nonneg check (total_progress >= 0),
  constraint media_items_user_rating_range
    check (user_rating is null or user_rating between 0 and 10)
);

create table app.progress_logs (
  id text not null,
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  media_id text,
  detached_media_id text,
  detached_at timestamptz,
  media_title text not null,
  media_type text not null,
  action text not null,
  amount integer not null,
  unit text not null,
  previous_progress integer not null,
  new_progress integer not null,
  created_at timestamptz not null default now()
);

alter table app.media_items
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

alter table app.media_items
  alter column row_pk set not null,
  add constraint media_items_pkey primary key (row_pk),
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
  on app.media_items(user_id,canonical_key)
  where canonical_key is not null;
create index media_items_owner_revision_v2_idx
  on app.media_items(user_id,revision);
create index media_items_owner_deleted_updated_v2_idx
  on app.media_items(user_id,deleted_at,updated_at);

alter table app.progress_logs
  add column log_pk uuid generated always as (
    md5(
      'mediatracker:cloud-media-v2:progress:' || user_id::text || ':' || id
    )::uuid
  ) stored,
  add column revision bigint not null default 1,
  add column deleted_at timestamptz,
  add column last_operation_id text;

alter table app.progress_logs
  alter column log_pk set not null,
  add constraint progress_logs_pkey primary key (log_pk),
  add constraint progress_logs_owner_record_v2_key unique (user_id,id),
  add constraint progress_logs_revision_v2_check check (revision>=1),
  add constraint progress_logs_last_operation_v2_check
    check (
      last_operation_id is null
      or char_length(last_operation_id) between 8 and 240
    ),
  add constraint progress_logs_owner_media_v2_fkey
    foreign key (user_id,media_id)
    references app.media_items(user_id,id)
    on delete set null (media_id)
    not valid;

alter table app.progress_logs
  validate constraint progress_logs_owner_media_v2_fkey;

create index progress_logs_owner_revision_v2_idx
  on app.progress_logs(user_id,revision);
create index progress_logs_owner_deleted_created_v2_idx
  on app.progress_logs(user_id,deleted_at,created_at desc);



create table app.cloud_media_sync_operations (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
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

create table app.goals (
  row_pk uuid primary key default gen_random_uuid(),
  user_id uuid not null references native_auth."user"(id) on delete cascade,
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

create table app.goal_sync_operations (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
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

create function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function app.cloud_media_v2_request_hash(
  p_entity_type text,
  p_record_id text,
  p_operation_type text,
  p_expected_revision bigint,
  p_payload jsonb
) returns text
language sql
immutable
set search_path=pg_catalog,app,pg_temp
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

create function app.cloud_media_v2_payload_is_valid(
  p_payload jsonb
) returns boolean
language plpgsql
immutable
set search_path=pg_catalog,app,pg_temp
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

create function app.cloud_progress_v2_payload_is_valid(
  p_payload jsonb
) returns boolean
language plpgsql
immutable
set search_path=pg_catalog,app,pg_temp
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

create function app.cloud_media_v2_revision_guard()
returns trigger
language plpgsql
set search_path=pg_catalog,app,pg_temp
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

create or replace function app.apply_media_item_sync_operation(
  p_operation_id text,
  p_record_id text,
  p_operation_type text,
  p_expected_revision bigint,
  p_payload jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_user uuid:=app.current_user_id();
  v_hash text;
  v_existing_operation app.cloud_media_sync_operations%rowtype;
  v_current app.media_items%rowtype;
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
    and not app.cloud_media_v2_payload_is_valid(p_payload) then
    raise exception 'cloud_media_payload_invalid';
  end if;
  if p_operation_type in ('delete','restore') and p_payload is not null then
    raise exception 'cloud_media_payload_not_allowed';
  end if;

  v_hash:=app.cloud_media_v2_request_hash(
    'media',p_record_id,p_operation_type,p_expected_revision,p_payload
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_operation_id,0)
  );

  select * into v_existing_operation
  from app.cloud_media_sync_operations
  where user_id=v_user and operation_id=p_operation_id;
  if found then
    if v_existing_operation.request_hash<>v_hash then
      raise exception 'cloud_operation_id_reused';
    end if;
    return v_existing_operation.result;
  end if;

  select * into v_current
  from app.media_items
  where user_id=v_user and id=p_record_id
  for update;

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
        insert into app.media_items(
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
      update app.media_items set
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
    update app.media_items set
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

  insert into app.cloud_media_sync_operations(
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

create or replace function app.apply_progress_log_sync_operation(
  p_operation_id text,
  p_record_id text,
  p_operation_type text,
  p_expected_revision bigint,
  p_payload jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_user uuid:=app.current_user_id();
  v_hash text;
  v_existing_operation app.cloud_media_sync_operations%rowtype;
  v_current app.progress_logs%rowtype;
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
    and not app.cloud_progress_v2_payload_is_valid(p_payload) then
    raise exception 'cloud_progress_payload_invalid';
  end if;
  if p_operation_type in ('delete','restore') and p_payload is not null then
    raise exception 'cloud_progress_payload_not_allowed';
  end if;

  v_hash:=app.cloud_media_v2_request_hash(
    'progress',p_record_id,p_operation_type,p_expected_revision,p_payload
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_operation_id,0)
  );

  select * into v_existing_operation
  from app.cloud_media_sync_operations
  where user_id=v_user and operation_id=p_operation_id;
  if found then
    if v_existing_operation.request_hash<>v_hash then
      raise exception 'cloud_operation_id_reused';
    end if;
    return v_existing_operation.result;
  end if;

  select * into v_current
  from app.progress_logs
  where user_id=v_user and id=p_record_id
  for update;

  if p_operation_type='upsert' then
    v_media_id:=nullif(p_payload->>'media_id','');
    v_created_at:=(p_payload->>'created_at')::timestamptz;
    if v_media_id is not null and not exists (
      select 1 from app.media_items
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
        insert into app.progress_logs(
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
    update app.progress_logs set
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

  insert into app.cloud_media_sync_operations(
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

create function app.cloud_goal_v1_definition_is_valid(p_goal_id text,p_definition jsonb)
returns boolean language plpgsql immutable
set search_path=pg_catalog,app,pg_temp
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

create function app.cloud_goal_v1_request_hash(
  p_goal_id text,p_expected_revision bigint,p_definition jsonb,p_delete boolean
) returns text language sql immutable
set search_path=pg_catalog,app,pg_temp
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'goalId',p_goal_id,'expectedRevision',p_expected_revision,
    'definition',coalesce(p_definition,'null'::jsonb),'delete',p_delete
  )::text,'UTF8')),'hex');
$$;

create function app.apply_cloud_goal_v1(
  p_operation_id uuid,
  p_goal_id text,
  p_expected_revision bigint,
  p_definition jsonb default null,
  p_delete boolean default false
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_user uuid:=app.current_user_id();
  v_hash text;
  v_existing app.goal_sync_operations%rowtype;
  v_current app.goals%rowtype;
  v_result jsonb;
  v_now timestamptz:=now();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_operation_id is null or char_length(coalesce(p_goal_id,'')) not between 1 and 240
    or p_expected_revision is null or p_expected_revision<0 then
    return jsonb_build_object('status','invalid_payload','goalId',coalesce(p_goal_id,''),'revision',0,'deletedAt',null,'definition',null);
  end if;
  if (not p_delete and not app.cloud_goal_v1_definition_is_valid(p_goal_id,p_definition))
    or (p_delete and p_definition is not null and not app.cloud_goal_v1_definition_is_valid(p_goal_id,p_definition)) then
    return jsonb_build_object('status','invalid_payload','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
  end if;
  v_hash:=app.cloud_goal_v1_request_hash(p_goal_id,p_expected_revision,p_definition,p_delete);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_operation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':goal:' || p_goal_id,0));
  select * into v_existing from app.goal_sync_operations
    where user_id=v_user and operation_id=p_operation_id;
  if found then
    if v_existing.request_hash<>v_hash then
      return jsonb_build_object('status','operation_id_reused','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
    end if;
    return jsonb_set(v_existing.result,'{status}','"idempotent_replay"'::jsonb,true);
  end if;

  select * into v_current from app.goals
    where user_id=v_user and id=p_goal_id for update;

  if p_delete then
    if not found then
      if p_expected_revision<>0 then
        v_result:=jsonb_build_object('status','revision_conflict','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
      elsif p_definition is null then
        v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',0,'deletedAt',v_now,'definition',null);
      else
        insert into app.goals(user_id,id,definition,revision,deleted_at,last_operation_id,created_at,updated_at)
          values(v_user,p_goal_id,p_definition,1,v_now,p_operation_id,v_now,v_now) returning * into v_current;
        v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',1,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
      end if;
    elsif v_current.revision<>p_expected_revision then
      v_result:=jsonb_build_object('status','revision_conflict','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
    elsif v_current.deleted_at is not null then
      v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
    else
      update app.goals set deleted_at=v_now,revision=revision+1,last_operation_id=p_operation_id,updated_at=v_now
        where user_id=v_user and id=p_goal_id returning * into v_current;
      v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',v_current.deleted_at,'definition',v_current.definition);
    end if;
  elsif not found then
    if p_expected_revision<>0 then
      v_result:=jsonb_build_object('status','revision_conflict','goalId',p_goal_id,'revision',0,'deletedAt',null,'definition',null);
    else
      insert into app.goals(user_id,id,definition,revision,deleted_at,last_operation_id,created_at,updated_at)
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
    update app.goals set definition=p_definition,revision=revision+1,last_operation_id=p_operation_id,updated_at=v_now
      where user_id=v_user and id=p_goal_id returning * into v_current;
    v_result:=jsonb_build_object('status','applied','goalId',p_goal_id,'revision',v_current.revision,'deletedAt',null,'definition',v_current.definition);
  end if;

  insert into app.goal_sync_operations(user_id,operation_id,goal_id,operation_kind,request_hash,status,result)
  values(v_user,p_operation_id,p_goal_id,case when p_delete then 'tombstone' else 'upsert' end,v_hash,v_result->>'status',v_result);
  return v_result;
end;
$$;
create index media_items_user_id_idx
  on app.media_items (user_id);
create index media_items_user_type_idx
  on app.media_items (user_id, type);
create index media_items_user_status_idx
  on app.media_items (user_id, status);
create index media_items_user_favorite_idx
  on app.media_items (user_id, favorite);
create index media_items_user_external_idx
  on app.media_items (user_id, external_source, external_id);
create index media_items_updated_at_idx
  on app.media_items (updated_at);
create unique index media_items_user_external_unique
  on app.media_items (user_id, external_source, external_id)
  where external_source is not null and external_id is not null;
create index progress_logs_user_id_idx
  on app.progress_logs (user_id);
create index progress_logs_user_created_idx
  on app.progress_logs (user_id, created_at desc);
create index progress_logs_media_id_idx
  on app.progress_logs (media_id);
create index progress_logs_user_media_idx
  on app.progress_logs (user_id, media_id);
ALTER TABLE app.media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.media_items FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_scope ON app.media_items TO mt_runtime,mt_owner
USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
REVOKE ALL ON app.media_items FROM PUBLIC,mt_runtime;
GRANT SELECT ON app.media_items TO mt_runtime;
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE OR DELETE ON app.media_items
FOR EACH ROW EXECUTE FUNCTION app.guard_account_write();
ALTER TABLE app.progress_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.progress_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_scope ON app.progress_logs TO mt_runtime,mt_owner
USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
REVOKE ALL ON app.progress_logs FROM PUBLIC,mt_runtime;
GRANT SELECT ON app.progress_logs TO mt_runtime;
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE OR DELETE ON app.progress_logs
FOR EACH ROW EXECUTE FUNCTION app.guard_account_write();
ALTER TABLE app.cloud_media_sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_media_sync_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_scope ON app.cloud_media_sync_operations TO mt_runtime,mt_owner
USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
REVOKE ALL ON app.cloud_media_sync_operations FROM PUBLIC,mt_runtime;
GRANT SELECT ON app.cloud_media_sync_operations TO mt_runtime;
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE OR DELETE ON app.cloud_media_sync_operations
FOR EACH ROW EXECUTE FUNCTION app.guard_account_write();
ALTER TABLE app.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.goals FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_scope ON app.goals TO mt_runtime,mt_owner
USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
REVOKE ALL ON app.goals FROM PUBLIC,mt_runtime;
GRANT SELECT ON app.goals TO mt_runtime;
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE OR DELETE ON app.goals
FOR EACH ROW EXECUTE FUNCTION app.guard_account_write();
ALTER TABLE app.goal_sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.goal_sync_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_scope ON app.goal_sync_operations TO mt_runtime,mt_owner
USING(user_id=app.current_user_id()) WITH CHECK(user_id=app.current_user_id());
REVOKE ALL ON app.goal_sync_operations FROM PUBLIC,mt_runtime;
GRANT SELECT ON app.goal_sync_operations TO mt_runtime;
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE OR DELETE ON app.goal_sync_operations
FOR EACH ROW EXECUTE FUNCTION app.guard_account_write();
CREATE TRIGGER media_items_set_updated_at BEFORE UPDATE ON app.media_items FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER media_items_v2_revision_guard BEFORE INSERT OR UPDATE ON app.media_items FOR EACH ROW EXECUTE FUNCTION app.cloud_media_v2_revision_guard();
CREATE TRIGGER progress_logs_v2_revision_guard BEFORE INSERT OR UPDATE ON app.progress_logs FOR EACH ROW EXECUTE FUNCTION app.cloud_media_v2_revision_guard();
GRANT EXECUTE ON FUNCTION app.apply_media_item_sync_operation(text,text,text,bigint,jsonb),app.apply_progress_log_sync_operation(text,text,text,bigint,jsonb),app.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean) TO mt_runtime;
CREATE INDEX cloud_media_sync_operations_owner_created_idx ON app.cloud_media_sync_operations(user_id,created_at DESC);
CREATE INDEX cloud_media_sync_operations_owner_record_idx ON app.cloud_media_sync_operations(user_id,entity_type,record_id);
CREATE INDEX goals_owner_revision_idx ON app.goals(user_id,revision);
CREATE INDEX goals_owner_deleted_updated_idx ON app.goals(user_id,deleted_at,updated_at DESC);
CREATE INDEX goal_sync_operations_owner_goal_idx ON app.goal_sync_operations(user_id,goal_id,created_at DESC);
RESET ROLE;
COMMIT;
