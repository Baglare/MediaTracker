begin transaction read only;

do $d2b1_read_only_verification$
declare
  v_definition text;
  v_policy_count integer;
begin
  if to_regclass('public.cloud_media_sync_operations') is null then
    raise exception 'd2b1_operation_ledger_missing';
  end if;

  if exists (
    select 1
    from public.media_items
    where row_pk is null or revision<1
  ) or exists (
    select 1
    from public.progress_logs
    where log_pk is null or revision<1
  ) then
    raise exception 'd2b1_backfill_incomplete';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.media_items'::regclass
      and conname='media_items_owner_record_v2_key'
      and contype='u'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid='public.progress_logs'::regclass
      and conname='progress_logs_owner_record_v2_key'
      and contype='u'
  ) then
    raise exception 'd2b1_owner_record_unique_missing';
  end if;

  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and conname='progress_logs_owner_media_v2_fkey'
    and contype='f'
    and convalidated;
  if v_definition is null
    or v_definition not like
      'FOREIGN KEY (user_id, media_id) REFERENCES media_items(user_id, id)%' then
    raise exception 'd2b1_owner_media_fk_missing_or_unvalidated';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.media_items'::regclass
      and c.relname='media_items_owner_canonical_v2_idx'
      and not i.indisunique
  ) then
    raise exception 'd2b1_canonical_non_unique_index_missing';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.media_items'::regclass
      and c.relname='media_items_user_external_unique'
      and i.indisunique
  ) then
    raise exception 'd2b1_legacy_external_unique_not_preserved';
  end if;

  if to_regprocedure(
    'public.apply_media_item_sync_operation(text,text,text,bigint,jsonb)'
  ) is null or to_regprocedure(
    'public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)'
  ) is null then
    raise exception 'd2b1_sync_rpc_missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.media_items'::regclass
      and tgname='media_items_v2_revision_guard'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.progress_logs'::regclass
      and tgname='progress_logs_v2_revision_guard'
      and not tgisinternal
  ) then
    raise exception 'd2b1_revision_guard_missing';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public'
    and (
      (tablename='media_items'
        and policyname='media_items_v2_owner_guard')
      or
      (tablename='progress_logs'
        and policyname='progress_logs_v2_owner_guard')
      or
      (tablename='cloud_media_sync_operations'
        and policyname in (
          'cloud_media_sync_operations_select_own',
          'cloud_media_sync_operations_owner_guard'
        ))
    );
  if v_policy_count<>4 then
    raise exception 'd2b1_owner_policy_package_incomplete';
  end if;

  if exists (
    select canonical_key
    from public.media_items
    where canonical_key is not null
    group by user_id,canonical_key
    having count(*)>1
  ) then
    null; -- Exact duplicates are allowed and intentionally remain non-unique.
  end if;
end;
$d2b1_read_only_verification$;

select
  'media_items' as domain,
  count(*) as row_count,
  count(distinct id) as distinct_record_ids,
  count(distinct (user_id,id)) as distinct_owner_record_ids,
  count(*) filter (where canonical_key is not null) as resolved_identity_rows,
  count(*) filter (where deleted_at is not null) as tombstone_rows,
  min(revision) as minimum_revision,
  sum(hashtextextended(user_id::text || ':' || id,0)::numeric)
    as owner_record_fingerprint
from public.media_items
union all
select
  'progress_logs',
  count(*),
  count(distinct id),
  count(distinct (user_id,id)),
  0,
  count(*) filter (where deleted_at is not null),
  min(revision),
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
left join public.media_items m
  on m.user_id=p.user_id and m.id=p.media_id;

select
  indexname,
  indexdef
from pg_indexes
where schemaname='public'
  and tablename in (
    'media_items','progress_logs','cloud_media_sync_operations'
  )
order by tablename,indexname;

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
  and tablename in (
    'media_items','progress_logs','cloud_media_sync_operations'
  )
order by tablename,policyname;

rollback;
