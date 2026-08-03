import { describe, expect, it } from "vitest";

import { createGoalFromApprovedSuggestion } from "@/features/goals/data/goal-repository";
import { readGoalStore } from "@/features/goals/data/goal-store";
import {
  buildGoalEvaluationSnapshot,
  generateGoalSuggestions,
} from "@/features/goals/evaluation";
import type { Goal, GoalSuggestion } from "@/features/goals/domain";
import { GUEST_OWNER_SCOPE } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import type { MediaItem, ProgressLog } from "@/lib/types";

const CONTEXT = { now: "2026-08-05T12:00:00.000Z", timeZone: "UTC" };

class MemoryStorage implements PersonalStorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "tv",
    title: "TV",
    type: "tv",
    status: "watching",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 1000,
    ...overrides,
  };
}

function log(id: string, previousProgress: number, newProgress: number, createdAt: string, overrides: Partial<ProgressLog> = {}): ProgressLog {
  return {
    id,
    mediaId: "tv",
    mediaTitle: "TV",
    mediaType: "tv",
    action: "increment",
    amount: 999,
    unit: "episode",
    previousProgress,
    newProgress,
    createdAt,
    ...overrides,
  };
}

function weeklyHistory(): ProgressLog[] {
  return [
    log("w1", 0, 2, "2026-07-08T12:00:00.000Z"),
    log("w2", 2, 6, "2026-07-15T12:00:00.000Z"),
    log("w3", 6, 8, "2026-07-22T12:00:00.000Z"),
    log("w4", 8, 108, "2026-07-29T12:00:00.000Z"),
  ];
}

