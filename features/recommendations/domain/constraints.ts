import { isAspectId } from "./aspect-registry";
import type {
  AspectId,
  AspectStrengthLevel,
  ConstraintRole,
  ConstraintSource,
  EvidenceConfidence,
  RecommendationDecodeResult,
  RecommendationDomainIssue,
  RecommendationMediaType,
} from "./types";

export type ConstraintStrengthLevel = Exclude<AspectStrengthLevel, "unknown">;
export const DEFAULT_MUST_MINIMUM_LEVEL = "significant" as const;
export const DEFAULT_PREFER_MINIMUM_LEVEL = "incidental" as const;
export const DEFAULT_AVOID_REJECT_LEVEL = "incidental" as const;
export type LengthUnit = "episode" | "chapter" | "page" | "minute";
export type ObjectiveConstraintField =
  | "media_type"
  | "length"
  | "release_status"
  | "release_year"
  | "format"
  | "language"
  | "country";

export type NumericConstraintOperator = "eq" | "lte" | "gte" | "between";

interface ConstraintBase {
  id: string;
  role: ConstraintRole;
  source: ConstraintSource;
}

export interface AspectConstraint extends ConstraintBase {
  kind: "aspect";
  aspectId: AspectId;
  minimumLevel?: ConstraintStrengthLevel;
  rejectAtLevel?: Exclude<ConstraintStrengthLevel, "absent">;
  minimumConfidence?: Exclude<EvidenceConfidence, "unknown">;
  rationale?: string;
}

export interface MediaTypeConstraint extends ConstraintBase {
  kind: "objective";
  field: "media_type";
  operator: "eq";
  value: RecommendationMediaType;
}

export interface LengthConstraint extends ConstraintBase {
  kind: "objective";
  field: "length";
  unit: LengthUnit;
  operator: NumericConstraintOperator;
  value?: number;
  min?: number;
  max?: number;
}

export interface ReleaseYearConstraint extends ConstraintBase {
  kind: "objective";
  field: "release_year";
  operator: NumericConstraintOperator;
  value?: number;
  min?: number;
  max?: number;
}

export interface StringObjectiveConstraint extends ConstraintBase {
  kind: "objective";
  field: "release_status" | "format" | "language" | "country";
  operator: "eq";
  value: string;
}

export type ObjectiveConstraint =
  | MediaTypeConstraint
  | LengthConstraint
  | ReleaseYearConstraint
  | StringObjectiveConstraint;

export type RecommendationConstraint = AspectConstraint | ObjectiveConstraint;

const THRESHOLD_LEVELS = new Set<ConstraintStrengthLevel>([
  "primary", "significant", "incidental", "absent",
]);
const REJECT_LEVELS = new Set<Exclude<ConstraintStrengthLevel, "absent">>([
  "primary", "significant", "incidental",
]);
const CONFIDENCES = new Set<Exclude<EvidenceConfidence, "unknown">>(["high", "medium", "low"]);
const LENGTH_UNITS = new Set<LengthUnit>(["episode", "chapter", "page", "minute"]);

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function validConstraintBase(value: ConstraintBase, path: string): RecommendationDomainIssue[] {
  const issues: RecommendationDomainIssue[] = [];
  if (!value.id.trim() || value.id.length > 160) {
    issues.push(issue("constraint_id_invalid", `${path}.id`, "Constraint id 1-160 karakter olmalıdır."));
  }
  if (value.source === "profile" && value.role === "must") {
    issues.push(issue("profile_must_forbidden", `${path}.source`, "Profile sinyali must constraint olamaz."));
  }
  return issues;
}

