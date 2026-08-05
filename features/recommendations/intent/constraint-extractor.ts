import {
  ASPECT_IDS,
  ASPECT_REGISTRY,
  normalizeAspectAlias,
  type AspectId,
} from "../domain/aspect-registry";
import {
  DEFAULT_AVOID_REJECT_LEVEL,
  DEFAULT_MUST_MINIMUM_LEVEL,
  DEFAULT_PREFER_MINIMUM_LEVEL,
  type AspectConstraint,
  type ConstraintStrengthLevel,
  type ObjectiveConstraint,
} from "../domain/constraints";
import type { RecommendationMediaType } from "../domain/types";

export interface ConstraintExtractionResult {
  aspectConstraints: AspectConstraint[];
  objectiveConstraints: ObjectiveConstraint[];
  warnings: string[];
  issues: string[];
  telemetry: {
    explicit: number;
    inferred: number;
    profile: number;
  };
}

const AVOID_SIGNAL = /\b(olmasin|istemiyorum|istemem|kacin|kacinin|uzak dur|fazla olmasin)\b/;
const PREFER_SIGNAL = /\b(biraz|olabilir|tercihen|mumkunse|mümkünse|iyi olur)\b/;
const MUST_SIGNAL = /\b(agirlikli|ağırlıklı|guclu|güçlü|ana tema|olmali|olmalı|istiyorum|isterim)\b/;
const PRIMARY_LEVEL_SIGNAL = /\b(agirlikli|ağırlıklı|guclu|güçlü|ana tema)\b/;

function normalizedMessage(value: string): string {
  return ` ${normalizeAspectAlias(value)} `;
}

function aliasesFor(id: AspectId): string[] {
  const entry = ASPECT_REGISTRY[id];
  return [...new Set([
    id.replace(/_/g, " "), entry.labelTr, entry.labelEn,
    ...entry.aliasesTr, ...entry.aliasesEn,
  ].map(normalizeAspectAlias).filter(Boolean))].sort((a, b) => b.length - a.length);
}

