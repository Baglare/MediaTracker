-- Defense-in-depth replacement for already-deployed Social Phase 1 RPC helpers.
-- Protected profiles raise the effective minimum module visibility to followers
-- without mutating profile_modules.visibility.

create or replace function public.social_can_view_module(
  p_owner uuid,
  p_visibility text,
  p_viewer uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_visibility text;
begin
  if p_viewer = p_owner then
    return true;
  end if;

  if exists (
    select 1
    from public.profile_blocks
    where (blocker_id = p_owner and blocked_id = p_viewer)
       or (blocker_id = p_viewer and blocked_id = p_owner)
  ) then
    return false;
  end if;

  select visibility_mode
  into v_profile_visibility
  from public.profiles
  where id = p_owner and deleted_at is null;

  if v_profile_visibility is null or v_profile_visibility = 'personal' then
    return false;
  end if;

  if v_profile_visibility = 'public' and p_visibility = 'public' then
    return true;
  end if;

  if p_viewer is null or p_visibility = 'self' then
    return false;
  end if;

  if not exists (
    select 1
    from public.profile_follows
    where follower_id = p_viewer
      and following_id = p_owner
      and status = 'accepted'
  ) then
    return false;
  end if;

  if p_visibility in ('public', 'followers') then
    return true;
  end if;

  return p_visibility = 'mutual' and exists (
    select 1
    from public.profile_follows
    where follower_id = p_owner
      and following_id = p_viewer
      and status = 'accepted'
  );
end;
$$;

revoke all on function public.social_can_view_module(uuid, text, uuid) from public;