describe("D5-3 deterministic Goal suggestions", () => {
  it("uses only four completed weeks and a conservative median target", () => {
    const logs = [...weeklyHistory(), log("current-week", 108, 308, "2026-08-04T12:00:00.000Z")];
    const suggestions = generateGoalSuggestions([], buildGoalEvaluationSnapshot([media()], logs), CONTEXT);
    const weeklyLibrary = suggestions.find((item) => item.suggestion.scope.kind === "library"
      && item.suggestion.schedule.kind === "weekly"
      && item.suggestion.metric.kind === "progress");
    expect(weeklyLibrary?.suggestion.metric).toEqual({ kind: "progress", unit: "episode", targetValue: 3 });
    expect(weeklyLibrary?.historyPeriods).toBe(4);
    expect(weeklyLibrary?.reason).toContain("makul öneri");
  });

  it("uses exactly three completed calendar months", () => {
    const logs = [
      log("may", 0, 10, "2026-05-15T12:00:00.000Z"),
      log("june", 10, 30, "2026-06-15T12:00:00.000Z"),
      log("july", 30, 60, "2026-07-15T12:00:00.000Z"),
      log("august-incomplete", 60, 560, "2026-08-04T12:00:00.000Z"),
    ];
    const suggestions = generateGoalSuggestions([], buildGoalEvaluationSnapshot([media()], logs), CONTEXT);
    const monthly = suggestions.find((item) => item.suggestion.scope.kind === "library"
      && item.suggestion.schedule.kind === "monthly"
      && item.suggestion.metric.kind === "progress");
    expect(monthly?.suggestion.metric).toEqual({ kind: "progress", unit: "episode", targetValue: 20 });
    expect(monthly?.historyPeriods).toBe(3);
  });

  it("creates completed-media suggestions only from strong completion evidence", () => {
    const movies = [0, 1, 2, 3].map((index) => media({
      id: `movie-${index}`,
      title: `Movie ${index}`,
      type: "movie",
      status: "completed",
      totalProgress: 1,
    }));
    const logs = ["2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"].map((date, index) => log(
      `movie-log-${index}`,
      0,
      1,
      `${date}T12:00:00.000Z`,
      { mediaId: `movie-${index}`, mediaType: "movie", unit: "movie", action: "complete" },
    ));
    const suggestions = generateGoalSuggestions([], buildGoalEvaluationSnapshot(movies, logs), CONTEXT);
    const completion = suggestions.find((item) => item.suggestion.scope.kind === "library"
      && item.suggestion.schedule.kind === "weekly"
      && item.suggestion.metric.kind === "completed_media");
    expect(completion?.suggestion.metric.targetValue).toBe(1);
  });

  it("does not suggest completed-media targets from status-only imported items", () => {
    const movies = [0, 1, 2, 3].map((index) => media({
      id: `imported-${index}`,
      type: "movie",
      status: "completed",
      totalProgress: 1,
    }));
    expect(generateGoalSuggestions([], buildGoalEvaluationSnapshot(movies, []), CONTEXT)).toEqual([]);
  });

  it("produces no suggestion with fewer than three contributing completed periods", () => {
    const logs = weeklyHistory().slice(0, 2);
    expect(generateGoalSuggestions([], buildGoalEvaluationSnapshot([media()], logs), CONTEXT)).toEqual([]);
  });

  it("deduplicates an active goal by scope, metric and schedule", () => {
    const active: Goal = {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Zaten aktif",
      origin: "manual",
      scope: { kind: "library" },
      metric: { kind: "progress", unit: "episode", targetValue: 99 },
      schedule: { kind: "weekly", startsOn: "2026-08-03", weekStartsOn: "monday", timeZone: "UTC" },
      lifecycle: "active",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    };
    const suggestions = generateGoalSuggestions([active], buildGoalEvaluationSnapshot([media()], weeklyHistory()), CONTEXT);
    expect(suggestions.some((item) => item.suggestion.scope.kind === "library"
      && item.suggestion.schedule.kind === "weekly"
      && item.suggestion.metric.kind === "progress"
      && item.suggestion.metric.unit === "episode")).toBe(false);
  });

  it("is deterministic, UUID-stable and capped at three suggestions", () => {
    const snapshot = buildGoalEvaluationSnapshot([media()], weeklyHistory());
    const first = generateGoalSuggestions([], snapshot, CONTEXT);
    const second = generateGoalSuggestions([], snapshot, CONTEXT);
    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first.every((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.suggestion.suggestionId))).toBe(true);
  });

  it("applies metric bounds to outlier-heavy page history", () => {
    const book = media({ id: "book", type: "book", title: "Book", totalProgress: 100_000 });
    const logs = [
      log("p1", 0, 5000, "2026-07-08T12:00:00.000Z", { mediaId: "book", mediaType: "book", unit: "page" }),
      log("p2", 5000, 10000, "2026-07-15T12:00:00.000Z", { mediaId: "book", mediaType: "book", unit: "page" }),
      log("p3", 10000, 15000, "2026-07-22T12:00:00.000Z", { mediaId: "book", mediaType: "book", unit: "page" }),
    ];
    const suggestion = generateGoalSuggestions([], buildGoalEvaluationSnapshot([book], logs), CONTEXT)
      .find((item) => item.suggestion.metric.kind === "progress" && item.suggestion.metric.unit === "page");
    expect(suggestion?.suggestion.metric.targetValue).toBe(1000);
  });

  it("never learns from conflicting or detached log payloads", () => {
    const conflicting = weeklyHistory().flatMap((item) => [item, { ...item, newProgress: item.newProgress + 50 }]);
    const detached = weeklyHistory().map((item) => ({ ...item, id: `detached-${item.id}`, mediaId: "missing" }));
    expect(generateGoalSuggestions([], buildGoalEvaluationSnapshot([media()], [...conflicting, ...detached]), CONTEXT)).toEqual([]);
  });

  it("creates an active suggested Goal only through explicit repository approval", () => {
    const storage = new MemoryStorage();
    const suggestion: GoalSuggestion = generateGoalSuggestions(
      [],
      buildGoalEvaluationSnapshot([media()], weeklyHistory()),
      CONTEXT,
    )[0].suggestion;
    const approved = createGoalFromApprovedSuggestion(GUEST_OWNER_SCOPE, suggestion, {
      storage,
      mediaItems: [media()],
      now: () => new Date(CONTEXT.now),
      idFactory: () => "00000000-0000-4000-8000-000000000099",
    });
    expect(approved).toMatchObject({ origin: "suggested", lifecycle: "active" });
    expect(readGoalStore(GUEST_OWNER_SCOPE, storage).data.goals).toEqual([approved]);
  });
});
