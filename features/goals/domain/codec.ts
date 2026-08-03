import type { MediaType } from "@/lib/types";
import { isValidDateOnly, isValidIsoInstant, validateGoalScheduleRange } from "./dates";
import { validateScopeMetricCompatibility } from "./policies";
import {
  GOAL_DOMAIN_VERSION,
  GOAL_TITLE_MAX_LENGTH,
  type Goal,
  type GoalDocument,
  type GoalLifecycle,
  type GoalMetric,
  type GoalOrigin,
  type GoalSchedule,
  type GoalScope,
} from "./types";

export interface GoalCodecIssue {
  code: string;
  path: string;
  message: string;
}

export type GoalDecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: GoalCodecIssue[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORIGINS = new Set<GoalOrigin>(["manual", "suggested"]);
const LIFECYCLES = new Set<GoalLifecycle>(["active", "cancelled", "archived"]);
const MEDIA_TYPES = new Set<MediaType>([
  "movie", "tv", "anime", "manga", "manhwa", "manhua", "book",
  "light_novel", "web_novel", "visual_novel",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): GoalCodecIssue[] {
  const known = new Set(allowed);
  return Object.keys(value)
    .filter((key) => !known.has(key))
    .map((key) => ({
      code: "unknown_field",
      path: `${path}.${key}`,
      message: "Bilinmeyen Goal alanı kabul edilmez.",
    }));
}

function validInstant(value: unknown): value is string {
  return isValidIsoInstant(value);
}

function decodeScope(value: unknown): GoalDecodeResult<GoalScope> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: "scope_invalid", path: "scope", message: "Scope nesne olmalıdır." }] };
  }
  if (value.kind === "library") {
    const issues = unknownFields(value, ["kind"], "scope");
    return issues.length ? { ok: false, issues } : { ok: true, value: { kind: "library" } };
  }
  if (value.kind === "media_type") {
    const issues = unknownFields(value, ["kind", "mediaType"], "scope");
    if (typeof value.mediaType !== "string" || !MEDIA_TYPES.has(value.mediaType as MediaType)) {
      issues.push({ code: "media_type_invalid", path: "scope.mediaType", message: "MediaType desteklenmiyor." });
    }
    return issues.length
      ? { ok: false, issues }
      : { ok: true, value: { kind: "media_type", mediaType: value.mediaType as MediaType } };
  }
  if (value.kind === "media") {
    const issues = unknownFields(value, ["kind", "mediaRecordId", "canonicalMediaKey", "title"], "scope");
    const mediaRecordId = typeof value.mediaRecordId === "string" ? value.mediaRecordId.trim() : "";
    if (!mediaRecordId || mediaRecordId.length > 240) {
      issues.push({ code: "media_record_id_invalid", path: "scope.mediaRecordId", message: "mediaRecordId 1-240 karakter olmalıdır." });
    }
    const canonicalMediaKey = value.canonicalMediaKey === undefined
      ? undefined
      : typeof value.canonicalMediaKey === "string" ? value.canonicalMediaKey.trim() : "";
    if (canonicalMediaKey !== undefined && (!canonicalMediaKey || canonicalMediaKey.length > 240)) {
      issues.push({ code: "canonical_snapshot_invalid", path: "scope.canonicalMediaKey", message: "Canonical snapshot geçersiz." });
    }
    const title = value.title === undefined
      ? undefined
      : typeof value.title === "string" ? value.title.trim() : "";
    if (title !== undefined && (!title || title.length > GOAL_TITLE_MAX_LENGTH)) {
      issues.push({ code: "media_title_snapshot_invalid", path: "scope.title", message: "Title snapshot geçersiz." });
    }
    return issues.length ? { ok: false, issues } : {
      ok: true,
      value: {
        kind: "media",
        mediaRecordId,
        ...(canonicalMediaKey ? { canonicalMediaKey } : {}),
        ...(title ? { title } : {}),
      },
    };
  }
  return { ok: false, issues: [{ code: "scope_kind_invalid", path: "scope.kind", message: "Scope kind desteklenmiyor." }] };
}

