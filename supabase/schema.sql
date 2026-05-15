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
-- Global teknik cache: user_id yok. Anon/auth client okuyup yazabilir; veri
-- kullanıcı kimliği içermez ve app runtime service role gerektirmeden çalışır.
drop policy if exists embedding_cache_select_global on public.embedding_cache;
create policy embedding_cache_select_global
  on public.embedding_cache for select
  using (true);

drop policy if exists embedding_cache_insert_global on public.embedding_cache;
create policy embedding_cache_insert_global
  on public.embedding_cache for insert
  with check (true);

drop policy if exists embedding_cache_update_global on public.embedding_cache;
create policy embedding_cache_update_global
  on public.embedding_cache for update
  using (true)
  with check (true);
