import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "20260727120000_cloud_media_schema_v2_additive.sql";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8",
).toLowerCase();
const preflight = readFileSync(
  new URL("../supabase/d2b1_cloud_media_v2_preflight.sql", import.meta.url),
  "utf8",
).toLowerCase();
const verification = readFileSync(
  new URL("../supabase/d2b1_cloud_media_v2_post_migration.sql", import.meta.url),
  "utf8",
).toLowerCase();
const runbook = readFileSync(
  new URL("../docs/CLOUD_MEDIA_SCHEMA_V2_MIGRATION_RUNBOOK.md", import.meta.url),
  "utf8",
).toLowerCase();

function functionBody(name: string): string {
  const start = migration.indexOf(`create function public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const tail = migration.slice(start);
  const finish = tail.indexOf("\n$$;");
  expect(finish).toBeGreaterThan(-1);
  return tail.slice(0, finish + 4);
}

describe("D2B.1 cloud media schema V2 SQL contract (static, not live PostgreSQL/RLS)", () => {
  it("uses a unique migration timestamp and one explicit transaction", () => {
    const names = readdirSync(new URL("../supabase/migrations/", import.meta.url));
    expect(migrationName).toMatch(/^\d{14}_.+\.sql$/);
    expect(new Set(names.map((name) => name.slice(0, 14))).size).toBe(names.length);
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("fails fast on expected tables, PKs, external index, RLS and relation drift", () => {
    for (const marker of [
      "d2b1_expected_tables_missing",
      "d2b1_media_primary_key_drift",
      "d2b1_progress_primary_key_drift",
      "d2b1_external_unique_index_missing_or_changed",
      "d2b1_owner_rls_not_enabled",
      "d2b1_cross_owner_progress_relation",
      "d2b1_target_objects_already_exist",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).not.toMatch(
      /(?:create\s+(?:table|index|policy)|add\s+column)\s+if\s+not\s+exists/,
    );
  });

  it("validates media CHECK semantics across baseline and production legacy names", () => {
    for (const sql of [migration, preflight]) {
      for (const constraintName of [
        "media_items_progress_nonneg",
        "media_items_current_progress_check",
        "media_items_total_nonneg",
        "media_items_total_progress_check",
        "media_items_user_rating_range",
        "media_items_user_rating_check",
      ]) {
        expect(sql).toContain(constraintName);
      }
      expect(sql).toContain("normalized_definition='checkcurrent_progress>=0'");
      expect(sql).toContain("normalized_definition='checktotal_progress>=0'");
      expect(sql).toContain(
        "'checkuser_ratingisnulloruser_rating>=0anduser_rating<=10'",
      );
      expect(sql).toContain("count(distinct oid) filter");
      expect(sql).toContain("d2b1_media_check_constraint_drift");
    }
  });

  it("keeps existing rows and destructive schema operations out of the additive phase", () => {
    const additivePhase = migration.slice(
      0,
      migration.indexOf("create function public.cloud_media_v2_request_hash"),
    );
    expect(additivePhase).not.toMatch(
      /\b(?:drop|truncate)\s+(?:table|column|constraint|index)\b/,
    );
    expect(additivePhase).not.toMatch(
      /(?:update|delete\s+from)\s+public\.(?:media_items|progress_logs)/,
    );
    expect(migration).not.toContain("drop index media_items_user_external_unique");
    expect(migration).toContain("media_items_user_external_unique");
  });

  it("separates physical row keys, owner-scoped record IDs and canonical identity", () => {
    expect(migration).toContain("add column row_pk uuid generated always as");
    expect(migration).toContain("add column log_pk uuid generated always as");
    expect(migration).toContain(
      "constraint media_items_owner_record_v2_key unique (user_id,id)",
    );
    expect(migration).toContain(
      "constraint progress_logs_owner_record_v2_key unique (user_id,id)",
    );
    expect(migration).toContain("add column canonical_key text");
    expect(migration).toContain("create index media_items_owner_canonical_v2_idx");
    expect(migration).not.toContain(
      "create unique index media_items_owner_canonical_v2_idx",
    );
    expect(migration).not.toMatch(/unique\s*\([^)]*canonical_key/);
  });

  it("prepares an owner-safe progress to media relation without removing the legacy FK", () => {
    expect(migration).toContain(
      "foreign key (user_id,media_id)\n    references public.media_items(user_id,id)",
    );
    expect(migration).toContain("on delete set null (media_id)");
    expect(migration).toContain(
      "validate constraint progress_logs_owner_media_v2_fkey",
    );
    expect(migration).not.toContain("drop constraint progress_logs_media_id_fkey");
  });

  it("makes revision server controlled and compare-and-swap explicit", () => {
    const media = functionBody("apply_media_item_sync_operation");
    const progress = functionBody("apply_progress_log_sync_operation");
    expect(migration).toContain("new.revision:=old.revision+1");
    expect(migration).toContain("new.revision:=1");
    for (const body of [media, progress]) {
      expect(body).toContain("for update");
      expect(body).toContain("v_current.revision<>p_expected_revision");
      expect(body).toContain("'revision_mismatch'");
    }
    expect(media).not.toMatch(/revision\s*=\s*\(?p_expected_revision/);
  });

  it("deduplicates a stable operation ID before producing another revision", () => {
    const media = functionBody("apply_media_item_sync_operation");
    const progress = functionBody("apply_progress_log_sync_operation");
    for (const body of [media, progress]) {
      expect(body).toContain("pg_advisory_xact_lock");
      expect(body).toContain("where user_id=v_user and operation_id=p_operation_id");
      expect(body).toContain("return v_existing_operation.result");
      expect(body).toContain("cloud_operation_id_reused");
    }
    expect(migration).toContain("primary key (user_id,operation_id)");
    expect(migration).toContain("sha256(");
  });

  it("uses tombstones and rejects stale upserts until explicit restore", () => {
    const media = functionBody("apply_media_item_sync_operation");
    expect(media).toContain("elsif v_current.deleted_at is not null");
    expect(media).toContain("'tombstoned'");
    expect(media).toContain("when p_operation_type='delete' then now()");
    expect(media).toContain("p_operation_type='restore'");
    expect(media).not.toMatch(/delete\s+from\s+public\.media_items/);
  });

  it("adds owner-scoped restrictive RLS guards and a private operation ledger", () => {
    for (const policy of [
      "media_items_v2_owner_guard",
      "progress_logs_v2_owner_guard",
      "cloud_media_sync_operations_select_own",
      "cloud_media_sync_operations_owner_guard",
    ]) {
      expect(migration).toContain(`policy ${policy}`);
    }
    expect(migration).toContain("as restrictive");
    expect(migration).toContain("using (auth.uid()=user_id)");
    expect(migration).toContain("with check (auth.uid()=user_id)");
    expect(migration).toContain(
      "revoke all on table public.cloud_media_sync_operations",
    );
  });

  it("keeps legacy direct upsert/delete compatibility explicitly bounded", () => {
    expect(migration).not.toMatch(
      /revoke\s+(?:insert|update|delete|all)\s+on\s+(?:table\s+)?public\.(?:media_items|progress_logs)/,
    );
    expect(runbook).toContain("global `id` pk");
    expect(runbook).toContain("legacy direct upsert");
    expect(runbook).toContain("legacy direct delete hard-delete");
    expect(runbook).toContain("generated `lib/supabase/types.ts`");
  });

  it("provides read-only preflight and post-migration verification scripts", () => {
    for (const sql of [preflight, verification]) {
      expect(sql.trimStart().startsWith("begin transaction read only;")).toBe(true);
      expect(sql.trimEnd().endsWith("rollback;")).toBe(true);
      expect(sql).not.toMatch(
        /\b(?:insert\s+into|update|delete\s+from|alter\s+table|create\s+table|drop\s+table)\b/,
      );
    }
    expect(preflight).toContain("owner_record_fingerprint");
    expect(verification).toContain("d2b1_canonical_non_unique_index_missing");
    expect(verification).toContain("d2b1_legacy_external_unique_not_preserved");
  });

  it("documents roll-forward preference and forbids destructive automatic rollback", () => {
    expect(runbook).toContain("roll-forward");
    expect(runbook).toContain("otomatik destructive down migration");
    expect(runbook).toContain("tombstone veya operation kaydı oluşmuşsa");
    expect(runbook).toContain("xp/social/recommendation");
  });
});
