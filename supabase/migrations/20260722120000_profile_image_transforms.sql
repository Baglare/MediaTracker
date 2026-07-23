-- Non-destructive profile image transforms (kept in sync with supabase/schema.sql)
alter table public.profiles add column if not exists banner_focal_x numeric(5,2) not null default 50;
alter table public.profiles add column if not exists banner_focal_y numeric(5,2) not null default 50;
alter table public.profiles add column if not exists banner_zoom numeric(4,2) not null default 1;
alter table public.profiles add column if not exists avatar_focal_x numeric(5,2) not null default 50;
alter table public.profiles add column if not exists avatar_focal_y numeric(5,2) not null default 50;
alter table public.profiles add column if not exists avatar_zoom numeric(4,2) not null default 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_banner_transform_check') then
    alter table public.profiles add constraint profiles_banner_transform_check check (
      banner_focal_x between 0 and 100 and banner_focal_y between 0 and 100 and banner_zoom between 1 and 3
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_avatar_transform_check') then
    alter table public.profiles add constraint profiles_avatar_transform_check check (
      avatar_focal_x between 0 and 100 and avatar_focal_y between 0 and 100 and avatar_zoom between 1 and 3
    );
  end if;
end $$;

drop function if exists public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text);

create or replace function public.social_save_unified_profile(
  p_username text,
  p_display_name text,
  p_tagline text,
  p_bio text,
  p_location text,
  p_language text,
  p_visibility_mode text,
  p_connection_color text,
  p_selected_title text,
  p_profile_palette_id text,
  p_banner_mode text,
  p_banner_position text,
  p_overlay_strength text,
  p_avatar_frame text,
  p_surface_style text,
  p_motif_intensity text,
  p_banner_focal_x numeric,
  p_banner_focal_y numeric,
  p_banner_zoom numeric,
  p_avatar_focal_x numeric,
  p_avatar_focal_y numeric,
  p_avatar_zoom numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid();
  v_username text:=lower(trim(p_username));
  v_current public.profiles%rowtype;
  v_reserved text[]:=array['admin','administrator','api','auth','login','logout','register','settings','profile','profiles','u','users','people','social','support','system','moderator','mod','media','mediatracker','null','undefined'];
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if length(v_username) not between 3 and 24 or v_username !~ '^[a-z0-9_]+$' or v_username ~ '^_|_$|__' or v_username=any(v_reserved) then raise exception 'invalid_username'; end if;
  if length(trim(coalesce(p_display_name,''))) not between 1 and 60 or length(coalesce(p_tagline,''))>120 or length(coalesce(p_bio,''))>500 or length(coalesce(p_location,''))>80 or length(coalesce(p_language,''))>12 or length(coalesce(p_selected_title,''))>60 then raise exception 'invalid_profile_text'; end if;
  if p_display_name ~ '[<>]' or coalesce(p_tagline,'') ~ '[<>]' or coalesce(p_bio,'') ~ '[<>]' or coalesce(p_location,'') ~ '[<>]' or coalesce(p_selected_title,'') ~ '[<>]' then raise exception 'html_not_allowed'; end if;
  if nullif(lower(trim(coalesce(p_language,''))),'') is not null and lower(trim(p_language)) not in ('tr','en','de','fr','es','it','pt','ja','ko','zh','other') then raise exception 'invalid_language'; end if;
  if p_visibility_mode not in ('public','protected','personal') then raise exception 'invalid_visibility'; end if;
  if p_connection_color not in ('neutral','violet','blue','cyan','emerald','amber','orange','red','rose','pink') then raise exception 'invalid_color'; end if;
  if p_profile_palette_id not in ('neutral','east','screen','arch','ocean') or p_banner_mode not in ('none','gradient','world','image') or p_banner_position not in ('top','center','bottom') or p_overlay_strength not in ('low','medium','high') or p_avatar_frame not in ('none','subtle','world','tier') or p_surface_style not in ('solid','soft_glass','textured') or p_motif_intensity not in ('none','subtle','full') then raise exception 'invalid_profile_presentation'; end if;
  if p_banner_focal_x not between 0 and 100 or p_banner_focal_y not between 0 and 100 or p_banner_zoom not between 1 and 3 or p_avatar_focal_x not between 0 and 100 or p_avatar_focal_y not between 0 and 100 or p_avatar_zoom not between 1 and 3 then raise exception 'invalid_image_transform'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_username,0));
  select * into v_current from public.profiles where id=v_user for update;
  if exists(select 1 from public.profiles where lower(username)=v_username and id<>v_user and deleted_at is null) then raise exception 'username_taken'; end if;
  if exists(select 1 from public.profile_username_history where lower(username)=v_username and user_id<>v_user and reserved_until>now()) then raise exception 'username_reserved'; end if;
  if v_current.id is not null and v_current.username is distinct from v_username then
    if v_current.username is not null and v_current.username_changed_at>now()-interval '30 days' then raise exception 'username_cooldown'; end if;
    if v_current.username is not null then
      insert into public.profile_username_history(user_id,username,claimed_at,released_at,reserved_until)
      values(v_user,v_current.username,coalesce(v_current.username_changed_at,v_current.created_at),now(),now()+interval '90 days');
    end if;
  end if;

  insert into public.profiles(
    id,username,display_name,tagline,bio,location,language,visibility_mode,connection_color,selected_title,
    profile_palette_id,banner_mode,banner_position,overlay_strength,avatar_frame,surface_style,motif_intensity,
    banner_focal_x,banner_focal_y,banner_zoom,avatar_focal_x,avatar_focal_y,avatar_zoom,username_changed_at
  ) values(
    v_user,v_username,trim(p_display_name),trim(coalesce(p_tagline,'')),coalesce(p_bio,''),
    nullif(trim(coalesce(p_location,'')),''),nullif(lower(trim(coalesce(p_language,''))),''),p_visibility_mode,p_connection_color,
    nullif(trim(coalesce(p_selected_title,'')),''),p_profile_palette_id,p_banner_mode,p_banner_position,p_overlay_strength,
    p_avatar_frame,p_surface_style,p_motif_intensity,p_banner_focal_x,p_banner_focal_y,p_banner_zoom,
    p_avatar_focal_x,p_avatar_focal_y,p_avatar_zoom,now()
  )
  on conflict(id) do update set
    username=excluded.username,display_name=excluded.display_name,tagline=excluded.tagline,bio=excluded.bio,
    location=excluded.location,language=excluded.language,visibility_mode=excluded.visibility_mode,
    connection_color=excluded.connection_color,selected_title=excluded.selected_title,
    profile_palette_id=excluded.profile_palette_id,banner_mode=excluded.banner_mode,banner_position=excluded.banner_position,
    overlay_strength=excluded.overlay_strength,avatar_frame=excluded.avatar_frame,surface_style=excluded.surface_style,
    motif_intensity=excluded.motif_intensity,banner_focal_x=excluded.banner_focal_x,banner_focal_y=excluded.banner_focal_y,
    banner_zoom=excluded.banner_zoom,avatar_focal_x=excluded.avatar_focal_x,avatar_focal_y=excluded.avatar_focal_y,
    avatar_zoom=excluded.avatar_zoom,
    username_changed_at=case when profiles.username is distinct from excluded.username then now() else profiles.username_changed_at end,
    deleted_at=null;

  if p_visibility_mode='personal' then delete from public.profile_follows where following_id=v_user and status='pending'; end if;
  insert into public.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order)
  values
    (v_user,'favorites',true,'public',0,0,8,2,0),(v_user,'current',true,'followers',8,0,4,2,1),
    (v_user,'stats',true,'public',0,2,6,2,2),(v_user,'progression',true,'public',6,2,6,2,3),
    (v_user,'badges',false,'public',0,4,4,2,4),(v_user,'follows',true,'public',4,4,4,2,5),
    (v_user,'shared_lists',false,'public',8,4,4,2,6),(v_user,'shared_notes',true,'self',0,6,12,2,7),
    (v_user,'activity',true,'followers',0,8,12,2,8)
  on conflict(user_id,module_key) do nothing;
  return jsonb_build_object('ok',true,'username',v_username);
