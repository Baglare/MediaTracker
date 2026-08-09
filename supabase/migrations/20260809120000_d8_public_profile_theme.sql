-- D8-2 additive public profile theme contract. Apply only through the release DB gate.
alter table public.profiles add column if not exists profile_theme_visibility text not null default 'hidden';
alter table public.profiles add column if not exists public_theme_preset text;
alter table public.profiles add column if not exists public_theme_snapshot jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_theme_visibility_check') then
    alter table public.profiles add constraint profiles_theme_visibility_check
      check (profile_theme_visibility in ('hidden','preset_only','current_theme'));
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_public_theme_preset_check') then
    alter table public.profiles add constraint profiles_public_theme_preset_check
      check (public_theme_preset is null or public_theme_preset in ('obsidian','porcelain','ocean','dusty_rose','forest','lavender','polar','sepia'));
  end if;
end $$;

create or replace function public.d8_theme_hex_luminance(p_hex text)
returns double precision language plpgsql immutable strict set search_path=public,pg_temp as $$
declare r double precision; g double precision; b double precision;
begin
  if p_hex !~ '^#[0-9A-Fa-f]{6}$' then return null; end if;
  r:=(('x'||substr(p_hex,2,2))::bit(8)::integer)/255.0;
  g:=(('x'||substr(p_hex,4,2))::bit(8)::integer)/255.0;
  b:=(('x'||substr(p_hex,6,2))::bit(8)::integer)/255.0;
  r:=case when r<=0.04045 then r/12.92 else power((r+0.055)/1.055,2.4) end;
  g:=case when g<=0.04045 then g/12.92 else power((g+0.055)/1.055,2.4) end;
  b:=case when b<=0.04045 then b/12.92 else power((b+0.055)/1.055,2.4) end;
  return 0.2126*r+0.7152*g+0.0722*b;
end;
$$;

create or replace function public.d8_theme_contrast(p_a text,p_b text)
returns double precision language sql immutable strict set search_path=public,pg_temp as $$
  select (greatest(public.d8_theme_hex_luminance(p_a),public.d8_theme_hex_luminance(p_b))+0.05)
       / (least(public.d8_theme_hex_luminance(p_a),public.d8_theme_hex_luminance(p_b))+0.05)
$$;

create or replace function public.d8_public_theme_snapshot_valid(p_snapshot jsonb)
returns boolean language plpgsql immutable strict set search_path=public,pg_temp as $$
declare
  v_allowed text[]:=array['accent','accentContrast','accentSoft','accentStrong','background','border','borderStrong','cardBackground','elevated','focus','hover','panelBackground','selectedBackground','selectedBorder','selectedText','surface1','surface2','surface3','textMuted','textPrimary','textSecondary'];
  v_tokens jsonb;
begin
  if jsonb_typeof(p_snapshot)<>'object'
    or not (p_snapshot ?& array['version','source','colorScheme','tokens','revision'])
    or p_snapshot - array['version','source','colorScheme','tokens','revision','updatedAt'] <> '{}'::jsonb
    or p_snapshot->>'version'<>'1'
    or p_snapshot->>'source' not in ('preset','custom')
    or p_snapshot->>'colorScheme' not in ('light','dark')
    or length(coalesce(p_snapshot->>'revision','')) not between 1 and 160
    or (p_snapshot ? 'updatedAt' and coalesce(p_snapshot->>'updatedAt','') !~ '^\d{4}-\d{2}-\d{2}T')
    or jsonb_typeof(p_snapshot->'tokens')<>'object'
  then return false; end if;
  v_tokens:=p_snapshot->'tokens';
  if (select count(*)<>cardinality(v_allowed) or not bool_and(key=any(v_allowed)) from jsonb_object_keys(v_tokens) key)
    or exists(select 1 from jsonb_each_text(v_tokens) where value !~ '^#[0-9A-Fa-f]{6}$')
  then return false; end if;
  return public.d8_theme_contrast(v_tokens->>'textPrimary',v_tokens->>'background')>=4.5
    and public.d8_theme_contrast(v_tokens->>'textPrimary',v_tokens->>'surface1')>=4.5
    and public.d8_theme_contrast(v_tokens->>'textSecondary',v_tokens->>'surface1')>=4.5
    and public.d8_theme_contrast(v_tokens->>'textMuted',v_tokens->>'surface1')>=3
    and public.d8_theme_contrast(v_tokens->>'focus',v_tokens->>'surface1')>=3
    and public.d8_theme_contrast(v_tokens->>'accentContrast',v_tokens->>'accent')>=4.5;
end;
$$;

