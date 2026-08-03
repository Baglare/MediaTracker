select to_regclass('public.goals') as goals_table,
       to_regclass('public.goal_sync_operations') as goal_operations_table,
       to_regprocedure('public.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean)') as goal_rpc;
select relname,relrowsecurity from pg_class where oid in (
  'public.goals'::regclass,'public.goal_sync_operations'::regclass
);
select grantee,table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('goals','goal_sync_operations')
order by table_name,grantee,privilege_type;
