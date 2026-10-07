import test from "node:test";
import assert from "node:assert/strict";
import { fixture, USER_A, USER_B } from "../scripts/privacy-synthetic-fixture.mjs";
import { syntheticAdapter, runErasure } from "../scripts/privacy-account-model.mjs";
import { cleanupSql } from "../scripts/privacy-account-sql.mjs";

test("surviving recommendation activity satisfies required SQL snapshot shape and retries", async () => {
  const initial = fixture();
  initial.tables.profiles[0].username = "erased-person";
  initial.tables.social_activity_events.push({ id: "surviving-activity", actor_id: USER_B,
    source_event_id: "recommendation:thread-ab", media_snapshot: {
      title: "erased-person recommendation", mediaType: "movie", canonicalKey: `manual:${USER_A}`,
    }, short_text: "erased-person" });
  const independent = structuredClone(initial.tables.social_activity_events[1]);
  const adapter = syntheticAdapter(initial);
  const options = { execute: true, confirmation: `ERASE SYNTHETIC ${USER_A}`, acceptParticipantLoss: true };
  const report = await runErasure(adapter, USER_A, options);
  assert.equal(report.completed, true);
  const after = await adapter.inspect();
  const retained = after.tables.social_activity_events.find(r => r.id === "surviving-activity");
  assert.ok(retained);
  assert.equal(retained.media_snapshot.title, "Silinen öneri");
  assert.equal(retained.media_snapshot.mediaType, "movie");
  assert.ok(retained.media_snapshot.canonicalKey?.length >= 3 && retained.media_snapshot.canonicalKey.length <= 260);
  assert.ok(!JSON.stringify(retained).includes(USER_A));
  assert.ok(!JSON.stringify(retained).includes("erased-person"));
  assert.deepEqual(after.tables.social_activity_events.find(r => r.id === independent.id), independent);
  await runErasure(adapter, USER_A, options);
  assert.deepEqual((await adapter.inspect()).tables.social_activity_events, after.tables.social_activity_events);
  assert.match(cleanupSql(USER_A), /'canonicalKey'/);
});