revoke all on function public.d8_theme_hex_luminance(text) from public;
revoke all on function public.d8_theme_contrast(text,text) from public;
revoke all on function public.d8_public_theme_snapshot_valid(jsonb) from public;

create or replace function public.social_save_unified_profile(
  p_username text, p_display_name text, p_tagline text, p_bio text, p_location text, p_language text,
  p_visibility_mode text, p_connection_color text, p_selected_title text,
  p_profile_palette_id text, p_banner_mode text, p_banner_position text, p_overlay_strength text,
  p_avatar_frame text, p_surface_style text, p_motif_intensity text,
  p_banner_focal_x numeric, p_banner_focal_y numeric, p_banner_zoom numeric,
  p_avatar_focal_x numeric, p_avatar_focal_y numeric, p_avatar_zoom numeric,
  p_theme_visibility text, p_public_theme_preset text, p_public_theme_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_result jsonb; v_preset text:=nullif(trim(coalesce(p_public_theme_preset,'')),'');
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_theme_visibility not in ('hidden','preset_only','current_theme') then raise exception 'invalid_theme_visibility'; end if;
  if v_preset is not null and v_preset not in ('obsidian','porcelain','ocean','dusty_rose','forest','lavender','polar','sepia') then raise exception 'invalid_public_theme_preset'; end if;
  if p_theme_visibility='hidden' and (v_preset is not null or p_public_theme_snapshot is not null) then raise exception 'hidden_theme_payload_not_allowed'; end if;
  if p_theme_visibility='preset_only' and (v_preset is null or p_public_theme_snapshot is null) then raise exception 'preset_theme_snapshot_required'; end if;
  if p_theme_visibility='current_theme' and p_public_theme_snapshot is null then raise exception 'current_theme_snapshot_required'; end if;
  if p_public_theme_snapshot is not null and not public.d8_public_theme_snapshot_valid(p_public_theme_snapshot) then raise exception 'invalid_public_theme_snapshot'; end if;
  if p_theme_visibility='preset_only' and (p_public_theme_snapshot->>'source'<>'preset' or p_public_theme_snapshot->>'revision'<>format('preset:%s:1',v_preset)) then raise exception 'preset_theme_snapshot_mismatch'; end if;

  v_result:=public.social_save_unified_profile(
    p_username,p_display_name,p_tagline,p_bio,p_location,p_language,p_visibility_mode,p_connection_color,p_selected_title,
    p_profile_palette_id,p_banner_mode,p_banner_position,p_overlay_strength,p_avatar_frame,p_surface_style,p_motif_intensity,
    p_banner_focal_x,p_banner_focal_y,p_banner_zoom,p_avatar_focal_x,p_avatar_focal_y,p_avatar_zoom
  );
  update public.profiles set
    profile_theme_visibility=p_theme_visibility,
    public_theme_preset=case when p_theme_visibility='preset_only' then v_preset else null end,
    public_theme_snapshot=case when p_theme_visibility='hidden' then null else p_public_theme_snapshot end
  where id=v_user;
  return v_result;
end;
$$;

create or replace function public.get_unified_social_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_payload jsonb; v_owner uuid; v_presentation jsonb; v_tagline text; v_theme jsonb;
begin
  v_payload:=public.get_social_profile(p_username);
  if v_payload->>'status'<>'available' then return v_payload; end if;
  v_owner:=nullif(v_payload#>>'{profile,id}','')::uuid;
  select p.tagline,jsonb_build_object(
    'version',1,'paletteId',p.profile_palette_id,'bannerMode',p.banner_mode,'bannerPosition',p.banner_position,
    'overlayStrength',p.overlay_strength,'avatarFrame',p.avatar_frame,'surfaceStyle',p.surface_style,'motifIntensity',p.motif_intensity,
    'bannerTransform',jsonb_build_object('focalX',p.banner_focal_x,'focalY',p.banner_focal_y,'zoom',p.banner_zoom),
    'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)
  ),case when p.profile_theme_visibility='hidden' then null else p.public_theme_snapshot end
  into v_tagline,v_presentation,v_theme from public.profiles p where p.id=v_owner;
  v_payload:=jsonb_set(jsonb_set(v_payload,'{profile,tagline}',to_jsonb(coalesce(v_tagline,'')),true),'{profile,presentation}',coalesce(v_presentation,'{}'::jsonb),true);
  if v_theme is not null then v_payload:=jsonb_set(v_payload,'{profile,themeSnapshot}',v_theme,true); end if;
  return v_payload;
end;
$$;

revoke all on function public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) from public;
grant execute on function public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) to authenticated;
revoke all on function public.get_unified_social_profile(text) from public;
grant execute on function public.get_unified_social_profile(text) to anon,authenticated;
