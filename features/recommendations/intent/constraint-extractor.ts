import { ASPECT_REGISTRY, type AspectId } from "../domain/aspect-registry";
import {
  DEFAULT_AVOID_REJECT_LEVEL,
  DEFAULT_MUST_MINIMUM_LEVEL,
  DEFAULT_PREFER_MINIMUM_LEVEL,
  type AspectConstraint,
  type ConstraintStrengthLevel,
  type ObjectiveConstraint,
} from "../domain/constraints";
import type { RecommendationMediaType } from "../domain/types";
import { matchAspectPhrases, type AspectPhraseMatch } from "./aspect-phrase-matcher";
import { normalizeTurkishText } from "./turkish-normalizer";

export interface ConstraintExtractionResult {
  aspectConstraints: AspectConstraint[];
  objectiveConstraints: ObjectiveConstraint[];
  warnings: string[];
  issues: string[];
  telemetry: { explicit: number; inferred: number; profile: number };
}

const AVOID_SIGNAL = /(?:^|\s)(?:olmasın|olmasin|istemiyorum|istemem|içermesin|icermesin|kaçın|kacin|kaçının|kacinin|uzak dur|fazla olmasın|fazla olmasin|mümkün olduğunca az|mumkun oldugunca az|hariç tut|haric tut|çıkar|cikar)(?=\s|$)/u;
const PREFER_SIGNAL = /(?:^|\s)(?:tercih ederim|mümkünse|mumkunse|olabilir|biraz|arka planda|hafifçe|hafifce|olsa iyi olur|iyi olur|şart değil|sart degil|zorunlu değil|zorunlu degil)(?=\s|$)/u;
const MUST_SIGNAL = /(?:^|\s)(?:zorunlu|olmalı|olmali|istiyorum|arıyorum|ariyorum|içersin|icersin|içermeli|icermeli|merkezinde olsun|ana tema olsun|temel unsurlardan biri olsun)(?=\s|$)/u;
const PRIMARY_LEVEL_SIGNAL = /(?:^|\s)(?:ana tema|hikayenin merkezinde|hikâyenin merkezinde|temel odağı|temel odagi|baskın tema|baskin tema|baskın olduğu|baskin oldugu|ağırlıklı|agirlikli|odak noktası|odak noktasi|daha güçlü|daha guclu)(?=\s|$)/u;
const SIGNIFICANT_LEVEL_SIGNAL = /(?:^|\s)(?:belirgin|önemli bir tema|onemli bir tema|ana unsurlardan biri|güçlü biçimde yer alan|guclu bicimde yer alan|yoğun biçimde|yogun bicimde|kayda değer|kayda deger|etkili bir unsur)(?=\s|$)/u;
const INCIDENTAL_LEVEL_SIGNAL = /(?:^|\s)(?:biraz|arka planda|hafif|hafifçe|hafifce|kırıntı düzeyinde|kirinti duzeyinde|yan unsur)(?=\s|$)/u;

type ExtractedRole = "must" | "prefer" | "avoid";

function contextFor(tokens: readonly string[], match: AspectPhraseMatch): string {
  return tokens.slice(Math.max(0, match.startToken - 8), Math.min(tokens.length, match.endToken + 8)).join(" ");
}

function hasAdjacentToken(tokens: readonly string[], match: AspectPhraseMatch, values: readonly string[]): boolean {
  return values.includes(tokens[match.startToken - 1]) || values.includes(tokens[match.endToken]);
}

function centralityFor(tokens: readonly string[], match: AspectPhraseMatch): ConstraintStrengthLevel {
  const context = contextFor(tokens, match);
  if (INCIDENTAL_LEVEL_SIGNAL.test(context)) return "incidental";
  if (PRIMARY_LEVEL_SIGNAL.test(context)) return "primary";
  if (SIGNIFICANT_LEVEL_SIGNAL.test(context)) return "significant";
  // D6-5.2 uyumluluğu: "güçlü" yalnız eşleşen aspect phrase'e doğrudan
  // komşuysa primary sayılır; bağlamdaki başka bir "güçlü" sözcüğü yetmez.
  if (hasAdjacentToken(tokens, match, ["güçlü", "guclu"])) return "primary";
  return DEFAULT_MUST_MINIMUM_LEVEL;
}

