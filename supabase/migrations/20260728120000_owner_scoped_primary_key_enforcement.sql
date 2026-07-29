begin;

-- D2C.1 changes the physical primary keys only after the V2 RPC client is the
-- exclusive mutation path. Stop on any drift from the validated D2B.1 shape.
do $d2c1_preflight$
declare
  v_definition text;
begin
  if to_regclass('public.media_items') is null
    or to_regclass('public.progress_logs') is null
    or to_regclass('public.cloud_media_sync_operations') is null then
    raise exception 'd2c1_required_tables_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='media_items'
      and column_name='row_pk' and data_type='uuid' and is_nullable='NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='log_pk' and data_type='uuid' and is_nullable='NO'
  ) then
    raise exception 'd2c1_physical_row_key_shape_drift';
  end if;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.media_items'::regclass
    and conname='media_items_pkey' and contype='p';
  if v_definition<>'PRIMARY KEY (id)' then
    raise exception 'd2c1_media_primary_key_drift: %',
      coalesce(v_definition,'missing');
  end if;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and conname='progress_logs_pkey' and contype='p';
  if v_definition<>'PRIMARY KEY (id)' then
    raise exception 'd2c1_progress_primary_key_drift: %',
      coalesce(v_definition,'missing');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.media_items'::regclass
      and conname='media_items_row_pk_key' and contype='u'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid='public.progress_logs'::regclass
      and conname='progress_logs_log_pk_key' and contype='u'
  ) then
    raise exception 'd2c1_physical_row_key_unique_drift';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.media_items'::regclass
      and conname='media_items_owner_record_v2_key'
      and contype='u' and convalidated
  ) or not exists (
    select 1 from pg_constraint
    where conrelid='public.progress_logs'::regclass
      and conname='progress_logs_owner_record_v2_key'
      and contype='u' and convalidated
  ) then
    raise exception 'd2c1_owner_record_unique_drift';
  end if;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and conname='progress_logs_media_id_fkey'
    and contype='f' and convalidated;
  if v_definition is null
    or v_definition not like
      'FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE SET NULL%' then
    raise exception 'd2c1_legacy_progress_fk_drift: %',
      coalesce(v_definition,'missing');
  end if;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and conname='progress_logs_owner_media_v2_fkey'
    and contype='f' and convalidated;
  if v_definition is null
    or v_definition not like
      'FOREIGN KEY (user_id, media_id) REFERENCES media_items(user_id, id)%' then
    raise exception 'd2c1_owner_progress_fk_drift: %',
      coalesce(v_definition,'missing');
  end if;

  if to_regprocedure(
    'public.apply_media_item_sync_operation(text,text,text,bigint,jsonb)'
  ) is null or to_regprocedure(
    'public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)'
  ) is null then
    raise exception 'd2c1_v2_sync_rpc_missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.media_items'::regclass
      and tgname='media_items_v2_revision_guard' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.progress_logs'::regclass
      and tgname='progress_logs_v2_revision_guard' and not tgisinternal
  ) then
    raise exception 'd2c1_revision_guard_missing';
  end if;

  if not (
    select relrowsecurity from pg_class
    where oid='public.media_items'::regclass
  ) or not (
    select relrowsecurity from pg_class
    where oid='public.progress_logs'::regclass
  ) then
    raise exception 'd2c1_owner_rls_not_enabled';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='media_items'
      and policyname='media_items_v2_owner_guard'
      and position('auth.uid()' in coalesce(qual,''))>0
      and position('user_id' in coalesce(qual,''))>0
      and position('auth.uid()' in coalesce(with_check,''))>0
      and position('user_id' in coalesce(with_check,''))>0
  ) or not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='progress_logs'
      and policyname='progress_logs_v2_owner_guard'
      and position('auth.uid()' in coalesce(qual,''))>0
      and position('user_id' in coalesce(qual,''))>0
      and position('auth.uid()' in coalesce(with_check,''))>0
      and position('user_id' in coalesce(with_check,''))>0
  ) then
    raise exception 'd2c1_owner_rls_policy_drift';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.media_items'::regclass
      and c.relname='media_items_owner_canonical_v2_idx'
      and not i.indisunique
  ) then
    raise exception 'd2c1_canonical_identity_index_drift';
  end if;
end;
$d2c1_preflight$;

-- Prevent writes between the data checks and the constraint/RPC switch.
lock table public.progress_logs, public.media_items
  in access exclusive mode;

