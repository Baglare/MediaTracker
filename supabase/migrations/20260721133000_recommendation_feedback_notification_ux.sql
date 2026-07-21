-- Recommendation feedback and notification UX

alter table public.social_notifications drop constraint if exists social_notifications_type_check;
alter table public.social_notifications add constraint social_notifications_type_check check (
  notification_type in (
    'follow_request_received','follow_request_accepted','new_follower',
    'activity_comment','comment_reply','activity_reaction','comment_reaction',
    'recommendation_received','recommendation_accepted','recommendation_deferred',
    'recommendation_started','recommendation_completed','recommendation_withdrawn',
    'recommendation_rejected','recommendation_message'
  )
);

create table if not exists public.social_recommendation_messages (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.social_recommendations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint social_recommendation_messages_body_check check (length(btrim(body)) between 1 and 500 and body !~ '[<>]'),
  constraint social_recommendation_messages_dedupe_check check (length(dedupe_key) between 1 and 220),
  unique(author_id,dedupe_key)
);

create index if not exists social_recommendation_messages_thread_idx
  on public.social_recommendation_messages(recommendation_id,created_at,id);

alter table public.social_recommendation_messages enable row level security;

drop policy if exists social_recommendation_messages_participants_select on public.social_recommendation_messages;
create policy social_recommendation_messages_participants_select on public.social_recommendation_messages
for select using (
  deleted_at is null and exists (
    select 1 from public.social_recommendations r
    where r.id=recommendation_id and auth.uid() in (r.sender_id,r.recipient_id)
  )
);

drop policy if exists social_recommendation_messages_participants_insert on public.social_recommendation_messages;
create policy social_recommendation_messages_participants_insert on public.social_recommendation_messages
for insert with check (
  author_id=auth.uid() and exists (
    select 1 from public.social_recommendations r
    where r.id=recommendation_id
      and auth.uid() in (r.sender_id,r.recipient_id)
      and not public.social_is_blocked(r.sender_id,r.recipient_id)
  )
);

