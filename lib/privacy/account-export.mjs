// Pure privacy export contracts and sanitizer. No credentials, SQL, erasure or operator transport.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const owned = (columns, fields) => ({ columns: columns.split(" "), fields: fields.split(" "), erasure: "DELETE" });
// Explicit output allowlists: schema additions cannot silently enter an export.
export const domains = Object.freeze({
  profiles: owned("id", "id display_name username tagline bio location language visibility_mode connection_color avatar_path banner_path selected_title follow_list_visibility layout_mode joined_at created_at updated_at deleted_at username_changed_at recommendation_permission profile_palette_id banner_mode banner_position overlay_strength avatar_frame surface_style motif_intensity banner_focal_x banner_focal_y banner_zoom avatar_focal_x avatar_focal_y avatar_zoom profile_theme_visibility public_theme_preset public_theme_snapshot"),
  media_items: owned("user_id", "id user_id title type status current_progress total_progress external_source external_id cover_url backdrop_url overview release_year favorite user_rating tags personal_notes metadata created_at updated_at deleted_at canonical_version canonical_key canonical_source canonical_namespace canonical_stable_id identity_status revision"),
  progress_logs: owned("user_id", "id user_id media_id media_title media_type action amount unit previous_progress new_progress created_at detached_media_id detached_at revision deleted_at"),
  recommendation_feedback: owned("user_id", "id user_id action recommendation_id title media_type source external_source external_id session_id prompt metadata created_at"),
  profile_username_history: owned("user_id", "id user_id username claimed_at released_at reserved_until"),
  profile_modules: owned("user_id", "user_id module_key enabled visibility grid_x grid_y grid_width grid_height mobile_order config updated_at"),
  profile_media_showcase: owned("user_id", "id user_id showcase_kind title media_type external_source external_id cover_url world sort_order created_at updated_at"),
  profile_stats_snapshots: owned("user_id", "user_id total_media completed active planning favorites rated world_counts snapshot_at updated_at"),
  profile_progression_snapshots: owned("user_id", "user_id version total_xp level title tier dominant_world progress_percent world_counts snapshot_at updated_at"),
  profile_shared_notes: owned("user_id", "id user_id media_title media_type external_source external_id content contains_spoiler visibility confirmed_at created_at updated_at"),
  profile_follows: owned("follower_id following_id", "follower_id following_id status requested_at responded_at created_at updated_at"),
  profile_blocks: owned("blocker_id", "blocker_id blocked_id created_at"),
  social_activity_preferences: owned("user_id", "user_id share_completed share_started share_rating share_favorite share_recommendation_completed default_visibility updated_at"),
  social_activity_events: owned("actor_id", "id actor_id event_type visibility media_snapshot rating short_text created_at updated_at deleted_at"),
  social_activity_comments: owned("author_id", "id activity_id author_id parent_comment_id body spoiler created_at updated_at deleted_at hidden_by_owner_at"),
  social_reactions: owned("user_id", "id user_id activity_id comment_id reaction_type created_at updated_at"),
  social_recommendations: owned("sender_id recipient_id", "id sender_id recipient_id response_status progress_status sender_note recipient_response_note media_snapshot canonical_media_key already_in_library created_at responded_at started_at completed_at withdrawn_at updated_at"),
  social_recommendation_events: owned("actor_id", "id recommendation_id actor_id event_type occurred_at"),
  social_recommendation_messages: owned("author_id", "id recommendation_id author_id body created_at deleted_at"),
  social_notification_preferences: owned("user_id", "user_id follow_notifications comment_notifications reaction_notifications recommendation_received recommendation_accepted recommendation_started recommendation_completed recommendation_rejected recommendation_withdrawn updated_at"),
  social_notifications: owned("recipient_id", "id recipient_id actor_id notification_type entity_type entity_id created_at read_at deleted_at"),
  social_reports: owned("reporter_id", "id reporter_id activity_id comment_id category note created_at"),
  xp_events: owned("user_id", "id user_id event_type trust_level source_type source_id canonical_key occurred_at recorded_at metadata event_action effect"),
  xp_event_allocations: owned("event_id", "event_id axis_type axis_key amount"),
  xp_user_totals: owned("user_id", "user_id total_xp level current_level_start_xp next_level_start_xp updated_at version"),
  xp_user_world_totals: owned("user_id", "user_id world_key xp level tier title updated_at"),
  xp_user_branch_totals: owned("user_id", "user_id branch_key xp level tier updated_at"),
  xp_legacy_imports: owned("user_id", "user_id event_id aggregate imported_at"),
  xp_user_quest_progress: owned("user_id", "user_id quest_key current_value completed_at reward_event_id updated_at"),
  xp_user_badges: owned("user_id", "user_id badge_key awarded_at source_event_id selected display_order"),
  xp_media_entitlements: owned("user_id", "user_id canonical_media_key entitlement_type world_key is_active activated_at deactivated_at last_state_hash allocations updated_at"),
  xp_local_state_conversions: owned("user_id", "user_id correction_event_id converted_at"),
  user_theme_preferences: owned("user_id", "user_id schema_version active_theme_selection custom_themes revision created_at updated_at"),
  goals: owned("user_id", "id user_id definition revision deleted_at created_at updated_at"),
  cloud_media_sync_operations: owned("user_id", "user_id operation_id entity_type record_id operation_type expected_revision status applied_revision created_at completed_at"),
  goal_sync_operations: owned("user_id", "user_id operation_id goal_id operation_kind status created_at"),
});
export const ownerlessTables = ["embedding_cache", "xp_quest_definitions", "xp_badge_definitions"];
export const outsideControl = ["EXTERNAL_VENDOR: logs/backups/mail/recipient copies", "LOCAL_DEVICE_ONLY: browser data and downloaded exports", "Binary assets require separate delivery; metadata only", "Ownerless embedding legacy state cannot be attributed to an account"];
export const sharedPolicy = Object.freeze({
  relationships: "DELETE", authoredContent: "DELETE", dependentContainers: "DELETE",
  independentReplies: "DETACH", notifications: "DELETE", reports: "DELETE",
  independentParticipantXp: "RETAIN_NON_IDENTIFYING",
});

