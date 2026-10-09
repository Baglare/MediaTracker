-- P2B fresh native domain bootstrap. Historical migrations are never executed by native runtime.
BEGIN;
SET LOCAL ROLE mt_owner;
create table app.profiles (
  id uuid primary key references native_auth."user"(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table app.recommendation_feedback (
  id text primary key,
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  action text not null,
  recommendation_id text not null,
  title text not null,
  media_type text not null,
  source text not null,
  external_source text,
  external_id text,
  session_id text,
  prompt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint recommendation_feedback_action_check
    check (
      action in (
        'shown',
        'dismissed',
        'similar_requested',
        'added',
        'open_discover'
      )
    )
);
CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON app.profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON app.profiles FOR SELECT TO mt_runtime USING(id=app.current_user_id());
CREATE POLICY profiles_update_own ON app.profiles FOR UPDATE TO mt_runtime USING(id=app.current_user_id()) WITH CHECK(id=app.current_user_id());

-- Source 20260721110000_social_profile_foundation.sql sha256 aaf74a007014430a166699ba5f2120082f96bf8d9fe8222ea71dd540a4875a73
-- MediaTracker Social Phase 1 foundation
-- Apply manually with the Supabase CLI or SQL Editor. Idempotent where PostgreSQL permits.

alter table app.profiles add column if not exists username text;
alter table app.profiles add column if not exists bio text not null default '';
alter table app.profiles add column if not exists location text;
alter table app.profiles add column if not exists language text;
alter table app.profiles add column if not exists visibility_mode text not null default 'personal';
alter table app.profiles add column if not exists connection_color text not null default 'neutral';
alter table app.profiles add column if not exists avatar_path text;
alter table app.profiles add column if not exists banner_path text;
alter table app.profiles add column if not exists selected_title text;
alter table app.profiles add column if not exists follow_list_visibility text not null default 'public';
alter table app.profiles add column if not exists layout_mode text not null default 'grid';
alter table app.profiles add column if not exists joined_at timestamptz not null default now();
alter table app.profiles add column if not exists deleted_at timestamptz;
alter table app.profiles add column if not exists username_changed_at timestamptz;

create unique index if not exists profiles_username_lower_unique
  on app.profiles (lower(username)) where username is not null and deleted_at is null;
create index if not exists profiles_search_idx
  on app.profiles (lower(username), lower(display_name)) where deleted_at is null and visibility_mode <> 'personal';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format_check') then
    alter table app.profiles add constraint profiles_username_format_check check (
      username is null or (
        username = lower(username) and length(username) between 3 and 24 and
        username ~ '^[a-z0-9_]+$' and username !~ '^_' and username !~ '_$' and username !~ '__'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_social_text_check') then
    alter table app.profiles add constraint profiles_social_text_check check (
      length(coalesce(display_name, '')) <= 60 and length(bio) <= 500 and
      length(coalesce(location, '')) <= 80 and length(coalesce(language, '')) <= 12 and
      length(coalesce(selected_title, '')) <= 60 and
      display_name !~ '[<>]' and bio !~ '[<>]' and coalesce(location, '') !~ '[<>]' and coalesce(selected_title, '') !~ '[<>]'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_language_check') then
    alter table app.profiles add constraint profiles_language_check check (
      language is null or language in ('tr','en','de','fr','es','it','pt','ja','ko','zh','other')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_visibility_mode_check') then
    alter table app.profiles add constraint profiles_visibility_mode_check check (visibility_mode in ('public', 'protected', 'personal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_connection_color_check') then
    alter table app.profiles add constraint profiles_connection_color_check check (
      connection_color in ('neutral', 'violet', 'blue', 'cyan', 'emerald', 'amber', 'orange', 'red', 'rose', 'pink')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_follow_visibility_check') then
    alter table app.profiles add constraint profiles_follow_visibility_check check (follow_list_visibility in ('public', 'followers', 'mutual', 'self'));
  end if;
end $$;

create table if not exists app.profile_username_history (
  id bigint generated by default as identity primary key,
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  username text not null,
  claimed_at timestamptz not null default now(),
  released_at timestamptz not null default now(),
  reserved_until timestamptz not null default (now() + interval '90 days'),
  constraint profile_username_history_format_check check (
    username = lower(username) and length(username) between 3 and 24 and username ~ '^[a-z0-9_]+$'
  )
);
create index if not exists profile_username_history_lookup_idx on app.profile_username_history (lower(username), reserved_until desc);
create index if not exists profile_username_history_user_idx on app.profile_username_history (user_id, released_at desc);

create table if not exists app.profile_modules (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  visibility text not null,
  grid_x integer not null,
  grid_y integer not null,
  grid_width integer not null,
  grid_height integer not null,
  mobile_order integer not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key),
  constraint profile_modules_key_check check (module_key in ('favorites','current','stats','progression','badges','follows','shared_lists','shared_notes')),
  constraint profile_modules_visibility_check check (visibility in ('public','followers','mutual','self')),
  constraint profile_modules_grid_check check (
    grid_x between 0 and 11 and grid_y >= 0 and grid_width between 1 and 12 and
    grid_height between 1 and 6 and mobile_order >= 0 and grid_x + grid_width <= 12
  ),
  constraint profile_modules_config_object_check check (jsonb_typeof(config) = 'object')
);
create index if not exists profile_modules_owner_order_idx on app.profile_modules (user_id, mobile_order);

create table if not exists app.profile_media_showcase (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  showcase_kind text not null,
  title text not null,
  media_type text not null,
  external_source text,
  external_id text,
  cover_url text,
  world text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_showcase_kind_check check (showcase_kind in ('favorites','current')),
  constraint profile_showcase_title_check check (length(title) between 1 and 180),
  constraint profile_showcase_media_type_check check (media_type in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel')),
  constraint profile_showcase_cover_check check (cover_url is null or cover_url like 'https://%'),
  constraint profile_showcase_world_check check (world in ('east','screen','arch')),
  constraint profile_showcase_order_check check (
    (showcase_kind = 'favorites' and sort_order between 0 and 4) or
    (showcase_kind = 'current' and sort_order between 0 and 5)
  )
);
create unique index if not exists profile_showcase_order_unique on app.profile_media_showcase (user_id, showcase_kind, sort_order);
create unique index if not exists profile_showcase_media_unique on app.profile_media_showcase (
  user_id, showcase_kind, coalesce(external_source, ''), coalesce(external_id, ''), lower(title), media_type
);

create table if not exists app.profile_stats_snapshots (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  total_media integer not null,
  completed integer not null,
  active integer not null,
  planning integer not null,
  favorites integer not null,
  rated integer not null,
  world_counts jsonb not null,
  snapshot_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint profile_stats_nonnegative_check check (
    total_media >= 0 and completed >= 0 and active >= 0 and planning >= 0 and favorites >= 0 and rated >= 0
  ),
  constraint profile_stats_world_object_check check (jsonb_typeof(world_counts) = 'object')
);

create table if not exists app.profile_progression_snapshots (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  version integer not null default 1,
  total_xp integer not null,
  level integer not null,
  title text not null,
  tier text not null,
  dominant_world text not null,
  progress_percent numeric not null,
  world_counts jsonb not null,
  snapshot_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint profile_progression_numbers_check check (version > 0 and total_xp >= 0 and level > 0 and progress_percent between 0 and 1),
  constraint profile_progression_world_object_check check (jsonb_typeof(world_counts) = 'object')
);

create table if not exists app.profile_shared_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  media_title text not null,
  media_type text not null,
  external_source text,
  external_id text,
  content text not null,
  contains_spoiler boolean not null default false,
  visibility text not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_shared_notes_title_check check (length(media_title) between 1 and 180),
  constraint profile_shared_notes_content_check check (length(content) between 1 and 2000),
  constraint profile_shared_notes_media_type_check check (media_type in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel')),
  constraint profile_shared_notes_plain_text_check check (media_title !~ '[<>]' and content !~ '[<>]'),
  constraint profile_shared_notes_visibility_check check (visibility in ('public','followers','mutual'))
);
create index if not exists profile_shared_notes_owner_idx on app.profile_shared_notes (user_id, created_at desc);

create table if not exists app.profile_follows (
  follower_id uuid not null references native_auth."user"(id) on delete cascade,
  following_id uuid not null references native_auth."user"(id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint profile_follows_no_self_check check (follower_id <> following_id),
  constraint profile_follows_status_check check (status in ('pending','accepted'))
);
create index if not exists profile_follows_following_status_idx on app.profile_follows (following_id, status, created_at desc);
create index if not exists profile_follows_follower_status_idx on app.profile_follows (follower_id, status, created_at desc);

create table if not exists app.profile_blocks (
  blocker_id uuid not null references native_auth."user"(id) on delete cascade,
  blocked_id uuid not null references native_auth."user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint profile_blocks_no_self_check check (blocker_id <> blocked_id)
);
create index if not exists profile_blocks_blocked_idx on app.profile_blocks (blocked_id, blocker_id);

drop trigger if exists profile_modules_set_updated_at on app.profile_modules;
create trigger profile_modules_set_updated_at before update on app.profile_modules for each row execute function app.set_updated_at();
drop trigger if exists profile_media_showcase_set_updated_at on app.profile_media_showcase;
create trigger profile_media_showcase_set_updated_at before update on app.profile_media_showcase for each row execute function app.set_updated_at();
drop trigger if exists profile_stats_set_updated_at on app.profile_stats_snapshots;
create trigger profile_stats_set_updated_at before update on app.profile_stats_snapshots for each row execute function app.set_updated_at();
drop trigger if exists profile_progression_set_updated_at on app.profile_progression_snapshots;
create trigger profile_progression_set_updated_at before update on app.profile_progression_snapshots for each row execute function app.set_updated_at();
drop trigger if exists profile_shared_notes_set_updated_at on app.profile_shared_notes;
create trigger profile_shared_notes_set_updated_at before update on app.profile_shared_notes for each row execute function app.set_updated_at();
drop trigger if exists profile_follows_set_updated_at on app.profile_follows;
create trigger profile_follows_set_updated_at before update on app.profile_follows for each row execute function app.set_updated_at();

alter table app.profile_username_history enable row level security;
alter table app.profile_modules enable row level security;
alter table app.profile_media_showcase enable row level security;
alter table app.profile_stats_snapshots enable row level security;
alter table app.profile_progression_snapshots enable row level security;
alter table app.profile_shared_notes enable row level security;
alter table app.profile_follows enable row level security;
alter table app.profile_blocks enable row level security;

drop policy if exists profile_username_history_select_own on app.profile_username_history;
create policy profile_username_history_select_own on app.profile_username_history for select using (app.current_user_id() = user_id);
drop policy if exists profile_modules_own_all on app.profile_modules;
create policy profile_modules_own_all on app.profile_modules for all using (app.current_user_id() = user_id) with check (app.current_user_id() = user_id);
drop policy if exists profile_showcase_own_all on app.profile_media_showcase;
create policy profile_showcase_own_all on app.profile_media_showcase for all using (app.current_user_id() = user_id) with check (app.current_user_id() = user_id);
drop policy if exists profile_stats_own_all on app.profile_stats_snapshots;
create policy profile_stats_own_all on app.profile_stats_snapshots for all using (app.current_user_id() = user_id) with check (app.current_user_id() = user_id);
drop policy if exists profile_progression_own_all on app.profile_progression_snapshots;
create policy profile_progression_own_all on app.profile_progression_snapshots for all using (app.current_user_id() = user_id) with check (app.current_user_id() = user_id);
drop policy if exists profile_shared_notes_own_all on app.profile_shared_notes;
create policy profile_shared_notes_own_all on app.profile_shared_notes for all using (app.current_user_id() = user_id) with check (app.current_user_id() = user_id);
drop policy if exists profile_follows_select_involved on app.profile_follows;
create policy profile_follows_select_involved on app.profile_follows for select using (app.current_user_id() in (follower_id, following_id));
drop policy if exists profile_blocks_select_own on app.profile_blocks;
create policy profile_blocks_select_own on app.profile_blocks for select using (app.current_user_id() = blocker_id);

create or replace function app.social_is_blocked(p_first uuid, p_second uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,app,pg_temp as $$
  select exists (
    select 1 from app.profile_blocks
    where (blocker_id = p_first and blocked_id = p_second) or (blocker_id = p_second and blocked_id = p_first)
  );
$$;

create or replace function app.social_can_view_module(p_owner uuid, p_visibility text, p_viewer uuid default app.current_user_id())
returns boolean language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
begin
  if p_viewer = p_owner then return true; end if;
  if exists (select 1 from app.profile_blocks where (blocker_id=p_owner and blocked_id=p_viewer) or (blocker_id=p_viewer and blocked_id=p_owner)) then return false; end if;
  if p_visibility = 'public' then return true; end if;
  if p_viewer is null or p_visibility = 'self' then return false; end if;
  if not exists (select 1 from app.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted') then return false; end if;
  if p_visibility = 'followers' then return true; end if;
  return p_visibility = 'mutual' and exists (
    select 1 from app.profile_follows where follower_id=p_owner and following_id=p_viewer and status='accepted'
  );
end;
$$;

create or replace function app.social_save_profile(
  p_username text, p_display_name text, p_bio text, p_location text, p_language text,
  p_visibility_mode text, p_connection_color text, p_selected_title text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_user uuid := app.current_user_id();
  v_username text := lower(trim(p_username));
  v_current app.profiles%rowtype;
  v_reserved text[] := array['admin','administrator','api','auth','login','logout','register','settings','profile','profiles','u','users','people','social','support','system','moderator','mod','media','mediatracker','null','undefined'];
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if length(v_username) not between 3 and 24 or v_username !~ '^[a-z0-9_]+$' or v_username ~ '^_|_$|__' or v_username = any(v_reserved) then
    raise exception 'invalid_username';
  end if;
  if length(trim(coalesce(p_display_name,''))) not between 1 and 60 or length(coalesce(p_bio,'')) > 500 or length(coalesce(p_location,'')) > 80 or length(coalesce(p_language,'')) > 12 or length(coalesce(p_selected_title,'')) > 60 then
    raise exception 'invalid_profile_text';
  end if;
  if p_display_name ~ '[<>]' or coalesce(p_bio,'') ~ '[<>]' or coalesce(p_location,'') ~ '[<>]' or coalesce(p_selected_title,'') ~ '[<>]' then raise exception 'html_not_allowed'; end if;
  if nullif(lower(trim(coalesce(p_language,''))),'') is not null and lower(trim(p_language)) not in ('tr','en','de','fr','es','it','pt','ja','ko','zh','other') then raise exception 'invalid_language'; end if;
  if p_visibility_mode not in ('public','protected','personal') then raise exception 'invalid_visibility'; end if;
  if p_connection_color not in ('neutral','violet','blue','cyan','emerald','amber','orange','red','rose','pink') then raise exception 'invalid_color'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_username, 0));
  select * into v_current from app.profiles where id=v_user for update;
  if exists (select 1 from app.profiles where lower(username)=v_username and id<>v_user and deleted_at is null) then raise exception 'username_taken'; end if;
  if exists (select 1 from app.profile_username_history where lower(username)=v_username and user_id<>v_user and reserved_until>now()) then raise exception 'username_reserved'; end if;

  if v_current.id is not null and v_current.username is distinct from v_username then
    if v_current.username is not null and v_current.username_changed_at > now() - interval '30 days' then raise exception 'username_cooldown'; end if;
    if v_current.username is not null then
      insert into app.profile_username_history(user_id, username, claimed_at, released_at, reserved_until)
      values(v_user, v_current.username, coalesce(v_current.username_changed_at, v_current.created_at), now(), now()+interval '90 days');
    end if;
  end if;

  insert into app.profiles(id, username, display_name, bio, location, language, visibility_mode, connection_color, selected_title, username_changed_at)
  values(v_user, v_username, trim(p_display_name), coalesce(p_bio,''), nullif(trim(coalesce(p_location,'')),''), nullif(lower(trim(coalesce(p_language,''))),''), p_visibility_mode, p_connection_color, nullif(trim(coalesce(p_selected_title,'')),''), now())
  on conflict(id) do update set
    username=excluded.username, display_name=excluded.display_name, bio=excluded.bio, location=excluded.location,
    language=excluded.language, visibility_mode=excluded.visibility_mode, connection_color=excluded.connection_color,
    selected_title=excluded.selected_title,
    username_changed_at=case when profiles.username is distinct from excluded.username then now() else profiles.username_changed_at end,
    deleted_at=null;

  if p_visibility_mode='personal' then delete from app.profile_follows where following_id=v_user and status='pending'; end if;

  insert into app.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order)
  values
    (v_user,'favorites',true,'public',0,0,8,2,0),(v_user,'current',true,'followers',8,0,4,2,1),
    (v_user,'stats',true,'public',0,2,6,2,2),(v_user,'progression',true,'public',6,2,6,2,3),
    (v_user,'badges',false,'public',0,4,4,2,4),(v_user,'follows',true,'public',4,4,4,2,5),
    (v_user,'shared_lists',false,'public',8,4,4,2,6),(v_user,'shared_notes',true,'self',0,6,12,2,7)
  on conflict(user_id,module_key) do nothing;

  return jsonb_build_object('ok',true,'username',v_username);
end;
$$;

create or replace function app.social_follow(p_target uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_mode text; v_status text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_user=p_target then raise exception 'self_follow_not_allowed'; end if;
  if app.social_is_blocked(v_user,p_target) then raise exception 'profile_unavailable'; end if;
  select visibility_mode into v_mode from app.profiles where id=p_target and deleted_at is null;
  if v_mode is null or v_mode='personal' then raise exception 'profile_unavailable'; end if;
  if exists(select 1 from app.profile_follows where follower_id=v_user and following_id=p_target) then raise exception 'follow_exists'; end if;
  v_status:=case when v_mode='public' then 'accepted' else 'pending' end;
  insert into app.profile_follows(follower_id,following_id,status,responded_at)
  values(v_user,p_target,v_status,case when v_status='accepted' then now() else null end);
  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

create or replace function app.social_follow_action(p_action text, p_other uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_count integer:=0;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_action='unfollow' then delete from app.profile_follows where follower_id=v_user and following_id=p_other and status='accepted';
  elsif p_action='cancel' then delete from app.profile_follows where follower_id=v_user and following_id=p_other and status='pending';
  elsif p_action='accept' then update app.profile_follows set status='accepted',responded_at=now() where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='reject' then delete from app.profile_follows where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='remove_follower' then delete from app.profile_follows where follower_id=p_other and following_id=v_user and status='accepted';
  else raise exception 'invalid_follow_action'; end if;
  get diagnostics v_count = row_count;
  if v_count=0 then raise exception 'relationship_not_found'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function app.social_block(p_target uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_user=p_target then raise exception 'self_block_not_allowed'; end if;
  insert into app.profile_blocks(blocker_id,blocked_id) values(v_user,p_target) on conflict do nothing;
  delete from app.profile_follows where (follower_id=v_user and following_id=p_target) or (follower_id=p_target and following_id=v_user);
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function app.social_unblock(p_target uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
begin
  if app.current_user_id() is null then raise exception 'authentication_required'; end if;
  delete from app.profile_blocks where blocker_id=app.current_user_id() and blocked_id=p_target;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function app.social_replace_showcase(p_kind text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_limit integer; v_count integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_kind not in ('favorites','current') or jsonb_typeof(p_items)<>'array' then raise exception 'invalid_showcase'; end if;
  v_limit:=case when p_kind='favorites' then 5 else 6 end;
  v_count:=jsonb_array_length(p_items);
  if v_count>v_limit then raise exception 'showcase_limit'; end if;
  delete from app.profile_media_showcase where user_id=v_user and showcase_kind=p_kind;
  insert into app.profile_media_showcase(user_id,showcase_kind,title,media_type,external_source,external_id,cover_url,world,sort_order)
  select v_user,p_kind,x.title,x.media_type,nullif(x.external_source,''),nullif(x.external_id,''),nullif(x.cover_url,''),x.world,x.sort_order
  from jsonb_to_recordset(p_items) as x(title text,media_type text,external_source text,external_id text,cover_url text,world text,sort_order integer);
  return jsonb_build_object('ok',true,'count',v_count);
end;
$$;

create or replace function app.social_share_note(
  p_media_title text, p_media_type text, p_external_source text, p_external_id text,
  p_content text, p_contains_spoiler boolean, p_visibility text, p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_confirmed is distinct from true then raise exception 'explicit_confirmation_required'; end if;
  if length(trim(coalesce(p_media_title,''))) not between 1 and 180 or length(trim(coalesce(p_content,''))) not between 1 and 2000 then raise exception 'invalid_shared_note'; end if;
  if p_media_title ~ '[<>]' or p_content ~ '[<>]' then raise exception 'html_not_allowed'; end if;
  if p_media_type not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') then raise exception 'invalid_media_type'; end if;
  if p_visibility not in ('public','followers','mutual') then raise exception 'invalid_visibility'; end if;
  insert into app.profile_shared_notes(user_id,media_title,media_type,external_source,external_id,content,contains_spoiler,visibility,confirmed_at)
  values(v_user,trim(p_media_title),p_media_type,nullif(trim(coalesce(p_external_source,'')),''),nullif(trim(coalesce(p_external_id,'')),''),trim(p_content),p_contains_spoiler,p_visibility,now())
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function app.social_unshare_note(p_note uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_count integer;
begin
  if app.current_user_id() is null then raise exception 'authentication_required'; end if;
  delete from app.profile_shared_notes where id=p_note and user_id=app.current_user_id();
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'shared_note_not_found'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function app.get_social_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public, storage, pg_temp as $$
declare
  v_viewer uuid:=app.current_user_id(); v_owner app.profiles%rowtype; v_redirect text;
  v_out text; v_in text; v_self boolean; v_viewer_color text:='neutral'; v_modules jsonb; v_favorites jsonb; v_current jsonb;
  v_stats jsonb; v_progression jsonb; v_notes jsonb; v_followers bigint; v_following bigint;
begin
  select * into v_owner from app.profiles where lower(username)=lower(trim(p_username)) and deleted_at is null;
  if v_owner.id is null then
    select p.username into v_redirect from app.profile_username_history h join app.profiles p on p.id=h.user_id
    where lower(h.username)=lower(trim(p_username)) and h.reserved_until>now() and p.deleted_at is null order by h.released_at desc limit 1;
    if v_redirect is not null then return jsonb_build_object('status','not_found','redirectUsername',v_redirect); end if;
    return jsonb_build_object('status','not_found');
  end if;
  v_self:=v_viewer is not null and v_viewer=v_owner.id;
  if v_viewer is not null then select coalesce(connection_color,'neutral') into v_viewer_color from app.profiles where id=v_viewer; end if;
  if not v_self and v_viewer is not null and app.social_is_blocked(v_viewer,v_owner.id) then return jsonb_build_object('status','unavailable'); end if;
  if v_owner.visibility_mode='personal' and not v_self then return jsonb_build_object('status','personal'); end if;

  select status into v_out from app.profile_follows where follower_id=v_viewer and following_id=v_owner.id;
  select status into v_in from app.profile_follows where follower_id=v_owner.id and following_id=v_viewer;
  select count(*) into v_followers from app.profile_follows where following_id=v_owner.id and status='accepted';
  select count(*) into v_following from app.profile_follows where follower_id=v_owner.id and status='accepted';
  select coalesce(jsonb_agg(jsonb_build_object(
    'moduleKey',module_key,'enabled',enabled,'visibility',visibility,'gridX',grid_x,'gridY',grid_y,
    'gridWidth',grid_width,'gridHeight',grid_height,'mobileOrder',mobile_order,'config',config
  ) order by mobile_order),'[]'::jsonb) into v_modules
  from app.profile_modules where user_id=v_owner.id and enabled and app.social_can_view_module(v_owner.id,visibility,v_viewer);

  if exists(select 1 from app.profile_modules where user_id=v_owner.id and module_key='favorites' and enabled and app.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select coalesce(jsonb_agg(jsonb_build_object('title',title,'mediaType',media_type,'externalSource',external_source,'externalId',external_id,'coverUrl',cover_url,'world',world,'sortOrder',sort_order) order by sort_order),'[]'::jsonb)
    into v_favorites from app.profile_media_showcase where user_id=v_owner.id and showcase_kind='favorites';
  else v_favorites:='[]'::jsonb; end if;
  if exists(select 1 from app.profile_modules where user_id=v_owner.id and module_key='current' and enabled and app.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select coalesce(jsonb_agg(jsonb_build_object('title',title,'mediaType',media_type,'externalSource',external_source,'externalId',external_id,'coverUrl',cover_url,'world',world,'sortOrder',sort_order) order by sort_order),'[]'::jsonb)
    into v_current from app.profile_media_showcase where user_id=v_owner.id and showcase_kind='current';
  else v_current:='[]'::jsonb; end if;
  if exists(select 1 from app.profile_modules where user_id=v_owner.id and module_key='stats' and enabled and app.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select jsonb_build_object('totalMedia',total_media,'completed',completed,'active',active,'planning',planning,'favorites',favorites,'rated',rated,'worldCounts',world_counts,'snapshotAt',snapshot_at)
    into v_stats from app.profile_stats_snapshots where user_id=v_owner.id;
  end if;
  if exists(select 1 from app.profile_modules where user_id=v_owner.id and module_key='progression' and enabled and app.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select jsonb_build_object('version',version,'totalXp',total_xp,'level',level,'title',title,'tier',tier,'dominantWorld',dominant_world,'progressPercent',progress_percent,'worldCounts',world_counts,'snapshotAt',snapshot_at)
    into v_progression from app.profile_progression_snapshots where user_id=v_owner.id;
  end if;
  if exists(select 1 from app.profile_modules where user_id=v_owner.id and module_key='shared_notes' and enabled and app.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'mediaTitle',media_title,'mediaType',media_type,'externalSource',external_source,'externalId',external_id,'content',content,'containsSpoiler',contains_spoiler,'visibility',visibility,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc),'[]'::jsonb)
    into v_notes from app.profile_shared_notes where user_id=v_owner.id and app.social_can_view_module(v_owner.id,visibility,v_viewer);
  else v_notes:='[]'::jsonb; end if;

  return jsonb_build_object(
    'status','available',
    'profile',jsonb_build_object('id',v_owner.id,'username',v_owner.username,'displayName',coalesce(v_owner.display_name,v_owner.username),'bio',v_owner.bio,'location',v_owner.location,'language',v_owner.language,'visibilityMode',v_owner.visibility_mode,'connectionColor',v_owner.connection_color,'avatarPath',v_owner.avatar_path,'bannerPath',v_owner.banner_path,'joinedAt',v_owner.joined_at,'selectedTitle',v_owner.selected_title,'followerCount',v_followers,'followingCount',v_following),
    'relationship',jsonb_build_object('viewerFollowsOwner',v_out,'ownerFollowsViewer',v_in,'self',v_self,'anonymous',v_viewer is null,'viewerConnectionColor',v_viewer_color),
    'modules',v_modules,'favorites',v_favorites,'current',v_current,'stats',v_stats,'progression',v_progression,'sharedNotes',v_notes
  );
end;
$$;

create or replace function app.search_social_profiles(p_query text, p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_viewer uuid:=app.current_user_id(); v_viewer_color text:='neutral'; v_query text:=lower(trim(p_query)); v_pattern text; v_result jsonb;
begin
  if length(v_query)<2 or length(v_query)>60 then raise exception 'invalid_search_query'; end if;
  v_pattern:=replace(replace(replace(v_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  if v_viewer is not null then select coalesce(connection_color,'neutral') into v_viewer_color from app.profiles where id=v_viewer; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'bio',left(p.bio,160),
      'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'avatarPath',p.avatar_path,
      'anonymous',v_viewer is null,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
      'viewerFollowsOwner',(select f.status from app.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
      'ownerFollowsViewer',(select f.status from app.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
    ) as row_data
    from app.profiles p
    where p.deleted_at is null and p.visibility_mode in ('public','protected') and
      (lower(p.username) like '%'||v_pattern||'%' escape E'\\' or lower(coalesce(p.display_name,'')) like '%'||v_pattern||'%' escape E'\\') and
      (v_viewer is null or not app.social_is_blocked(v_viewer,p.id))
    order by case when lower(p.username)=v_query then 0 else 1 end, lower(p.username)
    offset greatest(0,p_offset) limit least(20,greatest(1,p_limit))
  ) q;
  return v_result;
end;
$$;

create or replace function app.list_social_blocks()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.blocked_id,'username',case when p.deleted_at is null then p.username else null end,
    'displayName',case when p.deleted_at is null then coalesce(p.display_name,p.username) else 'Kullanılamayan hesap' end
  ) order by b.created_at desc),'[]'::jsonb) into v_result
  from app.profile_blocks b left join app.profiles p on p.id=b.blocked_id where b.blocker_id=v_user;
  return v_result;
end;
$$;

create or replace function app.list_social_connections(
  p_owner uuid, p_kind text, p_query text default '', p_offset integer default 0, p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_viewer uuid:=app.current_user_id(); v_mode text; v_visibility text; v_result jsonb; v_query text:=lower(trim(coalesce(p_query,''))); v_pattern text;
begin
  if p_kind not in ('followers','following','pending') or length(v_query)>60 then raise exception 'invalid_connection_query'; end if;
  v_pattern:=replace(replace(replace(v_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  select visibility_mode,follow_list_visibility into v_mode,v_visibility from app.profiles where id=p_owner and deleted_at is null;
  if v_mode is null then return '[]'::jsonb; end if;
  if p_kind='pending' and v_viewer is distinct from p_owner then return '[]'::jsonb; end if;
  if p_kind<>'pending' and (
    (v_mode='personal' and v_viewer is distinct from p_owner) or
    not app.social_can_view_module(p_owner,v_visibility,v_viewer) or
    not exists(select 1 from app.profile_modules where user_id=p_owner and module_key='follows' and enabled and app.social_can_view_module(p_owner,visibility,v_viewer))
  ) then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path,
      'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'status',f.status,
      'viewerFollowsOwner',(select vf.status from app.profile_follows vf where vf.follower_id=v_viewer and vf.following_id=p.id),
      'ownerFollowsViewer',(select ofl.status from app.profile_follows ofl where ofl.follower_id=p.id and ofl.following_id=v_viewer)
    ) row_data
    from app.profile_follows f
    join app.profiles p on p.id=case when p_kind='following' then f.following_id else f.follower_id end
    where
      ((p_kind='following' and f.follower_id=p_owner and f.status='accepted') or
       (p_kind='followers' and f.following_id=p_owner and f.status='accepted') or
       (p_kind='pending' and f.following_id=p_owner and f.status='pending')) and
      p.deleted_at is null and p.visibility_mode<>'personal' and
      (v_query='' or lower(p.username) like '%'||v_pattern||'%' escape E'\\' or lower(coalesce(p.display_name,'')) like '%'||v_pattern||'%' escape E'\\') and
      not app.social_is_blocked(p_owner,p.id)
    order by f.created_at desc, lower(p.username)
    offset greatest(0,p_offset) limit least(20,greatest(1,p_limit))
  ) q;
  return v_result;
end;
$$;

create or replace function app.social_profile_asset_visible(p_owner text, p_viewer uuid default app.current_user_id())
returns boolean language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_mode text;
begin
  if p_viewer::text=p_owner then return true; end if;
  select visibility_mode into v_mode from app.profiles where id::text=p_owner and deleted_at is null;
  if v_mode is null or v_mode not in ('public','protected') then return false; end if;
  if p_viewer is not null and exists(
    select 1 from app.profile_blocks where
      (blocker_id::text=p_owner and blocked_id=p_viewer) or (blocker_id=p_viewer and blocked_id::text=p_owner)
  ) then return false; end if;
  return true;
end;
$$;

revoke all on function app.social_is_blocked(uuid,uuid) from public;
revoke all on function app.social_can_view_module(uuid,text,uuid) from public;
revoke all on function app.social_profile_asset_visible(text,uuid) from public;
revoke all on function app.social_save_profile(text,text,text,text,text,text,text,text) from public;
revoke all on function app.social_follow(uuid) from public;
revoke all on function app.social_follow_action(text,uuid) from public;
revoke all on function app.social_block(uuid) from public;
revoke all on function app.social_unblock(uuid) from public;
revoke all on function app.social_replace_showcase(text,jsonb) from public;
revoke all on function app.social_share_note(text,text,text,text,text,boolean,text,boolean) from public;
revoke all on function app.social_unshare_note(uuid) from public;
revoke all on function app.list_social_blocks() from public;
grant execute on function app.social_save_profile(text,text,text,text,text,text,text,text) to mt_runtime;
grant execute on function app.social_follow(uuid) to mt_runtime;
grant execute on function app.social_follow_action(text,uuid) to mt_runtime;
grant execute on function app.social_block(uuid) to mt_runtime;
grant execute on function app.social_unblock(uuid) to mt_runtime;
grant execute on function app.social_replace_showcase(text,jsonb) to mt_runtime;
grant execute on function app.social_share_note(text,text,text,text,text,boolean,text,boolean) to mt_runtime;
grant execute on function app.social_unshare_note(uuid) to mt_runtime;
grant execute on function app.list_social_blocks() to mt_runtime;
grant execute on function app.get_social_profile(text) to mt_runtime;
grant execute on function app.search_social_profiles(text,integer,integer) to mt_runtime;
grant execute on function app.list_social_connections(uuid,text,text,integer,integer) to mt_runtime;
grant execute on function app.social_profile_asset_visible(text,uuid) to mt_runtime;

-- Social identity changes must go through social_save_profile so username
-- history and cooldown cannot be bypassed with a direct table update.
revoke insert, update on table app.profiles from mt_runtime;
grant update (avatar_path, banner_path) on table app.profiles to mt_runtime;
revoke insert, update, delete on table app.profile_shared_notes from mt_runtime;



-- Source 20260721120000_social_profile_live_smoke_fixes.sql sha256 d6de0ecd3985ecf86416b0bc028f02a3b5b2613e9437872b27adab77f88bb80d
-- Social Phase 1 live smoke fixes.
-- A protected profile raises every module's effective minimum visibility to followers
-- without changing the stored profile_modules.visibility value.

create or replace function app.social_can_view_module(
  p_owner uuid,
  p_visibility text,
  p_viewer uuid default app.current_user_id()
)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_profile_visibility text;
begin
  if p_viewer = p_owner then
    return true;
  end if;

  if exists (
    select 1
    from app.profile_blocks
    where (blocker_id = p_owner and blocked_id = p_viewer)
       or (blocker_id = p_viewer and blocked_id = p_owner)
  ) then
    return false;
  end if;

  select visibility_mode
  into v_profile_visibility
  from app.profiles
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
    from app.profile_follows
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
    from app.profile_follows
    where follower_id = p_owner
      and following_id = p_viewer
      and status = 'accepted'
  );
end;
$$;

revoke all on function app.social_can_view_module(uuid, text, uuid) from public;


-- Source 20260721121000_social_profile_protected_visibility_fix_v2.sql sha256 c27e77fbaefd34fceb32e81b15bdd3ba2e58f46dc440a30ebb41dafa812918f3
-- Defense-in-depth replacement for already-deployed Social Phase 1 RPC helpers.
-- Protected profiles raise the effective minimum module visibility to followers
-- without mutating profile_modules.visibility.

create or replace function app.social_can_view_module(
  p_owner uuid,
  p_visibility text,
  p_viewer uuid default app.current_user_id()
)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_profile_visibility text;
begin
  if p_viewer = p_owner then
    return true;
  end if;

  if exists (
    select 1
    from app.profile_blocks
    where (blocker_id = p_owner and blocked_id = p_viewer)
       or (blocker_id = p_viewer and blocked_id = p_owner)
  ) then
    return false;
  end if;

  select visibility_mode
  into v_profile_visibility
  from app.profiles
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
    from app.profile_follows
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
    from app.profile_follows
    where follower_id = p_owner
      and following_id = p_viewer
      and status = 'accepted'
  );
end;
$$;

revoke all on function app.social_can_view_module(uuid, text, uuid) from public;


-- Source 20260721130000_social_interactions_recommendations.sql sha256 7717b815512d1a92816b0beac0a6d47632910171a328a90b888770fc4a8780c9
-- MediaTracker Social Phase 2: activity, comments, reactions, recommendations and notifications.
-- Apply manually after 20260721121000. This migration does not write XP.

alter table app.profiles
  add column if not exists recommendation_permission text not null default 'mutual';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_recommendation_permission_check') then
    alter table app.profiles add constraint profiles_recommendation_permission_check
      check (recommendation_permission in ('mutual','following','followers','everyone','none'));
  end if;
end $$;

alter table app.profile_modules drop constraint if exists profile_modules_key_check;
alter table app.profile_modules add constraint profile_modules_key_check
  check (module_key in ('favorites','current','stats','progression','badges','follows','shared_lists','shared_notes','activity'));

insert into app.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order,config)
select id,'activity',true,'followers',0,8,12,2,8,'{}'::jsonb
from app.profiles where deleted_at is null
on conflict(user_id,module_key) do nothing;

create or replace function app.social_ensure_activity_module()
returns trigger language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
begin
  if new.username is not null and new.deleted_at is null then
    insert into app.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order,config)
    values(new.id,'activity',true,'followers',0,8,12,2,8,'{}'::jsonb)
    on conflict(user_id,module_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_ensure_activity_module on app.profiles;
create trigger profiles_ensure_activity_module after insert or update of username,deleted_at on app.profiles for each row execute function app.social_ensure_activity_module();

create table if not exists app.social_activity_preferences (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  share_completed boolean not null default true,
  share_started boolean not null default false,
  share_rating boolean not null default false,
  share_favorite boolean not null default false,
  share_recommendation_completed boolean not null default false,
  default_visibility text not null default 'followers',
  updated_at timestamptz not null default now(),
  constraint social_activity_preferences_visibility_check check (default_visibility in ('public','followers','mutual','self'))
);

create table if not exists app.social_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references native_auth."user"(id) on delete cascade,
  event_type text not null,
  visibility text not null default 'followers',
  media_snapshot jsonb not null,
  rating integer,
  short_text text,
  source_event_id text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_activity_event_type_check check (event_type in ('media_started','media_completed','rating_shared','favorite_shared','shared_note_published','recommendation_completed','manual_media_share')),
  constraint social_activity_visibility_check check (visibility in ('public','followers','mutual','self')),
  constraint social_activity_media_object_check check (jsonb_typeof(media_snapshot)='object'),
  constraint social_activity_media_safe_check check (
    length(coalesce(media_snapshot->>'title','')) between 1 and 180 and coalesce(media_snapshot->>'title','') !~ '[<>]' and
    length(coalesce(media_snapshot->>'canonicalKey','')) between 3 and 260 and
    (media_snapshot->>'coverUrl' is null or media_snapshot->>'coverUrl' like 'https://%') and
    (media_snapshot->>'externalSource' is null or media_snapshot->>'externalSource' in ('tmdb','tvmaze','openlibrary','anilist','omdb')) and
    length(coalesce(media_snapshot->>'overview','')) <= 600 and coalesce(media_snapshot->>'overview','') !~ '[<>]'
  ),
  constraint social_activity_rating_check check (rating is null or rating between 0 and 10),
  constraint social_activity_text_check check (short_text is null or (length(short_text) between 1 and 500 and short_text !~ '[<>]')),
  constraint social_activity_source_check check (length(source_event_id) between 1 and 180),
  constraint social_activity_dedupe_check check (length(dedupe_key) between 8 and 220),
  unique(actor_id,dedupe_key)
);
create index if not exists social_activity_feed_idx on app.social_activity_events(created_at desc,id desc) where deleted_at is null;
create index if not exists social_activity_actor_idx on app.social_activity_events(actor_id,created_at desc) where deleted_at is null;

create table if not exists app.social_activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references app.social_activity_events(id) on delete cascade,
  author_id uuid not null references native_auth."user"(id) on delete cascade,
  parent_comment_id uuid references app.social_activity_comments(id) on delete cascade,
  body text not null,
  spoiler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  hidden_by_owner_at timestamptz,
  dedupe_key text not null,
  constraint social_comment_body_check check (length(btrim(body)) between 1 and 1000 and body !~ '[<>]'),
  constraint social_comment_dedupe_check check (length(dedupe_key) between 8 and 220),
  unique(author_id,dedupe_key)
);
create index if not exists social_comments_activity_idx on app.social_activity_comments(activity_id,created_at,id);
create index if not exists social_comments_parent_idx on app.social_activity_comments(parent_comment_id,created_at,id) where parent_comment_id is not null;

create table if not exists app.social_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  activity_id uuid references app.social_activity_events(id) on delete cascade,
  comment_id uuid references app.social_activity_comments(id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_reactions_one_target_check check ((activity_id is not null)::integer + (comment_id is not null)::integer = 1),
  constraint social_reactions_type_check check (reaction_type in ('like','love','interesting','celebrate'))
);
create unique index if not exists social_reactions_activity_unique on app.social_reactions(user_id,activity_id) where activity_id is not null;
create unique index if not exists social_reactions_comment_unique on app.social_reactions(user_id,comment_id) where comment_id is not null;
create index if not exists social_reactions_activity_idx on app.social_reactions(activity_id) where activity_id is not null;
create index if not exists social_reactions_comment_idx on app.social_reactions(comment_id) where comment_id is not null;

create table if not exists app.social_recommendations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references native_auth."user"(id) on delete cascade,
  recipient_id uuid not null references native_auth."user"(id) on delete cascade,
  response_status text not null default 'pending',
  progress_status text not null default 'none',
  sender_note text,
  recipient_response_note text,
  media_snapshot jsonb not null,
  canonical_media_key text not null,
  already_in_library boolean not null default false,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint social_recommendations_parties_check check (sender_id <> recipient_id),
  constraint social_recommendations_response_check check (response_status in ('pending','accepted','deferred','rejected','withdrawn')),
  constraint social_recommendations_progress_check check (progress_status in ('none','linked','started','completed')),
  constraint social_recommendations_media_check check (jsonb_typeof(media_snapshot)='object'),
  constraint social_recommendations_media_safe_check check (
    length(coalesce(media_snapshot->>'title','')) between 1 and 180 and coalesce(media_snapshot->>'title','') !~ '[<>]' and
    length(coalesce(media_snapshot->>'canonicalKey','')) between 3 and 260 and
    (media_snapshot->>'coverUrl' is null or media_snapshot->>'coverUrl' like 'https://%') and
    (media_snapshot->>'externalSource' is null or media_snapshot->>'externalSource' in ('tmdb','tvmaze','openlibrary','anilist','omdb')) and
    length(coalesce(media_snapshot->>'overview','')) <= 600 and coalesce(media_snapshot->>'overview','') !~ '[<>]'
  ),
  constraint social_recommendations_key_check check (length(canonical_media_key) between 3 and 260),
  constraint social_recommendations_sender_note_check check (sender_note is null or (length(sender_note) <= 500 and sender_note !~ '[<>]')),
  constraint social_recommendations_response_note_check check (recipient_response_note is null or (length(recipient_response_note) <= 300 and recipient_response_note !~ '[<>]')),
  constraint social_recommendations_dedupe_check check (length(dedupe_key) between 8 and 220),
  unique(sender_id,dedupe_key)
);
create unique index if not exists social_recommendations_active_unique
  on app.social_recommendations(sender_id,recipient_id,canonical_media_key)
  where response_status in ('pending','deferred') or (response_status='accepted' and progress_status <> 'completed');
create index if not exists social_recommendations_recipient_idx on app.social_recommendations(recipient_id,created_at desc,id desc);
create index if not exists social_recommendations_sender_idx on app.social_recommendations(sender_id,created_at desc,id desc);

create table if not exists app.social_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references app.social_recommendations(id) on delete cascade,
  actor_id uuid not null references native_auth."user"(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  dedupe_key text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint social_recommendation_event_type_check check (event_type in ('sent','deferred','accepted','rejected','withdrawn','linked','started','completed')),
  constraint social_recommendation_event_metadata_check check (jsonb_typeof(safe_metadata)='object'),
  unique(recommendation_id,dedupe_key)
);
create index if not exists social_recommendation_events_idx on app.social_recommendation_events(recommendation_id,occurred_at,id);

create table if not exists app.social_notification_preferences (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  follow_notifications boolean not null default true,
  comment_notifications boolean not null default true,
  reaction_notifications boolean not null default true,
  recommendation_received boolean not null default true,
  recommendation_accepted boolean not null default true,
  recommendation_started boolean not null default true,
  recommendation_completed boolean not null default true,
  recommendation_rejected boolean not null default false,
  recommendation_withdrawn boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists app.social_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references native_auth."user"(id) on delete cascade,
  actor_id uuid references native_auth."user"(id) on delete set null,
  notification_type text not null,
  entity_type text not null,
  entity_id uuid,
  safe_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz,
  dedupe_key text not null,
  constraint social_notifications_type_check check (notification_type in ('follow_request_received','follow_request_accepted','new_follower','activity_comment','comment_reply','activity_reaction','comment_reaction','recommendation_received','recommendation_accepted','recommendation_deferred','recommendation_started','recommendation_completed','recommendation_withdrawn','recommendation_rejected')),
  constraint social_notifications_entity_check check (entity_type in ('profile','activity','comment','recommendation')),
  constraint social_notifications_payload_check check (jsonb_typeof(safe_payload)='object'),
  unique(recipient_id,dedupe_key)
);
create index if not exists social_notifications_recipient_idx on app.social_notifications(recipient_id,created_at desc,id desc) where deleted_at is null;
create index if not exists social_notifications_unread_idx on app.social_notifications(recipient_id,created_at desc) where read_at is null and deleted_at is null;

create table if not exists app.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references native_auth."user"(id) on delete cascade,
  activity_id uuid references app.social_activity_events(id) on delete cascade,
  comment_id uuid references app.social_activity_comments(id) on delete cascade,
  category text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint social_reports_one_target_check check ((activity_id is not null)::integer + (comment_id is not null)::integer = 1),
  constraint social_reports_category_check check (category in ('spam','harassment','spoiler','inappropriate','other')),
  constraint social_reports_note_check check (note is null or (length(note) <= 500 and note !~ '[<>]'))
);
create unique index if not exists social_reports_activity_unique on app.social_reports(reporter_id,activity_id) where activity_id is not null;
create unique index if not exists social_reports_comment_unique on app.social_reports(reporter_id,comment_id) where comment_id is not null;

drop trigger if exists social_activity_preferences_set_updated_at on app.social_activity_preferences;
create trigger social_activity_preferences_set_updated_at before update on app.social_activity_preferences for each row execute function app.set_updated_at();
drop trigger if exists social_activity_events_set_updated_at on app.social_activity_events;
create trigger social_activity_events_set_updated_at before update on app.social_activity_events for each row execute function app.set_updated_at();
drop trigger if exists social_activity_comments_set_updated_at on app.social_activity_comments;
create trigger social_activity_comments_set_updated_at before update on app.social_activity_comments for each row execute function app.set_updated_at();
drop trigger if exists social_reactions_set_updated_at on app.social_reactions;
create trigger social_reactions_set_updated_at before update on app.social_reactions for each row execute function app.set_updated_at();
drop trigger if exists social_recommendations_set_updated_at on app.social_recommendations;
create trigger social_recommendations_set_updated_at before update on app.social_recommendations for each row execute function app.set_updated_at();
drop trigger if exists social_notification_preferences_set_updated_at on app.social_notification_preferences;
create trigger social_notification_preferences_set_updated_at before update on app.social_notification_preferences for each row execute function app.set_updated_at();

alter table app.social_activity_preferences enable row level security;
alter table app.social_activity_events enable row level security;
alter table app.social_activity_comments enable row level security;
alter table app.social_reactions enable row level security;
alter table app.social_recommendations enable row level security;
alter table app.social_recommendation_events enable row level security;
alter table app.social_notification_preferences enable row level security;
alter table app.social_notifications enable row level security;
alter table app.social_reports enable row level security;

create or replace function app.social_can_view_activity_row(p_owner uuid,p_visibility text,p_viewer uuid default app.current_user_id())
returns boolean language sql stable security definer set search_path=pg_catalog,app,pg_temp as $$
  select case
    when p_viewer=p_owner then true
    when p_viewer is not null and app.social_is_blocked(p_owner,p_viewer) then false
    when not exists(select 1 from app.profiles where id=p_owner and deleted_at is null) then false
    when (select visibility_mode from app.profiles where id=p_owner)='personal' then false
    when (select visibility_mode from app.profiles where id=p_owner)='protected'
      and not exists(select 1 from app.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted') then false
    when p_visibility='public' then true
    when p_viewer is null then false
    when p_visibility='followers' then exists(select 1 from app.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted')
    when p_visibility='mutual' then
      exists(select 1 from app.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted') and
      exists(select 1 from app.profile_follows where follower_id=p_owner and following_id=p_viewer and status='accepted')
    else false end;
$$;
revoke all on function app.social_can_view_activity_row(uuid,text,uuid) from public;

drop policy if exists social_activity_preferences_own on app.social_activity_preferences;
create policy social_activity_preferences_own on app.social_activity_preferences for all using(app.current_user_id()=user_id) with check(app.current_user_id()=user_id);
drop policy if exists social_activity_visible on app.social_activity_events;
create policy social_activity_visible on app.social_activity_events for select using(deleted_at is null and app.social_can_view_activity_row(actor_id,visibility,app.current_user_id()));
drop policy if exists social_activity_owner on app.social_activity_events;
create policy social_activity_owner on app.social_activity_events for all using(app.current_user_id()=actor_id) with check(app.current_user_id()=actor_id);
drop policy if exists social_comments_visible on app.social_activity_comments;
create policy social_comments_visible on app.social_activity_comments for select using(exists(select 1 from app.social_activity_events a where a.id=activity_id and a.deleted_at is null and app.social_can_view_activity_row(a.actor_id,a.visibility,app.current_user_id())));
drop policy if exists social_comments_owner on app.social_activity_comments;
create policy social_comments_owner on app.social_activity_comments for all using(app.current_user_id()=author_id) with check(app.current_user_id()=author_id);
drop policy if exists social_reactions_visible on app.social_reactions;
create policy social_reactions_visible on app.social_reactions for select using(
  (activity_id is not null and exists(select 1 from app.social_activity_events a where a.id=activity_id and a.deleted_at is null and app.social_can_view_activity_row(a.actor_id,a.visibility,app.current_user_id()))) or
  (comment_id is not null and exists(select 1 from app.social_activity_comments c join app.social_activity_events a on a.id=c.activity_id where c.id=comment_id and c.deleted_at is null and a.deleted_at is null and app.social_can_view_activity_row(a.actor_id,a.visibility,app.current_user_id())))
);
drop policy if exists social_reactions_owner on app.social_reactions;
create policy social_reactions_owner on app.social_reactions for all using(app.current_user_id()=user_id) with check(app.current_user_id()=user_id);
drop policy if exists social_recommendations_participants on app.social_recommendations;
create policy social_recommendations_participants on app.social_recommendations for select using(app.current_user_id() in (sender_id,recipient_id));
drop policy if exists social_recommendation_events_participants on app.social_recommendation_events;
create policy social_recommendation_events_participants on app.social_recommendation_events for select using(exists(select 1 from app.social_recommendations r where r.id=recommendation_id and app.current_user_id() in (r.sender_id,r.recipient_id)));
drop policy if exists social_notification_preferences_own on app.social_notification_preferences;
create policy social_notification_preferences_own on app.social_notification_preferences for all using(app.current_user_id()=user_id) with check(app.current_user_id()=user_id);
drop policy if exists social_notifications_recipient on app.social_notifications;
create policy social_notifications_recipient on app.social_notifications for select using(app.current_user_id()=recipient_id);
drop policy if exists social_reports_own on app.social_reports;
create policy social_reports_own on app.social_reports for select using(app.current_user_id()=reporter_id);

create or replace function app.social_notification_allowed(p_recipient uuid,p_type text)
returns boolean language sql stable security definer set search_path=pg_catalog,app,pg_temp as $$
  select case
    when p_type in ('follow_request_received','follow_request_accepted','new_follower') then coalesce((select follow_notifications from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_comment','comment_reply') then coalesce((select comment_notifications from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_reaction','comment_reaction') then coalesce((select reaction_notifications from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_received' then coalesce((select recommendation_received from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_accepted' or p_type='recommendation_deferred' then coalesce((select recommendation_accepted from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_started' then coalesce((select recommendation_started from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_completed' then coalesce((select recommendation_completed from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_rejected' then coalesce((select recommendation_rejected from app.social_notification_preferences where user_id=p_recipient),false)
    when p_type='recommendation_withdrawn' then coalesce((select recommendation_withdrawn from app.social_notification_preferences where user_id=p_recipient),true)
    else false end;
$$;
revoke all on function app.social_notification_allowed(uuid,text) from public;

create or replace function app.social_insert_notification(p_recipient uuid,p_actor uuid,p_type text,p_entity_type text,p_entity_id uuid,p_payload jsonb,p_dedupe text)
returns void language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
begin
  if p_recipient is null or p_recipient=p_actor or app.social_is_blocked(p_recipient,p_actor) then return; end if;
  if not app.social_notification_allowed(p_recipient,p_type) then return; end if;
  insert into app.social_notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,safe_payload,dedupe_key)
  values(p_recipient,p_actor,p_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),p_dedupe)
  on conflict(recipient_id,dedupe_key) do nothing;
end;
$$;
revoke all on function app.social_insert_notification(uuid,uuid,text,text,uuid,jsonb,text) from public;

create or replace function app.social_get_preferences()
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_profile app.profiles%rowtype; v_activity app.social_activity_preferences%rowtype; v_notification app.social_notification_preferences%rowtype;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_profile from app.profiles where id=v_user and deleted_at is null;
  if not found or v_profile.username is null then return jsonb_build_object('configured',false); end if;
  insert into app.social_activity_preferences(user_id) values(v_user) on conflict do nothing;
  insert into app.social_notification_preferences(user_id) values(v_user) on conflict do nothing;
  select * into v_activity from app.social_activity_preferences where user_id=v_user;
  select * into v_notification from app.social_notification_preferences where user_id=v_user;
  return jsonb_build_object('configured',true,'recommendationPermission',v_profile.recommendation_permission,
    'activity',jsonb_build_object('shareCompleted',v_activity.share_completed,'shareStarted',v_activity.share_started,'shareRating',v_activity.share_rating,'shareFavorite',v_activity.share_favorite,'shareRecommendationCompleted',v_activity.share_recommendation_completed,'defaultVisibility',v_activity.default_visibility),
    'notifications',jsonb_build_object('follow',v_notification.follow_notifications,'comments',v_notification.comment_notifications,'reactions',v_notification.reaction_notifications,'recommendationReceived',v_notification.recommendation_received,'recommendationAccepted',v_notification.recommendation_accepted,'recommendationStarted',v_notification.recommendation_started,'recommendationCompleted',v_notification.recommendation_completed,'recommendationRejected',v_notification.recommendation_rejected,'recommendationWithdrawn',v_notification.recommendation_withdrawn));
end;
$$;

create or replace function app.social_save_preferences(p_kind text,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_values)<>'object' then raise exception 'invalid_preferences'; end if;
  if p_kind='activity' then
    if coalesce(p_values->>'defaultVisibility','followers') not in ('public','followers','mutual','self') then raise exception 'invalid_visibility'; end if;
    insert into app.social_activity_preferences(user_id,share_completed,share_started,share_rating,share_favorite,share_recommendation_completed,default_visibility)
    values(v_user,coalesce((p_values->>'shareCompleted')::boolean,true),coalesce((p_values->>'shareStarted')::boolean,false),coalesce((p_values->>'shareRating')::boolean,false),coalesce((p_values->>'shareFavorite')::boolean,false),coalesce((p_values->>'shareRecommendationCompleted')::boolean,false),coalesce(p_values->>'defaultVisibility','followers'))
    on conflict(user_id) do update set share_completed=excluded.share_completed,share_started=excluded.share_started,share_rating=excluded.share_rating,share_favorite=excluded.share_favorite,share_recommendation_completed=excluded.share_recommendation_completed,default_visibility=excluded.default_visibility;
  elsif p_kind='notifications' then
    insert into app.social_notification_preferences(user_id,follow_notifications,comment_notifications,reaction_notifications,recommendation_received,recommendation_accepted,recommendation_started,recommendation_completed,recommendation_rejected,recommendation_withdrawn)
    values(v_user,coalesce((p_values->>'follow')::boolean,true),coalesce((p_values->>'comments')::boolean,true),coalesce((p_values->>'reactions')::boolean,true),coalesce((p_values->>'recommendationReceived')::boolean,true),coalesce((p_values->>'recommendationAccepted')::boolean,true),coalesce((p_values->>'recommendationStarted')::boolean,true),coalesce((p_values->>'recommendationCompleted')::boolean,true),coalesce((p_values->>'recommendationRejected')::boolean,false),coalesce((p_values->>'recommendationWithdrawn')::boolean,true))
    on conflict(user_id) do update set follow_notifications=excluded.follow_notifications,comment_notifications=excluded.comment_notifications,reaction_notifications=excluded.reaction_notifications,recommendation_received=excluded.recommendation_received,recommendation_accepted=excluded.recommendation_accepted,recommendation_started=excluded.recommendation_started,recommendation_completed=excluded.recommendation_completed,recommendation_rejected=excluded.recommendation_rejected,recommendation_withdrawn=excluded.recommendation_withdrawn;
  elsif p_kind='recommendations' then
    if p_values->>'permission' not in ('mutual','following','followers','everyone','none') then raise exception 'invalid_recommendation_permission'; end if;
    update app.profiles set recommendation_permission=p_values->>'permission' where id=v_user and deleted_at is null;
  else raise exception 'invalid_preferences_kind'; end if;
  return app.social_get_preferences();
end;
$$;

create or replace function app.social_publish_activity(p_event_type text,p_visibility text,p_media jsonb,p_rating integer,p_short_text text,p_source_event_id text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_id uuid; v_profile_mode text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select visibility_mode into v_profile_mode from app.profiles where id=v_user and username is not null and deleted_at is null;
  if v_profile_mode is null then raise exception 'social_profile_required'; end if;
  if p_event_type not in ('media_started','media_completed','rating_shared','favorite_shared','shared_note_published','recommendation_completed','manual_media_share') then raise exception 'invalid_activity_type'; end if;
  if p_visibility not in ('public','followers','mutual','self') then raise exception 'invalid_visibility'; end if;
  if jsonb_typeof(p_media)<>'object' or length(coalesce(p_media->>'title','')) not between 1 and 180 or coalesce(p_media->>'mediaType','') not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') or coalesce(p_media->>'world','') not in ('east','screen','arch') then raise exception 'invalid_media_snapshot'; end if;
  if p_event_type='manual_media_share' and (select count(*) from app.social_activity_events where actor_id=v_user and event_type='manual_media_share' and created_at >= now()-interval '1 day') >= 30 then raise exception 'rate_limit'; end if;
  insert into app.social_activity_events(actor_id,event_type,visibility,media_snapshot,rating,short_text,source_event_id,dedupe_key)
  values(v_user,p_event_type,case when v_profile_mode='personal' then 'self' else p_visibility end,p_media,p_rating,nullif(btrim(p_short_text),''),p_source_event_id,p_dedupe_key)
  on conflict(actor_id,dedupe_key) do update set updated_at=app.social_activity_events.updated_at returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function app.social_delete_activity(p_activity uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
begin
  if app.current_user_id() is null then raise exception 'authentication_required'; end if;
  update app.social_activity_events set deleted_at=now() where id=p_activity and actor_id=app.current_user_id() and deleted_at is null;
  if not found then raise exception 'activity_not_found'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function app.list_social_feed(p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc,(item->>'id')::uuid desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',a.id,'eventType',a.event_type,'visibility',a.visibility,'media',a.media_snapshot,'rating',a.rating,'text',a.short_text,'createdAt',a.created_at,'updatedAt',a.updated_at,
      'actor',jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path),
      'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'parentCommentId',c.parent_comment_id,'body',case when c.deleted_at is null and c.hidden_by_owner_at is null then c.body else null end,'spoiler',c.spoiler,'deleted',c.deleted_at is not null or c.hidden_by_owner_at is not null,'createdAt',c.created_at,'updatedAt',c.updated_at,'author',jsonb_build_object('id',cp.id,'username',cp.username,'displayName',coalesce(cp.display_name,cp.username),'avatarPath',cp.avatar_path),'reactions',coalesce((select jsonb_object_agg(reaction_type,total) from (select reaction_type,count(*) total from app.social_reactions where comment_id=c.id group by reaction_type) cr),'{}'::jsonb),'viewerReaction',(select reaction_type from app.social_reactions where comment_id=c.id and user_id=v_user)) order by c.created_at,c.id)
        from app.social_activity_comments c join app.profiles cp on cp.id=c.author_id
        where c.activity_id=a.id and not app.social_is_blocked(v_user,c.author_id)),'[]'::jsonb),
      'reactions',coalesce((select jsonb_object_agg(reaction_type,total) from (select reaction_type,count(*) total from app.social_reactions where activity_id=a.id group by reaction_type) rc),'{}'::jsonb),
      'viewerReaction',(select reaction_type from app.social_reactions where activity_id=a.id and user_id=v_user),
      'commentCount',(select count(*) from app.social_activity_comments where activity_id=a.id and deleted_at is null and hidden_by_owner_at is null)) item
    from app.social_activity_events a join app.profiles p on p.id=a.actor_id
    where a.deleted_at is null and p.deleted_at is null and p.visibility_mode<>'personal'
      and (a.actor_id=v_user or exists(select 1 from app.profile_follows f where f.follower_id=v_user and f.following_id=a.actor_id and f.status='accepted'))
      and app.social_can_view_activity_row(a.actor_id,a.visibility,v_user)
      and (p_cursor_created_at is null or (a.created_at,a.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by a.created_at desc,a.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function app.list_profile_activity(p_owner uuid,p_limit integer default 8)
returns jsonb language sql stable security definer set search_path=pg_catalog,app,pg_temp as $$
  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) from (
    select a.created_at,jsonb_build_object('id',a.id,'eventType',a.event_type,'visibility',a.visibility,'media',a.media_snapshot,'rating',a.rating,'text',a.short_text,'createdAt',a.created_at) item
    from app.social_activity_events a where a.actor_id=p_owner and a.deleted_at is null and app.social_can_view_activity_row(a.actor_id,a.visibility,app.current_user_id())
    order by a.created_at desc,a.id desc limit least(greatest(coalesce(p_limit,8),1),10)
  ) q;
$$;

create or replace function app.social_comment(p_activity uuid,p_parent uuid,p_body text,p_spoiler boolean,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_activity app.social_activity_events%rowtype; v_parent app.social_activity_comments%rowtype; v_root uuid; v_id uuid; v_target uuid; v_type text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if length(btrim(coalesce(p_body,''))) not between 1 and 1000 or p_body ~ '[<>]' then raise exception 'invalid_comment'; end if;
  select * into v_activity from app.social_activity_events where id=p_activity and deleted_at is null;
  if not found or not app.social_can_view_activity_row(v_activity.actor_id,v_activity.visibility,v_user) then raise exception 'activity_unavailable'; end if;
  if (select count(*) from app.social_activity_comments where author_id=v_user and created_at>=now()-interval '1 hour')>=60 then raise exception 'rate_limit'; end if;
  if exists(select 1 from app.social_activity_comments where author_id=v_user and activity_id=p_activity and body=btrim(p_body) and created_at>=now()-interval '2 minutes') then raise exception 'duplicate_comment'; end if;
  if p_parent is not null then
    select * into v_parent from app.social_activity_comments where id=p_parent and activity_id=p_activity and deleted_at is null and hidden_by_owner_at is null;
    if not found then raise exception 'parent_comment_unavailable'; end if;
    v_root:=coalesce(v_parent.parent_comment_id,v_parent.id); v_target:=v_parent.author_id; v_type:='comment_reply';
  else v_root:=null; v_target:=v_activity.actor_id; v_type:='activity_comment'; end if;
  insert into app.social_activity_comments(activity_id,author_id,parent_comment_id,body,spoiler,dedupe_key)
  values(p_activity,v_user,v_root,btrim(p_body),coalesce(p_spoiler,false),p_dedupe_key) returning id into v_id;
  perform app.social_insert_notification(v_target,v_user,v_type,case when v_type='comment_reply' then 'comment' else 'activity' end,case when v_type='comment_reply' then v_id else p_activity end,jsonb_build_object('activityId',p_activity),v_type||':'||v_id::text);
  return jsonb_build_object('ok',true,'id',v_id,'parentCommentId',v_root);
end;
$$;

create or replace function app.social_comment_action(p_action text,p_comment uuid,p_body text default null,p_spoiler boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_comment app.social_activity_comments%rowtype; v_owner uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select c.*
  into v_comment
  from app.social_activity_comments c
  where c.id = p_comment;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select a.actor_id
  into v_owner
  from app.social_activity_events a
  where a.id = v_comment.activity_id;

  if not found then
    raise exception 'activity_not_found';
  end if;
  if p_action='edit' then
    if v_comment.author_id<>v_user or v_comment.deleted_at is not null then raise exception 'not_allowed'; end if;
    if length(btrim(coalesce(p_body,''))) not between 1 and 1000 or p_body ~ '[<>]' then raise exception 'invalid_comment'; end if;
    update app.social_activity_comments set body=btrim(p_body),spoiler=coalesce(p_spoiler,false) where id=p_comment;
  elsif p_action='delete' then
    if v_comment.author_id<>v_user and v_owner<>v_user then raise exception 'not_allowed'; end if;
    update app.social_activity_comments set deleted_at=now() where id=p_comment and deleted_at is null;
  elsif p_action='hide' then
    if v_owner<>v_user then raise exception 'not_allowed'; end if;
    update app.social_activity_comments set hidden_by_owner_at=now() where id=p_comment;
  else raise exception 'invalid_comment_action'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function app.social_react(p_activity uuid,p_comment uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_existing text; v_activity app.social_activity_events%rowtype; v_comment app.social_activity_comments%rowtype; v_owner uuid; v_id uuid; v_type text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_reaction not in ('like','love','interesting','celebrate') then raise exception 'invalid_reaction'; end if;
  if (p_activity is null)::integer+(p_comment is null)::integer<>1 then raise exception 'invalid_target'; end if;
  if (select count(*) from app.social_reactions where user_id=v_user and created_at>=now()-interval '1 hour')>=120 then raise exception 'rate_limit'; end if;
  if p_activity is not null then
    select * into v_activity from app.social_activity_events where id=p_activity and deleted_at is null;
    v_owner:=v_activity.actor_id; v_type:='activity_reaction';
    if not found or not app.social_can_view_activity_row(v_owner,v_activity.visibility,v_user) then raise exception 'target_unavailable'; end if;
    select reaction_type into v_existing from app.social_reactions where user_id=v_user and activity_id=p_activity;
    if v_existing=p_reaction then delete from app.social_reactions where user_id=v_user and activity_id=p_activity; return jsonb_build_object('ok',true,'reaction',null); end if;
    insert into app.social_reactions(user_id,activity_id,reaction_type) values(v_user,p_activity,p_reaction)
    on conflict(user_id,activity_id) where activity_id is not null do update set reaction_type=excluded.reaction_type,updated_at=now() returning id into v_id;
  else
    select c.*
    into v_comment
    from app.social_activity_comments c
    where c.id=p_comment
      and c.deleted_at is null
      and c.hidden_by_owner_at is null;

    if not found then
      raise exception 'target_unavailable';
    end if;

    select a.*
    into v_activity
    from app.social_activity_events a
    where a.id=v_comment.activity_id
      and a.deleted_at is null;

    if not found then
      raise exception 'target_unavailable';
    end if;

    v_owner:=v_comment.author_id;
    v_type:='comment_reaction';
    if not app.social_can_view_activity_row(v_activity.actor_id,v_activity.visibility,v_user) then raise exception 'target_unavailable'; end if;
    select reaction_type into v_existing from app.social_reactions where user_id=v_user and comment_id=p_comment;
    if v_existing=p_reaction then delete from app.social_reactions where user_id=v_user and comment_id=p_comment; return jsonb_build_object('ok',true,'reaction',null); end if;
    insert into app.social_reactions(user_id,comment_id,reaction_type) values(v_user,p_comment,p_reaction)
    on conflict(user_id,comment_id) where comment_id is not null do update set reaction_type=excluded.reaction_type,updated_at=now() returning id into v_id;
  end if;
  perform app.social_insert_notification(v_owner,v_user,v_type,case when p_activity is not null then 'activity' else 'comment' end,coalesce(p_activity,p_comment),jsonb_build_object('reaction',p_reaction),v_type||':'||coalesce(p_activity,p_comment)::text||':'||v_user::text);
  return jsonb_build_object('ok',true,'reaction',p_reaction);
end;
$$;

create or replace function app.social_send_recommendation(p_recipient uuid,p_media jsonb,p_sender_note text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_permission text; v_mode text; v_key text; v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_recipient=v_user then raise exception 'self_recommendation_not_allowed'; end if;
  if app.social_is_blocked(v_user,p_recipient) then raise exception 'profile_unavailable'; end if;
  select recommendation_permission,visibility_mode into v_permission,v_mode from app.profiles where id=p_recipient and username is not null and deleted_at is null;
  if v_mode is null or v_mode='personal' or v_permission='none' then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='mutual' and not (exists(select 1 from app.profile_follows where follower_id=v_user and following_id=p_recipient and status='accepted') and exists(select 1 from app.profile_follows where follower_id=p_recipient and following_id=v_user and status='accepted')) then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='following' and not exists(select 1 from app.profile_follows where follower_id=p_recipient and following_id=v_user and status='accepted') then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='followers' and not exists(select 1 from app.profile_follows where follower_id=v_user and following_id=p_recipient and status='accepted') then raise exception 'recommendation_not_allowed'; end if;
  if jsonb_typeof(p_media)<>'object' or length(coalesce(p_media->>'title','')) not between 1 and 180 or coalesce(p_media->>'mediaType','') not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') or coalesce(p_media->>'world','') not in ('east','screen','arch') then raise exception 'invalid_media_snapshot'; end if;
  if length(coalesce(p_sender_note,''))>500 or coalesce(p_sender_note,'') ~ '[<>]' then raise exception 'invalid_sender_note'; end if;
  v_key:=case when nullif(p_media->>'externalSource','') is not null and nullif(p_media->>'externalId','') is not null
    then lower((p_media->>'externalSource')||':'||(p_media->>'externalId'))
    else lower('local:'||(p_media->>'mediaType')||':'||(p_media->>'title')) end;
  if length(coalesce(v_key,''))<3 then raise exception 'invalid_media_key'; end if;
  if (select count(*) from app.social_recommendations where sender_id=v_user and created_at>=date_trunc('day',now()))>=10 then raise exception 'rate_limit'; end if;
  if (select count(*) from app.social_recommendations where sender_id=v_user and recipient_id=p_recipient and (response_status in ('pending','deferred') or (response_status='accepted' and progress_status<>'completed')))>=5 then raise exception 'recipient_open_limit'; end if;
  if exists(select 1 from app.social_recommendations where sender_id=v_user and recipient_id=p_recipient and canonical_media_key=v_key and (response_status in ('pending','deferred') or (response_status='accepted' and progress_status<>'completed'))) then raise exception 'duplicate_recommendation'; end if;
  insert into app.social_recommendations(sender_id,recipient_id,sender_note,media_snapshot,canonical_media_key,dedupe_key)
  values(v_user,p_recipient,nullif(btrim(p_sender_note),''),p_media||jsonb_build_object('canonicalKey',v_key),v_key,p_dedupe_key) returning id into v_id;
  insert into app.social_recommendation_events(recommendation_id,actor_id,event_type,dedupe_key) values(v_id,v_user,'sent','sent:'||p_dedupe_key);
  perform app.social_insert_notification(p_recipient,v_user,'recommendation_received','recommendation',v_id,jsonb_build_object('title',p_media->>'title'),'recommendation_received:'||v_id::text);
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function app.social_recommendation_transition(p_recommendation uuid,p_action text,p_response_note text default null,p_already_in_library boolean default false,p_dedupe_key text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_rec app.social_recommendations%rowtype; v_event text; v_notify text; v_recipient uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from app.social_recommendations where id=p_recommendation for update;
  if not found then raise exception 'recommendation_not_found'; end if;
  if app.social_is_blocked(v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if length(coalesce(p_response_note,''))>300 or coalesce(p_response_note,'') ~ '[<>]' then raise exception 'invalid_response_note'; end if;
  if p_action in ('accept','defer','reject') then
    if v_user<>v_rec.recipient_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    if p_action='accept' then update app.social_recommendations set response_status='accepted',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='accepted'; v_notify:='recommendation_accepted';
    elsif p_action='defer' then update app.social_recommendations set response_status='deferred',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='deferred'; v_notify:='recommendation_deferred';
    else update app.social_recommendations set response_status='rejected',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='rejected'; v_notify:='recommendation_rejected'; end if;
    v_recipient:=v_rec.sender_id;
  elsif p_action='withdraw' then
    if v_user<>v_rec.sender_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    update app.social_recommendations set response_status='withdrawn',withdrawn_at=now() where id=p_recommendation; v_event:='withdrawn'; v_notify:='recommendation_withdrawn'; v_recipient:=v_rec.recipient_id;
  elsif p_action in ('linked','started','completed') then
    if v_user<>v_rec.recipient_id or v_rec.response_status<>'accepted' then raise exception 'invalid_transition'; end if;
    if p_action='linked' and v_rec.progress_status='none' then update app.social_recommendations set progress_status='linked',already_in_library=coalesce(p_already_in_library,false) where id=p_recommendation;
    elsif p_action='started' and v_rec.progress_status in ('linked','none') then update app.social_recommendations set progress_status='started',started_at=coalesce(started_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status in ('linked','started') then update app.social_recommendations set progress_status='completed',started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status='completed' then return jsonb_build_object('ok',true,'idempotent',true);
    else raise exception 'invalid_transition'; end if;
    v_event:=p_action; v_notify:=case when p_action='started' then 'recommendation_started' when p_action='completed' then 'recommendation_completed' else null end; v_recipient:=v_rec.sender_id;
  else raise exception 'invalid_transition'; end if;
  insert into app.social_recommendation_events(recommendation_id,actor_id,event_type,dedupe_key,safe_metadata)
  values(p_recommendation,v_user,v_event,coalesce(nullif(p_dedupe_key,''),v_event||':'||p_recommendation::text),jsonb_build_object('alreadyInLibrary',coalesce(p_already_in_library,false))) on conflict(recommendation_id,dedupe_key) do nothing;
  if v_notify is not null then perform app.social_insert_notification(v_recipient,v_user,v_notify,'recommendation',p_recommendation,jsonb_build_object('title',v_rec.media_snapshot->>'title'),v_notify||':'||p_recommendation::text); end if;
  if v_event='completed' and coalesce((select share_recommendation_completed from app.social_activity_preferences where user_id=v_user),false) then
    insert into app.social_activity_events(actor_id,event_type,visibility,media_snapshot,source_event_id,dedupe_key)
    values(v_user,'recommendation_completed',coalesce((select default_visibility from app.social_activity_preferences where user_id=v_user),'followers'),v_rec.media_snapshot,'recommendation:'||p_recommendation::text,'recommendation_completed:'||p_recommendation::text)
    on conflict(actor_id,dedupe_key) do nothing;
  end if;
  return jsonb_build_object('ok',true,'recommendationId',p_recommendation,'responseStatus',(select response_status from app.social_recommendations where id=p_recommendation),'progressStatus',(select progress_status from app.social_recommendations where id=p_recommendation),'media',v_rec.media_snapshot);
end;
$$;

create or replace function app.list_social_recommendations(p_box text default 'received',p_status text default 'all',p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_box not in ('received','sent') or p_status not in ('all','pending','deferred','accepted','started','completed','rejected','withdrawn') then raise exception 'invalid_filter'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',r.id,'senderId',r.sender_id,'recipientId',r.recipient_id,'responseStatus',r.response_status,'progressStatus',r.progress_status,'senderNote',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else r.sender_note end,'recipientResponseNote',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else r.recipient_response_note end,'media',r.media_snapshot,'canonicalMediaKey',r.canonical_media_key,'alreadyInLibrary',r.already_in_library,'createdAt',r.created_at,'respondedAt',r.responded_at,'startedAt',r.started_at,'completedAt',r.completed_at,'withdrawnAt',r.withdrawn_at,
      'other',case when app.social_is_blocked(r.sender_id,r.recipient_id) then jsonb_build_object('id',case when r.sender_id=v_user then r.recipient_id else r.sender_id end,'displayName','MediaTracker kullanıcısı') else jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path) end) item
    from app.social_recommendations r join app.profiles p on p.id=case when r.sender_id=v_user then r.recipient_id else r.sender_id end
    where (case when p_box='received' then r.recipient_id=v_user else r.sender_id=v_user end)
      and (p_status='all' or r.response_status=p_status or (p_status in ('started','completed') and r.progress_status=p_status))
      and (p_cursor_created_at is null or (r.created_at,r.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by r.created_at desc,r.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function app.list_social_notifications(p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,30),1),50); v_unread integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select count(*) into v_unread from app.social_notifications where recipient_id=v_user and read_at is null and deleted_at is null;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',n.id,'type',n.notification_type,'entityType',n.entity_type,'entityId',n.entity_id,'payload',n.safe_payload,'createdAt',n.created_at,'readAt',n.read_at,
      'actor',case when n.actor_id is null or app.social_is_blocked(v_user,n.actor_id) then null else jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path) end) item
    from app.social_notifications n left join app.profiles p on p.id=n.actor_id
    where n.recipient_id=v_user and n.deleted_at is null and (p_cursor_created_at is null or (n.created_at,n.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by n.created_at desc,n.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'unreadCount',v_unread,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function app.social_notification_action(p_action text,p_notification uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
begin
  if app.current_user_id() is null then raise exception 'authentication_required'; end if;
  if p_action='read' then update app.social_notifications set read_at=coalesce(read_at,now()) where id=p_notification and recipient_id=app.current_user_id() and deleted_at is null;
  elsif p_action='read_all' then update app.social_notifications set read_at=coalesce(read_at,now()) where recipient_id=app.current_user_id() and read_at is null and deleted_at is null;
  else raise exception 'invalid_notification_action'; end if;
  return jsonb_build_object('ok',true,'unreadCount',(select count(*) from app.social_notifications where recipient_id=app.current_user_id() and read_at is null and deleted_at is null));
end;
$$;

create or replace function app.social_report(p_activity uuid,p_comment uuid,p_category text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_id uuid; v_owner uuid; v_visibility text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if (p_activity is null)::integer+(p_comment is null)::integer<>1 then raise exception 'invalid_target'; end if;
  if p_category not in ('spam','harassment','spoiler','inappropriate','other') or length(coalesce(p_note,''))>500 or coalesce(p_note,'') ~ '[<>]' then raise exception 'invalid_report'; end if;
  if p_activity is not null then
    select actor_id,visibility into v_owner,v_visibility from app.social_activity_events where id=p_activity and deleted_at is null;
  else
    select a.actor_id,a.visibility into v_owner,v_visibility from app.social_activity_comments c join app.social_activity_events a on a.id=c.activity_id where c.id=p_comment and c.deleted_at is null and c.hidden_by_owner_at is null and a.deleted_at is null;
  end if;
  if not found or not app.social_can_view_activity_row(v_owner,v_visibility,v_user) then raise exception 'target_unavailable'; end if;
  insert into app.social_reports(reporter_id,activity_id,comment_id,category,note) values(v_user,p_activity,p_comment,p_category,nullif(btrim(p_note),'')) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
exception when unique_violation then raise exception 'already_reported';
end;
$$;

-- Follow notifications are emitted by the existing relationship actions without changing their contract.
create or replace function app.social_follow(p_target uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_user uuid:=app.current_user_id();
  v_mode text;
  v_status text;
  v_notification_type text;
  v_notification_dedupe_key text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_user=p_target then raise exception 'self_follow_not_allowed'; end if;
  if app.social_is_blocked(v_user,p_target) then raise exception 'profile_unavailable'; end if;
  select visibility_mode into v_mode from app.profiles where id=p_target and deleted_at is null;
  if v_mode is null or v_mode='personal' then raise exception 'profile_unavailable'; end if;
  if exists(select 1 from app.profile_follows where follower_id=v_user and following_id=p_target) then raise exception 'follow_exists'; end if;
  v_status:=case when v_mode='public' then 'accepted' else 'pending' end;
  v_notification_type:=
    case when v_status='accepted' then 'new_follower' else 'follow_request_received' end;
  v_notification_dedupe_key:=
    case when v_status='accepted' then 'new_follower:' else 'follow_request:' end || v_user::text;
  insert into app.profile_follows(follower_id,following_id,status,responded_at) values(v_user,p_target,v_status,case when v_status='accepted' then now() else null end);
  perform app.social_insert_notification(
    p_target,
    v_user,
    v_notification_type,
    'profile',
    v_user,
    '{}'::jsonb,
    v_notification_dedupe_key
  );
  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

create or replace function app.social_follow_action(p_action text,p_other uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_count integer:=0;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_action='unfollow' then delete from app.profile_follows where follower_id=v_user and following_id=p_other and status='accepted';
  elsif p_action='cancel' then delete from app.profile_follows where follower_id=v_user and following_id=p_other and status='pending';
  elsif p_action='accept' then update app.profile_follows set status='accepted',responded_at=now() where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='reject' then delete from app.profile_follows where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='remove_follower' then delete from app.profile_follows where follower_id=p_other and following_id=v_user and status='accepted';
  else raise exception 'invalid_follow_action'; end if;
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'relationship_not_found'; end if;
  if p_action='accept' then perform app.social_insert_notification(p_other,v_user,'follow_request_accepted','profile',v_user,'{}'::jsonb,'follow_accepted:'||v_user::text); end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function app.social_get_preferences() from public;
revoke all on function app.social_ensure_activity_module() from public;
revoke all on function app.social_save_preferences(text,jsonb) from public;
revoke all on function app.social_publish_activity(text,text,jsonb,integer,text,text,text) from public;
revoke all on function app.social_delete_activity(uuid) from public;
revoke all on function app.list_social_feed(timestamptz,uuid,integer) from public;
revoke all on function app.list_profile_activity(uuid,integer) from public;
revoke all on function app.social_comment(uuid,uuid,text,boolean,text) from public;
revoke all on function app.social_comment_action(text,uuid,text,boolean) from public;
revoke all on function app.social_react(uuid,uuid,text) from public;
revoke all on function app.social_send_recommendation(uuid,jsonb,text,text) from public;
revoke all on function app.social_recommendation_transition(uuid,text,text,boolean,text) from public;
revoke all on function app.list_social_recommendations(text,text,timestamptz,uuid,integer) from public;
revoke all on function app.list_social_notifications(timestamptz,uuid,integer) from public;
revoke all on function app.social_notification_action(text,uuid) from public;
revoke all on function app.social_report(uuid,uuid,text,text) from public;

grant execute on function app.social_get_preferences() to mt_runtime;
grant execute on function app.social_save_preferences(text,jsonb) to mt_runtime;
grant execute on function app.social_publish_activity(text,text,jsonb,integer,text,text,text) to mt_runtime;
grant execute on function app.social_delete_activity(uuid) to mt_runtime;
grant execute on function app.list_social_feed(timestamptz,uuid,integer) to mt_runtime;
grant execute on function app.list_profile_activity(uuid,integer) to mt_runtime;
grant execute on function app.social_comment(uuid,uuid,text,boolean,text) to mt_runtime;
grant execute on function app.social_comment_action(text,uuid,text,boolean) to mt_runtime;
grant execute on function app.social_react(uuid,uuid,text) to mt_runtime;
grant execute on function app.social_send_recommendation(uuid,jsonb,text,text) to mt_runtime;
grant execute on function app.social_recommendation_transition(uuid,text,text,boolean,text) to mt_runtime;
grant execute on function app.list_social_recommendations(text,text,timestamptz,uuid,integer) to mt_runtime;
grant execute on function app.list_social_notifications(timestamptz,uuid,integer) to mt_runtime;
grant execute on function app.social_notification_action(text,uuid) to mt_runtime;
grant execute on function app.social_report(uuid,uuid,text,text) to mt_runtime;

revoke insert,update,delete on app.social_activity_events,app.social_activity_comments,app.social_reactions,app.social_recommendations,app.social_recommendation_events,app.social_notifications,app.social_reports from mt_runtime;
revoke all on app.social_activity_preferences,app.social_notification_preferences from mt_runtime;


-- Source 20260721133000_recommendation_feedback_notification_ux.sql sha256 0bf4b58a62441368657fe3343b39f6ab4e2459330de881c6a9f60301dd503c61
-- Recommendation feedback and notification UX

alter table app.social_notifications drop constraint if exists social_notifications_type_check;
alter table app.social_notifications add constraint social_notifications_type_check check (
  notification_type in (
    'follow_request_received','follow_request_accepted','new_follower',
    'activity_comment','comment_reply','activity_reaction','comment_reaction',
    'recommendation_received','recommendation_accepted','recommendation_deferred',
    'recommendation_started','recommendation_completed','recommendation_withdrawn',
    'recommendation_rejected','recommendation_message'
  )
);

create table if not exists app.social_recommendation_messages (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references app.social_recommendations(id) on delete cascade,
  author_id uuid not null references app.profiles(id) on delete cascade,
  body text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_recommendation_messages_body_check check (length(btrim(body)) between 1 and 500 and body !~ '[<>]'),
  constraint social_recommendation_messages_dedupe_check check (length(dedupe_key) between 1 and 220),
  unique(author_id,dedupe_key)
);

create index if not exists social_recommendation_messages_thread_idx
  on app.social_recommendation_messages(recommendation_id,created_at,id);

alter table app.social_recommendation_messages enable row level security;

drop policy if exists social_recommendation_messages_participants_select on app.social_recommendation_messages;
create policy social_recommendation_messages_participants_select on app.social_recommendation_messages
for select using (
  deleted_at is null and exists (
    select 1 from app.social_recommendations r
    where r.id=recommendation_id and app.current_user_id() in (r.sender_id,r.recipient_id)
  )
);

drop policy if exists social_recommendation_messages_participants_insert on app.social_recommendation_messages;
create policy social_recommendation_messages_participants_insert on app.social_recommendation_messages
for insert with check (
  author_id=app.current_user_id() and exists (
    select 1 from app.social_recommendations r
    where r.id=recommendation_id
      and app.current_user_id() in (r.sender_id,r.recipient_id)
      and not app.social_is_blocked(r.sender_id,r.recipient_id)
  )
);

create or replace function app.social_notification_allowed(p_recipient uuid,p_type text)
returns boolean language sql stable security definer set search_path=pg_catalog,app,pg_temp as $$
  select case
    when p_type in ('follow_request_received','follow_request_accepted','new_follower') then coalesce((select follow_notifications from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_comment','comment_reply') then coalesce((select comment_notifications from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_reaction','comment_reaction') then coalesce((select reaction_notifications from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('recommendation_received','recommendation_message') then coalesce((select recommendation_received from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('recommendation_accepted','recommendation_deferred') then coalesce((select recommendation_accepted from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_started' then coalesce((select recommendation_started from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_completed' then coalesce((select recommendation_completed from app.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_rejected' then coalesce((select recommendation_rejected from app.social_notification_preferences where user_id=p_recipient),false)
    when p_type='recommendation_withdrawn' then coalesce((select recommendation_withdrawn from app.social_notification_preferences where user_id=p_recipient),true)
    else false end;
$$;
revoke all on function app.social_notification_allowed(uuid,text) from public;

create or replace function app.social_insert_recommendation_message(
  p_recommendation uuid,
  p_author uuid,
  p_body text,
  p_dedupe_key text,
  p_allow_rejected_response boolean default false
) returns uuid language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_rec app.social_recommendations%rowtype;
  v_id uuid;
  v_recipient uuid;
begin
  select * into v_rec from app.social_recommendations where id=p_recommendation for update;
  if not found or p_author not in (v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if app.social_is_blocked(v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if length(btrim(coalesce(p_body,''))) not between 1 and 500 or coalesce(p_body,'') ~ '[<>]' then raise exception 'invalid_recommendation_message'; end if;
  if length(coalesce(p_dedupe_key,'')) not between 1 and 220 then raise exception 'invalid_dedupe_key'; end if;
  if v_rec.response_status in ('rejected','withdrawn') and not (p_allow_rejected_response and v_rec.response_status='rejected' and p_author=v_rec.recipient_id) then
    raise exception 'recommendation_thread_closed';
  end if;
  if (select count(*) from app.social_recommendation_messages where author_id=p_author and created_at>=now()-interval '1 hour')>=30 then raise exception 'rate_limit'; end if;
  insert into app.social_recommendation_messages(recommendation_id,author_id,body,dedupe_key)
  values(p_recommendation,p_author,btrim(p_body),p_dedupe_key)
  on conflict(author_id,dedupe_key) do update set body=app.social_recommendation_messages.body
  returning id into v_id;
  v_recipient:=case when p_author=v_rec.sender_id then v_rec.recipient_id else v_rec.sender_id end;
  perform app.social_insert_notification(
    v_recipient,p_author,'recommendation_message','recommendation',p_recommendation,
    jsonb_build_object('title',v_rec.media_snapshot->>'title'),
    'recommendation_message:'||v_id::text
  );
  return v_id;
end;
$$;
revoke all on function app.social_insert_recommendation_message(uuid,uuid,text,text,boolean) from public;

create or replace function app.social_send_recommendation_message(p_recommendation uuid,p_body text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  v_id:=app.social_insert_recommendation_message(p_recommendation,v_user,p_body,p_dedupe_key,false);
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

drop function if exists app.social_recommendation_transition(uuid,text,text,boolean,text);
create function app.social_recommendation_transition(
  p_recommendation uuid,
  p_action text,
  p_response_note text default null,
  p_already_in_library boolean default false,
  p_dedupe_key text default null,
  p_response_message text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_rec app.social_recommendations%rowtype; v_event text; v_notify text; v_recipient uuid; v_message_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from app.social_recommendations where id=p_recommendation for update;
  if not found then raise exception 'recommendation_not_found'; end if;
  if app.social_is_blocked(v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if length(coalesce(p_response_note,''))>300 or coalesce(p_response_note,'') ~ '[<>]' then raise exception 'invalid_response_note'; end if;
  if p_response_message is not null and (length(btrim(p_response_message)) not between 1 and 500 or p_response_message ~ '[<>]') then raise exception 'invalid_recommendation_message'; end if;
  if p_action in ('accept','defer','reject') then
    if v_user<>v_rec.recipient_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    if p_action='accept' then update app.social_recommendations set response_status='accepted',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='accepted'; v_notify:='recommendation_accepted';
    elsif p_action='defer' then update app.social_recommendations set response_status='deferred',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='deferred'; v_notify:='recommendation_deferred';
    else update app.social_recommendations set response_status='rejected',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='rejected'; v_notify:='recommendation_rejected'; end if;
    v_recipient:=v_rec.sender_id;
  elsif p_action='withdraw' then
    if v_user<>v_rec.sender_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    update app.social_recommendations set response_status='withdrawn',withdrawn_at=now() where id=p_recommendation; v_event:='withdrawn'; v_notify:='recommendation_withdrawn'; v_recipient:=v_rec.recipient_id;
  elsif p_action in ('linked','started','completed') then
    if v_user<>v_rec.recipient_id or v_rec.response_status<>'accepted' then raise exception 'invalid_transition'; end if;
    if p_action='linked' and v_rec.progress_status='none' then update app.social_recommendations set progress_status='linked',already_in_library=coalesce(p_already_in_library,false) where id=p_recommendation;
    elsif p_action='started' and v_rec.progress_status in ('linked','none') then update app.social_recommendations set progress_status='started',started_at=coalesce(started_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status in ('linked','started') then update app.social_recommendations set progress_status='completed',started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status='completed' then return jsonb_build_object('ok',true,'idempotent',true);
    else raise exception 'invalid_transition'; end if;
    v_event:=p_action; v_notify:=case when p_action='started' then 'recommendation_started' when p_action='completed' then 'recommendation_completed' else null end; v_recipient:=v_rec.sender_id;
  else raise exception 'invalid_transition'; end if;
  insert into app.social_recommendation_events(recommendation_id,actor_id,event_type,dedupe_key,safe_metadata)
  values(p_recommendation,v_user,v_event,coalesce(nullif(p_dedupe_key,''),v_event||':'||p_recommendation::text),jsonb_build_object('alreadyInLibrary',coalesce(p_already_in_library,false))) on conflict(recommendation_id,dedupe_key) do nothing;
  if v_notify is not null then perform app.social_insert_notification(v_recipient,v_user,v_notify,'recommendation',p_recommendation,jsonb_build_object('title',v_rec.media_snapshot->>'title'),v_notify||':'||p_recommendation::text); end if;
  if nullif(btrim(coalesce(p_response_message,'')),'') is not null then
    if p_action not in ('accept','defer','reject') then raise exception 'response_message_not_allowed'; end if;
    v_message_id:=app.social_insert_recommendation_message(p_recommendation,v_user,p_response_message,'response:'||coalesce(nullif(p_dedupe_key,''),v_event||':'||p_recommendation::text),p_action='reject');
  end if;
  if v_event='completed' and coalesce((select share_recommendation_completed from app.social_activity_preferences where user_id=v_user),false) then
    insert into app.social_activity_events(actor_id,event_type,visibility,media_snapshot,source_event_id,dedupe_key)
    values(v_user,'recommendation_completed',coalesce((select default_visibility from app.social_activity_preferences where user_id=v_user),'followers'),v_rec.media_snapshot,'recommendation:'||p_recommendation::text,'recommendation_completed:'||p_recommendation::text)
    on conflict(actor_id,dedupe_key) do nothing;
  end if;
  return jsonb_build_object('ok',true,'recommendationId',p_recommendation,'responseStatus',(select response_status from app.social_recommendations where id=p_recommendation),'progressStatus',(select progress_status from app.social_recommendations where id=p_recommendation),'messageId',v_message_id,'media',v_rec.media_snapshot);
end;
$$;

create or replace function app.list_social_recommendations(p_box text default 'received',p_status text default 'all',p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_box not in ('received','sent') or p_status not in ('all','pending','deferred','accepted','started','completed','rejected','withdrawn') then raise exception 'invalid_filter'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',r.id,'senderId',r.sender_id,'recipientId',r.recipient_id,'responseStatus',r.response_status,'progressStatus',r.progress_status,'senderNote',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else r.sender_note end,'recipientResponseNote',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else r.recipient_response_note end,'media',r.media_snapshot,'canonicalMediaKey',r.canonical_media_key,'alreadyInLibrary',r.already_in_library,'createdAt',r.created_at,'updatedAt',greatest(r.created_at,coalesce(r.responded_at,r.created_at),coalesce(r.started_at,r.created_at),coalesce(r.completed_at,r.created_at),coalesce(r.withdrawn_at,r.created_at)),'respondedAt',r.responded_at,'startedAt',r.started_at,'completedAt',r.completed_at,'withdrawnAt',r.withdrawn_at,
      'lastEvent',(select jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.created_at) from app.social_recommendation_events e where e.recommendation_id=r.id order by e.created_at desc,e.id desc limit 1),
      'lastMessagePreview',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else (select jsonb_build_object('body',case when m.deleted_at is null then m.body else null end,'authorId',m.author_id,'createdAt',m.created_at) from app.social_recommendation_messages m where m.recommendation_id=r.id order by m.created_at desc,m.id desc limit 1) end,
      'unreadMessageCount',(select count(*) from app.social_notifications n where n.recipient_id=v_user and n.notification_type='recommendation_message' and n.entity_id=r.id and n.read_at is null and n.deleted_at is null),
      'other',case when app.social_is_blocked(r.sender_id,r.recipient_id) then jsonb_build_object('id',case when r.sender_id=v_user then r.recipient_id else r.sender_id end,'displayName','MediaTracker kullanıcısı') else jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path) end) item
    from app.social_recommendations r join app.profiles p on p.id=case when r.sender_id=v_user then r.recipient_id else r.sender_id end
    where (case when p_box='received' then r.recipient_id=v_user else r.sender_id=v_user end)
      and (p_status='all' or r.response_status=p_status or (p_status in ('started','completed') and r.progress_status=p_status))
      and (p_cursor_created_at is null or (r.created_at,r.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by r.created_at desc,r.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function app.get_social_recommendation_detail(p_recommendation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_rec app.social_recommendations%rowtype; v_messages jsonb; v_events jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from app.social_recommendations where id=p_recommendation;
  if not found or v_user not in (v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',case when m.deleted_at is null then m.body else null end,'deleted',m.deleted_at is not null,'createdAt',m.created_at,'author',jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path)) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages from app.social_recommendation_messages m join app.profiles p on p.id=m.author_id where m.recommendation_id=p_recommendation;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb)
  into v_events from app.social_recommendation_events e where e.recommendation_id=p_recommendation;
  return jsonb_build_object('messages',v_messages,'events',v_events,'threadOpen',v_rec.response_status not in ('rejected','withdrawn'));
end;
$$;

drop function if exists app.social_notification_action(text,uuid);
create function app.social_notification_action(p_action text,p_notification uuid default null,p_entity_type text default null,p_entity_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
begin
  if app.current_user_id() is null then raise exception 'authentication_required'; end if;
  if p_action='read' then
    update app.social_notifications set read_at=coalesce(read_at,now()) where id=p_notification and recipient_id=app.current_user_id() and deleted_at is null;
  elsif p_action='read_all' then
    update app.social_notifications set read_at=coalesce(read_at,now()) where recipient_id=app.current_user_id() and read_at is null and deleted_at is null;
  elsif p_action='mark_entity_read' then
    if p_entity_type not in ('profile','activity','comment','recommendation') or p_entity_id is null then raise exception 'invalid_notification_entity'; end if;
    update app.social_notifications n set read_at=coalesce(n.read_at,now())
    where n.recipient_id=app.current_user_id() and n.read_at is null and n.deleted_at is null and (
      (n.entity_type=p_entity_type and n.entity_id=p_entity_id)
      or (p_entity_type='activity' and n.entity_type='comment' and (
        n.safe_payload->>'activityId'=p_entity_id::text
        or exists(select 1 from app.social_activity_comments c where c.id=n.entity_id and c.activity_id=p_entity_id)
      ))
    );
  else raise exception 'invalid_notification_action'; end if;
  return jsonb_build_object('ok',true,'unreadCount',(select count(*) from app.social_notifications where recipient_id=app.current_user_id() and read_at is null and deleted_at is null));
end;
$$;

create or replace function app.get_social_person_summary(p_target uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_viewer uuid:=app.current_user_id(); v_viewer_color text:='neutral'; v_result jsonb;
begin
  if v_viewer is null then raise exception 'authentication_required'; end if;
  select coalesce(connection_color,'neutral') into v_viewer_color from app.profiles where id=v_viewer;
  select jsonb_build_object(
    'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'bio',left(p.bio,160),
    'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'avatarPath',p.avatar_path,
    'anonymous',false,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
    'viewerFollowsOwner',(select f.status from app.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
    'ownerFollowsViewer',(select f.status from app.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
  ) into v_result
  from app.profiles p
  where p.id=p_target and p.deleted_at is null and p.visibility_mode in ('public','protected') and not app.social_is_blocked(v_viewer,p.id);
  return v_result;
end;
$$;

revoke all on function app.social_send_recommendation_message(uuid,text,text) from public;
revoke all on function app.social_recommendation_transition(uuid,text,text,boolean,text,text) from public;
revoke all on function app.get_social_recommendation_detail(uuid) from public;
revoke all on function app.social_notification_action(text,uuid,text,uuid) from public;
revoke all on function app.get_social_person_summary(uuid) from public;

grant execute on function app.social_send_recommendation_message(uuid,text,text) to mt_runtime;
grant execute on function app.social_recommendation_transition(uuid,text,text,boolean,text,text) to mt_runtime;
grant execute on function app.get_social_recommendation_detail(uuid) to mt_runtime;
grant execute on function app.social_notification_action(text,uuid,text,uuid) to mt_runtime;
grant execute on function app.get_social_person_summary(uuid) to mt_runtime;

revoke insert,update,delete on app.social_recommendation_messages from mt_runtime;


-- Source 20260721134500_recommendation_listing_regression_fix.sql sha256 6ea1175b90a94309117891e389ca70657a041869882ed2fdb5fa7f046bd46be6
-- Restore backward-compatible recommendation listing after feedback enrichment.

create or replace function app.list_social_recommendations(p_box text default 'received',p_status text default 'all',p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_box not in ('received','sent') or p_status not in ('all','pending','deferred','accepted','started','completed','rejected','withdrawn') then raise exception 'invalid_filter'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id',r.id,'senderId',r.sender_id,'recipientId',r.recipient_id,'responseStatus',r.response_status,'progressStatus',r.progress_status,
      'senderNote',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else r.sender_note end,
      'recipientResponseNote',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else r.recipient_response_note end,
      'media',r.media_snapshot,'canonicalMediaKey',r.canonical_media_key,'alreadyInLibrary',r.already_in_library,
      'createdAt',r.created_at,'updatedAt',greatest(r.created_at,coalesce(r.responded_at,r.created_at),coalesce(r.started_at,r.created_at),coalesce(r.completed_at,r.created_at),coalesce(r.withdrawn_at,r.created_at)),
      'respondedAt',r.responded_at,'startedAt',r.started_at,'completedAt',r.completed_at,'withdrawnAt',r.withdrawn_at,
      'lastEvent',(select jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.occurred_at) from app.social_recommendation_events e where e.recommendation_id=r.id order by e.occurred_at desc,e.id desc limit 1),
      'lastMessagePreview',case when app.social_is_blocked(r.sender_id,r.recipient_id) then null else (select jsonb_build_object('body',case when m.deleted_at is null then m.body else null end,'authorId',m.author_id,'createdAt',m.created_at) from app.social_recommendation_messages m where m.recommendation_id=r.id order by m.created_at desc,m.id desc limit 1) end,
      'unreadMessageCount',(select count(*) from app.social_notifications n where n.recipient_id=v_user and n.notification_type='recommendation_message' and n.entity_id=r.id and n.read_at is null and n.deleted_at is null),
      'other',case when app.social_is_blocked(r.sender_id,r.recipient_id)
        then jsonb_build_object('id',case when r.sender_id=v_user then r.recipient_id else r.sender_id end,'displayName','MediaTracker kullanıcısı')
        else jsonb_build_object('id',case when r.sender_id=v_user then r.recipient_id else r.sender_id end,'username',p.username,'displayName',coalesce(p.display_name,p.username,'MediaTracker kullanıcısı'),'avatarPath',p.avatar_path)
      end
    ) item
    from app.social_recommendations r
    left join app.profiles p on p.id=case when r.sender_id=v_user then r.recipient_id else r.sender_id end
    where (case when p_box='received' then r.recipient_id=v_user else r.sender_id=v_user end)
      and (p_status='all' or (p_status in ('started','completed') and r.progress_status=p_status) or (p_status not in ('started','completed') and r.response_status=p_status))
      and (p_cursor_created_at is null or (r.created_at,r.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by r.created_at desc,r.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function app.get_social_recommendation_detail(p_recommendation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_rec app.social_recommendations%rowtype; v_messages jsonb; v_events jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from app.social_recommendations where id=p_recommendation;
  if not found or v_user not in (v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',case when m.deleted_at is null then m.body else null end,'deleted',m.deleted_at is not null,'createdAt',m.created_at,'author',jsonb_build_object('id',m.author_id,'username',p.username,'displayName',coalesce(p.display_name,p.username,'MediaTracker kullanıcısı'),'avatarPath',p.avatar_path)) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages from app.social_recommendation_messages m left join app.profiles p on p.id=m.author_id where m.recommendation_id=p_recommendation;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.occurred_at) order by e.occurred_at,e.id),'[]'::jsonb)
  into v_events from app.social_recommendation_events e where e.recommendation_id=p_recommendation;
  return jsonb_build_object('messages',v_messages,'events',v_events,'threadOpen',v_rec.response_status not in ('rejected','withdrawn'));
end;
$$;

grant execute on function app.list_social_recommendations(text,text,timestamptz,uuid,integer) to mt_runtime;
grant execute on function app.get_social_recommendation_detail(uuid) to mt_runtime;


-- Source 20260721140000_xp_v2_progression.sql sha256 8bd95cd9a02c08df11fea2c28920c44e0d9f0d84dde86c18776ca7fa883dd8b7
-- BEGIN XP V2 PROGRESSION
create table if not exists app.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  event_type text not null check (event_type in (
    'media_started','media_completed','media_rated','review_published','showcase_curated',
    'recommendation_completed_recipient','recommendation_completed_sender',
    'recommendation_completion_feedback','legacy_import','quest_completed','reversal'
  )),
  trust_level text not null check (trust_level in ('local_attested','social_verified','legacy_attested','system')),
  source_type text not null,
  source_id text,
  canonical_key text,
  dedupe_key text not null,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id,dedupe_key)
);

create table if not exists app.xp_event_allocations (
  event_id uuid not null references app.xp_events(id) on delete restrict,
  axis_type text not null check (axis_type in ('general','world','branch')),
  axis_key text not null,
  amount integer not null check (amount > 0),
  primary key(event_id,axis_type,axis_key),
  check (
    (axis_type='general' and axis_key='general') or
    (axis_type='world' and axis_key in ('east','screen','arch')) or
    (axis_type='branch' and axis_key in ('tracker','explorer','critic','curator','connector'))
  )
);

create table if not exists app.xp_user_totals (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  level integer not null default 1 check (level >= 1),
  current_level_start_xp bigint not null default 0,
  next_level_start_xp bigint not null default 100,
  updated_at timestamptz not null default now(),
  version integer not null default 2
);

create table if not exists app.xp_user_world_totals (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  world_key text not null check (world_key in ('east','screen','arch')),
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  tier text not null default 'basic' check (tier in ('basic','refined','elite','master')),
  title text not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,world_key)
);

create table if not exists app.xp_user_branch_totals (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  branch_key text not null check (branch_key in ('tracker','explorer','critic','curator','connector')),
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  tier text not null default 'basic' check (tier in ('basic','refined','elite','master')),
  updated_at timestamptz not null default now(),
  primary key(user_id,branch_key)
);

create table if not exists app.xp_legacy_imports (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  event_id uuid unique references app.xp_events(id) on delete restrict,
  aggregate jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists app.xp_quest_definitions (
  quest_key text primary key,
  name text not null,
  description text not null,
  target integer not null check (target > 0),
  reward_xp integer not null check (reward_xp >= 0),
  badge_key text,
  active boolean not null default true,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app.xp_user_quest_progress (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  quest_key text not null references app.xp_quest_definitions(quest_key) on delete restrict,
  current_value integer not null default 0 check (current_value >= 0),
  completed_at timestamptz,
  reward_event_id uuid references app.xp_events(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key(user_id,quest_key)
);

create table if not exists app.xp_badge_definitions (
  badge_key text primary key,
  name text not null,
  description text not null,
  icon_key text not null,
  tier text not null check (tier in ('basic','refined','elite','master')),
  created_at timestamptz not null default now()
);

create table if not exists app.xp_user_badges (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  badge_key text not null references app.xp_badge_definitions(badge_key) on delete restrict,
  awarded_at timestamptz not null default now(),
  source_event_id uuid references app.xp_events(id) on delete restrict,
  selected boolean not null default false,
  display_order smallint,
  primary key(user_id,badge_key),
  check (display_order is null or display_order between 0 and 4)
);

create index if not exists xp_events_user_recorded_idx on app.xp_events(user_id,recorded_at desc,id desc);
create index if not exists xp_events_daily_idx on app.xp_events(user_id,event_type,recorded_at desc);
create index if not exists xp_allocations_event_idx on app.xp_event_allocations(event_id);

alter table app.xp_events enable row level security;
alter table app.xp_event_allocations enable row level security;
alter table app.xp_user_totals enable row level security;
alter table app.xp_user_world_totals enable row level security;
alter table app.xp_user_branch_totals enable row level security;
alter table app.xp_legacy_imports enable row level security;
alter table app.xp_quest_definitions enable row level security;
alter table app.xp_user_quest_progress enable row level security;
alter table app.xp_badge_definitions enable row level security;
alter table app.xp_user_badges enable row level security;

drop policy if exists xp_events_select_own on app.xp_events;
create policy xp_events_select_own on app.xp_events for select to mt_runtime using (user_id=app.current_user_id());
drop policy if exists xp_allocations_select_own on app.xp_event_allocations;
create policy xp_allocations_select_own on app.xp_event_allocations for select to mt_runtime using (exists(select 1 from app.xp_events e where e.id=event_id and e.user_id=app.current_user_id()));
drop policy if exists xp_totals_select_own on app.xp_user_totals;
create policy xp_totals_select_own on app.xp_user_totals for select to mt_runtime using (user_id=app.current_user_id());
drop policy if exists xp_world_totals_select_own on app.xp_user_world_totals;
create policy xp_world_totals_select_own on app.xp_user_world_totals for select to mt_runtime using (user_id=app.current_user_id());
drop policy if exists xp_branch_totals_select_own on app.xp_user_branch_totals;
create policy xp_branch_totals_select_own on app.xp_user_branch_totals for select to mt_runtime using (user_id=app.current_user_id());
drop policy if exists xp_legacy_select_own on app.xp_legacy_imports;
create policy xp_legacy_select_own on app.xp_legacy_imports for select to mt_runtime using (user_id=app.current_user_id());
drop policy if exists xp_quest_definitions_read on app.xp_quest_definitions;
create policy xp_quest_definitions_read on app.xp_quest_definitions for select to mt_runtime using (true);
drop policy if exists xp_quest_progress_select_own on app.xp_user_quest_progress;
create policy xp_quest_progress_select_own on app.xp_user_quest_progress for select to mt_runtime using (user_id=app.current_user_id());
drop policy if exists xp_badge_definitions_read on app.xp_badge_definitions;
create policy xp_badge_definitions_read on app.xp_badge_definitions for select to mt_runtime using (true);
drop policy if exists xp_user_badges_select_own on app.xp_user_badges;
create policy xp_user_badges_select_own on app.xp_user_badges for select to mt_runtime using (user_id=app.current_user_id());

revoke insert,update,delete on app.xp_events,app.xp_event_allocations,app.xp_user_totals,app.xp_user_world_totals,app.xp_user_branch_totals,app.xp_legacy_imports,app.xp_user_quest_progress,app.xp_user_badges from mt_runtime;
grant select on app.xp_events,app.xp_event_allocations,app.xp_user_totals,app.xp_user_world_totals,app.xp_user_branch_totals,app.xp_legacy_imports,app.xp_user_quest_progress,app.xp_user_badges to mt_runtime;
grant select on app.xp_quest_definitions,app.xp_badge_definitions to mt_runtime;

create or replace function app.xp_general_level(p_xp bigint)
returns integer language sql immutable set search_path=pg_catalog,app,pg_temp as $$
  select floor(sqrt(greatest(coalesce(p_xp,0),0)::numeric/100))::integer+1;
$$;

create or replace function app.xp_world_level(p_xp bigint)
returns integer language sql immutable set search_path=pg_catalog,app,pg_temp as $$
  select floor(sqrt(greatest(coalesce(p_xp,0),0)::numeric/75))::integer+1;
$$;

create or replace function app.xp_tier(p_level integer)
returns text language sql immutable set search_path=pg_catalog,app,pg_temp as $$
  select case when p_level>=21 then 'master' when p_level>=11 then 'elite' when p_level>=6 then 'refined' else 'basic' end;
$$;

create or replace function app.xp_world_title(p_world text,p_level integer)
returns text language sql immutable set search_path=pg_catalog,app,pg_temp as $$
  select case p_world
    when 'east' then case when p_level>=21 then 'Doğu Ustası' when p_level>=11 then 'Katana Arşivcisi' when p_level>=6 then 'Mürekkep İzleyicisi' else 'Doğu Yolcusu' end
    when 'screen' then case when p_level>=21 then 'Kadraj Ustası' when p_level>=11 then 'Projektör Avcısı' when p_level>=6 then 'Sahne Takipçisi' else 'Kadraj Gezgini' end
    when 'arch' then case when p_level>=21 then 'Arşiv Ustası' when p_level>=11 then 'Mühür Muhafızı' when p_level>=6 then 'Sayfa Toplayıcısı' else 'Arşiv Yolcusu' end
    else 'Yolculuk Başlangıcı' end;
$$;

create or replace function app.xp_world_for_media_type(p_media_type text)
returns text language sql immutable set search_path=pg_catalog,app,pg_temp as $$
  select case
    when lower(p_media_type) in ('anime','manga','manhwa','manhua') then 'east'
    when lower(p_media_type) in ('movie','tv') then 'screen'
    when lower(p_media_type) in ('book','light_novel','web_novel','visual_novel','novel') then 'arch'
    else null end;
$$;

create or replace function app.xp_commitment_bonus(p_total_progress integer)
returns integer language sql immutable set search_path=pg_catalog,app,pg_temp as $$
  select case when p_total_progress is null or p_total_progress<=1 then 0 when p_total_progress<=12 then 3 when p_total_progress<=50 then 7 when p_total_progress<=200 then 10 else 15 end;
$$;

create or replace function app.xp_events_are_immutable()
returns trigger language plpgsql set search_path=pg_catalog,app,pg_temp as $$
begin raise exception 'xp_event_immutable'; end;
$$;
drop trigger if exists xp_events_immutable on app.xp_events;
create trigger xp_events_immutable before update or delete on app.xp_events for each row execute function app.xp_events_are_immutable();
drop trigger if exists xp_allocations_immutable on app.xp_event_allocations;
create trigger xp_allocations_immutable before update or delete on app.xp_event_allocations for each row execute function app.xp_events_are_immutable();

create or replace function app.xp_evaluate_quests(p_user uuid)
returns void language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$ begin return; end; $$;

create or replace function app.xp_apply_event(
  p_user uuid,p_event_type text,p_trust_level text,p_source_type text,p_source_id text,
  p_canonical_key text,p_dedupe_key text,p_metadata jsonb,p_allocations jsonb,p_evaluate boolean default true
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_event uuid; v_allocation jsonb; v_axis text; v_key text; v_amount integer; v_total bigint; v_level integer;
begin
  if p_user is null or length(coalesce(p_dedupe_key,'')) not between 1 and 240 then raise exception 'invalid_xp_event'; end if;
  insert into app.xp_events(user_id,event_type,trust_level,source_type,source_id,canonical_key,dedupe_key,metadata)
  values(p_user,p_event_type,p_trust_level,p_source_type,p_source_id,p_canonical_key,p_dedupe_key,coalesce(p_metadata,'{}'::jsonb))
  on conflict(user_id,dedupe_key) do nothing returning id into v_event;
  if v_event is null then
    select id into v_event from app.xp_events where user_id=p_user and dedupe_key=p_dedupe_key;
    return jsonb_build_object('ok',true,'idempotent',true,'eventId',v_event);
  end if;
  if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception 'invalid_xp_allocations'; end if;
  for v_allocation in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    v_axis:=v_allocation->>'axisType'; v_key:=v_allocation->>'axisKey';
    if jsonb_typeof(v_allocation->'amount')<>'number' then raise exception 'invalid_xp_allocation'; end if;
    v_amount:=(v_allocation->>'amount')::integer;
    insert into app.xp_event_allocations(event_id,axis_type,axis_key,amount) values(v_event,v_axis,v_key,v_amount);
    if v_axis='general' then
      insert into app.xp_user_totals(user_id,total_xp) values(p_user,v_amount)
      on conflict(user_id) do update set total_xp=app.xp_user_totals.total_xp+excluded.total_xp,updated_at=now();
    elsif v_axis='world' then
      insert into app.xp_user_world_totals(user_id,world_key,xp,level,tier,title)
      values(p_user,v_key,v_amount,app.xp_world_level(v_amount),app.xp_tier(app.xp_world_level(v_amount)),app.xp_world_title(v_key,app.xp_world_level(v_amount)))
      on conflict(user_id,world_key) do update set xp=app.xp_user_world_totals.xp+excluded.xp,updated_at=now();
    elsif v_axis='branch' then
      insert into app.xp_user_branch_totals(user_id,branch_key,xp,level,tier)
      values(p_user,v_key,v_amount,app.xp_world_level(v_amount),app.xp_tier(app.xp_world_level(v_amount)))
      on conflict(user_id,branch_key) do update set xp=app.xp_user_branch_totals.xp+excluded.xp,updated_at=now();
    end if;
  end loop;
  select total_xp into v_total from app.xp_user_totals where user_id=p_user;
  v_level:=app.xp_general_level(coalesce(v_total,0));
  update app.xp_user_totals set level=v_level,current_level_start_xp=((v_level-1)::bigint*(v_level-1)*100),next_level_start_xp=(v_level::bigint*v_level*100),updated_at=now() where user_id=p_user;
  update app.xp_user_world_totals set level=app.xp_world_level(xp),tier=app.xp_tier(app.xp_world_level(xp)),title=app.xp_world_title(world_key,app.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  update app.xp_user_branch_totals set level=app.xp_world_level(xp),tier=app.xp_tier(app.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  if p_evaluate then perform app.xp_evaluate_quests(p_user); end if;
  return jsonb_build_object('ok',true,'idempotent',false,'eventId',v_event,'totalXp',coalesce(v_total,0),'level',v_level);
end;
$$;
revoke all on function app.xp_apply_event(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public;

insert into app.xp_badge_definitions(badge_key,name,description,icon_key,tier) values
('three_worlds','Üç Dünya Gezgini','Üç dünyanın her birinde bir medya tamamladı.','globe-2','refined'),
('open_to_advice','Tavsiyeye Açık','Bir arkadaş tavsiyesini tamamladı.','hand-heart','basic'),
('accurate_recommendation','İsabetli Öneri','Gönderdiği bir tavsiye tamamlandı.','target','basic'),
('showcase_curator','Vitrin Küratörü','Beş benzersiz medya öğesini vitrine ekledi.','gallery-horizontal-end','basic'),
('first_final','İlk Final','İlk medyasını tamamladı.','badge-check','basic')
on conflict(badge_key) do update set name=excluded.name,description=excluded.description,icon_key=excluded.icon_key,tier=excluded.tier;

insert into app.xp_quest_definitions(quest_key,name,description,target,reward_xp,badge_key,active,criteria) values
('first_trace','İlk İz','Bir medyaya başla.',1,10,null,true,'{"eventType":"media_started"}'::jsonb),
('first_final','İlk Final','Bir medya tamamla.',1,20,'first_final',true,'{"eventType":"media_completed"}'::jsonb),
('three_worlds','Üç Dünya','Doğu, Kadraj ve Arşiv’den en az birer medya tamamla.',3,40,'three_worlds',true,'{"distinctCompletedWorlds":3}'::jsonb),
('friend_advice','Dost Tavsiyesi','Bir arkadaş tavsiyesini tamamla.',1,25,'open_to_advice',true,'{"eventType":"recommendation_completed_recipient"}'::jsonb),
('recommendation_found','Önerin Yerini Buldu','Gönderdiğin bir tavsiye tamamlandı.',1,25,'accurate_recommendation',true,'{"eventType":"recommendation_completed_sender"}'::jsonb),
('critical_view','Eleştirel Bakış','Beş medyayı puanla ve anlamlı bir değerlendirme yayımla.',5,0,null,false,'{"rated":5,"review":1}'::jsonb),
('profile_curator','Profil Küratörü','Beş benzersiz medya öğesini vitrine ekle.',5,15,'showcase_curator',true,'{"eventType":"showcase_curated"}'::jsonb)
on conflict(quest_key) do update set name=excluded.name,description=excluded.description,target=excluded.target,reward_xp=excluded.reward_xp,badge_key=excluded.badge_key,active=excluded.active,criteria=excluded.criteria;

create or replace function app.xp_evaluate_quests(p_user uuid)
returns void language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_quest app.xp_quest_definitions%rowtype; v_value integer; v_existing timestamptz; v_reward jsonb; v_reward_id uuid;
begin
  for v_quest in select * from app.xp_quest_definitions where active order by quest_key loop
    if v_quest.quest_key='three_worlds' then
      select count(distinct metadata->>'world')::integer into v_value from app.xp_events where user_id=p_user and event_type='media_completed' and metadata->>'world' in ('east','screen','arch');
    else
      select count(*)::integer into v_value from app.xp_events where user_id=p_user and event_type=v_quest.criteria->>'eventType';
    end if;
    select completed_at into v_existing from app.xp_user_quest_progress where user_id=p_user and quest_key=v_quest.quest_key;
    insert into app.xp_user_quest_progress(user_id,quest_key,current_value,completed_at)
    values(p_user,v_quest.quest_key,least(v_value,v_quest.target),case when v_value>=v_quest.target then coalesce(v_existing,now()) else null end)
    on conflict(user_id,quest_key) do update set current_value=excluded.current_value,completed_at=coalesce(app.xp_user_quest_progress.completed_at,excluded.completed_at),updated_at=now();
    if v_value>=v_quest.target and v_existing is null then
      v_reward:=app.xp_apply_event(p_user,'quest_completed','system','quest',v_quest.quest_key,null,'quest:'||v_quest.quest_key,jsonb_build_object('questKey',v_quest.quest_key),case when v_quest.reward_xp>0 then jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_quest.reward_xp)) else '[]'::jsonb end,false);
      v_reward_id:=(v_reward->>'eventId')::uuid;
      update app.xp_user_quest_progress set reward_event_id=v_reward_id where user_id=p_user and quest_key=v_quest.quest_key;
      if v_quest.badge_key is not null then insert into app.xp_user_badges(user_id,badge_key,source_event_id) values(p_user,v_quest.badge_key,v_reward_id) on conflict(user_id,badge_key) do nothing; end if;
    end if;
  end loop;
end;
$$;
revoke all on function app.xp_evaluate_quests(uuid) from public;

create or replace function app.xp_attest_local_event(p_event_type text,p_canonical_key text,p_media jsonb,p_total_progress integer default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_world text; v_limit integer; v_count integer; v_general integer; v_bonus integer:=0; v_allocations jsonb; v_expected text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_event_type not in ('media_started','media_completed','media_rated') then raise exception 'unsupported_local_xp_event'; end if;
  if jsonb_typeof(p_media)<>'object' or length(btrim(coalesce(p_media->>'title',''))) not between 1 and 200 or length(coalesce(p_canonical_key,'')) not between 3 and 220 then raise exception 'invalid_media_snapshot'; end if;
  if p_media ?| array['personalNotes','notes','dataUrl','reviewText'] or coalesce(p_media->>'coverUrl','') like 'data:%' then raise exception 'unsafe_media_snapshot'; end if;
  v_world:=app.xp_world_for_media_type(p_media->>'mediaType'); if v_world is null then raise exception 'invalid_media_world'; end if;
  v_expected:=p_event_type||':'||v_user::text||':'||lower(p_canonical_key);
  if p_idempotency_key is not null and p_idempotency_key<>v_expected then raise exception 'invalid_idempotency_key'; end if;
  if exists(select 1 from app.xp_events where user_id=v_user and dedupe_key=v_expected) then return jsonb_build_object('ok',true,'idempotent',true,'reason','already_recorded'); end if;
  v_limit:=case p_event_type when 'media_started' then 5 when 'media_completed' then 10 when 'media_rated' then 10 end;
  select count(*) into v_count from app.xp_events where user_id=v_user and event_type=p_event_type and recorded_at>=date_trunc('day',now()) and recorded_at<date_trunc('day',now())+interval '1 day';
  if v_count>=v_limit then return jsonb_build_object('ok',false,'reason','daily_limit','retryable',false); end if;
  if p_event_type='media_started' then v_general:=4; v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',4),jsonb_build_object('axisType','world','axisKey',v_world,'amount',3),jsonb_build_object('axisType','branch','axisKey','tracker','amount',4));
  elsif p_event_type='media_completed' then v_bonus:=app.xp_commitment_bonus(p_total_progress); v_general:=25+v_bonus; v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_general),jsonb_build_object('axisType','world','axisKey',v_world,'amount',20),jsonb_build_object('axisType','branch','axisKey','tracker','amount',15));
  else
    if jsonb_typeof(p_media->'userRating')<>'number' or (p_media->>'userRating')::numeric<0 or (p_media->>'userRating')::numeric>10 then raise exception 'invalid_rating'; end if;
    v_general:=5; v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','critic','amount',5));
  end if;
  return app.xp_apply_event(v_user,p_event_type,'local_attested','media',p_canonical_key,p_canonical_key,v_expected,jsonb_build_object('title',p_media->>'title','mediaType',p_media->>'mediaType','world',v_world,'baseXp',v_general-v_bonus,'commitmentBonus',v_bonus),v_allocations,true);
end;
$$;

create or replace function app.xp_import_legacy(p_media_count integer,p_progress_log_count integer,p_completed_count integer,p_rated_count integer,p_favorite_count integer,p_noted_count integer,p_world_counts jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_total integer; v_world_sum integer; v_event jsonb; v_event_id uuid; v_allocations jsonb; v_world text; v_count integer; v_world_pool integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if exists(select 1 from app.xp_legacy_imports where user_id=v_user) then return jsonb_build_object('ok',true,'idempotent',true,'reason','already_imported'); end if;
  if p_media_count not between 0 and 100000 or p_progress_log_count not between 0 and 1000000 or p_completed_count not between 0 and p_media_count or p_rated_count not between 0 and p_media_count or p_favorite_count not between 0 and p_media_count or p_noted_count not between 0 and p_media_count then raise exception 'invalid_legacy_aggregate'; end if;
  if jsonb_typeof(p_world_counts)<>'object' then raise exception 'invalid_legacy_world_counts'; end if;
  if coalesce((p_world_counts->>'east')::integer,-1)<0 or coalesce((p_world_counts->>'screen')::integer,-1)<0 or coalesce((p_world_counts->>'arch')::integer,-1)<0 then raise exception 'invalid_legacy_world_counts'; end if;
  v_world_sum=(p_world_counts->>'east')::integer+(p_world_counts->>'screen')::integer+(p_world_counts->>'arch')::integer;
  if v_world_sum<>p_media_count then raise exception 'invalid_legacy_world_counts'; end if;
  v_total:=p_media_count*10+p_progress_log_count*5+p_completed_count*30+p_rated_count*8+p_favorite_count*5+p_noted_count*8;
  v_allocations:=case when v_total>0 then jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_total)) else '[]'::jsonb end;
  v_world_pool:=floor(v_total*0.25)::integer;
  if p_media_count>0 and v_world_pool>0 then
    foreach v_world in array array['east','screen','arch'] loop
      v_count:=(p_world_counts->>v_world)::integer;
      if v_count>0 then v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('axisType','world','axisKey',v_world,'amount',greatest(1,floor(v_world_pool::numeric*v_count/p_media_count)::integer))); end if;
    end loop;
  end if;
  v_event:=app.xp_apply_event(v_user,'legacy_import','legacy_attested','legacy_v1',v_user::text,null,'legacy_import:'||v_user::text,jsonb_build_object('aggregate',jsonb_build_object('mediaCount',p_media_count,'progressLogCount',p_progress_log_count,'completedCount',p_completed_count,'ratedCount',p_rated_count,'favoriteCount',p_favorite_count,'notedCount',p_noted_count,'worldCounts',p_world_counts),'branchXpAwarded',false),v_allocations,true);
  v_event_id=(v_event->>'eventId')::uuid;
  insert into app.xp_legacy_imports(user_id,event_id,aggregate) values(v_user,v_event_id,jsonb_build_object('mediaCount',p_media_count,'progressLogCount',p_progress_log_count,'completedCount',p_completed_count,'ratedCount',p_rated_count,'favoriteCount',p_favorite_count,'notedCount',p_noted_count,'worldCounts',p_world_counts));
  return v_event||jsonb_build_object('legacyXp',v_total);
end;
$$;

create or replace function app.xp_award_recommendation_completion(p_recommendation uuid)
returns void language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_rec app.social_recommendations%rowtype; v_world text; v_canonical text; v_count integer;
begin
  select * into v_rec from app.social_recommendations where id=p_recommendation and progress_status='completed'; if not found then return; end if;
  v_world:=app.xp_world_for_media_type(v_rec.media_snapshot->>'mediaType'); v_canonical:=coalesce(v_rec.canonical_media_key,p_recommendation::text);
  select count(*) into v_count from app.xp_events where user_id=v_rec.recipient_id and event_type='recommendation_completed_recipient' and recorded_at>=date_trunc('day',now());
  if v_count<5 then perform app.xp_apply_event(v_rec.recipient_id,'recommendation_completed_recipient','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_recipient:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title','world',v_world),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',20),jsonb_build_object('axisType','branch','axisKey','explorer','amount',12),jsonb_build_object('axisType','branch','axisKey','connector','amount',8))||case when v_world is not null then jsonb_build_array(jsonb_build_object('axisType','world','axisKey',v_world,'amount',10)) else '[]'::jsonb end,true); end if;
  select count(*) into v_count from app.xp_events where user_id=v_rec.sender_id and event_type='recommendation_completed_sender' and recorded_at>=date_trunc('day',now());
  if v_count<5 then perform app.xp_apply_event(v_rec.sender_id,'recommendation_completed_sender','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_sender:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title'),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',15),jsonb_build_object('axisType','branch','axisKey','connector','amount',20)),true); end if;
end;
$$;
revoke all on function app.xp_award_recommendation_completion(uuid) from public;

create or replace function app.xp_recommendation_event_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$ begin if new.event_type='completed' then perform app.xp_award_recommendation_completion(new.recommendation_id); end if; return new; end; $$;
drop trigger if exists xp_recommendation_completed on app.social_recommendation_events;
create trigger xp_recommendation_completed after insert on app.social_recommendation_events for each row execute function app.xp_recommendation_event_trigger();

create or replace function app.xp_recommendation_feedback_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_rec app.social_recommendations%rowtype; v_count integer;
begin
  select * into v_rec from app.social_recommendations where id=new.recommendation_id;
  if found and v_rec.progress_status='completed' and new.author_id=v_rec.recipient_id and length(btrim(new.body))>=40 then
    select count(*) into v_count from app.xp_events where user_id=new.author_id and event_type='recommendation_completion_feedback' and recorded_at>=date_trunc('day',now());
    if v_count<5 then perform app.xp_apply_event(new.author_id,'recommendation_completion_feedback','social_verified','recommendation_message',new.id::text,v_rec.canonical_media_key,'recommendation_completion_feedback:'||new.recommendation_id::text||':'||new.author_id::text,jsonb_build_object('recommendationId',new.recommendation_id,'messageId',new.id,'length',length(btrim(new.body))),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','connector','amount',5)),true); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists xp_recommendation_feedback on app.social_recommendation_messages;
create trigger xp_recommendation_feedback after insert on app.social_recommendation_messages for each row execute function app.xp_recommendation_feedback_trigger();

create or replace function app.xp_showcase_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_canonical text;
begin
  if new.showcase_kind<>'favorites' then return new; end if;
  v_canonical:=lower(coalesce(new.external_source,'local')||':'||coalesce(new.external_id,new.media_type||':'||new.title));
  if (select count(*) from app.xp_events where user_id=new.user_id and event_type='showcase_curated')<5 then
    perform app.xp_apply_event(new.user_id,'showcase_curated','local_attested','profile_showcase',new.id::text,v_canonical,'showcase_curated:'||new.user_id::text||':'||v_canonical,jsonb_build_object('title',new.title,'mediaType',new.media_type),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',2),jsonb_build_object('axisType','branch','axisKey','curator','amount',4)),true);
  end if; return new;
end;
$$;
drop trigger if exists xp_showcase_curated on app.profile_media_showcase;
create trigger xp_showcase_curated after insert on app.profile_media_showcase for each row execute function app.xp_showcase_trigger();

create or replace function app.get_xp_dashboard(p_event_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_limit integer:=least(greatest(coalesce(p_event_limit,25),1),50); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'version',2,'total',coalesce((select to_jsonb(t) from app.xp_user_totals t where t.user_id=v_user),jsonb_build_object('user_id',v_user,'total_xp',0,'level',1,'current_level_start_xp',0,'next_level_start_xp',100,'version',2)),
    'worlds',coalesce((select jsonb_agg(to_jsonb(w) order by w.world_key) from app.xp_user_world_totals w where w.user_id=v_user),'[]'::jsonb),
    'branches',coalesce((select jsonb_agg(to_jsonb(b) order by b.branch_key) from app.xp_user_branch_totals b where b.user_id=v_user),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'eventType',q.event_type,'trustLevel',q.trust_level,'occurredAt',q.occurred_at,'metadata',q.metadata,'allocations',q.allocations) order by q.recorded_at desc,q.id desc) from (select e.*,coalesce((select jsonb_agg(jsonb_build_object('axisType',a.axis_type,'axisKey',a.axis_key,'amount',a.amount)) from app.xp_event_allocations a where a.event_id=e.id),'[]'::jsonb) allocations from app.xp_events e where e.user_id=v_user order by e.recorded_at desc,e.id desc limit v_limit) q),'[]'::jsonb),
    'quests',coalesce((select jsonb_agg(jsonb_build_object('key',d.quest_key,'name',d.name,'description',d.description,'target',d.target,'rewardXp',d.reward_xp,'active',d.active,'currentValue',coalesce(p.current_value,0),'completedAt',p.completed_at) order by d.created_at,d.quest_key) from app.xp_quest_definitions d left join app.xp_user_quest_progress p on p.quest_key=d.quest_key and p.user_id=v_user),'[]'::jsonb),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('key',d.badge_key,'name',d.name,'description',d.description,'iconKey',d.icon_key,'tier',d.tier,'awardedAt',b.awarded_at,'selected',b.selected,'displayOrder',b.display_order) order by b.selected desc,b.display_order nulls last,b.awarded_at) from app.xp_user_badges b join app.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=v_user),'[]'::jsonb),
    'legacyImported',exists(select 1 from app.xp_legacy_imports l where l.user_id=v_user),'selectedTitle',(select selected_title from app.profiles where id=v_user)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function app.get_xp_public_summary(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_result jsonb; v_username text; v_profile jsonb; v_can_progression boolean; v_can_badges boolean;
begin
  select username into v_username from app.profiles p where p.id=p_user and p.deleted_at is null;
  if v_username is null then return null; end if;
  v_profile:=app.get_social_profile(v_username);
  if coalesce(v_profile->>'status','')<>'available' then return null; end if;
  select exists(select 1 from jsonb_array_elements(coalesce(v_profile->'modules','[]'::jsonb)) m where m->>'moduleKey'='progression'),exists(select 1 from jsonb_array_elements(coalesce(v_profile->'modules','[]'::jsonb)) m where m->>'moduleKey'='badges') into v_can_progression,v_can_badges;
  if not v_can_progression and not v_can_badges then return null; end if;
  select jsonb_build_object('totalXp',case when v_can_progression then coalesce(t.total_xp,0) else null end,'level',case when v_can_progression then coalesce(t.level,1) else null end,'selectedTitle',case when v_can_progression then p.selected_title else null end,
    'worlds',case when v_can_progression then coalesce((select jsonb_agg(jsonb_build_object('key',w.world_key,'xp',w.xp,'level',w.level,'tier',w.tier,'title',w.title)) from app.xp_user_world_totals w where w.user_id=p_user),'[]'::jsonb) else '[]'::jsonb end,
    'branches',case when v_can_progression then coalesce((select jsonb_agg(jsonb_build_object('key',b.branch_key,'xp',b.xp,'level',b.level,'tier',b.tier)) from app.xp_user_branch_totals b where b.user_id=p_user),'[]'::jsonb) else '[]'::jsonb end,
    'badges',case when v_can_badges then coalesce((select jsonb_agg(jsonb_build_object('key',d.badge_key,'name',d.name,'description',d.description,'iconKey',d.icon_key,'tier',d.tier,'displayOrder',b.display_order) order by b.display_order) from app.xp_user_badges b join app.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=p_user and b.selected),'[]'::jsonb) else '[]'::jsonb end,
    'legacyImported',case when v_can_progression then exists(select 1 from app.xp_legacy_imports l where l.user_id=p_user) else false end) into v_result
  from app.profiles p left join app.xp_user_totals t on t.user_id=p.id where p.id=p_user;
  return v_result;
end;
$$;

create or replace function app.xp_select_badges(p_badge_keys text[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_key text; v_order integer:=0;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if coalesce(array_length(p_badge_keys,1),0)>5 or coalesce(array_length(p_badge_keys,1),0)<>(select count(distinct x) from unnest(coalesce(p_badge_keys,array[]::text[])) x) then raise exception 'invalid_badge_selection'; end if;
  if exists(select 1 from unnest(coalesce(p_badge_keys,array[]::text[])) x where not exists(select 1 from app.xp_user_badges b where b.user_id=v_user and b.badge_key=x)) then raise exception 'badge_not_earned'; end if;
  update app.xp_user_badges set selected=false,display_order=null where user_id=v_user;
  foreach v_key in array coalesce(p_badge_keys,array[]::text[]) loop update app.xp_user_badges set selected=true,display_order=v_order where user_id=v_user and badge_key=v_key; v_order:=v_order+1; end loop;
  return jsonb_build_object('ok',true,'selected',coalesce(p_badge_keys,array[]::text[]));
end;
$$;

create or replace function app.xp_select_title(p_title text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_allowed boolean;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select exists(select 1 from app.xp_user_world_totals w where w.user_id=v_user and (p_title=app.xp_world_title(w.world_key,1) or (w.level>=6 and p_title=app.xp_world_title(w.world_key,6)) or (w.level>=11 and p_title=app.xp_world_title(w.world_key,11)) or (w.level>=21 and p_title=app.xp_world_title(w.world_key,21)))) or exists(select 1 from app.xp_user_badges b join app.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=v_user and d.name=p_title) or exists(select 1 from app.profiles p where p.id=v_user and p.selected_title=p_title) into v_allowed;
  if not v_allowed then raise exception 'title_not_earned'; end if;
  update app.profiles set selected_title=p_title,updated_at=now() where id=v_user;
  return jsonb_build_object('ok',true,'selectedTitle',p_title);
end;
$$;

revoke all on function app.xp_general_level(bigint),app.xp_world_level(bigint),app.xp_tier(integer),app.xp_world_title(text,integer),app.xp_world_for_media_type(text),app.xp_commitment_bonus(integer) from public;
revoke all on function app.xp_attest_local_event(text,text,jsonb,integer,text),app.xp_import_legacy(integer,integer,integer,integer,integer,integer,jsonb),app.get_xp_dashboard(integer),app.get_xp_public_summary(uuid),app.xp_select_badges(text[]),app.xp_select_title(text) from public;
grant execute on function app.xp_attest_local_event(text,text,jsonb,integer,text),app.xp_import_legacy(integer,integer,integer,integer,integer,integer,jsonb),app.get_xp_dashboard(integer),app.xp_select_badges(text[]),app.xp_select_title(text) to mt_runtime;
grant execute on function app.get_xp_public_summary(uuid) to mt_runtime;
-- END XP V2 PROGRESSION


-- Source 20260721143000_xp_reversible_local_state.sql sha256 8411bcf2be914f711b159157339a0d57eb9ae4790b94f89db3cdd412730b793e
-- BEGIN XP REVERSIBLE LOCAL STATE

alter table app.xp_events
  add column if not exists event_action text not null default 'grant',
  add column if not exists effect smallint not null default 1;

alter table app.xp_events drop constraint if exists xp_events_action_check;
alter table app.xp_events add constraint xp_events_action_check
  check (event_action in ('grant','revoke','restore') and
    ((event_action='revoke' and effect=-1) or (event_action in ('grant','restore') and effect=1)));

create table if not exists app.xp_media_entitlements (
  user_id uuid not null references native_auth."user"(id) on delete cascade,
  canonical_media_key text not null,
  entitlement_type text not null check (entitlement_type in ('media_started','media_completed','media_rated','review_published','showcase_curated')),
  world_key text check (world_key is null or world_key in ('east','screen','arch')),
  is_active boolean not null default false,
  activated_at timestamptz,
  deactivated_at timestamptz,
  last_state_hash text not null,
  allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(allocations)='array'),
  updated_at timestamptz not null default now(),
  primary key (user_id,canonical_media_key,entitlement_type),
  check (length(canonical_media_key) between 3 and 220),
  check ((is_active and activated_at is not null and deactivated_at is null) or not is_active)
);

create table if not exists app.xp_local_state_conversions (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  correction_event_id uuid references app.xp_events(id),
  converted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object')
);

alter table app.xp_media_entitlements enable row level security;
alter table app.xp_local_state_conversions enable row level security;
drop policy if exists xp_media_entitlements_select_own on app.xp_media_entitlements;
create policy xp_media_entitlements_select_own on app.xp_media_entitlements for select to mt_runtime using (user_id=app.current_user_id());
drop policy if exists xp_local_state_conversions_select_own on app.xp_local_state_conversions;
create policy xp_local_state_conversions_select_own on app.xp_local_state_conversions for select to mt_runtime using (user_id=app.current_user_id());
revoke insert,update,delete on app.xp_media_entitlements,app.xp_local_state_conversions from mt_runtime;
grant select on app.xp_media_entitlements,app.xp_local_state_conversions to mt_runtime;

create or replace function app.xp_repair_selected_title(p_user uuid)
returns void language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_selected text; v_fallback text; v_known_world_title boolean; v_still_earned boolean;
begin
  select selected_title into v_selected from app.profiles where id=p_user;
  if v_selected is null then return; end if;
  select v_selected=any(array[
    'Doğu Yolcusu','Mürekkep İzleyicisi','Katana Arşivcisi','Doğu Ustası',
    'Kadraj Gezgini','Sahne Takipçisi','Projektör Avcısı','Kadraj Ustası',
    'Arşiv Yolcusu','Sayfa Toplayıcısı','Mühür Muhafızı','Arşiv Ustası'
  ]) into v_known_world_title;
  if not v_known_world_title then return; end if;
  select exists(
    select 1 from app.xp_user_world_totals w where w.user_id=p_user and (
      v_selected=app.xp_world_title(w.world_key,1) or
      (w.level>=6 and v_selected=app.xp_world_title(w.world_key,6)) or
      (w.level>=11 and v_selected=app.xp_world_title(w.world_key,11)) or
      (w.level>=21 and v_selected=app.xp_world_title(w.world_key,21))
    )
  ) into v_still_earned;
  if v_still_earned then return; end if;
  select title into v_fallback from app.xp_user_world_totals where user_id=p_user and xp>0 order by xp desc,world_key asc limit 1;
  update app.profiles set selected_title=v_fallback,updated_at=now() where id=p_user;
end;
$$;
revoke all on function app.xp_repair_selected_title(uuid) from public;

create or replace function app.xp_apply_adjustment(
  p_user uuid,p_event_type text,p_trust_level text,p_source_type text,p_source_id text,
  p_canonical_key text,p_action text,p_metadata jsonb,p_allocations jsonb,p_evaluate boolean default true
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_event uuid; v_allocation jsonb; v_axis text; v_key text; v_amount integer; v_delta integer; v_total bigint; v_level integer; v_dedupe text;
begin
  if p_user is null or p_action not in ('grant','revoke','restore') or jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception 'invalid_xp_adjustment'; end if;
  v_dedupe:='state:'||p_user::text||':'||coalesce(p_canonical_key,p_source_id,'global')||':'||p_event_type||':'||p_action||':'||gen_random_uuid()::text;
  insert into app.xp_events(user_id,event_type,trust_level,source_type,source_id,canonical_key,dedupe_key,metadata,event_action,effect)
  values(p_user,p_event_type,p_trust_level,p_source_type,p_source_id,p_canonical_key,v_dedupe,coalesce(p_metadata,'{}'::jsonb),p_action,case when p_action='revoke' then -1 else 1 end)
  returning id into v_event;
  for v_allocation in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    v_axis:=v_allocation->>'axisType'; v_key:=v_allocation->>'axisKey';
    if jsonb_typeof(v_allocation->'amount')<>'number' then raise exception 'invalid_xp_allocation'; end if;
    v_amount:=(v_allocation->>'amount')::integer;
    if v_amount<=0 then raise exception 'invalid_xp_allocation'; end if;
    v_delta:=case when p_action='revoke' then -v_amount else v_amount end;
    insert into app.xp_event_allocations(event_id,axis_type,axis_key,amount) values(v_event,v_axis,v_key,v_amount);
    if v_axis='general' then
      insert into app.xp_user_totals(user_id,total_xp) values(p_user,greatest(0,v_delta))
      on conflict(user_id) do update set total_xp=greatest(0,app.xp_user_totals.total_xp+v_delta),updated_at=now();
    elsif v_axis='world' then
      insert into app.xp_user_world_totals(user_id,world_key,xp,level,tier,title)
      values(p_user,v_key,greatest(0,v_delta),1,'basic',app.xp_world_title(v_key,1))
      on conflict(user_id,world_key) do update set xp=greatest(0,app.xp_user_world_totals.xp+v_delta),updated_at=now();
    elsif v_axis='branch' then
      insert into app.xp_user_branch_totals(user_id,branch_key,xp,level,tier)
      values(p_user,v_key,greatest(0,v_delta),1,'basic')
      on conflict(user_id,branch_key) do update set xp=greatest(0,app.xp_user_branch_totals.xp+v_delta),updated_at=now();
    else raise exception 'invalid_xp_axis'; end if;
  end loop;
  select coalesce(total_xp,0) into v_total from app.xp_user_totals where user_id=p_user;
  v_level:=app.xp_general_level(coalesce(v_total,0));
  update app.xp_user_totals set level=v_level,current_level_start_xp=((v_level-1)::bigint*(v_level-1)*100),next_level_start_xp=(v_level::bigint*v_level*100),updated_at=now() where user_id=p_user;
  update app.xp_user_world_totals set level=app.xp_world_level(xp),tier=app.xp_tier(app.xp_world_level(xp)),title=app.xp_world_title(world_key,app.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  update app.xp_user_branch_totals set level=app.xp_world_level(xp),tier=app.xp_tier(app.xp_world_level(xp)),updated_at=now() where user_id=p_user;
  if p_action='revoke' then perform app.xp_repair_selected_title(p_user); elsif p_evaluate then perform app.xp_evaluate_quests(p_user); end if;
  return jsonb_build_object('ok',true,'eventId',v_event,'action',p_action,'effect',case when p_action='revoke' then -1 else 1 end,'totalXp',coalesce(v_total,0),'level',v_level);
end;
$$;
revoke all on function app.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public;

create or replace function app.xp_reconcile_entitlement(
  p_user uuid,p_canonical text,p_type text,p_desired boolean,p_world text,p_state_hash text,p_metadata jsonb,p_allocations jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_existing app.xp_media_entitlements%rowtype; v_action text; v_result jsonb; v_changed_allocations boolean;
begin
  if p_user is null or p_type not in ('media_started','media_completed','media_rated','review_published','showcase_curated') or length(p_canonical) not between 3 and 220 or length(p_state_hash) not between 1 and 128 then raise exception 'invalid_media_entitlement'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||lower(p_canonical)||':'||p_type,0));
  select * into v_existing from app.xp_media_entitlements where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type for update;
  if not found then
    if not p_desired then return jsonb_build_object('changed',false); end if;
    v_action:='grant';
    v_result:=app.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),v_action,p_metadata,p_allocations,true);
    insert into app.xp_media_entitlements(user_id,canonical_media_key,entitlement_type,world_key,is_active,activated_at,last_state_hash,allocations)
    values(p_user,lower(p_canonical),p_type,p_world,true,now(),p_state_hash,p_allocations);
    return v_result||jsonb_build_object('changed',true);
  end if;
  v_changed_allocations:=v_existing.world_key is distinct from p_world or v_existing.allocations is distinct from p_allocations;
  if v_existing.is_active and not p_desired then
    v_result:=app.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'revoke',p_metadata||jsonb_build_object('previousAllocations',v_existing.allocations),v_existing.allocations,false);
    update app.xp_media_entitlements set is_active=false,deactivated_at=now(),last_state_hash=p_state_hash,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
    return v_result||jsonb_build_object('changed',true);
  elsif v_existing.is_active and p_desired and v_changed_allocations then
    perform app.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'revoke',p_metadata||jsonb_build_object('reason','state_reallocation'),v_existing.allocations,false);
    v_result:=app.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'restore',p_metadata,p_allocations,true);
    update app.xp_media_entitlements set world_key=p_world,is_active=true,activated_at=now(),deactivated_at=null,last_state_hash=p_state_hash,allocations=p_allocations,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
    return v_result||jsonb_build_object('changed',true);
  elsif not v_existing.is_active and p_desired then
    v_result:=app.xp_apply_adjustment(p_user,p_type,'local_attested','media_state',lower(p_canonical),lower(p_canonical),'restore',p_metadata,p_allocations,true);
    update app.xp_media_entitlements set world_key=p_world,is_active=true,activated_at=now(),deactivated_at=null,last_state_hash=p_state_hash,allocations=p_allocations,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
    return v_result||jsonb_build_object('changed',true);
  end if;
  update app.xp_media_entitlements set last_state_hash=p_state_hash,updated_at=now() where user_id=p_user and canonical_media_key=lower(p_canonical) and entitlement_type=p_type;
  return jsonb_build_object('changed',false);
end;
$$;
revoke all on function app.xp_reconcile_entitlement(uuid,text,text,boolean,text,text,jsonb,jsonb) from public;

create or replace function app.xp_reconcile_media_state(p_user uuid,p_state jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_canonical text; v_title text; v_type text; v_status text; v_world text; v_hash text; v_progress integer; v_total integer; v_deleted boolean; v_rating boolean; v_started boolean; v_completed boolean; v_bonus integer; v_showcase boolean; v_review boolean; v_changed integer:=0; v_result jsonb; v_meta jsonb;
begin
  if jsonb_typeof(p_state)<>'object' or p_state ?| array['amount','effect','allocations','personalNotes','notes','reviewText','dataUrl','fullMedia'] then raise exception 'unsafe_media_state'; end if;
  v_canonical:=lower(btrim(coalesce(p_state->>'canonicalMediaKey',''))); v_title=btrim(coalesce(p_state->>'title','')); v_type:=p_state->>'mediaType'; v_status:=p_state->>'status'; v_hash:=p_state->>'stateHash';
  if length(v_canonical) not between 3 and 220 or length(v_title) not between 1 and 200 or v_status not in ('planning','watching','reading','completed','dropped','paused') or length(coalesce(v_hash,'')) not between 1 and 128 then raise exception 'invalid_media_state'; end if;
  v_world:=app.xp_world_for_media_type(v_type); if v_world is null then raise exception 'invalid_media_world'; end if;
  if jsonb_typeof(p_state->'progress')<>'number' or jsonb_typeof(p_state->'totalProgress')<>'number' or jsonb_typeof(p_state->'hasRating')<>'boolean' or jsonb_typeof(p_state->'deleted')<>'boolean' then raise exception 'invalid_media_state'; end if;
  v_progress:=(p_state->>'progress')::integer; v_total:=(p_state->>'totalProgress')::integer; v_rating:=(p_state->>'hasRating')::boolean; v_deleted:=(p_state->>'deleted')::boolean;
  if v_progress<0 or v_progress>100000000 or v_total<0 or v_total>100000000 then raise exception 'invalid_media_progress'; end if;
  v_started:=not v_deleted and (v_status in ('watching','reading','completed') or v_progress>0);
  v_completed:=not v_deleted and v_status='completed'; v_rating:=not v_deleted and v_rating; v_bonus:=app.xp_commitment_bonus(case when v_total>0 then v_total else null end);
  select not v_deleted and exists(select 1 from app.profile_media_showcase s where s.user_id=p_user and lower(coalesce(s.external_source,'local')||':'||coalesce(s.external_id,s.media_type||':'||s.title))=v_canonical and s.showcase_kind='favorites') into v_showcase;
  select not v_deleted and exists(select 1 from app.profile_shared_notes n where n.user_id=p_user and lower(coalesce(n.external_source,'local')||':'||coalesce(n.external_id,n.media_type||':'||n.media_title))=v_canonical and length(btrim(n.content))>=80) into v_review;
  v_meta:=jsonb_build_object('title',v_title,'mediaType',v_type,'world',v_world,'stateHash',v_hash);
  v_result:=app.xp_reconcile_entitlement(p_user,v_canonical,'media_started',v_started,v_world,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'state_reconciled' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',4),jsonb_build_object('axisType','world','axisKey',v_world,'amount',3),jsonb_build_object('axisType','branch','axisKey','tracker','amount',4))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=app.xp_reconcile_entitlement(p_user,v_canonical,'media_completed',v_completed,v_world,v_hash,v_meta||jsonb_build_object('baseXp',25,'commitmentBonus',v_bonus,'reason',case when v_deleted then 'media_deleted' else 'state_reconciled' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',25+v_bonus),jsonb_build_object('axisType','world','axisKey',v_world,'amount',20),jsonb_build_object('axisType','branch','axisKey','tracker','amount',15))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=app.xp_reconcile_entitlement(p_user,v_canonical,'media_rated',v_rating,null,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'state_reconciled' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','critic','amount',5))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=app.xp_reconcile_entitlement(p_user,v_canonical,'review_published',v_review,null,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'shared_review_state' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',12),jsonb_build_object('axisType','branch','axisKey','critic','amount',15))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  v_result:=app.xp_reconcile_entitlement(p_user,v_canonical,'showcase_curated',v_showcase,null,v_hash,v_meta||jsonb_build_object('reason',case when v_deleted then 'media_deleted' else 'showcase_state' end),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',2),jsonb_build_object('axisType','branch','axisKey','curator','amount',4))); if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
  return jsonb_build_object('canonicalMediaKey',v_canonical,'changedEntitlements',v_changed);
end;
$$;
revoke all on function app.xp_reconcile_media_state(uuid,jsonb) from public;

create or replace function app.xp_convert_legacy_local_state(p_user uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_allocations jsonb; v_result jsonb; v_event uuid; v_count integer;
begin
  if exists(select 1 from app.xp_local_state_conversions where user_id=p_user) then return jsonb_build_object('converted',false,'idempotent',true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('axisType',axis_type,'axisKey',axis_key,'amount',amount) order by axis_type,axis_key),'[]'::jsonb),coalesce(sum(event_count),0)::integer into v_allocations,v_count from (
    select a.axis_type,a.axis_key,sum(a.amount*e.effect)::integer amount,count(distinct e.id)::integer event_count
    from app.xp_events e join app.xp_event_allocations a on a.event_id=e.id
    where e.user_id=p_user and (e.trust_level='legacy_attested' or (e.trust_level='local_attested' and e.source_type<>'media_state'))
    group by a.axis_type,a.axis_key having sum(a.amount*e.effect)>0
  ) q;
  if jsonb_array_length(v_allocations)>0 then
    v_result:=app.xp_apply_adjustment(p_user,'reversal','system','xp_v2_conversion',p_user::text,null,'revoke',jsonb_build_object('reason','legacy_local_baseline_replaced','correctedEventCount',v_count),v_allocations,false);
    v_event:=(v_result->>'eventId')::uuid;
  end if;
  insert into app.xp_local_state_conversions(user_id,correction_event_id,metadata) values(p_user,v_event,jsonb_build_object('correctedEventCount',v_count));
  return jsonb_build_object('converted',true,'correctionEventId',v_event,'correctedEventCount',v_count);
end;
$$;
revoke all on function app.xp_convert_legacy_local_state(uuid) from public;

create or replace function app.xp_sync_media_states(p_items jsonb,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_item jsonb; v_seen text[]:=array[]::text[]; v_canonical text; v_changed integer:=0; v_result jsonb; v_before bigint; v_after bigint; v_conversion jsonb; v_ent app.xp_media_entitlements%rowtype;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>1000 then raise exception 'invalid_media_state_batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('xp-sync:'||v_user::text,0));
  if not p_replace and not exists(select 1 from app.xp_local_state_conversions where user_id=v_user) and exists(select 1 from app.xp_events where user_id=v_user and (trust_level='legacy_attested' or (trust_level='local_attested' and source_type<>'media_state'))) then raise exception 'library_full_sync_required'; end if;
  select coalesce(total_xp,0) into v_before from app.xp_user_totals where user_id=v_user; v_before:=coalesce(v_before,0);
  v_conversion:=app.xp_convert_legacy_local_state(v_user);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_canonical:=lower(btrim(coalesce(v_item->>'canonicalMediaKey','')));
    if v_canonical=any(v_seen) then raise exception 'duplicate_media_state'; end if;
    v_seen:=array_append(v_seen,v_canonical);
    v_result:=app.xp_reconcile_media_state(v_user,v_item);
    v_changed:=v_changed+coalesce((v_result->>'changedEntitlements')::integer,0);
  end loop;
  if p_replace then
    for v_ent in select distinct on (canonical_media_key) * from app.xp_media_entitlements where user_id=v_user and is_active and not (canonical_media_key=any(v_seen)) order by canonical_media_key,entitlement_type loop
      v_item:=jsonb_build_object('canonicalMediaKey',v_ent.canonical_media_key,'title',coalesce((select metadata->>'title' from app.xp_events where user_id=v_user and canonical_key=v_ent.canonical_media_key order by recorded_at desc limit 1),'Silinen medya'),'mediaType',case v_ent.world_key when 'east' then 'anime' when 'arch' then 'book' else 'movie' end,'status','planning','progress',0,'totalProgress',0,'hasRating',false,'deleted',true,'stateHash','deleted:'||md5(v_ent.canonical_media_key));
      v_result:=app.xp_reconcile_media_state(v_user,v_item); v_changed:=v_changed+coalesce((v_result->>'changedEntitlements')::integer,0);
    end loop;
  end if;
  select coalesce(total_xp,0) into v_after from app.xp_user_totals where user_id=v_user; v_after:=coalesce(v_after,0);
  return jsonb_build_object('ok',true,'processed',jsonb_array_length(p_items),'changedEntitlements',v_changed,'xpDelta',v_after-v_before,'totalXp',v_after,'conversion',v_conversion);
end;
$$;

create or replace function app.xp_attest_local_event(p_event_type text,p_canonical_key text,p_media jsonb,p_total_progress integer default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$ begin raise exception 'xp_state_sync_required'; end; $$;
create or replace function app.xp_import_legacy(p_media_count integer,p_progress_log_count integer,p_completed_count integer,p_rated_count integer,p_favorite_count integer,p_noted_count integer,p_world_counts jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$ begin raise exception 'legacy_import_deprecated'; end; $$;

create or replace function app.xp_award_recommendation_completion(p_recommendation uuid)
returns void language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_rec app.social_recommendations%rowtype; v_world text; v_canonical text;
begin
  select * into v_rec from app.social_recommendations where id=p_recommendation and progress_status='completed'; if not found then return; end if;
  v_world:=app.xp_world_for_media_type(v_rec.media_snapshot->>'mediaType'); v_canonical:=coalesce(v_rec.canonical_media_key,p_recommendation::text);
  perform app.xp_apply_event(v_rec.recipient_id,'recommendation_completed_recipient','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_recipient:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title','world',v_world),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',20),jsonb_build_object('axisType','branch','axisKey','explorer','amount',12),jsonb_build_object('axisType','branch','axisKey','connector','amount',8))||case when v_world is not null then jsonb_build_array(jsonb_build_object('axisType','world','axisKey',v_world,'amount',10)) else '[]'::jsonb end,true);
  perform app.xp_apply_event(v_rec.sender_id,'recommendation_completed_sender','social_verified','recommendation',p_recommendation::text,v_canonical,'recommendation_completed_sender:'||p_recommendation::text,jsonb_build_object('recommendationId',p_recommendation,'title',v_rec.media_snapshot->>'title'),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',15),jsonb_build_object('axisType','branch','axisKey','connector','amount',20)),true);
end;
$$;

create or replace function app.xp_recommendation_feedback_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_rec app.social_recommendations%rowtype;
begin
  select * into v_rec from app.social_recommendations where id=new.recommendation_id;
  if found and v_rec.progress_status='completed' and new.author_id=v_rec.recipient_id and length(btrim(new.body))>=40 then
    perform app.xp_apply_event(new.author_id,'recommendation_completion_feedback','social_verified','recommendation_message',new.id::text,v_rec.canonical_media_key,'recommendation_completion_feedback:'||new.recommendation_id::text||':'||new.author_id::text,jsonb_build_object('recommendationId',new.recommendation_id,'messageId',new.id,'length',length(btrim(new.body))),jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',5),jsonb_build_object('axisType','branch','axisKey','connector','amount',5)),true);
  end if;
  return new;
end;
$$;

create or replace function app.xp_profile_entitlement_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid; v_canonical text; v_old_canonical text; v_type text; v_world text; v_title text; v_old_title text; v_desired boolean; v_old_desired boolean; v_hash text; v_allocations jsonb;
begin
  v_user:=coalesce(new.user_id,old.user_id);
  if tg_table_name='profile_media_showcase' then
    v_type:='showcase_curated'; v_title:=coalesce(new.title,old.title); v_world:=null;
    v_canonical:=lower(coalesce(coalesce(new.external_source,old.external_source),'local')||':'||coalesce(coalesce(new.external_id,old.external_id),coalesce(new.media_type,old.media_type)||':'||v_title));
    if tg_op='UPDATE' then v_old_title:=old.title; v_old_canonical:=lower(coalesce(old.external_source,'local')||':'||coalesce(old.external_id,old.media_type||':'||old.title)); end if;
    select exists(select 1 from app.profile_media_showcase s where s.user_id=v_user and s.showcase_kind='favorites' and lower(coalesce(s.external_source,'local')||':'||coalesce(s.external_id,s.media_type||':'||s.title))=v_canonical) into v_desired;
    v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',2),jsonb_build_object('axisType','branch','axisKey','curator','amount',4));
  else
    v_type:='review_published'; v_title:=coalesce(new.media_title,old.media_title); v_world:=null;
    v_canonical:=lower(coalesce(coalesce(new.external_source,old.external_source),'local')||':'||coalesce(coalesce(new.external_id,old.external_id),coalesce(new.media_type,old.media_type)||':'||v_title));
    if tg_op='UPDATE' then v_old_title:=old.media_title; v_old_canonical:=lower(coalesce(old.external_source,'local')||':'||coalesce(old.external_id,old.media_type||':'||old.media_title)); end if;
    select exists(select 1 from app.profile_shared_notes n where n.user_id=v_user and length(btrim(n.content))>=80 and lower(coalesce(n.external_source,'local')||':'||coalesce(n.external_id,n.media_type||':'||n.media_title))=v_canonical) into v_desired;
    v_allocations:=jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',12),jsonb_build_object('axisType','branch','axisKey','critic','amount',15));
  end if;
  if v_old_canonical is not null and v_old_canonical<>v_canonical then
    if v_type='showcase_curated' then select exists(select 1 from app.profile_media_showcase s where s.user_id=v_user and s.showcase_kind='favorites' and lower(coalesce(s.external_source,'local')||':'||coalesce(s.external_id,s.media_type||':'||s.title))=v_old_canonical) into v_old_desired;
    else select exists(select 1 from app.profile_shared_notes n where n.user_id=v_user and length(btrim(n.content))>=80 and lower(coalesce(n.external_source,'local')||':'||coalesce(n.external_id,n.media_type||':'||n.media_title))=v_old_canonical) into v_old_desired; end if;
    perform app.xp_reconcile_entitlement(v_user,v_old_canonical,v_type,v_old_desired,v_world,md5(v_type||':'||v_old_canonical||':'||v_old_desired::text),jsonb_build_object('title',v_old_title,'reason','profile_state_moved'),v_allocations);
  end if;
  v_hash:=md5(v_type||':'||v_canonical||':'||v_desired::text);
  perform app.xp_reconcile_entitlement(v_user,v_canonical,v_type,v_desired,v_world,v_hash,jsonb_build_object('title',v_title,'reason',case when v_desired then 'profile_state_added' else 'profile_state_removed' end),v_allocations);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists xp_showcase_curated on app.profile_media_showcase;
drop trigger if exists xp_showcase_reconcile on app.profile_media_showcase;
create constraint trigger xp_showcase_reconcile after insert or update or delete on app.profile_media_showcase deferrable initially deferred for each row execute function app.xp_profile_entitlement_trigger();
drop trigger if exists xp_shared_review_reconcile on app.profile_shared_notes;
create constraint trigger xp_shared_review_reconcile after insert or update or delete on app.profile_shared_notes deferrable initially deferred for each row execute function app.xp_profile_entitlement_trigger();

create or replace function app.xp_evaluate_quests(p_user uuid)
returns void language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_quest app.xp_quest_definitions%rowtype; v_value integer; v_existing timestamptz; v_reward jsonb; v_reward_id uuid;
begin
  for v_quest in select * from app.xp_quest_definitions where active order by quest_key loop
    if v_quest.quest_key='three_worlds' then
      select count(distinct metadata->>'world')::integer into v_value from app.xp_events where user_id=p_user and event_type='media_completed' and effect=1 and metadata->>'world' in ('east','screen','arch');
    else
      select count(distinct coalesce(canonical_key,source_id,id::text))::integer into v_value from app.xp_events where user_id=p_user and event_type=v_quest.criteria->>'eventType' and effect=1;
    end if;
    select completed_at into v_existing from app.xp_user_quest_progress where user_id=p_user and quest_key=v_quest.quest_key;
    insert into app.xp_user_quest_progress(user_id,quest_key,current_value,completed_at) values(p_user,v_quest.quest_key,least(v_value,v_quest.target),case when v_value>=v_quest.target then coalesce(v_existing,now()) else null end)
    on conflict(user_id,quest_key) do update set current_value=greatest(app.xp_user_quest_progress.current_value,excluded.current_value),completed_at=coalesce(app.xp_user_quest_progress.completed_at,excluded.completed_at),updated_at=now();
    if v_value>=v_quest.target and v_existing is null then
      v_reward:=app.xp_apply_event(p_user,'quest_completed','system','quest',v_quest.quest_key,null,'quest:'||v_quest.quest_key,jsonb_build_object('questKey',v_quest.quest_key),case when v_quest.reward_xp>0 then jsonb_build_array(jsonb_build_object('axisType','general','axisKey','general','amount',v_quest.reward_xp)) else '[]'::jsonb end,false);
      v_reward_id:=(v_reward->>'eventId')::uuid; update app.xp_user_quest_progress set reward_event_id=v_reward_id where user_id=p_user and quest_key=v_quest.quest_key;
      if v_quest.badge_key is not null then insert into app.xp_user_badges(user_id,badge_key,source_event_id) values(p_user,v_quest.badge_key,v_reward_id) on conflict(user_id,badge_key) do nothing; end if;
    end if;
  end loop;
end;
$$;

create or replace function app.get_xp_dashboard(p_event_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_limit integer:=least(greatest(coalesce(p_event_limit,25),1),50); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'version',2,'total',coalesce((select to_jsonb(t) from app.xp_user_totals t where t.user_id=v_user),jsonb_build_object('user_id',v_user,'total_xp',0,'level',1,'current_level_start_xp',0,'next_level_start_xp',100,'version',2)),
    'worlds',coalesce((select jsonb_agg(to_jsonb(w) order by w.world_key) from app.xp_user_world_totals w where w.user_id=v_user),'[]'::jsonb),
    'branches',coalesce((select jsonb_agg(to_jsonb(b) order by b.branch_key) from app.xp_user_branch_totals b where b.user_id=v_user),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'eventType',q.event_type,'trustLevel',q.trust_level,'action',q.event_action,'effect',q.effect,'occurredAt',q.occurred_at,'metadata',q.metadata,'allocations',q.allocations) order by q.recorded_at desc,q.id desc) from (select e.*,coalesce((select jsonb_agg(jsonb_build_object('axisType',a.axis_type,'axisKey',a.axis_key,'amount',a.amount)) from app.xp_event_allocations a where a.event_id=e.id),'[]'::jsonb) allocations from app.xp_events e where e.user_id=v_user order by e.recorded_at desc,e.id desc limit v_limit) q),'[]'::jsonb),
    'quests',coalesce((select jsonb_agg(jsonb_build_object('key',d.quest_key,'name',d.name,'description',d.description,'target',d.target,'rewardXp',d.reward_xp,'active',d.active,'currentValue',coalesce(p.current_value,0),'completedAt',p.completed_at) order by d.created_at,d.quest_key) from app.xp_quest_definitions d left join app.xp_user_quest_progress p on p.quest_key=d.quest_key and p.user_id=v_user),'[]'::jsonb),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('key',d.badge_key,'name',d.name,'description',d.description,'iconKey',d.icon_key,'tier',d.tier,'awardedAt',b.awarded_at,'selected',b.selected,'displayOrder',b.display_order) order by b.selected desc,b.display_order nulls last,b.awarded_at) from app.xp_user_badges b join app.xp_badge_definitions d on d.badge_key=b.badge_key where b.user_id=v_user),'[]'::jsonb),
    'breakdown',jsonb_build_object(
      'localCurrentXp',coalesce((select sum((a->>'amount')::integer) from app.xp_media_entitlements m cross join lateral jsonb_array_elements(m.allocations) a where m.user_id=v_user and m.is_active and a->>'axisType'='general'),0),
      'socialXp',coalesce((select sum(a.amount*e.effect) from app.xp_events e join app.xp_event_allocations a on a.event_id=e.id where e.user_id=v_user and e.trust_level='social_verified' and a.axis_type='general'),0),
      'systemXp',coalesce((select sum(a.amount*e.effect) from app.xp_events e join app.xp_event_allocations a on a.event_id=e.id where e.user_id=v_user and e.trust_level='system' and e.source_type<>'xp_v2_conversion' and a.axis_type='general'),0),
      'legacyCorrectionXp',coalesce((select sum(a.amount*e.effect) from app.xp_events e join app.xp_event_allocations a on a.event_id=e.id where e.user_id=v_user and (e.trust_level='legacy_attested' or e.source_type='xp_v2_conversion') and a.axis_type='general'),0)
    ),
    'legacyImported',exists(select 1 from app.xp_legacy_imports l where l.user_id=v_user),
    'librarySynchronized',exists(select 1 from app.xp_local_state_conversions c where c.user_id=v_user),
    'selectedTitle',(select selected_title from app.profiles where id=v_user)
  ) into v_result; return v_result;
end;
$$;

revoke all on function app.xp_sync_media_states(jsonb,boolean) from public;
revoke all on function app.xp_attest_local_event(text,text,jsonb,integer,text),app.xp_import_legacy(integer,integer,integer,integer,integer,integer,jsonb) from mt_runtime;
grant execute on function app.xp_sync_media_states(jsonb,boolean) to mt_runtime;

-- No product-level daily XP quota remains. Request throttling, if added later,
-- must protect transport only and must not change the number of eligible rewards.
-- END XP REVERSIBLE LOCAL STATE


-- Source 20260722110000_unified_profile_presentation.sql sha256 b74dbf2705ab84c8758002a1e0019809fe97d5814458dce976ad56b8d6d84972
-- Unified profile presentation (kept in sync with supabase/schema.sql)
alter table app.profiles add column if not exists tagline text not null default '';
alter table app.profiles add column if not exists profile_palette_id text not null default 'neutral';
alter table app.profiles add column if not exists banner_mode text not null default 'gradient';
alter table app.profiles add column if not exists banner_position text not null default 'center';
alter table app.profiles add column if not exists overlay_strength text not null default 'medium';
alter table app.profiles add column if not exists avatar_frame text not null default 'subtle';
alter table app.profiles add column if not exists surface_style text not null default 'solid';
alter table app.profiles add column if not exists motif_intensity text not null default 'none';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_tagline_check') then
    alter table app.profiles add constraint profiles_tagline_check check (
      length(tagline)<=120 and tagline !~ '[<>]'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_presentation_check') then
    alter table app.profiles add constraint profiles_presentation_check check (
      profile_palette_id in ('neutral','east','screen','arch','ocean') and
      banner_mode in ('none','gradient','world','image') and
      banner_position in ('top','center','bottom') and
      overlay_strength in ('low','medium','high') and
      avatar_frame in ('none','subtle','world','tier') and
      surface_style in ('solid','soft_glass','textured') and
      motif_intensity in ('none','subtle','full')
    );
  end if;
end $$;

create or replace function app.social_save_unified_profile(
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
  p_motif_intensity text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_user uuid:=app.current_user_id();
  v_username text:=lower(trim(p_username));
  v_current app.profiles%rowtype;
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

  perform pg_advisory_xact_lock(hashtextextended(v_username,0));
  select * into v_current from app.profiles where id=v_user for update;
  if exists(select 1 from app.profiles where lower(username)=v_username and id<>v_user and deleted_at is null) then raise exception 'username_taken'; end if;
  if exists(select 1 from app.profile_username_history where lower(username)=v_username and user_id<>v_user and reserved_until>now()) then raise exception 'username_reserved'; end if;
  if v_current.id is not null and v_current.username is distinct from v_username then
    if v_current.username is not null and v_current.username_changed_at>now()-interval '30 days' then raise exception 'username_cooldown'; end if;
    if v_current.username is not null then
      insert into app.profile_username_history(user_id,username,claimed_at,released_at,reserved_until)
      values(v_user,v_current.username,coalesce(v_current.username_changed_at,v_current.created_at),now(),now()+interval '90 days');
    end if;
  end if;

  insert into app.profiles(
    id,username,display_name,tagline,bio,location,language,visibility_mode,connection_color,selected_title,
    profile_palette_id,banner_mode,banner_position,overlay_strength,avatar_frame,surface_style,motif_intensity,username_changed_at
  ) values(
    v_user,v_username,trim(p_display_name),trim(coalesce(p_tagline,'')),coalesce(p_bio,''),
    nullif(trim(coalesce(p_location,'')),''),nullif(lower(trim(coalesce(p_language,''))),''),p_visibility_mode,p_connection_color,
    nullif(trim(coalesce(p_selected_title,'')),''),p_profile_palette_id,p_banner_mode,p_banner_position,p_overlay_strength,
    p_avatar_frame,p_surface_style,p_motif_intensity,now()
  )
  on conflict(id) do update set
    username=excluded.username,display_name=excluded.display_name,tagline=excluded.tagline,bio=excluded.bio,
    location=excluded.location,language=excluded.language,visibility_mode=excluded.visibility_mode,
    connection_color=excluded.connection_color,selected_title=excluded.selected_title,
    profile_palette_id=excluded.profile_palette_id,banner_mode=excluded.banner_mode,banner_position=excluded.banner_position,
    overlay_strength=excluded.overlay_strength,avatar_frame=excluded.avatar_frame,surface_style=excluded.surface_style,
    motif_intensity=excluded.motif_intensity,
    username_changed_at=case when profiles.username is distinct from excluded.username then now() else profiles.username_changed_at end,
    deleted_at=null;

  if p_visibility_mode='personal' then delete from app.profile_follows where following_id=v_user and status='pending'; end if;
  insert into app.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order)
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

create or replace function app.get_unified_social_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_payload jsonb;
  v_owner uuid;
  v_presentation jsonb;
  v_tagline text;
begin
  v_payload:=app.get_social_profile(p_username);
  if v_payload->>'status'<>'available' then return v_payload; end if;
  v_owner:=nullif(v_payload#>>'{profile,id}','')::uuid;
  select p.tagline,jsonb_build_object(
    'version',1,
    'paletteId',p.profile_palette_id,
    'bannerMode',p.banner_mode,
    'bannerPosition',p.banner_position,
    'overlayStrength',p.overlay_strength,
    'avatarFrame',p.avatar_frame,
    'surfaceStyle',p.surface_style,
    'motifIntensity',p.motif_intensity
  ) into v_tagline,v_presentation from app.profiles p where p.id=v_owner;
  return jsonb_set(
    jsonb_set(v_payload,'{profile,tagline}',to_jsonb(coalesce(v_tagline,'')),true),
    '{profile,presentation}',coalesce(v_presentation,'{}'::jsonb),true
  );
end;
$$;

revoke all on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
revoke all on function app.get_unified_social_profile(text) from public;
grant execute on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to mt_runtime;
grant execute on function app.get_unified_social_profile(text) to mt_runtime;

-- Direct writes remain restricted: identity and presentation changes must pass through the app.current_user_id()-bound RPC.
revoke insert,update on table app.profiles from mt_runtime;
grant update (avatar_path,banner_path) on table app.profiles to mt_runtime;



-- Source 20260722120000_profile_image_transforms.sql sha256 ac62e41be41e2b447c38d5af7a6b0d574eb5b57ec831672be7ab39fa14b53826
-- Non-destructive profile image transforms (kept in sync with supabase/schema.sql)
alter table app.profiles add column if not exists banner_focal_x numeric(5,2) not null default 50;
alter table app.profiles add column if not exists banner_focal_y numeric(5,2) not null default 50;
alter table app.profiles add column if not exists banner_zoom numeric(4,2) not null default 1;
alter table app.profiles add column if not exists avatar_focal_x numeric(5,2) not null default 50;
alter table app.profiles add column if not exists avatar_focal_y numeric(5,2) not null default 50;
alter table app.profiles add column if not exists avatar_zoom numeric(4,2) not null default 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_banner_transform_check') then
    alter table app.profiles add constraint profiles_banner_transform_check check (
      banner_focal_x between 0 and 100 and banner_focal_y between 0 and 100 and banner_zoom between 1 and 3
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_avatar_transform_check') then
    alter table app.profiles add constraint profiles_avatar_transform_check check (
      avatar_focal_x between 0 and 100 and avatar_focal_y between 0 and 100 and avatar_zoom between 1 and 3
    );
  end if;
end $$;

drop function if exists app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text);

create or replace function app.social_save_unified_profile(
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
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_user uuid:=app.current_user_id();
  v_username text:=lower(trim(p_username));
  v_current app.profiles%rowtype;
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
  select * into v_current from app.profiles where id=v_user for update;
  if exists(select 1 from app.profiles where lower(username)=v_username and id<>v_user and deleted_at is null) then raise exception 'username_taken'; end if;
  if exists(select 1 from app.profile_username_history where lower(username)=v_username and user_id<>v_user and reserved_until>now()) then raise exception 'username_reserved'; end if;
  if v_current.id is not null and v_current.username is distinct from v_username then
    if v_current.username is not null and v_current.username_changed_at>now()-interval '30 days' then raise exception 'username_cooldown'; end if;
    if v_current.username is not null then
      insert into app.profile_username_history(user_id,username,claimed_at,released_at,reserved_until)
      values(v_user,v_current.username,coalesce(v_current.username_changed_at,v_current.created_at),now(),now()+interval '90 days');
    end if;
  end if;

  insert into app.profiles(
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

  if p_visibility_mode='personal' then delete from app.profile_follows where following_id=v_user and status='pending'; end if;
  insert into app.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order)
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

create or replace function app.get_unified_social_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_payload jsonb; v_owner uuid; v_presentation jsonb; v_tagline text;
begin
  v_payload:=app.get_social_profile(p_username);
  if v_payload->>'status'<>'available' then return v_payload; end if;
  v_owner:=nullif(v_payload#>>'{profile,id}','')::uuid;
  select p.tagline,jsonb_build_object(
    'version',1,'paletteId',p.profile_palette_id,'bannerMode',p.banner_mode,'bannerPosition',p.banner_position,
    'overlayStrength',p.overlay_strength,'avatarFrame',p.avatar_frame,'surfaceStyle',p.surface_style,'motifIntensity',p.motif_intensity,
    'bannerTransform',jsonb_build_object('focalX',p.banner_focal_x,'focalY',p.banner_focal_y,'zoom',p.banner_zoom),
    'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)
  ) into v_tagline,v_presentation from app.profiles p where p.id=v_owner;
  return jsonb_set(jsonb_set(v_payload,'{profile,tagline}',to_jsonb(coalesce(v_tagline,'')),true),'{profile,presentation}',coalesce(v_presentation,'{}'::jsonb),true);
end;
$$;

create or replace function app.search_social_profiles(p_query text, p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_viewer uuid:=app.current_user_id(); v_viewer_color text:='neutral'; v_query text:=lower(trim(p_query)); v_pattern text; v_result jsonb;
begin
  if length(v_query)<2 or length(v_query)>60 then raise exception 'invalid_search_query'; end if;
  v_pattern:=replace(replace(replace(v_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  if v_viewer is not null then select coalesce(connection_color,'neutral') into v_viewer_color from app.profiles where id=v_viewer; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'bio',left(p.bio,160),
      'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'avatarPath',p.avatar_path,
      'presentation',jsonb_build_object('version',1,'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)),
      'anonymous',v_viewer is null,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
      'viewerFollowsOwner',(select f.status from app.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
      'ownerFollowsViewer',(select f.status from app.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
    ) row_data from app.profiles p
    where p.deleted_at is null and p.visibility_mode in ('public','protected') and
      (lower(p.username) like '%'||v_pattern||'%' escape E'\\' or lower(coalesce(p.display_name,'')) like '%'||v_pattern||'%' escape E'\\') and
      (v_viewer is null or not app.social_is_blocked(v_viewer,p.id))
    order by case when lower(p.username)=v_query then 0 else 1 end,lower(p.username)
    offset greatest(0,p_offset) limit least(20,greatest(1,p_limit))
  ) q;
  return v_result;
end;
$$;

create or replace function app.get_social_person_summary(p_target uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_viewer uuid:=app.current_user_id(); v_viewer_color text:='neutral'; v_result jsonb;
begin
  if v_viewer is null then raise exception 'authentication_required'; end if;
  select coalesce(connection_color,'neutral') into v_viewer_color from app.profiles where id=v_viewer;
  select jsonb_build_object(
    'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'bio',left(p.bio,160),
    'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'avatarPath',p.avatar_path,
    'presentation',jsonb_build_object('version',1,'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)),
    'anonymous',false,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
    'viewerFollowsOwner',(select f.status from app.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
    'ownerFollowsViewer',(select f.status from app.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
  ) into v_result from app.profiles p
  where p.id=p_target and p.deleted_at is null and p.visibility_mode in ('public','protected') and not app.social_is_blocked(v_viewer,p.id);
  return v_result;
end;
$$;

revoke all on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric) from public;
grant execute on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric) to mt_runtime;


-- Source 20260722130000_theme_cloud_sync.sql sha256 3ad9c01674b79bcdc0b9236862a5e64654363cefc5b31a7d7f9de41434810c93
-- P6.1 private, revisioned custom-theme synchronization.
create table if not exists app.user_theme_preferences (
  user_id uuid primary key references native_auth."user"(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  active_theme_selection jsonb not null default '{"kind":"preset","id":"obsidian"}'::jsonb,
  custom_themes jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_theme_preferences_custom_themes_array
    check (jsonb_typeof(custom_themes) = 'array'),
  constraint user_theme_preferences_custom_theme_limit
    check (jsonb_array_length(custom_themes) <= 20),
  constraint user_theme_preferences_payload_size
    check (octet_length(custom_themes::text) <= 262144)
);

alter table app.user_theme_preferences enable row level security;

drop policy if exists user_theme_preferences_select_own on app.user_theme_preferences;
create policy user_theme_preferences_select_own
  on app.user_theme_preferences
  for select
  to mt_runtime
  using (user_id = app.current_user_id());

revoke all on table app.user_theme_preferences from public, mt_runtime;
grant select on table app.user_theme_preferences to mt_runtime;

create or replace function app.theme_sync_payload_is_valid(
  p_active_theme_selection jsonb,
  p_custom_themes jsonb
) returns boolean
language plpgsql
stable
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_theme jsonb;
  v_inputs jsonb;
  v_corrections jsonb;
  v_key text;
  v_id text;
begin
  if jsonb_typeof(p_custom_themes) <> 'array'
    or jsonb_array_length(p_custom_themes) > 20
    or octet_length(p_custom_themes::text) > 262144 then
    return false;
  end if;

  for v_theme in select value from jsonb_array_elements(p_custom_themes)
  loop
    if jsonb_typeof(v_theme) <> 'object'
      or not (v_theme ?& array['version','id','name','createdAt','updatedAt','inputs'])
      or exists (
        select 1 from jsonb_object_keys(v_theme) key
        where key not in ('version','id','name','createdAt','updatedAt','inputs','corrections')
      )
      or v_theme->>'version' <> '1'
      or coalesce(v_theme->>'id','') !~ '^ct_[A-Za-z0-9_-]{8,80}$'
      or char_length(trim(coalesce(v_theme->>'name',''))) not between 1 and 40 then
      return false;
    end if;

    begin
      perform (v_theme->>'createdAt')::timestamptz;
      perform (v_theme->>'updatedAt')::timestamptz;
    exception when others then
      return false;
    end;

    v_inputs := v_theme->'inputs';
    if jsonb_typeof(v_inputs) <> 'object'
      or not (v_inputs ?& array['colorScheme','background','surface','accent','secondaryAccent'])
      or exists (
        select 1 from jsonb_object_keys(v_inputs) key
        where key not in ('colorScheme','background','surface','accent','secondaryAccent')
      )
      or v_inputs->>'colorScheme' not in ('light','dark') then
      return false;
    end if;
    foreach v_key in array array['background','surface','accent','secondaryAccent']
    loop
      if coalesce(v_inputs->>v_key,'') !~ '^#[0-9A-Fa-f]{6}$' then return false; end if;
    end loop;

    if v_theme ? 'corrections' then
      v_corrections := v_theme->'corrections';
      if jsonb_typeof(v_corrections) <> 'object'
        or exists (
          select 1 from jsonb_object_keys(v_corrections) key
          where key not in ('textPrimary','textSecondary','textMuted','border','borderStrong','focus')
        ) then
        return false;
      end if;
      for v_key in select jsonb_object_keys(v_corrections)
      loop
        if coalesce(v_corrections->>v_key,'') !~ '^#[0-9A-Fa-f]{6}$' then return false; end if;
      end loop;
    end if;
  end loop;

  if (
    select count(*) = count(distinct value->>'id')
    from jsonb_array_elements(p_custom_themes)
  ) is not true then
    return false;
  end if;

  if jsonb_typeof(p_active_theme_selection) <> 'object'
    or not (p_active_theme_selection ?& array['kind','id'])
    or exists (
      select 1 from jsonb_object_keys(p_active_theme_selection) key
      where key not in ('kind','id')
    ) then
    return false;
  end if;

  if p_active_theme_selection->>'kind' = 'preset' then
    return p_active_theme_selection->>'id' in (
      'system','obsidian','porcelain','ocean',
      'dusty_rose','forest','lavender','polar','sepia'
    );
  end if;
  if p_active_theme_selection->>'kind' <> 'custom' then return false; end if;
  v_id := p_active_theme_selection->>'id';
  return exists (
    select 1 from jsonb_array_elements(p_custom_themes) as item(theme)
    where theme->>'id' = v_id
  );
end;
$$;

create or replace function app.get_theme_sync_state()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_user uuid := app.current_user_id();
  v_row app.user_theme_preferences%rowtype;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_row from app.user_theme_preferences where user_id = v_user;
  if not found then
    return jsonb_build_object(
      'exists',false,'schemaVersion',1,'revision',0,'updatedAt',null,
      'activeThemeSelection',jsonb_build_object('kind','preset','id','obsidian'),
      'customThemes','[]'::jsonb
    );
  end if;
  return jsonb_build_object(
    'exists',true,'schemaVersion',v_row.schema_version,'revision',v_row.revision,
    'updatedAt',v_row.updated_at,'activeThemeSelection',v_row.active_theme_selection,
    'customThemes',v_row.custom_themes
  );
end;
$$;

create or replace function app.save_theme_sync_state(
  p_expected_revision bigint,
  p_active_theme_selection jsonb,
  p_custom_themes jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare
  v_user uuid := app.current_user_id();
  v_current app.user_theme_preferences%rowtype;
  v_revision bigint;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision < 0
    or not app.theme_sync_payload_is_valid(p_active_theme_selection,p_custom_themes) then
    raise exception 'theme_sync_payload_invalid';
  end if;

  select * into v_current
  from app.user_theme_preferences
  where user_id = v_user
  for update;

  if not found then
    if p_expected_revision <> 0 then
      return jsonb_build_object(
        'ok',false,'conflict',true,'revision',0,
        'state',app.get_theme_sync_state()
      );
    end if;
    insert into app.user_theme_preferences(
      user_id,schema_version,active_theme_selection,custom_themes,revision
    ) values (
      v_user,1,p_active_theme_selection,p_custom_themes,1
    );
    v_revision := 1;
  else
    if v_current.revision <> p_expected_revision then
      return jsonb_build_object(
        'ok',false,'conflict',true,'revision',v_current.revision,
        'state',app.get_theme_sync_state()
      );
    end if;
    update app.user_theme_preferences set
      schema_version=1,
      active_theme_selection=p_active_theme_selection,
      custom_themes=p_custom_themes,
      revision=v_current.revision+1,
      updated_at=now()
    where user_id=v_user;
    v_revision := v_current.revision+1;
  end if;

  return jsonb_build_object(
    'ok',true,'conflict',false,'revision',v_revision,
    'state',app.get_theme_sync_state()
  );
end;
$$;

create or replace function app.delete_theme_sync_state()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,pg_temp
as $$
declare v_user uuid:=app.current_user_id(); v_deleted_count integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  delete from app.user_theme_preferences where user_id=v_user;
  get diagnostics v_deleted_count = row_count;
  return jsonb_build_object('ok',true,'deleted',v_deleted_count > 0);
end;
$$;

revoke all on function app.theme_sync_payload_is_valid(jsonb,jsonb) from public,mt_runtime;
revoke all on function app.get_theme_sync_state() from public,mt_runtime;
revoke all on function app.save_theme_sync_state(bigint,jsonb,jsonb) from public,mt_runtime;
revoke all on function app.delete_theme_sync_state() from public,mt_runtime;
grant execute on function app.get_theme_sync_state() to mt_runtime;
grant execute on function app.save_theme_sync_state(bigint,jsonb,jsonb) to mt_runtime;
grant execute on function app.delete_theme_sync_state() to mt_runtime;


-- Source 20260809120000_d8_public_profile_theme.sql sha256 98d42e65bdc9c15ddbf46d9346278a44ec03f3ea21f1693a0ac1260ab3037136
-- D8-2 additive public profile theme contract. Apply only through the release DB gate.
alter table app.profiles add column if not exists profile_theme_visibility text not null default 'hidden';
alter table app.profiles add column if not exists public_theme_preset text;
alter table app.profiles add column if not exists public_theme_snapshot jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_theme_visibility_check') then
    alter table app.profiles add constraint profiles_theme_visibility_check
      check (profile_theme_visibility in ('hidden','preset_only','current_theme'));
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_public_theme_preset_check') then
    alter table app.profiles add constraint profiles_public_theme_preset_check
      check (public_theme_preset is null or public_theme_preset in ('obsidian','porcelain','ocean','dusty_rose','forest','lavender','polar','sepia'));
  end if;
end $$;

create or replace function app.d8_theme_hex_luminance(p_hex text)
returns double precision language plpgsql immutable strict set search_path=pg_catalog,app,pg_temp as $$
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

create or replace function app.d8_theme_contrast(p_a text,p_b text)
returns double precision language sql immutable strict set search_path=pg_catalog,app,pg_temp as $$
  select (greatest(app.d8_theme_hex_luminance(p_a),app.d8_theme_hex_luminance(p_b))+0.05)
       / (least(app.d8_theme_hex_luminance(p_a),app.d8_theme_hex_luminance(p_b))+0.05)
$$;

create or replace function app.d8_public_theme_snapshot_valid(p_snapshot jsonb)
returns boolean language plpgsql immutable strict set search_path=pg_catalog,app,pg_temp as $$
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
  return app.d8_theme_contrast(v_tokens->>'textPrimary',v_tokens->>'background')>=4.5
    and app.d8_theme_contrast(v_tokens->>'textPrimary',v_tokens->>'surface1')>=4.5
    and app.d8_theme_contrast(v_tokens->>'textSecondary',v_tokens->>'surface1')>=4.5
    and app.d8_theme_contrast(v_tokens->>'textMuted',v_tokens->>'surface1')>=3
    and app.d8_theme_contrast(v_tokens->>'focus',v_tokens->>'surface1')>=3
    and app.d8_theme_contrast(v_tokens->>'accentContrast',v_tokens->>'accent')>=4.5;
end;
$$;

revoke all on function app.d8_theme_hex_luminance(text) from public;
revoke all on function app.d8_theme_contrast(text,text) from public;
revoke all on function app.d8_public_theme_snapshot_valid(jsonb) from public;

create or replace function app.social_save_unified_profile(
  p_username text, p_display_name text, p_tagline text, p_bio text, p_location text, p_language text,
  p_visibility_mode text, p_connection_color text, p_selected_title text,
  p_profile_palette_id text, p_banner_mode text, p_banner_position text, p_overlay_strength text,
  p_avatar_frame text, p_surface_style text, p_motif_intensity text,
  p_banner_focal_x numeric, p_banner_focal_y numeric, p_banner_zoom numeric,
  p_avatar_focal_x numeric, p_avatar_focal_y numeric, p_avatar_zoom numeric,
  p_theme_visibility text, p_public_theme_preset text, p_public_theme_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_user uuid:=app.current_user_id(); v_result jsonb; v_preset text:=nullif(trim(coalesce(p_public_theme_preset,'')),'');
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_theme_visibility not in ('hidden','preset_only','current_theme') then raise exception 'invalid_theme_visibility'; end if;
  if v_preset is not null and v_preset not in ('obsidian','porcelain','ocean','dusty_rose','forest','lavender','polar','sepia') then raise exception 'invalid_public_theme_preset'; end if;
  if p_theme_visibility='hidden' and (v_preset is not null or p_public_theme_snapshot is not null) then raise exception 'hidden_theme_payload_not_allowed'; end if;
  if p_theme_visibility='preset_only' and (v_preset is null or p_public_theme_snapshot is null) then raise exception 'preset_theme_snapshot_required'; end if;
  if p_theme_visibility='current_theme' and p_public_theme_snapshot is null then raise exception 'current_theme_snapshot_required'; end if;
  if p_public_theme_snapshot is not null and not app.d8_public_theme_snapshot_valid(p_public_theme_snapshot) then raise exception 'invalid_public_theme_snapshot'; end if;
  if p_theme_visibility='preset_only' and (p_public_theme_snapshot->>'source'<>'preset' or p_public_theme_snapshot->>'revision'<>format('preset:%s:1',v_preset)) then raise exception 'preset_theme_snapshot_mismatch'; end if;

  v_result:=app.social_save_unified_profile(
    p_username,p_display_name,p_tagline,p_bio,p_location,p_language,p_visibility_mode,p_connection_color,p_selected_title,
    p_profile_palette_id,p_banner_mode,p_banner_position,p_overlay_strength,p_avatar_frame,p_surface_style,p_motif_intensity,
    p_banner_focal_x,p_banner_focal_y,p_banner_zoom,p_avatar_focal_x,p_avatar_focal_y,p_avatar_zoom
  );
  update app.profiles set
    profile_theme_visibility=p_theme_visibility,
    public_theme_preset=case when p_theme_visibility='preset_only' then v_preset else null end,
    public_theme_snapshot=case when p_theme_visibility='hidden' then null else p_public_theme_snapshot end
  where id=v_user;
  return v_result;
end;
$$;

create or replace function app.get_unified_social_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare v_payload jsonb; v_owner uuid; v_presentation jsonb; v_tagline text; v_theme jsonb;
begin
  v_payload:=app.get_social_profile(p_username);
  if v_payload->>'status'<>'available' then return v_payload; end if;
  v_owner:=nullif(v_payload#>>'{profile,id}','')::uuid;
  select p.tagline,jsonb_build_object(
    'version',1,'paletteId',p.profile_palette_id,'bannerMode',p.banner_mode,'bannerPosition',p.banner_position,
    'overlayStrength',p.overlay_strength,'avatarFrame',p.avatar_frame,'surfaceStyle',p.surface_style,'motifIntensity',p.motif_intensity,
    'bannerTransform',jsonb_build_object('focalX',p.banner_focal_x,'focalY',p.banner_focal_y,'zoom',p.banner_zoom),
    'avatarTransform',jsonb_build_object('focalX',p.avatar_focal_x,'focalY',p.avatar_focal_y,'zoom',p.avatar_zoom)
  ),case when p.profile_theme_visibility='hidden' then null else p.public_theme_snapshot end
  into v_tagline,v_presentation,v_theme from app.profiles p where p.id=v_owner;
  v_payload:=jsonb_set(jsonb_set(v_payload,'{profile,tagline}',to_jsonb(coalesce(v_tagline,'')),true),'{profile,presentation}',coalesce(v_presentation,'{}'::jsonb),true);
  if v_theme is not null then v_payload:=jsonb_set(v_payload,'{profile,themeSnapshot}',v_theme,true); end if;
  return v_payload;
end;
$$;

revoke all on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) from public;
grant execute on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) to mt_runtime;
revoke all on function app.get_unified_social_profile(text) from public;
grant execute on function app.get_unified_social_profile(text) to mt_runtime;


-- Source 20260810120000_d8_profile_asset_visibility_hardening.sql sha256 e8e38ae173d344acc8e2c00eff9ff472d416ae734ceb917958e9651468f87ef9
-- D8-4A: public viewers may sign only the owner's currently published avatar/banner path.
create or replace function app.social_profile_asset_visible(
  p_asset_name text,
  p_owner text,
  p_viewer uuid default app.current_user_id()
) returns boolean language plpgsql stable security definer set search_path=pg_catalog,app,pg_temp as $$
declare
  v_mode text;
  v_avatar_path text;
  v_banner_path text;
begin
  if p_viewer::text=p_owner then return true; end if;
  select visibility_mode,avatar_path,banner_path
    into v_mode,v_avatar_path,v_banner_path
  from app.profiles
  where id::text=p_owner and deleted_at is null;
  if v_mode is null or v_mode not in ('public','protected') then return false; end if;
  if p_asset_name is distinct from v_avatar_path and p_asset_name is distinct from v_banner_path then return false; end if;
  if p_viewer is not null and exists(
    select 1 from app.profile_blocks where
      (blocker_id::text=p_owner and blocked_id=p_viewer) or
      (blocker_id=p_viewer and blocked_id::text=p_owner)
  ) then return false; end if;
  return true;
end;
$$;

revoke all on function app.social_profile_asset_visible(text,text,uuid) from public;
grant execute on function app.social_profile_asset_visible(text,text,uuid) to mt_runtime;



-- Source 20260811120000_d8_security_advisor_hardening.sql sha256 ec47da7d12512fcd325643eba468ce02441795e3e23d48d2d88a838ea7bd843b
-- D8-4A.5E: least-privilege closure for the exported Production Security Advisor findings.
-- Apply through the guarded migration ledger only. Production execution belongs to D8-4B.

alter function app.set_updated_at() set search_path = pg_catalog;
revoke all on function app.set_updated_at() from public,mt_runtime;








-- Start from deny-all for every SECURITY DEFINER name in the Production export.


revoke all on function app.delete_theme_sync_state() from public,mt_runtime;
revoke all on function app.get_social_person_summary(uuid) from public,mt_runtime;
revoke all on function app.get_social_profile(text) from public,mt_runtime;
revoke all on function app.get_social_recommendation_detail(uuid) from public,mt_runtime;
revoke all on function app.get_theme_sync_state() from public,mt_runtime;
revoke all on function app.get_unified_social_profile(text) from public,mt_runtime;
revoke all on function app.get_xp_dashboard(integer) from public,mt_runtime;
revoke all on function app.get_xp_public_summary(uuid) from public,mt_runtime;
revoke all on function app.list_profile_activity(uuid,integer) from public,mt_runtime;
revoke all on function app.list_social_blocks() from public,mt_runtime;
revoke all on function app.list_social_connections(uuid,text,text,integer,integer) from public,mt_runtime;
revoke all on function app.list_social_feed(timestamptz,uuid,integer) from public,mt_runtime;
revoke all on function app.list_social_notifications(timestamptz,uuid,integer) from public,mt_runtime;
revoke all on function app.list_social_recommendations(text,text,timestamptz,uuid,integer) from public,mt_runtime;
revoke all on function app.save_theme_sync_state(bigint,jsonb,jsonb) from public,mt_runtime;
revoke all on function app.search_social_profiles(text,integer,integer) from public,mt_runtime;
revoke all on function app.social_block(uuid) from public,mt_runtime;
revoke all on function app.social_can_view_activity_row(uuid,text,uuid) from public,mt_runtime;
revoke all on function app.social_can_view_module(uuid,text,uuid) from public,mt_runtime;
revoke all on function app.social_comment(uuid,uuid,text,boolean,text) from public,mt_runtime;
revoke all on function app.social_comment_action(text,uuid,text,boolean) from public,mt_runtime;
revoke all on function app.social_delete_activity(uuid) from public,mt_runtime;
revoke all on function app.social_ensure_activity_module() from public,mt_runtime;
revoke all on function app.social_follow(uuid) from public,mt_runtime;
revoke all on function app.social_follow_action(text,uuid) from public,mt_runtime;
revoke all on function app.social_get_preferences() from public,mt_runtime;
revoke all on function app.social_insert_notification(uuid,uuid,text,text,uuid,jsonb,text) from public,mt_runtime;
revoke all on function app.social_insert_recommendation_message(uuid,uuid,text,text,boolean) from public,mt_runtime;
revoke all on function app.social_is_blocked(uuid,uuid) from public,mt_runtime;
revoke all on function app.social_notification_action(text,uuid,text,uuid) from public,mt_runtime;
revoke all on function app.social_notification_allowed(uuid,text) from public,mt_runtime;
revoke all on function app.social_profile_asset_visible(text,uuid) from public,mt_runtime;
revoke all on function app.social_profile_asset_visible(text,text,uuid) from public,mt_runtime;
revoke all on function app.social_publish_activity(text,text,jsonb,integer,text,text,text) from public,mt_runtime;
revoke all on function app.social_react(uuid,uuid,text) from public,mt_runtime;
revoke all on function app.social_recommendation_transition(uuid,text,text,boolean,text,text) from public,mt_runtime;
revoke all on function app.social_replace_showcase(text,jsonb) from public,mt_runtime;
revoke all on function app.social_report(uuid,uuid,text,text) from public,mt_runtime;
revoke all on function app.social_save_preferences(text,jsonb) from public,mt_runtime;
revoke all on function app.social_save_profile(text,text,text,text,text,text,text,text) from public,mt_runtime;
revoke all on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric) from public,mt_runtime;
revoke all on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) from public,mt_runtime;
revoke all on function app.social_send_recommendation(uuid,jsonb,text,text) from public,mt_runtime;
revoke all on function app.social_send_recommendation_message(uuid,text,text) from public,mt_runtime;
revoke all on function app.social_share_note(text,text,text,text,text,boolean,text,boolean) from public,mt_runtime;
revoke all on function app.social_unblock(uuid) from public,mt_runtime;
revoke all on function app.social_unshare_note(uuid) from public,mt_runtime;
revoke all on function app.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public,mt_runtime;
revoke all on function app.xp_apply_event(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean) from public,mt_runtime;
revoke all on function app.xp_award_recommendation_completion(uuid) from public,mt_runtime;
revoke all on function app.xp_convert_legacy_local_state(uuid) from public,mt_runtime;
revoke all on function app.xp_evaluate_quests(uuid) from public,mt_runtime;
revoke all on function app.xp_profile_entitlement_trigger() from public,mt_runtime;
revoke all on function app.xp_recommendation_event_trigger() from public,mt_runtime;
revoke all on function app.xp_recommendation_feedback_trigger() from public,mt_runtime;
revoke all on function app.xp_reconcile_entitlement(uuid,text,text,boolean,text,text,jsonb,jsonb) from public,mt_runtime;
revoke all on function app.xp_reconcile_media_state(uuid,jsonb) from public,mt_runtime;
revoke all on function app.xp_repair_selected_title(uuid) from public,mt_runtime;
revoke all on function app.xp_select_badges(text[]) from public,mt_runtime;
revoke all on function app.xp_select_title(text) from public,mt_runtime;
revoke all on function app.xp_showcase_trigger() from public,mt_runtime;
revoke all on function app.xp_sync_media_states(jsonb,boolean) from public,mt_runtime;

-- PUBLIC_READ: the SQL body enforces public/profile/module visibility.
grant execute on function app.get_social_profile(text) to mt_runtime;
grant execute on function app.get_unified_social_profile(text) to mt_runtime;
grant execute on function app.get_xp_public_summary(uuid) to mt_runtime;
grant execute on function app.list_profile_activity(uuid,integer) to mt_runtime;
grant execute on function app.list_social_connections(uuid,text,text,integer,integer) to mt_runtime;
grant execute on function app.search_social_profiles(text,integer,integer) to mt_runtime;
grant execute on function app.social_profile_asset_visible(text,text,uuid) to mt_runtime;

-- AUTHENTICATED_READ: private owner/participant state or viewer relationship data.
grant execute on function app.get_social_person_summary(uuid) to mt_runtime;
grant execute on function app.get_social_recommendation_detail(uuid) to mt_runtime;
grant execute on function app.get_theme_sync_state() to mt_runtime;
grant execute on function app.get_xp_dashboard(integer) to mt_runtime;
grant execute on function app.list_social_blocks() to mt_runtime;
grant execute on function app.list_social_feed(timestamptz,uuid,integer) to mt_runtime;
grant execute on function app.list_social_notifications(timestamptz,uuid,integer) to mt_runtime;
grant execute on function app.list_social_recommendations(text,text,timestamptz,uuid,integer) to mt_runtime;
grant execute on function app.social_get_preferences() to mt_runtime;

-- AUTHENTICATED_MUTATION: every entry derives the owner/actor from app.current_user_id().


grant execute on function app.delete_theme_sync_state() to mt_runtime;
grant execute on function app.save_theme_sync_state(bigint,jsonb,jsonb) to mt_runtime;
grant execute on function app.social_block(uuid) to mt_runtime;
grant execute on function app.social_comment(uuid,uuid,text,boolean,text) to mt_runtime;
grant execute on function app.social_comment_action(text,uuid,text,boolean) to mt_runtime;
grant execute on function app.social_delete_activity(uuid) to mt_runtime;
grant execute on function app.social_follow(uuid) to mt_runtime;
grant execute on function app.social_follow_action(text,uuid) to mt_runtime;
grant execute on function app.social_notification_action(text,uuid,text,uuid) to mt_runtime;
grant execute on function app.social_publish_activity(text,text,jsonb,integer,text,text,text) to mt_runtime;
grant execute on function app.social_react(uuid,uuid,text) to mt_runtime;
grant execute on function app.social_recommendation_transition(uuid,text,text,boolean,text,text) to mt_runtime;
grant execute on function app.social_replace_showcase(text,jsonb) to mt_runtime;
grant execute on function app.social_report(uuid,uuid,text,text) to mt_runtime;
grant execute on function app.social_save_preferences(text,jsonb) to mt_runtime;
grant execute on function app.social_save_profile(text,text,text,text,text,text,text,text) to mt_runtime;
grant execute on function app.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) to mt_runtime;
grant execute on function app.social_send_recommendation(uuid,jsonb,text,text) to mt_runtime;
grant execute on function app.social_send_recommendation_message(uuid,text,text) to mt_runtime;
grant execute on function app.social_share_note(text,text,text,text,text,boolean,text,boolean) to mt_runtime;
grant execute on function app.social_unblock(uuid) to mt_runtime;
grant execute on function app.social_unshare_note(uuid) to mt_runtime;
grant execute on function app.xp_select_badges(text[]) to mt_runtime;
grant execute on function app.xp_select_title(text) to mt_runtime;
grant execute on function app.xp_sync_media_states(jsonb,boolean) to mt_runtime;

do $d8_security_advisor_postcheck$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app' and p.proname='set_updated_at'
      and p.proconfig @> array['search_path=pg_catalog']
  ) then raise exception 'd8_set_updated_at_search_path_not_fixed'; end if;

  if to_regclass('app.embedding_cache') is not null then raise exception 'native_dormant_cache_unexpected'; end if;

  if not has_function_privilege('mt_runtime','app.social_block(uuid)','EXECUTE')
    or not has_function_privilege('mt_runtime','app.xp_sync_media_states(jsonb,boolean)','EXECUTE')
    or has_function_privilege('mt_runtime','app.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean)','EXECUTE')
    or not has_function_privilege('mt_runtime','app.get_unified_social_profile(text)','EXECUTE')
    or not has_function_privilege('mt_runtime','app.get_theme_sync_state()','EXECUTE')
  then raise exception 'd8_security_definer_grant_matrix_invalid'; end if;
end;
$d8_security_advisor_postcheck$;

ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profiles TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.recommendation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recommendation_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.recommendation_feedback TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_username_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_username_history FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_username_history TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_modules FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_modules TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_media_showcase ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_media_showcase FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_media_showcase TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_stats_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_stats_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_stats_snapshots TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_progression_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_progression_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_progression_snapshots TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_shared_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_shared_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_shared_notes TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_follows FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_follows TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.profile_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profile_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.profile_blocks TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_activity_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_activity_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_activity_preferences TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_activity_events FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_activity_events TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_activity_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_activity_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_activity_comments TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_reactions FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_reactions TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_recommendations TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_recommendation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_recommendation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_recommendation_events TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_notification_preferences TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_notifications TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_reports TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.social_recommendation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.social_recommendation_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.social_recommendation_messages TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_events FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_events TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_event_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_event_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_event_allocations TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_user_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_user_totals FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_user_totals TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_user_world_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_user_world_totals FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_user_world_totals TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_user_branch_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_user_branch_totals FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_user_branch_totals TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_legacy_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_legacy_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_legacy_imports TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_quest_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_quest_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_quest_definitions TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_user_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_user_quest_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_user_quest_progress TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_badge_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_badge_definitions TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_user_badges FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_user_badges TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_media_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_media_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_media_entitlements TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.xp_local_state_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.xp_local_state_conversions FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.xp_local_state_conversions TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
ALTER TABLE app.user_theme_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_theme_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY native_function_owner ON app.user_theme_preferences TO mt_owner USING(current_user='mt_owner') WITH CHECK(current_user='mt_owner');
GRANT SELECT ON app.profiles TO mt_runtime;
GRANT SELECT ON app.profile_modules TO mt_runtime;
GRANT SELECT ON app.profile_media_showcase TO mt_runtime;
GRANT SELECT ON app.profile_shared_notes TO mt_runtime;
GRANT SELECT ON app.social_activity_preferences TO mt_runtime;
GRANT SELECT ON app.social_notification_preferences TO mt_runtime;
GRANT SELECT,INSERT,UPDATE ON app.profile_modules TO mt_runtime;
GRANT SELECT,INSERT,UPDATE ON app.profile_stats_snapshots TO mt_runtime;
GRANT SELECT,INSERT,UPDATE ON app.profile_progression_snapshots TO mt_runtime;
RESET ROLE;
COMMIT;
