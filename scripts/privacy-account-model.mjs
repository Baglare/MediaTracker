// Ops-only model. Never import from app/, features/, hooks/, components/ or lib/.
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
function rows(snapshot, table) { return snapshot.tables[table]; }
function owner(row, table, userId) { return domains[table].columns.some((c) => row[c] === userId); }
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

// Child references under deleted application containers follow existing FK semantics.
// Participant loss is previewed and needs explicit acknowledgement before execution.
export function erasureSelection(snapshot, userId) {
  const selected = Object.fromEntries(Object.keys(domains).map((t) => [t, new Set(rows(snapshot, t).filter((r) => owner(r, t, userId)))]));
  selected.profile_blocks = new Set(rows(snapshot, "profile_blocks").filter((r) => r.blocker_id === userId || r.blocked_id === userId));
  const inSet = (table, column, value) => [...selected[table]].some((r) => r[column] === value);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [table, refs] of Object.entries({
      xp_event_allocations: [["event_id", "xp_events"]],
      social_activity_comments: [["activity_id", "social_activity_events"]],
      social_reactions: [["activity_id", "social_activity_events"], ["comment_id", "social_activity_comments"]],
      social_reports: [["activity_id", "social_activity_events"], ["comment_id", "social_activity_comments"]],
      social_recommendation_messages: [["recommendation_id", "social_recommendations"]],
      social_recommendation_events: [["recommendation_id", "social_recommendations"]],
    })) for (const row of rows(snapshot, table)) {
      if (!selected[table].has(row) && refs.some(([column, parent]) => row[column] != null && inSet(parent, "id", row[column]))) {
        selected[table].add(row); changed = true;
      }
    }
  }
  const ids = new Set([userId, ...["social_activity_events", "social_activity_comments", "social_recommendations"].flatMap((t) => [...selected[t]].map((r) => r.id))]);
  selected.social_notifications = new Set(rows(snapshot, "social_notifications").filter((r) => r.recipient_id === userId || r.actor_id === userId || ids.has(r.entity_id)
    || r.safe_payload?.actorId === userId || r.safe_payload?.userId === userId));
  return selected;
}
function detachableXp(row, selected, userId) {
  const ids = new Set([...selected.social_recommendations, ...selected.social_recommendation_messages].map((r) => r.id));
  return row.user_id !== userId && (ids.has(row.source_id) || ids.has(row.metadata?.recommendationId));
}
function detachableActivity(row, selected, userId) {
  return row.actor_id !== userId && [...selected.social_recommendations].some((r) => row.source_event_id === `recommendation:${r.id}`);
}
const neutralReply = "Silinen hesaba verilen yanıt.";
function identifiers(snapshot, userId) {
  const profile = rows(snapshot, "profiles").find((r) => r.id === userId);
  return [...new Set([userId, ...(snapshot.contexts?.[userId]?.identifiers ?? snapshot.context?.identifiers ?? []),
    ...["username", "display_name", "avatar_path", "banner_path"].map((k) => profile?.[k])].filter((v) => typeof v === "string" && v.length))];
}
function attributedReply(row, selected, markers) {
  return row.body !== neutralReply && typeof row.body === "string" && markers.some((v) => row.body.includes(v))
    && [...selected.social_activity_comments].some((r) => r.id === row.parent_comment_id);
}
export function erasePlan(snapshot, userId) {
  validateSnapshot(snapshot); assertUser(userId);
  const selected = erasureSelection(snapshot, userId);
  const markers = identifiers(snapshot, userId);
  const counts = Object.fromEntries(Object.entries(selected).map(([t, set]) => [t, set.size]));
  const participantLoss = Object.fromEntries(Object.entries(selected).filter(([t]) => t !== "xp_event_allocations")
    .map(([t, set]) => [t, [...set].filter((r) => !owner(r, t, userId)).length]).filter(([, n]) => n));
  const sharedThreads = [...selected.social_recommendations].filter((r) => r.sender_id !== userId || r.recipient_id !== userId).length;
  if (sharedThreads) participantLoss.shared_recommendation_relationships = sharedThreads;
  const blocked = [];
  for (const [t, c] of [["xp_legacy_imports", "event_id"], ["xp_user_quest_progress", "reward_event_id"], ["xp_user_badges", "source_event_id"], ["xp_local_state_conversions", "correction_event_id"]]) {
    if (rows(snapshot, t).some((r) => r.user_id !== userId && [...selected.xp_events].some((e) => e.id === r[c]))) blocked.push(`Cross-owner XP reference: ${t}`);
  }
  // Ownerless/global state never gets guessed from content. Unknown UUID references fail closed.
  for (const [table, records] of Object.entries(snapshot.tables)) {
    for (const row of records) if (!selected[table]?.has(row) && JSON.stringify(row).includes(userId)
      && !(table === "xp_events" && detachableXp(row, selected, userId))
      && !(table === "social_activity_events" && detachableActivity(row, selected, userId))
      && !(table === "social_activity_comments" && attributedReply(row, selected, markers))) blocked.push(`Unclassified residual: ${table}`);
  }
  const replyIds = snapshot.contexts?.[userId]?.replyIds ?? snapshot.context?.replyIds ?? [];
  for (const row of rows(snapshot, "social_activity_comments")) if (replyIds.includes(row.id) && row.body !== neutralReply
    && typeof row.body === "string" && markers.some((v) => row.body.includes(v)) && !attributedReply(row, selected, markers)) blocked.push("Participant text residual: social_activity_comments");
  for (const residual of snapshot.scopedResiduals ?? []) {
    if (![...(selected[residual.table] ?? [])].some((r) => r.id === residual.row?.id)
      && !(residual.table === "xp_events" && detachableXp(residual.row, selected, userId))
      && !(residual.table === "social_activity_comments" && attributedReply(residual.row, selected, markers))) blocked.push(`Participant residual: ${residual.table}`);
  }
  for (const a of snapshot.assets) if ((a.ownerId === userId || a.name?.startsWith(`${userId}/`)) && !isOwnedAsset(a, userId)) blocked.push("Unsafe owned asset path");
  return { schemaVersion: 1, userId, dryRun: true, counts, participantLoss,
    assets: snapshot.assets.filter((a) => isOwnedAsset(a, userId)).map((a) => a.name).sort(),
    detachNotifications: rows(snapshot, "social_notifications").filter((r) => r.actor_id === userId && r.recipient_id !== userId).length,
    anonymizeReplies: rows(snapshot, "social_activity_comments").filter((r) => !selected.social_activity_comments.has(r) && attributedReply(r, selected, markers)).length,
    stages: ["lock-pending", "write-denial-verify", "lock-erasing", "application-cleanup", "storage-remove", "storage-verify", "application-verify", "barrier-verify", "auth-delete", "verify"],
    blocked: [...new Set(blocked)].sort(), limitations: outsideControl };
}
export function verifyErasure(snapshot, userId) {
  const plan = erasePlan(snapshot, userId);
  const residuals = [];
  if (snapshot.auth.some((r) => r.id === userId)) residuals.push("Auth present");
  for (const [table, count] of Object.entries(plan.counts)) if (count) residuals.push(`${table}: ${count}`);
  if (plan.assets.length || plan.detachNotifications) residuals.push("Storage/notification actor residual");
  residuals.push(...plan.blocked);
  return { applicationControlledAbsent: residuals.length === 0, residuals, publicProfileAbsent: !rows(snapshot, "profiles").some((r) => r.id === userId),
    searchProjectionAbsent: !rows(snapshot, "profiles").some((r) => r.id === userId), limitations: outsideControl };
}

