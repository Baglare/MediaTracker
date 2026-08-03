import { describe, expect, it } from "vitest";
import {
  isProgressUnitCompatible,
  resolveGoalMediaScope,
  validateResolvedMediaCompatibility,
  validateScopeMetricCompatibility,
  type Goal,
  type GoalScope,
} from "@/features/goals/domain";
import type { MediaItem } from "@/lib/types";

describe("Goal metric ve scope policy", () => {
  it.each([
    ["tv", "episode"],
    ["anime", "episode"],
    ["manga", "chapter"],
    ["manhwa", "chapter"],
    ["manhua", "chapter"],
    ["book", "page"],
    ["light_novel", "chapter"],
    ["web_novel", "chapter"],
  ] as const)("%s ile %s uyumludur", (mediaType, unit) => {
    expect(isProgressUnitCompatible(mediaType, unit)).toBe(true);
  });

  it("movie progress unit kabul etmez ve completed_media destekler", () => {
    expect(isProgressUnitCompatible("movie", "episode")).toBe(false);
    expect(validateScopeMetricCompatibility(
      { kind: "media_type", mediaType: "movie" },
      { kind: "completed_media", targetValue: 2 },
    ).ok).toBe(true);
  });

  it.each([
    ["tv", "chapter"],
    ["manga", "episode"],
    ["book", "chapter"],
    ["visual_novel", "page"],
  ] as const)("%s ile %s uyumsuzdur", (mediaType, unit) => {
    expect(validateScopeMetricCompatibility(
      { kind: "media_type", mediaType },
      { kind: "progress", unit, targetValue: 1 },
    ).ok).toBe(false);
  });

  it("belirli medya completed_media hedefini yalnız targetValue=1 için kabul eder", () => {
    const scope: GoalScope = { kind: "media", mediaRecordId: "record-1" };
    expect(validateScopeMetricCompatibility(scope, { kind: "completed_media", targetValue: 1 }).ok).toBe(true);
    expect(validateScopeMetricCompatibility(scope, { kind: "completed_media", targetValue: 2 }).ok).toBe(false);
  });

  it("medyayı yalnız exact record ID ile çözer; title veya canonical snapshot fallback değildir", () => {
    const item = {
      id: "record-1",
      identity: {
        version: 2,
        key: "v2:manual:item:123e4567-e89b-42d3-a456-426614174000",
        source: "manual",
        namespace: "item",
        manualId: "123e4567-e89b-42d3-a456-426614174000",
      },
      title: "Aynı Başlık",
      type: "tv",
      status: "watching",
      coverImage: "",
      currentProgress: 1,
      totalProgress: 10,
    } as MediaItem;
    expect(resolveGoalMediaScope({ kind: "media", mediaRecordId: "record-1", title: "Başka" }, [item]).status).toBe("resolved");
    expect(resolveGoalMediaScope({ kind: "media", mediaRecordId: "missing", title: "Aynı Başlık", canonicalMediaKey: item.identity!.key }, [item])).toEqual({
      status: "missing",
      mediaRecordId: "missing",
    });
  });

  it("AniList anime movie kaydını episode progress hedefi olarak kabul etmez", () => {
    const item = {
      id: "anime-movie",
      title: "Anime Film",
      type: "anime",
      status: "planning",
      coverImage: "",
      currentProgress: 0,
      totalProgress: 1,
      externalSource: "anilist",
      format: "MOVIE",
    } as MediaItem;
    const goal = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      title: "Anime film progress",
      origin: "manual",
      scope: { kind: "media", mediaRecordId: item.id },
      metric: { kind: "progress", unit: "episode", targetValue: 1 },
      schedule: { kind: "one_time", startsOn: "2026-08-03", endsOn: "2026-08-31" },
      lifecycle: "active",
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z",
    } as Goal;
    expect(validateResolvedMediaCompatibility(goal, [item])).toMatchObject({ ok: false, code: "incompatible_unit" });
  });
});