function decodeMetric(value: unknown): GoalDecodeResult<GoalMetric> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: "metric_invalid", path: "metric", message: "Metric nesne olmalıdır." }] };
  }
  const targetValue = value.targetValue;
  const issues: GoalCodecIssue[] = [];
  if (!Number.isSafeInteger(targetValue) || (targetValue as number) <= 0) {
    issues.push({ code: "target_value_invalid", path: "metric.targetValue", message: "targetValue pozitif güvenli tam sayı olmalıdır." });
  }
  if (value.kind === "progress") {
    issues.push(...unknownFields(value, ["kind", "unit", "targetValue"], "metric"));
    if (!(["episode", "chapter", "page"] as unknown[]).includes(value.unit)) {
      issues.push({ code: "progress_unit_invalid", path: "metric.unit", message: "Progress unit desteklenmiyor." });
    }
    return issues.length ? { ok: false, issues } : {
      ok: true,
      value: { kind: "progress", unit: value.unit as "episode" | "chapter" | "page", targetValue: targetValue as number },
    };
  }
  if (value.kind === "completed_media") {
    issues.push(...unknownFields(value, ["kind", "targetValue"], "metric"));
    return issues.length ? { ok: false, issues } : {
      ok: true,
      value: { kind: "completed_media", targetValue: targetValue as number },
    };
  }
  issues.push({ code: "metric_kind_invalid", path: "metric.kind", message: "Metric kind desteklenmiyor." });
  return { ok: false, issues };
}

function decodeSchedule(value: unknown): GoalDecodeResult<GoalSchedule> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: "schedule_invalid", path: "schedule", message: "Schedule nesne olmalıdır." }] };
  }
  const issues: GoalCodecIssue[] = [];
  let schedule: GoalSchedule | undefined;
  if (value.kind === "one_time") {
    issues.push(...unknownFields(value, ["kind", "startsOn", "endsOn"], "schedule"));
    if (typeof value.startsOn === "string" && typeof value.endsOn === "string") {
      schedule = { kind: "one_time", startsOn: value.startsOn, endsOn: value.endsOn };
    }
  } else if (value.kind === "weekly") {
    issues.push(...unknownFields(value, ["kind", "startsOn", "weekStartsOn", "timeZone", "endsOn"], "schedule"));
    if (value.weekStartsOn !== "monday") {
      issues.push({ code: "week_start_invalid", path: "schedule.weekStartsOn", message: "Hafta Pazartesi başlamalıdır." });
    }
    if (typeof value.startsOn === "string" && typeof value.timeZone === "string") {
      schedule = {
        kind: "weekly",
        startsOn: value.startsOn,
        weekStartsOn: "monday",
        timeZone: value.timeZone,
        ...(typeof value.endsOn === "string" ? { endsOn: value.endsOn } : {}),
      };
    }
  } else if (value.kind === "monthly") {
    issues.push(...unknownFields(value, ["kind", "startsOn", "timeZone", "endsOn"], "schedule"));
    if (typeof value.startsOn === "string" && typeof value.timeZone === "string") {
      schedule = {
        kind: "monthly",
        startsOn: value.startsOn,
        timeZone: value.timeZone,
        ...(typeof value.endsOn === "string" ? { endsOn: value.endsOn } : {}),
      };
    }
  } else {
    issues.push({ code: "schedule_kind_invalid", path: "schedule.kind", message: "Schedule kind desteklenmiyor." });
  }
  if (!schedule) {
    issues.push({ code: "schedule_fields_invalid", path: "schedule", message: "Schedule zorunlu alanları eksik." });
    return { ok: false, issues };
  }
  if (!isValidDateOnly(schedule.startsOn)
    || (schedule.endsOn !== undefined && !isValidDateOnly(schedule.endsOn))) {
    issues.push({ code: "schedule_date_invalid", path: "schedule", message: "Schedule tarihleri YYYY-MM-DD olmalıdır." });
  }
  const range = validateGoalScheduleRange(schedule);
  if (!range.ok) issues.push({ code: range.code, path: "schedule", message: range.message });
  return issues.length ? { ok: false, issues } : { ok: true, value: schedule };
}

