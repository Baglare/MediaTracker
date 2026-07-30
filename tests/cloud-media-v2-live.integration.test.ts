import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSafeSupabaseTestTarget } from "@/lib/supabase-test-target";
import {
  detectLiveCloudSchemaStage,
  tombstoneSyntheticV2Record,
  type LiveCleanupStatus,
  type LiveCloudSchemaStage,
} from "./cloud-media-live-test-helpers";

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
  media: Record<"userA" | "userB", LiveCleanupStatus>;
  progress: LiveCleanupStatus;
  operationLedger:
    | "retained-by-policy"
    | "failed"
    | "not-created";
  errors: string[];
};

function requiredEnvironmentValue(
  name: (typeof requiredEnvironment)[number],
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required live-test environment variable: ${name}`);
  }
  return value;
}

function createTestClient(): SupabaseClient {
  assertSafeSupabaseTestTarget(requiredEnvironmentValue("SUPABASE_TEST_URL"));
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
  expectedRevision: number,
  payload: Record<string, unknown>,
): Promise<SyncResult> {
  const { data, error } = await client.rpc(
    "apply_progress_log_sync_operation",
    {
      p_operation_id: operationId,
      p_record_id: recordId,
      p_operation_type: "upsert",
      p_expected_revision: expectedRevision,
      p_payload: payload,
    },
  );
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  return data as SyncResult;
}

describe.skipIf(!liveEnvironmentAvailable)(
  "D2B.1 live Supabase integration",
  () => {
    const runId = `d2b1-live-${randomUUID()}`;
    const mediaId = `${runId}-media`;
    const progressId = `${runId}-progress`;
    const foreignProgressId = `${runId}-foreign-progress`;
    const operation = (name: string) => `${runId}-${name}`;
    const operationPrefix = `${runId}-%`;

    const mediaPayload = {
      title: `D2B.1 Live ${runId}`,
      type: "movie",
      status: "planning",
      current_progress: 0,
      total_progress: 1,
      favorite: false,
      tags: [],
      metadata: {},
      identity_status: "unresolved",
    };

    let userA: SupabaseClient;
    let userB: SupabaseClient;
    let userAId = "";
    let userBId = "";
    let schemaStage: LiveCloudSchemaStage;
    let createdMedia = false;
    let createdMediaB = false;
    let operationRowsCreated = false;
    const revisions: Record<string, number> = {};
    const cleanup: CleanupResult = {
      media: { userA: "not-created", userB: "not-created" },
      progress: "not-created",
      operationLedger: "not-created",
      errors: [],
    };

    beforeAll(async () => {
      userA = createTestClient();
      userB = createTestClient();

      const [sessionA, sessionB] = await Promise.all([
        userA.auth.signInWithPassword({
          email: requiredEnvironmentValue("SUPABASE_TEST_USER_A_EMAIL"),
          password: requiredEnvironmentValue(
            "SUPABASE_TEST_USER_A_PASSWORD",
          ),
        }),
        userB.auth.signInWithPassword({
          email: requiredEnvironmentValue("SUPABASE_TEST_USER_B_EMAIL"),
          password: requiredEnvironmentValue(
            "SUPABASE_TEST_USER_B_PASSWORD",
          ),
        }),
      ]);

      expect(sessionA.error).toBeNull();
      expect(sessionB.error).toBeNull();
      userAId = sessionA.data.user?.id ?? "";
      userBId = sessionB.data.user?.id ?? "";
      expect(userAId).not.toBe("");
      expect(userBId).not.toBe("");
      expect(userAId).not.toBe(userBId);
      schemaStage = await detectLiveCloudSchemaStage(userA, runId);
    }, 30_000);

    afterAll(async () => {
      if (!userA || !userB) {
        return;
      }

      const progressCleanup = await tombstoneSyntheticV2Record({
        client: userA,
        runId,
        recordId: progressId,
        entity: "progress",
        operationId: operation("cleanup-user-a-progress"),
      });
      cleanup.progress = progressCleanup.status;
      if (progressCleanup.error) cleanup.errors.push(progressCleanup.error);

      for (const [owner, client, wasCreated] of [
        ["userA", userA, createdMedia],
        ["userB", userB, createdMediaB],
      ] as const) {
        if (!wasCreated) continue;
        const result = await tombstoneSyntheticV2Record({
          client,
          runId,
          recordId: mediaId,
          entity: "media",
          operationId: operation(`cleanup-${owner}-media`),
        });
        cleanup.media[owner] = result.status;
        if (result.error) cleanup.errors.push(result.error);
      }

      if (operationRowsCreated) {
        const ledger = await userA
          .from("cloud_media_sync_operations")
          .select("operation_id")
          .like("operation_id", operationPrefix);
        if (ledger.error) {
          cleanup.operationLedger = "failed";
          cleanup.errors.push(`ledger-read:${ledger.error.code}`);
        } else {
          cleanup.operationLedger = "retained-by-policy";
        }
      }

      await Promise.all([userA.auth.signOut(), userB.auth.signOut()]);
      console.info(
        "D2B1_LIVE_RESULT",
        JSON.stringify({
          runId,
          revisions,
          cleanup,
        }),
      );
    }, 30_000);

    it("creates the first V2 media revision for User A", async () => {
      const result = await applyMediaOperation(
        userA,
        operation("media-create"),
        mediaId,
        "upsert",
        0,
        mediaPayload,
      );
      operationRowsCreated = true;
      createdMedia = result.ok;
      revisions.created = result.revision;
      expect(result).toMatchObject({
        ok: true,
        conflict: false,
        reason: "created",
        entityType: "media",
        recordId: mediaId,
        revision: 1,
      });
    });

    it("allows User A to read its row and hides it from User B", async () => {
      const [own, foreign] = await Promise.all([
        userA
          .from("media_items")
          .select("id,user_id,title,revision,deleted_at")
          .eq("id", mediaId),
        userB
          .from("media_items")
          .select("id,user_id,title,revision,deleted_at")
          .eq("id", mediaId),
      ]);
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);
      expect(own.data?.[0]).toMatchObject({ id: mediaId, user_id: userAId });
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
    });

    it("prevents User B from modifying User A's row", async () => {
      const attempt = await userB
        .from("media_items")
        .update({ title: "foreign mutation must not apply" })
        .eq("id", mediaId)
        .select("id");
      if (schemaStage === "d2c1") {
        expect(attempt.error?.code).toBe("42501");
      } else {
        expect(attempt.error).toBeNull();
        expect(attempt.data).toEqual([]);
      }

      const verification = await userA
        .from("media_items")
        .select("title")
        .eq("id", mediaId)
        .single();
      expect(verification.error).toBeNull();
      expect(verification.data?.title).toBe(mediaPayload.title);
    });

    it("accepts the current revision and increments it", async () => {
      const result = await applyMediaOperation(
        userA,
        operation("media-update"),
        mediaId,
        "upsert",
        revisions.created,
        { ...mediaPayload, status: "watching" },
      );
      revisions.updated = result.revision;
      expect(result).toMatchObject({
        ok: true,
        conflict: false,
        reason: "updated",
        revision: revisions.created + 1,
      });
    });

    it("returns a controlled conflict for a stale revision", async () => {
      const result = await applyMediaOperation(
        userA,
        operation("media-stale-update"),
        mediaId,
        "upsert",
        revisions.created,
        { ...mediaPayload, status: "completed" },
      );
      expect(result).toMatchObject({
        ok: false,
        conflict: true,
        reason: "revision_mismatch",
        revision: revisions.updated,
      });
    });

    it("retries the same operation ID without another mutation", async () => {
      const retry = await applyMediaOperation(
        userA,
        operation("media-update"),
        mediaId,
        "upsert",
        revisions.created,
        { ...mediaPayload, status: "watching" },
      );
      expect(retry).toMatchObject({
        ok: true,
        conflict: false,
        reason: "updated",
        revision: revisions.updated,
      });

      const row = await userA
        .from("media_items")
        .select("revision")
        .eq("id", mediaId)
        .single();
      expect(row.error).toBeNull();
      expect(row.data?.revision).toBe(revisions.updated);

      const ledger = await userA
        .from("cloud_media_sync_operations")
        .select("operation_id")
        .eq("operation_id", operation("media-update"));
      expect(ledger.error).toBeNull();
      expect(ledger.data).toHaveLength(1);
    });

    it("tombstones, rejects stale upsert and restores by revision", async () => {
      const deleted = await applyMediaOperation(
        userA,
        operation("media-delete"),
        mediaId,
        "delete",
        revisions.updated,
        null,
      );
      revisions.deleted = deleted.revision;
      expect(deleted.ok).toBe(true);
      expect(deleted.reason).toBe("deleted");
      expect(deleted.deletedAt).toBeTruthy();
      expect(deleted.revision).toBe(revisions.updated + 1);

      const stale = await applyMediaOperation(
        userA,
        operation("media-after-delete-stale"),
        mediaId,
        "upsert",
        revisions.updated,
        mediaPayload,
      );
      expect(stale).toMatchObject({
        ok: false,
        conflict: true,
        reason: "tombstoned",
        revision: revisions.deleted,
      });

      const restored = await applyMediaOperation(
        userA,
        operation("media-restore"),
        mediaId,
        "restore",
        revisions.deleted,
        null,
      );
      revisions.restored = restored.revision;
      expect(restored).toMatchObject({
        ok: true,
        conflict: false,
        reason: "restored",
        revision: revisions.deleted + 1,
        deletedAt: null,
      });
    });

    it("binds progress only to media owned by the same user", async () => {
      const progressPayload = {
        media_id: mediaId,
        media_title: mediaPayload.title,
        media_type: "movie",
        action: "added",
        amount: 0,
        unit: "movie",
        previous_progress: 0,
        new_progress: 0,
        created_at: new Date().toISOString(),
      };

      const own = await applyProgressOperation(
        userA,
        operation("progress-create"),
        progressId,
        0,
        progressPayload,
      );
      revisions.progressCreated = own.revision;
      expect(own).toMatchObject({
        ok: true,
        conflict: false,
        reason: "created",
        revision: 1,
      });

      const foreign = await applyProgressOperation(
        userB,
        operation("foreign-progress-create"),
        foreignProgressId,
        0,
        progressPayload,
      );
      expect(foreign).toMatchObject({
        ok: false,
        conflict: true,
        reason: "media_target_unavailable",
        revision: 0,
      });

      const [ownRows, foreignRows] = await Promise.all([
        userA.from("progress_logs").select("id,user_id,media_id").eq("id", progressId),
        userB.from("progress_logs").select("id,user_id,media_id").eq("id", progressId),
      ]);
      expect(ownRows.error).toBeNull();
      expect(ownRows.data).toEqual([
        { id: progressId, user_id: userAId, media_id: mediaId },
      ]);
      expect(foreignRows.error).toBeNull();
      expect(foreignRows.data).toEqual([]);
    });

    it("applies the phase-specific cross-owner record ID contract", async () => {
      const result = await applyMediaOperation(
        userB,
        operation("global-id-conflict"),
        mediaId,
        "upsert",
        0,
        { ...mediaPayload, title: `User B ${mediaPayload.title}` },
      );
      if (schemaStage === "d2b1") {
        expect(result).toMatchObject({
          ok: false,
          conflict: true,
          reason: "record_id_unavailable",
          revision: 0,
        });
      } else {
        expect(result).toMatchObject({
          ok: true,
          conflict: false,
          reason: "created",
          revision: 1,
        });
        createdMediaB = true;
        const [rowA, rowB] = await Promise.all([
          userA.from("media_items").select("user_id").eq("id", mediaId),
          userB.from("media_items").select("user_id").eq("id", mediaId),
        ]);
        expect(rowA.data).toEqual([{ user_id: userAId }]);
        expect(rowB.data).toEqual([{ user_id: userBId }]);
      }
    });

    it("hides User A operation ledger rows from User B", async () => {
      const [own, foreign] = await Promise.all([
        userA
          .from("cloud_media_sync_operations")
          .select("operation_id,status,applied_revision")
          .eq("operation_id", operation("media-create")),
        userB
          .from("cloud_media_sync_operations")
          .select("operation_id,status,applied_revision")
          .eq("operation_id", operation("media-create")),
      ]);
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
    });
  },
);

if (!liveEnvironmentAvailable) {
  console.info(
    `D2B.1 live integration skipped; missing: ${missingEnvironment.join(", ")}`,
  );
}
