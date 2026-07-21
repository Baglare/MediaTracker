-- MediaTracker Social Phase 2: activity, comments, reactions, recommendations and notifications.
-- Apply manually after 20260721121000. This migration does not write XP.

alter table public.profiles
  add column if not exists recommendation_permission text not null default 'mutual';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_recommendation_permission_check') then
    alter table public.profiles add constraint profiles_recommendation_permission_check
      check (recommendation_permission in ('mutual','following','followers','everyone','none'));
  end if;
end $$;

alter table public.profile_modules drop constraint if exists profile_modules_key_check;
alter table public.profile_modules add constraint profile_modules_key_check
  check (module_key in ('favorites','current','stats','progression','badges','follows','shared_lists','shared_notes','activity'));

insert into public.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order,config)
select id,'activity',true,'followers',0,8,12,2,8,'{}'::jsonb
from public.profiles where deleted_at is null
on conflict(user_id,module_key) do nothing;

create or replace function public.social_ensure_activity_module()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.username is not null and new.deleted_at is null then
    insert into public.profile_modules(user_id,module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order,config)
    values(new.id,'activity',true,'followers',0,8,12,2,8,'{}'::jsonb)
    on conflict(user_id,module_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_ensure_activity_module on public.profiles;
create trigger profiles_ensure_activity_module after insert or update of username,deleted_at on public.profiles for each row execute function public.social_ensure_activity_module();

create table if not exists public.social_activity_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  share_completed boolean not null default true,
  share_started boolean not null default false,
  share_rating boolean not null default false,
  share_favorite boolean not null default false,
  share_recommendation_completed boolean not null default false,
  default_visibility text not null default 'followers',
  updated_at timestamptz not null default now(),
  constraint social_activity_preferences_visibility_check check (default_visibility in ('public','followers','mutual','self'))
);

create table if not exists public.social_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
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
create index if not exists social_activity_feed_idx on public.social_activity_events(created_at desc,id desc) where deleted_at is null;
create index if not exists social_activity_actor_idx on public.social_activity_events(actor_id,created_at desc) where deleted_at is null;

create table if not exists public.social_activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.social_activity_events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid references public.social_activity_comments(id) on delete cascade,
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
create index if not exists social_comments_activity_idx on public.social_activity_comments(activity_id,created_at,id);
create index if not exists social_comments_parent_idx on public.social_activity_comments(parent_comment_id,created_at,id) where parent_comment_id is not null;

create table if not exists public.social_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.social_activity_events(id) on delete cascade,
  comment_id uuid references public.social_activity_comments(id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_reactions_one_target_check check ((activity_id is not null)::integer + (comment_id is not null)::integer = 1),
  constraint social_reactions_type_check check (reaction_type in ('like','love','interesting','celebrate'))
);
create unique index if not exists social_reactions_activity_unique on public.social_reactions(user_id,activity_id) where activity_id is not null;
create unique index if not exists social_reactions_comment_unique on public.social_reactions(user_id,comment_id) where comment_id is not null;
create index if not exists social_reactions_activity_idx on public.social_reactions(activity_id) where activity_id is not null;
create index if not exists social_reactions_comment_idx on public.social_reactions(comment_id) where comment_id is not null;

create table if not exists public.social_recommendations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
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
  on public.social_recommendations(sender_id,recipient_id,canonical_media_key)
  where response_status in ('pending','deferred') or (response_status='accepted' and progress_status <> 'completed');
create index if not exists social_recommendations_recipient_idx on public.social_recommendations(recipient_id,created_at desc,id desc);
create index if not exists social_recommendations_sender_idx on public.social_recommendations(sender_id,created_at desc,id desc);

create table if not exists public.social_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.social_recommendations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  dedupe_key text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint social_recommendation_event_type_check check (event_type in ('sent','deferred','accepted','rejected','withdrawn','linked','started','completed')),
  constraint social_recommendation_event_metadata_check check (jsonb_typeof(safe_metadata)='object'),
  unique(recommendation_id,dedupe_key)
);
create index if not exists social_recommendation_events_idx on public.social_recommendation_events(recommendation_id,occurred_at,id);

create table if not exists public.social_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
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

create table if not exists public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
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
create index if not exists social_notifications_recipient_idx on public.social_notifications(recipient_id,created_at desc,id desc) where deleted_at is null;
create index if not exists social_notifications_unread_idx on public.social_notifications(recipient_id,created_at desc) where read_at is null and deleted_at is null;

create table if not exists public.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.social_activity_events(id) on delete cascade,
  comment_id uuid references public.social_activity_comments(id) on delete cascade,
  category text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint social_reports_one_target_check check ((activity_id is not null)::integer + (comment_id is not null)::integer = 1),
  constraint social_reports_category_check check (category in ('spam','harassment','spoiler','inappropriate','other')),
  constraint social_reports_note_check check (note is null or (length(note) <= 500 and note !~ '[<>]'))
);
create unique index if not exists social_reports_activity_unique on public.social_reports(reporter_id,activity_id) where activity_id is not null;
create unique index if not exists social_reports_comment_unique on public.social_reports(reporter_id,comment_id) where comment_id is not null;

