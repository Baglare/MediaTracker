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
  AiRecommendation,
  AiRetrievalPlan,
  AiSettings,
  LibraryProfile,
  AiProvider,
  AiCandidate,
} from "@/lib/ai/types";
import { MediaType } from "@/lib/types";

export const runtime = "nodejs";

const PROVIDER_RATE_LIMIT_MESSAGE =
  "AI sağlayıcılarından biri kota/rate limit sınırına takıldı, alternatif sağlayıcı denendi.";
const ALL_PROVIDERS_MOCK_MESSAGE =
  "AI sağlayıcıları şu an yanıt veremiyor. Daha sonra tekrar dene veya mock moda geç.";

const PROVIDER_PLAN_FAILED_MESSAGE =
  "AI sağlayıcıları sağlıklı plan üretemediği için güvenilir öneri hazırlayamadım.";
const PROVIDER_TIMEOUT_MS = 25000;

type ProviderErrorCode =
  | GeminiProviderErrorCode
  | CompatibleProviderErrorCode
  | "timeout";

interface ProviderRunState {
  attemptedProviders: string[];
  selectedProvider?: string;
  failedProviders: { provider: string; stage: "planning" | "ranking"; error: string }[];
  providerErrors: Record<string, string>;
  providerError?: ProviderErrorCode;
  rateLimitHit: boolean;
  fallbackReason?: string;
  geminiCallCount: number;
  openrouterCallCount: number;
  groqCallCount: number;
  mockCallCount: number;
  timeoutHit: boolean;
  safeFallbackUsed: boolean;
  usedModel?: string;
  followUpMerged: boolean;
  activeContextSummary?: string;
}

class ProviderTimeoutError extends Error {
  provider: string;
  constructor(provider: string) {
    super(`${provider} provider timeout`);
    this.name = "ProviderTimeoutError";
    this.provider = provider;
  }
}

function statusLabelTr(status?: string): string {
  switch (status) {
    case "watching": return "İzliyor";
    case "reading": return "Okuyor";
    case "planning": return "Planlandı";
    case "paused": return "Duraklatıldı";
    case "completed": return "Tamamlandı";
    case "dropped": return "Bırakıldı";
    default: return status || "—";
  }
}

function deterministicLibraryReason(c: AiCandidate): string {
  const parts: string[] = [];
  if (c.status) parts.push(`${statusLabelTr(c.status)} durumunda`);
  if (c.type === "movie" && (c.currentProgress || 0) === 0 && c.totalProgress === 1) {
    parts.push("henüz başlamamışsın");
  } else if (typeof c.currentProgress === "number" && typeof c.totalProgress === "number" && c.totalProgress > 0) {
    const pct = Math.round((c.currentProgress / c.totalProgress) * 100);
    parts.push(`${c.currentProgress}/${c.totalProgress} ilerlemişsin (%${pct})`);
  }
  if (typeof c.userRating === "number") parts.push(`puan ${c.userRating}/10`);
  if (c.favorite) parts.push("favorilerinde");
  if (c.lastActivityAt) {
    const d = new Date(c.lastActivityAt);
    if (!isNaN(d.getTime())) {
      parts.push(`son aktiviten ${d.toLocaleDateString("tr-TR")}`);
    }
  }
  return parts.length > 0
    ? parts.join(", ").replace(/^./, (m) => m.toUpperCase()) + "."
    : "Kütüphanende devam etmeye uygun, dropped/completed olmayan bir aday.";
}

function deterministicLibraryFitLabel(c: AiCandidate, idx: number): string {
  if (c.type === "movie" && (c.currentProgress || 0) === 0 && c.totalProgress === 1) {
    return "Başlamak için uygun";
  }
  if (c.status === "watching" || c.status === "reading") {
    if (typeof c.currentProgress === "number" && typeof c.totalProgress === "number" && c.totalProgress > 0) {
      const pct = c.currentProgress / c.totalProgress;
      if (pct >= 0.5) return "Bitirmeye yakın";
    }
    return "Devam ediyor";
  }
  if (c.status === "paused") return "Duraklamış — kaldığın yerden";
  if (c.status === "planning") return "Plandaki sıradan";
  return idx === 0 ? "Bugün için ideal" : "Devam etmeye uygun";
}