do $d2c1_data_guard$
begin
  if exists (
    select 1 from public.media_items where row_pk is null
  ) or exists (
    select 1 from public.media_items
    group by row_pk having count(*)>1
  ) or exists (
    select 1 from public.progress_logs where log_pk is null
  ) or exists (
    select 1 from public.progress_logs
    group by log_pk having count(*)>1
  ) then
    raise exception 'd2c1_physical_row_key_backfill_invalid';
  end if;

  if exists (
    select 1 from public.media_items
    group by user_id,id having count(*)>1
  ) then
    raise exception 'd2c1_duplicate_media_owner_record';
  end if;
  if exists (
    select 1 from public.progress_logs
    group by user_id,id having count(*)>1
  ) then
    raise exception 'd2c1_duplicate_progress_owner_record';
  end if;

  if exists (
    select 1
    from public.progress_logs p
    left join public.media_items m
      on m.user_id=p.user_id and m.id=p.media_id
    where p.media_id is not null and m.row_pk is null
  ) then
    raise exception 'd2c1_orphan_or_cross_owner_progress_relation';
  end if;
end;
$d2c1_data_guard$;

-- The global FK depends on media_items(id). The validated owner-aware FK stays.
alter table public.progress_logs
  drop constraint progress_logs_media_id_fkey,
  drop constraint progress_logs_pkey,
  drop constraint progress_logs_log_pk_key,
  add constraint progress_logs_pkey primary key (log_pk);

alter table public.media_items
  drop constraint media_items_pkey,
  drop constraint media_items_row_pk_key,
  add constraint media_items_pkey primary key (row_pk);

create or replace function public.apply_media_item_sync_operation(
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

create or replace function public.apply_progress_log_sync_operation(
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

  if p_operation_type='upsert' then
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

-- Direct PostgREST mutations are no longer safe once id is owner-scoped.
-- SELECT remains available under the existing auth.uid()-based RLS policies.
revoke insert,update,delete on table public.media_items
  from anon,authenticated;
revoke insert,update,delete on table public.progress_logs
  from anon,authenticated;

do $d2c1_post_verification$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.media_items'::regclass
    and conname='media_items_pkey' and contype='p';
  if v_definition<>'PRIMARY KEY (row_pk)' then
    raise exception 'd2c1_media_pk_switch_failed: %',
      coalesce(v_definition,'missing');
  end if;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and conname='progress_logs_pkey' and contype='p';
  if v_definition<>'PRIMARY KEY (log_pk)' then
    raise exception 'd2c1_progress_pk_switch_failed: %',
      coalesce(v_definition,'missing');
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid='public.progress_logs'::regclass
      and conname='progress_logs_media_id_fkey'
  ) then
    raise exception 'd2c1_legacy_global_progress_fk_still_present';
  end if;

  if position(
    'record_id_unavailable'
    in pg_get_functiondef(
      'public.apply_media_item_sync_operation(text,text,text,bigint,jsonb)'
        ::regprocedure
    )
  )>0 or position(
    'record_id_unavailable'
    in pg_get_functiondef(
      'public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)'
        ::regprocedure
    )
  )>0 then
    raise exception 'd2c1_global_record_id_rpc_branch_still_present';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='media_items'
      and policyname='media_items_v2_owner_guard'
      and position('auth.uid()' in coalesce(qual,''))>0
      and position('user_id' in coalesce(qual,''))>0
      and position('auth.uid()' in coalesce(with_check,''))>0
      and position('user_id' in coalesce(with_check,''))>0
  ) or not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='progress_logs'
      and policyname='progress_logs_v2_owner_guard'
      and position('auth.uid()' in coalesce(qual,''))>0
      and position('user_id' in coalesce(qual,''))>0
      and position('auth.uid()' in coalesce(with_check,''))>0
      and position('user_id' in coalesce(with_check,''))>0
  ) then
    raise exception 'd2c1_owner_rls_policy_missing';
  end if;

  if has_table_privilege('authenticated','public.media_items','INSERT')
    or has_table_privilege('authenticated','public.media_items','UPDATE')
    or has_table_privilege('authenticated','public.media_items','DELETE')
    or has_table_privilege('authenticated','public.progress_logs','INSERT')
    or has_table_privilege('authenticated','public.progress_logs','UPDATE')
    or has_table_privilege('authenticated','public.progress_logs','DELETE')
  then
    raise exception 'd2c1_legacy_direct_mutation_privilege_still_present';
  end if;
end;
$d2c1_post_verification$;

commit;
