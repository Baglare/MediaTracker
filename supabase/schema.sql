-- ============================================
-- MediaTracker — Supabase PostgreSQL Schema
-- ============================================
-- Bu dosya doğrudan Supabase SQL Editor'da çalıştırılabilir.
-- Tabloları, indeksleri, RLS policy'lerini ve updated_at trigger'larını içerir.
--
-- Service role key gerektiren hiçbir işlem yapılmaz.
-- Tüm policy'ler auth.uid() üzerinden çalışır.
-- ============================================

-- ============================================
-- 0. Yardımcı: updated_at otomatik güncelleme fonksiyonu
-- ============================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================
-- 1. profiles
-- ============================================
-- Auth kullanıcılarına bağlı profil tablosu.
-- İlk aşamada kullanılmayacak; ileride hesap ekranı için hazır.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================
-- 2. media_items
-- ============================================
-- Kullanıcının takip ettiği her medya kaydı.
-- Kaynaklara özel alanlar (numberOfSeasons, authors, episodes vb.)
-- esnek olması için `metadata jsonb` içinde saklanır.
create table if not exists public.media_items (
  -- id text: yerel uygulama kaynak-id'lerini ("tvmaze-123" vb.) korumak için.
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null,
  status text not null,
  current_progress integer not null default 0,
  total_progress integer not null default 1,
  external_source text,
  external_id text,
  cover_url text,
  backdrop_url text,
  overview text,
  release_year integer,
  favorite boolean not null default false,
  user_rating integer,
  tags text[] not null default '{}',
  personal_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint media_items_progress_nonneg check (current_progress >= 0),
  constraint media_items_total_nonneg check (total_progress >= 0),
  constraint media_items_user_rating_range
    check (user_rating is null or (user_rating between 0 and 10))
);

drop trigger if exists media_items_set_updated_at on public.media_items;
create trigger media_items_set_updated_at
  before update on public.media_items
  for each row execute function public.set_updated_at();

-- ---- Indexler ----
create index if not exists media_items_user_id_idx
  on public.media_items (user_id);

create index if not exists media_items_user_type_idx
  on public.media_items (user_id, type);

create index if not exists media_items_user_status_idx
  on public.media_items (user_id, status);

create index if not exists media_items_user_favorite_idx
  on public.media_items (user_id, favorite);

create index if not exists media_items_user_external_idx
  on public.media_items (user_id, external_source, external_id);

create index if not exists media_items_updated_at_idx
  on public.media_items (updated_at);

-- ---- Aynı kullanıcı için aynı dış kaynak/id duplicate olmasın ----
-- external_source ve external_id null olabileceği için partial unique index.
create unique index if not exists media_items_user_external_unique
  on public.media_items (user_id, external_source, external_id)
  where external_source is not null and external_id is not null;

-- ============================================
-- 3. progress_logs
-- ============================================
-- Append-only ilerleme geçmişi.
-- Medya silinse bile kayıtlar saklanır (media_id null'a düşer,
-- media_title/media_type log anında snapshot alındığı için okunur).
create table if not exists public.progress_logs (
  -- id text: yerel uygulama log id'lerini ("log-...") korumak için.
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id text references public.media_items(id) on delete set null,
  media_title text not null,
  media_type text not null,
  action text not null,
  amount integer not null,
  unit text not null,
  previous_progress integer not null,
  new_progress integer not null,
  created_at timestamptz not null default now()
);

create index if not exists progress_logs_user_id_idx
  on public.progress_logs (user_id);

create index if not exists progress_logs_user_created_idx
  on public.progress_logs (user_id, created_at desc);

create index if not exists progress_logs_media_id_idx
  on public.progress_logs (media_id);

create index if not exists progress_logs_user_media_idx
  on public.progress_logs (user_id, media_id);

-- ============================================
-- 4. recommendation_feedback
-- ============================================
-- R52: AI Danışman öneri kartı etkileşimleri için ileride cloud sync'e hazır
-- append-only event tablosu. Uygulama şu aşamada localStorage'ı kesin kaynak
-- olarak kullanır; bu tablo Supabase kurulumları için hazır şemadır.
create table if not exists public.recommendation_feedback (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
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
    check (action in ('shown', 'dismissed', 'similar_requested', 'added', 'open_discover'))
);

create index if not exists recommendation_feedback_user_created_idx
  on public.recommendation_feedback (user_id, created_at desc);

create index if not exists recommendation_feedback_user_action_idx
  on public.recommendation_feedback (user_id, action);

create index if not exists recommendation_feedback_user_external_idx
  on public.recommendation_feedback (user_id, external_source, external_id);