export function decodeGoal(value: unknown): GoalDecodeResult<Goal> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: "goal_invalid", path: "$", message: "Goal nesne olmalıdır." }] };
  }
  const issues = unknownFields(value, [
    "id", "title", "origin", "scope", "metric", "schedule", "lifecycle", "createdAt", "updatedAt",
  ], "$" );
  const id = typeof value.id === "string" && UUID_PATTERN.test(value.id) ? value.id : undefined;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const origin = typeof value.origin === "string" && ORIGINS.has(value.origin as GoalOrigin)
    ? value.origin as GoalOrigin : undefined;
  const lifecycle = typeof value.lifecycle === "string" && LIFECYCLES.has(value.lifecycle as GoalLifecycle)
    ? value.lifecycle as GoalLifecycle : undefined;
  const scope = decodeScope(value.scope);
  const metric = decodeMetric(value.metric);
  const schedule = decodeSchedule(value.schedule);
  const createdAt = validInstant(value.createdAt) ? value.createdAt : undefined;
  const updatedAt = validInstant(value.updatedAt) ? value.updatedAt : undefined;
  if (!id) issues.push({ code: "goal_id_invalid", path: "id", message: "Goal stabil UUID taşımalıdır." });
  if (!title || title.length > GOAL_TITLE_MAX_LENGTH) {
    issues.push({ code: "goal_title_invalid", path: "title", message: `Title 1-${GOAL_TITLE_MAX_LENGTH} karakter olmalıdır.` });
  }
  if (!origin) issues.push({ code: "goal_origin_invalid", path: "origin", message: "Origin desteklenmiyor." });
  if (!lifecycle) issues.push({ code: "goal_lifecycle_invalid", path: "lifecycle", message: "Lifecycle desteklenmiyor." });
  if (!scope.ok) issues.push(...scope.issues);
  if (!metric.ok) issues.push(...metric.issues);
  if (!schedule.ok) issues.push(...schedule.issues);
  if (!createdAt) issues.push({ code: "created_at_invalid", path: "createdAt", message: "createdAt geçerli ISO instant olmalıdır." });
  if (!updatedAt) issues.push({ code: "updated_at_invalid", path: "updatedAt", message: "updatedAt geçerli ISO instant olmalıdır." });
  if (createdAt && updatedAt && Date.parse(updatedAt) < Date.parse(createdAt)) {
    issues.push({ code: "timestamp_order_invalid", path: "updatedAt", message: "updatedAt createdAt değerinden önce olamaz." });
  }
  if (scope.ok && metric.ok) {
    const policy = validateScopeMetricCompatibility(scope.value, metric.value);
    if (!policy.ok) issues.push({ code: policy.code, path: "metric", message: policy.message });
  }
  if (issues.length || !id || !title || !origin || !lifecycle || !scope.ok || !metric.ok || !schedule.ok || !createdAt || !updatedAt) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: { id, title, origin, scope: scope.value, metric: metric.value, schedule: schedule.value, lifecycle, createdAt, updatedAt },
  };
}

export function decodeGoalDocument(value: unknown): GoalDecodeResult<GoalDocument> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: "document_invalid", path: "$", message: "Goal document nesne olmalıdır." }] };
  }
  const issues = unknownFields(value, ["version", "goals"], "$" );
  if (value.version !== GOAL_DOMAIN_VERSION) {
    issues.push({ code: "version_unsupported", path: "version", message: "Goal document sürümü desteklenmiyor." });
  }
  if (!Array.isArray(value.goals)) {
    issues.push({ code: "goals_invalid", path: "goals", message: "Goals liste olmalıdır." });
    return { ok: false, issues };
  }
  const goals: Goal[] = [];
  const ids = new Set<string>();
  value.goals.forEach((entry, index) => {
    const decoded = decodeGoal(entry);
    if (!decoded.ok) {
      issues.push(...decoded.issues.map((item) => ({ ...item, path: `goals.${index}.${item.path.replace(/^\$\.?/, "")}` })));
      return;
    }
    if (ids.has(decoded.value.id)) {
      issues.push({ code: "goal_id_duplicate", path: `goals.${index}.id`, message: "Aynı Goal UUID tekrarlandı." });
      return;
    }
    ids.add(decoded.value.id);
    goals.push(decoded.value);
  });
  return issues.length ? { ok: false, issues } : {
    ok: true,
    value: { version: GOAL_DOMAIN_VERSION, goals },
  };
}