drop trigger if exists social_activity_preferences_set_updated_at on public.social_activity_preferences;
create trigger social_activity_preferences_set_updated_at before update on public.social_activity_preferences for each row execute function public.set_updated_at();
drop trigger if exists social_activity_events_set_updated_at on public.social_activity_events;
create trigger social_activity_events_set_updated_at before update on public.social_activity_events for each row execute function public.set_updated_at();
drop trigger if exists social_activity_comments_set_updated_at on public.social_activity_comments;
create trigger social_activity_comments_set_updated_at before update on public.social_activity_comments for each row execute function public.set_updated_at();
drop trigger if exists social_reactions_set_updated_at on public.social_reactions;
create trigger social_reactions_set_updated_at before update on public.social_reactions for each row execute function public.set_updated_at();
drop trigger if exists social_recommendations_set_updated_at on public.social_recommendations;
create trigger social_recommendations_set_updated_at before update on public.social_recommendations for each row execute function public.set_updated_at();
drop trigger if exists social_notification_preferences_set_updated_at on public.social_notification_preferences;
create trigger social_notification_preferences_set_updated_at before update on public.social_notification_preferences for each row execute function public.set_updated_at();

alter table public.social_activity_preferences enable row level security;
alter table public.social_activity_events enable row level security;
alter table public.social_activity_comments enable row level security;
alter table public.social_reactions enable row level security;
alter table public.social_recommendations enable row level security;
alter table public.social_recommendation_events enable row level security;
alter table public.social_notification_preferences enable row level security;
alter table public.social_notifications enable row level security;
alter table public.social_reports enable row level security;

