begin transaction read only;

do $d2c1_read_only_verification$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.media_items'::regclass
    and conname='media_items_pkey' and contype='p';
  if v_definition<>'PRIMARY KEY (row_pk)' then
    raise exception 'd2c1_media_pk_not_enforced: %',
      coalesce(v_definition,'missing');
  end if;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and conname='progress_logs_pkey' and contype='p';
  if v_definition<>'PRIMARY KEY (log_pk)' then
    raise exception 'd2c1_progress_pk_not_enforced: %',
      coalesce(v_definition,'missing');
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
    raise exception 'd2c1_owner_record_unique_missing';
  end if;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass
    and conname='progress_logs_owner_media_v2_fkey'
    and contype='f' and convalidated;
  if v_definition is null
    or v_definition not like
      'FOREIGN KEY (user_id, media_id) REFERENCES media_items(user_id, id)%' then
    raise exception 'd2c1_owner_progress_fk_missing: %',
      coalesce(v_definition,'missing');
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid='public.progress_logs'::regclass
      and conname='progress_logs_media_id_fkey'
  ) then
    raise exception 'd2c1_global_progress_fk_still_present';
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

  if exists (
    select 1 from public.media_items
    group by user_id,id having count(*)>1
  ) or exists (
    select 1 from public.progress_logs
    group by user_id,id having count(*)>1
  ) then
    raise exception 'd2c1_owner_record_duplicate_detected';
  end if;

  if exists (
    select 1
    from public.progress_logs p
    left join public.media_items m
      on m.user_id=p.user_id and m.id=p.media_id
    where p.media_id is not null and m.row_pk is null
  ) then
    raise exception 'd2c1_orphan_or_cross_owner_progress_detected';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.media_items'::regclass
      and c.relname='media_items_owner_canonical_v2_idx'
      and not i.indisunique
  ) then
    raise exception 'd2c1_canonical_identity_must_remain_non_unique';
  end if;

  if to_regclass('public.cloud_media_sync_operations') is null
    or to_regprocedure(
      'public.apply_media_item_sync_operation(text,text,text,bigint,jsonb)'
    ) is null
    or to_regprocedure(
      'public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)'
    ) is null then
    raise exception 'd2c1_cas_or_idempotency_objects_missing';
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
    raise exception 'd2c1_owner_rls_policy_missing';
  end if;

  if has_table_privilege('authenticated','public.media_items','INSERT')
    or has_table_privilege('authenticated','public.media_items','UPDATE')
    or has_table_privilege('authenticated','public.media_items','DELETE')
    or has_table_privilege('authenticated','public.progress_logs','INSERT')
    or has_table_privilege('authenticated','public.progress_logs','UPDATE')
    or has_table_privilege('authenticated','public.progress_logs','DELETE')
  then
    raise exception 'd2c1_legacy_direct_mutation_privilege_present';
  end if;
end;
$d2c1_read_only_verification$;

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
  conrelid::regclass::text as table_name,
  conname,
  contype,
  convalidated,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.media_items'::regclass,
  'public.progress_logs'::regclass,
  'public.cloud_media_sync_operations'::regclass
)
order by table_name,conname;

select
  schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'media_items','progress_logs','cloud_media_sync_operations'
  )
order by tablename,policyname;

rollback;