export async function runErasure(adapter, userId, { execute = false, confirmation, acceptParticipantLoss = false } = {}) {
  const snapshot = await adapter.inspect();
  const plan = erasePlan(snapshot, userId);
  if (!execute) return { plan, stages: [], executed: false };
  if (confirmation !== `ERASE ${adapter.environment === "disposable" ? "DISPOSABLE" : "SYNTHETIC"} ${userId}`) throw new Error("Destructive confirmation required");
  if (plan.blocked.length) throw new Error("Erasure blocked by unclassified dependencies");
  if ((Object.keys(plan.participantLoss).length || plan.anonymizeReplies) && !acceptParticipantLoss) throw new Error("Dependent participant loss requires explicit acknowledgement");
  const stages = [];
  for (const stage of plan.stages) {
    try {
      if (stage === "lock-pending") await adapter.transition(userId, "ERASURE_PENDING");
      if (stage === "write-denial-verify" || stage === "barrier-verify") await adapter.assertLocked(userId);
      if (stage === "lock-erasing") await adapter.transition(userId, "ERASING");
      if (stage === "storage-remove") await adapter.removeAssets(userId, plan.assets);
      if (stage === "storage-verify") {
        await adapter.verifyAssets(userId);
        if ((await adapter.inspect()).assets.some((a) => isOwnedAsset(a, userId))) throw new Error("Storage remains");
      }
      if (stage === "application-cleanup") await adapter.cleanupApplication(userId);
      if (stage === "application-verify") {
        const report = verifyErasure(await adapter.inspect(), userId);
        if (report.residuals.some((r) => r !== "Auth present")) throw new Error("Application residual remains");
      }
      if (stage === "auth-delete") await adapter.deleteAuth(userId);
      if (stage === "verify" && !verifyErasure(await adapter.inspect(), userId).applicationControlledAbsent) throw new Error("Residual remains");
      stages.push({ stage, status: "PASS" });
      await adapter.recordStage(userId, stage, "PASS");
    } catch {
      stages.push({ stage, status: "FAIL" });
      try { await adapter.recordStage(userId, stage, "FAIL"); } catch { /* Returned failure still identifies the exact stage if DB reporting fails. */ }
      let lockRetained = false;
      try { await adapter.assertLocked(userId); lockRetained = true; } catch { /* No false lock claim if admission itself failed. */ }
      return { executed: true, completed: false, stages, retryable: true, failedStage: stage, lockRetained };
    }
  }
  return { executed: true, completed: true, stages, verification: verifyErasure(await adapter.inspect(), userId) };
}