function roleFor(tokens: readonly string[], match: AspectPhraseMatch): ExtractedRole {
  const context = contextFor(tokens, match);
  if (AVOID_SIGNAL.test(context) || hasAdjacentToken(tokens, match, ["az"])) return "avoid";
  if (PREFER_SIGNAL.test(context) || INCIDENTAL_LEVEL_SIGNAL.test(context)) return "prefer";
  if (MUST_SIGNAL.test(context)
    || PRIMARY_LEVEL_SIGNAL.test(context)
    || SIGNIFICANT_LEVEL_SIGNAL.test(context)
    || hasAdjacentToken(tokens, match, ["güçlü", "guclu"])) return "must";
  return "prefer";
}

function aspectConstraint(
  id: AspectId,
  role: ExtractedRole,
  source: "explicit" | "inferred",
  minimumLevel: ConstraintStrengthLevel = DEFAULT_MUST_MINIMUM_LEVEL,
): AspectConstraint {
  if (role === "must") {
    return { id: `aspect:${id}:${role}:${source}`, kind: "aspect", aspectId: id, role, source, minimumLevel };
  }
  if (role === "avoid") {
    return { id: `aspect:${id}:${role}:${source}`, kind: "aspect", aspectId: id, role, source, rejectAtLevel: DEFAULT_AVOID_REJECT_LEVEL };
  }
  return { id: `aspect:${id}:${role}:${source}`, kind: "aspect", aspectId: id, role, source, minimumLevel: DEFAULT_PREFER_MINIMUM_LEVEL };
}

function parseLength(text: string, targets: readonly RecommendationMediaType[]): ObjectiveConstraint[] {
  const out: ObjectiveConstraint[] = [];
  const units = [
    { pattern: /(\d+)\s*(?:bölüm(?:den|dan)?|bolum(?:den|dan)?|episode|ep)\b/u, unit: "episode" as const },
    { pattern: /(\d+)\s*(?:chapter|chapters)\b/u, unit: "chapter" as const },
    { pattern: /(\d+)\s*(?:sayfa|page)\b/u, unit: "page" as const },
    { pattern: /(\d+)\s*(?:dakika|minute|min)\b/u, unit: "minute" as const },
  ];
  for (const spec of units) {
    const match = spec.pattern.exec(text);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    const context = text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40);
    const role = AVOID_SIGNAL.test(context) ? "avoid" : PREFER_SIGNAL.test(context) ? "prefer" : "must";
    const operator = /(?:en az|minimum|az değil|az degil)/u.test(context) ? "gte" : "lte";
    const unit = spec.unit === "episode" && /\b(?:bölüm|bolum)\b/u.test(match[0])
      && targets.some((target) => ["manga", "manhwa", "manhua"].includes(target))
      && !targets.some((target) => ["anime", "tv"].includes(target))
      ? "chapter" as const
      : spec.unit;
    out.push({ id: `objective:length:${unit}:${role}`, kind: "objective", field: "length", unit, operator, value, role, source: "explicit" });
  }
  return out;
}

function parseObjectiveConstraints(text: string, targets: readonly RecommendationMediaType[]): ObjectiveConstraint[] {
  const out = parseLength(text, targets);
  if (targets.length === 1) {
    out.push({ id: `objective:media_type:${targets[0]}`, kind: "objective", field: "media_type", operator: "eq", value: targets[0], role: "must", source: "explicit" });
  }
  if (/\b(?:tamamlanmış|tamamlanmis|bitmiş|bitmis|finished|completed)\b/u.test(text)) {
    const match = /\b(?:tamamlanmış|tamamlanmis|bitmiş|bitmis|finished|completed)\b/u.exec(text);
    const context = match ? text.slice(Math.max(0, match.index - 35), match.index + match[0].length + 35) : text;
    const role = AVOID_SIGNAL.test(context) ? "avoid" : PREFER_SIGNAL.test(context) ? "prefer" : "must";
    out.push({ id: `objective:release_status:completed:${role}`, kind: "objective", field: "release_status", operator: "eq", value: "completed", role, source: "explicit" });
  }
  if (/\b(?:devam eden|ongoing|releasing|running)\b/u.test(text)) {
    const role = AVOID_SIGNAL.test(text) ? "avoid" : PREFER_SIGNAL.test(text) ? "prefer" : "must";
    out.push({ id: `objective:release_status:ongoing:${role}`, kind: "objective", field: "release_status", operator: "eq", value: "ongoing", role, source: "explicit" });
  }
  const year = /\b(19\d{2}|20\d{2})\b/u.exec(text);
  if (year) {
    const value = Number.parseInt(year[1], 10);
    const operator = /(?:sonra|sonrası|sonrasi|after)/u.test(text) ? "gte" : /(?:önce|once|before)/u.test(text) ? "lte" : "eq";
    out.push({ id: `objective:release_year:${operator}:${value}`, kind: "objective", field: "release_year", operator, value, role: "must", source: "explicit" });
  }
  if (/\b(?:japonca|japanese)\b/u.test(text)) out.push({ id: "objective:language:japanese", kind: "objective", field: "language", operator: "eq", value: "Japanese", role: "must", source: "explicit" });
  if (/\b(?:ingilizce|english)\b/u.test(text)) out.push({ id: "objective:language:english", kind: "objective", field: "language", operator: "eq", value: "English", role: "must", source: "explicit" });
  if (/\b(?:japonya yapımı|japonya yapimi|made in japan)\b/u.test(text)) out.push({ id: "objective:country:jp", kind: "objective", field: "country", operator: "eq", value: "JP", role: "must", source: "explicit" });
  if (/\b(?:tv format|dizi format)\b/u.test(text)) out.push({ id: "objective:format:tv", kind: "objective", field: "format", operator: "eq", value: "TV", role: "must", source: "explicit" });
  return out;
}