-- ============================================
-- 5. embedding_cache
-- ============================================
-- R61: Teknik embedding cache. Kullanıcıya bağlı veri tutmaz; embedding metninin
-- tamamı yerine kısa preview ve hash saklanır. Vector jsonb olarak tutulur; bu
-- turda pgvector similarity query yoktur.
create table if not exists public.embedding_cache (
  id text primary key,
  provider text not null,
  model text not null,
  hash text not null,
  dimensions integer not null,
  vector jsonb not null,
  text_preview text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),

  constraint embedding_cache_dimensions_positive check (dimensions > 0),
  constraint embedding_cache_vector_array check (jsonb_typeof(vector) = 'array')
);

create unique index if not exists embedding_cache_provider_model_hash_dimensions_unique
  on public.embedding_cache (provider, model, hash, dimensions);

create index if not exists embedding_cache_last_used_idx
  on public.embedding_cache (last_used_at);

-- ============================================
-- 6. Row Level Security
-- ============================================
alter table public.profiles      enable row level security;
alter table public.media_items   enable row level security;
alter table public.progress_logs enable row level security;
alter table public.recommendation_feedback enable row level security;
alter table public.embedding_cache enable row level security;

-- ---- profiles ----
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---- media_items ----
drop policy if exists media_items_select_own on public.media_items;
create policy media_items_select_own
  on public.media_items for select
  using (auth.uid() = user_id);

drop policy if exists media_items_insert_own on public.media_items;
create policy media_items_insert_own
  on public.media_items for insert
  with check (auth.uid() = user_id);

drop policy if exists media_items_update_own on public.media_items;
create policy media_items_update_own
  on public.media_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists media_items_delete_own on public.media_items;
create policy media_items_delete_own
  on public.media_items for delete
  using (auth.uid() = user_id);

-- ---- progress_logs ----
drop policy if exists progress_logs_select_own on public.progress_logs;
create policy progress_logs_select_own
  on public.progress_logs for select
  using (auth.uid() = user_id);

drop policy if exists progress_logs_insert_own on public.progress_logs;
create policy progress_logs_insert_own
  on public.progress_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists progress_logs_update_own on public.progress_logs;
create policy progress_logs_update_own
  on public.progress_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists progress_logs_delete_own on public.progress_logs;
create policy progress_logs_delete_own
  on public.progress_logs for delete
  using (auth.uid() = user_id);

-- ---- recommendation_feedback ----
drop policy if exists recommendation_feedback_select_own on public.recommendation_feedback;
create policy recommendation_feedback_select_own
  on public.recommendation_feedback for select
  using (auth.uid() = user_id);

drop policy if exists recommendation_feedback_insert_own on public.recommendation_feedback;
create policy recommendation_feedback_insert_own
  on public.recommendation_feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists recommendation_feedback_update_own on public.recommendation_feedback;
create policy recommendation_feedback_update_own
  on public.recommendation_feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists recommendation_feedback_delete_own on public.recommendation_feedback;
create policy recommendation_feedback_delete_own
  on public.recommendation_feedback for delete
  using (auth.uid() = user_id);

-- ---- embedding_cache ----
-- Server-only teknik cache. Service role RLS'i bypass eder; anon/auth rolleri
-- için hiçbir public politika tanımlanmaz.
drop policy if exists embedding_cache_select_global on public.embedding_cache;
drop policy if exists embedding_cache_insert_global on public.embedding_cache;
drop policy if exists embedding_cache_update_global on public.embedding_cache;
drop policy if exists embedding_cache_delete_global on public.embedding_cache;

