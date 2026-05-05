// ============================================
// POST /api/ai/recommend
// ============================================
// 1) Intent analiz, 2) Library profile, 3) LLM-guided retrieval planning,
// 4) dogrulanmis aday toplama, 5) Provider'a siralat. Provider hata verirse
// mock fallback yalnizca dogrulanmis aday havuzunu kullanir.

import { NextRequest, NextResponse } from "next/server";
import { getProviderSequence, mockProvider } from "@/lib/ai/provider";
import { buildLibraryProfile } from "@/lib/ai/profile-builder";
import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import {
  CandidateSearchResult,
  CandidateVerificationResult,
  searchCandidatesWithDebug,
} from "@/lib/ai/candidate-search";
import {
  GeminiProviderError,
  GeminiProviderErrorCode,
} from "@/lib/ai/providers/gemini-provider";
import {
  CompatibleProviderError,
  CompatibleProviderErrorCode,
} from "@/lib/ai/providers/openai-compatible-provider";
import {
  AiRetrievalDebug,
  AiIntent,
  AiRecommendRequest,
  AiRecommendResponse,
  AiRetrievalPlan,
  AiSettings,
  LibraryProfile,
  AiProvider,
  AiCandidate,
} from "@/lib/ai/types";
import { MediaType } from "@/lib/types";

export const runtime = "nodejs";

const GEMINI_RATE_LIMIT_MESSAGE =
  "Gemini ücretsiz kota/rate limit sınırına takıldı. Bir süre sonra tekrar dene veya mock moda geç.";
const GEMINI_ALT_PROVIDER_MESSAGE =
  "Gemini kota sınırına takıldı, alternatif sağlayıcıyla devam edildi.";
const ALL_PROVIDERS_MOCK_MESSAGE =
  "AI sağlayıcıları şu an yanıt veremiyor, mock fallback kullanıldı.";

type ProviderErrorCode =
  | GeminiProviderErrorCode
  | CompatibleProviderErrorCode;

interface ProviderRunState {
  attemptedProviders: string[];
  selectedProvider?: string;
  providerErrors: Record<string, string>;
  providerError?: ProviderErrorCode;
  rateLimitHit: boolean;
  fallbackReason?: string;
  geminiCallCount: number;
  openrouterCallCount: number;
  groqCallCount: number;
}

function buildTransparencySummary(s: AiSettings): string {
  const parts = [
    s.useProfile ? "kütüphane profil özeti" : null,
    s.useRecentActivity ? "son aktivite özeti" : null,
    `AI bilgi sinyali ${s.useWebResearch ? "açık" : "kapalı"}`,
    `kişisel notlar ${s.usePersonalNotes ? "dahil" : "değil"}`,
    s.deepResearch ? "derin araştırma modu" : null,
  ].filter(Boolean);
  return `Bu istekte kullanılacaklar: ${parts.join(", ")}.`;
}

function sourceForType(type: MediaType): AiRetrievalPlan["searchPlans"][number]["source"] {
  if (["anime", "manga", "manhwa", "manhua"].includes(type)) return "anilist";
  if (type === "tv") return "tvmaze";
  if (type === "book") return "openlibrary";
  return "tmdb";
}

function fallbackQueries(message: string, intent: AiIntent): string[] {
  const refs = intent.references.map((r) => r.trim()).filter(Boolean);
  if (refs.length > 0) return refs.slice(0, 3);

  const cleaned = message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/öner|tavsiye|ister|istiyorum|lazım/i.test(w))
    .slice(0, 5)
    .join(" ")
    .trim();
  return cleaned ? [cleaned] : [];
}

