import type { MediaItem, MediaType } from "@/lib/types";
import { isMovieLike } from "@/lib/progress";
import { isScheduleActiveOn } from "./dates";
import type {
  Goal,
  GoalMetric,
  GoalProgressUnit,
  GoalScope,
} from "./types";

export type GoalPolicyResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const PROGRESS_UNITS_BY_MEDIA_TYPE: Readonly<Record<MediaType, readonly GoalProgressUnit[]>> = {
  movie: [],
  tv: ["episode"],
  anime: ["episode"],
  manga: ["chapter"],
  manhwa: ["chapter"],
  manhua: ["chapter"],
  book: ["page"],
  light_novel: ["chapter"],
  web_novel: ["chapter"],
  visual_novel: [],
};

export function progressUnitsForMediaType(mediaType: MediaType): readonly GoalProgressUnit[] {
  return PROGRESS_UNITS_BY_MEDIA_TYPE[mediaType];
}

export function isProgressUnitCompatible(
  mediaType: MediaType,
  unit: GoalProgressUnit,
): boolean {
  return progressUnitsForMediaType(mediaType).includes(unit);
}

export function validateScopeMetricCompatibility(
  scope: GoalScope,
  metric: GoalMetric,
): GoalPolicyResult {
  if (metric.kind === "progress" && scope.kind === "media_type"
    && !isProgressUnitCompatible(scope.mediaType, metric.unit)) {
    return {
      ok: false,
      code: "incompatible_media_type_unit",
      message: `${scope.mediaType} medya türü ${metric.unit} birimini desteklemiyor.`,
    };
  }
  if (metric.kind === "completed_media" && scope.kind === "media" && metric.targetValue !== 1) {
    return {
      ok: false,
      code: "single_media_completion_target",
      message: "Belirli medya tamamlama hedefinin targetValue değeri 1 olmalıdır.",
    };
  }
  return { ok: true };
}

export type GoalMediaResolution =
  | { status: "not_applicable" }
  | { status: "missing"; mediaRecordId: string }
  | { status: "resolved"; item: MediaItem; canonicalSnapshotMatches?: boolean };

export function resolveGoalMediaScope(
  scope: GoalScope,
  mediaItems: readonly MediaItem[],
): GoalMediaResolution {
  if (scope.kind !== "media") return { status: "not_applicable" };
  const item = mediaItems.find((candidate) => candidate.id === scope.mediaRecordId);
  if (!item) return { status: "missing", mediaRecordId: scope.mediaRecordId };
  return {
    status: "resolved",
    item,
    ...(scope.canonicalMediaKey
      ? { canonicalSnapshotMatches: item.identity?.key === scope.canonicalMediaKey }
      : {}),
  };
}

export function validateResolvedMediaCompatibility(
  goal: Goal,
  mediaItems: readonly MediaItem[],
): GoalPolicyResult {
  if (goal.scope.kind !== "media") return validateScopeMetricCompatibility(goal.scope, goal.metric);
  const resolution = resolveGoalMediaScope(goal.scope, mediaItems);
  if (resolution.status !== "resolved") {
    return { ok: false, code: "media_missing", message: "Hedef medya exact record ID ile bulunamadı." };
  }
  if (goal.metric.kind === "progress"
    && (isMovieLike(resolution.item)
      || !isProgressUnitCompatible(resolution.item.type, goal.metric.unit))) {
    return { ok: false, code: "incompatible_unit", message: "Hedef medya progress birimiyle uyumsuz." };
  }
  return validateScopeMetricCompatibility(goal.scope, goal.metric);
}

export function isGoalActiveOn(goal: Goal, date: string): GoalPolicyResult & { active?: boolean } {
  if (goal.lifecycle !== "active") return { ok: true, active: false };
  const result = isScheduleActiveOn(goal.schedule, date);
  return result.ok
    ? { ok: true, active: result.value }
    : { ok: false, code: result.code, message: result.message };
}
