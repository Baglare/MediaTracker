select case when to_regclass('public.goals') is null then 'ready' else 'already_present' end as goal_v1_preflight;
select to_regprocedure('public.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean)') as existing_goal_rpc;
select count(*) as d2c1_progress_rpc_count
from pg_proc where oid=to_regprocedure('public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)');