create or replace function public.social_notification_allowed(p_recipient uuid,p_type text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when p_type in ('follow_request_received','follow_request_accepted','new_follower') then coalesce((select follow_notifications from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_comment','comment_reply') then coalesce((select comment_notifications from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('activity_reaction','comment_reaction') then coalesce((select reaction_notifications from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('recommendation_received','recommendation_message') then coalesce((select recommendation_received from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type in ('recommendation_accepted','recommendation_deferred') then coalesce((select recommendation_accepted from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_started' then coalesce((select recommendation_started from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_completed' then coalesce((select recommendation_completed from public.social_notification_preferences where user_id=p_recipient),true)
    when p_type='recommendation_rejected' then coalesce((select recommendation_rejected from public.social_notification_preferences where user_id=p_recipient),false)
    when p_type='recommendation_withdrawn' then coalesce((select recommendation_withdrawn from public.social_notification_preferences where user_id=p_recipient),true)
    else false end;
$$;
revoke all on function public.social_notification_allowed(uuid,text) from public;

create or replace function public.social_insert_recommendation_message(
  p_recommendation uuid,
  p_author uuid,
  p_body text,
  p_dedupe_key text,
  p_allow_rejected_response boolean default false
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_rec public.social_recommendations%rowtype;
  v_id uuid;
  v_recipient uuid;
begin
  select * into v_rec from public.social_recommendations where id=p_recommendation for update;
  if not found or p_author not in (v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if public.social_is_blocked(v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if length(btrim(coalesce(p_body,''))) not between 1 and 500 or coalesce(p_body,'') ~ '[<>]' then raise exception 'invalid_recommendation_message'; end if;
  if length(coalesce(p_dedupe_key,'')) not between 1 and 220 then raise exception 'invalid_dedupe_key'; end if;
  if v_rec.response_status in ('rejected','withdrawn') and not (p_allow_rejected_response and v_rec.response_status='rejected' and p_author=v_rec.recipient_id) then
    raise exception 'recommendation_thread_closed';
  end if;
  if (select count(*) from public.social_recommendation_messages where author_id=p_author and created_at>=now()-interval '1 hour')>=30 then raise exception 'rate_limit'; end if;
  insert into public.social_recommendation_messages(recommendation_id,author_id,body,dedupe_key)
  values(p_recommendation,p_author,btrim(p_body),p_dedupe_key)
  on conflict(author_id,dedupe_key) do update set body=public.social_recommendation_messages.body
  returning id into v_id;
  v_recipient:=case when p_author=v_rec.sender_id then v_rec.recipient_id else v_rec.sender_id end;
  perform public.social_insert_notification(
    v_recipient,p_author,'recommendation_message','recommendation',p_recommendation,
    jsonb_build_object('title',v_rec.media_snapshot->>'title'),
    'recommendation_message:'||v_id::text
  );
  return v_id;
end;
$$;
revoke all on function public.social_insert_recommendation_message(uuid,uuid,text,text,boolean) from public;

create or replace function public.social_send_recommendation_message(p_recommendation uuid,p_body text,p_dedupe_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  v_id:=public.social_insert_recommendation_message(p_recommendation,v_user,p_body,p_dedupe_key,false);
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

drop function if exists public.social_recommendation_transition(uuid,text,text,boolean,text);
create function public.social_recommendation_transition(
  p_recommendation uuid,
  p_action text,
  p_response_note text default null,
  p_already_in_library boolean default false,
  p_dedupe_key text default null,
  p_response_message text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_rec public.social_recommendations%rowtype; v_event text; v_notify text; v_recipient uuid; v_message_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from public.social_recommendations where id=p_recommendation for update;
  if not found then raise exception 'recommendation_not_found'; end if;
  if public.social_is_blocked(v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  if length(coalesce(p_response_note,''))>300 or coalesce(p_response_note,'') ~ '[<>]' then raise exception 'invalid_response_note'; end if;
  if p_response_message is not null and (length(btrim(p_response_message)) not between 1 and 500 or p_response_message ~ '[<>]') then raise exception 'invalid_recommendation_message'; end if;
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
  if nullif(btrim(coalesce(p_response_message,'')),'') is not null then
    if p_action not in ('accept','defer','reject') then raise exception 'response_message_not_allowed'; end if;
    v_message_id:=public.social_insert_recommendation_message(p_recommendation,v_user,p_response_message,'response:'||coalesce(nullif(p_dedupe_key,''),v_event||':'||p_recommendation::text),p_action='reject');
  end if;
  if v_event='completed' and coalesce((select share_recommendation_completed from public.social_activity_preferences where user_id=v_user),false) then
    insert into public.social_activity_events(actor_id,event_type,visibility,media_snapshot,source_event_id,dedupe_key)
    values(v_user,'recommendation_completed',coalesce((select default_visibility from public.social_activity_preferences where user_id=v_user),'followers'),v_rec.media_snapshot,'recommendation:'||p_recommendation::text,'recommendation_completed:'||p_recommendation::text)
    on conflict(actor_id,dedupe_key) do nothing;
  end if;
  return jsonb_build_object('ok',true,'recommendationId',p_recommendation,'responseStatus',(select response_status from public.social_recommendations where id=p_recommendation),'progressStatus',(select progress_status from public.social_recommendations where id=p_recommendation),'messageId',v_message_id,'media',v_rec.media_snapshot);
end;
$$;

create or replace function public.list_social_recommendations(p_box text default 'received',p_status text default 'all',p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_box not in ('received','sent') or p_status not in ('all','pending','deferred','accepted','started','completed','rejected','withdrawn') then raise exception 'invalid_filter'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object('id',r.id,'senderId',r.sender_id,'recipientId',r.recipient_id,'responseStatus',r.response_status,'progressStatus',r.progress_status,'senderNote',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else r.sender_note end,'recipientResponseNote',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else r.recipient_response_note end,'media',r.media_snapshot,'canonicalMediaKey',r.canonical_media_key,'alreadyInLibrary',r.already_in_library,'createdAt',r.created_at,'updatedAt',greatest(r.created_at,coalesce(r.responded_at,r.created_at),coalesce(r.started_at,r.created_at),coalesce(r.completed_at,r.created_at),coalesce(r.withdrawn_at,r.created_at)),'respondedAt',r.responded_at,'startedAt',r.started_at,'completedAt',r.completed_at,'withdrawnAt',r.withdrawn_at,
      'lastEvent',(select jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.created_at) from public.social_recommendation_events e where e.recommendation_id=r.id order by e.created_at desc,e.id desc limit 1),
      'lastMessagePreview',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else (select jsonb_build_object('body',case when m.deleted_at is null then m.body else null end,'authorId',m.author_id,'createdAt',m.created_at) from public.social_recommendation_messages m where m.recommendation_id=r.id order by m.created_at desc,m.id desc limit 1) end,
      'unreadMessageCount',(select count(*) from public.social_notifications n where n.recipient_id=v_user and n.notification_type='recommendation_message' and n.entity_id=r.id and n.read_at is null and n.deleted_at is null),
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

create or replace function public.get_social_recommendation_detail(p_recommendation uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_rec public.social_recommendations%rowtype; v_messages jsonb; v_events jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_rec from public.social_recommendations where id=p_recommendation;
  if not found or v_user not in (v_rec.sender_id,v_rec.recipient_id) then raise exception 'recommendation_unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',case when m.deleted_at is null then m.body else null end,'deleted',m.deleted_at is not null,'createdAt',m.created_at,'author',jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,p.username),'avatarPath',p.avatar_path)) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages from public.social_recommendation_messages m join public.profiles p on p.id=m.author_id where m.recommendation_id=p_recommendation;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb)
  into v_events from public.social_recommendation_events e where e.recommendation_id=p_recommendation;
  return jsonb_build_object('messages',v_messages,'events',v_events,'threadOpen',v_rec.response_status not in ('rejected','withdrawn'));
end;
$$;

drop function if exists public.social_notification_action(text,uuid);
create function public.social_notification_action(p_action text,p_notification uuid default null,p_entity_type text default null,p_entity_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_action='read' then
    update public.social_notifications set read_at=coalesce(read_at,now()) where id=p_notification and recipient_id=auth.uid() and deleted_at is null;
  elsif p_action='read_all' then
    update public.social_notifications set read_at=coalesce(read_at,now()) where recipient_id=auth.uid() and read_at is null and deleted_at is null;
  elsif p_action='mark_entity_read' then
    if p_entity_type not in ('profile','activity','comment','recommendation') or p_entity_id is null then raise exception 'invalid_notification_entity'; end if;
    update public.social_notifications n set read_at=coalesce(n.read_at,now())
    where n.recipient_id=auth.uid() and n.read_at is null and n.deleted_at is null and (
      (n.entity_type=p_entity_type and n.entity_id=p_entity_id)
      or (p_entity_type='activity' and n.entity_type='comment' and (
        n.safe_payload->>'activityId'=p_entity_id::text
        or exists(select 1 from public.social_activity_comments c where c.id=n.entity_id and c.activity_id=p_entity_id)
      ))
    );
  else raise exception 'invalid_notification_action'; end if;
  return jsonb_build_object('ok',true,'unreadCount',(select count(*) from public.social_notifications where recipient_id=auth.uid() and read_at is null and deleted_at is null));
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
    'anonymous',false,'self',v_viewer=p.id,'viewerConnectionColor',v_viewer_color,
    'viewerFollowsOwner',(select f.status from public.profile_follows f where f.follower_id=v_viewer and f.following_id=p.id),
    'ownerFollowsViewer',(select f.status from public.profile_follows f where f.follower_id=p.id and f.following_id=v_viewer)
  ) into v_result
  from public.profiles p
  where p.id=p_target and p.deleted_at is null and p.visibility_mode in ('public','protected') and not public.social_is_blocked(v_viewer,p.id);
  return v_result;
end;
$$;

revoke all on function public.social_send_recommendation_message(uuid,text,text) from public;
revoke all on function public.social_recommendation_transition(uuid,text,text,boolean,text,text) from public;
revoke all on function public.get_social_recommendation_detail(uuid) from public;
revoke all on function public.social_notification_action(text,uuid,text,uuid) from public;
revoke all on function public.get_social_person_summary(uuid) from public;

grant execute on function public.social_send_recommendation_message(uuid,text,text) to authenticated;
grant execute on function public.social_recommendation_transition(uuid,text,text,boolean,text,text) to authenticated;
grant execute on function public.get_social_recommendation_detail(uuid) to authenticated;
grant execute on function public.social_notification_action(text,uuid,text,uuid) to authenticated;
grant execute on function public.get_social_person_summary(uuid) to authenticated;

revoke insert,update,delete on public.social_recommendation_messages from anon,authenticated;
