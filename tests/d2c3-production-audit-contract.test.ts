import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const preflight = fs.readFileSync(
  path.join(root, "supabase", "d2c3_production_preflight.sql"),
  "utf8",
);
const inventory = fs.readFileSync(
  path.join(root, "supabase", "d2c3_production_inventory.sql"),
  "utf8",
);
const runbook = fs.readFileSync(
  path.join(root, "docs", "PRODUCTION_CLOUD_V2_CUTOVER.md"),
  "utf8",
);

function executableStatements(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("D2C.3A production read-only audit contract", () => {
  it.each([preflight, inventory])(
    "uses a read-only transaction and contains no persistent mutation statement",
    (sql) => {
      const executable = executableStatements(sql);
      expect(executable).toMatch(/begin transaction read only;/i);
      expect(executable).toMatch(/rollback;/i);
      expect(executable).not.toMatch(
        /^\s*(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke)\b/im,
      );
    },
  );

  it("audits migration drift, schema phases and D2C blockers", () => {
    expect(preflight).toContain("supabase_migrations.schema_migrations");
    expect(preflight).toContain("20260727120000");
    expect(preflight).toContain("20260728120000");
    expect(preflight).toContain("duplicate_media_owner_record");
    expect(preflight).toContain("orphan_or_cross_owner_progress");
    expect(preflight).toContain("legacy_direct_dml_present");
    expect(preflight).toContain("profile-assets");
  });

  it("inventories constraints, indexes, triggers, RLS and aggregate V2 state", () => {
    for (const evidence of [
      "information_schema.columns",
      "pg_constraint",
      "pg_indexes",
      "pg_trigger",
      "pg_policies",
      "D2C3_MEDIA_V2_COUNTS",
      "D2C3_OPERATION_LEDGER_COUNTS",
    ]) expect(inventory).toContain(evidence);
    expect(inventory).not.toMatch(/select\s+personal_notes\b/i);
    expect(inventory).not.toMatch(/select\s+title\b/i);
    expect(inventory).not.toMatch(/select\s+external_id\b/i);
    expect(inventory).not.toMatch(/select\s+user_id\b/i);
  });

  it("documents all backup methods and the ordered cutover safety gates", () => {
    expect(runbook).toContain("Supabase Dashboard/platform backup");
    expect(runbook).toContain("Native `pg_dump`");
    expect(runbook).toContain("Docker sonrası `supabase db dump`");
    expect(runbook).toContain("migration repair");
    expect(runbook).toContain("Legacy direct DML trafiğinin sıfırlandığını");
    expect(runbook).toContain("D2C.1 commit edildikten sonra");
  });
});
