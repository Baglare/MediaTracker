-- D8-4A: public viewers may sign only the owner's currently published avatar/banner path.
create or replace function public.social_profile_asset_visible(
  p_asset_name text,
  p_owner text,
  p_viewer uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_mode text;
  v_avatar_path text;
  v_banner_path text;
begin
  if p_viewer::text=p_owner then return true; end if;
  select visibility_mode,avatar_path,banner_path
    into v_mode,v_avatar_path,v_banner_path
  from public.profiles
  where id::text=p_owner and deleted_at is null;
  if v_mode is null or v_mode not in ('public','protected') then return false; end if;
  if p_asset_name is distinct from v_avatar_path and p_asset_name is distinct from v_banner_path then return false; end if;
  if p_viewer is not null and exists(
    select 1 from public.profile_blocks where
      (blocker_id::text=p_owner and blocked_id=p_viewer) or
      (blocker_id=p_viewer and blocked_id::text=p_owner)
  ) then return false; end if;
  return true;
end;
$$;

revoke all on function public.social_profile_asset_visible(text,text,uuid) from public;
grant execute on function public.social_profile_asset_visible(text,text,uuid) to anon,authenticated;

drop policy if exists profile_assets_select_visible on storage.objects;
create policy profile_assets_select_visible on storage.objects for select to anon,authenticated using (
  bucket_id='profile-assets' and (
    (storage.foldername(name))[1]=auth.uid()::text or
    public.social_profile_asset_visible(name,(storage.foldername(name))[1],auth.uid())
  )
);
