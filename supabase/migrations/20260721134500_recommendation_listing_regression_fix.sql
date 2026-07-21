-- Restore backward-compatible recommendation listing after feedback enrichment.

create or replace function public.list_social_recommendations(p_box text default 'received',p_status text default 'all',p_cursor_created_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),30);
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_box not in ('received','sent') or p_status not in ('all','pending','deferred','accepted','started','completed','rejected','withdrawn') then raise exception 'invalid_filter'; end if;
  select coalesce(jsonb_agg(item order by (item->>'createdAt')::timestamptz desc),'[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id',r.id,'senderId',r.sender_id,'recipientId',r.recipient_id,'responseStatus',r.response_status,'progressStatus',r.progress_status,
      'senderNote',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else r.sender_note end,
      'recipientResponseNote',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else r.recipient_response_note end,
      'media',r.media_snapshot,'canonicalMediaKey',r.canonical_media_key,'alreadyInLibrary',r.already_in_library,
      'createdAt',r.created_at,'updatedAt',greatest(r.created_at,coalesce(r.responded_at,r.created_at),coalesce(r.started_at,r.created_at),coalesce(r.completed_at,r.created_at),coalesce(r.withdrawn_at,r.created_at)),
      'respondedAt',r.responded_at,'startedAt',r.started_at,'completedAt',r.completed_at,'withdrawnAt',r.withdrawn_at,
      'lastEvent',(select jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.occurred_at) from public.social_recommendation_events e where e.recommendation_id=r.id order by e.occurred_at desc,e.id desc limit 1),
      'lastMessagePreview',case when public.social_is_blocked(r.sender_id,r.recipient_id) then null else (select jsonb_build_object('body',case when m.deleted_at is null then m.body else null end,'authorId',m.author_id,'createdAt',m.created_at) from public.social_recommendation_messages m where m.recommendation_id=r.id order by m.created_at desc,m.id desc limit 1) end,
      'unreadMessageCount',(select count(*) from public.social_notifications n where n.recipient_id=v_user and n.notification_type='recommendation_message' and n.entity_id=r.id and n.read_at is null and n.deleted_at is null),
      'other',case when public.social_is_blocked(r.sender_id,r.recipient_id)
        then jsonb_build_object('id',case when r.sender_id=v_user then r.recipient_id else r.sender_id end,'displayName','MediaTracker kullanıcısı')
        else jsonb_build_object('id',case when r.sender_id=v_user then r.recipient_id else r.sender_id end,'username',p.username,'displayName',coalesce(p.display_name,p.username,'MediaTracker kullanıcısı'),'avatarPath',p.avatar_path)
      end
    ) item
    from public.social_recommendations r
    left join public.profiles p on p.id=case when r.sender_id=v_user then r.recipient_id else r.sender_id end
    where (case when p_box='received' then r.recipient_id=v_user else r.sender_id=v_user end)
      and (p_status='all' or (p_status in ('started','completed') and r.progress_status=p_status) or (p_status not in ('started','completed') and r.response_status=p_status))
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
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',case when m.deleted_at is null then m.body else null end,'deleted',m.deleted_at is not null,'createdAt',m.created_at,'author',jsonb_build_object('id',m.author_id,'username',p.username,'displayName',coalesce(p.display_name,p.username,'MediaTracker kullanıcısı'),'avatarPath',p.avatar_path)) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages from public.social_recommendation_messages m left join public.profiles p on p.id=m.author_id where m.recommendation_id=p_recommendation;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'eventType',e.event_type,'actorId',e.actor_id,'createdAt',e.occurred_at) order by e.occurred_at,e.id),'[]'::jsonb)
  into v_events from public.social_recommendation_events e where e.recommendation_id=p_recommendation;
  return jsonb_build_object('messages',v_messages,'events',v_events,'threadOpen',v_rec.response_status not in ('rejected','withdrawn'));
end;
$$;

grant execute on function public.list_social_recommendations(text,text,timestamptz,uuid,integer) to authenticated;
grant execute on function public.get_social_recommendation_detail(uuid) to authenticated;