export function assertUser(userId) {
  if (typeof userId !== "string" || !UUID.test(userId)) throw new Error("Explicit exact UUID required");
}
export function validateSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.auth) || !Array.isArray(snapshot.assets)
    || !snapshot.tables || Object.keys(snapshot.tables).some((t) => !domains[t] && !ownerlessTables.includes(t))) {
    throw new Error("Unsupported/incomplete source schema");
  }
  for (const table of [...Object.keys(domains), ...ownerlessTables]) {
    if (!Array.isArray(snapshot.tables[table])) throw new Error(`Missing source category: ${table}`);
  }
}
export function resolveIdentity(snapshot, userId, email) {
  assertUser(userId);
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error("Exact registered email required");
  const matches = snapshot.auth.filter((r) => r.email?.toLowerCase() === email.toLowerCase());
  if (matches.length !== 1 || matches[0].id !== userId) throw new Error("Identity is absent, ambiguous or UUID does not match email");
  return matches[0];
}
const sensitive = /password|token(?:$|_)|secret|credential|email|private|user_metadata|app_metadata|identity_data|signed.?url|authorization|request_hash|dedupe|safe_payload|safe_metadata/i;
function sanitize(value, depth = 0) {
  if (depth > 15) throw new Error("Export nesting exceeds safe bound");
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter((k) => !sensitive.test(k) && !["__proto__", "constructor", "prototype"].includes(k))
    .map((k) => [k, sanitize(value[k], depth + 1)]));
  // Platform bearer URLs and credentials are never meaningful export metadata.
  if (typeof value === "string" && (/^Bearer\s/i.test(value) || /[?&](token|signature|apikey)=/i.test(value)
    || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))) return "[REDACTED]";
  return value;
}
export function rows(snapshot, table) { return snapshot.tables[table]; }
export function owner(row, table, userId) { return domains[table].columns.some((c) => row[c] === userId); }
export function selectedRows(snapshot, table, userId) {
  const events = new Set(rows(snapshot, "xp_events").filter((r) => r.user_id === userId).map((r) => r.id));
  const threads = new Set(rows(snapshot, "social_recommendations").filter((r) => owner(r, "social_recommendations", userId)).map((r) => r.id));
  return rows(snapshot, table).filter((r) => {
    if (table === "xp_event_allocations") return events.has(r.event_id);
    if (table === "social_recommendation_events") return threads.has(r.recommendation_id);
    if (table === "social_recommendation_messages") return r.author_id === userId || (threads.has(r.recommendation_id) && !r.deleted_at);
    return owner(r, table, userId);
  });
}
export function isOwnedAsset(asset, userId) {
  assertUser(userId);
  const name = asset.name;
  return asset.bucket === "profile-assets" && typeof name === "string" && name.split("/")[0] === userId
    && (asset.ownerId == null || asset.ownerId === userId)
    && !name.includes("\\") && !name.includes("%") && name.split("/").every((s) => s && s !== "." && s !== "..");
}
export function accountExport(snapshot, userId, email, generatedAt) {
  validateSnapshot(snapshot);
  const identity = resolveIdentity(snapshot, userId, email);
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Explicit valid generatedAt required");
  const categories = {};
  for (const [table, contract] of Object.entries(domains)) {
    categories[table] = selectedRows(snapshot, table, userId).map((row) => Object.fromEntries(contract.fields
      .filter((field) => Object.hasOwn(row, field)).map((field) => [field, sanitize(row[field])])))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { format: "MediaTrackerAccountPrivacyExport", schemaVersion: 1, generatedAt,
    identity: Object.fromEntries(["id", "email", "created_at", "email_confirmed_at", "last_sign_in_at"].filter((k) => Object.hasOwn(identity, k)).map((k) => [k, identity[k]])),
    scope: `Application-controlled ${snapshot.synthetic ? "synthetic" : "ops"} source; ACCOUNT_EXPORT != COMPLETE_DEVICE_LOCAL_EXPORT`,
    sourceCategories: Object.keys(categories), categories,
    assets: snapshot.assets.filter((a) => isOwnedAsset(a, userId)).map((a) => ({ bucket: a.bucket, name: a.name, mimeType: a.mimeType ?? null, size: a.size ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
    warnings: [...outsideControl, "Operational hashes, notification payloads, internal metadata and hidden third-party messages excluded", "Deployed completeness is unverified"] };
}

