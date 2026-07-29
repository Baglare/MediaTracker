import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const requiredEnvironment = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_ANON_KEY",
  "SUPABASE_TEST_USER_A_EMAIL",
  "SUPABASE_TEST_USER_A_PASSWORD",
  "SUPABASE_TEST_USER_B_EMAIL",
  "SUPABASE_TEST_USER_B_PASSWORD",
] as const;

const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name],
);
const liveEnvironmentAvailable = missingEnvironment.length === 0;

type SyncResult = {
  ok: boolean;
  conflict: boolean;
  reason: string;
  entityType: "media" | "progress";
  recordId: string;
  revision: number;
  deletedAt: string | null;
};

type CleanupResult = {
  media: Record<string, "tombstoned" | "already-tombstoned" | "missing" | "failed">;
  progress: Record<string, "tombstoned" | "already-tombstoned" | "missing" | "failed">;
  operationLedger: "retained-by-policy" | "unexpectedly-missing" | "not-created";
  errors: string[];
};

function requiredEnvironmentValue(
  name: (typeof requiredEnvironment)[number],
): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing live-test environment variable: ${name}`);
  return value;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "").toLowerCase();
}

function assertNonProductionTarget(): void {
  const testUrl = requiredEnvironmentValue("SUPABASE_TEST_URL");
  const parsed = new URL(testUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("SUPABASE_TEST_URL must be an HTTP(S) test project URL.");
  }
  const configuredProductionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (
    configuredProductionUrl
    && normalizeUrl(configuredProductionUrl) === normalizeUrl(testUrl)
  ) {
    throw new Error(
      "Refusing live D2C.1 test: SUPABASE_TEST_URL matches NEXT_PUBLIC_SUPABASE_URL.",
    );
  }
}

function createTestClient(): SupabaseClient {
  return createClient(
    requiredEnvironmentValue("SUPABASE_TEST_URL"),
    requiredEnvironmentValue("SUPABASE_TEST_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

async function applyMediaOperation(
  client: SupabaseClient,
  operationId: string,
  recordId: string,
  operationType: "upsert" | "delete" | "restore",
  expectedRevision: number,
  payload: Record<string, unknown> | null,
): Promise<SyncResult> {
  const { data, error } = await client.rpc(
    "apply_media_item_sync_operation",
    {
      p_operation_id: operationId,
      p_record_id: recordId,
      p_operation_type: operationType,
      p_expected_revision: expectedRevision,
      p_payload: payload,
    },
  );
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  return data as SyncResult;
}

async function applyProgressOperation(
  client: SupabaseClient,
  operationId: string,
  recordId: string,
  operationType: "upsert" | "delete" | "restore",
  expectedRevision: number,
  payload: Record<string, unknown> | null,
): Promise<SyncResult> {
  const { data, error } = await client.rpc(
    "apply_progress_log_sync_operation",
    {
      p_operation_id: operationId,
      p_record_id: recordId,
      p_operation_type: operationType,
      p_expected_revision: expectedRevision,
      p_payload: payload,
    },
  );
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  return data as SyncResult;
}

function expectPermissionDenied(
  error: { code?: string; message?: string } | null,
): void {
  expect(error).not.toBeNull();
  expect(
    error?.code === "42501"
    || /permission denied/i.test(error?.message ?? ""),
  ).toBe(true);
}

describe.skipIf(!liveEnvironmentAvailable)(
  "D2C.1 live owner-scoped primary key integration",
  () => {
    const runId = `d2c1-owner-pk-${randomUUID()}`;
    const sharedMediaId = `${runId}-shared-media`;
    const ownerOnlyMediaId = `${runId}-owner-a-media`;
    const directDmlMediaId = `${runId}-direct-dml-media`;
    const sharedProgressId = `${runId}-shared-progress`;
    const crossOwnerProgressId = `${runId}-cross-owner-progress`;
    const directInsertMediaId = `${runId}-direct-insert-media`;
    const operationIds = new Set<string>();
    const revisions: Record<string, number> = {};
    const passedScenarios: string[] = [];
    const cleanup: CleanupResult = {
      media: {},
      progress: {},
      operationLedger: "not-created",
      errors: [],
    };

    let userA: SupabaseClient;
    let userB: SupabaseClient;
    let userAId = "";
    let userBId = "";

    const operation = (name: string): string => {
      const id = `${runId}-${name}`;
      operationIds.add(id);
      return id;
    };

    const mediaPayload = (
      owner: "A" | "B",
      titleSuffix = "",
    ): Record<string, unknown> => ({
      title: `D2C.1 ${owner} ${runId}${titleSuffix}`,
      type: "movie",
      status: "planning",
      current_progress: 0,
      total_progress: 1,
      favorite: false,
      tags: [],
      metadata: {},
      identity_status: "unresolved",
    });

    const progressPayload = (
      mediaId: string,
      owner: "A" | "B",
    ): Record<string, unknown> => ({
      media_id: mediaId,
      media_title: `D2C.1 ${owner} ${runId}`,
      media_type: "movie",
      action: "added",
      amount: 0,
      unit: "movie",
      previous_progress: 0,
      new_progress: 0,
      created_at: "2026-07-29T12:00:00.000Z",
    });

    const cleanupRecord = async (
      client: SupabaseClient,
      owner: "a" | "b",
      entity: "media" | "progress",
      recordId: string,
    ): Promise<void> => {
      if (!recordId.startsWith(runId)) {
        cleanup.errors.push(`unsafe-cleanup-target:${recordId}`);
        return;
      }
      const table = entity === "media" ? "media_items" : "progress_logs";
      const { data, error } = await client
        .from(table)
        .select("id,revision,deleted_at")
        .eq("id", recordId)
        .maybeSingle();
      const bucket = entity === "media" ? cleanup.media : cleanup.progress;
      const key = `${owner}:${recordId}`;
      if (error) {
        bucket[key] = "failed";
        cleanup.errors.push(`${entity}-read:${owner}:${error.code}`);
        return;
      }
      if (!data) {
        bucket[key] = "missing";
        return;
      }
      if (data.deleted_at) {
        bucket[key] = "already-tombstoned";
        return;
      }
      const cleanupOperationId = operation(
        `cleanup-${entity}-${owner}-${recordId.slice(runId.length + 1)}`,
      );
      const result = entity === "media"
        ? await applyMediaOperation(
            client,
            cleanupOperationId,
            recordId,
            "delete",
            data.revision,
            null,
          )
        : await applyProgressOperation(
            client,
            cleanupOperationId,
            recordId,
            "delete",
            data.revision,
            null,
          );
      if (result.ok && result.reason === "deleted" && result.deletedAt) {
        bucket[key] = "tombstoned";
      } else {
        bucket[key] = "failed";
        cleanup.errors.push(
          `${entity}-delete:${owner}:${result.reason}:${result.revision}`,
        );
      }
    };

    beforeAll(async () => {
      assertNonProductionTarget();
      userA = createTestClient();
      userB = createTestClient();
      const [sessionA, sessionB] = await Promise.all([
        userA.auth.signInWithPassword({
          email: requiredEnvironmentValue("SUPABASE_TEST_USER_A_EMAIL"),
          password: requiredEnvironmentValue("SUPABASE_TEST_USER_A_PASSWORD"),
        }),
        userB.auth.signInWithPassword({
          email: requiredEnvironmentValue("SUPABASE_TEST_USER_B_EMAIL"),
          password: requiredEnvironmentValue("SUPABASE_TEST_USER_B_PASSWORD"),
        }),
      ]);
      expect(sessionA.error).toBeNull();
      expect(sessionB.error).toBeNull();
      userAId = sessionA.data.user?.id ?? "";
      userBId = sessionB.data.user?.id ?? "";
      expect(userAId).not.toBe("");
      expect(userBId).not.toBe("");
      expect(userAId).not.toBe(userBId);
    }, 30_000);

    afterAll(async () => {
      if (!userA || !userB) return;
      try {
        await cleanupRecord(userA, "a", "progress", sharedProgressId);
        await cleanupRecord(userB, "b", "progress", sharedProgressId);
        await cleanupRecord(userA, "a", "progress", crossOwnerProgressId);
        await cleanupRecord(userB, "b", "progress", crossOwnerProgressId);
        await cleanupRecord(userA, "a", "media", sharedMediaId);
        await cleanupRecord(userB, "b", "media", sharedMediaId);
        await cleanupRecord(userA, "a", "media", ownerOnlyMediaId);
        await cleanupRecord(userA, "a", "media", directDmlMediaId);
        await cleanupRecord(userA, "a", "media", directInsertMediaId);

        if (operationIds.size > 0) {
          const [ledgerA, ledgerB] = await Promise.all([
            userA
              .from("cloud_media_sync_operations")
              .select("operation_id")
              .in("operation_id", [...operationIds]),
            userB
              .from("cloud_media_sync_operations")
              .select("operation_id")
              .in("operation_id", [...operationIds]),
          ]);
          if (ledgerA.error || ledgerB.error) {
            cleanup.operationLedger = "unexpectedly-missing";
            cleanup.errors.push(
              `ledger-read:${ledgerA.error?.code ?? ledgerB.error?.code}`,
            );
          } else if (
            (ledgerA.data?.length ?? 0) + (ledgerB.data?.length ?? 0) > 0
          ) {
            cleanup.operationLedger = "retained-by-policy";
          } else {
            cleanup.operationLedger = "unexpectedly-missing";
          }
        }
      } finally {
        await Promise.all([userA.auth.signOut(), userB.auth.signOut()]);
        console.info(
          "D2C1_OWNER_PK_LIVE_RESULT",
          JSON.stringify({
            runId,
            passedScenarios,
            revisions,
            cleanup,
          }),
        );
      }
    }, 45_000);

    it("allows both owners to create the same media record ID", async () => {
      const [createdA, createdB] = await Promise.all([
        applyMediaOperation(
          userA,
          operation("a-shared-media-create"),
          sharedMediaId,
          "upsert",
          0,
          mediaPayload("A"),
        ),
        applyMediaOperation(
          userB,
          operation("b-shared-media-create"),
          sharedMediaId,
          "upsert",
          0,
          mediaPayload("B"),
        ),
      ]);
      expect(createdA).toMatchObject({
        ok: true,
        conflict: false,
        reason: "created",
        revision: 1,
      });
      expect(createdB).toMatchObject({
        ok: true,
        conflict: false,
        reason: "created",
        revision: 1,
      });
      revisions.userACreated = createdA.revision;
      revisions.userBCreated = createdB.revision;

      const [rowsA, rowsB] = await Promise.all([
        userA
          .from("media_items")
          .select("id,user_id,title,revision")
          .eq("id", sharedMediaId),
        userB
          .from("media_items")
          .select("id,user_id,title,revision")
          .eq("id", sharedMediaId),
      ]);
      expect(rowsA.error).toBeNull();
      expect(rowsB.error).toBeNull();
      expect(rowsA.data).toEqual([{
        id: sharedMediaId,
        user_id: userAId,
        title: mediaPayload("A").title,
        revision: 1,
      }]);
      expect(rowsB.data).toEqual([{
        id: sharedMediaId,
        user_id: userBId,
        title: mediaPayload("B").title,
        revision: 1,
      }]);
      passedScenarios.push("cross_owner_equal_media_id", "rls_isolation");
    }, 30_000);

    it("rejects a duplicate record ID inside the same owner", async () => {
      const duplicate = await applyMediaOperation(
        userA,
        operation("a-shared-media-duplicate"),
        sharedMediaId,
        "upsert",
        0,
        mediaPayload("A", " duplicate"),
      );
      expect(duplicate).toMatchObject({
        ok: false,
        conflict: true,
        reason: "revision_mismatch",
        revision: revisions.userACreated,
      });
      const rows = await userA
        .from("media_items")
        .select("id")
        .eq("id", sharedMediaId);
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(1);
      passedScenarios.push("same_owner_duplicate_rejected");
    }, 20_000);

    it("binds equal progress IDs to each owner's own media only", async () => {
      const [progressA, progressB] = await Promise.all([
        applyProgressOperation(
          userA,
          operation("a-shared-progress-create"),
          sharedProgressId,
          "upsert",
          0,
          progressPayload(sharedMediaId, "A"),
        ),
        applyProgressOperation(
          userB,
          operation("b-shared-progress-create"),
          sharedProgressId,
          "upsert",
          0,
          progressPayload(sharedMediaId, "B"),
        ),
      ]);
      expect(progressA).toMatchObject({
        ok: true,
        conflict: false,
        reason: "created",
        revision: 1,
      });
      expect(progressB).toMatchObject({
        ok: true,
        conflict: false,
        reason: "created",
        revision: 1,
      });

      const [rowsA, rowsB] = await Promise.all([
        userA
          .from("progress_logs")
          .select("id,user_id,media_id")
          .eq("id", sharedProgressId),
        userB
          .from("progress_logs")
          .select("id,user_id,media_id")
          .eq("id", sharedProgressId),
      ]);
      expect(rowsA.data).toEqual([{
        id: sharedProgressId,
        user_id: userAId,
        media_id: sharedMediaId,
      }]);
      expect(rowsB.data).toEqual([{
        id: sharedProgressId,
        user_id: userBId,
        media_id: sharedMediaId,
      }]);
      passedScenarios.push("owner_scoped_progress_relation");
    }, 30_000);

    it("rejects a progress relation to media owned only by another owner", async () => {
      const ownerOnly = await applyMediaOperation(
        userA,
        operation("a-owner-only-media-create"),
        ownerOnlyMediaId,
        "upsert",
        0,
        mediaPayload("A", " owner only"),
      );
      expect(ownerOnly.ok).toBe(true);

      const foreign = await applyProgressOperation(
        userB,
        operation("b-cross-owner-progress"),
        crossOwnerProgressId,
        "upsert",
        0,
        progressPayload(ownerOnlyMediaId, "B"),
      );
      expect(foreign).toMatchObject({
        ok: false,
        conflict: true,
        reason: "media_target_unavailable",
        revision: 0,
      });
      const row = await userB
        .from("progress_logs")
        .select("id")
        .eq("id", crossOwnerProgressId);
      expect(row.error).toBeNull();
      expect(row.data).toEqual([]);
      passedScenarios.push("cross_owner_progress_rejected");
    }, 20_000);

    it("preserves revision, tombstone, restore and operation idempotency", async () => {
      const updateOperation = operation("a-shared-media-update");
      const updated = await applyMediaOperation(
        userA,
        updateOperation,
        sharedMediaId,
        "upsert",
        revisions.userACreated,
        { ...mediaPayload("A"), status: "watching" },
      );
      expect(updated).toMatchObject({
        ok: true,
        conflict: false,
        reason: "updated",
        revision: revisions.userACreated + 1,
      });
      revisions.userAUpdated = updated.revision;

      const replay = await applyMediaOperation(
        userA,
        updateOperation,
        sharedMediaId,
        "upsert",
        revisions.userACreated,
        { ...mediaPayload("A"), status: "watching" },
      );
      expect(replay).toEqual(updated);

      const deleted = await applyMediaOperation(
        userA,
        operation("a-shared-media-delete"),
        sharedMediaId,
        "delete",
        updated.revision,
        null,
      );
      expect(deleted).toMatchObject({
        ok: true,
        reason: "deleted",
        revision: updated.revision + 1,
      });
      expect(deleted.deletedAt).toBeTruthy();
      revisions.userADeleted = deleted.revision;

      const restored = await applyMediaOperation(
        userA,
        operation("a-shared-media-restore"),
        sharedMediaId,
        "restore",
        deleted.revision,
        null,
      );
      expect(restored).toMatchObject({
        ok: true,
        reason: "restored",
        revision: deleted.revision + 1,
        deletedAt: null,
      });
      revisions.userARestored = restored.revision;
      passedScenarios.push(
        "revision_cas",
        "operation_idempotency",
        "tombstone_restore",
        "v2_rpc",
      );
    }, 30_000);

    it("rejects direct authenticated insert, update and delete", async () => {
      const created = await applyMediaOperation(
        userA,
        operation("a-direct-dml-target-create"),
        directDmlMediaId,
        "upsert",
        0,
        mediaPayload("A", " direct DML target"),
      );
      expect(created.ok).toBe(true);

      const directRow = {
        id: directInsertMediaId,
        user_id: userAId,
        title: `Direct insert ${runId}`,
        type: "movie",
        status: "planning",
        current_progress: 0,
        total_progress: 1,
        favorite: false,
        tags: [],
        metadata: {},
      };
      const inserted = await userA.from("media_items").insert(directRow);
      expectPermissionDenied(inserted.error);

      const updated = await userA
        .from("media_items")
        .update({ title: "direct update must fail" })
        .eq("id", directDmlMediaId);
      expectPermissionDenied(updated.error);

      const deleted = await userA
        .from("media_items")
        .delete()
        .eq("id", directDmlMediaId);
      expectPermissionDenied(deleted.error);

      const verification = await userA
        .from("media_items")
        .select("id,title")
        .in("id", [directDmlMediaId, directInsertMediaId]);
      expect(verification.error).toBeNull();
      expect(verification.data).toEqual([{
        id: directDmlMediaId,
        title: mediaPayload("A", " direct DML target").title,
      }]);
      passedScenarios.push("direct_authenticated_dml_rejected");
    }, 20_000);

    it("keeps operation ledger rows owner-isolated", async () => {
      const operationId = `${runId}-a-shared-media-update`;
      const [own, foreign] = await Promise.all([
        userA
          .from("cloud_media_sync_operations")
          .select("operation_id,applied_revision")
          .eq("operation_id", operationId),
        userB
          .from("cloud_media_sync_operations")
          .select("operation_id,applied_revision")
          .eq("operation_id", operationId),
      ]);
      expect(own.error).toBeNull();
      expect(own.data).toEqual([{
        operation_id: operationId,
        applied_revision: revisions.userAUpdated,
      }]);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
      passedScenarios.push("operation_ledger_rls");
    }, 20_000);
  },
);

if (!liveEnvironmentAvailable) {
  console.info(
    `D2C.1 owner PK live integration skipped; missing: ${
      missingEnvironment.join(", ")
    }`,
  );
}