-- ============================================================
-- SOCIAL PROFILE FOUNDATION
-- Canonical migration: supabase/migrations/20260721_social_profile_foundation.sql
-- ============================================================
-- MediaTracker Social Phase 1 foundation
-- Apply manually with the Supabase CLI or SQL Editor. Idempotent where PostgreSQL permits.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists language text;
alter table public.profiles add column if not exists visibility_mode text not null default 'personal';
alter table public.profiles add column if not exists connection_color text not null default 'neutral';
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists banner_path text;
alter table public.profiles add column if not exists selected_title text;
alter table public.profiles add column if not exists follow_list_visibility text not null default 'public';
alter table public.profiles add column if not exists layout_mode text not null default 'grid';
alter table public.profiles add column if not exists joined_at timestamptz not null default now();
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists username_changed_at timestamptz;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username)) where username is not null and deleted_at is null;
create index if not exists profiles_search_idx
  on public.profiles (lower(username), lower(display_name)) where deleted_at is null and visibility_mode <> 'personal';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format_check') then
    alter table public.profiles add constraint profiles_username_format_check check (
      username is null or (
        username = lower(username) and length(username) between 3 and 24 and
        username ~ '^[a-z0-9_]+$' and username !~ '^_' and username !~ '_$' and username !~ '__'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_social_text_check') then
    alter table public.profiles add constraint profiles_social_text_check check (
      length(coalesce(display_name, '')) <= 60 and length(bio) <= 500 and
      length(coalesce(location, '')) <= 80 and length(coalesce(language, '')) <= 12 and
      length(coalesce(selected_title, '')) <= 60 and
      display_name !~ '[<>]' and bio !~ '[<>]' and coalesce(location, '') !~ '[<>]' and coalesce(selected_title, '') !~ '[<>]'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_language_check') then
    alter table public.profiles add constraint profiles_language_check check (
      language is null or language in ('tr','en','de','fr','es','it','pt','ja','ko','zh','other')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_visibility_mode_check') then
    alter table public.profiles add constraint profiles_visibility_mode_check check (visibility_mode in ('public', 'protected', 'personal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_connection_color_check') then
    alter table public.profiles add constraint profiles_connection_color_check check (
      connection_color in ('neutral', 'violet', 'blue', 'cyan', 'emerald', 'amber', 'orange', 'red', 'rose', 'pink')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_follow_visibility_check') then
    alter table public.profiles add constraint profiles_follow_visibility_check check (follow_list_visibility in ('public', 'followers', 'mutual', 'self'));
  end if;
end $$;

create table if not exists public.profile_username_history (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  claimed_at timestamptz not null default now(),
  released_at timestamptz not null default now(),
  reserved_until timestamptz not null default (now() + interval '90 days'),
  constraint profile_username_history_format_check check (
    username = lower(username) and length(username) between 3 and 24 and username ~ '^[a-z0-9_]+$'
  )
);
create index if not exists profile_username_history_lookup_idx on public.profile_username_history (lower(username), reserved_until desc);
create index if not exists profile_username_history_user_idx on public.profile_username_history (user_id, released_at desc);

create table if not exists public.profile_modules (
  user_id uuid not null references auth.users(id) on delete cascade,
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
create index if not exists profile_modules_owner_order_idx on public.profile_modules (user_id, mobile_order);

create table if not exists public.profile_media_showcase (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
create unique index if not exists profile_showcase_order_unique on public.profile_media_showcase (user_id, showcase_kind, sort_order);
create unique index if not exists profile_showcase_media_unique on public.profile_media_showcase (
  user_id, showcase_kind, coalesce(external_source, ''), coalesce(external_id, ''), lower(title), media_type
);

create table if not exists public.profile_stats_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
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

create table if not exists public.profile_progression_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
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

create table if not exists public.profile_shared_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
create index if not exists profile_shared_notes_owner_idx on public.profile_shared_notes (user_id, created_at desc);

create table if not exists public.profile_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint profile_follows_no_self_check check (follower_id <> following_id),
  constraint profile_follows_status_check check (status in ('pending','accepted'))
);
create index if not exists profile_follows_following_status_idx on public.profile_follows (following_id, status, created_at desc);
create index if not exists profile_follows_follower_status_idx on public.profile_follows (follower_id, status, created_at desc);

create table if not exists public.profile_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint profile_blocks_no_self_check check (blocker_id <> blocked_id)
);
create index if not exists profile_blocks_blocked_idx on public.profile_blocks (blocked_id, blocker_id);

drop trigger if exists profile_modules_set_updated_at on public.profile_modules;
create trigger profile_modules_set_updated_at before update on public.profile_modules for each row execute function public.set_updated_at();
drop trigger if exists profile_media_showcase_set_updated_at on public.profile_media_showcase;
create trigger profile_media_showcase_set_updated_at before update on public.profile_media_showcase for each row execute function public.set_updated_at();
drop trigger if exists profile_stats_set_updated_at on public.profile_stats_snapshots;
create trigger profile_stats_set_updated_at before update on public.profile_stats_snapshots for each row execute function public.set_updated_at();
drop trigger if exists profile_progression_set_updated_at on public.profile_progression_snapshots;
create trigger profile_progression_set_updated_at before update on public.profile_progression_snapshots for each row execute function public.set_updated_at();
drop trigger if exists profile_shared_notes_set_updated_at on public.profile_shared_notes;
create trigger profile_shared_notes_set_updated_at before update on public.profile_shared_notes for each row execute function public.set_updated_at();
drop trigger if exists profile_follows_set_updated_at on public.profile_follows;
create trigger profile_follows_set_updated_at before update on public.profile_follows for each row execute function public.set_updated_at();

alter table public.profile_username_history enable row level security;
alter table public.profile_modules enable row level security;
alter table public.profile_media_showcase enable row level security;
alter table public.profile_stats_snapshots enable row level security;
alter table public.profile_progression_snapshots enable row level security;
alter table public.profile_shared_notes enable row level security;
alter table public.profile_follows enable row level security;
alter table public.profile_blocks enable row level security;

drop policy if exists profile_username_history_select_own on public.profile_username_history;
create policy profile_username_history_select_own on public.profile_username_history for select using (auth.uid() = user_id);
drop policy if exists profile_modules_own_all on public.profile_modules;
create policy profile_modules_own_all on public.profile_modules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists profile_showcase_own_all on public.profile_media_showcase;
create policy profile_showcase_own_all on public.profile_media_showcase for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists profile_stats_own_all on public.profile_stats_snapshots;
create policy profile_stats_own_all on public.profile_stats_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists profile_progression_own_all on public.profile_progression_snapshots;
create policy profile_progression_own_all on public.profile_progression_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists profile_shared_notes_own_all on public.profile_shared_notes;
create policy profile_shared_notes_own_all on public.profile_shared_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists profile_follows_select_involved on public.profile_follows;
create policy profile_follows_select_involved on public.profile_follows for select using (auth.uid() in (follower_id, following_id));
drop policy if exists profile_blocks_select_own on public.profile_blocks;
create policy profile_blocks_select_own on public.profile_blocks for select using (auth.uid() = blocker_id);

create or replace function public.social_is_blocked(p_first uuid, p_second uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profile_blocks
    where (blocker_id = p_first and blocked_id = p_second) or (blocker_id = p_second and blocked_id = p_first)
  );
$$;

create or replace function public.social_can_view_module(p_owner uuid, p_visibility text, p_viewer uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_viewer = p_owner then return true; end if;
  if exists (select 1 from public.profile_blocks where (blocker_id=p_owner and blocked_id=p_viewer) or (blocker_id=p_viewer and blocked_id=p_owner)) then return false; end if;
  if p_visibility = 'public' then return true; end if;
  if p_viewer is null or p_visibility = 'self' then return false; end if;
  if not exists (select 1 from public.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted') then return false; end if;
  if p_visibility = 'followers' then return true; end if;
  return p_visibility = 'mutual' and exists (
    select 1 from public.profile_follows where follower_id=p_owner and following_id=p_viewer and status='accepted'
  );
end;
$$;

create or replace function public.social_save_profile(
  p_username text, p_display_name text, p_bio text, p_location text, p_language text,
  p_visibility_mode text, p_connection_color text, p_selected_title text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_username text := lower(trim(p_username));
  v_current public.profiles%rowtype;
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
  select * into v_current from public.profiles where id=v_user for update;
  if exists (select 1 from public.profiles where lower(username)=v_username and id<>v_user and deleted_at is null) then raise exception 'username_taken'; end if;
  if exists (select 1 from public.profile_username_history where lower(username)=v_username and user_id<>v_user and reserved_until>now()) then raise exception 'username_reserved'; end if;

  if v_current.id is not null and v_current.username is distinct from v_username then
    if v_current.username is not null and v_current.username_changed_at > now() - interval '30 days' then raise exception 'username_cooldown'; end if;
    if v_current.username is not null then
      insert into public.profile_username_history(user_id, username, claimed_at, released_at, reserved_until)
      values(v_user, v_current.username, coalesce(v_current.username_changed_at, v_current.created_at), now(), now()+interval '90 days');
    end if;
  end if;

  insert into public.profiles(id, username, display_name, bio, location, language, visibility_mode, connection_color, selected_title, username_changed_at)
  values(v_user, v_username, trim(p_display_name), coalesce(p_bio,''), nullif(trim(coalesce(p_location,'')),''), nullif(lower(trim(coalesce(p_language,''))),''), p_visibility_mode, p_connection_color, nullif(trim(coalesce(p_selected_title,'')),''), now())
  on conflict(id) do update set
    username=excluded.username, display_name=excluded.display_name, bio=excluded.bio, location=excluded.location,
    language=excluded.language, visibility_mode=excluded.visibility_mode, connection_color=excluded.connection_color,
    selected_title=excluded.selected_title,
    username_changed_at=case when profiles.username is distinct from excluded.username then now() else profiles.username_changed_at end,
    deleted_at=null;

  if p_visibility_mode='personal' then delete from public.profile_follows where following_id=v_user and status='pending'; end if;

  insert into public.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order)
  values
    (v_user,'favorites',true,'public',0,0,8,2,0),(v_user,'current',true,'followers',8,0,4,2,1),
    (v_user,'stats',true,'public',0,2,6,2,2),(v_user,'progression',true,'public',6,2,6,2,3),
    (v_user,'badges',false,'public',0,4,4,2,4),(v_user,'follows',true,'public',4,4,4,2,5),
    (v_user,'shared_lists',false,'public',8,4,4,2,6),(v_user,'shared_notes',true,'self',0,6,12,2,7)
  on conflict(user_id,module_key) do nothing;

  return jsonb_build_object('ok',true,'username',v_username);
end;
$$;

create or replace function public.social_follow(p_target uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid:=auth.uid(); v_mode text; v_status text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_user=p_target then raise exception 'self_follow_not_allowed'; end if;
  if public.social_is_blocked(v_user,p_target) then raise exception 'profile_unavailable'; end if;
  select visibility_mode into v_mode from public.profiles where id=p_target and deleted_at is null;
  if v_mode is null or v_mode='personal' then raise exception 'profile_unavailable'; end if;
  if exists(select 1 from public.profile_follows where follower_id=v_user and following_id=p_target) then raise exception 'follow_exists'; end if;
  v_status:=case when v_mode='public' then 'accepted' else 'pending' end;
  insert into public.profile_follows(follower_id,following_id,status,responded_at)
  values(v_user,p_target,v_status,case when v_status='accepted' then now() else null end);
  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

create or replace function public.social_follow_action(p_action text, p_other uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid:=auth.uid(); v_count integer:=0;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_action='unfollow' then delete from public.profile_follows where follower_id=v_user and following_id=p_other and status='accepted';
  elsif p_action='cancel' then delete from public.profile_follows where follower_id=v_user and following_id=p_other and status='pending';
  elsif p_action='accept' then update public.profile_follows set status='accepted',responded_at=now() where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='reject' then delete from public.profile_follows where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='remove_follower' then delete from public.profile_follows where follower_id=p_other and following_id=v_user and status='accepted';
  else raise exception 'invalid_follow_action'; end if;
  get diagnostics v_count = row_count;
  if v_count=0 then raise exception 'relationship_not_found'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.social_block(p_target uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_user=p_target then raise exception 'self_block_not_allowed'; end if;
  insert into public.profile_blocks(blocker_id,blocked_id) values(v_user,p_target) on conflict do nothing;
  delete from public.profile_follows where (follower_id=v_user and following_id=p_target) or (follower_id=p_target and following_id=v_user);
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.social_unblock(p_target uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  delete from public.profile_blocks where blocker_id=auth.uid() and blocked_id=p_target;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.social_replace_showcase(p_kind text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit integer; v_count integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_kind not in ('favorites','current') or jsonb_typeof(p_items)<>'array' then raise exception 'invalid_showcase'; end if;
  v_limit:=case when p_kind='favorites' then 5 else 6 end;
  v_count:=jsonb_array_length(p_items);
  if v_count>v_limit then raise exception 'showcase_limit'; end if;
  delete from public.profile_media_showcase where user_id=v_user and showcase_kind=p_kind;
  insert into public.profile_media_showcase(user_id,showcase_kind,title,media_type,external_source,external_id,cover_url,world,sort_order)
  select v_user,p_kind,x.title,x.media_type,nullif(x.external_source,''),nullif(x.external_id,''),nullif(x.cover_url,''),x.world,x.sort_order
  from jsonb_to_recordset(p_items) as x(title text,media_type text,external_source text,external_id text,cover_url text,world text,sort_order integer);
  return jsonb_build_object('ok',true,'count',v_count);
end;
$$;

create or replace function public.social_share_note(
  p_media_title text, p_media_type text, p_external_source text, p_external_id text,
  p_content text, p_contains_spoiler boolean, p_visibility text, p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_confirmed is distinct from true then raise exception 'explicit_confirmation_required'; end if;
  if length(trim(coalesce(p_media_title,''))) not between 1 and 180 or length(trim(coalesce(p_content,''))) not between 1 and 2000 then raise exception 'invalid_shared_note'; end if;
  if p_media_title ~ '[<>]' or p_content ~ '[<>]' then raise exception 'html_not_allowed'; end if;
  if p_media_type not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') then raise exception 'invalid_media_type'; end if;
  if p_visibility not in ('public','followers','mutual') then raise exception 'invalid_visibility'; end if;
  insert into public.profile_shared_notes(user_id,media_title,media_type,external_source,external_id,content,contains_spoiler,visibility,confirmed_at)
  values(v_user,trim(p_media_title),p_media_type,nullif(trim(coalesce(p_external_source,'')),''),nullif(trim(coalesce(p_external_id,'')),''),trim(p_content),p_contains_spoiler,p_visibility,now())
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.social_unshare_note(p_note uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  delete from public.profile_shared_notes where id=p_note and user_id=auth.uid();
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'shared_note_not_found'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.get_social_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public, storage, pg_temp as $$
declare
  v_viewer uuid:=auth.uid(); v_owner public.profiles%rowtype; v_redirect text;
  v_out text; v_in text; v_self boolean; v_viewer_color text:='neutral'; v_modules jsonb; v_favorites jsonb; v_current jsonb;
  v_stats jsonb; v_progression jsonb; v_notes jsonb; v_followers bigint; v_following bigint;
begin
  select * into v_owner from public.profiles where lower(username)=lower(trim(p_username)) and deleted_at is null;
  if v_owner.id is null then
    select p.username into v_redirect from public.profile_username_history h join public.profiles p on p.id=h.user_id
    where lower(h.username)=lower(trim(p_username)) and h.reserved_until>now() and p.deleted_at is null order by h.released_at desc limit 1;
    if v_redirect is not null then return jsonb_build_object('status','not_found','redirectUsername',v_redirect); end if;
    return jsonb_build_object('status','not_found');
  end if;
  v_self:=v_viewer is not null and v_viewer=v_owner.id;
  if v_viewer is not null then select coalesce(connection_color,'neutral') into v_viewer_color from public.profiles where id=v_viewer; end if;
  if not v_self and v_viewer is not null and public.social_is_blocked(v_viewer,v_owner.id) then return jsonb_build_object('status','unavailable'); end if;
  if v_owner.visibility_mode='personal' and not v_self then return jsonb_build_object('status','personal'); end if;

  select status into v_out from public.profile_follows where follower_id=v_viewer and following_id=v_owner.id;
  select status into v_in from public.profile_follows where follower_id=v_owner.id and following_id=v_viewer;
  select count(*) into v_followers from public.profile_follows where following_id=v_owner.id and status='accepted';
  select count(*) into v_following from public.profile_follows where follower_id=v_owner.id and status='accepted';
  select coalesce(jsonb_agg(jsonb_build_object(
    'moduleKey',module_key,'enabled',enabled,'visibility',visibility,'gridX',grid_x,'gridY',grid_y,
    'gridWidth',grid_width,'gridHeight',grid_height,'mobileOrder',mobile_order,'config',config
  ) order by mobile_order),'[]'::jsonb) into v_modules
  from public.profile_modules where user_id=v_owner.id and enabled and public.social_can_view_module(v_owner.id,visibility,v_viewer);

  if exists(select 1 from public.profile_modules where user_id=v_owner.id and module_key='favorites' and enabled and public.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select coalesce(jsonb_agg(jsonb_build_object('title',title,'mediaType',media_type,'externalSource',external_source,'externalId',external_id,'coverUrl',cover_url,'world',world,'sortOrder',sort_order) order by sort_order),'[]'::jsonb)
    into v_favorites from public.profile_media_showcase where user_id=v_owner.id and showcase_kind='favorites';
  else v_favorites:='[]'::jsonb; end if;
  if exists(select 1 from public.profile_modules where user_id=v_owner.id and module_key='current' and enabled and public.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select coalesce(jsonb_agg(jsonb_build_object('title',title,'mediaType',media_type,'externalSource',external_source,'externalId',external_id,'coverUrl',cover_url,'world',world,'sortOrder',sort_order) order by sort_order),'[]'::jsonb)
    into v_current from public.profile_media_showcase where user_id=v_owner.id and showcase_kind='current';
  else v_current:='[]'::jsonb; end if;
  if exists(select 1 from public.profile_modules where user_id=v_owner.id and module_key='stats' and enabled and public.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select jsonb_build_object('totalMedia',total_media,'completed',completed,'active',active,'planning',planning,'favorites',favorites,'rated',rated,'worldCounts',world_counts,'snapshotAt',snapshot_at)
    into v_stats from public.profile_stats_snapshots where user_id=v_owner.id;
  end if;
  if exists(select 1 from public.profile_modules where user_id=v_owner.id and module_key='progression' and enabled and public.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select jsonb_build_object('version',version,'totalXp',total_xp,'level',level,'title',title,'tier',tier,'dominantWorld',dominant_world,'progressPercent',progress_percent,'worldCounts',world_counts,'snapshotAt',snapshot_at)
    into v_progression from public.profile_progression_snapshots where user_id=v_owner.id;
  end if;
  if exists(select 1 from public.profile_modules where user_id=v_owner.id and module_key='shared_notes' and enabled and public.social_can_view_module(v_owner.id,visibility,v_viewer)) then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'mediaTitle',media_title,'mediaType',media_type,'externalSource',external_source,'externalId',external_id,'content',content,'containsSpoiler',contains_spoiler,'visibility',visibility,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc),'[]'::jsonb)
    into v_notes from public.profile_shared_notes where user_id=v_owner.id and public.social_can_view_module(v_owner.id,visibility,v_viewer);
  else v_notes:='[]'::jsonb; end if;

  return jsonb_build_object(
    'status','available',
    'profile',jsonb_build_object('id',v_owner.id,'username',v_owner.username,'displayName',coalesce(v_owner.display_name,v_owner.username),'bio',v_owner.bio,'location',v_owner.location,'language',v_owner.language,'visibilityMode',v_owner.visibility_mode,'connectionColor',v_owner.connection_color,'avatarPath',v_owner.avatar_path,'bannerPath',v_owner.banner_path,'joinedAt',v_owner.joined_at,'selectedTitle',v_owner.selected_title,'followerCount',v_followers,'followingCount',v_following),
    'relationship',jsonb_build_object('viewerFollowsOwner',v_out,'ownerFollowsViewer',v_in,'self',v_self,'anonymous',v_viewer is null,'viewerConnectionColor',v_viewer_color),
    'modules',v_modules,'favorites',v_favorites,'current',v_current,'stats',v_stats,'progression',v_progression,'sharedNotes',v_notes
  );
end;
$$;

create or replace function public.search_social_profiles(p_query text, p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_viewer uuid:=auth.uid(); v_viewer_color text:='neutral'; v_query text:=lower(trim(p_query)); v_pattern text; v_result jsonb;
begin
  if length(v_query)<2 or length(v_query)>60 then raise exception 'invalid_search_query'; end if;
  v_pattern:=replace(replace(replace(v_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  if v_viewer is not null then select coalesce(connection_color,'neutral') into v_viewer_color from public.profiles where id=v_viewer; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'bio',left(p.bio,160),
      'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'avatarPath',p.avatar_path,
      'anonymous',v_viewer is null,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
      'viewerFollowsOwner',(select f.status from public.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
      'ownerFollowsViewer',(select f.status from public.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
    ) as row_data
    from public.profiles p
    where p.deleted_at is null and p.visibility_mode in ('public','protected') and
      (lower(p.username) like '%'||v_pattern||'%' escape E'\\' or lower(coalesce(p.display_name,'')) like '%'||v_pattern||'%' escape E'\\') and
      (v_viewer is null or not public.social_is_blocked(v_viewer,p.id))
    order by case when lower(p.username)=v_query then 0 else 1 end, lower(p.username)
    offset greatest(0,p_offset) limit least(20,greatest(1,p_limit))
  ) q;
  return v_result;
end;
$$;

create or replace function public.list_social_blocks()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.blocked_id,'username',case when p.deleted_at is null then p.username else null end,
    'displayName',case when p.deleted_at is null then coalesce(p.display_name,p.username) else 'Kullanılamayan hesap' end
  ) order by b.created_at desc),'[]'::jsonb) into v_result
  from public.profile_blocks b left join public.profiles p on p.id=b.blocked_id where b.blocker_id=v_user;
  return v_result;
end;
$$;

create or replace function public.list_social_connections(
  p_owner uuid, p_kind text, p_query text default '', p_offset integer default 0, p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_viewer uuid:=auth.uid(); v_mode text; v_visibility text; v_result jsonb; v_query text:=lower(trim(coalesce(p_query,''))); v_pattern text;
begin
  if p_kind not in ('followers','following','pending') or length(v_query)>60 then raise exception 'invalid_connection_query'; end if;
  v_pattern:=replace(replace(replace(v_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  select visibility_mode,follow_list_visibility into v_mode,v_visibility from public.profiles where id=p_owner and deleted_at is null;
  if v_mode is null then return '[]'::jsonb; end if;
  if p_kind='pending' and v_viewer is distinct from p_owner then return '[]'::jsonb; end if;
  if p_kind<>'pending' and (
    (v_mode='personal' and v_viewer is distinct from p_owner) or
    not public.social_can_view_module(p_owner,v_visibility,v_viewer) or
    not exists(select 1 from public.profile_modules where user_id=p_owner and module_key='follows' and enabled and public.social_can_view_module(p_owner,visibility,v_viewer))
  ) then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path,
      'visibilityMode',p.visibility_mode,'connectionColor',p.connection_color,'status',f.status,
      'viewerFollowsOwner',(select vf.status from public.profile_follows vf where vf.follower_id=v_viewer and vf.following_id=p.id),
      'ownerFollowsViewer',(select ofl.status from public.profile_follows ofl where ofl.follower_id=p.id and ofl.following_id=v_viewer)
    ) row_data
    from public.profile_follows f
    join public.profiles p on p.id=case when p_kind='following' then f.following_id else f.follower_id end
    where
      ((p_kind='following' and f.follower_id=p_owner and f.status='accepted') or
       (p_kind='followers' and f.following_id=p_owner and f.status='accepted') or
       (p_kind='pending' and f.following_id=p_owner and f.status='pending')) and
      p.deleted_at is null and p.visibility_mode<>'personal' and
      (v_query='' or lower(p.username) like '%'||v_pattern||'%' escape E'\\' or lower(coalesce(p.display_name,'')) like '%'||v_pattern||'%' escape E'\\') and
      not public.social_is_blocked(p_owner,p.id)
    order by f.created_at desc, lower(p.username)
    offset greatest(0,p_offset) limit least(20,greatest(1,p_limit))
  ) q;
  return v_result;
end;
$$;

create or replace function public.social_profile_asset_visible(p_owner text, p_viewer uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_mode text;
begin
  if p_viewer::text=p_owner then return true; end if;
  select visibility_mode into v_mode from public.profiles where id::text=p_owner and deleted_at is null;
  if v_mode is null or v_mode not in ('public','protected') then return false; end if;
  if p_viewer is not null and exists(
    select 1 from public.profile_blocks where
      (blocker_id::text=p_owner and blocked_id=p_viewer) or (blocker_id=p_viewer and blocked_id::text=p_owner)
  ) then return false; end if;
  return true;
end;
$$;

revoke all on function public.social_is_blocked(uuid,uuid) from public;
revoke all on function public.social_can_view_module(uuid,text,uuid) from public;
revoke all on function public.social_profile_asset_visible(text,uuid) from public;
revoke all on function public.social_save_profile(text,text,text,text,text,text,text,text) from public;
revoke all on function public.social_follow(uuid) from public;
revoke all on function public.social_follow_action(text,uuid) from public;
revoke all on function public.social_block(uuid) from public;
revoke all on function public.social_unblock(uuid) from public;
revoke all on function public.social_replace_showcase(text,jsonb) from public;
revoke all on function public.social_share_note(text,text,text,text,text,boolean,text,boolean) from public;
revoke all on function public.social_unshare_note(uuid) from public;
revoke all on function public.list_social_blocks() from public;
grant execute on function public.social_save_profile(text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.social_follow(uuid) to authenticated;
grant execute on function public.social_follow_action(text,uuid) to authenticated;
grant execute on function public.social_block(uuid) to authenticated;
grant execute on function public.social_unblock(uuid) to authenticated;
grant execute on function public.social_replace_showcase(text,jsonb) to authenticated;
grant execute on function public.social_share_note(text,text,text,text,text,boolean,text,boolean) to authenticated;
grant execute on function public.social_unshare_note(uuid) to authenticated;
grant execute on function public.list_social_blocks() to authenticated;
grant execute on function public.get_social_profile(text) to anon, authenticated;
grant execute on function public.search_social_profiles(text,integer,integer) to anon, authenticated;
grant execute on function public.list_social_connections(uuid,text,text,integer,integer) to anon, authenticated;
grant execute on function public.social_profile_asset_visible(text,uuid) to anon, authenticated;

-- Social identity changes must go through social_save_profile so username
-- history and cooldown cannot be bypassed with a direct table update.
revoke insert, update on table public.profiles from authenticated;
grant update (avatar_path, banner_path) on table public.profiles to authenticated;
revoke insert, update, delete on table public.profile_shared_notes from authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-assets','profile-assets',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists profile_assets_insert_own on storage.objects;
create policy profile_assets_insert_own on storage.objects for insert to authenticated
with check (bucket_id='profile-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists profile_assets_update_own on storage.objects;
create policy profile_assets_update_own on storage.objects for update to authenticated
using (bucket_id='profile-assets' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='profile-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists profile_assets_delete_own on storage.objects;
create policy profile_assets_delete_own on storage.objects for delete to authenticated
using (bucket_id='profile-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists profile_assets_select_visible on storage.objects;
create policy profile_assets_select_visible on storage.objects for select to anon, authenticated using (
  bucket_id='profile-assets' and (
    (storage.foldername(name))[1]=auth.uid()::text or
    public.social_profile_asset_visible((storage.foldername(name))[1], auth.uid())
  )
);
