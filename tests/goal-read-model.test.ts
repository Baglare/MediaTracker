import { describe, expect, it } from "vitest";
import {
  createGoalEvaluation,
  deriveGoalAttainment,
  type Goal,
} from "@/features/goals/domain";

function goal(lifecycle: Goal["lifecycle"] = "active"): Goal {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    title: "Aylık okuma",
    origin: "manual",
    scope: { kind: "library" },
    metric: { kind: "progress", unit: "page", targetValue: 100 },
    schedule: { kind: "one_time", startsOn: "2026-08-03", endsOn: "2026-08-31" },
    lifecycle,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  };
}

describe("Goal read model contract", () => {
  it.each([
    ["active", 0, "2026-08-01", "not_started"],
    ["active", 0, "2026-08-03", "in_progress"],
    ["active", 25, "2026-08-10", "in_progress"],
    ["active", 100, "2026-08-10", "reached"],
    ["active", 25, "2026-09-01", "expired"],
    ["cancelled", 100, "2026-08-10", "reached"],
    ["archived", 100, "2026-08-10", "reached"],
  ] as const)("%s lifecycle / %s current / %s -> %s", (lifecycle, current, date, expected) => {
    expect(deriveGoalAttainment(goal(lifecycle), current, date)).toBe(expected);
  });

  it("yüzdeyi clamp eder, gerçek currentValue target üstünde kalır ve ID'leri deterministik sıralar", () => {
    const result = createGoalEvaluation({
      goal: goal(),
      period: { start: "2026-08-03", end: "2026-08-31" },
      referenceDate: "2026-08-20",
      currentValue: 125,
      contributingLogIds: ["log-b", "log-a"],
      warnings: ["detached_logs_ignored", "detached_logs_ignored"],
    });
    expect(result.ok && result.value).toMatchObject({
      currentValue: 125,
      targetValue: 100,
      remainingValue: 0,
      progressPercent: 100,
      attainment: "reached",
      contributingLogIds: ["log-a", "log-b"],
      warnings: ["detached_logs_ignored"],
    });
  });

  it("duplicate contributingLogIds kabul etmez", () => {
    expect(createGoalEvaluation({
      goal: goal(),
      period: { start: "2026-08-03", end: "2026-08-31" },
      referenceDate: "2026-08-20",
      currentValue: 20,
      contributingLogIds: ["same", "same"],
    })).toMatchObject({ ok: false, code: "contributing_log_ids_invalid" });
  });

  it("Goal modelinde türetilmiş sayaç alanları bulunmaz", () => {
    const value = goal() as Goal & Record<string, unknown>;
    expect(value).not.toHaveProperty("currentValue");
    expect(value).not.toHaveProperty("progressPercent");
    expect(value).not.toHaveProperty("completed");
    expect(value).not.toHaveProperty("completedAt");
    expect(value).not.toHaveProperty("currentPeriodStart");
    expect(value).not.toHaveProperty("currentPeriodEnd");
  });
});
