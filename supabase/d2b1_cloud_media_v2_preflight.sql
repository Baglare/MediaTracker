begin transaction read only;

do $d2b1_read_only_preflight$
declare
  v_definition text;
  v_policy_count integer;
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'd2b1_requires_postgresql_15';
  end if;
  if to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception 'd2b1_required_postgresql_functions_missing';
  end if;
  if to_regclass('public.media_items') is null
    or to_regclass('public.progress_logs') is null then
    raise exception 'd2b1_expected_tables_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='media_items'
      and column_name='id' and data_type='text' and is_nullable='NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='media_items'
      and column_name='user_id' and data_type='uuid' and is_nullable='NO'
  ) or not exists (
    select 1 from information_schema.columns
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
    select 1 from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='id' and data_type='text' and is_nullable='NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='user_id' and data_type='uuid' and is_nullable='NO'
  ) or not exists (
    select 1 from information_schema.columns
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
  if v_definition<>'PRIMARY KEY (id)' then
    raise exception 'd2b1_media_primary_key_drift: %',coalesce(v_definition,'missing');
  end if;

  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass and contype='p';
  if v_definition<>'PRIMARY KEY (id)' then
    raise exception 'd2b1_progress_primary_key_drift: %',coalesce(v_definition,'missing');
  end if;
  if (
    select count(*)
    from pg_constraint
    where conrelid='public.media_items'::regclass
      and conname in (
        'media_items_progress_nonneg',
        'media_items_total_nonneg',
        'media_items_user_rating_range'
      )
      and contype='c'
  )<>3 then
    raise exception 'd2b1_media_check_constraint_drift';
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

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public' and tablename='media_items'
    and policyname in (
      'media_items_select_own','media_items_insert_own',
      'media_items_update_own','media_items_delete_own'
    );
  if v_policy_count<>4 then
    raise exception 'd2b1_media_owner_policy_drift';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='media_items'
      and policyname in (
        'media_items_select_own','media_items_insert_own',
        'media_items_update_own','media_items_delete_own'
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

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public' and tablename='progress_logs'
    and policyname in (
      'progress_logs_select_own','progress_logs_insert_own',
      'progress_logs_update_own','progress_logs_delete_own'
    );
  if v_policy_count<>4 then
    raise exception 'd2b1_progress_owner_policy_drift';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='progress_logs'
      and policyname in (
        'progress_logs_select_own','progress_logs_insert_own',
        'progress_logs_update_own','progress_logs_delete_own'
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
    from public.progress_logs p
    join public.media_items m on m.id=p.media_id
    where p.media_id is not null and p.user_id<>m.user_id
  ) then
    raise exception 'd2b1_cross_owner_progress_relation';
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
end;
$d2b1_read_only_preflight$;

select
  'media_items' as domain,
  count(*) as row_count,
  count(distinct id) as distinct_record_ids,
  count(distinct (user_id,id)) as distinct_owner_record_ids,
  sum(hashtextextended(user_id::text || ':' || id,0)::numeric)
    as owner_record_fingerprint
from public.media_items
union all
select
  'progress_logs',
  count(*),
  count(distinct id),
  count(distinct (user_id,id)),
  sum(hashtextextended(user_id::text || ':' || id,0)::numeric)
from public.progress_logs;

select
  count(*) filter (where p.media_id is not null and m.id is null)
    as orphan_progress_count,
  count(*) filter (
    where p.media_id is not null and m.id is not null
      and p.user_id<>m.user_id
  ) as cross_owner_progress_count
from public.progress_logs p
left join public.media_items m on m.id=p.media_id;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname='public'
  and tablename in ('media_items','progress_logs')
order by tablename,policyname;

rollback;
