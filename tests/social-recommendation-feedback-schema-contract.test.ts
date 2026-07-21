import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "20260721133000_recommendation_feedback_notification_ux.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8").trim();
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const marker = `-- Recommendation feedback & notification UX (kept in sync with ${migrationName})`;
const listingMarker = "-- Recommendation listing regression fix (kept in sync with 20260721134500_recommendation_listing_regression_fix.sql)";
const schemaPhase = schema.slice(schema.indexOf(marker) + marker.length, schema.indexOf(listingMarker)).trim();

describe("recommendation feedback and notification UX schema", () => {
  it("uses a unique 14-digit migration name", () => { const names = readdirSync(new URL("../supabase/migrations/", import.meta.url)); expect(migrationName).toMatch(/^\d{14}_.+\.sql$/); expect(names.filter((name) => name.startsWith("20260721133000"))).toEqual([migrationName]); });
  it("keeps migration and canonical schema synchronized", () => { expect(schema).toContain(marker); expect(schemaPhase).toBe(migration); });
  it("creates a participant-only, RLS protected recommendation message table", () => { expect(migration).toContain("create table if not exists public.social_recommendation_messages"); expect(migration).toContain("alter table public.social_recommendation_messages enable row level security"); expect(migration).toContain("auth.uid() in (r.sender_id,r.recipient_id)"); expect(migration).toContain("author_id=auth.uid()"); expect(migration).toContain("not public.social_is_blocked(r.sender_id,r.recipient_id)"); expect(migration).toContain("revoke insert,update,delete on public.social_recommendation_messages from anon,authenticated"); });
  it("enforces plain, non-empty 500 character messages and a server-time rate limit", () => { expect(migration).toContain("length(btrim(body)) between 1 and 500"); expect(migration).toContain("body !~ '[<>]'"); expect(migration).toContain("created_at>=now()-interval '1 hour'"); expect(migration).toContain(")>=30 then raise exception 'rate_limit'"); });
  it("keeps normal messages open through completed but closes rejected and withdrawn threads", () => { expect(migration).toContain("v_rec.response_status in ('rejected','withdrawn')"); expect(migration).toContain("p_allow_rejected_response and v_rec.response_status='rejected'"); expect(migration).toContain("'threadOpen',v_rec.response_status not in ('rejected','withdrawn')"); });
  it("adds optional transition feedback inside the transition transaction", () => { expect(migration).toContain("p_response_message text default null"); expect(migration).toContain("p_action not in ('accept','defer','reject')"); expect(migration).toContain("public.social_insert_recommendation_message(p_recommendation,v_user,p_response_message"); });
  it("creates recommendation_message notifications only for the other participant through the server helper", () => { expect(migration).toContain("v_recipient:=case when p_author=v_rec.sender_id then v_rec.recipient_id else v_rec.sender_id end"); expect(migration).toContain("'recommendation_message','recommendation',p_recommendation"); expect(migration).toContain("revoke all on function public.social_insert_recommendation_message"); });
  it("marks only the authenticated recipient's matching entity notifications read", () => { expect(migration).toContain("p_action='mark_entity_read'"); expect(migration).toContain("n.recipient_id=auth.uid()"); expect(migration).toContain("n.entity_type=p_entity_type and n.entity_id=p_entity_id"); expect(migration).toContain("n.safe_payload->>'activityId'=p_entity_id::text"); expect(migration).toContain("c.id=n.entity_id and c.activity_id=p_entity_id"); });
  it("returns list summaries without loading every message thread", () => { expect(migration).toContain("'lastMessagePreview'"); expect(migration).toContain("'unreadMessageCount'"); expect(migration).toContain("create or replace function public.get_social_recommendation_detail"); });
});
