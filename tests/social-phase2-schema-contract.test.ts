import { readFileSync,readdirSync } from "node:fs";
import { describe,expect,it } from "vitest";

const path=new URL("../supabase/migrations/20260721130000_social_interactions_recommendations.sql",import.meta.url);const sql=readFileSync(path,"utf8");
const schema=readFileSync(new URL("../supabase/schema.sql",import.meta.url),"utf8");
const phaseTwoMarker="-- Social Phase 2 (kept in sync with 20260721130000_social_interactions_recommendations.sql)";
const nextMigrationMarker="-- Recommendation feedback & notification UX (kept in sync with 20260721133000_recommendation_feedback_notification_ux.sql)";
const schemaPhaseTwo=schema.slice(schema.indexOf(phaseTwoMarker)+phaseTwoMarker.length,schema.indexOf(nextMigrationMarker)).trim();

function functionSql(source:string,name:string):string{
  const start=source.indexOf(`create or replace function public.${name}(`);if(start<0)return"";
  const next=source.indexOf("create or replace function public.",start+1);return source.slice(start,next<0?source.length:next);
}

function compositeMultiTargetIntoStatements(source:string):string[]{
  const rowVariables=new Set([...source.matchAll(/\b(v_[a-z0-9_]+)\s+public\.[a-z0-9_]+%rowtype\b/gi)].map((match)=>match[1].toLowerCase()));
  return source.split(";").filter((statement)=>{
    const into=statement.match(/\bselect\b[\s\S]*?\binto\s+([\s\S]*?)\bfrom\b/i);if(!into||!into[1].includes(","))return false;
    const targets=into[1].split(",").map((target)=>target.trim().toLowerCase());
    return targets.some((target)=>rowVariables.has(target));
  });
}

function notificationCalls(source:string):Array<{sql:string;closed:boolean}>{
  const needle="perform public.social_insert_notification(";const calls:Array<{sql:string;closed:boolean}>=[];let offset=0;
  while(true){const start=source.indexOf(needle,offset);if(start<0)break;let depth=1;let quoted=false;let end=start+needle.length;
    for(;end<source.length;end+=1){const char=source[end];if(char==="'"){if(quoted&&source[end+1]==="'"){end+=1;continue;}quoted=!quoted;continue;}if(quoted)continue;if(char==="(")depth+=1;else if(char===")"){depth-=1;if(depth===0){end+=1;break;}}}
    calls.push({sql:source.slice(start,end),closed:depth===0});offset=end;
  }
  return calls;
}

