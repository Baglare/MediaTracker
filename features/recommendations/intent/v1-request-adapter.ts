import type { AiIntent, AiRetrievalPlan, AiSettings } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";
import { decodeRecommendationRequestV2, type RecommendationRequestV2 } from "../domain/codec";
import type { RecommendationMediaType, SemanticVerifierMode } from "../domain/types";
import { extractStructuredConstraints } from "./constraint-extractor";
import { resolveRecommendationReferences } from "./reference-policy";
import type { AiCandidate } from "@/lib/ai/types";

export interface V1RequestAdapterResult {
  request: RecommendationRequestV2 | null;
  needsClarification: boolean;
  issues: string[];
  warnings: string[];
  telemetry: {
    aspectConstraints: number;
    objectiveConstraints: number;
    explicit: number;
    inferred: number;
    profile: number;
    unresolvedReferences: number;
  };
}

export function adaptV1RequestToV2(input: {
  message: string;
  intent: AiIntent;
  retrievalPlan: AiRetrievalPlan | null;
  settings: AiSettings;
  mediaItems: readonly MediaItem[];
  candidates: readonly AiCandidate[];
  semanticVerifierMode?: SemanticVerifierMode;
}): V1RequestAdapterResult {
  const targets = [...new Set((input.intent.targetTypes.length > 0
    ? input.intent.targetTypes
    : input.retrievalPlan?.targetMediaTypes ?? []).filter((value): value is RecommendationMediaType =>
      ["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"].includes(value)))] as RecommendationMediaType[];
  const extracted = extractStructuredConstraints({
    message: input.message,
    targetMediaTypes: targets,
    planningPreferenceSignals: input.retrievalPlan?.preferenceSignals,
    planningAvoidSignals: input.retrievalPlan?.avoidSignals,
  });
  const references = resolveRecommendationReferences({ intent: input.intent, mediaItems: input.mediaItems, candidates: input.candidates });
  const raw = {
    version: 2,
    queryText: input.message,
    targetMediaTypes: targets,
    aspectConstraints: extracted.aspectConstraints,
    objectiveConstraints: extracted.objectiveConstraints,
    strictness: "balanced",
    references: references.references,
    profileSignalsEnabled: input.settings.useProfile !== false,
    semanticVerifierMode: input.semanticVerifierMode ?? "structured_only",
    locale: "tr-TR",
  };
  const decoded = decodeRecommendationRequestV2(raw);
  const issues = [...extracted.issues, ...(decoded.ok ? [] : decoded.issues.map((entry) => `${entry.code}:${entry.path}`))];
  const needsClarification = targets.length === 0 || extracted.issues.length > 0 || references.ambiguousCount > 0 || !decoded.ok;
  return {
    request: decoded.ok ? decoded.value : null,
    needsClarification,
    issues,
    warnings: [...extracted.warnings, ...references.warnings],
    telemetry: {
      aspectConstraints: extracted.aspectConstraints.length,
      objectiveConstraints: extracted.objectiveConstraints.length,
      explicit: extracted.telemetry.explicit,
      inferred: extracted.telemetry.inferred,
      profile: extracted.telemetry.profile,
      unresolvedReferences: references.unresolvedCount,
    },
  };
}

