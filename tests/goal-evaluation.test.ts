import { describe, expect, it } from "vitest";

import {
  buildGoalEvaluationSnapshot,
  evaluateGoal,
  evaluateGoals,
} from "@/features/goals/evaluation";
import type { Goal } from "@/features/goals/domain";
import type { MediaItem, ProgressLog } from "@/lib/types";

const NOW = "2026-08-05T12:00:00.000Z";
const CONTEXT = { now: NOW, timeZone: "UTC" };

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "media-tv",
    title: "Exact TV",
    type: "tv",
    status: "watching",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 10,
    ...overrides,
  };
}

function log(
  id: string,
  previousProgress: number,
  newProgress: number,
  overrides: Partial<ProgressLog> = {},
): ProgressLog {
  return {
    id,
    mediaId: "media-tv",
    mediaTitle: "Snapshot title",
    mediaType: "tv",
    action: "increment",
    amount: 999,
    unit: "episode",
    previousProgress,
    newProgress,
    createdAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Haftalık bölüm",
    origin: "manual",
    scope: { kind: "library" },
    metric: { kind: "progress", unit: "episode", targetValue: 10 },
    schedule: { kind: "weekly", startsOn: "2026-08-03", weekStartsOn: "monday", timeZone: "UTC" },
    lifecycle: "active",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function evaluate(items: MediaItem[], logs: ProgressLog[], target = goal()) {
  return evaluateGoal(target, buildGoalEvaluationSnapshot(items, logs), CONTEXT);
}

describe("D5-3 trusted transition reducer", () => {
  it("uses previous/new transition and ignores a nominal clamped amount", () => {
    const result = evaluate([media()], [log("clamped", 9, 10, { amount: 10 })]);
    expect(result.currentValue).toBe(1);
    expect(result.contributingLogIds).toEqual(["clamped"]);
  });

  it("does not double-count increment progress followed by complete", () => {
    const result = evaluate([media({ status: "completed" })], [
      log("increment", 0, 4),
      log("complete", 4, 10, { action: "complete", createdAt: "2026-08-04T13:00:00.000Z" }),
    ]);
    expect(result.currentValue).toBe(10);
  });

  it("applies positive and negative manual adjustments by direction", () => {
    const result = evaluate([media()], [
      log("up", 0, 10, { action: "manual_adjust" }),
      log("down", 10, 4, { action: "manual_adjust", createdAt: "2026-08-04T13:00:00.000Z" }),
    ]);
    expect(result.currentValue).toBe(4);
    expect(result.contributingLogIds).toEqual(["down", "up"]);
  });

  it("never counts added snapshots as earned progress", () => {
    expect(evaluate([media()], [log("added", 0, 8, { action: "added" })]).currentValue).toBe(0);
  });

  it("counts identical duplicate IDs once", () => {
    const duplicate = log("same-id", 0, 2);
    const result = evaluate([media()], [duplicate, { ...duplicate }]);
    expect(result.currentValue).toBe(2);
    expect(result.contributingLogIds).toEqual(["same-id"]);
  });

  it("excludes conflicting duplicate IDs without array-order precedence", () => {
    const result = evaluate([media()], [log("conflict", 0, 2), log("conflict", 0, 8)]);
    expect(result.currentValue).toBe(0);
    expect(result.warnings).toContain("conflicting_log_payload");
  });

  it("excludes detached logs and never resolves them by title", () => {
    const result = evaluate([media({ id: "other", title: "Snapshot title" })], [log("detached", 0, 3)]);
    expect(result.currentValue).toBe(0);
    expect(result.warnings).toContain("detached_logs_ignored");
  });

  it("excludes incompatible units", () => {
    const result = evaluate([media()], [log("wrong-unit", 0, 3, { unit: "chapter" })]);
    expect(result.currentValue).toBe(0);
    expect(result.warnings).toContain("incompatible_unit");
  });

  it("rejects AniList movie episode evidence in an anime media-type goal", () => {
    const animeMovie = media({
      type: "anime",
      externalSource: "anilist",
      format: "MOVIE",
    });
    const result = evaluate([animeMovie], [log("anime-movie", 0, 1, { mediaType: "anime" })], goal({
      scope: { kind: "media_type", mediaType: "anime" },
    }));
    expect(result.currentValue).toBe(0);
    expect(result.warnings).toContain("incompatible_unit");
  });

  it("rejects malformed or negative progress transitions", () => {
    const malformed = log("negative", -1, 4) as ProgressLog;
    expect(evaluate([media()], [malformed]).currentValue).toBe(0);
  });

  it("keeps the last accepted state across a chain discontinuity", () => {
    const result = evaluate([media()], [
      log("a", 0, 2),
      log("b", 5, 6, { createdAt: "2026-08-04T13:00:00.000Z" }),
      log("c", 2, 3, { createdAt: "2026-08-04T14:00:00.000Z" }),
    ]);
    expect(result.currentValue).toBe(3);
    expect(result.contributingLogIds).toEqual(["a", "c"]);
    expect(result.warnings).toContain("progress_chain_discontinuity");
  });

  it("floors negative net progress at zero", () => {
    expect(evaluate([media()], [log("negative-net", 10, 2, { action: "manual_adjust" })]).currentValue).toBe(0);
  });

  it("keeps currentValue above target while clamping percent and remaining", () => {
    const result = evaluate([media()], [log("over", 0, 18)]);
    expect(result).toMatchObject({ currentValue: 18, progressPercent: 100, remainingValue: 0, attainment: "reached" });
  });

  it("sorts evaluations and unique contribution IDs deterministically", () => {
    const second = goal({ id: "00000000-0000-4000-8000-000000000002", createdAt: "2026-08-02T00:00:00.000Z" });
    const results = evaluateGoals([goal(), second], buildGoalEvaluationSnapshot([media()], [
      log("z", 0, 1),
      log("a", 1, 2, { createdAt: "2026-08-04T13:00:00.000Z" }),
    ]), CONTEXT);
    expect(results.map((item) => item.goalId)).toEqual([second.id, goal().id]);
    expect(results[0].contributingLogIds).toEqual(["a", "z"]);
  });
});

describe("D5-3 completed-media evidence", () => {
  const completionGoal = goal({ metric: { kind: "completed_media", targetValue: 1 } });

  it.each([
    ["complete", "complete"],
    ["manual", "manual_adjust"],
    ["increment", "increment"],
  ] as const)("accepts %s threshold-crossing evidence", (id, action) => {
    const result = evaluate([media({ status: "completed" })], [log(id, 9, 10, { action })], completionGoal);
    expect(result).toMatchObject({ currentValue: 1, attainment: "reached" });
    expect(result.contributingLogIds).toEqual([id]);
  });

  it.each([
    ["added completed", [log("added", 0, 10, { action: "added" })]],
    ["status only", []],
  ] as const)("does not count %s without strong dated evidence", (_label, logs) => {
    const result = evaluate([media({ status: "completed", currentProgress: 10 })], [...logs], completionGoal);
    expect(result.currentValue).toBe(0);
    expect(result.warnings).toContain("insufficient_history");
  });

  it("removes completion contribution after current status correction", () => {
    const result = evaluate([media({ status: "watching" })], [log("complete", 0, 10, { action: "complete" })], completionGoal);
    expect(result.currentValue).toBe(0);
    expect(result.contributingLogIds).toEqual([]);
  });

  it("counts a media only once even if it crosses the threshold twice", () => {
    const result = evaluate([media({ status: "completed" })], [
      log("first", 0, 10, { action: "complete" }),
      log("correction", 10, 5, { action: "manual_adjust", createdAt: "2026-08-04T13:00:00.000Z" }),
      log("second", 5, 10, { action: "complete", createdAt: "2026-08-04T14:00:00.000Z" }),
    ], completionGoal);
    expect(result.currentValue).toBe(1);
    expect(result.contributingLogIds).toEqual(["first"]);
  });

  it("marks an exact missing media goal inactive without fuzzy fallback", () => {
    const result = evaluate([], [log("detached", 0, 10, { action: "complete" })], goal({
      scope: { kind: "media", mediaRecordId: "media-tv", title: "Exact TV" },
      metric: { kind: "completed_media", targetValue: 1 },
    }));
    expect(result.attainment).toBe("inactive_target");
    expect(result.warnings).toEqual(expect.arrayContaining(["media_missing", "detached_logs_ignored"]));
  });

  it("uses the same completion evidence for films", () => {
    const film = media({ id: "film", type: "movie", title: "Film", status: "completed", totalProgress: 1, currentProgress: 1 });
    const result = evaluate([film], [log("film-complete", 0, 1, {
      mediaId: "film", mediaType: "movie", unit: "movie", action: "complete",
    })], goal({ scope: { kind: "media_type", mediaType: "movie" }, metric: { kind: "completed_media", targetValue: 1 } }));
    expect(result.currentValue).toBe(1);
  });

  it("filters completion by exact media_type and library scopes", () => {
    const film = media({ id: "film", type: "movie", status: "completed", totalProgress: 1 });
    const book = media({ id: "book", type: "book", status: "completed", totalProgress: 100 });
    const logs = [
      log("film", 0, 1, { mediaId: "film", mediaType: "movie", unit: "movie", action: "complete" }),
      log("book", 0, 100, { mediaId: "book", mediaType: "book", unit: "page", action: "manual_adjust" }),
    ];
    expect(evaluate([film, book], logs, goal({ scope: { kind: "media_type", mediaType: "movie" }, metric: { kind: "completed_media", targetValue: 1 } })).currentValue).toBe(1);
    expect(evaluate([film, book], logs, goal({ metric: { kind: "completed_media", targetValue: 2 } })).currentValue).toBe(2);
  });
});

describe("D5-3 period and attainment precedence", () => {
  it("keeps one-time inclusive boundaries", () => {
    const target = goal({
      schedule: { kind: "one_time", startsOn: "2026-08-01", endsOn: "2026-08-31" },
    });
    const result = evaluateGoal(target, buildGoalEvaluationSnapshot([media()], [
      log("boundary", 0, 2, { createdAt: "2026-08-31T23:59:59.000Z" }),
    ]), { now: "2026-08-31T23:59:59.000Z", timeZone: "UTC" });
    expect(result).toMatchObject({ periodStart: "2026-08-01", periodEnd: "2026-08-31", currentValue: 2 });
  });

  it("resolves Monday weeks and local calendar months", () => {
    const weekly = evaluate([media()], [], goal());
    const monthly = evaluate([media()], [], goal({ schedule: { kind: "monthly", startsOn: "2026-01-15", timeZone: "UTC" } }));
    expect(weekly).toMatchObject({ periodStart: "2026-08-03", periodEnd: "2026-08-09" });
    expect(monthly).toMatchObject({ periodStart: "2026-08-01", periodEnd: "2026-08-31" });
  });

  it("handles leap-year and December/January recurring windows", () => {
    const leap = evaluateGoal(goal({ schedule: { kind: "monthly", startsOn: "2024-01-01", timeZone: "UTC" } }), buildGoalEvaluationSnapshot([media()], []), { now: "2024-02-29T12:00:00.000Z", timeZone: "UTC" });
    const year = evaluateGoal(goal({ schedule: { kind: "weekly", startsOn: "2025-12-01", weekStartsOn: "monday", timeZone: "UTC" } }), buildGoalEvaluationSnapshot([media()], []), { now: "2026-01-01T12:00:00.000Z", timeZone: "UTC" });
    expect(leap.periodEnd).toBe("2024-02-29");
    expect(year).toMatchObject({ periodStart: "2025-12-29", periodEnd: "2026-01-04" });
  });

  it("uses IANA timezone across DST instead of fixed-hour windows", () => {
    const result = evaluateGoal(goal({ schedule: { kind: "weekly", startsOn: "2026-03-01", weekStartsOn: "monday", timeZone: "America/New_York" } }), buildGoalEvaluationSnapshot([media()], [
      log("dst", 0, 1, { createdAt: "2026-03-09T03:30:00.000Z" }),
    ]), { now: "2026-03-09T03:45:00.000Z", timeZone: "UTC" });
    expect(result).toMatchObject({ periodStart: "2026-03-02", periodEnd: "2026-03-08", currentValue: 1 });
  });

  it("returns a controlled timezone warning without UTC fallback", () => {
    const result = evaluateGoal(goal({ schedule: { kind: "one_time", startsOn: "2026-08-01", endsOn: "2026-08-31" } }), buildGoalEvaluationSnapshot([media()], []), { now: NOW, timeZone: "Not/AZone" });
    expect(result.warnings).toContain("timezone_invalid");
  });

  it.each([
    ["not_started", "2026-08-02T12:00:00.000Z", 0],
    ["in_progress", NOW, 0],
    ["reached", NOW, 10],
    ["expired", "2026-09-01T12:00:00.000Z", 2],
  ] as const)("derives %s with documented precedence", (attainment, now, value) => {
    const logs = value > 0 ? [log("value", 0, value)] : [];
    const result = evaluateGoal(goal({ schedule: { kind: "one_time", startsOn: "2026-08-03", endsOn: "2026-08-31" } }), buildGoalEvaluationSnapshot([media()], logs), { now, timeZone: "UTC" });
    expect(result.attainment).toBe(attainment);
  });

  it("keeps lifecycle independent from derived attainment", () => {
    const cancelled = evaluate([media()], [log("reached", 0, 10)], goal({ lifecycle: "cancelled" }));
    const archived = evaluate([media()], [log("reached", 0, 10)], goal({ lifecycle: "archived" }));
    expect(cancelled.attainment).toBe("reached");
    expect(archived.attainment).toBe("reached");
  });

  it("recomputes from replaced snapshots after progress correction or log deletion", () => {
    const target = goal();
    const forward = buildGoalEvaluationSnapshot([media()], [log("up", 0, 10)]);
    const corrected = buildGoalEvaluationSnapshot([media()], [
      log("up", 0, 10),
      log("down", 10, 4, { action: "manual_adjust", createdAt: "2026-08-04T13:00:00.000Z" }),
    ]);
    const deleted = buildGoalEvaluationSnapshot([media()], []);
    expect(evaluateGoal(target, forward, CONTEXT).currentValue).toBe(10);
    expect(evaluateGoal(target, corrected, CONTEXT).currentValue).toBe(4);
    expect(evaluateGoal(target, deleted, CONTEXT).currentValue).toBe(0);
  });
});
