import { domains, ownerlessTables } from "./privacy-account-model.mjs";

export const USER_A = "11111111-1111-4111-8111-111111111111";
export const USER_B = "22222222-2222-4222-8222-222222222222";
export function fixture() {
  const tables = Object.fromEntries([...Object.keys(domains), ...ownerlessTables].map((t) => [t, []]));
  for (const [table, contract] of Object.entries(domains)) {
    if (table === "xp_event_allocations") continue;
    tables[table] = [USER_A, USER_B].map((id, i) => ({
      id: table === "profiles" ? id : `${table}-${i}`, ...Object.fromEntries(contract.columns.map((c) => [c, id])),
      created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z",
    }));
  }
  tables.media_items[0].title = "Synthetic A media";
  tables.media_items[1].personal_notes = "B private notes";
  tables.media_items[0].metadata = { manualCalendar: { date: "2026-10-05" }, access_token: "excluded", private_profile: { email: "b@example.invalid" } };
  tables.user_theme_preferences[0].custom_themes = [{ name: "Synthetic theme", tokens: { background: "#101010" } }];
  tables.social_recommendations = [{ id: "thread-ab", sender_id: USER_A, recipient_id: USER_B, sender_note: "A shared note", recipient_response_note: "B shared reply" }];
  tables.social_recommendation_events = [{ id: "event-b", recommendation_id: "thread-ab", actor_id: USER_B, event_type: "accepted", safe_metadata: { email: "excluded" } }];
  tables.social_recommendation_messages = [
    { id: "message-b", recommendation_id: "thread-ab", author_id: USER_B, body: "Visible B reply" },
    { id: "message-hidden", recommendation_id: "thread-ab", author_id: USER_B, body: "B hidden message", deleted_at: "2026-10-01" },
  ];
  tables.social_notifications = [
    { id: "notice-a", recipient_id: USER_A, actor_id: USER_B, notification_type: "new_follower", safe_payload: { email: "excluded" } },
    { id: "notice-b", recipient_id: USER_B, actor_id: USER_A, notification_type: "new_follower", entity_id: USER_A, safe_payload: { actorId: USER_A }, dedupe_key: `follow:${USER_A}` },
    { id: "notice-b-independent", recipient_id: USER_B, actor_id: USER_B, notification_type: "new_follower", entity_id: USER_B, safe_payload: { title: "B independent notice" }, dedupe_key: "independent" },
  ];
  tables.social_activity_comments[1].activity_id = tables.social_activity_events[1].id;
  tables.social_activity_comments[0].activity_id = tables.social_activity_events[1].id;
  tables.social_reactions[0].activity_id = tables.social_activity_events[1].id;
  tables.social_reports[0].activity_id = tables.social_activity_events[1].id;
  tables.xp_event_allocations = [USER_A, USER_B].map((id, i) => ({ event_id: tables.xp_events[i].id, axis_type: "general", axis_key: "general", amount: 1 }));
  for (const [table, column] of [["xp_legacy_imports", "event_id"], ["xp_user_quest_progress", "reward_event_id"], ["xp_user_badges", "source_event_id"], ["xp_local_state_conversions", "correction_event_id"]]) {
    tables[table].forEach((row, i) => { row[column] = tables.xp_events[i].id; });
  }
  return { schemaVersion: 1, synthetic: true,
    auth: [USER_A, USER_B].map((id, i) => ({ id, email: `${i ? "b" : "a"}@example.invalid`, created_at: "2026-10-01T00:00:00.000Z", encrypted_password: "not-exported", refresh_token: "not-exported", app_metadata: { role: "not-exported" } })),
    tables, assets: [USER_A, USER_B].map((id) => ({ bucket: "profile-assets", name: `${id}/avatar/synthetic.png`, ownerId: id, mimeType: "image/png", size: 64 })),
  };
}
