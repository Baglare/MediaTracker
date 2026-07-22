import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSocialRecommendation } from "@/lib/social/recommendation-parser";

const migrationName = "20260721134500_recommendation_listing_regression_fix.sql";
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8").trim();
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const marker = `-- Recommendation listing regression fix (kept in sync with ${migrationName})`;
const xpMarker = "-- BEGIN XP V2 PROGRESSION";
const inboxSource = readFileSync(new URL("../components/social/recommendation-inbox.tsx", import.meta.url), "utf8");

const row = {
  id: "11111111-1111-4111-8111-111111111111", senderId: "22222222-2222-4222-8222-222222222222", recipientId: "33333333-3333-4333-8333-333333333333",
  responseStatus: "pending", progressStatus: "none", media: { title: "Dune", mediaType: "book", canonicalKey: "openlibrary:OL1W", world: "arch" },
  canonicalMediaKey: "openlibrary:OL1W", alreadyInLibrary: false, createdAt: "2026-07-21T12:00:00.000Z",
  other: { id: "33333333-3333-4333-8333-333333333333", displayName: "Deniz", username: null, avatarPath: null },
};
const resolveAvatar = async () => undefined;

describe("recommendation listing regression", () => {
  it("uses a unique migration and keeps canonical schema synchronized", () => { const names = readdirSync(new URL("../supabase/migrations/", import.meta.url)); expect(migrationName).toMatch(/^\d{14}_.+\.sql$/); expect(names.filter((name) => name.startsWith("20260721134500"))).toEqual([migrationName]); expect(schema.slice(schema.indexOf(marker) + marker.length,schema.indexOf(xpMarker)).trim()).toBe(migration); });
  it("uses the real recommendation event timestamp column", () => { expect(migration).toContain("e.occurred_at"); expect(migration).not.toMatch(/\be\.created_at\b/); });
  it("keeps messages and events optional enrichment instead of filtering joins", () => { expect(migration).toContain("'lastEvent',(select jsonb_build_object"); expect(migration).toContain("'lastMessagePreview',case"); expect(migration).not.toMatch(/join\s+public\.social_recommendation_(?:messages|events)\s/i); });
  it("keeps incoming and outgoing participant directions explicit", () => { expect(migration).toContain("p_box='received' then r.recipient_id=v_user else r.sender_id=v_user"); expect(schema).toContain("auth.uid() in (sender_id,recipient_id)"); });
  it("keeps all and lifecycle filters backward compatible", () => { expect(migration).toContain("p_status='all'"); expect(migration).toContain("p_status in ('started','completed') and r.progress_status=p_status"); expect(migration).toContain("p_status not in ('started','completed') and r.response_status=p_status"); });
  it("does not require a profile or avatar enrichment row", () => { expect(migration).toContain("left join public.profiles p"); expect(migration).toContain("coalesce(p.display_name,p.username,'MediaTracker kullanıcısı')"); });
  it.each([
    ["pending", "none"], ["rejected", "none"], ["accepted", "none"], ["accepted", "completed"],
  ] as const)("parses backward-compatible %s/%s records without messages or events", async (responseStatus, progressStatus) => {
    const result = await parseSocialRecommendation({ ...row, responseStatus, progressStatus }, resolveAvatar);
    expect(result.ok).toBe(true); if (result.ok) expect(result.value).toMatchObject({ responseStatus, progressStatus, unreadMessageCount: 0, lastEvent: undefined, lastMessagePreview: undefined, other: { displayName: "Deniz", avatarUrl: undefined } });
  });
  it("ignores malformed optional enrichment without dropping the recommendation", async () => { const result = await parseSocialRecommendation({ ...row, lastEvent: { id: "bad" }, lastMessagePreview: { body: 42 }, unreadMessageCount: null }, resolveAvatar); expect(result.ok).toBe(true); if (result.ok) expect(result.value).toMatchObject({ lastEvent: undefined, lastMessagePreview: undefined, unreadMessageCount: 0 }); });
  it("keeps API errors separate from the empty state and exposes retry", () => { expect(inboxSource).toContain("const [loadError, setLoadError]"); expect(inboxSource).toContain("!loading && !loadError && items.length === 0"); expect(inboxSource).toContain("Tekrar dene"); });
});