function buildLibraryDeterministicRecs(candidates: AiCandidate[]): AiRecommendation[] {
  return candidates
    .filter((c) => c.source === "library" && c.status !== "completed" && c.status !== "dropped")
    .slice(0, 5)
    .map<AiRecommendation>((c, i) => ({
      id: `lib-det-${c.externalId}-${i}`,
      title: c.title,
      mediaType: c.type,
      source: "Kütüphanen",
      externalSource: "library",
      externalId: c.externalId,
      coverUrl: c.coverUrl,
      overview: c.overview,
      fitLabel: deterministicLibraryFitLabel(c, i),
      reason: deterministicLibraryReason(c),
      inLibrary: true,
      candidate: c,
    }));
}

function localOnlyCandidates(
  mediaItems: AiRecommendRequest["mediaItems"],
  progressLogs: AiRecommendRequest["progressLogs"]
): AiCandidate[] {
  const lastByMedia = new Map<string, string>();
  for (const log of progressLogs) {
    const prev = lastByMedia.get(log.mediaId);
    if (!prev || new Date(log.createdAt).getTime() > new Date(prev).getTime()) {
      lastByMedia.set(log.mediaId, log.createdAt);
    }
  }
  return mediaItems
    .filter((m) => m.status !== "completed" && m.status !== "dropped")
    .map<AiCandidate>((m) => ({
      source: "library",
      externalId: m.id,
      type: m.type,
      title: m.title,
      overview: m.overview,
      releaseYear: m.releaseYear,
      coverUrl: m.coverImage,
      genres: m.genres,
      totalProgress: m.totalProgress,
      status: m.status,
      currentProgress: m.currentProgress,
      userRating: m.userRating ?? m.rating ?? null,
      favorite: Boolean(m.favorite),
      lastActivityAt: lastByMedia.get(m.id),
      libraryItemId: m.id,
    }))
    .sort((a, b) => {
      const score = (c: AiCandidate) =>
        (c.favorite ? 30 : 0) +
        (typeof c.userRating === "number" ? c.userRating * 3 : 0) +
        (c.status === "watching" || c.status === "reading" ? 20 : 0) +
        (c.lastActivityAt ? 10 : 0);
      return score(b) - score(a);
    });
}

interface DeterministicTaste {
  highRatedSourceCount: number;
  signals: string[];
  queries: string[];
}

function minRequestedRating(message: string): number {
  const match = message.match(/(\d+(?:[.,]\d+)?)\s*\+/);
  if (!match) return 7;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 7;
}

function addSignal(signals: Set<string>, signal: string) {
  if (signal) signals.add(signal.toLowerCase());
}

function extractDeterministicTaste(
  mediaItems: AiRecommendRequest["mediaItems"],
  intent: AiIntent,
  message: string
): DeterministicTaste {
  const minRating = minRequestedRating(message);
  const sourceTypes = intent.sourceTypes.length > 0 ? intent.sourceTypes : [];
  const sourceItems = mediaItems.filter((m) => {
    const rating = m.userRating ?? m.rating ?? null;
    return typeof rating === "number" && rating >= minRating && sourceTypes.includes(m.type);
  });

  const signals = new Set<string>();
  for (const item of sourceItems) {
    const text = [
      item.title,
      item.overview,
      ...(item.genres || []),
      ...(item.tags || []),
      ...(item.subjects || []),
      item.personalNotes,
    ].filter(Boolean).join(" ").toLowerCase();

    for (const genre of [...(item.genres || []), ...(item.tags || []), ...(item.subjects || [])]) {
      addSignal(signals, genre);
    }
    if (/fantasy|sci-fi|magic|dragon|throne|kingdom|realm|myth/i.test(text)) addSignal(signals, "fantasy");
    if (/drama|family|betrayal|tragedy/i.test(text)) addSignal(signals, "drama");
    if (/politic|political|power|control|court|noble|king|queen|empire|throne/i.test(text)) addSignal(signals, "political");
    if (/struggle|war|battle|rival|conflict/i.test(text)) addSignal(signals, "power struggle");
    if (/dark|brutal|violent|blood|death|grim/i.test(text)) addSignal(signals, "dark");
    if (/intrigue|conspiracy|scheme|secret/i.test(text)) addSignal(signals, "intrigue");
    if (/thriller|crime|mystery|suspense/i.test(text)) addSignal(signals, "thriller");
  }

  const signalList = [...signals].slice(0, 10);
  return {
    highRatedSourceCount: sourceItems.length,
    signals: signalList,
    queries: buildDeterministicQueries(intent.targetTypes, signalList),
  };
}

