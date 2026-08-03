import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260803120000_goal_cloud_v1_additive.sql", "utf8");

describe("Goal Cloud V1 additive migration contract", () => {
  it("creates owner-scoped tables, RLS and RPC-only mutation", () => {
    expect(sql).toContain("create table public.goals");
    expect(sql).toContain("unique(user_id,id)");
    expect(sql).toContain("alter table public.goals enable row level security");
    expect(sql).toContain("auth.uid()=user_id");
    expect(sql).toContain("revoke all on table public.goals from public,anon,authenticated");
    expect(sql).toContain("create function public.apply_cloud_goal_v1");
  });

  it("contains CAS, tombstone, ledger and structural derived-field guard", () => {
    expect(sql).toContain("v_current.revision<>p_expected_revision");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("goal_sync_operations");
    expect(sql).toContain("operation_id_reused");
    expect(sql).toContain("values(v_user,p_goal_id,p_definition,1,v_now,p_operation_id,v_now,v_now)");
    expect(sql).toContain("currentValue");
    expect(sql).toContain("progressPercent");
  });

  it("does not modify D2 migration contracts", () => {
    expect(sql).not.toContain("alter table public.progress_logs");
    expect(sql).not.toContain("create or replace function public.apply_progress_log_sync_operation");
  });
});