export function extractStructuredConstraints(input: {
  message: string;
  targetMediaTypes: readonly RecommendationMediaType[];
  planningPreferenceSignals?: readonly string[];
  planningAvoidSignals?: readonly string[];
}): ConstraintExtractionResult {
  const text = normalizeTurkishText(input.message);
  const aspectConstraints: AspectConstraint[] = [];
  const warnings: string[] = [];
  const issues: string[] = [];
  const seen = new Map<AspectId, ExtractedRole>();
  const byAspect = new Map<AspectId, { match: AspectPhraseMatch; tokens: readonly string[] }[]>();
  const clauses = input.message.split(/[.!?;]+|\b(?:ama|fakat|ancak)\b/iu).filter((clause) => clause.trim());
  for (const clause of clauses) {
    const parsedClause = matchAspectPhrases(clause);
    for (const match of parsedClause.matches) {
      const matches = byAspect.get(match.aspectId) ?? [];
      matches.push({ match, tokens: parsedClause.tokens });
      byAspect.set(match.aspectId, matches);
    }
  }

  for (const [id, matches] of byAspect) {
    const roles = new Set(matches.map(({ match, tokens }) => roleFor(tokens, match)));
    if (roles.size > 1) {
      issues.push(`aspect_constraint_conflict:${id}`);
      continue;
    }
    const role = [...roles][0];
    const source = role === "prefer" && matches.every(({ match, tokens }) => {
      const context = contextFor(tokens, match);
      return !PREFER_SIGNAL.test(context) && !INCIDENTAL_LEVEL_SIGNAL.test(context);
    }) ? "inferred" : "explicit";
    if (role === "must" && ASPECT_REGISTRY[id].mustSafety !== "safe") {
      warnings.push(`conditional_must_requires_evidence:${id}`);
    }
    const minimumLevel = role === "must"
      ? matches.reduce<ConstraintStrengthLevel>((strongest, { match, tokens }) => {
          const level = centralityFor(tokens, match);
          if (level === "primary" || strongest === "primary") return "primary";
          return level === "significant" ? "significant" : strongest;
        }, DEFAULT_MUST_MINIMUM_LEVEL)
      : DEFAULT_MUST_MINIMUM_LEVEL;
    aspectConstraints.push(aspectConstraint(id, role, source, minimumLevel));
    seen.set(id, role);
  }

  const addPlanning = (values: readonly string[], role: "prefer" | "avoid") => {
    for (const value of values) {
      const ids = [...new Set(matchAspectPhrases(value).matches.map((match) => match.aspectId))];
      if (ids.length !== 1 || seen.has(ids[0])) continue;
      aspectConstraints.push(aspectConstraint(ids[0], role, "inferred"));
      seen.set(ids[0], role);
    }
  };
  addPlanning(input.planningPreferenceSignals ?? [], "prefer");
  addPlanning(input.planningAvoidSignals ?? [], "avoid");

  const objectiveConstraints = parseObjectiveConstraints(text, input.targetMediaTypes);
  const telemetry = { explicit: 0, inferred: 0, profile: 0 };
  for (const constraint of [...aspectConstraints, ...objectiveConstraints]) telemetry[constraint.source] += 1;
  return { aspectConstraints, objectiveConstraints, warnings, issues, telemetry };
}
