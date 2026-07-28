begin;

-- Core bootstrap preflight. This migration targets a blank Supabase project.
-- Supabase owns auth/storage; the application only verifies their contracts.
do $core_baseline_preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'core_baseline_requires_postgresql_15';
  end if;

  if to_regclass('auth.users') is null
    or to_regprocedure('auth.uid()') is null
    or not exists (select 1 from pg_roles where rolname='anon')
    or not exists (select 1 from pg_roles where rolname='authenticated') then
    raise exception 'core_baseline_missing_supabase_auth';
  end if;

  if to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null
    or to_regprocedure('storage.foldername(text)') is null then
    raise exception 'core_baseline_missing_supabase_storage';
  end if;

  if to_regprocedure('pg_catalog.gen_random_uuid()') is null
    or to_regprocedure('pg_catalog.sha256(bytea)') is null
    or to_regprocedure('pg_catalog.hashtextextended(text,bigint)') is null then
    raise exception 'core_baseline_missing_postgresql_capability';
  end if;

  if to_regprocedure('public.set_updated_at()') is not null
    or to_regclass('public.profiles') is not null
    or to_regclass('public.media_items') is not null
    or to_regclass('public.progress_logs') is not null
    or to_regclass('public.recommendation_feedback') is not null
    or to_regclass('public.embedding_cache') is not null then
    raise exception 'core_baseline_target_objects_already_exist';
  end if;
end;
$core_baseline_preflight$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.media_items (
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
    check (user_rating is null or user_rating between 0 and 10)
);

create trigger media_items_set_updated_at
  before update on public.media_items
  for each row execute function public.set_updated_at();

create index media_items_user_id_idx
  on public.media_items (user_id);
create index media_items_user_type_idx
  on public.media_items (user_id, type);
create index media_items_user_status_idx
  on public.media_items (user_id, status);
create index media_items_user_favorite_idx
  on public.media_items (user_id, favorite);
create index media_items_user_external_idx
  on public.media_items (user_id, external_source, external_id);
create index media_items_updated_at_idx
  on public.media_items (updated_at);
create unique index media_items_user_external_unique
  on public.media_items (user_id, external_source, external_id)
  where external_source is not null and external_id is not null;

create table public.progress_logs (
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

create index progress_logs_user_id_idx
  on public.progress_logs (user_id);
create index progress_logs_user_created_idx
  on public.progress_logs (user_id, created_at desc);
create index progress_logs_media_id_idx
  on public.progress_logs (media_id);
create index progress_logs_user_media_idx
  on public.progress_logs (user_id, media_id);

create table public.recommendation_feedback (
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

create index recommendation_feedback_user_created_idx
  on public.recommendation_feedback (user_id, created_at desc);
create index recommendation_feedback_user_action_idx
  on public.recommendation_feedback (user_id, action);
create index recommendation_feedback_user_external_idx
  on public.recommendation_feedback (user_id, external_source, external_id);

create table public.embedding_cache (
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
  constraint embedding_cache_vector_array
    check (jsonb_typeof(vector) = 'array')
);

create unique index embedding_cache_provider_model_hash_dimensions_unique
  on public.embedding_cache (provider, model, hash, dimensions);
create index embedding_cache_last_used_idx
  on public.embedding_cache (last_used_at);

alter table public.profiles enable row level security;
alter table public.media_items enable row level security;
alter table public.progress_logs enable row level security;
alter table public.recommendation_feedback enable row level security;
alter table public.embedding_cache enable row level security;

create policy profiles_select_own
  on public.profiles for select
  using (auth.uid() = id);
create policy profiles_insert_own
  on public.profiles for insert
  with check (auth.uid() = id);
create policy profiles_update_own
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy media_items_select_own
  on public.media_items for select
  using (auth.uid() = user_id);
create policy media_items_insert_own
  on public.media_items for insert
  with check (auth.uid() = user_id);
create policy media_items_update_own
  on public.media_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy media_items_delete_own
  on public.media_items for delete
  using (auth.uid() = user_id);

create policy progress_logs_select_own
  on public.progress_logs for select
  using (auth.uid() = user_id);
create policy progress_logs_insert_own
  on public.progress_logs for insert
  with check (auth.uid() = user_id);
create policy progress_logs_update_own
  on public.progress_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy progress_logs_delete_own
  on public.progress_logs for delete
  using (auth.uid() = user_id);

create policy recommendation_feedback_select_own
  on public.recommendation_feedback for select
  using (auth.uid() = user_id);
create policy recommendation_feedback_insert_own
  on public.recommendation_feedback for insert
  with check (auth.uid() = user_id);
create policy recommendation_feedback_update_own
  on public.recommendation_feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy recommendation_feedback_delete_own
  on public.recommendation_feedback for delete
  using (auth.uid() = user_id);

-- embedding_cache is server-only. RLS remains enabled without client policies.

commit;