function buildFallbackRetrievalPlan(message: string, intent: AiIntent): AiRetrievalPlan {
  const targets = intent.targetTypes;
  const genericNeedsClarification =
    intent.kind === "general_recommendation" && targets.length === 0;

  if (genericNeedsClarification) {
    return {
      taskType: intent.kind,
      interpretation: "Hedef medya türü belirsiz.",
      targetMediaTypes: [],
      sourceTypes: intent.sourceTypes,
      preferenceSignals: [],
      avoidSignals: intent.avoid,
      needsClarification: true,
      clarificationQuestion: "Ne tür bir öneri istersin: anime, dizi, kitap, manga/manhwa/manhua ya da film?",
      searchPlans: [],
    };
  }

  const queries = fallbackQueries(message, intent);
  return {
    taskType: intent.kind,
    interpretation: "Gemini planning kullanılamadığı için yalnızca açık tür/referans sinyalleriyle güvenli fallback plan üretildi.",
    targetMediaTypes: targets,
    sourceTypes: intent.sourceTypes,
    preferenceSignals: intent.mood,
    avoidSignals: intent.avoid,
    needsClarification: targets.length === 0,
    clarificationQuestion: targets.length === 0
      ? "Hangi medya türünde öneri istediğini netleştirir misin?"
      : undefined,
    searchPlans: targets.map((type) => ({
      source: sourceForType(type),
      mediaType: type,
      queries,
      reason: "Açıkça belirtilen hedef tür ve kullanıcı mesajındaki referanslardan üretildi.",
    })),
  };
}

function isSourceCompatible(type: MediaType, source: AiRetrievalPlan["searchPlans"][number]["source"]) {
  return sourceForType(type) === source;
}

function applyIntentGuardrails(plan: AiRetrievalPlan, intent: AiIntent, message: string): AiRetrievalPlan {
  if (intent.targetTypes.length === 0) return plan;

  const forcedTargets = intent.targetTypes;
  const queries = fallbackQueries(message, intent);
  const guardedPlans = plan.searchPlans
    .filter((p) => forcedTargets.includes(p.mediaType) && isSourceCompatible(p.mediaType, p.source))
    .map((p) => ({ ...p, queries: p.queries.length > 0 ? p.queries : queries }));

  const missingPlans = forcedTargets
    .filter((type) => !guardedPlans.some((p) => p.mediaType === type))
    .map((type) => ({
      source: sourceForType(type),
      mediaType: type,
      queries,
      reason: "Açık kullanıcı hedef türü guardrail'i ile eklendi.",
    }));

  return {
    ...plan,
    targetMediaTypes: forcedTargets,
    sourceTypes: intent.sourceTypes,
    needsClarification: false,
    clarificationQuestion: undefined,
    searchPlans: [...guardedPlans, ...missingPlans],
  };
}

function buildClarificationResponse(
  settings: AiSettings,
  intent: AiIntent,
  retrievalPlan: AiRetrievalPlan,
  providerName: string,
  debug: AiRetrievalDebug,
  providerDebug?: AiRecommendResponse["debug"]
): AiRecommendResponse {
  return {
    assistantMessage:
      retrievalPlan.clarificationQuestion ||
      "Daha iyi öneri verebilmem için hedef medya türünü netleştirmen gerekiyor.",
    recommendations: [],
    transparencySummary: buildTransparencySummary(settings),
    intent,
    debug: {
      provider: providerName,
      note: "retrieval planning requested clarification",
      ...providerDebug,
      retrieval: debug,
    },
  };
}

function providerDebugFields(state: ProviderRunState): Omit<NonNullable<AiRecommendResponse["debug"]>, "provider"> {
  return {
    attemptedProviders: state.attemptedProviders,
    selectedProvider: state.selectedProvider,
    providerErrors: state.providerErrors,
    providerError: state.providerError,
    geminiCallCount: state.geminiCallCount,
    openrouterCallCount: state.openrouterCallCount,
    groqCallCount: state.groqCallCount,
    rateLimitHit: state.rateLimitHit,
    fallbackReason: state.fallbackReason,
  };
}

function recordProviderAttempt(state: ProviderRunState, providerName: string) {
  if (!state.attemptedProviders.includes(providerName)) {
    state.attemptedProviders.push(providerName);
  }
  if (providerName === "gemini") state.geminiCallCount += 1;
  else if (providerName === "openrouter") state.openrouterCallCount += 1;
  else if (providerName === "groq") state.groqCallCount += 1;
}

function classifyProviderError(error: unknown): {
  provider: string;
  providerError: ProviderErrorCode;
  note: string;
  rateLimitHit: boolean;
  fallbackReason: string;
} {
  if (error instanceof GeminiProviderError) {
    return {
      provider: error.provider,
      providerError: error.code,
      note: error.message,
      rateLimitHit: error.code === "rate_limit",
      fallbackReason: error.code,
    };
  }
  if (error instanceof CompatibleProviderError) {
    return {
      provider: error.provider,
      providerError: error.code,
      note: error.message,
      rateLimitHit: error.code === "rate_limit",
      fallbackReason: error.code,
    };
  }

  const message = error instanceof Error ? error.message : `${error}`;
  return {
    provider: "unknown",
    providerError: "api_error",
    note: message,
    rateLimitHit: false,
    fallbackReason: "api_error",
  };
}

