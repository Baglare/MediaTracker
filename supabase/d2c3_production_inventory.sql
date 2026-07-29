-- D2C.3A production inventory.
-- Read-only catalog and aggregate output; no personal note, title, external ID,
-- auth identity, secret or raw payload is selected.
begin transaction read only;

select
  current_database() as database_name,
  current_setting('server_version') as server_version,
  current_setting('transaction_read_only') as transaction_read_only,
  now() as audited_at;

select
  table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,
  column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('profiles','media_items','progress_logs',
    'cloud_media_sync_operations')
order by table_name,ordinal_position;

select
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  con.convalidated as validated,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('profiles','media_items','progress_logs',
    'cloud_media_sync_operations')
order by c.relname,con.conname;

select
  tablename,indexname,indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('profiles','media_items','progress_logs',
    'cloud_media_sync_operations')
order by tablename,indexname;

select
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('profiles','media_items','progress_logs')
  and not t.tgisinternal
order by c.relname,t.tgname;

select
  schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public'
  and tablename in ('profiles','media_items','progress_logs',
    'cloud_media_sync_operations')
order by tablename,policyname;

select
  routine_name,routine_type,security_type,data_type
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'set_updated_at','apply_media_item_sync_operation',
    'apply_progress_log_sync_operation','cloud_media_v2_payload_is_valid',
    'cloud_progress_v2_payload_is_valid'
  )
order by routine_name;

select 'profiles' as domain,count(*) as row_count from public.profiles
union all
select 'media_items',count(*) from public.media_items
union all
select 'progress_logs',count(*) from public.progress_logs;

select
  case
    when external_source in (
      'tmdb','anilist','tvmaze','omdb','openlibrary','manual'
    ) then external_source
    else '(other)'
  end as external_source_category,
  count(*) as duplicate_group_count,
  sum(group_size) as rows_in_duplicate_groups,
  max(group_size) as largest_group
from (
  select external_source,external_id,count(*) as group_size
  from public.media_items
  where nullif(trim(external_source),'') is not null
    and nullif(trim(external_id),'') is not null
  group by external_source,external_id
  having count(*)>1
) duplicate_external
group by external_source_category
order by duplicate_group_count desc,external_source_category;

-- Optional V2 fields are inventoried from catalogs so legacy production remains
-- queryable without referencing columns that may not exist yet.
select
  table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public'
  and (
    table_name='media_items' and column_name in (
      'row_pk','canonical_version','canonical_key','canonical_source',
      'canonical_namespace','canonical_stable_id','identity_status',
      'revision','deleted_at','last_operation_id'
    )
    or table_name='progress_logs' and column_name in (
      'log_pk','revision','deleted_at','last_operation_id'
    )
  )
order by table_name,column_name;

do $d2c3_optional_v2_counts$
declare
  v_result record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='media_items'
      and column_name='row_pk'
  ) then
    execute $sql$
      select count(*) filter (where row_pk is null) as null_physical_keys,
        count(*) filter (where revision is null or revision<1)
          as invalid_revisions,
        count(*) filter (where deleted_at is not null) as tombstones,
        count(*) filter (
          where identity_status='resolved'
            and (
              canonical_version<>2 or canonical_key is null
              or canonical_source is null or canonical_namespace is null
              or canonical_stable_id is null
            )
        ) as invalid_resolved_identities
      from public.media_items
    $sql$ into v_result;
    raise notice 'D2C3_MEDIA_V2_COUNTS %',row_to_json(v_result);
  else
    raise notice 'D2C3_MEDIA_V2_COUNTS {"status":"not_applied"}';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='log_pk'
  ) then
    execute $sql$
      select count(*) filter (where log_pk is null) as null_physical_keys,
        count(*) filter (where revision is null or revision<1)
          as invalid_revisions,
        count(*) filter (where deleted_at is not null) as tombstones
      from public.progress_logs
    $sql$ into v_result;
    raise notice 'D2C3_PROGRESS_V2_COUNTS %',row_to_json(v_result);
  else
    raise notice 'D2C3_PROGRESS_V2_COUNTS {"status":"not_applied"}';
  end if;

  if to_regclass('public.cloud_media_sync_operations') is not null then
    execute 'select count(*) as ledger_rows from public.cloud_media_sync_operations'
      into v_result;
    raise notice 'D2C3_OPERATION_LEDGER_COUNTS %',row_to_json(v_result);
  else
    raise notice 'D2C3_OPERATION_LEDGER_COUNTS {"status":"not_applied"}';
  end if;
end;
$d2c3_optional_v2_counts$;

rollback;
