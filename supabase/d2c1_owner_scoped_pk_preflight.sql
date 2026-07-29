begin transaction read only;

do $d2c1_read_only_preflight$
declare
  v_definition text;
begin
  if to_regclass('public.media_items') is null
    or to_regclass('public.progress_logs') is null
    or to_regclass('public.cloud_media_sync_operations') is null then
    raise exception 'd2c1_required_tables_missing';
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
$d2c1_read_only_preflight$;

select
  'media_items' as domain,
  count(*) as row_count,
  count(distinct row_pk) as distinct_physical_keys,
  count(distinct (user_id,id)) as distinct_owner_record_ids,
  count(*) filter (where deleted_at is not null) as tombstones,
  min(revision) as minimum_revision,
  sum(hashtextextended(user_id::text || ':' || id,0)::numeric)
    as owner_record_fingerprint
from public.media_items
union all
select
  'progress_logs',
  count(*),
  count(distinct log_pk),
  count(distinct (user_id,id)),
  count(*) filter (where deleted_at is not null),
  min(revision),
  sum(hashtextextended(user_id::text || ':' || id,0)::numeric)
from public.progress_logs;

select
  count(*) filter (where p.media_id is not null and m.row_pk is null)
    as orphan_or_cross_owner_progress_count
from public.progress_logs p
left join public.media_items m
  on m.user_id=p.user_id and m.id=p.media_id;

select
  schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'media_items','progress_logs','cloud_media_sync_operations'
  )
order by tablename,policyname;

rollback;
