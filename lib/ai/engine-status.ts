import type {
  AiCandidate,
  AiEngineProvider,
  AiEngineStatus,
  AiRecommendation,
} from "@/lib/ai/types";

const KNOWN_PROVIDERS = new Set<AiEngineProvider>([
  "deterministic_v2",
  "mock",
  "openai",
  "gemini",
  "openrouter",
  "groq",
  "safe_fallback",
  "unknown",
]);

function normalizeProvider(value: string | undefined): AiEngineProvider {
  const normalized = value?.trim().toLowerCase() as AiEngineProvider | undefined;
  return normalized && KNOWN_PROVIDERS.has(normalized) ? normalized : "unknown";
}

function safeModelName(value: string | undefined): string | undefined {
  const model = value?.trim();
  if (!model || model.length > 100) return undefined;
  return /^[a-zA-Z0-9._/:+-]+$/.test(model) ? model : undefined;
}

export function buildAiEngineStatus(args: {
  provider?: string;
  model?: string;
  providerFallbackUsed?: boolean;
  evaluatedCandidateCount: number;
  candidates: AiCandidate[];
  feedbackEventCount?: number;
  feedbackAdjustedCount?: number;
  embedding?: {
    provider: string;
    requested: number;
    fallbackUsed: boolean;
    persistentCacheDisabled?: boolean;
  };
}): AiEngineStatus {
  const embeddingMode =
    !args.embedding || args.embedding.requested === 0
      ? "disabled"
      : args.embedding.provider === "python_service"
        ? "python_service"
        : args.embedding.provider === "local_mock"
          ? "local_mock"
          : "disabled";
  const persistentCache = embeddingMode !== "python_service"
    ? "not_used"
    : args.embedding?.persistentCacheDisabled
      ? "disabled"
      : "active";

  return {
    provider: normalizeProvider(args.provider),
    model: safeModelName(args.model),
    embeddingMode,
    providerFallbackUsed: Boolean(args.providerFallbackUsed),
    evaluatedCandidateCount: Math.max(0, Math.trunc(args.evaluatedCandidateCount)),
    sources: Array.from(new Set(args.candidates.map((candidate) => candidate.source))).sort(),
    feedbackApplied: (args.feedbackAdjustedCount ?? 0) > 0,
    feedbackEventCount: Math.max(0, Math.trunc(args.feedbackEventCount ?? 0)),
    persistentCache,
  };
}

/** Provider çıktısını yalnızca server'ın doğruladığı adaylarla sınırlar. */
export function retainVerifiedRecommendations(
  recommendations: AiRecommendation[],
  candidates: AiCandidate[]
): AiRecommendation[] {
  const verified = new Map(
    candidates.map((candidate) => [`${candidate.source}:${candidate.externalId}`, candidate])
  );

  return recommendations.flatMap((recommendation) => {
    if (!recommendation.externalSource || !recommendation.externalId) return [];
    const candidate = verified.get(`${recommendation.externalSource}:${recommendation.externalId}`);
    if (!candidate) return [];
    return [{
      ...recommendation,
      title: candidate.title,
      mediaType: candidate.type,
      externalSource: candidate.source,
      externalId: candidate.externalId,
      candidate,
    }];
  });
}
