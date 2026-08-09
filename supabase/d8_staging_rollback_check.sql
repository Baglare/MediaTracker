-- Read-only D8 rollback/fail-forward inventory. Run only after the staging target guard.
begin transaction read only;

select
  to_regclass('public.media_items') is not null as media_items_exists,
  to_regclass('public.progress_logs') is not null as progress_logs_exists,
  to_regclass('public.goals') is not null as goals_exists,
  to_regclass('public.goal_sync_operations') is not null as goal_ledger_exists;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  pg_get_constraintdef(k.oid) as primary_key
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_constraint k on k.conrelid = c.oid and k.contype = 'p'
where n.nspname = 'public'
  and c.relname in ('media_items', 'progress_logs', 'goals', 'goal_sync_operations')
order by c.relname;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'apply_media_item_sync_operation',
    'apply_progress_log_sync_operation',
    'apply_goal_sync_operation',
    'get_public_social_profile',
    'save_social_profile'
  )
order by routine_name;

rollback;