describe("Social Phase 2 SQL contract (static, not live Supabase integration)",()=>{
  it("uses the next unique 14-digit migration timestamp",()=>{const names=readdirSync(new URL("../supabase/migrations/",import.meta.url));expect(names).toContain("20260721130000_social_interactions_recommendations.sql");expect(new Set(names.map((name)=>name.slice(0,14))).size).toBe(names.length);});
  it.each(["social_activity_events","social_activity_comments","social_reactions","social_activity_preferences","social_recommendations","social_recommendation_events","social_notifications","social_notification_preferences","social_reports"])("creates %s",(table)=>expect(sql).toContain(`create table if not exists public.${table}`));
  it("enables RLS on every Phase 2 table",()=>{for(const table of ["social_activity_events","social_activity_comments","social_reactions","social_activity_preferences","social_recommendations","social_recommendation_events","social_notifications","social_notification_preferences","social_reports"])expect(sql).toContain(`alter table public.${table} enable row level security`);});
  it("keeps activity selection behind profile visibility, follow and block checks",()=>{expect(sql).toContain("social_can_view_activity_row");expect(sql).toContain("public.social_is_blocked(p_owner,p_viewer)");expect(sql).toContain("visibility_mode from public.profiles");expect(sql).toContain("status='accepted'");});
  it("limits the feed to self and accepted following with cursor pagination",()=>{expect(sql).toContain("f.follower_id=v_user and f.following_id=a.actor_id and f.status='accepted'");expect(sql).toContain("(a.created_at,a.id)<");expect(sql).not.toContain(" offset ");});
  it("enforces one-level replies by reattaching replies to the root",()=>expect(sql).toContain("v_root:=coalesce(v_parent.parent_comment_id,v_parent.id)"));
  it("enforces comment limits, duplicate prevention and plain text",()=>{expect(sql).toContain("interval '1 hour'");expect(sql).toContain("interval '2 minutes'");expect(sql).toContain("length(btrim(body)) between 1 and 1000");});
  it("uses real foreign keys and exactly-one-target checks for reactions",()=>{expect(sql).toContain("activity_id uuid references public.social_activity_events");expect(sql).toContain("comment_id uuid references public.social_activity_comments");expect(sql).toContain("social_reactions_one_target_check");expect(sql).toContain("social_reactions_activity_unique");expect(sql).toContain("social_reactions_comment_unique");});
  it("separates recommendation response and progress state",()=>{expect(sql).toContain("response_status text not null default 'pending'");expect(sql).toContain("progress_status text not null default 'none'");expect(sql).toContain("response_status in ('pending','accepted','deferred','rejected','withdrawn')");expect(sql).toContain("progress_status in ('none','linked','started','completed')");});
  it("enforces recommendation permission, self/personal/block and active duplicate rules",()=>{for(const permission of ["mutual","following","followers","everyone","none"])expect(sql).toContain(permission);expect(sql).toContain("self_recommendation_not_allowed");expect(sql).toContain("v_mode='personal'");expect(sql).toContain("public.social_is_blocked(v_user,p_recipient)");expect(sql).toContain("social_recommendations_active_unique");});
  it("enforces recipient-only response/progress and sender-only withdraw",()=>{expect(sql).toContain("v_user<>v_rec.recipient_id");expect(sql).toContain("v_user<>v_rec.sender_id");expect(sql).toContain("v_rec.response_status not in ('pending','deferred')");});
  it("records stable recommendation events without XP writes",()=>{for(const event of ["sent","deferred","accepted","rejected","withdrawn","linked","started","completed"])expect(sql).toContain(`'${event}'`);expect(sql).toContain("unique(recommendation_id,dedupe_key)");expect(sql.toLowerCase()).not.toContain("xp_ledger");expect(sql.toLowerCase()).not.toContain("award_xp");});
  it("uses server time for rate limits and applies requested caps",()=>{expect(sql).toContain("created_at>=date_trunc('day',now())");expect(sql).toContain(">=10");expect(sql).toContain(">=5");expect(sql).toContain(">=60");expect(sql).toContain(">=120");expect(sql).toContain(">= 30");});
  it("isolates notifications to recipients and prevents actor direct insert",()=>{expect(sql).toContain("create policy social_notifications_recipient");expect(sql).toContain("auth.uid()=recipient_id");expect(sql).toMatch(/revoke insert,update,delete on public\.[\s\S]*social_notifications/);expect(sql).toContain("social_insert_notification");});
  it("defaults direct notifications on and rejection notifications off",()=>{expect(sql).toContain("recommendation_rejected boolean not null default false");expect(sql).toContain("recommendation_received boolean not null default true");});
  it("adds the activity profile module without rewriting stored visibility",()=>{expect(sql).toContain("'activity',true,'followers'");expect(sql).toContain("profiles_ensure_activity_module");expect(sql).not.toMatch(/update\s+public\.profile_modules\s+set\s+visibility/i);});
  it("soft deletes activities and suppresses their comments from feed",()=>{expect(sql).toContain("update public.social_activity_events set deleted_at=now()");expect(sql).toContain("a.deleted_at is null");});
  it("accepts reports only for targets visible to the current viewer",()=>{expect(sql).toContain("not public.social_can_view_activity_row(v_owner,v_visibility,v_user)");expect(sql).toContain("raise exception 'target_unavailable'");});
  it("keeps viewer-specific routes private through RPC grants",()=>{expect(sql).toContain("grant execute on function public.list_social_feed");expect(sql).toContain("to authenticated");expect(sql).toContain("list_profile_activity(uuid,integer) to anon,authenticated");});
  it.each([["migration",sql],["schema",schemaPhaseTwo]])("has no composite row variable in a multi-target SELECT INTO list (%s)",(_,source)=>{expect(source).not.toMatch(/select\s+c\.\*\s*,\s*a\.actor_id\s+into\s+v_comment\s*,\s*v_owner/i);expect(source).not.toMatch(/select\s+a\s*,\s*c\.author_id\s+into\s+v_activity\s*,\s*v_owner/i);expect(compositeMultiTargetIntoStatements(source)).toEqual([]);});
  it.each([["migration",sql],["schema",schemaPhaseTwo]])("loads comment and activity owner separately in social_comment_action (%s)",(_,source)=>{const fn=functionSql(source,"social_comment_action");expect(fn).toMatch(/select\s+c\.\*\s+into\s+v_comment\s+from\s+public\.social_activity_comments\s+c/i);expect(fn).toMatch(/select\s+a\.actor_id\s+into\s+v_owner\s+from\s+public\.social_activity_events\s+a\s+where\s+a\.id\s*=\s*v_comment\.activity_id/i);expect(fn).not.toMatch(/into\s+v_comment\s*,/i);});
  it.each([["migration",sql],["schema",schemaPhaseTwo]])("loads comment and activity rows separately in social_react (%s)",(_,source)=>{const fn=functionSql(source,"social_react");expect(fn).toMatch(/v_comment\s+public\.social_activity_comments%rowtype/i);expect(fn).toMatch(/select\s+c\.\*\s+into\s+v_comment\s+from\s+public\.social_activity_comments\s+c/i);expect(fn).toMatch(/select\s+a\.\*\s+into\s+v_activity\s+from\s+public\.social_activity_events\s+a\s+where\s+a\.id\s*=\s*v_comment\.activity_id/i);expect(fn).toContain("v_owner:=v_comment.author_id");expect(fn).not.toMatch(/into\s+v_activity\s*,/i);});
  it.each([["migration",sql],["schema",schemaPhaseTwo]])("precomputes social_follow notification values before the call (%s)",(_,source)=>{const fn=functionSql(source,"social_follow");expect(fn).toMatch(/v_notification_type\s+text/i);expect(fn).toMatch(/v_notification_dedupe_key\s+text/i);expect(fn).toMatch(/v_notification_type\s*:=\s*case\s+when\s+v_status='accepted'\s+then\s+'new_follower'\s+else\s+'follow_request_received'\s+end/i);expect(fn).toMatch(/v_notification_dedupe_key\s*:=\s*case\s+when\s+v_status='accepted'\s+then\s+'new_follower:'\s+else\s+'follow_request:'\s+end\s*\|\|\s*v_user::text/i);const calls=notificationCalls(fn);expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({closed:true});expect(calls[0].sql).not.toMatch(/\bcase\b/i);expect(calls[0].sql).toMatch(/social_insert_notification\(\s*p_target,\s*v_user,\s*v_notification_type,\s*'profile',\s*v_user,\s*'\{\}'::jsonb,\s*v_notification_dedupe_key\s*\)/i);});
  it.each([["migration",sql],["schema",schemaPhaseTwo]])("keeps every notification call parenthesized and CASE-balanced (%s)",(_,source)=>{const calls=notificationCalls(source);expect(calls).toHaveLength(6);for(const call of calls){expect(call.closed).toBe(true);expect(call.sql.match(/\bcase\b/gi)?.length??0).toBe(call.sql.match(/\bend\b/gi)?.length??0);}});
  it("keeps the canonical schema Phase 2 section synchronized with the migration",()=>expect(schemaPhaseTwo).toBe(sql.trim()));
});