export function validateAspectConstraint(
  constraint: AspectConstraint,
  path = "constraint",
): RecommendationDecodeResult<AspectConstraint> {
  const issues = validConstraintBase(constraint, path);
  if (!isAspectId(constraint.aspectId)) {
    issues.push(issue("aspect_id_unknown", `${path}.aspectId`, "Aspect ID registry'de bulunmuyor."));
  }
  if (constraint.minimumLevel !== undefined && !THRESHOLD_LEVELS.has(constraint.minimumLevel)) {
    issues.push(issue("minimum_level_invalid", `${path}.minimumLevel`, "minimumLevel geçersiz."));
  }
  if (constraint.rejectAtLevel !== undefined
    && !REJECT_LEVELS.has(constraint.rejectAtLevel)) {
    issues.push(issue("reject_level_invalid", `${path}.rejectAtLevel`, "rejectAtLevel primary/significant/incidental olmalıdır."));
  }
  if (constraint.minimumConfidence !== undefined && !CONFIDENCES.has(constraint.minimumConfidence)) {
    issues.push(issue("minimum_confidence_invalid", `${path}.minimumConfidence`, "minimumConfidence geçersiz."));
  }
  if (constraint.role === "must" && constraint.minimumLevel === undefined) {
    issues.push(issue("must_minimum_level_required", `${path}.minimumLevel`, "Must aspect minimumLevel taşımalıdır."));
  }
  if (constraint.role === "must" && constraint.rejectAtLevel !== undefined) {
    issues.push(issue("must_reject_level_forbidden", `${path}.rejectAtLevel`, "Must aspect rejectAtLevel taşıyamaz."));
  }
  if (constraint.role === "avoid" && constraint.rejectAtLevel === undefined) {
    issues.push(issue("avoid_reject_level_required", `${path}.rejectAtLevel`, "Avoid aspect rejectAtLevel taşımalıdır."));
  }
  if (constraint.role === "avoid" && constraint.minimumLevel !== undefined) {
    issues.push(issue("avoid_minimum_level_forbidden", `${path}.minimumLevel`, "Avoid aspect minimumLevel taşıyamaz."));
  }
  if (constraint.role === "prefer" && constraint.rejectAtLevel !== undefined) {
    issues.push(issue("prefer_reject_level_forbidden", `${path}.rejectAtLevel`, "Prefer aspect rejectAtLevel taşıyamaz."));
  }
  if (constraint.rationale !== undefined && (!constraint.rationale.trim() || constraint.rationale.length > 500)) {
    issues.push(issue("constraint_rationale_invalid", `${path}.rationale`, "Rationale 1-500 karakter olmalıdır."));
  }
  if (constraint.source === "profile" && constraint.role === "avoid" && !constraint.rationale?.trim()) {
    issues.push(issue("profile_avoid_rationale_required", `${path}.rationale`, "Profile kaynaklı avoid açık rationale taşımalıdır."));
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: constraint };
}

function validateNumericConstraint(
  constraint: LengthConstraint | ReleaseYearConstraint,
  path: string,
): RecommendationDomainIssue[] {
  const issues: RecommendationDomainIssue[] = [];
  const integerRequired = constraint.field === "release_year";
  const validNumber = (value: unknown): value is number => (
    typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && (!integerRequired || Number.isSafeInteger(value))
  );
  if (constraint.operator === "between") {
    if (!validNumber(constraint.min) || !validNumber(constraint.max)) {
      issues.push(issue("constraint_range_invalid", path, "Between için geçerli min ve max zorunludur."));
    } else if (constraint.min > constraint.max) {
      issues.push(issue("constraint_range_reversed", path, "Between min değeri max değerinden büyük olamaz."));
    }
    if (constraint.value !== undefined) {
      issues.push(issue("constraint_value_unexpected", `${path}.value`, "Between value alanı taşıyamaz."));
    }
  } else {
    if (!validNumber(constraint.value)) {
      issues.push(issue("constraint_value_invalid", `${path}.value`, "Numeric constraint negatif olmayan finite value taşımalıdır."));
    }
    if (constraint.min !== undefined || constraint.max !== undefined) {
      issues.push(issue("constraint_range_unexpected", path, "eq/lte/gte min veya max taşıyamaz."));
    }
  }
  return issues;
}

