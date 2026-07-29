import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260728120000_owner_scoped_primary_key_enforcement.sql";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8",
).toLowerCase();
const preflight = readFileSync(
  new URL("../supabase/d2c1_owner_scoped_pk_preflight.sql", import.meta.url),
  "utf8",
).toLowerCase();
const verification = readFileSync(
  new URL(
    "../supabase/d2c1_owner_scoped_pk_post_migration.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const runbook = readFileSync(
  new URL("../docs/CLOUD_MEDIA_SCHEMA_V2_MIGRATION_RUNBOOK.md", import.meta.url),
  "utf8",
).toLowerCase();

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const tail = migration.slice(start);
  const finish = tail.indexOf("\n$$;");
  expect(finish).toBeGreaterThan(-1);
  return tail.slice(0, finish + 4);
}

describe("D2C.1 owner-scoped PK SQL contract (static, not live PostgreSQL/RLS)", () => {
  it("runs after every existing migration in one transaction", () => {
    const names = readdirSync(new URL("../supabase/migrations/", import.meta.url))
      .filter((name) => /^\d{14}_.+\.sql$/.test(name))
      .sort();
    expect(names.at(-1)).toBe(migrationName);
    expect(new Set(names.map((name) => name.slice(0, 14))).size)
      .toBe(names.length);
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("fails fast on D2B.1 physical keys, global PKs and owner constraints", () => {
    for (const marker of [
      "d2c1_required_tables_missing",
      "d2c1_physical_row_key_shape_drift",
      "d2c1_media_primary_key_drift",
      "d2c1_progress_primary_key_drift",
      "d2c1_physical_row_key_unique_drift",
      "d2c1_owner_record_unique_drift",
      "d2c1_owner_progress_fk_drift",
      "d2c1_v2_sync_rpc_missing",
    ]) {
      expect(migration).toContain(marker);
      expect(preflight).toContain(marker.replace(
        "d2c1_physical_row_key_unique_drift",
        "d2c1_physical_row_key_shape_drift",
      ));
    }
    expect(migration).not.toMatch(
      /(?:create\s+(?:table|index|policy)|add\s+column)\s+if\s+not\s+exists/,
    );
  });

  it("promotes existing physical row keys without renaming or backfilling rows", () => {
    expect(migration).toContain(
      "add constraint media_items_pkey primary key (row_pk)",
    );
    expect(migration).toContain(
      "add constraint progress_logs_pkey primary key (log_pk)",
    );
    expect(migration).not.toMatch(/\brename\s+(?:column|table)\b/);
    const beforeFunctions = migration.slice(
      0,
      migration.indexOf("create or replace function"),
    );
    expect(beforeFunctions).not.toMatch(
      /\b(?:update|delete\s+from|insert\s+into)\s+public\.(?:media_items|progress_logs)/,
    );
  });

  it("keeps record identity unique only inside an owner", () => {
    expect(migration).toContain("media_items_owner_record_v2_key");
    expect(migration).toContain("progress_logs_owner_record_v2_key");
    expect(migration).toContain("group by user_id,id having count(*)>1");
    expect(functionBody("apply_media_item_sync_operation")).toContain(
      "where user_id=v_user and id=p_record_id",
    );
    expect(functionBody("apply_progress_log_sync_operation")).toContain(
      "where user_id=v_user and id=p_record_id",
    );
  });

  it("allows cross-owner equal record IDs through the V2 RPC path", () => {
    for (const body of [
      functionBody("apply_media_item_sync_operation"),
      functionBody("apply_progress_log_sync_operation"),
    ]) {
      expect(body).not.toContain("record_id_unavailable");
      expect(body).not.toContain("id=p_record_id and user_id<>v_user");
      expect(body).toContain("insert into public.");
    }
  });

  it("replaces the global progress FK with the validated owner-aware relation", () => {
    expect(migration).toContain(
      "drop constraint progress_logs_media_id_fkey",
    );
    expect(migration).not.toContain(
      "drop constraint progress_logs_owner_media_v2_fkey",
    );
    expect(preflight).toContain(
      "foreign key (user_id, media_id) references media_items(user_id, id)",
    );
    expect(verification).toContain(
      "foreign key (user_id, media_id) references media_items(user_id, id)",
    );
    expect(migration).toContain(
      "d2c1_orphan_or_cross_owner_progress_relation",
    );
  });

  it("leaves canonical identity explicitly non-unique", () => {
    expect(migration).toContain("media_items_owner_canonical_v2_idx");
    expect(migration).not.toMatch(/unique\s*\([^)]*canonical_key/);
    expect(verification).toContain(
      "d2c1_canonical_identity_must_remain_non_unique",
    );
  });

  it("preserves CAS, tombstones, revision guards and operation idempotency", () => {
    const media = functionBody("apply_media_item_sync_operation");
    const progress = functionBody("apply_progress_log_sync_operation");
    for (const body of [media, progress]) {
      expect(body).toContain("pg_advisory_xact_lock");
      expect(body).toContain(
        "where user_id=v_user and operation_id=p_operation_id",
      );
      expect(body).toContain("return v_existing_operation.result");
      expect(body).toContain("v_current.revision<>p_expected_revision");
      expect(body).toContain("deleted_at");
      expect(body).toContain("cloud_operation_id_reused");
    }
    expect(migration).toContain("media_items_v2_revision_guard");
    expect(migration).toContain("progress_logs_v2_revision_guard");
    expect(migration).toContain("cloud_media_sync_operations");
  });

  it("keeps owner RLS and closes legacy direct mutation privileges", () => {
    expect(migration).toContain("d2c1_owner_rls_not_enabled");
    expect(migration).toContain(
      "revoke insert,update,delete on table public.media_items",
    );
    expect(migration).toContain(
      "revoke insert,update,delete on table public.progress_logs",
    );
    expect(verification).toContain("has_table_privilege");
    expect(runbook).toContain("v2 client gate");
    expect(runbook).toContain("legacy adapter");
  });

  it("provides read-only preflight and verification contracts", () => {
    for (const sql of [preflight, verification]) {
      expect(sql.trimStart().startsWith("begin transaction read only;"))
        .toBe(true);
      expect(sql.trimEnd().endsWith("rollback;")).toBe(true);
      expect(sql).not.toMatch(
        /^\s*(?:insert\s+into|update|delete\s+from|alter\s+table|create\s+table|drop\s+table)\b/m,
      );
      expect(sql).toContain("owner_record_fingerprint");
    }
    expect(preflight).toContain("duplicate_media_owner_record");
    expect(preflight).toContain("orphan_or_cross_owner_progress");
    expect(verification).toContain("d2c1_media_pk_not_enforced");
    expect(verification).toContain("d2c1_progress_pk_not_enforced");
  });

  it("documents backup, two-user smoke and roll-forward boundaries", () => {
    expect(runbook).toContain("d2c.1 uygulama sırası");
    expect(runbook).toContain("backup");
    expect(runbook).toContain("authenticated test kullanıcısı");
    expect(runbook).toContain("roll-forward");
    expect(runbook).toContain("orphan/cross-owner");
    expect(runbook).toContain("production flag");
  });
});
