// Ops-only SQL compiler: fixed relation/column allowlists; the sole input is UUID.
import { assertUser, domains, ownerlessTables } from "./privacy-account-model.mjs";
export const accountTables = Object.keys(domains);
const literal = (user) => { assertUser(user); return `'${user}'::uuid`; };
export function scopedQueries(user) {
  const u = literal(user);
  const activity = `select id from public.social_activity_events where actor_id=${u}`;
  const comment = `select id from public.social_activity_comments where author_id=${u} or activity_id in (${activity})`;
  const thread = `select id from public.social_recommendations where sender_id=${u} or recipient_id=${u}`;
  const message = `select id from public.social_recommendation_messages where author_id=${u} or recommendation_id in (${thread})`;
  const event = `select id from public.xp_events where user_id=${u}`;
  const scopes = Object.fromEntries(Object.entries(domains).map(([t, c]) => [t, c.columns.map((col) => `r.${col}=${u}`).join(" or ")]));
  scopes.profile_blocks += ` or r.blocked_id=${u}`;
  scopes.social_activity_events += ` or r.source_event_id in (select 'recommendation:'||id::text from (${thread}) q)`;
  scopes.xp_event_allocations = `r.event_id in (${event})`;
  scopes.social_activity_comments += ` or r.activity_id in (${activity}) or r.parent_comment_id in (${comment}) or r.id::text in
    (select jsonb_array_elements_text(coalesce((select erasure_context->'replyIds' from private_privacy_ops.account_lifecycle where user_id=${u}),'[]'::jsonb)))`;
  for (const t of ["social_reactions", "social_reports"]) scopes[t] += ` or r.activity_id in (${activity}) or r.comment_id in (${comment})`;
  for (const t of ["social_recommendation_events", "social_recommendation_messages"]) scopes[t] += ` or r.recommendation_id in (${thread})`;
  scopes.social_notifications += ` or r.actor_id=${u} or r.entity_id=${u} or r.entity_id in (${activity}) or r.entity_id in (${comment}) or r.entity_id in (${thread}) or r.safe_payload->>'actorId'=${u}::text or r.safe_payload->>'userId'=${u}::text`;
  // B's earned XP is inspected only when linked to A's shared containers.
  scopes.xp_events += ` or r.source_id in (select id::text from (${thread}) q) or r.source_id in (select id::text from (${message}) q) or r.metadata->>'recommendationId' in (select id::text from (${thread}) q)`;
  for (const [t, col] of [["xp_legacy_imports", "event_id"], ["xp_user_quest_progress", "reward_event_id"], ["xp_user_badges", "source_event_id"], ["xp_local_state_conversions", "correction_event_id"]]) scopes[t] += ` or r.${col} in (${event})`;
  return { scopes, activity, comment, thread };
}

export function inspectSql(user) {
  const u = literal(user);
  const { scopes } = scopedQueries(user);
  const entries = Object.entries(scopes).map(([t, where]) => `'${t}',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.${t} r where ${where})`);
  entries.push(...ownerlessTables.map((t) => `'${t}','[]'::jsonb`));
  // Context keeps pre-cleanup container IDs until Auth-last cascade removes it.
  // Only relevant structured participant copies are searched, never global B text.
  const context = `(select erasure_context from private_privacy_ops.account_lifecycle where user_id=${u})`;
  const residuals = `select jsonb_build_object('table','social_notifications','row',to_jsonb(n)) item from public.social_notifications n
    where n.entity_id::text in (select jsonb_array_elements_text(coalesce(${context}->'referenceIds','[]'::jsonb)))
      or n.safe_payload->>'actorId'=${u}::text or n.safe_payload->>'userId'=${u}::text
    union all select jsonb_build_object('table','xp_events','row',to_jsonb(e)) from public.xp_events e
    where e.source_id in (select jsonb_array_elements_text(coalesce(${context}->'referenceIds','[]'::jsonb)))
      or e.metadata->>'recommendationId' in (select jsonb_array_elements_text(coalesce(${context}->'referenceIds','[]'::jsonb)))
    union all select jsonb_build_object('table','social_activity_comments','row',to_jsonb(c)) from public.social_activity_comments c
    where c.id::text in (select jsonb_array_elements_text(coalesce(${context}->'replyIds','[]'::jsonb)))
      and c.body<>'Silinen hesaba verilen yanıt.' and exists(select 1 from jsonb_array_elements_text(coalesce(${context}->'identifiers','[]'::jsonb)) marker where position(marker in c.body)>0)`;
  return `begin isolation level repeatable read read only;
    select jsonb_build_object('schemaVersion',1,'synthetic',false,
      'auth',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'created_at',created_at,'email_confirmed_at',email_confirmed_at,'last_sign_in_at',last_sign_in_at)),'[]'::jsonb) from auth.users where id=${u}),
      'lifecycle',(select coalesce(jsonb_object_agg(user_id,state),'{}'::jsonb) from private_privacy_ops.account_lifecycle where user_id=${u}),
      'stageState',(select coalesce(jsonb_object_agg(user_id,jsonb_build_object('lastCompletedStage',last_completed_stage,'failedStage',failed_stage,'destructiveStarted',destructive_started)),'{}'::jsonb) from private_privacy_ops.account_lifecycle where user_id=${u}),
      'context',coalesce(${context},'{}'::jsonb),
      'scopedResiduals',(select coalesce(jsonb_agg(item),'[]'::jsonb) from (${residuals}) q),
      'tables',jsonb_build_object(${entries.join(",\n")}),
      'assets',(select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name,'ownerId',owner_id,'mimeType',metadata->>'mimetype','size',metadata->'size')),'[]'::jsonb)
        from storage.objects where bucket_id='profile-assets' and (split_part(name,'/',1)=${u}::text or owner_id=${u}::text)));
    commit;`;
}