end;
$$;

create or replace function public.get_unified_social_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_payload jsonb; v_owner uuid; v_presentation jsonb; v_tagline text;
begin
  v_payload:=public.get_social_profile(p_username);
  if v_payload->>'status'<>'available' then return v_payload; end if;
  v_owner:=nullif(v_payload#>>'{profile,id}','')::uuid;
  select p.tagline,jsonb_build_object(
    'version',1,'paletteId',p.profile_palette_id,'bannerMode',p.banner_mode,'bannerPosition',p.banner_position,
    'overlayStrength',p.overlay_strength,'avatarFrame',p.avatar_frame,'surfaceStyle',p.surface_style,'motifIntensity',p.motif_intensity,
    'bannerTransform',jsonb_build_object('focalX',p.banner_focal_x,'focalY',p.banner_focal_y,'zoom',p.banner_zoom),
    'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)
  ) into v_tagline,v_presentation from public.profiles p where p.id=v_owner;
  return jsonb_set(jsonb_set(v_payload,'{profile,tagline}',to_jsonb(coalesce(v_tagline,'')),true),'{profile,presentation}',coalesce(v_presentation,'{}'::jsonb),true);
end;
$$;

create or replace function public.search_social_profiles(p_query text, p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_viewer uuid:=auth.uid(); v_viewer_color text:='neutral'; v_query text:=lower(trim(p_query)); v_pattern text; v_result jsonb;
begin
  if length(v_query)<2 or length(v_query)>60 then raise exception 'invalid_search_query'; end if;
  v_pattern:=replace(replace(replace(v_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  if v_viewer is not null then select coalesce(connection_color,'neutral') into v_viewer_color from public.profiles where id=v_viewer; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'bio',left(p.bio,160),
      'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'avatarPath',p.avatar_path,
      'presentation',jsonb_build_object('version',1,'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)),
      'anonymous',v_viewer is null,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
      'viewerFollowsOwner',(select f.status from public.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
      'ownerFollowsViewer',(select f.status from public.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
    ) row_data from public.profiles p
    where p.deleted_at is null and p.visibility_mode in ('public','protected') and
      (lower(p.username) like '%'||v_pattern||'%' escape E'\\' or lower(coalesce(p.display_name,'')) like '%'||v_pattern||'%' escape E'\\') and
      (v_viewer is null or not public.social_is_blocked(v_viewer,p.id))
    order by case when lower(p.username)=v_query then 0 else 1 end,lower(p.username)
    offset greatest(0,p_offset) limit least(20,greatest(1,p_limit))
  ) q;
  return v_result;
end;
$$;

create or replace function public.get_social_person_summary(p_target uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_viewer uuid:=auth.uid(); v_viewer_color text:='neutral'; v_result jsonb;
begin
  if v_viewer is null then raise exception 'authentication_required'; end if;
  select coalesce(connection_color,'neutral') into v_viewer_color from public.profiles where id=v_viewer;
  select jsonb_build_object(
    'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'bio',left(p.bio,160),
    'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'avatarPath',p.avatar_path,
    'presentation',jsonb_build_object('version',1,'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)),
    'anonymous',false,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
    'viewerFollowsOwner',(select f.status from public.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
    'ownerFollowsViewer',(select f.status from public.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
  ) into v_result from public.profiles p
  where p.id=p_target and p.deleted_at is null and p.visibility_mode in ('public','protected') and not public.social_is_blocked(v_viewer,p.id);
  return v_result;
end;
$$;

revoke all on function public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric) from public;
grant execute on function public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;