function applyProviderError(state: ProviderRunState, error: unknown, fallbackProviderName?: string) {
  const classified = classifyProviderError(error);
  const providerName = classified.provider === "unknown" ? fallbackProviderName || "unknown" : classified.provider;
  state.providerErrors[providerName] = classified.providerError;
  state.providerError = classified.providerError;
  state.rateLimitHit = state.rateLimitHit || classified.rateLimitHit;
  state.fallbackReason = classified.fallbackReason;
}

function providerCanRun(provider: AiProvider) {
  return provider.name === "mock" || !provider.isAvailable || provider.isAvailable();
}

async function runPlanningWithProviders(args: {
  providers: AiProvider[];
  state: ProviderRunState;
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
}): Promise<AiRetrievalPlan | null> {
  for (const provider of args.providers) {
    if (!provider.generateRetrievalPlan) continue;
    if (!providerCanRun(provider)) continue;
    if (args.state.providerErrors[provider.name]) continue;
    if (provider.name === "gemini" && args.state.geminiCallCount >= 2) continue;

    try {
      recordProviderAttempt(args.state, provider.name);
      const plan = await provider.generateRetrievalPlan({
        message: args.message,
        profile: args.profile,
        intent: args.intent,
        settings: args.settings,
      });
      args.state.selectedProvider = provider.name;
      return plan;
    } catch (error) {
      applyProviderError(args.state, error, provider.name);
    }
  }
  return null;
}

async function runRankingWithProviders(args: {
  providers: AiProvider[];
  state: ProviderRunState;
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
  candidates: AiCandidate[];
  retrievalPlan: AiRetrievalPlan | null;
  recentContext?: { role: "user" | "assistant"; content: string }[];
}): Promise<AiRecommendResponse> {
  let nonMockFailed = false;
  for (const provider of args.providers) {
    if (!providerCanRun(provider)) continue;
    if (provider.name !== "mock" && args.state.providerErrors[provider.name]) continue;
    if (provider.name === "gemini" && (args.state.rateLimitHit || args.state.geminiCallCount >= 2)) continue;

    try {
      recordProviderAttempt(args.state, provider.name);
      const response = await provider.generate({
        message: args.message,
        profile: args.profile,
        intent: args.intent,
        settings: args.settings,
        candidates: args.candidates,
        retrievalPlan: args.retrievalPlan,
        recentContext: args.recentContext,
      });
      args.state.selectedProvider = provider.name;
      if (provider.name === "mock" && nonMockFailed) {
        response.assistantMessage = `${ALL_PROVIDERS_MOCK_MESSAGE} ${response.assistantMessage}`.trim();
      } else if (args.state.rateLimitHit && provider.name !== "gemini" && provider.name !== "mock") {
        response.assistantMessage = `${GEMINI_ALT_PROVIDER_MESSAGE} ${response.assistantMessage}`.trim();
      }
      return response;
    } catch (error) {
      if (provider.name !== "mock") nonMockFailed = true;
      applyProviderError(args.state, error, provider.name);
    }
  }

  args.state.selectedProvider = "mock";
  const fallback = await mockProvider.generate({
    message: args.message,
    profile: args.profile,
    intent: args.intent,
    settings: args.settings,
    candidates: args.candidates,
    retrievalPlan: args.retrievalPlan,
  });
  if (nonMockFailed || Object.keys(args.state.providerErrors).length > 0) {
    fallback.assistantMessage = `${ALL_PROVIDERS_MOCK_MESSAGE} ${fallback.assistantMessage}`.trim();
  }
  return fallback;
}

function targetLabel(type: MediaType): string {
  switch (type) {
    case "book": return "Kitap";
    case "tv": return "Dizi";
    case "anime": return "Anime";
    case "manga": return "Manga";
    case "manhwa": return "Manhwa";
    case "manhua": return "Manhua";
    case "movie": return "Film";
  }
}

