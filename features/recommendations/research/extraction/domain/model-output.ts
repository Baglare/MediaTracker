import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../../domain/types";
import type { GroundedEvidenceUnit, GroundedExtractionModelOutput, GroundedPassageAssessment } from "./types";
import type { GroundedResearchPacket } from "../../passages/types";

const FINDINGS = ["supports_presence", "supports_explicit_absence", "irrelevant", "insufficient"] as const;
const LEVELS = ["incidental", "significant", "primary"] as const;
const CONFIDENCES = ["low", "medium", "high"] as const;
const BASES = ["explicit_statement", "recurring_element", "affects_character_decisions", "affects_plot", "core_premise", "explicit_absence_statement", "context_insufficient", "unrelated_context"] as const;
function issue(code: string, path: string, message: string): RecommendationDomainIssue { return { code, path, message }; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, fields: readonly string[], path: string) { const allowed = new Set(fields); return Object.keys(value).filter((key) => !allowed.has(key)).map((key) => issue("extraction_output_unknown_field", `${path}.${key}`, "Strict output unknown field kabul etmez.")); }

export function decodeGroundedExtractionModelOutput(value: unknown, maxAssessments: number): RecommendationDecodeResult<GroundedExtractionModelOutput> {
  if (!record(value)) return { ok: false, issues: [issue("extraction_output_invalid", "$", "Output object olmalıdır.")] };
  const issues = exact(value, ["version", "assessments"], "$" );
  if (value.version !== 1 || !Array.isArray(value.assessments) || value.assessments.length > maxAssessments) issues.push(issue("extraction_output_invalid", "$", "version=1 ve bounded assessments zorunludur."));
  const assessments: GroundedPassageAssessment[] = [];
  if (Array.isArray(value.assessments)) for (const [index, item] of value.assessments.entries()) {
    const path = `assessments.${index}`;
    if (!record(item)) { issues.push(issue("extraction_output_invalid", path, "Assessment object olmalıdır.")); continue; }
    issues.push(...exact(item, ["passageId", "finding", "level", "confidence", "evidenceUnitIds", "basis"], path));
    const finding = FINDINGS.includes(item.finding as never) ? item.finding as GroundedPassageAssessment["finding"] : null;
    const level = item.level === null || LEVELS.includes(item.level as never) ? item.level as GroundedPassageAssessment["level"] : undefined;
    const confidence = CONFIDENCES.includes(item.confidence as never) ? item.confidence as GroundedPassageAssessment["confidence"] : null;
    const basis = BASES.includes(item.basis as never) ? item.basis as GroundedPassageAssessment["basis"] : null;
    const ids = Array.isArray(item.evidenceUnitIds) && item.evidenceUnitIds.every((id) => typeof id === "string") ? item.evidenceUnitIds as string[] : null;
    if (typeof item.passageId !== "string" || !finding || level === undefined || !confidence || !basis || !ids || new Set(ids).size !== ids.length) { issues.push(issue("extraction_output_invalid", path, "Assessment field types/enums/IDs geçersiz.")); continue; }
    const support = finding === "supports_presence";
    const absence = finding === "supports_explicit_absence";
    const noClaim = finding === "irrelevant" || finding === "insufficient";
    if ((support && (level === null || ids.length === 0 || ["explicit_absence_statement", "context_insufficient", "unrelated_context"].includes(basis)))
      || (absence && (level !== null || ids.length === 0 || basis !== "explicit_absence_statement"))
      || (noClaim && (level !== null || ids.length !== 0 || basis !== (finding === "irrelevant" ? "unrelated_context" : "context_insufficient")))) issues.push(issue("extraction_invalid_combination", path, "Finding/level/basis/evidence unit kombinasyonu geçersiz."));
    assessments.push({ passageId: item.passageId, finding, level, confidence, evidenceUnitIds: ids, basis });
  }
  if (new Set(assessments.map((item) => item.passageId)).size !== assessments.length) issues.push(issue("extraction_output_invalid", "assessments", "Her passage en fazla bir assessment taşıyabilir."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: { version: 1, assessments } };
}

export function validateGroundedExtractionGrounding(input: { output: GroundedExtractionModelOutput; packet: GroundedResearchPacket; units: readonly GroundedEvidenceUnit[]; excludedUnitIds?: readonly string[] }): RecommendationDecodeResult<GroundedExtractionModelOutput> {
  const issues: RecommendationDomainIssue[] = [];
  const passages = new Map(input.packet.passages.map((passage) => [passage.passageId, passage]));
  const units = new Map(input.units.map((unit) => [unit.unitId, unit]));
  const excluded = new Set(input.excludedUnitIds ?? []);
  for (const [index, assessment] of input.output.assessments.entries()) {
    const passage = passages.get(assessment.passageId);
    if (!passage) issues.push(issue("extraction_grounding_invalid", `assessments.${index}.passageId`, "Unknown packet passage ID."));
    for (const unitId of assessment.evidenceUnitIds) {
      const unit = units.get(unitId);
      if (!unit) { issues.push(issue("extraction_unknown_unit", `assessments.${index}.evidenceUnitIds`, "Unknown evidence unit ID.")); continue; }
      if (unit.passageId !== assessment.passageId || unit.citationId !== passage?.citationId) issues.push(issue("extraction_grounding_invalid", `assessments.${index}.evidenceUnitIds`, "Unit passage/citation ilişkisi geçersiz."));
      if (excluded.has(unitId) || unit.securityFlags.length > 0) issues.push(issue("extraction_grounding_invalid", `assessments.${index}.evidenceUnitIds`, "Security-flagged unit grounding için kullanılamaz."));
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: input.output };
}

