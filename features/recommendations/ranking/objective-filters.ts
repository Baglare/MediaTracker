import type { ObjectiveConstraint } from "../domain/constraints";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import type { ObjectiveConstraintDecision } from "./types";

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
}

function normalizedStatus(value: string): string {
  const key = normalized(value);
  if (["finished", "ended", "completed", "released"].includes(key)) return "completed";
  if (["releasing", "running", "ongoing", "returning_series", "in_production"].includes(key)) return "ongoing";
  return key;
}

function numericMatches(constraint: Extract<ObjectiveConstraint, { field: "length" | "release_year" }>, actual: number): boolean {
  if (constraint.operator === "between") return actual >= (constraint.min ?? Infinity) && actual <= (constraint.max ?? -Infinity);
  if (constraint.operator === "eq") return actual === constraint.value;
  if (constraint.operator === "lte") return actual <= (constraint.value ?? -Infinity);
  return actual >= (constraint.value ?? Infinity);
}

function actualValue(constraint: ObjectiveConstraint, snapshot: CandidateProviderEvidenceSnapshot): string | number | readonly string[] | undefined {
  const metadata = snapshot.objectiveMetadata;
  switch (constraint.field) {
    case "media_type": return metadata.mediaType;
    case "release_year": return metadata.releaseYear;
    case "release_status": return metadata.releaseStatus;
    case "format": return metadata.format;
    case "language": return metadata.language;
    case "country": return metadata.countries?.[0];
    case "length":
      if (constraint.unit === "episode") return metadata.episodeCount;
      if (constraint.unit === "chapter") return metadata.chapterCount;
      if (constraint.unit === "page") return metadata.pageCount;
      return metadata.runtimeMinutes;
  }
}

export function evaluateObjectiveConstraint(input: {
  constraint: ObjectiveConstraint;
  snapshot: CandidateProviderEvidenceSnapshot;
}): ObjectiveConstraintDecision {
  const { constraint, snapshot } = input;
  const actual = actualValue(constraint, snapshot);
  if (actual === undefined || actual === null || actual === "") {
    return {
      constraintId: constraint.id, role: constraint.role,
      passed: constraint.role !== "must", outcome: "unknown", evidenceConfidence: "unknown",
      reasons: [constraint.role === "must" ? "Zorunlu objektif alan provider metadata'sında yok." : "Objektif tercih için metadata yok."],
      warnings: ["objective_metadata_unknown"],
    };
  }
  let matches: boolean;
  if (constraint.field === "length" || constraint.field === "release_year") {
    matches = typeof actual === "number" && numericMatches(constraint, actual);
  } else if (constraint.field === "release_status") {
    matches = normalizedStatus(String(actual)) === normalizedStatus(String(constraint.value));
  } else if (constraint.field === "country" && Array.isArray(actual)) {
    matches = actual.some((value) => normalized(value) === normalized(String(constraint.value)));
  } else {
    matches = normalized(String(actual)) === normalized(String(constraint.value));
  }
  if (constraint.role === "must") {
    return { constraintId: constraint.id, role: constraint.role, passed: matches, outcome: matches ? "passed" : "failed_must", evidenceConfidence: "high", reasons: [matches ? "Objektif must karşılandı." : "Objektif must karşılanmadı."], warnings: [] };
  }
  if (constraint.role === "avoid") {
    return { constraintId: constraint.id, role: constraint.role, passed: !matches, outcome: matches ? "triggered_avoid" : "passed", evidenceConfidence: "high", reasons: [matches ? "Objektif avoid koşulu tetiklendi." : "Objektif avoid koşulu tetiklenmedi."], warnings: [] };
  }
  return { constraintId: constraint.id, role: constraint.role, passed: true, outcome: matches ? "preferred" : "not_preferred", evidenceConfidence: "high", reasons: [matches ? "Objektif tercih karşılandı." : "Objektif tercih karşılanmadı."], warnings: [] };
}

export function objectiveDecisionsAllowPrimary(decisions: readonly ObjectiveConstraintDecision[]): boolean {
  return !decisions.some((decision) => decision.outcome === "failed_must" || decision.outcome === "triggered_avoid" || (decision.role === "must" && decision.outcome === "unknown"));
}
