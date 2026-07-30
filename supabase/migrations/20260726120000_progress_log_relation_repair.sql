begin;

do $d2b0_preflight$
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
$d2b0_preflight$;

lock table public.progress_logs, public.media_items
  in access exclusive mode;

alter table public.progress_logs
  add column detached_media_id text,
  add column detached_at timestamptz;

do $d2b0_repair$
declare
  v_before_total bigint;
  v_before_invalid bigint;
  v_updated bigint;
  v_after_total bigint;
  v_after_invalid bigint;
  v_detached_count bigint;
begin
  select count(*) into v_before_total
  from public.progress_logs;

  select count(*) into v_before_invalid
  from public.progress_logs p
  where p.media_id is not null
    and p.detached_media_id is null
    and p.detached_at is null
    and not exists (
      select 1
      from public.media_items m
      where m.user_id=p.user_id and m.id=p.media_id
    );

  update public.progress_logs p
  set
    detached_media_id=p.media_id,
    detached_at=statement_timestamp(),
    media_id=null
  where p.media_id is not null
    and p.detached_media_id is null
    and p.detached_at is null
    and not exists (
      select 1
      from public.media_items m
      where m.user_id=p.user_id and m.id=p.media_id
    );
  get diagnostics v_updated=row_count;

  if v_updated<>v_before_invalid then
    raise exception 'd2b0_repair_count_mismatch: expected %, updated %',
      v_before_invalid,v_updated;
  end if;

  select count(*) into v_after_total
  from public.progress_logs;
  if v_after_total<>v_before_total then
    raise exception 'd2b0_progress_log_count_changed: before %, after %',
      v_before_total,v_after_total;
  end if;

  select count(*) into v_after_invalid
  from public.progress_logs p
  where p.media_id is not null
    and not exists (
      select 1
      from public.media_items m
      where m.user_id=p.user_id and m.id=p.media_id
    );
  if v_after_invalid<>0 then
    raise exception 'd2b0_invalid_owner_relation_remaining: %',
      v_after_invalid;
  end if;

  select count(*) into v_detached_count
  from public.progress_logs
  where media_id is null
    and detached_media_id is not null
    and detached_at is not null;
  if v_detached_count<>v_before_invalid then
    raise exception 'd2b0_detached_history_count_mismatch: expected %, got %',
      v_before_invalid,v_detached_count;
  end if;
end;
$d2b0_repair$;

commit;
