import { describe, expect, it } from "vitest";
import {
  approveGoalSuggestion,
  decodeGoal,
  decodeGoalDocument,
  type Goal,
} from "@/features/goals/domain";

const ID = "123e4567-e89b-42d3-a456-426614174000";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: ID,
    title: "12 bölüm izle",
    origin: "manual",
    scope: { kind: "media_type", mediaType: "tv" },
    metric: { kind: "progress", unit: "episode", targetValue: 12 },
    schedule: { kind: "weekly", startsOn: "2026-08-03", weekStartsOn: "monday", timeZone: "Europe/Istanbul" },
    lifecycle: "active",
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

describe("Goal runtime codec", () => {
  it.each(["manual", "suggested"] as const)("%s origin değerini kabul eder", (origin) => {
    expect(decodeGoal(goal({ origin })).ok).toBe(true);
  });

  it.each(["active", "cancelled", "archived"] as const)("%s lifecycle değerini kabul eder", (lifecycle) => {
    expect(decodeGoal(goal({ lifecycle })).ok).toBe(true);
  });

  it.each([
    { kind: "library" } as const,
    { kind: "media_type", mediaType: "manga" } as const,
    { kind: "media", mediaRecordId: "media-1", canonicalMediaKey: "anilist:1", title: "Snapshot" } as const,
  ])("scope codec $kind", (scope) => {
    const metric = scope.kind === "media_type" && scope.mediaType === "manga"
      ? { kind: "progress", unit: "chapter", targetValue: 12 } as const
      : goal().metric;
    expect(decodeGoal(goal({ scope, metric })).ok).toBe(true);
  });

  it.each([
    { kind: "progress", unit: "chapter", targetValue: 10 } as const,
    { kind: "completed_media", targetValue: 3 } as const,
  ])("metric codec $kind", (metric) => {
    expect(decodeGoal(goal({ scope: { kind: "library" }, metric })).ok).toBe(true);
  });

  it.each([
    { kind: "one_time", startsOn: "2026-08-03", endsOn: "2026-08-31" } as const,
    { kind: "weekly", startsOn: "2026-08-03", weekStartsOn: "monday", timeZone: "Europe/Istanbul" } as const,
    { kind: "monthly", startsOn: "2026-08-03", timeZone: "Europe/Istanbul", endsOn: "2026-12-31" } as const,
  ])("schedule codec $kind", (schedule) => {
    expect(decodeGoal(goal({ schedule })).ok).toBe(true);
  });

  it("UUID değerini değiştirmeden korur ve duplicate document ID reddeder", () => {
    const decoded = decodeGoal(goal());
    expect(decoded.ok && decoded.value.id).toBe(ID);
    expect(decodeGoalDocument({ version: 1, goals: [goal(), goal()] }).ok).toBe(false);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("geçersiz targetValue %s değerini reddeder", (targetValue) => {
    expect(decodeGoal(goal({ metric: { kind: "progress", unit: "episode", targetValue } })).ok).toBe(false);
  });

  it("boş, aşırı uzun title ve geçersiz UUID reddeder", () => {
    expect(decodeGoal(goal({ title: "   " })).ok).toBe(false);
    expect(decodeGoal(goal({ title: "x".repeat(201) })).ok).toBe(false);
    expect(decodeGoal(goal({ id: "goal-1" })).ok).toBe(false);
  });

  it("date-only timestamp, ters timestamp ve bilinmeyen alanı reddeder", () => {
    expect(decodeGoal(goal({ createdAt: "2026-08-03" })).ok).toBe(false);
    expect(decodeGoal(goal({ createdAt: "2026-02-30T10:00:00.000Z" })).ok).toBe(false);
    expect(decodeGoal(goal({ updatedAt: "2026-08-03T09:00:00.000Z" })).ok).toBe(false);
    expect(decodeGoal({ ...goal(), currentValue: 4 }).ok).toBe(false);
  });

  it("geçersiz scope/metric ve tarih aralığını reddeder", () => {
    expect(decodeGoal(goal({
      scope: { kind: "media_type", mediaType: "movie" },
      metric: { kind: "progress", unit: "episode", targetValue: 1 },
    })).ok).toBe(false);
    expect(decodeGoal(goal({ schedule: { kind: "one_time", startsOn: "2026-08-10", endsOn: "2026-08-09" } })).ok).toBe(false);
  });

  it("versioned document codec bilinmeyen sürümü ve malformed Goal kaydını reddeder", () => {
    expect(decodeGoalDocument({ version: 2, goals: [] }).ok).toBe(false);
    expect(decodeGoalDocument({ version: 1, goals: [{ title: "eksik" }] }).ok).toBe(false);
  });

  it("öneriyi Goal'dan ayrı tutar ve yalnız explicit approval ile active suggested Goal üretir", () => {
    const result = approveGoalSuggestion({
      suggestionId: "suggestion-1",
      title: "Bir film tamamla",
      scope: { kind: "media_type", mediaType: "movie" },
      metric: { kind: "completed_media", targetValue: 1 },
      schedule: { kind: "one_time", startsOn: "2026-08-03", endsOn: "2026-08-31" },
      generatedAt: "2026-08-03T09:00:00.000Z",
    }, {
      goalId: ID,
      approvedAt: "2026-08-03T10:00:00.000Z",
    });
    expect(result.ok && result.value).toMatchObject({ origin: "suggested", lifecycle: "active" });
  });
});