function buildDeterministicQueries(targetTypes: MediaType[], signals: string[]): string[] {
  const has = (value: string) => signals.some((s) => s.includes(value));
  const target = targetTypes[0];
  const queries: string[] = [];

  if (target === "book") {
    if (has("fantasy")) queries.push("epic fantasy novel");
    if (has("political") || has("power struggle") || has("intrigue")) queries.push("political fantasy novel");
    if (has("dark")) queries.push("dark fantasy novel");
    if (has("drama")) queries.push("fantasy drama novel");
  } else if (target === "anime") {
    if (has("fantasy")) queries.push("epic fantasy anime");
    if (has("political") || has("power struggle")) queries.push("political fantasy anime");
    if (has("dark")) queries.push("dark fantasy anime");
  } else if (target === "tv") {
    if (has("fantasy")) queries.push("epic fantasy");
    if (has("political") || has("power struggle")) queries.push("political drama");
    if (has("dark")) queries.push("dark drama");
  } else if (target === "movie") {
    if (has("fantasy")) queries.push("epic fantasy");
    if (has("political") || has("power struggle")) queries.push("political thriller");
    if (has("dark")) queries.push("dark fantasy");
  } else if (target) {
    if (has("fantasy")) queries.push("fantasy");
    if (has("dark")) queries.push("dark fantasy");
    if (has("drama")) queries.push("drama");
  }

  return [...new Set(queries)].slice(0, 4);
}

function buildDeterministicFallbackPlan(intent: AiIntent, taste: DeterministicTaste): AiRetrievalPlan | null {
  if (taste.highRatedSourceCount <= 0 || taste.queries.length === 0 || intent.targetTypes.length === 0) {
    return null;
  }
  return {
    taskType: intent.kind,
    interpretation: "Provider planning başarısız olduğu için yüksek puanlı kaynak kayıtlarından deterministik düşük güvenli plan üretildi.",
    targetMediaTypes: intent.targetTypes,
    sourceTypes: intent.sourceTypes,
    sourceContext: "high_rated_source_items",
    preferenceSignals: taste.signals,
    avoidSignals: intent.avoid,
    needsClarification: false,
    searchPlans: intent.targetTypes.map((type) => ({
      source: sourceForType(type),
      mediaType: type,
      queries: taste.queries,
      reason: "Yüksek puanlı kaynak kayıtlarının genre/tag/overview sinyallerinden üretildi.",
    })),
  };
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

function summarizeActiveContext(ctx?: AiRecommendRequest["activeContext"]): string | undefined {
  if (!ctx?.followUpMerged) return undefined;
  const recs = ctx.lastRecommendations?.slice(0, 3).map((r) => r.title).filter(Boolean).join(", ");
  return [
    ctx.previousPrompt ? `previous: ${ctx.previousPrompt}` : null,
    ctx.followUpMessage ? `follow-up: ${ctx.followUpMessage}` : null,
    recs ? `last recommendations: ${recs}` : null,
  ].filter(Boolean).join(" | ");
}

function buildProviderMessage(message: string, ctx?: AiRecommendRequest["activeContext"]): string {
  if (!ctx?.followUpMerged || !ctx.previousPrompt) return message;
  const recs = ctx.lastRecommendations?.slice(0, 5)
    .map((r) => `${r.title}${r.mediaType ? ` (${r.mediaType})` : ""}`)
    .join(", ");
  return [
    `Önceki kullanıcı isteği: ${ctx.previousPrompt}`,
    ctx.lastAssistantMessage ? `Son AI cevabı: ${ctx.lastAssistantMessage}` : null,
    recs ? `Son doğrulanmış öneriler: ${recs}` : null,
    `Kullanıcının takip mesajı: ${ctx.followUpMessage || message}`,
    "Bu mesajı yeni bağımsız istek gibi değil, önceki aktif AI konusunun devamı olarak yorumla.",
  ].filter(Boolean).join("\n");
}

function sourceForType(type: MediaType): AiRetrievalPlan["searchPlans"][number]["source"] {
  if (["anime", "manga", "manhwa", "manhua"].includes(type)) return "anilist";
  if (type === "tv") return "tvmaze";
  if (type === "book") return "openlibrary";
  if (type === "movie") return "omdb";
  return "library";
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
    interpretation: "AI provider planning kullanılamadığı için yalnızca açık tür/referans sinyalleriyle güvenli fallback plan üretildi.",
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
    failedProviders: state.failedProviders,
    providerErrors: state.providerErrors,
    providerError: state.providerError,
    geminiCallCount: state.geminiCallCount,
    openrouterCallCount: state.openrouterCallCount,
    groqCallCount: state.groqCallCount,
    providerCallCounts: {
      gemini: state.geminiCallCount,
      openrouter: state.openrouterCallCount,
      groq: state.groqCallCount,
      mock: state.mockCallCount,
    },
    rateLimitHit: state.rateLimitHit,
    timeoutHit: state.timeoutHit,
    fallbackReason: state.fallbackReason,
    safeFallbackUsed: state.safeFallbackUsed,
    usedModel: state.usedModel,
    followUpMerged: state.followUpMerged,
    activeContextSummary: state.activeContextSummary,
  };
}