export function validateObjectiveConstraint(
  constraint: ObjectiveConstraint,
  path = "constraint",
): RecommendationDecodeResult<ObjectiveConstraint> {
  const issues = validConstraintBase(constraint, path);
  if (constraint.field === "length") {
    if (!LENGTH_UNITS.has(constraint.unit)) {
      issues.push(issue("length_unit_invalid", `${path}.unit`, "Length unit desteklenmiyor."));
    }
    issues.push(...validateNumericConstraint(constraint, path));
  } else if (constraint.field === "release_year") {
    issues.push(...validateNumericConstraint(constraint, path));
  } else if (constraint.field === "media_type") {
    if (constraint.operator !== "eq") {
      issues.push(issue("media_type_operator_invalid", `${path}.operator`, "Media type yalnız eq destekler."));
    }
  } else {
    if (constraint.operator !== "eq" || !constraint.value.trim() || constraint.value.length > 120) {
      issues.push(issue("objective_string_invalid", `${path}.value`, "String objective eq ve 1-120 karakter value taşımalıdır."));
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: constraint };
}

export function aspectConstraintKey(constraint: AspectConstraint): string {
  return [
    constraint.aspectId,
    constraint.role,
    constraint.source,
    constraint.minimumLevel ?? "",
    constraint.rejectAtLevel ?? "",
    constraint.minimumConfidence ?? "",
    constraint.rationale?.trim() ?? "",
  ].join(":");
}

export function canonicalizeAspectConstraints(
  constraints: readonly AspectConstraint[],
): RecommendationDecodeResult<AspectConstraint[]> {
  const issues: RecommendationDomainIssue[] = [];
  const byAspect = new Map<AspectId, AspectConstraint>();
  const keys = new Set<string>();
  const canonical: AspectConstraint[] = [];
  constraints.forEach((constraint, index) => {
    const validated = validateAspectConstraint(constraint, `aspectConstraints.${index}`);
    if (!validated.ok) {
      issues.push(...validated.issues);
      return;
    }
    const key = aspectConstraintKey(validated.value);
    if (keys.has(key)) return;
    const existing = byAspect.get(validated.value.aspectId);
    if (existing) {
      issues.push(issue(
        "aspect_constraint_conflict",
        `aspectConstraints.${index}`,
        `${validated.value.aspectId} için çelişkili birden fazla constraint var.`,
      ));
      return;
    }
    keys.add(key);
    byAspect.set(validated.value.aspectId, validated.value);
    canonical.push(validated.value);
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: canonical };
}

export function objectiveConstraintKey(constraint: ObjectiveConstraint): string {
  return JSON.stringify(constraint);
}

export function canonicalizeObjectiveConstraints(
  constraints: readonly ObjectiveConstraint[],
): RecommendationDecodeResult<ObjectiveConstraint[]> {
  const issues: RecommendationDomainIssue[] = [];
  const keys = new Set<string>();
  const byField = new Map<string, ObjectiveConstraint>();
  const canonical: ObjectiveConstraint[] = [];
  constraints.forEach((constraint, index) => {
    const validated = validateObjectiveConstraint(constraint, `objectiveConstraints.${index}`);
    if (!validated.ok) {
      issues.push(...validated.issues);
      return;
    }
    const key = objectiveConstraintKey(validated.value);
    if (keys.has(key)) return;
    const fieldKey = validated.value.field === "length"
      ? `${validated.value.field}:${validated.value.unit}`
      : validated.value.field;
    if (byField.has(fieldKey)) {
      issues.push(issue(
        "objective_constraint_conflict",
        `objectiveConstraints.${index}`,
        `${fieldKey} için çelişkili birden fazla constraint var.`,
      ));
      return;
    }
    keys.add(key);
    byField.set(fieldKey, validated.value);
    canonical.push(validated.value);
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: canonical };
}