function hasProfileSourceData(profile: LibraryProfile | null, sourceTypes: MediaType[]) {
  if (!profile || sourceTypes.length === 0) return true;
  return sourceTypes.some((type) =>
    profile.highRated.some((item) => item.type === type) ||
    profile.favorites.some((item) => item.type === type) ||
    (profile.byType[type] || 0) > 0
  );
}

function buildEmptyPoolMessage(
  plan: AiRetrievalPlan | null,
  intent: AiIntent,
  profile: LibraryProfile | null,
  notes: string[]
): string {
  if (!plan || plan.targetMediaTypes.length === 0) {
    return "Anime, kitap, dizi veya film tarafında mı istersin?";
  }

  const hasMovieOnly =
    plan.targetMediaTypes.length > 0 &&
    plan.targetMediaTypes.every((t) => t === "movie");
  if (hasMovieOnly) {
    return "Film/TMDB kaynağı şu anda pasif olduğu için doğrulanmış film adayı getiremedim.";
  }

  if (notes.some((n) => n.startsWith("tv_mood_discovery_weak"))) {
    return "Dizi tarafında güvenilir aday bulamadım; daha spesifik tür/örnek dizi verirsen daha iyi arayabilirim.";
  }

  if (!hasProfileSourceData(profile, plan.sourceTypes)) {
    const sources = plan.sourceTypes.map(targetLabel).join(", ");
    return `${sources} tarafında yeterli kütüphane sinyali bulamadım; örnek başlık veya puanlı kayıt eklersen daha iyi çevirebilirim.`;
  }

  const targets = plan.targetMediaTypes.map(targetLabel).join(", ");
  const theme = plan.preferenceSignals[0] || plan.interpretation || "bu tema";
  return `${targets} tarafında "${theme}" için doğrulanmış aday bulamadım.`;
}

async function getCandidates(args: {
  intent: AiIntent;
  retrievalPlan: AiRetrievalPlan | null;
  profile: ReturnType<typeof buildLibraryProfile> | null;
  message: string;
  mediaItems: AiRecommendRequest["mediaItems"];
  progressLogs: AiRecommendRequest["progressLogs"];
}): Promise<CandidateSearchResult> {
  return searchCandidatesWithDebug({
    intent: args.intent,
    retrievalPlan: args.retrievalPlan,
    profile: args.profile,
    message: args.message,
    mediaItems: args.mediaItems,
    progressLogs: args.progressLogs,
  });
}

function buildRetrievalDebug(args: {
  intent: AiIntent;
  plan: AiRetrievalPlan | null;
  searchDebug?: CandidateSearchResult["debug"];
  refinedPassUsed: boolean;
  providerFallback: boolean;
  notes?: string[];
  ideaCount?: number;
  verifiedCount?: number;
  verificationSourceCounts?: Record<string, number>;
  rejectedUnverifiedCount?: number;
  fallbackSearchUsed?: boolean;
}): AiRetrievalDebug {
  const {
    intent,
    plan,
    searchDebug,
    refinedPassUsed,
    providerFallback,
    notes,
    ideaCount,
    verifiedCount,
    verificationSourceCounts,
    rejectedUnverifiedCount,
    fallbackSearchUsed,
  } = args;
  return {
    parsedIntent: intent,
    taskType: plan?.taskType || intent.kind,
    targetMediaTypes: plan?.targetMediaTypes || intent.targetTypes,
    sourceTypes: plan?.sourceTypes || intent.sourceTypes,
    sourceContext: plan?.sourceContext,
    preferenceSignals: plan?.preferenceSignals || intent.mood,
    avoidSignals: plan?.avoidSignals || intent.avoid,
    needsClarification: Boolean(plan?.needsClarification),
    clarificationQuestion: plan?.clarificationQuestion,
    searchPlans: plan?.searchPlans || [],
    candidateIdeasCount: ideaCount,
    verifiedCount,
    verificationSourceCounts,
    rejectedUnverifiedCount,
    fallbackSearchUsed,
    executedQueries: searchDebug?.executedQueries || [],
    sourceCandidateCounts: searchDebug?.sourceCandidateCounts || {},
    filterSummary: searchDebug?.filterSummary || { before: 0, after: 0, removed: 0, reasons: {} },
    finalCandidateCount: searchDebug?.finalCandidateCount || 0,
    refinedPassUsed,
    providerFallback,
    notes: [...(searchDebug?.notes || []), ...(notes || [])],
  };
}

