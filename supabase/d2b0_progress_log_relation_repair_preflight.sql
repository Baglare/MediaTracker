begin transaction read only;

do $d2b0_read_only_preflight$
declare
  v_media_id_nullable text;
begin
  if to_regclass('public.media_items') is null
    or to_regclass('public.progress_logs') is null then
    raise exception 'd2b0_required_tables_missing';
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
    where table_schema='public' and table_name='progress_logs'
      and column_name='id' and data_type='text' and is_nullable='NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='user_id' and data_type='uuid' and is_nullable='NO'
  ) then
    raise exception 'd2b0_owner_record_shape_drift';
  end if;

  select is_nullable
  into v_media_id_nullable
  from information_schema.columns
  where table_schema='public' and table_name='progress_logs'
    and column_name='media_id' and data_type='text';
  if v_media_id_nullable is distinct from 'YES' then
    raise exception 'd2b0_progress_media_id_shape_drift';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name in ('detached_media_id','detached_at')
  ) then
    raise exception 'd2b0_target_columns_already_exist';
  end if;
end;
$d2b0_read_only_preflight$;

select
  count(*) as progress_log_count,
  count(*) filter (where p.media_id is not null) as linked_log_count,
  count(*) filter (
    where p.media_id is not null
      and not exists (
        select 1
        from public.media_items m
        where m.user_id=p.user_id and m.id=p.media_id
      )
  ) as relation_repair_candidate_count
from public.progress_logs p;

rollback;