function recordProviderAttempt(state: ProviderRunState, providerName: string) {
  if (!state.attemptedProviders.includes(providerName)) {
    state.attemptedProviders.push(providerName);
  }
  if (providerName === "gemini") state.geminiCallCount += 1;
  else if (providerName === "openrouter") state.openrouterCallCount += 1;
  else if (providerName === "groq") state.groqCallCount += 1;
  else if (providerName === "mock") state.mockCallCount += 1;
}

function classifyProviderError(error: unknown): {
  provider: string;
  providerError: ProviderErrorCode;
  note: string;
  rateLimitHit: boolean;
  fallbackReason: string;
} {
  if (error instanceof ProviderTimeoutError) {
    return {
      provider: error.provider,
      providerError: "timeout",
      note: error.message,
      rateLimitHit: false,
      fallbackReason: "timeout",
    };
  }
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

function applyProviderError(
  state: ProviderRunState,
  error: unknown,
  fallbackProviderName?: string,
  stage: "planning" | "ranking" = "ranking"
) {
  const classified = classifyProviderError(error);
  const providerName = classified.provider === "unknown" ? fallbackProviderName || "unknown" : classified.provider;
  state.providerErrors[providerName] = classified.providerError;
  state.failedProviders.push({ provider: providerName, stage, error: classified.providerError });
  state.providerError = classified.providerError;
  state.rateLimitHit = state.rateLimitHit || classified.rateLimitHit;
  state.timeoutHit = state.timeoutHit || classified.providerError === "timeout";
  state.fallbackReason = classified.fallbackReason;
}

function withProviderTimeout<T>(providerName: string, promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new ProviderTimeoutError(providerName)), PROVIDER_TIMEOUT_MS);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
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
      const plan = await withProviderTimeout(provider.name, provider.generateRetrievalPlan({
          message: args.message,
          profile: args.profile,
          intent: args.intent,
          settings: args.settings,
        })
      );
      return plan;
    } catch (error) {
      applyProviderError(args.state, error, provider.name, "planning");
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
      const response = await withProviderTimeout(provider.name, provider.generate({
          message: args.message,
          profile: args.profile,
          intent: args.intent,
          settings: args.settings,
          candidates: args.candidates,
          retrievalPlan: args.retrievalPlan,
          recentContext: args.recentContext,
        })
      );
      args.state.selectedProvider = provider.name;
      args.state.usedModel = response.debug?.usedModel || args.state.usedModel;
      if (provider.name === "mock" && nonMockFailed) {
        response.assistantMessage = `${ALL_PROVIDERS_MOCK_MESSAGE} ${response.assistantMessage}`.trim();
      } else if (args.state.rateLimitHit && provider.name !== "mock") {
        response.assistantMessage = `${PROVIDER_RATE_LIMIT_MESSAGE} ${response.assistantMessage}`.trim();
      }
      return response;
    } catch (error) {
      if (provider.name !== "mock") nonMockFailed = true;
      applyProviderError(args.state, error, provider.name, "ranking");
    }
  }

  args.state.selectedProvider = "mock";
  args.state.safeFallbackUsed = Object.keys(args.state.providerErrors).length > 0;
  recordProviderAttempt(args.state, "mock");
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
  highRatedSourceCount?: number;
  deterministicTasteSignals?: string[];
  deterministicFallbackUsed?: boolean;
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
    highRatedSourceCount,
    deterministicTasteSignals,
    deterministicFallbackUsed,
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
    highRatedSourceCount: highRatedSourceCount || 0,
    deterministicTasteSignals: deterministicTasteSignals || [],
    deterministicFallbackUsed: Boolean(deterministicFallbackUsed),
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
  const activeContext = body.activeContext;
  const followUpMerged = Boolean(activeContext?.followUpMerged);
  const activeContextSummary = summarizeActiveContext(activeContext);
  const providerMessage = buildProviderMessage(message, activeContext);

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
    failedProviders: [],
    providerErrors: {},
    rateLimitHit: false,
    geminiCallCount: 0,
    openrouterCallCount: 0,
    groqCallCount: 0,
    mockCallCount: 0,
    timeoutHit: false,
    safeFallbackUsed: false,
    followUpMerged: false,
    activeContextSummary,
  };
  providerState.followUpMerged = followUpMerged;
  const deterministicTaste = extractDeterministicTaste(mediaItems, intent, message);
  let deterministicFallbackUsed = false;
  let retrievalPlan: AiRetrievalPlan | null = null;
  let ideationFailedReason: AiRetrievalDebug["ideationFailedReason"] | undefined;
  let parseRepairUsed = false;
  let providerPlanSucceeded = false;

  // ---- Library-based: tamamen deterministik. LLM ranking yok. ----
  if (intent.kind === "library_based") {
    const libSearch = await getCandidates({
      intent,
      retrievalPlan: null,
      profile,
      message,
      mediaItems,
      progressLogs,
    });
    const libRecs = buildLibraryDeterministicRecs(libSearch.candidates);
    const libDebug = buildRetrievalDebug({
      intent,
      plan: null,
      searchDebug: { ...libSearch.debug, finalCandidateCount: libRecs.length },
      refinedPassUsed: false,
      providerFallback: false,
      notes: ["library_deterministic"],
      highRatedSourceCount: deterministicTaste.highRatedSourceCount,
      deterministicTasteSignals: deterministicTaste.signals,
      deterministicFallbackUsed,
    });
    libDebug.ideationFailedReason = "skipped_library_based";
    libDebug.safeFallbackUsed = false;
    const assistantMessage = libRecs.length > 0
      ? `Kütüphanenden devam etmeye uygun ${libRecs.length} öneri hazırladım. Sıralama yerel sinyallerden (durum, ilerleme, son aktivite, favori, puan) deterministik üretildi.`
      : "Kütüphanende devam etmeye uygun (dropped/completed dışı) bir aday bulamadım.";
    return NextResponse.json({
      assistantMessage,
      recommendations: libRecs,
      transparencySummary: buildTransparencySummary(settings),
      intent,
      debug: {
        provider: "library_local",
        selectedProvider: "library_local",
        attemptedProviders: [],
        providerErrors: {},
        rateLimitHit: false,
        failedProviders: [],
        followUpMerged,
        activeContextSummary,
        retrieval: libDebug,
        note: "library_based_deterministic",
      },
    } satisfies AiRecommendResponse);
  }

  // library_based zaten yukarıda erken döndü; buraya yalnızca diğer intent'ler düşer.
  {
    retrievalPlan = await runPlanningWithProviders({
      providers,
      state: providerState,
      message: providerMessage,
      profile,
      intent,
      settings,
    });
    providerPlanSucceeded = !!retrievalPlan;
    if (!retrievalPlan) {
      const codes = Object.values(providerState.providerErrors);
      if (codes.length === 0) ideationFailedReason = "empty_ideas";
      else if (codes.every((c) => c === "rate_limit")) ideationFailedReason = "rate_limit";
      else if (codes.some((c) => c === "parse_error")) ideationFailedReason = "provider_parse_error";
      else if (codes.every((c) => /key_missing/.test(c))) ideationFailedReason = "key_missing";
      else ideationFailedReason = "all_providers_failed";
    }
    if (!retrievalPlan && (intent.kind === "reference_based" || intent.kind === "cross_media_translation")) {
      const deterministicPlan = buildDeterministicFallbackPlan(intent, deterministicTaste);
      if (deterministicPlan) {
        retrievalPlan = deterministicPlan;
        deterministicFallbackUsed = true;
        providerState.safeFallbackUsed = true;
      } else {
        providerState.selectedProvider = "safe_fallback";
        providerState.safeFallbackUsed = true;
        const debug = buildRetrievalDebug({
          intent,
          plan: null,
          refinedPassUsed: false,
          providerFallback: true,
          notes: ["provider_plan_failed_no_external_fallback", "deterministic_taste_signal_missing"],
          highRatedSourceCount: deterministicTaste.highRatedSourceCount,
          deterministicTasteSignals: deterministicTaste.signals,
          deterministicFallbackUsed: false,
        });
        debug.safeFallbackUsed = true;
        debug.ideationFailedReason = ideationFailedReason || "all_providers_failed";
        return NextResponse.json({
          assistantMessage: "Yeterli kütüphane sinyali bulamadım. 1-2 örnek başlık verirsen daha iyi öneririm.",
          recommendations: [],
          transparencySummary: buildTransparencySummary(settings),
          intent,
          debug: {
            provider: "safe_fallback",
            ...providerDebugFields(providerState),
            fallbackReason: providerState.fallbackReason || "safe_fallback",
            retrieval: debug,
          },
        } satisfies AiRecommendResponse);
      }
    }

    retrievalPlan = retrievalPlan || buildFallbackRetrievalPlan(message, intent);
    retrievalPlan = applyIntentGuardrails(retrievalPlan, intent, message);

    if (!providerPlanSucceeded && (intent.kind === "reference_based" || intent.kind === "cross_media_translation")) {
      deterministicFallbackUsed = deterministicFallbackUsed || retrievalPlan.sourceContext === "high_rated_source_items";
    }

    if (retrievalPlan.needsClarification) {
      providerState.selectedProvider = "safe_fallback";
      const debug = buildRetrievalDebug({
        intent,
        plan: retrievalPlan,
        refinedPassUsed: false,
        providerFallback: false,
        highRatedSourceCount: deterministicTaste.highRatedSourceCount,
        deterministicTasteSignals: deterministicTaste.signals,
        deterministicFallbackUsed,
      });
      return NextResponse.json(
        buildClarificationResponse(settings, intent, retrievalPlan, providerState.selectedProvider || "safe_fallback", debug, {
          provider: providerState.selectedProvider || "safe_fallback",
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
  if (deterministicFallbackUsed) {
    debugNotes.push("deterministic_high_rated_source_fallback");
  }

  if (
    !deterministicFallbackUsed &&
    searchResult.candidates.length === 0 &&
    (intent.kind === "reference_based" || intent.kind === "cross_media_translation")
  ) {
    const deterministicPlan = buildDeterministicFallbackPlan(intent, deterministicTaste);
    if (deterministicPlan) {
      retrievalPlan = applyIntentGuardrails(deterministicPlan, intent, message);
      searchResult = await getCandidates({
        intent,
        retrievalPlan,
        profile,
        message,
        mediaItems,
        progressLogs,
      });
      deterministicFallbackUsed = true;
      providerState.safeFallbackUsed = true;
      debugNotes.push("deterministic_high_rated_source_fallback");
    }
  }

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
    providerPlanSucceeded &&
    !deterministicFallbackUsed &&
    !providerState.rateLimitHit &&
    !!retrievalPlan &&
    searchResult.candidates.length === 0;
  let refinedPassUsed = false;

  if (shouldRefine) {
    try {
      const refinedPlan = await runPlanningWithProviders({
        providers,
        state: providerState,
        message: providerMessage,
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
      applyProviderError(providerState, error, undefined, "planning");
    }
  }

  const fallbackSearchUsed = searchResult.candidates.length < 3;
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
    highRatedSourceCount: deterministicTaste.highRatedSourceCount,
    deterministicTasteSignals: deterministicTaste.signals,
    deterministicFallbackUsed,
  });
  retrievalDebug.ideationFailedReason = ideationFailedReason;
  retrievalDebug.safeFallbackUsed = false;
  retrievalDebug.parseRepairUsed = false;

  if (candidates.length === 0) {
    providerState.selectedProvider = "safe_fallback";
    providerState.safeFallbackUsed = true;
    retrievalDebug.safeFallbackUsed = true;
    let baseMsg = buildEmptyPoolMessage(retrievalPlan, intent, profile, retrievalDebug.notes || []);
    if (deterministicFallbackUsed) {
      baseMsg = providerPlanSucceeded
        ? "İlk arama aday bulamadığı için kütüphane sinyallerinden düşük güvenli aday aradım ama doğrulanmış aday bulamadım."
        : "AI sağlayıcıları sağlıklı plan üretemediği için kütüphane sinyallerinden düşük güvenli aday aradım ama doğrulanmış aday bulamadım.";
    } else if (deterministicTaste.highRatedSourceCount > 0 && /yeterli/i.test(baseMsg)) {
      const targets = (retrievalPlan?.targetMediaTypes || intent.targetTypes).map(targetLabel).join(", ") || "hedef tür";
      baseMsg = `${targets} tarafında yüksek puanlı kaynak kayıtlarından sinyal çıkardım ama doğrulanmış aday bulamadım.`;
    }
    if (ideationFailedReason && ideationFailedReason !== "skipped_library_based") {
      baseMsg = `${baseMsg} (AI plan üretilemedi: ${ideationFailedReason}. Daha net bir tür/mood verirsen yeniden deneyebilirim.)`;
    }
    const empty: AiRecommendResponse = {
      assistantMessage: baseMsg,
      recommendations: [],
      transparencySummary: buildTransparencySummary(settings),
      intent,
      debug: {
        provider: providerState.selectedProvider || "safe_fallback",
        ...providerDebugFields(providerState),
        note: "empty candidate pool",
        retrieval: retrievalDebug,
      },
    };
    if (providerState.rateLimitHit) {
      empty.assistantMessage = `${empty.assistantMessage} ${PROVIDER_RATE_LIMIT_MESSAGE}`.trim();
    }
    return NextResponse.json(empty);
  }

  try {
    const response = await runRankingWithProviders({
      providers,
      state: providerState,
      message: providerMessage,
      profile,
      intent,
      settings,
      candidates,
      retrievalPlan,
      recentContext: body.recentContext,
    });
    parseRepairUsed = response.debug?.note === "json_parse_repair_used";
    const usedMock = providerState.selectedProvider === "mock";
    if (usedMock && Object.keys(providerState.providerErrors).length > 0) {
      retrievalDebug.safeFallbackUsed = true;
    }
    if (parseRepairUsed) retrievalDebug.parseRepairUsed = true;

    if (deterministicFallbackUsed) {
      const deterministicMsg = providerPlanSucceeded
        ? "İlk arama aday bulamadığı için kütüphane sinyallerinden düşük güvenli öneriler hazırladım."
        : "AI sağlayıcıları sağlıklı plan üretemediği için kütüphane sinyallerinden düşük güvenli öneriler hazırladım.";
      response.assistantMessage = `${deterministicMsg} ${response.assistantMessage}`.trim();
    }

    // Cross-media veya reference-based + zayıf havuz → düşük güven mesajı
    if (fallbackSearchUsed && !deterministicFallbackUsed) {
      const lowConfNote =
        intent.kind === "cross_media_translation"
          ? " (Düşük güven: kaynak zevkini hedef türe çevirmek için yeterli sinyal yok. Sevdiğin 1-2 örnek başlık verirsen daha iyi öneri çıkartabilirim.)"
          : intent.kind === "reference_based"
          ? " (Düşük güven: referansa yakın aday havuzu zayıf — daha geniş eş anlamlı arama kullanıldı.)"
          : "";
      if (lowConfNote) {
        response.assistantMessage = `${response.assistantMessage}${lowConfNote}`.trim();
      }
    }

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
    applyProviderError(providerState, err, undefined, "ranking");
    providerState.selectedProvider = "mock";
    providerState.safeFallbackUsed = true;

    const fallback = await mockProvider.generate({
      message: providerMessage,
      profile,
      intent,
      settings,
      candidates,
      retrievalPlan,
    });
    retrievalDebug.safeFallbackUsed = true;
    fallback.debug = {
      provider: "mock",
      ...providerDebugFields(providerState),
      fellBackToMock: true,
      note: err instanceof Error ? err.message : "unknown error",
      retrieval: { ...retrievalDebug, providerFallback: true },
    };
    if (providerState.rateLimitHit) {
      fallback.assistantMessage = `${PROVIDER_RATE_LIMIT_MESSAGE} ${fallback.assistantMessage}`.trim();
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





