// Ops-only erasure model. Runtime imports the shared pure export core only.
import { domains, outsideControl, assertUser, validateSnapshot, rows, owner, isOwnedAsset } from "../lib/privacy/account-export.mjs";
export { UUID, domains, ownerlessTables, outsideControl, sharedPolicy, assertUser, validateSnapshot, resolveIdentity, selectedRows, isOwnedAsset, accountExport } from "../lib/privacy/account-export.mjs";

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
  for (const row of rows(snapshot,"social_activity_events")) if (row.source_event_id === `privacy-detached:${row.id}`) {
    const media=row.media_snapshot;
    if (!media || typeof media.title!=="string" || media.title.length<1 || media.title.length>180
      || typeof media.canonicalKey!=="string" || media.canonicalKey.length<3 || media.canonicalKey.length>260
      || markers.some(marker => JSON.stringify(media).includes(marker))) blocked.push("Invalid retained activity snapshot");
  }
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
  const assertReleaseAllowed = () => { if (snapshot.releaseFrozen) throw new Error("account_write_locked"); };
  const assertActive = (id) => { assertReleaseAllowed(); if (snapshot.lifecycle[id] !== "ACTIVE" || !snapshot.auth.some((r) => r.id === id)) throw new Error("account_write_locked"); };
  return { calls, environment: "synthetic", inspect: async () => structuredClone(snapshot),
    async setReleaseFrozen(frozen, actor) {
      if (actor!=="postgres" || typeof frozen!=="boolean") throw new Error("release_ops_denied");
      snapshot.releaseFrozen=frozen;
    },
    async createAuth(user) {
      assertReleaseAllowed();assertUser(user.id);
      if(snapshot.auth.some(r=>r.id===user.id)) throw new Error("account_exists");
      snapshot.auth.push(structuredClone(user));snapshot.lifecycle[user.id]="ACTIVE";
    },
    async recordStage(id, stage, status) {
      assertReleaseAllowed();
      if (!snapshot.auth.some((r) => r.id === id)) return;
      const previous = snapshot.stageState[id] ?? {};
      snapshot.stageState[id] = { ...previous, ...(status === "PASS" ? { lastCompletedStage: stage, failedStage: null } : { failedStage: stage }) };
    },
    async mutate(id, table, row) { assertUser(id); assertActive(id); if (!domains[table]) throw new Error("Unknown account table"); snapshot.tables[table].push(structuredClone(row)); },
    async transition(id, state) {
      assertReleaseAllowed();
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
    async unlock(id) { assertReleaseAllowed(); if (snapshot.lifecycle[id] !== "ERASURE_PENDING" || snapshot.destructive[id]) throw new Error("privacy_unlock_denied"); snapshot.lifecycle[id] = "ACTIVE"; },
    async assertLocked(id) { if (snapshot.lifecycle[id] === "ACTIVE") throw new Error("privacy_lock_missing"); },
    async verifyAssets(id) { if (snapshot.assets.some((a) => isOwnedAsset(a, id))) throw new Error("Storage remains"); },
    async removeAssets(userId, names) {
      assertReleaseAllowed();
      fail("storage-remove");
      if (names.some((name) => !isOwnedAsset({ name, bucket: "profile-assets" }, userId))) throw new Error("Unsafe prefix");
      snapshot.assets = snapshot.assets.filter((a) => !isOwnedAsset(a, userId));
    },
    async cleanupApplication(userId) {
      assertReleaseAllowed();
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
        row.media_snapshot = { title: "Silinen öneri", mediaType: row.media_snapshot?.mediaType ?? "movie",
          canonicalKey: `privacy-detached-activity:${row.id}` }; row.short_text = null;
      }
      for (const row of snapshot.tables.social_activity_comments) if (!selected.social_activity_comments.has(row)
        && [...selected.social_activity_comments].some((parent) => parent.id === row.parent_comment_id)) {
        if (attributedReply(row, selected, markers)) row.body = neutralReply;
        row.parent_comment_id = null;
      }
      for (const [table, set] of Object.entries(selected)) snapshot.tables[table] = snapshot.tables[table].filter((r) => !set.has(r));
    },
    async deleteAuth(userId) {
      assertReleaseAllowed();
      fail("auth-delete");
      if (verifyErasure(snapshot, userId).residuals.some((r) => r !== "Auth present")) throw new Error("privacy_residual_before_auth");
      if (snapshot.lifecycle[userId] === "ACTIVE") throw new Error("privacy_lock_missing");
      snapshot.auth = snapshot.auth.filter((r) => r.id !== userId); delete snapshot.lifecycle[userId]; delete snapshot.destructive[userId]; delete snapshot.stageState[userId]; delete snapshot.contexts[userId];
    },
  };
}
