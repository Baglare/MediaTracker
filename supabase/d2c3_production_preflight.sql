-- D2C.3A production preflight.
-- Read-only: catalog/schema/data aggregate checks only. No user content is returned.
begin transaction read only;

do $d2c3_core_guard$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.media_items') is null
    or to_regclass('public.progress_logs') is null then
    raise exception 'd2c3_core_tables_missing';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'd2c3_migration_history_missing';
  end if;
end;
$d2c3_core_guard$;

-- Repository migration chain drift. Missing history is evidence only; do not repair.
with expected(version) as (
  values
    ('20260721100000'),('20260721110000'),('20260721120000'),
    ('20260721121000'),('20260721130000'),('20260721133000'),
    ('20260721134500'),('20260721140000'),('20260721143000'),
    ('20260722110000'),('20260722120000'),('20260722130000'),
    ('20260727120000'),('20260728120000')
),
actual as (
  select version::text
  from supabase_migrations.schema_migrations
)
select
  expected.version,
  case when actual.version is null then 'missing_from_history' else 'recorded' end
    as history_status
from expected
left join actual using (version)
union all
select actual.version, 'not_in_repository_chain'
from actual
left join expected using (version)
where expected.version is null
order by version;

-- Phase classifier: absent/present state of additive and enforcement objects.
select
  case
    when media_pk.definition='PRIMARY KEY (row_pk)'
      and progress_pk.definition='PRIMARY KEY (log_pk)'
      then 'd2c1_enforced'
    when to_regclass('public.cloud_media_sync_operations') is not null
      and media_row_pk.column_name is not null
      and progress_log_pk.column_name is not null
      then 'd2b1_additive'
    when media_pk.definition='PRIMARY KEY (id)'
      and progress_pk.definition='PRIMARY KEY (id)'
      then 'legacy_core'
    else 'unknown_or_drifted'
  end as detected_cloud_media_phase,
  media_pk.definition as media_primary_key,
  progress_pk.definition as progress_primary_key,
  (to_regclass('public.cloud_media_sync_operations') is not null)
    as operation_ledger_exists,
  (to_regprocedure(
    'public.apply_media_item_sync_operation(text,text,text,bigint,jsonb)'
  ) is not null) as media_v2_rpc_exists,
  (to_regprocedure(
    'public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)'
  ) is not null) as progress_v2_rpc_exists
from (
  select pg_get_constraintdef(oid) as definition
  from pg_constraint
  where conrelid='public.media_items'::regclass and contype='p'
) media_pk
cross join (
  select pg_get_constraintdef(oid) as definition
  from pg_constraint
  where conrelid='public.progress_logs'::regclass and contype='p'
) progress_pk
left join information_schema.columns media_row_pk
  on media_row_pk.table_schema='public'
  and media_row_pk.table_name='media_items'
  and media_row_pk.column_name='row_pk'
left join information_schema.columns progress_log_pk
  on progress_log_pk.table_schema='public'
  and progress_log_pk.table_name='progress_logs'
  and progress_log_pk.column_name='log_pk';

-- D2B.1/D2C.1 hard blockers. Counts only; no record IDs or user IDs.
select 'duplicate_media_owner_record' as blocker, count(*) as group_count
from (
  select user_id,id from public.media_items
  group by user_id,id having count(*)>1
) duplicate_media
union all
select 'duplicate_progress_owner_record', count(*)
from (
  select user_id,id from public.progress_logs
  group by user_id,id having count(*)>1
) duplicate_progress
union all
select 'cross_owner_shared_media_record_id', count(*)
from (
  select id from public.media_items
  group by id having count(distinct user_id)>1
) shared_media
union all
select 'cross_owner_shared_progress_record_id', count(*)
from (
  select id from public.progress_logs
  group by id having count(distinct user_id)>1
) shared_progress
union all
select 'orphan_or_cross_owner_progress', count(*)
from public.progress_logs p
left join public.media_items m
  on m.user_id=p.user_id and m.id=p.media_id
where p.media_id is not null and m.id is null
union all
select 'invalid_media_progress_values', count(*)
from public.media_items
where current_progress<0 or total_progress<0
  or user_rating is not null and user_rating not between 0 and 10;

-- RLS and legacy direct DML exposure. D2C.1 requires direct DML to be absent.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('profiles','media_items','progress_logs',
    'cloud_media_sync_operations')
order by c.relname;

select
  grantee,
  table_name,
  privilege_type,
  case
    when table_name in ('media_items','progress_logs')
      and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE')
      then 'legacy_direct_dml_present'
    else 'review'
  end as cutover_status
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('media_items','progress_logs',
    'cloud_media_sync_operations')
  and grantee in ('anon','authenticated')
order by table_name,grantee,privilege_type;

-- Canonical backfill suitability without exposing titles, external IDs or notes.
select
  count(*) as media_rows,
  count(*) filter (
    where nullif(trim(external_source),'') is not null
      and nullif(trim(external_id),'') is not null
  ) as deterministic_external_candidates,
  count(*) filter (
    where nullif(trim(external_source),'') is null
      or nullif(trim(external_id),'') is null
  ) as manual_or_unresolved_candidates,
  count(*) filter (where nullif(trim(title),'') is null) as invalid_title_rows,
  count(*) filter (
    where external_source='tmdb' and type not in ('movie','tv')
  ) as ambiguous_tmdb_namespace_rows,
  count(*) filter (
    where external_source='anilist' and type not in (
      'anime','manga','manhwa','manhua','light_novel'
    )
  ) as ambiguous_anilist_namespace_rows
from public.media_items;

-- Storage bucket existence is metadata-only and remains safe if storage schema
-- is unexpectedly absent.
do $d2c3_storage_bucket_check$
declare
  v_present boolean;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'D2C3_PROFILE_ASSETS_BUCKET {"status":"storage_catalog_missing"}';
  else
    execute
      'select exists (select 1 from storage.buckets where id=$1)'
      into v_present
      using 'profile-assets';
    raise notice 'D2C3_PROFILE_ASSETS_BUCKET {"status":"%"}',
      case when v_present then 'present' else 'missing' end;
  end if;
end;
$d2c3_storage_bucket_check$;

rollback;