create or replace function public.social_can_view_activity_row(p_owner uuid,p_visibility text,p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when p_viewer=p_owner then true
    when p_viewer is not null and public.social_is_blocked(p_owner,p_viewer) then false
    when not exists(select 1 from public.profiles where id=p_owner and deleted_at is null) then false
    when (select visibility_mode from public.profiles where id=p_owner)='personal' then false
    when (select visibility_mode from public.profiles where id=p_owner)='protected'
      and not exists(select 1 from public.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted') then false
    when p_visibility='public' then true
    when p_viewer is null then false
    when p_visibility='followers' then exists(select 1 from public.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted')
    when p_visibility='mutual' then
      exists(select 1 from public.profile_follows where follower_id=p_viewer and following_id=p_owner and status='accepted') and
      exists(select 1 from public.profile_follows where follower_id=p_owner and following_id=p_viewer and status='accepted')
    else false end;
$$;
revoke all on function public.social_can_view_activity_row(uuid,text,uuid) from public;

drop policy if exists social_activity_preferences_own on public.social_activity_preferences;
create policy social_activity_preferences_own on public.social_activity_preferences for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists social_activity_visible on public.social_activity_events;
create policy social_activity_visible on public.social_activity_events for select using(deleted_at is null and public.social_can_view_activity_row(actor_id,visibility,auth.uid()));
drop policy if exists social_activity_owner on public.social_activity_events;
create policy social_activity_owner on public.social_activity_events for all using(auth.uid()=actor_id) with check(auth.uid()=actor_id);
drop policy if exists social_comments_visible on public.social_activity_comments;
create policy social_comments_visible on public.social_activity_comments for select using(exists(select 1 from public.social_activity_events a where a.id=activity_id and a.deleted_at is null and public.social_can_view_activity_row(a.actor_id,a.visibility,auth.uid())));
drop policy if exists social_comments_owner on public.social_activity_comments;
create policy social_comments_owner on public.social_activity_comments for all using(auth.uid()=author_id) with check(auth.uid()=author_id);
drop policy if exists social_reactions_visible on public.social_reactions;
create policy social_reactions_visible on public.social_reactions for select using(
  (activity_id is not null and exists(select 1 from public.social_activity_events a where a.id=activity_id and a.deleted_at is null and public.social_can_view_activity_row(a.actor_id,a.visibility,auth.uid()))) or
  (comment_id is not null and exists(select 1 from public.social_activity_comments c join public.social_activity_events a on a.id=c.activity_id where c.id=comment_id and c.deleted_at is null and a.deleted_at is null and public.social_can_view_activity_row(a.actor_id,a.visibility,auth.uid())))
);
drop policy if exists social_reactions_owner on public.social_reactions;
create policy social_reactions_owner on public.social_reactions for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists social_recommendations_participants on public.social_recommendations;
create policy social_recommendations_participants on public.social_recommendations for select using(auth.uid() in (sender_id,recipient_id));
drop policy if exists social_recommendation_events_participants on public.social_recommendation_events;
create policy social_recommendation_events_participants on public.social_recommendation_events for select using(exists(select 1 from public.social_recommendations r where r.id=recommendation_id and auth.uid() in (r.sender_id,r.recipient_id)));
drop policy if exists social_notification_preferences_own on public.social_notification_preferences;
create policy social_notification_preferences_own on public.social_notification_preferences for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists social_notifications_recipient on public.social_notifications;
create policy social_notifications_recipient on public.social_notifications for select using(auth.uid()=recipient_id);
drop policy if exists social_reports_own on public.social_reports;
create policy social_reports_own on public.social_reports for select using(auth.uid()=reporter_id);

create or replace function public.social_notification_allowed(p_recipient uuid,p_type text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when p_type in ('follow_request_received','follow_request_accepted','new_follower') then coalesce((select follow_notifications from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_comment','comment_reply') then coalesce((select comment_notifications from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_reaction','comment_reaction') then coalesce((select reaction_notifications from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_received' then coalesce((select recommendation_received from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_accepted' or p_type='recommendation_deferred' then coalesce((select recommendation_accepted from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_started' then coalesce((select recommendation_started from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_completed' then coalesce((select recommendation_completed from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_rejected' then coalesce((select recommendation_rejected from public.social_notification_preferences where user_id=p_recipient),false)
    when p_type='recommendation_withdrawn' then coalesce((select recommendation_withdrawn from public.social_notification_preferences where user_id=p_recipient),true)
    else false end;
$$;
revoke all on function public.social_notification_allowed(uuid,text) from public;

create or replace function public.social_insert_notification(p_recipient uuid,p_actor uuid,p_type text,p_entity_type text,p_entity_id uuid,p_payload jsonb,p_dedupe text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_recipient is null or p_recipient=p_actor or public.social_is_blocked(p_recipient,p_actor) then return; end if;
  if not public.social_notification_allowed(p_recipient,p_type) then return; end if;
  insert into public.social_notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,safe_payload,dedupe_key)
  values(p_recipient,p_actor,p_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),p_dedupe)
  on conflict(recipient_id,dedupe_key) do nothing;
end;
$$;
revoke all on function public.social_insert_notification(uuid,uuid,text,text,uuid,jsonb,text) from public;

create or replace function public.social_get_preferences()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_profile public.profiles%rowtype; v_activity public.social_activity_preferences%rowtype; v_notification public.social_notification_preferences%rowtype;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_profile from public.profiles where id=v_user and deleted_at is null;
  if not found or v_profile.username is null then return jsonb_build_object('configured',false); end if;
  insert into public.social_activity_preferences(user_id) values(v_user) on conflict do nothing;
  insert into public.social_notification_preferences(user_id) values(v_user) on conflict do nothing;
  select * into v_activity from public.social_activity_preferences where user_id=v_user;
  select * into v_notification from public.social_notification_preferences where user_id=v_user;
  return jsonb_build_object('configured',true,'recommendationPermission',v_profile.recommendation_permission,
    'activity',jsonb_build_object('shareCompleted',v_activity.share_completed,'shareStarted',v_activity.share_started,'shareRating',v_activity.share_rating,'shareFavorite',v_activity.share_favorite,'shareRecommendationCompleted',v_activity.share_recommendation_completed,'defaultVisibility',v_activity.default_visibility),
    'notifications',jsonb_build_object('follow',v_notification.follow_notifications,'comments',v_notification.comment_notifications,'reactions',v_notification.reaction_notifications,'recommendationReceived',v_notification.recommendation_received,'recommendationAccepted',v_notification.recommendation_accepted,'recommendationStarted',v_notification.recommendation_started,'recommendationCompleted',v_notification.recommendation_completed,'recommendationRejected',v_notification.recommendation_rejected,'recommendationWithdrawn',v_notification.recommendation_withdrawn));
end;
$$;

create or replace function public.social_save_preferences(p_kind text,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_values)<>'object' then raise exception 'invalid_preferences'; end if;
  if p_kind='activity' then
    if coalesce(p_values->>'defaultVisibility','followers') not in ('public','followers','mutual','self') then raise exception 'invalid_visibility'; end if;
    insert into public.social_activity_preferences(user_id,share_completed,share_started,share_rating,share_favorite,share_recommendation_completed,default_visibility)
    values(v_user,coalesce((p_values->>'shareCompleted')::boolean,true),coalesce((p_values->>'shareStarted')::boolean,false),coalesce((p_values->>'shareRating')::boolean,false),coalesce((p_values->>'shareFavorite')::boolean,false),coalesce((p_values->>'shareRecommendationCompleted')::boolean,false),coalesce(p_values->>'defaultVisibility','followers'))
    on conflict(user_id) do update set share_completed=excluded.share_completed,share_started=excluded.share_started,share_rating=excluded.share_rating,share_favorite=excluded.share_favorite,share_recommendation_completed=excluded.share_recommendation_completed,default_visibility=excluded.default_visibility;
  elsif p_kind='notifications' then
    insert into public.social_notification_preferences(user_id,follow_notifications,comment_notifications,reaction_notifications,recommendation_received,recommendation_accepted,recommendation_started,recommendation_completed,recommendation_rejected,recommendation_withdrawn)
    values(v_user,coalesce((p_values->>'follow')::boolean,true),coalesce((p_values->>'comments')::boolean,true),coalesce((p_values->>'reactions')::boolean,true),coalesce((p_values->>'recommendationReceived')::boolean,true),coalesce((p_values->>'recommendationAccepted')::boolean,true),coalesce((p_values->>'recommendationStarted')::boolean,true),coalesce((p_values->>'recommendationCompleted')::boolean,true),coalesce((p_values->>'recommendationRejected')::boolean,false),coalesce((p_values->>'recommendationWithdrawn')::boolean,true))
    on conflict(user_id) do update set follow_notifications=excluded.follow_notifications,comment_notifications=excluded.comment_notifications,reaction_notifications=excluded.reaction_notifications,recommendation_received=excluded.recommendation_received,recommendation_accepted=excluded.recommendation_accepted,recommendation_started=excluded.recommendation_started,recommendation_completed=excluded.recommendation_completed,recommendation_rejected=excluded.recommendation_rejected,recommendation_withdrawn=excluded.recommendation_withdrawn;
  elsif p_kind='recommendations' then
    if p_values->>'permission' not in ('mutual','following','followers','everyone','none') then raise exception 'invalid_recommendation_permission'; end if;
    update public.profiles set recommendation_permission=p_values->>'permission' where id=v_user and deleted_at is null;
  else raise exception 'invalid_preferences_kind'; end if;
  return public.social_get_preferences();
end;
$$;

create or replace function public.social_publish_activity(p_event_type text,p_visibility text,p_media jsonb,p_rating integer,p_short_text text,p_source_event_id text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_profile_mode text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select visibility_mode into v_profile_mode from public.profiles where id=v_user and username is not null and deleted_at is null;
  if v_profile_mode is null then raise exception 'social_profile_required'; end if;
  if p_event_type not in ('media_started','media_completed','rating_shared','favorite_shared','shared_note_published','recommendation_completed','manual_media_share') then raise exception 'invalid_activity_type'; end if;
  if p_visibility not in ('public','followers','mutual','self') then raise exception 'invalid_visibility'; end if;
  if jsonb_typeof(p_media)<>'object' or length(coalesce(p_media->>'title','')) not between 1 and 180 or coalesce(p_media->>'mediaType','') not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') or coalesce(p_media->>'world','') not in ('east','screen','arch') then raise exception 'invalid_media_snapshot'; end if;
  if p_event_type='manual_media_share' and (select count(*) from public.social_activity_events where actor_id=v_user and event_type='manual_media_share' and created_at >= now()-interval '1 day') >= 30 then raise exception 'rate_limit'; end if;
  insert into public.social_activity_events(actor_id,event_type,visibility,media_snapshot,rating,short_text,source_event_id,dedupe_key)
  values(v_user,p_event_type,case when v_profile_mode='personal' then 'self' else p_visibility end,p_media,p_rating,nullif(btrim(p_short_text),''),p_source_event_id,p_dedupe_key)
  on conflict(actor_id,dedupe_key) do update set updated_at=public.social_activity_events.updated_at returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.social_delete_activity(p_activity uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update public.social_activity_events set deleted_at=now() where id=p_activity and actor_id=auth.uid() and deleted_at is null;
  if not found then raise exception 'activity_not_found'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.list_social_feed(p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc,(item->>'id')::uuid desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',a.id,'eventType',a.event_type,'visibility',a.visibility,'media',a.media_snapshot,'rating',a.rating,'text',a.short_text,'createdAt',a.created_at,'updatedAt',a.updated_at,
      'actor',jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path),
      'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'parentCommentId',c.parent_comment_id,'body',case when c.deleted_at is null and c.hidden_by_owner_at is null then c.body else null end,'spoiler',c.spoiler,'deleted',c.deleted_at is not null or c.hidden_by_owner_at is not null,'createdAt',c.created_at,'updatedAt',c.updated_at,'author',jsonb_build_object('id',cp.id,'username',cp.username,'displayName',coalesce(cp.display_name,cp.username),'avatarPath',cp.avatar_path),'reactions',coalesce((select jsonb_object_agg(reaction_type,total) from (select reaction_type,count(*) total from public.social_reactions where comment_id=c.id group by reaction_type) cr),'{}'::jsonb),'viewerReaction',(select reaction_type from public.social_reactions where comment_id=c.id and user_id=v_user)) order by c.created_at,c.id)
        from public.social_activity_comments c join public.profiles cp on cp.id=c.author_id
        where c.activity_id=a.id and not public.social_is_blocked(v_user,c.author_id)),'[]'::jsonb),
      'reactions',coalesce((select jsonb_object_agg(reaction_type,total) from (select reaction_type,count(*) total from public.social_reactions where activity_id=a.id group by reaction_type) rc),'{}'::jsonb),
      'viewerReaction',(select reaction_type from public.social_reactions where activity_id=a.id and user_id=v_user),
      'commentCount',(select count(*) from public.social_activity_comments where activity_id=a.id and deleted_at is null and hidden_by_owner_at is null)) item
    from public.social_activity_events a join public.profiles p on p.id=a.actor_id
    where a.deleted_at is null and p.deleted_at is null and p.visibility_mode<>'personal'
      and (a.actor_id=v_user or exists(select 1 from public.profile_follows f where f.follower_id=v_user and f.following_id=a.actor_id and f.status='accepted'))
      and public.social_can_view_activity_row(a.actor_id,a.visibility,v_user)
      and (p_cursor_created_at is null or (a.created_at,a.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by a.created_at desc,a.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function public.list_profile_activity(p_owner uuid,p_limit integer default 8)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) from (
    select a.created_at,jsonb_build_object('id',a.id,'eventType',a.event_type,'visibility',a.visibility,'media',a.media_snapshot,'rating',a.rating,'text',a.short_text,'createdAt',a.created_at) item
    from public.social_activity_events a where a.actor_id=p_owner and a.deleted_at is null and public.social_can_view_activity_row(a.actor_id,a.visibility,auth.uid())
    order by a.created_at desc,a.id desc limit least(greatest(coalesce(p_limit,8),1),10)
  ) q;
$$;

create or replace function public.social_comment(p_activity uuid,p_parent uuid,p_body text,p_spoiler boolean,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_activity public.social_activity_events%rowtype; v_parent public.social_activity_comments%rowtype; v_root uuid; v_id uuid; v_target uuid; v_type text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if length(btrim(coalesce(p_body,''))) not between 1 and 1000 or p_body ~ '[<>]' then raise exception 'invalid_comment'; end if;
  select * into v_activity from public.social_activity_events where id=p_activity and deleted_at is null;
  if not found or not public.social_can_view_activity_row(v_activity.actor_id,v_activity.visibility,v_user) then raise exception 'activity_unavailable'; end if;
  if (select count(*) from public.social_activity_comments where author_id=v_user and created_at>=now()-interval '1 hour')>=60 then raise exception 'rate_limit'; end if;
  if exists(select 1 from public.social_activity_comments where author_id=v_user and activity_id=p_activity and body=btrim(p_body) and created_at>=now()-interval '2 minutes') then raise exception 'duplicate_comment'; end if;
  if p_parent is not null then
    select * into v_parent from public.social_activity_comments where id=p_parent and activity_id=p_activity and deleted_at is null and hidden_by_owner_at is null;
    if not found then raise exception 'parent_comment_unavailable'; end if;
    v_root:=coalesce(v_parent.parent_comment_id,v_parent.id); v_target:=v_parent.author_id; v_type:='comment_reply';
  else v_root:=null; v_target:=v_activity.actor_id; v_type:='activity_comment'; end if;
  insert into public.social_activity_comments(activity_id,author_id,parent_comment_id,body,spoiler,dedupe_key)
  values(p_activity,v_user,v_root,btrim(p_body),coalesce(p_spoiler,false),p_dedupe_key) returning id into v_id;
  perform public.social_insert_notification(v_target,v_user,v_type,case when v_type='comment_reply' then 'comment' else 'activity' end,case when v_type='comment_reply' then v_id else p_activity end,jsonb_build_object('activityId',p_activity),v_type||':'||v_id::text);
  return jsonb_build_object('ok',true,'id',v_id,'parentCommentId',v_root);
end;
$$;

create or replace function public.social_comment_action(p_action text,p_comment uuid,p_body text default null,p_spoiler boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_comment public.social_activity_comments%rowtype; v_owner uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select c.*
  into v_comment
  from public.social_activity_comments c
  where c.id = p_comment;

  if not found then
    raise exception 'comment_not_found';
  end if;

  select a.actor_id
  into v_owner
  from public.social_activity_events a
  where a.id = v_comment.activity_id;

  if not found then
    raise exception 'activity_not_found';
  end if;
  if p_action='edit' then
    if v_comment.author_id<>v_user or v_comment.deleted_at is not null then raise exception 'not_allowed'; end if;
    if length(btrim(coalesce(p_body,''))) not between 1 and 1000 or p_body ~ '[<>]' then raise exception 'invalid_comment'; end if;
    update public.social_activity_comments set body=btrim(p_body),spoiler=coalesce(p_spoiler,false) where id=p_comment;
  elsif p_action='delete' then
    if v_comment.author_id<>v_user and v_owner<>v_user then raise exception 'not_allowed'; end if;
    update public.social_activity_comments set deleted_at=now() where id=p_comment and deleted_at is null;
  elsif p_action='hide' then
    if v_owner<>v_user then raise exception 'not_allowed'; end if;
    update public.social_activity_comments set hidden_by_owner_at=now() where id=p_comment;
  else raise exception 'invalid_comment_action'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.social_react(p_activity uuid,p_comment uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_existing text; v_activity public.social_activity_events%rowtype; v_comment public.social_activity_comments%rowtype; v_owner uuid; v_id uuid; v_type text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_reaction not in ('like','love','interesting','celebrate') then raise exception 'invalid_reaction'; end if;
  if (p_activity is null)::integer+(p_comment is null)::integer<>1 then raise exception 'invalid_target'; end if;
  if (select count(*) from public.social_reactions where user_id=v_user and created_at>=now()-interval '1 hour')>=120 then raise exception 'rate_limit'; end if;
  if p_activity is not null then
    select * into v_activity from public.social_activity_events where id=p_activity and deleted_at is null;
    v_owner:=v_activity.actor_id; v_type:='activity_reaction';
    if not found or not public.social_can_view_activity_row(v_owner,v_activity.visibility,v_user) then raise exception 'target_unavailable'; end if;
    select reaction_type into v_existing from public.social_reactions where user_id=v_user and activity_id=p_activity;
    if v_existing=p_reaction then delete from public.social_reactions where user_id=v_user and activity_id=p_activity; return jsonb_build_object('ok',true,'reaction',null); end if;
    insert into public.social_reactions(user_id,activity_id,reaction_type) values(v_user,p_activity,p_reaction)
    on conflict(user_id,activity_id) where activity_id is not null do update set reaction_type=excluded.reaction_type,updated_at=now() returning id into v_id;
  else
    select c.*
    into v_comment
    from public.social_activity_comments c
    where c.id=p_comment
      and c.deleted_at is null
      and c.hidden_by_owner_at is null;

    if not found then
      raise exception 'target_unavailable';
    end if;

    select a.*
    into v_activity
    from public.social_activity_events a
    where a.id=v_comment.activity_id
      and a.deleted_at is null;

    if not found then
      raise exception 'target_unavailable';
    end if;

    v_owner:=v_comment.author_id;
    v_type:='comment_reaction';
    if not public.social_can_view_activity_row(v_activity.actor_id,v_activity.visibility,v_user) then raise exception 'target_unavailable'; end if;
    select reaction_type into v_existing from public.social_reactions where user_id=v_user and comment_id=p_comment;
    if v_existing=p_reaction then delete from public.social_reactions where user_id=v_user and comment_id=p_comment; return jsonb_build_object('ok',true,'reaction',null); end if;
    insert into public.social_reactions(user_id,comment_id,reaction_type) values(v_user,p_comment,p_reaction)
    on conflict(user_id,comment_id) where comment_id is not null do update set reaction_type=excluded.reaction_type,updated_at=now() returning id into v_id;
  end if;
  perform public.social_insert_notification(v_owner,v_user,v_type,case when p_activity is not null then 'activity' else 'comment' end,coalesce(p_activity,p_comment),jsonb_build_object('reaction',p_reaction),v_type||':'||coalesce(p_activity,p_comment)::text||':'||v_user::text);
  return jsonb_build_object('ok',true,'reaction',p_reaction);
end;
$$;

create or replace function public.social_send_recommendation(p_recipient uuid,p_media jsonb,p_sender_note text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_permission text; v_mode text; v_key text; v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_recipient=v_user then raise exception 'self_recommendation_not_allowed'; end if;
  if public.social_is_blocked(v_user,p_recipient) then raise exception 'profile_unavailable'; end if;
  select recommendation_permission,visibility_mode into v_permission,v_mode from public.profiles where id=p_recipient and username is not null and deleted_at is null;
  if v_mode is null or v_mode='personal' or v_permission='none' then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='mutual' and not (exists(select 1 from public.profile_follows where follower_id=v_user and following_id=p_recipient and status='accepted') and exists(select 1 from public.profile_follows where follower_id=p_recipient and following_id=v_user and status='accepted')) then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='following' and not exists(select 1 from public.profile_follows where follower_id=p_recipient and following_id=v_user and status='accepted') then raise exception 'recommendation_not_allowed'; end if;
  if v_permission='followers' and not exists(select 1 from public.profile_follows where follower_id=v_user and following_id=p_recipient and status='accepted') then raise exception 'recommendation_not_allowed'; end if;
  if jsonb_typeof(p_media)<>'object' or length(coalesce(p_media->>'title','')) not between 1 and 180 or coalesce(p_media->>'mediaType','') not in ('movie','tv','anime','manga','manhwa','manhua','book','light_novel','web_novel','visual_novel') or coalesce(p_media->>'world','') not in ('east','screen','arch') then raise exception 'invalid_media_snapshot'; end if;
  if length(coalesce(p_sender_note,''))>500 or coalesce(p_sender_note,'') ~ '[<>]' then raise exception 'invalid_sender_note'; end if;
  v_key:=case when nullif(p_media->>'externalSource','') is not null and nullif(p_media->>'externalId','') is not null
    then lower((p_media->>'externalSource')||':'||(p_media->>'externalId'))
    else lower('local:'||(p_media->>'mediaType')||':'||(p_media->>'title')) end;
  if length(coalesce(v_key,''))<3 then raise exception 'invalid_media_key'; end if;
  if (select count(*) from public.social_recommendations where sender_id=v_user and created_at>=date_trunc('day',now()))>=10 then raise exception 'rate_limit'; end if;
  if (select count(*) from public.social_recommendations where sender_id=v_user and recipient_id=p_recipient and (response_status in ('pending','deferred') or (response_status='accepted' and progress_status<>'completed')))>=5 then raise exception 'recipient_open_limit'; end if;
  if exists(select 1 from public.social_recommendations where sender_id=v_user and recipient_id=p_recipient and canonical_media_key=v_key and (response_status in ('pending','deferred') or (response_status='accepted' and progress_status<>'completed'))) then raise exception 'duplicate_recommendation'; end if;
  insert into public.social_recommendations(sender_id,recipient_id,sender_note,media_snapshot,canonical_media_key,dedupe_key)
  values(v_user,p_recipient,nullif(btrim(p_sender_note),''),p_media||jsonb_build_object('canonicalKey',v_key),v_key,p_dedupe_key) returning id into v_id;
  insert into public.social_recommendation_events(recommendation_id,actor_id,event_type,dedupe_key) values(v_id,v_user,'sent','sent:'||p_dedupe_key);
  perform public.social_insert_notification(p_recipient,v_user,'recommendation_received','recommendation',v_id,jsonb_build_object('title',p_media->>'title'),'recommendation_received:'||v_id::text);
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.social_recommendation_transition(p_recommendation uuid,p_action text,p_response_note text default null,p_already_in_library boolean default false,p_dedupe_key text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_rec public.social_recommendations%rowtype; v_event text; v_notify text; v_recipient uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from public.social_recommendations where id=p_recommendation for update;
  if not found then raise exception 'recommendation_not_found'; end if;
  if public.social_is_blocked(v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if length(coalesce(p_response_note,''))>300 or coalesce(p_response_note,'') ~ '[<>]' then raise exception 'invalid_response_note'; end if;
  if p_action in ('accept','defer','reject') then
    if v_user<>v_rec.recipient_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    if p_action='accept' then update public.social_recommendations set response_status='accepted',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='accepted'; v_notify:='recommendation_accepted';
    elsif p_action='defer' then update public.social_recommendations set response_status='deferred',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='deferred'; v_notify:='recommendation_deferred';
    else update public.social_recommendations set response_status='rejected',responded_at=now(),recipient_response_note=nullif(btrim(p_response_note),'') where id=p_recommendation; v_event:='rejected'; v_notify:='recommendation_rejected'; end if;
    v_recipient:=v_rec.sender_id;
  elsif p_action='withdraw' then
    if v_user<>v_rec.sender_id or v_rec.response_status not in ('pending','deferred') then raise exception 'invalid_transition'; end if;
    update public.social_recommendations set response_status='withdrawn',withdrawn_at=now() where id=p_recommendation; v_event:='withdrawn'; v_notify:='recommendation_withdrawn'; v_recipient:=v_rec.recipient_id;
  elsif p_action in ('linked','started','completed') then
    if v_user<>v_rec.recipient_id or v_rec.response_status<>'accepted' then raise exception 'invalid_transition'; end if;
    if p_action='linked' and v_rec.progress_status='none' then update public.social_recommendations set progress_status='linked',already_in_library=coalesce(p_already_in_library,false) where id=p_recommendation;
    elsif p_action='started' and v_rec.progress_status in ('linked','none') then update public.social_recommendations set progress_status='started',started_at=coalesce(started_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status in ('linked','started') then update public.social_recommendations set progress_status='completed',started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now()) where id=p_recommendation;
    elsif p_action='completed' and v_rec.progress_status='completed' then return jsonb_build_object('ok',true,'idempotent',true);
    else raise exception 'invalid_transition'; end if;
    v_event:=p_action; v_notify:=case when p_action='started' then 'recommendation_started' when p_action='completed' then 'recommendation_completed' else null end; v_recipient:=v_rec.sender_id;
  else raise exception 'invalid_transition'; end if;
  insert into public.social_recommendation_events(recommendation_id,actor_id,event_type,dedupe_key,safe_metadata)
  values(p_recommendation,v_user,v_event,coalesce(nullif(p_dedupe_key,''),v_event||':'||p_recommendation::text),jsonb_build_object('alreadyInLibrary',coalesce(p_already_in_library,false))) on conflict(recommendation_id,dedupe_key) do nothing;
  if v_notify is not null then perform public.social_insert_notification(v_recipient,v_user,v_notify,'recommendation',p_recommendation,jsonb_build_object('title',v_rec.media_snapshot->>'title'),v_notify||':'||p_recommendation::text); end if;
  if v_event='completed' and coalesce((select share_recommendation_completed from public.social_activity_preferences where user_id=v_user),false) then
    insert into public.social_activity_events(actor_id,event_type,visibility,media_snapshot,source_event_id,dedupe_key)
    values(v_user,'recommendation_completed',coalesce((select default_visibility from public.social_activity_preferences where user_id=v_user),'followers'),v_rec.media_snapshot,'recommendation:'||p_recommendation::text,'recommendation_completed:'||p_recommendation::text)
    on conflict(actor_id,dedupe_key) do nothing;
  end if;
  return jsonb_build_object('ok',true,'recommendationId',p_recommendation,'responseStatus',(select response_status from public.social_recommendations where id=p_recommendation),'progressStatus',(select progress_status from public.social_recommendations where id=p_recommendation),'media',v_rec.media_snapshot);
end;
$$;

create or replace function public.list_social_recommendations(p_box text default 'received',p_status text default 'all',p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_box not in ('received','sent') or p_status not in ('all','pending','deferred','accepted','started','completed','rejected','withdrawn') then raise exception 'invalid_filter'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',r.id,'senderId',r.sender_id,'recipientId',r.recipient_id,'responseStatus',r.response_status,'progressStatus',r.progress_status,'senderNote',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else r.sender_note end,'recipientResponseNote',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else r.recipient_response_note end,'media',r.media_snapshot,'canonicalMediaKey',r.canonical_media_key,'alreadyInLibrary',r.already_in_library,'createdAt',r.created_at,'respondedAt',r.responded_at,'startedAt',r.started_at,'completedAt',r.completed_at,'withdrawnAt',r.withdrawn_at,
      'other',case when public.social_is_blocked(r.sender_id,r.recipient_id) then jsonb_build_object('id',case when r.sender_id=v_user then r.recipient_id else r.sender_id end,'displayName','MediaTracker kullanıcısı') else jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path) end) item
    from public.social_recommendations r join public.profiles p on p.id=case when r.sender_id=v_user then r.recipient_id else r.sender_id end
    where (case when p_box='received' then r.recipient_id=v_user else r.sender_id=v_user end)
      and (p_status='all' or r.response_status=p_status or (p_status in ('started','completed') and r.progress_status=p_status))
      and (p_cursor_created_at is null or (r.created_at,r.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by r.created_at desc,r.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function public.list_social_notifications(p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,30),1),50); v_unread integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select count(*) into v_unread from public.social_notifications where recipient_id=v_user and read_at is null and deleted_at is null;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',n.id,'type',n.notification_type,'entityType',n.entity_type,'entityId',n.entity_id,'payload',n.safe_payload,'createdAt',n.created_at,'readAt',n.read_at,
      'actor',case when n.actor_id is null or public.social_is_blocked(v_user,n.actor_id) then null else jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path) end) item
    from public.social_notifications n left join public.profiles p on p.id=n.actor_id
    where n.recipient_id=v_user and n.deleted_at is null and (p_cursor_created_at is null or (n.created_at,n.id)<(p_cursor_created_at,coalesce(p_cursor_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by n.created_at desc,n.id desc limit v_limit
  ) q;
  return jsonb_build_object('items',v_items,'unreadCount',v_unread,'nextCursor',case when jsonb_array_length(v_items)=v_limit then jsonb_build_object('createdAt',v_items->(v_limit-1)->>'createdAt','id',v_items->(v_limit-1)->>'id') else null end);
end;
$$;

create or replace function public.social_notification_action(p_action text,p_notification uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_action='read' then update public.social_notifications set read_at=coalesce(read_at,now()) where id=p_notification and recipient_id=auth.uid() and deleted_at is null;
  elsif p_action='read_all' then update public.social_notifications set read_at=coalesce(read_at,now()) where recipient_id=auth.uid() and read_at is null and deleted_at is null;
  else raise exception 'invalid_notification_action'; end if;
  return jsonb_build_object('ok',true,'unreadCount',(select count(*) from public.social_notifications where recipient_id=auth.uid() and read_at is null and deleted_at is null));
end;
$$;

create or replace function public.social_report(p_activity uuid,p_comment uuid,p_category text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_owner uuid; v_visibility text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if (p_activity is null)::integer+(p_comment is null)::integer<>1 then raise exception 'invalid_target'; end if;
  if p_category not in ('spam','harassment','spoiler','inappropriate','other') or length(coalesce(p_note,''))>500 or coalesce(p_note,'') ~ '[<>]' then raise exception 'invalid_report'; end if;
  if p_activity is not null then
    select actor_id,visibility into v_owner,v_visibility from public.social_activity_events where id=p_activity and deleted_at is null;
  else
    select a.actor_id,a.visibility into v_owner,v_visibility from public.social_activity_comments c join public.social_activity_events a on a.id=c.activity_id where c.id=p_comment and c.deleted_at is null and c.hidden_by_owner_at is null and a.deleted_at is null;
  end if;
  if not found or not public.social_can_view_activity_row(v_owner,v_visibility,v_user) then raise exception 'target_unavailable'; end if;
  insert into public.social_reports(reporter_id,activity_id,comment_id,category,note) values(v_user,p_activity,p_comment,p_category,nullif(btrim(p_note),'')) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
exception when unique_violation then raise exception 'already_reported';
end;
$$;

-- Follow notifications are emitted by the existing relationship actions without changing their contract.
create or replace function public.social_follow(p_target uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid();
  v_mode text;
  v_status text;
  v_notification_type text;
  v_notification_dedupe_key text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_user=p_target then raise exception 'self_follow_not_allowed'; end if;
  if public.social_is_blocked(v_user,p_target) then raise exception 'profile_unavailable'; end if;
  select visibility_mode into v_mode from public.profiles where id=p_target and deleted_at is null;
  if v_mode is null or v_mode='personal' then raise exception 'profile_unavailable'; end if;
  if exists(select 1 from public.profile_follows where follower_id=v_user and following_id=p_target) then raise exception 'follow_exists'; end if;
  v_status:=case when v_mode='public' then 'accepted' else 'pending' end;
  v_notification_type:=
    case when v_status='accepted' then 'new_follower' else 'follow_request_received' end;
  v_notification_dedupe_key:=
    case when v_status='accepted' then 'new_follower:' else 'follow_request:' end || v_user::text;
  insert into public.profile_follows(follower_id,following_id,status,responded_at) values(v_user,p_target,v_status,case when v_status='accepted' then now() else null end);
  perform public.social_insert_notification(
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

create or replace function public.social_follow_action(p_action text,p_other uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_count integer:=0;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_action='unfollow' then delete from public.profile_follows where follower_id=v_user and following_id=p_other and status='accepted';
  elsif p_action='cancel' then delete from public.profile_follows where follower_id=v_user and following_id=p_other and status='pending';
  elsif p_action='accept' then update public.profile_follows set status='accepted',responded_at=now() where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='reject' then delete from public.profile_follows where follower_id=p_other and following_id=v_user and status='pending';
  elsif p_action='remove_follower' then delete from public.profile_follows where follower_id=p_other and following_id=v_user and status='accepted';
  else raise exception 'invalid_follow_action'; end if;
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'relationship_not_found'; end if;
  if p_action='accept' then perform public.social_insert_notification(p_other,v_user,'follow_request_accepted','profile',v_user,'{}'::jsonb,'follow_accepted:'||v_user::text); end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.social_get_preferences() from public;
revoke all on function public.social_ensure_activity_module() from public;
revoke all on function public.social_save_preferences(text,jsonb) from public;
revoke all on function public.social_publish_activity(text,text,jsonb,integer,text,text,text) from public;
revoke all on function public.social_delete_activity(uuid) from public;
revoke all on function public.list_social_feed(timestamptz,uuid,integer) from public;
revoke all on function public.list_profile_activity(uuid,integer) from public;
revoke all on function public.social_comment(uuid,uuid,text,boolean,text) from public;
revoke all on function public.social_comment_action(text,uuid,text,boolean) from public;
revoke all on function public.social_react(uuid,uuid,text) from public;
revoke all on function public.social_send_recommendation(uuid,jsonb,text,text) from public;
revoke all on function public.social_recommendation_transition(uuid,text,text,boolean,text) from public;
revoke all on function public.list_social_recommendations(text,text,timestamptz,uuid,integer) from public;
revoke all on function public.list_social_notifications(timestamptz,uuid,integer) from public;
revoke all on function public.social_notification_action(text,uuid) from public;
revoke all on function public.social_report(uuid,uuid,text,text) from public;

grant execute on function public.social_get_preferences() to authenticated;
grant execute on function public.social_save_preferences(text,jsonb) to authenticated;
grant execute on function public.social_publish_activity(text,text,jsonb,integer,text,text,text) to authenticated;
grant execute on function public.social_delete_activity(uuid) to authenticated;
grant execute on function public.list_social_feed(timestamptz,uuid,integer) to authenticated;
grant execute on function public.list_profile_activity(uuid,integer) to anon,authenticated;
grant execute on function public.social_comment(uuid,uuid,text,boolean,text) to authenticated;
grant execute on function public.social_comment_action(text,uuid,text,boolean) to authenticated;
grant execute on function public.social_react(uuid,uuid,text) to authenticated;
grant execute on function public.social_send_recommendation(uuid,jsonb,text,text) to authenticated;
grant execute on function public.social_recommendation_transition(uuid,text,text,boolean,text) to authenticated;
grant execute on function public.list_social_recommendations(text,text,timestamptz,uuid,integer) to authenticated;
grant execute on function public.list_social_notifications(timestamptz,uuid,integer) to authenticated;
grant execute on function public.social_notification_action(text,uuid) to authenticated;
grant execute on function public.social_report(uuid,uuid,text,text) to authenticated;

revoke insert,update,delete on public.social_activity_events,public.social_activity_comments,public.social_reactions,public.social_recommendations,public.social_recommendation_events,public.social_notifications,public.social_reports from anon,authenticated;
revoke all on public.social_activity_preferences,public.social_notification_preferences from anon;
