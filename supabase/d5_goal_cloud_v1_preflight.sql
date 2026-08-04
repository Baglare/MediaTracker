do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'goal_cloud_v1_prerequisite_auth_users_missing';
  end if;
  if to_regprocedure('public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)') is null then
    raise exception 'goal_cloud_v1_prerequisite_d2c1_missing';
  end if;
  if to_regclass('public.goals') is not null
    or to_regclass('public.goal_sync_operations') is not null
    or to_regprocedure('public.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean)') is not null
    or to_regprocedure('public.cloud_goal_v1_definition_is_valid(text,jsonb)') is not null
    or to_regprocedure('public.cloud_goal_v1_request_hash(text,bigint,jsonb,boolean)') is not null then
    raise exception 'goal_cloud_v1_partial_or_existing_installation';
  end if;
end;
$$;

select 'ready' as goal_v1_preflight,
       to_regprocedure('public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)') as d2c1_progress_rpc;