function occurrenceContexts(text: string, aliases: readonly string[], aspectId: AspectId): string[] {
  const contexts: string[] = [];
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}(?:i|u|yi|yu|li|lik|den|dan)?\\b`, "gu");
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      const shadowed = ASPECT_IDS.some((otherId) => otherId !== aspectId && aliasesFor(otherId).some((longer) => {
        if (longer.length <= alias.length || !longer.includes(alias)) return false;
        for (let start = Math.max(0, index - (longer.length - alias.length)); start <= index; start += 1) {
          if (text.slice(start, start + longer.length) === longer
            && start <= index
            && start + longer.length >= index + match[0].length) return true;
        }
        return false;
      }));
      if (shadowed) continue;
      contexts.push(text.slice(Math.max(0, index - 24), Math.min(text.length, index + match[0].length + 18)));
    }
  }
  return contexts;
}

function roleForContext(context: string): "must" | "prefer" | "avoid" {
  if (AVOID_SIGNAL.test(context)) return "avoid";
  if (PREFER_SIGNAL.test(context)) return "prefer";
  if (MUST_SIGNAL.test(context)) return "must";
  return "prefer";
}

function targetProviderSupportSafe(id: AspectId, targets: readonly RecommendationMediaType[]): boolean {
  const support = ASPECT_REGISTRY[id].providerSupport;
  const providers = new Set(targets.flatMap((mediaType) => {
    if (["anime", "manga", "manhwa", "manhua"].includes(mediaType)) return ["anilist"] as const;
    if (mediaType === "tv") return ["tvmaze", "tmdb"] as const;
    if (mediaType === "movie") return ["tmdb", "omdb"] as const;
    return ["openlibrary"] as const;
  }));
  if (providers.size === 0) return true;
  return [...providers].some((provider) => support[provider] === "strong" || support[provider] === "partial");
}

function aspectConstraint(
  id: AspectId,
  role: "must" | "prefer" | "avoid",
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
    { pattern: /(\d+)\s*(?:bolum(?:den|dan)?|episode|ep)\b/, unit: "episode" as const },
    { pattern: /(\d+)\s*(?:chapter|chapters)\b/, unit: "chapter" as const },
    { pattern: /(\d+)\s*(?:sayfa|page)\b/, unit: "page" as const },
    { pattern: /(\d+)\s*(?:dakika|minute|min)\b/, unit: "minute" as const },
  ];
  for (const spec of units) {
    const match = spec.pattern.exec(text);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    const context = text.slice(Math.max(0, match.index - 35), match.index + match[0].length + 35);
    const role = AVOID_SIGNAL.test(context) ? "avoid" : PREFER_SIGNAL.test(context) ? "prefer" : "must";
    const operator = /(?:en az|minimum|az degil|az değil)/.test(context) ? "gte" : "lte";
    const unit = spec.unit === "episode" && /\bbolum\b/.test(match[0])
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
  if (/\b(tamamlanmis|tamamlanmış|bitmis|bitmiş|finished|completed)\b/.test(text)) {
    const match = /\b(tamamlanmis|bitmis|finished|completed)\b/.exec(text);
    const context = match ? text.slice(Math.max(0, match.index - 35), match.index + match[0].length + 35) : text;
    const role = AVOID_SIGNAL.test(context) ? "avoid" : PREFER_SIGNAL.test(context) ? "prefer" : "must";
    out.push({ id: `objective:release_status:completed:${role}`, kind: "objective", field: "release_status", operator: "eq", value: "completed", role, source: "explicit" });
  }
  if (/\b(devam eden|ongoing|releasing|running)\b/.test(text)) {
    const role = AVOID_SIGNAL.test(text) ? "avoid" : PREFER_SIGNAL.test(text) ? "prefer" : "must";
    out.push({ id: `objective:release_status:ongoing:${role}`, kind: "objective", field: "release_status", operator: "eq", value: "ongoing", role, source: "explicit" });
  }
  const year = /\b(19\d{2}|20\d{2})\b/.exec(text);
  if (year) {
    const value = Number.parseInt(year[1], 10);
    const operator = /(?:sonra|sonrasi|sonrası|after)/.test(text) ? "gte" : /(?:once|önce|before)/.test(text) ? "lte" : "eq";
    out.push({ id: `objective:release_year:${operator}:${value}`, kind: "objective", field: "release_year", operator, value, role: "must", source: "explicit" });
  }
  if (/\b(japonca|japanese)\b/.test(text)) out.push({ id: "objective:language:japanese", kind: "objective", field: "language", operator: "eq", value: "Japanese", role: "must", source: "explicit" });
  if (/\b(ingilizce|english)\b/.test(text)) out.push({ id: "objective:language:english", kind: "objective", field: "language", operator: "eq", value: "English", role: "must", source: "explicit" });
  if (/\b(japonya yapimi|japonya yapımı|made in japan)\b/.test(text)) out.push({ id: "objective:country:jp", kind: "objective", field: "country", operator: "eq", value: "JP", role: "must", source: "explicit" });
  if (/\b(tv format|dizi format)\b/.test(text)) out.push({ id: "objective:format:tv", kind: "objective", field: "format", operator: "eq", value: "TV", role: "must", source: "explicit" });
  return out;
}

export function extractStructuredConstraints(input: {
  message: string;
  targetMediaTypes: readonly RecommendationMediaType[];
  planningPreferenceSignals?: readonly string[];
  planningAvoidSignals?: readonly string[];
}): ConstraintExtractionResult {
  const text = normalizedMessage(input.message);
  const aspectConstraints: AspectConstraint[] = [];
  const warnings: string[] = [];
  const issues: string[] = [];
  const seen = new Map<AspectId, "must" | "prefer" | "avoid">();

  for (const id of ASPECT_IDS) {
    const contexts = occurrenceContexts(text, aliasesFor(id), id);
    if (contexts.length === 0) continue;
    const roles = new Set(contexts.map(roleForContext));
    if (roles.size > 1) {
      issues.push(`aspect_constraint_conflict:${id}`);
      continue;
    }
    let role = [...roles][0];
    const source = role === "prefer" && !contexts.some((context) => PREFER_SIGNAL.test(context)) ? "inferred" : "explicit";
    if (role === "must" && (ASPECT_REGISTRY[id].mustSafety === "unsafe" || !targetProviderSupportSafe(id, input.targetMediaTypes))) {
      warnings.push(`must_downgraded_unsupported:${id}`);
      role = "prefer";
    } else if (role === "must" && ASPECT_REGISTRY[id].mustSafety === "conditional") {
      warnings.push(`conditional_must_requires_evidence:${id}`);
    }
    const minimumLevel = role === "must" && contexts.some((context) => PRIMARY_LEVEL_SIGNAL.test(context))
      ? "primary"
      : DEFAULT_MUST_MINIMUM_LEVEL;
    aspectConstraints.push(aspectConstraint(id, role, source, minimumLevel));
    seen.set(id, role);
  }

  const addPlanning = (values: readonly string[], role: "prefer" | "avoid") => {
    for (const value of values) {
      const normalized = normalizeAspectAlias(value);
      const id = ASPECT_IDS.find((aspectId) => aliasesFor(aspectId).includes(normalized));
      if (!id || seen.has(id)) continue;
      aspectConstraints.push(aspectConstraint(id, role, "inferred"));
      seen.set(id, role);
    }
  };
  addPlanning(input.planningPreferenceSignals ?? [], "prefer");
  addPlanning(input.planningAvoidSignals ?? [], "avoid");

  const objectiveConstraints = parseObjectiveConstraints(text, input.targetMediaTypes);
  const telemetry = { explicit: 0, inferred: 0, profile: 0 };
  for (const constraint of [...aspectConstraints, ...objectiveConstraints]) telemetry[constraint.source] += 1;
  return { aspectConstraints, objectiveConstraints, warnings, issues, telemetry };
}