export function captureContextSql(user) {
  const u = literal(user);
  const { activity, comment, thread } = scopedQueries(user);
  return `update private_privacy_ops.account_lifecycle set erasure_context=jsonb_build_object(
    'referenceIds',(select coalesce(jsonb_agg(id),'[]'::jsonb) from (${activity} union ${comment} union ${thread}
      union select id from public.social_recommendation_messages where recommendation_id in (${thread})) q),
    'replyIds',(select coalesce(jsonb_agg(id),'[]'::jsonb) from public.social_activity_comments where author_id<>${u} and parent_comment_id in (${comment}) and activity_id not in (${activity})),
    'identifiers',jsonb_build_array(${u}::text)||(select coalesce(jsonb_agg(v),'[]'::jsonb) from public.profiles p,
      lateral unnest(array[p.username,p.display_name,p.avatar_path,p.banner_path]) v where p.id=${u} and v is not null and v<>''))
    where user_id=${u} and erasure_context='{}'::jsonb;`;
}

export function cleanupSql(user) {
  const u = literal(user);
  const { activity, comment, thread } = scopedQueries(user);
  // SQL runs as a single PostgreSQL transaction; Storage/Auth remain separate.
  const ownDelete = accountTables.filter((t) => !t.startsWith("xp_") && !["profiles", "social_activity_comments", "social_activity_events", "social_recommendations", "social_recommendation_events", "social_recommendation_messages", "social_notifications", "social_reports", "social_reactions", "profile_follows", "profile_blocks"].includes(t))
    .map((t) => `delete from public.${t} where ${domains[t].columns.map((col) => `${col}=${u}`).join(" or ")};`);
  return `begin;
    do $$ begin
      if session_user<>'postgres' or auth.uid() is not null or not exists(select 1 from private_privacy_ops.account_lifecycle where user_id=${u} and state='ERASING') then raise exception 'privacy_ops_denied'; end if;
    end $$;
    update private_privacy_ops.account_lifecycle set destructive_started=true where user_id=${u};
    select private_privacy_ops.detach_participant_xp_v1(${u});
    update public.social_activity_events set source_event_id='privacy-detached:'||id::text,
      dedupe_key='privacy-detached:'||id::text,short_text=null,
      media_snapshot=jsonb_build_object('title','Silinen öneri','mediaType',coalesce(media_snapshot->>'mediaType','movie'))
      where actor_id<>${u} and source_event_id in (select 'recommendation:'||id::text from (${thread}) q);
    delete from public.social_notifications where recipient_id=${u} or actor_id=${u} or entity_id=${u}
      or safe_payload->>'actorId'=${u}::text or safe_payload->>'userId'=${u}::text
      or entity_id in (${activity}) or entity_id in (${comment}) or entity_id in (${thread});
    -- Delete reports carrying A authorship or referring to erased containers.
    -- No invented moderation/legal retention. B's unrelated reports survive.
    delete from public.social_reports where reporter_id=${u} or activity_id in (${activity}) or comment_id in (${comment});
    delete from public.social_reactions where user_id=${u} or activity_id in (${activity}) or comment_id in (${comment});
    update public.social_activity_comments c set body='Silinen hesaba verilen yanıt.'
      where author_id<>${u} and parent_comment_id in (${comment}) and activity_id not in (${activity})
        and exists(select 1 from private_privacy_ops.account_lifecycle l,
          jsonb_array_elements_text(l.erasure_context->'identifiers') marker where l.user_id=${u} and position(marker in c.body)>0);
    update public.social_activity_comments set parent_comment_id=null where author_id<>${u} and parent_comment_id in (${comment}) and activity_id not in (${activity});
    delete from public.social_activity_comments where author_id=${u} or activity_id in (${activity});
    delete from public.social_activity_events where actor_id=${u};
    delete from public.social_recommendation_messages where author_id=${u} or recommendation_id in (${thread});
    delete from public.social_recommendation_events where actor_id=${u} or recommendation_id in (${thread});
    delete from public.social_recommendations where sender_id=${u} or recipient_id=${u};
    delete from public.profile_follows where follower_id=${u} or following_id=${u};
    delete from public.profile_blocks where blocker_id=${u} or blocked_id=${u};
    ${ownDelete.join("\n")}
    -- Deferred showcase/review reconciliation can create reversal XP at COMMIT.
    -- Flush it while Auth/XP still exist, then erase all resulting XP last.
    -- No trigger is disabled and no ordinary XP contract is relaxed.
    set constraints public.xp_showcase_reconcile,public.xp_shared_review_reconcile immediate;
    select private_privacy_ops.erase_xp_v1(${u},'ERASE XP ${user}');
    delete from public.profiles where id=${u};
    commit;`;
}
