import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260803120000_goal_cloud_v1_additive.sql", "utf8");
const preflight = readFileSync("supabase/d5_goal_cloud_v1_preflight.sql", "utf8");
const post = readFileSync("supabase/d5_goal_cloud_v1_post_migration.sql", "utf8");

function guardBlock(value: string): string {
  const match = /do \$\$([\s\S]*?)\$\$;/.exec(value);
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

describe("Goal Cloud V1 additive migration contract", () => {
  it("creates owner-scoped tables, RLS and RPC-only mutation", () => {
    expect(sql).toContain("create table public.goals");
    expect(sql).toContain("unique(user_id,id)");
    expect(sql).toContain("alter table public.goals enable row level security");
    expect(sql).toContain("auth.uid()=user_id");
    expect(sql).toContain("revoke all on table public.goals from public,anon,authenticated");
    expect(sql).toContain("create function public.apply_cloud_goal_v1");
    expect(sql).not.toContain("service_role");
  });

  it("contains CAS, tombstone, ledger and structural derived-field guard", () => {
    expect(sql).toContain("v_current.revision<>p_expected_revision");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("goal_sync_operations");
    expect(sql).toContain("operation_id_reused");
    expect(sql).toContain("values(v_user,p_goal_id,p_definition,1,v_now,p_operation_id,v_now,v_now)");
    expect(sql).toContain("currentValue");
    expect(sql).toContain("progressPercent");
    expect(sql).toContain("v_user::text || ':goal:' || p_goal_id");
  });

  it("keeps standalone and migration prerequisite guards semantically identical", () => {
    expect(guardBlock(preflight)).not.toBe("");
    expect(guardBlock(preflight)).toBe(guardBlock(sql));
    expect(guardBlock(sql)).toContain("apply_progress_log_sync_operation(text,text,text,bigint,jsonb)");
    expect(guardBlock(sql)).toContain("goal_cloud_v1_partial_or_existing_installation");
  });

  it("uses portable post-verification checks without constraint or policy name coupling", () => {
    expect(post).toContain("relrowsecurity");
    expect(post).toContain("role_table_grants");
    expect(post).not.toContain("goals_user_id_id_key");
    expect(post).not.toContain("goals_select_own");
  });

  it("does not modify D2 migration contracts", () => {
    expect(20260803120000).toBeGreaterThan(20260728120000);
    expect(sql).not.toContain("alter table public.progress_logs");
    expect(sql).not.toContain("create or replace function public.apply_progress_log_sync_operation");
  });
});
