import { decodeRecommendationRequestV2, type RecommendationRequestV2 } from "../domain/codec";
import type { AspectConstraint, ObjectiveConstraint } from "../domain/constraints";
import type { RecommendationMediaType } from "../domain/types";
import { validateLengthMediaTypeCompatibility } from "../domain/policies";
import { extractStructuredConstraints } from "./constraint-extractor";

const TARGETS: readonly [RegExp, RecommendationMediaType][] = [
  [/\banime\b/i, "anime"], [/\bmanga\b/i, "manga"], [/\bmanhwa\b/i, "manhwa"],
  [/\bmanhua\b/i, "manhua"], [/\b(film|movie)\b/i, "movie"],
  [/\b(dizi|tv)\b/i, "tv"], [/\b(kitap|book)\b/i, "book"],
];

function targetIn(text: string): RecommendationMediaType | null {
  return TARGETS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function mergeAspectConstraints(previous: readonly AspectConstraint[], next: readonly AspectConstraint[]): AspectConstraint[] {
  const merged = new Map(previous.map((constraint) => [constraint.aspectId, constraint]));
  for (const constraint of next) merged.set(constraint.aspectId, { ...constraint, source: "explicit" });
  return [...merged.values()];
}

function mergeObjectiveConstraints(previous: readonly ObjectiveConstraint[], next: readonly ObjectiveConstraint[]): ObjectiveConstraint[] {
  const merged = new Map(previous.map((constraint) => [`${constraint.field}:${constraint.field === "length" ? constraint.unit : ""}`, constraint]));
  for (const constraint of next) merged.set(`${constraint.field}:${constraint.field === "length" ? constraint.unit : ""}`, { ...constraint, source: "explicit" });
  return [...merged.values()];
}

export function patchRecommendationRequest(previous: RecommendationRequestV2, followUpText: string) {
  if (/^\s*yeni\s+konu\s*[.!?]*\s*$/i.test(followUpText)) {
    return { request: null, resetRequested: true, needsClarification: false, warnings: [], issues: [] as string[] };
  }
  const target = targetIn(followUpText);
  const targetMediaTypes = target ? [target] : [...previous.targetMediaTypes];
  const extracted = extractStructuredConstraints({ message: followUpText, targetMediaTypes });
  const followUpAspects = [...extracted.aspectConstraints];
  const previousAspects = [...previous.aspectConstraints];

  let previousObjectives = [...previous.objectiveConstraints];
  if (target) {
    previousObjectives = previousObjectives.filter((constraint) => constraint.field !== "media_type");
    previousObjectives = previousObjectives.filter((constraint) => constraint.field !== "length"
      || validateLengthMediaTypeCompatibility(constraint, targetMediaTypes).ok);
  }
  if (/devam\s+eden.*(olabilir|olsun|sorun\s+değil|sorun\s+degil)/i.test(followUpText)) {
    previousObjectives = previousObjectives.filter((constraint) => constraint.field !== "release_status");
  }
  let objectiveConstraints = mergeObjectiveConstraints(previousObjectives, extracted.objectiveConstraints.filter((constraint) => (
    !(/devam\s+eden.*(olabilir|olsun|sorun\s+değil|sorun\s+degil)/i.test(followUpText) && constraint.field === "release_status")
  )));
  if (/daha\s+k[ıi]sa/i.test(followUpText) && !extracted.objectiveConstraints.some((constraint) => constraint.field === "length")) {
    const current = previous.objectiveConstraints.find((constraint) => constraint.field === "length" && constraint.operator !== "between");
    if (current?.field === "length" && typeof current.value === "number") {
      objectiveConstraints = mergeObjectiveConstraints(objectiveConstraints, [{ ...current, id: `${current.id}:shorter`, role: "must", source: "explicit", operator: "lte", value: Math.max(1, Math.floor(current.value * 0.75)) }]);
    } else {
      return { request: null, needsClarification: true, warnings: extracted.warnings, issues: ["relative_length_requires_limit"], clarificationQuestion: "Ne kadar kısa olmasını istersin? Bölüm, sayfa veya dakika sınırı verebilir misin?" };
    }
  }
  const raw = {
    ...previous,
    queryText: `${previous.queryText} ${followUpText}`.trim().slice(0, 4000),
    targetMediaTypes,
    aspectConstraints: mergeAspectConstraints(previousAspects, followUpAspects),
    objectiveConstraints,
    strictness: /kat[ıi]\s+olmas[ıi]n|kat[ıi]\s+değil|strict\s+olmas[ıi]n/i.test(followUpText)
      ? "balanced"
      : previous.strictness,
  };
  const decoded = decodeRecommendationRequestV2(raw);
  return decoded.ok
    ? { request: decoded.value, needsClarification: false, warnings: extracted.warnings, issues: [] as string[] }
    : { request: null, needsClarification: true, warnings: extracted.warnings, issues: decoded.issues.map((entry) => `${entry.code}:${entry.path}`), clarificationQuestion: "Düzenlenen koşullar birbiriyle çelişiyor. İstek özetini kontrol eder misin?" };
}
