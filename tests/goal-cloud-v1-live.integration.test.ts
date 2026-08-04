import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertSafeSupabaseTestTarget } from "@/lib/supabase-test-target";

const env = {
  url: process.env.SUPABASE_TEST_URL,
  anon: process.env.SUPABASE_TEST_ANON_KEY,
  aEmail: process.env.SUPABASE_TEST_USER_A_EMAIL,
  aPassword: process.env.SUPABASE_TEST_USER_A_PASSWORD,
  bEmail: process.env.SUPABASE_TEST_USER_B_EMAIL,
  bPassword: process.env.SUPABASE_TEST_USER_B_PASSWORD,
};
const configured = Object.values(env).every(Boolean);
let isolatedTarget = false;
if (configured && env.url) {
  try {
    assertSafeSupabaseTestTarget(env.url);
    isolatedTarget = true;
  } catch {
    isolatedTarget = false;
  }
}
const live = configured && isolatedTarget;

describe.runIf(live)("Goal Cloud V1 disposable live runner", () => {
  it("covers CAS, replay, owner isolation and tombstone without service role", async (context) => {
    const a = createClient(env.url!, env.anon!, { auth: { persistSession: false } });
    const b = createClient(env.url!, env.anon!, { auth: { persistSession: false } });
    expect((await a.auth.signInWithPassword({ email: env.aEmail!, password: env.aPassword! })).error).toBeNull();
    expect((await b.auth.signInWithPassword({ email: env.bEmail!, password: env.bPassword! })).error).toBeNull();
    const schemaProbe = await a.from("goals").select("id").limit(1);
    if (schemaProbe.error) {
      context.skip(`Goal V1 test şeması hazır değil: ${schemaProbe.error.code ?? "schema_unavailable"}`);
      return;
    }
    const prefix = `d5-live-${crypto.randomUUID()}`;
    const goalId = crypto.randomUUID();
    const definition = {
      id: goalId, title: prefix, origin: "manual", scope: { kind: "library" },
      metric: { kind: "completed_media", targetValue: 1 },
      schedule: { kind: "monthly", startsOn: "2026-08-01", timeZone: "Europe/Istanbul" },
      lifecycle: "active", createdAt: "2026-08-03T08:00:00.000Z", updatedAt: "2026-08-03T08:00:00.000Z",
    };
    const createOperation = crypto.randomUUID();
    const create = await a.rpc("apply_cloud_goal_v1", { p_operation_id: createOperation, p_goal_id: goalId, p_expected_revision: 0, p_definition: definition, p_delete: false });
    expect(create.error).toBeNull();
    expect(create.data).toMatchObject({ status: "applied", revision: 1 });
    const replay = await a.rpc("apply_cloud_goal_v1", { p_operation_id: createOperation, p_goal_id: goalId, p_expected_revision: 0, p_definition: definition, p_delete: false });
    expect(replay.data).toMatchObject({ status: "idempotent_replay", revision: 1 });
    const reused = await a.rpc("apply_cloud_goal_v1", { p_operation_id: createOperation, p_goal_id: goalId, p_expected_revision: 0, p_definition: { ...definition, title: `${prefix}-changed` }, p_delete: false });
    expect(reused.data).toMatchObject({ status: "operation_id_reused" });
    const update = await a.rpc("apply_cloud_goal_v1", { p_operation_id: crypto.randomUUID(), p_goal_id: goalId, p_expected_revision: 1, p_definition: { ...definition, title: `${prefix}-v2`, updatedAt: "2026-08-03T09:00:00.000Z" }, p_delete: false });
    expect(update.data).toMatchObject({ status: "applied", revision: 2 });
    const stale = await a.rpc("apply_cloud_goal_v1", { p_operation_id: crypto.randomUUID(), p_goal_id: goalId, p_expected_revision: 1, p_definition: definition, p_delete: false });
    expect(stale.data).toMatchObject({ status: "revision_conflict", revision: 2 });
    const bRead = await b.from("goals").select("id").eq("id", goalId);
    expect(bRead.data).toEqual([]);
    const bSameId = await b.rpc("apply_cloud_goal_v1", { p_operation_id: crypto.randomUUID(), p_goal_id: goalId, p_expected_revision: 0, p_definition: definition, p_delete: false });
    expect(bSameId.data).toMatchObject({ status: "applied", revision: 1 });

    const mediaId = `${prefix}-media`;
    const media = await a.rpc("apply_media_item_sync_operation", {
      p_operation_id: crypto.randomUUID(), p_record_id: mediaId,
      p_operation_type: "upsert", p_expected_revision: 0,
      p_payload: {
        title: prefix, type: "tv", status: "watching", current_progress: 1,
        total_progress: 12, external_source: null, external_id: null,
        cover_url: null, backdrop_url: null, overview: null, release_year: null,
        favorite: false, user_rating: null, tags: [], personal_notes: null,
        metadata: {}, identity_status: "unresolved",
      },
    });
    expect(media.error).toBeNull();
    const logId = `${prefix}-log`;
    const progressPayload = {
      media_id: mediaId, media_title: prefix, media_type: "tv", action: "increment",
      amount: 1, unit: "episode", previous_progress: 0, new_progress: 1,
      created_at: "2026-08-03T08:00:00.000Z",
    };
    const progressOperation = crypto.randomUUID();
    const progressCreate = await a.rpc("apply_progress_log_sync_operation", { p_operation_id: progressOperation, p_record_id: logId, p_operation_type: "upsert", p_expected_revision: 0, p_payload: progressPayload });
    expect(progressCreate.data).toMatchObject({ ok: true, reason: "created" });
    const progressReplay = await a.rpc("apply_progress_log_sync_operation", { p_operation_id: progressOperation, p_record_id: logId, p_operation_type: "upsert", p_expected_revision: 0, p_payload: progressPayload });
    expect(progressReplay.data).toMatchObject({ ok: true });
    const progressConflict = await a.rpc("apply_progress_log_sync_operation", { p_operation_id: crypto.randomUUID(), p_record_id: logId, p_operation_type: "upsert", p_expected_revision: 1, p_payload: { ...progressPayload, new_progress: 2 } });
    expect(progressConflict.data).toMatchObject({ ok: false, reason: "immutable_log_conflict" });
    const tombstone = await a.rpc("apply_cloud_goal_v1", { p_operation_id: crypto.randomUUID(), p_goal_id: goalId, p_expected_revision: 2, p_definition: null, p_delete: true });
    expect(tombstone.data).toMatchObject({ status: "applied", revision: 3 });
    const afterDelete = await a.rpc("apply_cloud_goal_v1", { p_operation_id: crypto.randomUUID(), p_goal_id: goalId, p_expected_revision: 2, p_definition: definition, p_delete: false });
    expect(afterDelete.data.status).toMatch(/deleted_conflict|revision_conflict/);
    await b.rpc("apply_cloud_goal_v1", { p_operation_id: crypto.randomUUID(), p_goal_id: goalId, p_expected_revision: 1, p_definition: null, p_delete: true });
    await a.rpc("apply_progress_log_sync_operation", { p_operation_id: crypto.randomUUID(), p_record_id: logId, p_operation_type: "delete", p_expected_revision: 1, p_payload: null });
    await a.rpc("apply_media_item_sync_operation", { p_operation_id: crypto.randomUUID(), p_record_id: mediaId, p_operation_type: "delete", p_expected_revision: 1, p_payload: null });
  });
});

describe.skipIf(live)("Goal Cloud V1 disposable live runner guard", () => {
  it("skips without isolated anon test credentials and refuses production collisions", () => {
    expect(live).toBe(false);
  });
});