function isWeakTvMoodDiscovery(intent: AiIntent, plan: AiRetrievalPlan | null, result: CandidateSearchResult) {
  const targets = plan?.targetMediaTypes || intent.targetTypes;
  const targetTvOnly = targets.length === 1 && targets[0] === "tv";
  const moodBased = intent.kind === "mood_based" || (plan?.preferenceSignals.length || 0) > 0;
  const hasConcreteAnchor = intent.references.length > 0 || (plan?.sourceTypes.length || 0) > 0;
  return targetTvOnly && moodBased && !hasConcreteAnchor && result.candidates.length < 6;
}

function emptyVerificationResult(): CandidateVerificationResult {
  return {
    candidates: [],
    ideaCount: 0,
    verifiedCount: 0,
    rejectedUnverifiedCount: 0,
    verificationSourceCounts: {},
    debug: {
      executedQueries: [],
      sourceCandidateCounts: {},
      filterSummary: { before: 0, after: 0, removed: 0, reasons: {} },
      finalCandidateCount: 0,
      notes: [],
    },
  };
}

export async function POST(req: NextRequest) {
  let body: AiRecommendRequest;
  try {
    body = (await req.json()) as AiRecommendRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const settings = body.settings;
  const mediaItems = Array.isArray(body.mediaItems) ? body.mediaItems : [];
  const progressLogs = Array.isArray(body.progressLogs) ? body.progressLogs : [];
  const intent = analyzeIntent(message);
  const profile = settings?.useProfile
    ? buildLibraryProfile(mediaItems, progressLogs, settings)
    : null;
  const providers = getProviderSequence();
  const providerState: ProviderRunState = {
    attemptedProviders: [],
    providerErrors: {},
    rateLimitHit: false,
    geminiCallCount: 0,
    openrouterCallCount: 0,
    groqCallCount: 0,
  };
  let retrievalPlan: AiRetrievalPlan | null = null;

  if (intent.kind !== "library_based") {
    retrievalPlan = await runPlanningWithProviders({
      providers,
      state: providerState,
      message,
      profile,
      intent,
      settings,
    });
    retrievalPlan = retrievalPlan || buildFallbackRetrievalPlan(message, intent);

    retrievalPlan = applyIntentGuardrails(retrievalPlan, intent, message);

    if (retrievalPlan.needsClarification) {
      const debug = buildRetrievalDebug({
        intent,
        plan: retrievalPlan,
        refinedPassUsed: false,
        providerFallback: false,
      });
      return NextResponse.json(
        buildClarificationResponse(settings, intent, retrievalPlan, providerState.selectedProvider || "mock", debug, {
          provider: providerState.selectedProvider || "mock",
          ...providerDebugFields(providerState),
        })
      );
    }
  }

  let searchResult: CandidateSearchResult = await getCandidates({
    intent,
    retrievalPlan,
    profile,
    message,
    mediaItems,
    progressLogs,
  });
  const debugNotes: string[] = [];

  if (isWeakTvMoodDiscovery(intent, retrievalPlan, searchResult)) {
    debugNotes.push("tv_mood_discovery_weak");
    searchResult = {
      ...searchResult,
      candidates: [],
      debug: {
        ...searchResult.debug,
        finalCandidateCount: 0,
        notes: [...searchResult.debug.notes, "tv_mood_discovery_weak"],
      },
    };
  }

  const shouldRefine =
    settings.deepResearch &&
    !providerState.rateLimitHit &&
    !!retrievalPlan &&
    searchResult.candidates.length === 0;
  let refinedPassUsed = false;

  if (shouldRefine) {
    try {
      const refinedPlan = await runPlanningWithProviders({
        providers,
        state: providerState,
        message,
        profile,
        intent,
        settings,
      });
      if (refinedPlan && !refinedPlan.needsClarification) {
        const guardedRefinedPlan = applyIntentGuardrails(refinedPlan, intent, message);
        const refinedResult = await getCandidates({
          intent,
          retrievalPlan: guardedRefinedPlan,
          profile,
          message,
          mediaItems,
          progressLogs,
        });
        if (refinedResult.candidates.length > searchResult.candidates.length || searchResult.candidates.length === 0) {
          retrievalPlan = guardedRefinedPlan;
          searchResult = refinedResult;
          refinedPassUsed = true;
        }
      }
    } catch (error) {
      applyProviderError(providerState, error);
    }
  }

  const fallbackSearchUsed = intent.kind !== "library_based" && searchResult.candidates.length < 3;
  const verificationResult: CandidateVerificationResult = emptyVerificationResult();

  if (isWeakTvMoodDiscovery(intent, retrievalPlan, searchResult)) {
    debugNotes.push("tv_mood_discovery_weak_after_refine");
    searchResult = {
      ...searchResult,
      candidates: [],
      debug: {
        ...searchResult.debug,
        finalCandidateCount: 0,
        notes: [...searchResult.debug.notes, "tv_mood_discovery_weak_after_refine"],
      },
    };
  }

  let candidates = searchResult.candidates;

  const libIndex = new Map<string, true>();
  for (const m of mediaItems) {
    if (m.externalSource && m.externalId) {
      libIndex.set(`${m.externalSource}:${m.externalId}`, true);
    }
  }
  candidates = candidates.map((c) => {
    if (c.source !== "library" && libIndex.has(`${c.source}:${c.externalId}`)) {
      return { ...c };
    }
    return c;
  });

  const retrievalDebug = buildRetrievalDebug({
    intent,
    plan: retrievalPlan,
    searchDebug: {
      ...searchResult.debug,
      finalCandidateCount: candidates.length,
    },
    refinedPassUsed,
    providerFallback: false,
    notes: debugNotes,
    ideaCount: verificationResult.ideaCount,
    verifiedCount: verificationResult.verifiedCount,
    verificationSourceCounts: verificationResult.verificationSourceCounts,
    rejectedUnverifiedCount: verificationResult.rejectedUnverifiedCount,
    fallbackSearchUsed,
  });

  if (candidates.length === 0) {
    const empty: AiRecommendResponse = {
      assistantMessage: buildEmptyPoolMessage(retrievalPlan, intent, profile, retrievalDebug.notes || []),
      recommendations: [],
      transparencySummary: buildTransparencySummary(settings),
      intent,
      debug: {
        provider: providerState.selectedProvider || "mock",
        ...providerDebugFields(providerState),
        note: "empty candidate pool",
        retrieval: retrievalDebug,
      },
    };
    if (providerState.rateLimitHit) {
      empty.assistantMessage = GEMINI_RATE_LIMIT_MESSAGE;
    }
    return NextResponse.json(empty);
  }

  try {
    const response = await runRankingWithProviders({
      providers,
      state: providerState,
      message,
      profile,
      intent,
      settings,
      candidates,
      retrievalPlan,
      recentContext: body.recentContext,
    });
    response.debug = {
      ...(response.debug || { provider: providerState.selectedProvider || "mock" }),
      provider: providerState.selectedProvider || response.debug?.provider || "mock",
      ...providerDebugFields(providerState),
      note: response.debug?.note,
      retrieval: retrievalDebug,
    };
    response.recommendations = response.recommendations.map((r) => ({
      ...r,
      inLibrary:
        r.inLibrary ||
        (!!r.externalSource && !!r.externalId && libIndex.has(`${r.externalSource}:${r.externalId}`)),
    }));
    return NextResponse.json(response satisfies AiRecommendResponse);
  } catch (err) {
    applyProviderError(providerState, err);

    const fallback = await mockProvider.generate({
      message,
      profile,
      intent,
      settings,
      candidates,
      retrievalPlan,
    });
    fallback.debug = {
      provider: "mock",
      ...providerDebugFields(providerState),
      fellBackToMock: true,
      note: err instanceof Error ? err.message : "unknown error",
      retrieval: { ...retrievalDebug, providerFallback: true },
    };
    if (providerState.rateLimitHit) {
      fallback.assistantMessage = `${GEMINI_RATE_LIMIT_MESSAGE} ${fallback.assistantMessage}`.trim();
    }
    fallback.recommendations = fallback.recommendations.map((r) => ({
      ...r,
      inLibrary:
        r.inLibrary ||
        (!!r.externalSource && !!r.externalId && libIndex.has(`${r.externalSource}:${r.externalId}`)),
    }));
    return NextResponse.json(fallback);
  }
}
