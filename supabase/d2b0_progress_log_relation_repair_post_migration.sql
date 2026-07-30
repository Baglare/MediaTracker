begin transaction read only;

do $d2b0_read_only_post_verification$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='detached_media_id'
      and data_type='text' and is_nullable='YES'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='progress_logs'
      and column_name='detached_at'
      and data_type='timestamp with time zone' and is_nullable='YES'
  ) then
    raise exception 'd2b0_detached_columns_shape_drift';
  end if;

  if exists (
    select 1
    from public.progress_logs p
    where p.media_id is not null
      and not exists (
        select 1
        from public.media_items m
        where m.user_id=p.user_id and m.id=p.media_id
      )
  ) then
    raise exception 'd2b0_invalid_owner_relation_remaining';
  end if;

  if exists (
    select 1
    from public.progress_logs
    where (detached_media_id is null)<>(detached_at is null)
  ) then
    raise exception 'd2b0_detached_history_incomplete';
  end if;
end;
$d2b0_read_only_post_verification$;

select
  count(*) as progress_log_count,
  count(*) filter (where media_id is not null) as linked_log_count,
  count(*) filter (
    where media_id is null
      and detached_media_id is not null
      and detached_at is not null
  ) as detached_log_count
from public.progress_logs;

rollback;