export function syntheticAdapter(initial, { failAt } = {}) {
  validateSnapshot(initial);
  const snapshot = structuredClone(initial);
  snapshot.lifecycle ??= Object.fromEntries(snapshot.auth.map((r) => [r.id, "ACTIVE"]));
  snapshot.destructive ??= {};
  snapshot.stageState ??= {};
  snapshot.contexts ??= {};
  const calls = [];
  const fail = (stage) => { calls.push(stage); if (failAt === stage) throw new Error("Synthetic interruption"); };
  const assertActive = (id) => { if (snapshot.lifecycle[id] !== "ACTIVE" || !snapshot.auth.some((r) => r.id === id)) throw new Error("account_write_locked"); };
  return { calls, environment: "synthetic", inspect: async () => structuredClone(snapshot),
    async recordStage(id, stage, status) {
      if (!snapshot.auth.some((r) => r.id === id)) return;
      const previous = snapshot.stageState[id] ?? {};
      snapshot.stageState[id] = { ...previous, ...(status === "PASS" ? { lastCompletedStage: stage, failedStage: null } : { failedStage: stage }) };
    },
    async mutate(id, table, row) { assertUser(id); assertActive(id); if (!domains[table]) throw new Error("Unknown account table"); snapshot.tables[table].push(structuredClone(row)); },
    async transition(id, state) {
      fail(`lock-${state === "ERASING" ? "erasing" : "pending"}`);
      if (!snapshot.auth.some((r) => r.id === id)) return;
      if (snapshot.lifecycle[id] === "ERASING") return;
      if (!["ERASURE_PENDING", "ERASING"].includes(state) || (state === "ERASING" && snapshot.lifecycle[id] !== "ERASURE_PENDING")) throw new Error("Invalid transition");
      if (!snapshot.contexts[id]) {
        const selected = erasureSelection(snapshot, id);
        snapshot.contexts[id] = { identifiers: identifiers(snapshot, id), replyIds: rows(snapshot, "social_activity_comments")
          .filter((r) => !selected.social_activity_comments.has(r) && [...selected.social_activity_comments].some((p) => p.id === r.parent_comment_id)).map((r) => r.id) };
      }
      snapshot.lifecycle[id] = state;
    },
    async unlock(id) { if (snapshot.lifecycle[id] !== "ERASURE_PENDING" || snapshot.destructive[id]) throw new Error("privacy_unlock_denied"); snapshot.lifecycle[id] = "ACTIVE"; },
    async assertLocked(id) { if (snapshot.lifecycle[id] === "ACTIVE") throw new Error("privacy_lock_missing"); },
    async verifyAssets(id) { if (snapshot.assets.some((a) => isOwnedAsset(a, id))) throw new Error("Storage remains"); },
    async removeAssets(userId, names) {
      fail("storage-remove");
      if (names.some((name) => !isOwnedAsset({ name, bucket: "profile-assets" }, userId))) throw new Error("Unsafe prefix");
      snapshot.assets = snapshot.assets.filter((a) => !isOwnedAsset(a, userId));
    },
    async cleanupApplication(userId) {
      fail("application-cleanup");
      if (snapshot.lifecycle[userId] === "ACTIVE") throw new Error("privacy_lock_missing");
      snapshot.destructive[userId] = true;
      const plan = erasePlan(snapshot, userId);
      if (plan.blocked.length) throw new Error("Unclassified dependency");
      const selected = erasureSelection(snapshot, userId);
      const markers = identifiers(snapshot, userId);
      const provenanceIds = new Set([userId, ...selected.social_recommendations].map((r) => typeof r === "string" ? r : r.id));
      const detachedXp = snapshot.tables.xp_events.filter((r) => detachableXp(r, selected, userId));
      const groups = new Map();
      for (const row of detachedXp) if (provenanceIds.has(row.canonical_key)) {
        const key = `${row.user_id}:${row.canonical_key}`;
        groups.set(key, [groups.get(key), row.id].filter(Boolean).sort()[0]);
      }
      for (const row of snapshot.tables.xp_events) if (detachableXp(row, selected, userId)) {
        if (provenanceIds.has(row.canonical_key)) row.canonical_key = `privacy-detached-group:${groups.get(`${row.user_id}:${row.canonical_key}`)}`;
        row.source_id = `privacy-detached:${row.id}`; row.dedupe_key = `privacy-detached:${row.id}`; row.metadata = {};
      }
      for (const row of snapshot.tables.social_activity_events) if (detachableActivity(row, selected, userId)) {
        row.source_event_id = `privacy-detached:${row.id}`; row.dedupe_key = `privacy-detached:${row.id}`;
        row.media_snapshot = { title: "Silinen öneri", mediaType: row.media_snapshot?.mediaType ?? "movie" }; row.short_text = null;
      }
      for (const row of snapshot.tables.social_activity_comments) if (!selected.social_activity_comments.has(row)
        && [...selected.social_activity_comments].some((parent) => parent.id === row.parent_comment_id)) {
        if (attributedReply(row, selected, markers)) row.body = neutralReply;
        row.parent_comment_id = null;
      }
      for (const [table, set] of Object.entries(selected)) snapshot.tables[table] = snapshot.tables[table].filter((r) => !set.has(r));
    },
    async deleteAuth(userId) {
      fail("auth-delete");
      if (verifyErasure(snapshot, userId).residuals.some((r) => r !== "Auth present")) throw new Error("privacy_residual_before_auth");
      if (snapshot.lifecycle[userId] === "ACTIVE") throw new Error("privacy_lock_missing");
      snapshot.auth = snapshot.auth.filter((r) => r.id !== userId); delete snapshot.lifecycle[userId]; delete snapshot.destructive[userId]; delete snapshot.stageState[userId]; delete snapshot.contexts[userId];
    },
  };
}
