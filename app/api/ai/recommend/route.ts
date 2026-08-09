// ============================================
// POST /api/ai/recommend
// ============================================
// 1) Intent analiz, 2) Library profile, 3) LLM-guided retrieval planning,
// 4) dogrulanmis aday toplama, 5) Provider'a siralat. Provider hata verirse
// mock fallback yalnizca dogrulanmis aday havuzunu kullanir.

import { NextRequest, NextResponse } from "next/server";
import { getPlanningProviderPolicy, getProviderSequence, mockProvider } from "@/lib/ai/provider";
import { buildLibraryProfile } from "@/lib/ai/profile-builder";
import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import { scoreCandidates } from "@/lib/ai/candidate-scorer";
import { applyFeedbackAwareScoring } from "@/lib/ai/feedback-aware-scorer";
import { buildCandidateFeatureVectors } from "@/lib/ai/hybrid-feature-builder";
import { applyHybridScoring } from "@/lib/ai/hybrid-scorer";
import { buildCandidateEmbeddingText } from "@/lib/ai/embedding-text-builder";
import {
  applyEmbeddingSimilarityScoring,
  buildEmbeddingSimilarityProfilePayloads,
} from "@/lib/ai/embedding-similarity-scorer";
import { embedManyWithFallback } from "@/lib/ai/embedding-provider";
import { buildAiEngineStatus, retainVerifiedRecommendations } from "@/lib/ai/engine-status";
import { applyTextSimilarityScoring } from "@/lib/ai/text-similarity-scorer";
import {
  CandidateSearchResult,
  CandidateVerificationResult,
  applyRankedTagCandidatePoolGate,
  searchCandidatesWithDebug,
  searchSourceApiCandidates,
  searchWebResearchCandidates,
  dedupeCandidates,
} from "@/lib/ai/candidate-search";
import { expandTargetFamily, familyLabel } from "@/lib/ai/target-family";
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
  AiEngineProvider,
  AiProviderPolicyMode,
  RankedTagNoResultReason,
} from "@/lib/ai/types";
import { MediaType } from "@/lib/types";
import { prepareProviderEvidencePipeline, type ProviderEvidencePipelineResult } from "@/features/recommendations/providers/pipeline";
import { emptyProviderRequestTelemetry, mergeProviderRequestTelemetry } from "@/features/recommendations/providers/request-policy";
import {
  DETERMINISTIC_RECOMMENDATION_V2_ENABLED,
  runDeterministicRecommendationV2WithShadowSeed,
  type DeterministicRecommendationV2Input,
} from "@/features/recommendations/orchestration";
import { decodeRecommendationRequestV2, RECOMMENDATION_REQUEST_LIMITS, type RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import { evaluateRequestEvidenceCapabilities } from "@/features/recommendations/domain/evidence-capability";
import { availableSemanticVerifierModes } from "@/features/recommendations/evidence";
import { decodeRecommendationFeedbackEventV2 } from "@/features/recommendations/feedback";
import { applyStructuredRequestToRetrievalPlan } from "@/features/recommendations/intent/retrieval-guardrails";
import { ASPECT_REGISTRY } from "@/features/recommendations/domain/aspect-registry";
import { userFacingRankedTagNoResult } from "@/features/recommendations/ui/user-facing-text";
import { nextPostResponseTaskScheduler, resolveResearchRolloutExecution, scheduleGroundedResearchShadow } from "@/features/recommendations/research/server";
import { runActiveGroundedRecommendation } from "@/features/recommendations/research/active/service";
import { resolveAiEntitlement } from "@/lib/ai/entitlement";
import {
  AI_REQUEST_MAX_BYTES,
  apiError,
  enforceRateLimit,
  readStrictJsonObject,
} from "@/lib/api/request-security";

export const runtime = "nodejs";

const PROVIDER_RATE_LIMIT_MESSAGE =
  "Sağlayıcı yanıt vermedi, teknik detayları panelde görebilirsin.";
const ALL_PROVIDERS_MOCK_MESSAGE =
  "Sağlayıcı yanıt vermedi, teknik detayları panelde görebilirsin.";

function resolveRankedTagNoResultReason(
  searchResult: CandidateSearchResult,
  response: AiRecommendResponse,
): RankedTagNoResultReason | undefined {
  const telemetry = searchResult.debug.rankedTagRetrieval;
  if (!telemetry || telemetry.ranked_tag_constraints === 0 || response.recommendations.length > 0 || (response.nearMatches?.length ?? 0) > 0) return undefined;
  if (telemetry.noResultReason) return telemetry.noResultReason;
  const reasons = new Set((response.rejectedCandidates ?? []).map((item) => item.reason));
  if (reasons.has("candidates_failed_avoid")) return "candidates_failed_avoid";
  if (reasons.has("candidates_failed_objective")) return "candidates_failed_objective";
  const bands = [...(searchResult.internal?.rankedTagTraceByCandidateKey.values() ?? [])].map((trace) => trace.rankBand);
  if (bands.length > 0 && bands.every((band) => band === "20-39" || band === "below-20" || band === "unknown")) {
    return "candidates_below_tag_rank";
  }
  return "candidates_failed_ranked_tag_confidence";
}

// R19: `PROVIDER_PLAN_FAILED_MESSAGE` artık tüketilmiyor — bir önceki
// fallback yolunda kullanılıyordu, akış değişince çağrı düştü. Davranış
// etkisi yok; ölü kod kaldırıldı.
const PROVIDER_TIMEOUT_MS = 25000;
const AI_RECOMMEND_ALLOWED_FIELDS = new Set([
  "message", "mediaItems", "progressLogs", "settings", "recentContext", "activeContext",
  "researchMode", "scopeMode", "dismissed", "recommendationFeedback",
  "recommendationFeedbackV2", "structuredRequestV2",
]);

type ProviderErrorCode =
  | GeminiProviderErrorCode
  | CompatibleProviderErrorCode
  | "timeout";

interface ProviderRunState {
  attemptedProviders: string[];
  attemptedPlanningProviders: AiEngineProvider[];
  selectedProvider?: string;
  planningProvider?: AiEngineProvider;
  providerPolicyMode: AiProviderPolicyMode;
  configuredPlanningProvider?: AiEngineProvider;
  openAiPreferenceApplied: boolean;
  planningFallbackUsed: boolean;
  failedProviders: { provider: string; stage: "planning" | "ranking"; error: string }[];
  providerErrors: Record<string, string>;
  providerError?: ProviderErrorCode;
  rateLimitHit: boolean;
  fallbackReason?: string;
  useOpenAIProvider: boolean;
  openaiCallCount: number;
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

// R19: `localOnlyCandidates` artık çağrılmıyordu — sessizce ölü kod kalmıştı.
// Library puanlı/aktif sıralaması başka bir yolda yapılıyor. Davranış etkisi
// yok; sadece unused-vars uyarısı temizlendi.

interface DeterministicTaste {
  highRatedSourceCount: number;
  signals: string[];
  queries: string[];
  sourceTitles: string[];
  excludedSourceTitles: string[];
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

function dedupeText(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeTitleForMatch(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function normalizeTitleForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTokenCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function isCloseSourceTitleMatch(value: string, sourceTitle: string): boolean {
  const normalizedValue = normalizeTitleForMatch(value);
  const normalizedSource = normalizeTitleForMatch(sourceTitle);
  if (!normalizedValue || !normalizedSource || normalizedValue.length < 3 || normalizedSource.length < 3) {
    return false;
  }
  if (normalizedValue === normalizedSource) return true;
  if (normalizedValue.includes(normalizedSource)) return true;
  return (
    normalizedSource.includes(normalizedValue) &&
    normalizedTokenCount(normalizedValue) >= 2 &&
    normalizedValue.length / normalizedSource.length >= 0.6
  );
}

function buildExcludedSourceTitles(sourceTitles: string[]): string[] {
  return dedupeText(sourceTitles);
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
  const sourceTitles = dedupeText([
    ...sourceItems.map((item) => item.title).filter(Boolean),
    ...intent.references,
  ]);

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
    if (/court|noble|king|queen|empire|throne|intrigue/i.test(text)) addSignal(signals, "court intrigue");
    if (/morally gray|moral|antihero|betrayal|throne|power|war/i.test(text)) addSignal(signals, "morally gray");
    if (/thriller|crime|mystery|suspense/i.test(text)) addSignal(signals, "thriller");
  }

  const referenceText = `${sourceTitles.join(" ")} ${message}`.toLowerCase();
  if (/romantik|romance|romantic/i.test(referenceText)) addSignal(signals, "romance");
  if (/action|aksiyon/i.test(referenceText)) addSignal(signals, "action");
  if (/fantasy|fantastik/i.test(referenceText)) addSignal(signals, "fantasy");
  if (/dark|karanl/i.test(referenceText)) addSignal(signals, "dark");

  const signalList = [...signals].slice(0, 14);
  return {
    highRatedSourceCount: sourceItems.length,
    signals: signalList,
    queries: buildDeterministicQueries(intent.targetTypes, signalList),
    sourceTitles,
    excludedSourceTitles: buildExcludedSourceTitles(sourceTitles),
  };
}

function buildDeterministicQueries(targetTypes: MediaType[], signals: string[]): string[] {
  const has = (value: string) => signals.some((s) => s.includes(value));
  const target = targetTypes[0];
  const queries: string[] = [];
  const push = (query: string) => {
    if (!queries.includes(query)) queries.push(query);
  };

  if (target === "book") {
    if (has("fantasy")) push("epic fantasy novel");
    if (has("political") || has("power struggle") || has("intrigue") || has("court intrigue")) {
      push("political fantasy novel");
    }
    if (has("dark")) push("dark fantasy novel");
    if (has("power struggle")) push("power struggle fantasy");
    if (has("court intrigue") || has("intrigue")) push("court intrigue fantasy");
    if (has("morally gray") || has("dark") || has("political")) push("morally gray fantasy novel");
    if (has("drama")) push("fantasy drama novel");
  } else if (target === "anime") {
    if ((has("action") || has("fantasy")) && has("romance")) push("action fantasy romance");
    if (has("fantasy") && has("romance")) push("fantasy romance adventure");
    if (has("power progression")) push("power progression fantasy");
    if (has("dungeon")) push("dungeon fantasy anime");
    if (has("game system")) push("game system fantasy");
    if (has("romance")) push("romantic anime");
    if (has("fantasy")) push("epic fantasy anime");
    if (has("political") || has("power struggle")) push("political fantasy anime");
    if (has("dark")) push("dark fantasy anime");
  } else if (target === "tv") {
    if (has("fantasy")) push("epic fantasy");
    if (has("political") || has("power struggle")) push("political drama");
    if (has("dark")) push("dark drama");
  } else if (target === "movie") {
    if (has("fantasy")) push("epic fantasy");
    if (has("political") || has("power struggle")) push("political thriller");
    if (has("dark")) push("dark fantasy");
  } else if (target) {
    if (has("fantasy")) push("fantasy");
    if (has("dark")) push("dark fantasy");
    if (has("drama")) push("drama");
  }

  return [...new Set(queries)].slice(0, target === "book" || target === "anime" ? 6 : 4);
}

function buildDeterministicFallbackPlan(intent: AiIntent, taste: DeterministicTaste): AiRetrievalPlan | null {
  if (taste.queries.length === 0 || intent.targetTypes.length === 0) {
    return null;
  }
  const sourceContext = taste.highRatedSourceCount > 0 ? "high_rated_source_items" : "reference_taste_signals";
  return {
    taskType: intent.kind,
    interpretation: "Provider planning başarısız olduğu için yüksek puanlı kaynak kayıtlarından deterministik düşük güvenli plan üretildi.",
    targetMediaTypes: intent.targetTypes,
    sourceTypes: intent.sourceTypes,
    sourceContext,
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
    `web araştırması ${s.useWebResearch ? "açık" : "kapalı"}`,
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
  const usesSourceAsTaste =
    intent.kind === "reference_based" || intent.kind === "cross_media_translation";
  if (refs.length > 0 && !usesSourceAsTaste) return refs.slice(0, 3);

  const cleaned = message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/öner|tavsiye|ister|istiyorum|lazım/i.test(w))
    .slice(0, 5)
    .join(" ")
    .trim();
  return cleaned ? [cleaned] : [];
}

function isTasteSignalIntent(intent: AiIntent): boolean {
  return intent.kind === "reference_based" || intent.kind === "cross_media_translation";
}

function isDirectSourceTitleQuery(query: string, sourceTitles: string[]): boolean {
  return sourceTitles.some((title) => isCloseSourceTitleMatch(query, title));
}

function mergeQueries(primary: string[], secondary: string[]): string[] {
  return dedupeText([...primary, ...secondary]).slice(0, 6);
}

function sanitizeTasteSignalQueries(
  queries: string[],
  intent: AiIntent,
  taste?: DeterministicTaste
): string[] {
  if (!isTasteSignalIntent(intent)) return dedupeText(queries).slice(0, 6);
  const sourceTitles = taste ? taste.excludedSourceTitles : intent.references;
  return dedupeText(queries).filter((query) => !isDirectSourceTitleQuery(query, sourceTitles)).slice(0, 6);
}

function planHasDirectTitleQuery(plan: AiRetrievalPlan | null, sourceTitles: string[]): boolean {
  if (!plan || sourceTitles.length === 0) return false;
  return plan.searchPlans.some((p) => p.queries.some((query) => isDirectSourceTitleQuery(query, sourceTitles)));
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

function applyIntentGuardrails(
  plan: AiRetrievalPlan,
  intent: AiIntent,
  message: string,
  taste?: DeterministicTaste
): AiRetrievalPlan {
  if (intent.targetTypes.length === 0) return plan;

  const forcedTargets = intent.targetTypes;
  const deterministicQueries = sanitizeTasteSignalQueries(taste?.queries || [], intent, taste);
  const fallback = sanitizeTasteSignalQueries(fallbackQueries(message, intent), intent, taste);
  const queries = deterministicQueries.length > 0 ? deterministicQueries : fallback;
  const guardedPlans = plan.searchPlans
    .filter((p) => forcedTargets.includes(p.mediaType) && isSourceCompatible(p.mediaType, p.source))
    .map((p) => {
      const sanitized = sanitizeTasteSignalQueries(p.queries, intent, taste);
      const nextQueries = isTasteSignalIntent(intent)
        ? mergeQueries(queries, sanitized)
        : sanitized.length > 0 ? sanitized : queries;
      return { ...p, queries: nextQueries };
    })
    .filter((p) => p.queries.length > 0);

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
    useOpenAIProvider: state.useOpenAIProvider,
    openaiCallCount: state.openaiCallCount,
    geminiCallCount: state.geminiCallCount,
    openrouterCallCount: state.openrouterCallCount,
    groqCallCount: state.groqCallCount,
    providerCallCounts: {
      openai: state.openaiCallCount,
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

function enginePlanningFields(state: ProviderRunState): Pick<NonNullable<AiRecommendResponse["engineStatus"]>,
  | "planningProvider"
  | "attemptedPlanningProviders"
  | "providerPolicyMode"
  | "configuredPlanningProvider"
  | "openAiPreferenceApplied"
  | "planningFallbackUsed"
> {
  return {
    planningProvider: state.planningProvider,
    attemptedPlanningProviders: [...state.attemptedPlanningProviders],
    providerPolicyMode: state.providerPolicyMode,
    configuredPlanningProvider: state.configuredPlanningProvider,
    openAiPreferenceApplied: state.openAiPreferenceApplied,
    planningFallbackUsed: state.planningFallbackUsed,
  };
}

function recordProviderAttempt(state: ProviderRunState, providerName: string) {
  if (!state.attemptedProviders.includes(providerName)) {
    state.attemptedProviders.push(providerName);
  }
  if (providerName === "openai") state.openaiCallCount += 1;
  else if (providerName === "gemini") state.geminiCallCount += 1;
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
      if (!args.state.attemptedPlanningProviders.includes(provider.name as AiEngineProvider)) {
        args.state.attemptedPlanningProviders.push(provider.name as AiEngineProvider);
      }
      const plan = await withProviderTimeout(provider.name, provider.generateRetrievalPlan({
          message: args.message,
          profile: args.profile,
          intent: args.intent,
          settings: args.settings,
        })
      );
      args.state.planningProvider = provider.name as AiEngineProvider;
      if (provider.name === "mock" && args.state.providerPolicyMode === "auto") {
        args.state.planningFallbackUsed = true;
      }
      return plan;
    } catch (error) {
      args.state.planningFallbackUsed = true;
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
    case "light_novel": return "Light Novel";
    case "web_novel": return "Web Novel";
    case "visual_novel": return "Visual Novel";
    case "tv": return "Dizi";
    case "anime": return "Anime";
    case "manga": return "Manga";
    case "manhwa": return "Manhwa";
    case "manhua": return "Manhua";
    case "movie": return "Film";
  }
}

function cleanPromptLabel(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function buildPolishedAssistantMessage(args: {
  message: string;
  count: number;
  researchMode?: string;
  providerIssue?: boolean;
}): string {
  const prompt = cleanPromptLabel(args.message);
  if (args.providerIssue) {
    return args.count > 0
      ? `${PROVIDER_RATE_LIMIT_MESSAGE} İsteğini "${prompt}" olarak yorumladım ve ${args.count} öneri hazırladım.`
      : PROVIDER_RATE_LIMIT_MESSAGE;
  }
  if (args.count === 0) {
    return "Bu kapsamda uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.";
  }
  if (args.researchMode === "source-apis") {
    return `İsteğini "${prompt}" olarak yorumladım. Kaynaklardan doğrulanmış ${args.count} öneri buldum.`;
  }
  if (args.researchMode === "web") {
    return `İsteğini "${prompt}" olarak yorumladım. Web araştırması ve kaynak doğrulamasıyla ${args.count} öneri buldum.`;
  }
  if (args.researchMode === "library-only") {
    return `İsteğini "${prompt}" olarak yorumladım. Sadece kütüphanen içinden ${args.count} öneri seçtim.`;
  }
  return `İsteğini "${prompt}" olarak yorumladım. Kütüphanendeki sinyallere göre ${args.count} öneri hazırladım.`;
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
    return "Bu kapsamda uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.";
  }

  if (notes.some((n) => n.startsWith("tv_mood_discovery_weak"))) {
    return "Bu kapsamda uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.";
  }

  if (!hasProfileSourceData(profile, plan.sourceTypes)) {
    const sources = plan.sourceTypes.map(targetLabel).join(", ");
    return `${sources} tarafında yeterli sinyal bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`;
  }

  const targets = plan.targetMediaTypes.map(targetLabel).join(", ");
  return `${targets} tarafında uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`;
}

async function getCandidates(args: {
  intent: AiIntent;
  retrievalPlan: AiRetrievalPlan | null;
  profile: ReturnType<typeof buildLibraryProfile> | null;
  message: string;
  mediaItems: AiRecommendRequest["mediaItems"];
  progressLogs: AiRecommendRequest["progressLogs"];
  structuredRequest?: RecommendationRequestV2;
  researchRescue?: boolean;
}): Promise<CandidateSearchResult> {
  return searchCandidatesWithDebug({
    intent: args.intent,
    retrievalPlan: args.retrievalPlan,
    profile: args.profile,
    message: args.message,
    mediaItems: args.mediaItems,
    progressLogs: args.progressLogs,
    structuredRequest: args.structuredRequest,
    researchRescue: args.researchRescue,
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
  sourceTitles?: string[];
  excludedSourceTitles?: string[];
  tasteSignalQueries?: string[];
  directTitleQueryUsed?: boolean;
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
    sourceTitles,
    excludedSourceTitles,
    tasteSignalQueries,
    directTitleQueryUsed,
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
    rankedTagRetrieval: searchDebug?.rankedTagRetrieval,
    providerRequests: searchDebug?.providerRequests,
    highRatedSourceCount: highRatedSourceCount || 0,
    deterministicTasteSignals: deterministicTasteSignals || [],
    deterministicFallbackUsed: Boolean(deterministicFallbackUsed),
    sourceTitles: sourceTitles || [],
    excludedSourceTitles: excludedSourceTitles || [],
    tasteSignalQueries: tasteSignalQueries || [],
    directTitleQueryUsed: Boolean(directTitleQueryUsed),
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

function mergeCandidateSearchTelemetry(
  searchResult: CandidateSearchResult,
  external: {
    executedQueries?: CandidateSearchResult["debug"]["executedQueries"];
    sourceCandidateCounts?: Record<string, number>;
    providerRequests?: CandidateSearchResult["debug"]["providerRequests"];
  }
) {
  if (external.executedQueries?.length) {
    searchResult.debug.executedQueries.push(...external.executedQueries);
  }
  for (const [source, count] of Object.entries(external.sourceCandidateCounts || {})) {
    searchResult.debug.sourceCandidateCounts[source] =
      (searchResult.debug.sourceCandidateCounts[source] || 0) + count;
  }
  for (const [provider, telemetry] of Object.entries(external.providerRequests || {})) {
    if (!telemetry) continue;
    const typedProvider = provider as keyof NonNullable<CandidateSearchResult["debug"]["providerRequests"]>;
    const current = searchResult.debug.providerRequests?.[typedProvider]
      ?? emptyProviderRequestTelemetry(typedProvider);
    if (!searchResult.debug.providerRequests) searchResult.debug.providerRequests = {};
    searchResult.debug.providerRequests[typedProvider] = mergeProviderRequestTelemetry(current, telemetry);
  }
}

function filterDismissedCandidates(
  candidates: AiCandidate[],
  dismissedRaw: unknown[]
): { candidates: AiCandidate[]; suppressed: number; keyCount: number; titleTypeCount: number } {
  const dismissedKeys = new Set<string>();
  for (const d of dismissedRaw) {
    if (d && typeof d === "object") {
      const item = d as { externalSource?: unknown; externalId?: unknown };
      if (item.externalSource && item.externalId) {
        dismissedKeys.add(`${String(item.externalSource)}:${String(item.externalId)}`);
      }
    }
  }
  if (dismissedKeys.size === 0) {
    return { candidates, suppressed: 0, keyCount: 0, titleTypeCount: 0 };
  }
  let suppressed = 0;
  const filtered = candidates.filter((c) => {
    const keyHit = dismissedKeys.has(`${c.source}:${c.externalId}`);
    if (keyHit) {
      suppressed++;
      return false;
    }
    return true;
  });
  return {
    candidates: filtered,
    suppressed,
    keyCount: dismissedKeys.size,
    titleTypeCount: 0,
  };
}

function worldForCandidate(c: AiCandidate): "east" | "screen" | "arch" | "other" {
  if (["anime", "manga", "manhwa", "manhua", "light_novel", "web_novel", "visual_novel"].includes(c.type)) return "east";
  if (c.type === "tv" || c.type === "movie") return "screen";
  if (c.type === "book") return "arch";
  return "other";
}

function balanceOnePerWorld(candidates: AiCandidate[]): AiCandidate[] {
  const picked = new Set<string>();
  const firstPass: AiCandidate[] = [];
  for (const world of ["east", "screen", "arch"] as const) {
    const hit = candidates.find((c) => worldForCandidate(c) === world && !picked.has(`${c.source}:${c.externalId}`));
    if (hit) {
      picked.add(`${hit.source}:${hit.externalId}`);
      firstPass.push(hit);
    }
  }
  return [...firstPass, ...candidates.filter((c) => !picked.has(`${c.source}:${c.externalId}`))];
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

function isExcludedSourceCandidate(candidateTitle: string, excludedSourceTitles: string[]): boolean {
  return excludedSourceTitles.some((title) => isCloseSourceTitleMatch(candidateTitle, title));
}

function applySourceTitleExclusion(
  result: CandidateSearchResult,
  excludedSourceTitles: string[],
  notes: string[]
): CandidateSearchResult {
  if (excludedSourceTitles.length === 0 || result.candidates.length === 0) return result;
  const before = result.candidates.length;
  const candidates = result.candidates.filter((candidate) => (
    !isExcludedSourceCandidate(candidate.title, excludedSourceTitles)
  ));
  const removed = before - candidates.length;
  if (removed <= 0) return result;

  notes.push("source_title_or_franchise_excluded");
  const filterSummary = result.debug.filterSummary;
  return {
    ...result,
    candidates,
    debug: {
      ...result.debug,
      filterSummary: {
        before: filterSummary.before,
        after: Math.max(0, filterSummary.after - removed),
        removed: filterSummary.removed + removed,
        reasons: {
          ...filterSummary.reasons,
          source_title_or_franchise: (filterSummary.reasons.source_title_or_franchise || 0) + removed,
        },
      },
      finalCandidateCount: candidates.length,
      notes: [...result.debug.notes, "source_title_or_franchise_excluded"],
    },
  };
}

export async function POST(req: NextRequest) {
  const requestStartedAt = performance.now();
  const stageLatencyMs: NonNullable<AiRetrievalDebug["latencyMs"]> = {};
  const parsed = await readStrictJsonObject(req, AI_RECOMMEND_ALLOWED_FIELDS, AI_REQUEST_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as unknown as AiRecommendRequest;
  const entitlement = await resolveAiEntitlement(req);
  const rateLimit = enforceRateLimit("ai:recommend", entitlement.rateLimitIdentity, 20, 60_000);
  if (rateLimit) return rateLimit;

  const message = (body.message || "").trim();
  if (!message || message.length > RECOMMENDATION_REQUEST_LIMITS.queryText) {
    return apiError("recommend_message_invalid", 400);
  }
  const activeContext = body.activeContext;
  const followUpMerged = Boolean(activeContext?.followUpMerged);
  const activeContextSummary = summarizeActiveContext(activeContext);
  const providerMessage = buildProviderMessage(message, activeContext);
  const dismissedRaw = Array.isArray(body.dismissed) ? body.dismissed : [];
  const recommendationFeedback = Array.isArray(body.recommendationFeedback)
    ? body.recommendationFeedback
    : [];
  const structuredRequest = body.structuredRequestV2 === undefined
    ? null
    : decodeRecommendationRequestV2(body.structuredRequestV2);
  if (structuredRequest && !structuredRequest.ok) {
    return NextResponse.json({ code: "structured_request_invalid", issues: structuredRequest.issues }, { status: 400 });
  }
  if (structuredRequest?.ok) {
    const capabilityValidation = evaluateRequestEvidenceCapabilities({
      request: structuredRequest.value,
      availableVerifierModes: availableSemanticVerifierModes(),
    });
    if (capabilityValidation.issues.length > 0) {
      return NextResponse.json({
        code: "structured_request_capability_invalid",
        issues: capabilityValidation.issues,
        capabilities: capabilityValidation.capabilities,
      }, { status: 422 });
    }
  }
  const recommendationFeedbackV2 = Array.isArray(body.recommendationFeedbackV2)
    ? body.recommendationFeedbackV2.flatMap((event) => {
        const decoded = decodeRecommendationFeedbackEventV2(event);
        return decoded.ok ? [decoded.value] : [];
      }).slice(-1000)
    : [];

  const settings: AiSettings = {
    ...(body.settings || {}),
    useOpenAIProvider: entitlement.canUseOpenAi && body.settings?.useOpenAIProvider === true,
  } as AiSettings;
  const mediaItems = Array.isArray(body.mediaItems) ? body.mediaItems : [];
  const progressLogs = Array.isArray(body.progressLogs) ? body.progressLogs : [];
  const interpretationStartedAt = performance.now();
  let intent = analyzeIntent(message);
  if (structuredRequest?.ok) {
    intent = {
      ...intent,
      targetTypes: [...structuredRequest.value.targetMediaTypes],
      references: structuredRequest.value.references.map((reference) => reference.state === "verified" ? reference.titleSnapshot : reference.titleText),
      avoid: structuredRequest.value.aspectConstraints.filter((constraint) => constraint.role === "avoid").map((constraint) => constraint.aspectId),
    };
  }
  stageLatencyMs.interpretation = Number((performance.now() - interpretationStartedAt).toFixed(2));
  const researchMode = (body as { researchMode?: string }).researchMode || "library-only";
  if (researchMode !== "library-only" && !entitlement.canUseServerProviders) {
    return apiError("ai_server_provider_forbidden", 403);
  }
  const scopeMode = (body as { scopeMode?: string }).scopeMode as
    | "mixed"
    | "east"
    | "screen"
    | "arch"
    | "one-per-world"
    | undefined;
  const profile = settings?.useProfile
    ? buildLibraryProfile(mediaItems, progressLogs, settings)
    : null;
  const providers = getProviderSequence(settings);
  const planningPolicy = getPlanningProviderPolicy(settings);
  const providerState: ProviderRunState = {
    attemptedProviders: [],
    attemptedPlanningProviders: [],
    failedProviders: [],
    providerErrors: {},
    rateLimitHit: false,
    useOpenAIProvider: Boolean(settings?.useOpenAIProvider),
    providerPolicyMode: planningPolicy.providerPolicyMode,
    configuredPlanningProvider: planningPolicy.configuredPlanningProvider,
    openAiPreferenceApplied: planningPolicy.openAiPreferenceApplied,
    planningFallbackUsed: false,
    openaiCallCount: 0,
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

  // ---- Library-only: tamamen deterministik. LLM/dış kaynak yok. ----
  if (researchMode === "library-only") {
    const libraryIntent: AiIntent = { ...intent, kind: "library_based" };
    const libSearch = await getCandidates({
      intent: libraryIntent,
      retrievalPlan: null,
      profile,
      message,
      mediaItems,
      progressLogs,
    });
    const dismissedLib = filterDismissedCandidates(libSearch.candidates, dismissedRaw);
    const libRecs = buildLibraryDeterministicRecs(dismissedLib.candidates);
    const structuredLibraryHardConstraint = structuredRequest?.ok
      ? structuredRequest.value.aspectConstraints.some((constraint) => constraint.role === "must")
        || structuredRequest.value.objectiveConstraints.some((constraint) => constraint.role === "must")
      : false;
    const safeLibraryRecs = structuredLibraryHardConstraint ? [] : libRecs;
    const libDebug = buildRetrievalDebug({
      intent: libraryIntent,
      plan: null,
      searchDebug: { ...libSearch.debug, finalCandidateCount: safeLibraryRecs.length },
      refinedPassUsed: false,
      providerFallback: false,
      notes: [
        "library_only_deterministic",
        `r45_feedback_suppressed:n=${dismissedLib.suppressed} keys=${dismissedLib.keyCount} titleTypes=${dismissedLib.titleTypeCount}`,
      ],
      highRatedSourceCount: deterministicTaste.highRatedSourceCount,
      deterministicTasteSignals: deterministicTaste.signals,
      deterministicFallbackUsed,
      sourceTitles: deterministicTaste.sourceTitles,
      excludedSourceTitles: deterministicTaste.excludedSourceTitles,
      tasteSignalQueries: deterministicTaste.queries,
      directTitleQueryUsed: false,
    });
    libDebug.ideationFailedReason = "skipped_library_based";
    libDebug.safeFallbackUsed = false;
    const assistantMessage = structuredLibraryHardConstraint
      ? "Kütüphane adaylarında zorunlu koşulları doğrulayacak provider kanıtı yok; koşullar otomatik gevşetilmedi. Kaynak API kapsamını seçebilirsin."
      : safeLibraryRecs.length > 0
        ? `Kütüphanenden devam etmeye uygun ${safeLibraryRecs.length} öneri seçtim.`
        : "Kütüphanende bu isteğe uygun aday bulamadım.";
    return NextResponse.json({
      assistantMessage,
      recommendations: safeLibraryRecs,
      nearMatches: [],
      transparencySummary: buildTransparencySummary(settings),
      intent: libraryIntent,
      ...(structuredRequest?.ok ? { engineStatus: {
        provider: "deterministic_v2" as const,
        embeddingMode: "disabled" as const,
        providerFallbackUsed: false,
        evaluatedCandidateCount: libSearch.candidates.length,
        sources: ["library" as const],
        feedbackApplied: false,
        feedbackEventCount: recommendationFeedbackV2.length,
        persistentCache: "not_used" as const,
      } } : {}),
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
        note: "library_only_deterministic",
      },
    } satisfies AiRecommendResponse);
  }

  // library-only zaten yukarıda erken döndü; buraya yalnızca dış kaynak/web modları düşer.
  const planningStartedAt = performance.now();
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
      providerState.planningFallbackUsed = true;
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
          sourceTitles: deterministicTaste.sourceTitles,
          excludedSourceTitles: deterministicTaste.excludedSourceTitles,
          tasteSignalQueries: deterministicTaste.queries,
          directTitleQueryUsed: false,
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
    retrievalPlan = applyStructuredRequestToRetrievalPlan(
      applyIntentGuardrails(retrievalPlan, intent, message, deterministicTaste),
      structuredRequest?.ok ? structuredRequest.value : undefined,
    );

    if (!providerPlanSucceeded && (intent.kind === "reference_based" || intent.kind === "cross_media_translation")) {
      deterministicFallbackUsed =
        deterministicFallbackUsed ||
        retrievalPlan.sourceContext === "high_rated_source_items" ||
        retrievalPlan.sourceContext === "reference_taste_signals";
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
        sourceTitles: deterministicTaste.sourceTitles,
        excludedSourceTitles: deterministicTaste.excludedSourceTitles,
        tasteSignalQueries: deterministicTaste.queries,
        directTitleQueryUsed: planHasDirectTitleQuery(retrievalPlan, deterministicTaste.excludedSourceTitles),
      });
      return NextResponse.json(
        buildClarificationResponse(settings, intent, retrievalPlan, providerState.selectedProvider || "safe_fallback", debug, {
          provider: providerState.selectedProvider || "safe_fallback",
          ...providerDebugFields(providerState),
        })
      );
    }
  }
  stageLatencyMs.planning = Number((performance.now() - planningStartedAt).toFixed(2));

  const debugNotes: string[] = [];
  const researchRollout = resolveResearchRolloutExecution();
  const retrievalStartedAt = performance.now();
  let searchResult: CandidateSearchResult = await getCandidates({
    intent,
    retrievalPlan,
    profile,
    message,
    mediaItems,
    progressLogs,
    structuredRequest: structuredRequest?.ok ? structuredRequest.value : undefined,
    researchRescue: researchRollout.activeResearchAllowed,
  });
  searchResult = applySourceTitleExclusion(searchResult, deterministicTaste.excludedSourceTitles, debugNotes);
  if (deterministicFallbackUsed) {
    debugNotes.push("deterministic_taste_signal_fallback");
  }

  if (
    !deterministicFallbackUsed &&
    searchResult.candidates.length === 0 &&
    (intent.kind === "reference_based" || intent.kind === "cross_media_translation")
  ) {
    const deterministicPlan = buildDeterministicFallbackPlan(intent, deterministicTaste);
    if (deterministicPlan) {
      retrievalPlan = applyStructuredRequestToRetrievalPlan(
        applyIntentGuardrails(deterministicPlan, intent, message, deterministicTaste),
        structuredRequest?.ok ? structuredRequest.value : undefined,
      );
      searchResult = await getCandidates({
        intent,
        retrievalPlan,
        profile,
        message,
        mediaItems,
        progressLogs,
        structuredRequest: structuredRequest?.ok ? structuredRequest.value : undefined,
        researchRescue: researchRollout.activeResearchAllowed,
      });
      searchResult = applySourceTitleExclusion(searchResult, deterministicTaste.excludedSourceTitles, debugNotes);
      deterministicFallbackUsed = true;
      providerState.safeFallbackUsed = true;
      debugNotes.push("deterministic_taste_signal_fallback");
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
    !searchResult.debug.rankedTagRetrieval &&
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
        const guardedRefinedPlan = applyStructuredRequestToRetrievalPlan(
          applyIntentGuardrails(refinedPlan, intent, message, deterministicTaste),
          structuredRequest?.ok ? structuredRequest.value : undefined,
        );
        const refinedResultRaw = await getCandidates({
          intent,
          retrievalPlan: guardedRefinedPlan,
          profile,
          message,
          mediaItems,
          progressLogs,
          structuredRequest: structuredRequest?.ok ? structuredRequest.value : undefined,
          researchRescue: researchRollout.activeResearchAllowed,
        });
        const refinedResult = applySourceTitleExclusion(
          refinedResultRaw,
          deterministicTaste.excludedSourceTitles,
          debugNotes
        );
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

  const rankedTagRetrievalOwnedPool = Boolean(searchResult.debug.rankedTagRetrieval);
  const fallbackSearchUsed = !rankedTagRetrievalOwnedPool && searchResult.candidates.length < 3;
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

  // R37 — "Kaynak API'leriyle öner" modunda harici kaynaklardan ek aday topla.
  // Sonuçlar mevcut havuza eklenir ve etkin orchestration scoring/ranking yoluna girer. Boş/eksik
  // kaynaklar (TMDB key eksik, OL down vs.) Promise.allSettled ile yutulur,
  // akış durmaz.
  if (researchMode === "source-apis" && !rankedTagRetrievalOwnedPool) {
    try {
      const sourceApi = await searchSourceApiCandidates({
        intent,
        profile,
        message,
        scopeMode,
        structuredRequest: structuredRequest?.ok ? structuredRequest.value : undefined,
      });
      if (sourceApi.candidates.length > 0) {
        const before = candidates.length;
        candidates = dedupeCandidates([...candidates, ...sourceApi.candidates]);
        const merged = candidates.length - before;
        debugNotes.push(
          `r37_source_apis:scope=${scopeMode || "mixed"} fetched=${sourceApi.candidates.length} merged=${merged}`
        );
        for (const note of sourceApi.notes) debugNotes.push(`r37_${note}`);
      } else {
        debugNotes.push(`r37_source_apis:scope=${scopeMode || "mixed"} empty`);
      }
      // R37.1 — source-apis modunda total aday hâlâ 0 ise net debug işareti.
      if (candidates.length === 0) {
        debugNotes.push("r37_source_candidates_empty");
      }
    } catch (error) {
      // Kaynak API toplaması başarısız olursa mevcut havuzla devam.
      debugNotes.push(
        `r37_source_apis_error:${error instanceof Error ? error.message.slice(0, 80) : "unknown"}`
      );
    }
  } else if (researchMode === "source-apis") {
    debugNotes.push("r37_source_apis_skipped:structured_tag_retrieval_owned_pool");
  }
  if (researchMode === "web" && !rankedTagRetrievalOwnedPool) {
    let webAdded = false;
    try {
      const webResearch = await searchWebResearchCandidates({
        intent,
        profile,
        message,
        scopeMode,
        structuredRequest: structuredRequest?.ok ? structuredRequest.value : undefined,
      });
      mergeCandidateSearchTelemetry(searchResult, webResearch);
      for (const note of webResearch.notes) debugNotes.push(`r44_${note}`);
      if (webResearch.candidates.length > 0) {
        const before = candidates.length;
        candidates = dedupeCandidates([...candidates, ...webResearch.candidates]);
        const merged = candidates.length - before;
        webAdded = merged > 0;
        debugNotes.push(`r44_web_research:fetched=${webResearch.candidates.length} merged=${merged}`);
      } else {
        debugNotes.push("r44_web_research_empty");
      }
    } catch (error) {
      debugNotes.push(
        `r44_web_research_error:${error instanceof Error ? error.message.slice(0, 80) : "unknown"}`
      );
    }

    if (!webAdded) {
      debugNotes.push("r44_web_research_fallback_used:source_apis");
      try {
        const sourceApi = await searchSourceApiCandidates({
          intent,
          profile,
          message,
          scopeMode,
          structuredRequest: structuredRequest?.ok ? structuredRequest.value : undefined,
        });
        mergeCandidateSearchTelemetry(searchResult, sourceApi);
        for (const note of sourceApi.notes) debugNotes.push(`r44_source_api_fallback_${note}`);
        if (sourceApi.candidates.length > 0) {
          const before = candidates.length;
          candidates = dedupeCandidates([...candidates, ...sourceApi.candidates]);
          debugNotes.push(`r44_source_api_fallback:fetched=${sourceApi.candidates.length} merged=${candidates.length - before}`);
        } else {
          debugNotes.push("r44_source_api_fallback_empty");
        }
      } catch (error) {
        debugNotes.push(
          `r44_source_api_fallback_error:${error instanceof Error ? error.message.slice(0, 80) : "unknown"}`
        );
      }
    }
  } else if (researchMode === "web") {
    debugNotes.push("r44_web_research_skipped:structured_tag_retrieval_owned_pool");
  }
  stageLatencyMs.retrieval = Number((performance.now() - retrievalStartedAt).toFixed(2));

  // D6-2/D6-3 — Recommendation-only provider hygiene/evidence sidecar.
  // Snapshot kullanıcı response'una sızmaz; authoritative V2 engine'e verilir.
  let providerEvidenceTelemetry: AiRetrievalDebug["providerEvidence"];
  let providerPipelineResult: ProviderEvidencePipelineResult | undefined;
  let d6ProviderRejected: { title: string; reason: string }[] = [];
  const enrichmentStartedAt = performance.now();
  try {
    const providerPipeline = await prepareProviderEvidencePipeline({
      candidates,
      baseUrl: req.nextUrl.origin,
    });
    candidates = providerPipeline.candidates;
    providerPipelineResult = providerPipeline;
    providerEvidenceTelemetry = providerPipeline.telemetry;
    d6ProviderRejected = [...providerPipeline.rejectedCandidates];
    debugNotes.push(
      `d6_provider_evidence:snapshots=${providerPipeline.telemetry.snapshots} enriched=${providerPipeline.telemetry.enrichedCandidates} cacheHits=${providerPipeline.telemetry.cacheHits} cacheMisses=${providerPipeline.telemetry.cacheMisses}`
    );
    debugNotes.push(
      `d6_tvmaze_anime:confirmed=${providerPipeline.telemetry.tvmaze_anime_excluded} likely=${providerPipeline.telemetry.tvmaze_anime_likely_excluded} unknown=${providerPipeline.telemetry.tvmaze_anime_unknown} kept=${providerPipeline.telemetry.tvmaze_non_anime_kept}`
    );
    debugNotes.push(
      `d6_identity_dedupe:sameProvider=${providerPipeline.telemetry.same_provider_deduped} exactBridge=${providerPipeline.telemetry.exact_bridge_deduped} conflicts=${providerPipeline.telemetry.identity_conflicts}`
    );
  } catch {
    // Evidence zenginleştirmesi fail-soft'tur; mevcut V1 aday havuzu korunur.
    debugNotes.push("d6_provider_evidence_error:fail_soft");
  }
  stageLatencyMs.enrichment = Number((performance.now() - enrichmentStartedAt).toFixed(2));

  const rankedTagGate = applyRankedTagCandidatePoolGate({
    request: structuredRequest?.ok ? structuredRequest.value : undefined,
    candidates,
    evidenceByCandidateKey: providerPipelineResult?.evidenceByCandidateKey ?? new Map(),
    traceByCandidateKey: searchResult.internal?.rankedTagTraceByCandidateKey,
  });
  candidates = rankedTagGate.candidates;
  if (rankedTagGate.rejected.length > 0) d6ProviderRejected.push(...rankedTagGate.rejected);
  if (searchResult.debug.rankedTagRetrieval) {
    searchResult.debug.rankedTagRetrieval.candidates_without_requested_tag += rankedTagGate.candidatesWithoutRequestedTag;
  }
  if (rankedTagGate.candidatesWithoutRequestedTag > 0) {
    debugNotes.push(`ranked_tag_candidate_gate:removed=${rankedTagGate.candidatesWithoutRequestedTag}`);
  }

  // R39/R42 — persistent feedback suppression.
  const dismissedFiltered = filterDismissedCandidates(candidates, dismissedRaw);
  if (dismissedFiltered.suppressed > 0 || dismissedFiltered.keyCount > 0 || dismissedFiltered.titleTypeCount > 0) {
    const beforeFb = candidates.length;
    candidates = dismissedFiltered.candidates;
    debugNotes.push(
      `r39_feedback_suppressed:n=${dismissedFiltered.suppressed} keys=${dismissedFiltered.keyCount} titleTypes=${dismissedFiltered.titleTypeCount} before=${beforeFb} after=${candidates.length}`
    );
  }

  // R37.2 — Aday havuzu politikası: source-apis modunda library kaynağını
  // havuza sokma; intent.targetTypes ve scope filtresini final aday havuzuna
  // uygula. Elenenler rejectedCandidates'a gerekçeyle yazılır.
  const policyRejected: { title: string; reason: string }[] = [...d6ProviderRejected];
  const eastTypes = new Set(["anime", "manga", "manhwa", "manhua", "light_novel", "web_novel", "visual_novel"]);
  const screenTypes = new Set(["tv", "movie"]);
  const archTypes = new Set(["book"]);

  // R40.1 — Aile genişletmesi: intent.targetTypes "manga" ise manhwa/manhua,
  // mesaj "novel" içeriyorsa light/web/visual novel'ı da kabul et. Aile ailenin
  // dışındaki tüm adaylar (TV/film vb.) library-source dahil her yolda elenir.
  const targetFamily = intent.targetTypes.length > 0
    ? expandTargetFamily(intent.targetTypes, message)
    : null;
  const scopeAllow: Set<string> | null =
    scopeMode === "east" ? eastTypes :
    scopeMode === "screen" ? screenTypes :
    scopeMode === "arch" ? archTypes : null;

  const beforePolicy = candidates.length;
  let targetFamilyRejected = 0;
  candidates = candidates.filter((c) => {
    // source-apis modunda library kaynaklı adayları havuza alma
    if ((researchMode === "source-apis" || researchMode === "web") && c.source === "library") {
      policyRejected.push({ title: c.title, reason: "Kütüphanende zaten var (kaynak modu)" });
      return false;
    }
    // intent target type / aile uyuşmazlığı — library-source dahil
    if (targetFamily && !targetFamily.has(c.type)) {
      policyRejected.push({
        title: c.title,
        reason: `İstenen tür ile uyuşmuyor (${c.type})`,
      });
      targetFamilyRejected++;
      return false;
    }
    // scope filtresi
    if (scopeAllow && !scopeAllow.has(c.type)) {
      const scopeLabel = scopeMode === "east" ? "Doğu" : scopeMode === "screen" ? "Kadraj" : "Arşiv";
      policyRejected.push({ title: c.title, reason: `${scopeLabel} kapsamına uymuyor (${c.type})` });
      return false;
    }
    return true;
  });
  if (policyRejected.length > 0 || beforePolicy !== candidates.length) {
    debugNotes.push(
      `r37_2_policy:before=${beforePolicy} after=${candidates.length} rejected=${policyRejected.length} mode=${researchMode || "library-only"} scope=${scopeMode || "-"} target=${intent.targetTypes.join("/") || "-"}`
    );
  }
  // R40.1 — Açık tür-aile filtresi izlemesi (debug). Library-source yolu dahil
  // tüm aday yollarında uygulandığını teyit eder.
  if (targetFamily) {
    debugNotes.push(
      `ai_target_filter:before=${beforePolicy} after=${candidates.length} target=${familyLabel(intent.targetTypes, message)} rejected=${targetFamilyRejected}`
    );
  }
  if ((researchMode === "source-apis" || researchMode === "web") && candidates.length === 0) {
    debugNotes.push(researchMode === "web" ? "web_research_candidates_empty" : "source_api_candidates_empty");
  }

  if (DETERMINISTIC_RECOMMENDATION_V2_ENABLED) {
    const deterministicInput: DeterministicRecommendationV2Input = {
      message: providerMessage,
      intent,
      retrievalPlan,
      settings,
      candidates,
      mediaItems,
      feedback: recommendationFeedback,
      feedbackV2: recommendationFeedbackV2,
      dismissed: body.dismissed,
      structuredRequest: structuredRequest?.ok ? structuredRequest.value : undefined,
      baseUrl: req.nextUrl.origin,
      providerPipeline: providerPipelineResult,
      semanticVerifierMode: process.env.AI_RECOMMENDATION_SEMANTIC_MODE === "local_enhanced" || process.env.AI_RECOMMENDATION_SEMANTIC_MODE === "remote_enhanced"
        ? process.env.AI_RECOMMENDATION_SEMANTIC_MODE
        : "structured_only",
    };
    const execution = researchRollout.activeResearchAllowed
      ? (await runActiveGroundedRecommendation({ engineInput: deterministicInput, requestId: `d7-r6a1:${crypto.randomUUID()}`, signal: req.signal })).execution
      : await runDeterministicRecommendationV2WithShadowSeed(deterministicInput);
    const response = execution.response;
    if (response.engineStatus) {
      response.engineStatus = { ...response.engineStatus, ...enginePlanningFields(providerState) };
    }
    const existing = new Set((response.rejectedCandidates ?? []).map((item) => `${item.title}:${item.reason}`));
    const mergedRejected = [...(response.rejectedCandidates ?? [])];
    for (const item of policyRejected) {
      const key = `${item.title}:${item.reason}`;
      if (!existing.has(key)) { existing.add(key); mergedRejected.push(item); }
    }
    response.rejectedCandidates = mergedRejected.length > 0 ? mergedRejected : undefined;
    const rankedTagTelemetry = searchResult.debug.rankedTagRetrieval;
    if (rankedTagTelemetry) {
      rankedTagTelemetry.ranked_tag_primary_count = response.recommendations.length;
      rankedTagTelemetry.ranked_tag_near_match_count = response.nearMatches?.length ?? 0;
      const noResultReason = resolveRankedTagNoResultReason(searchResult, response);
      if (noResultReason) rankedTagTelemetry.noResultReason = noResultReason;
      if (response.engineStatus) {
        response.engineStatus.structuredTagRetrievalUsed = rankedTagTelemetry.structuredTagRetrievalUsed;
        response.engineStatus.rankedTagNoResultReason = noResultReason;
      }
      if (noResultReason) {
        const aspectId = structuredRequest?.ok
          ? structuredRequest.value.aspectConstraints.find((constraint) => (
            constraint.role === "must"
            && ASPECT_REGISTRY[constraint.aspectId].defaultEvidenceStrategy === "ranked_tag"
          ))?.aspectId
          : undefined;
        response.assistantMessage = userFacingRankedTagNoResult(
          noResultReason,
          aspectId ? ASPECT_REGISTRY[aspectId].labelTr : undefined,
        );
      }
    }
    response.debug = {
      ...(response.debug ?? { provider: "deterministic_v2" }),
      provider: "deterministic_v2",
      ...providerDebugFields(providerState),
      selectedProvider: "deterministic_v2",
      retrieval: response.debug?.retrieval ? {
        ...response.debug.retrieval,
        executedQueries: searchResult.debug.executedQueries,
        sourceCandidateCounts: searchResult.debug.sourceCandidateCounts,
        providerEvidence: providerEvidenceTelemetry,
        rankedTagRetrieval: rankedTagTelemetry,
        latencyMs: {
          ...stageLatencyMs,
          ...response.debug.retrieval.latencyMs,
          enrichment: stageLatencyMs.enrichment,
          total: Number((performance.now() - requestStartedAt).toFixed(2)),
        },
        notes: [...(response.debug.retrieval.notes ?? []), ...debugNotes, "d6_3_deterministic_final_ranking"],
      } : undefined,
    };
    scheduleGroundedResearchShadow({
      enabled: researchRollout.mode === "shadow",
      scheduler: nextPostResponseTaskScheduler,
      context: execution.researchShadowContext,
      requestId: `d7-r4b:${crypto.randomUUID()}`,
    });
    return NextResponse.json(response satisfies AiRecommendResponse);
  }

  const libIndex = new Map<string, true>();
  for (const m of mediaItems) {
    if (m.externalSource && m.externalId) {
      libIndex.set(`${m.externalSource}:${m.externalId}`, true);
    }
  }

  // R36 — Rule-based ön skorlama. Mevcut aday havuzunu kökten değiştirmez;
  // sadece sıralar, kütüphanede olanları eler, dropped/paused benzerlik
  // cezalarını uygular ve provider'a `score` + `scoreReasons` bırakır.
  const scoringResult = scoreCandidates({
    candidates,
    profile,
    intent,
    message,
    mediaItems,
    libIndex,
  });
  candidates = scoringResult.scored;
  const feedbackScoringResult = applyFeedbackAwareScoring({
    candidates,
    feedbackEvents: recommendationFeedback,
  });
  candidates = feedbackScoringResult.candidates;
  candidates = candidates.map((candidate) => {
    const embedding = buildCandidateEmbeddingText(candidate);
    return {
      ...candidate,
      embeddingText: embedding.text,
      embeddingHash: embedding.hash,
      embeddingSignals: embedding.signals,
    };
  });
  const embeddingProfilePayloads = buildEmbeddingSimilarityProfilePayloads(mediaItems);
  const candidateEmbeddingPayloads = candidates
    .filter((candidate) => candidate.embeddingText && candidate.embeddingHash)
    .map((candidate) => ({
      id: `${candidate.source}:${candidate.externalId}`,
      text: candidate.embeddingText as string,
      hash: candidate.embeddingHash as string,
      signals: candidate.embeddingSignals || [],
      metadata: {
        source: candidate.source,
        mediaType: candidate.type,
        title: candidate.title,
      },
    }));
  const embeddingVectorResult = await embedManyWithFallback([
    ...candidateEmbeddingPayloads,
    ...embeddingProfilePayloads.payloads,
  ]);
  const embeddingSimilarityResult = applyEmbeddingSimilarityScoring({
    candidates,
    vectorResults: embeddingVectorResult.results,
    provider: embeddingVectorResult.provider,
    positiveProfileIds: embeddingProfilePayloads.positiveIds,
    negativeProfileIds: embeddingProfilePayloads.negativeIds,
  });
  candidates = embeddingSimilarityResult.candidates;
  const embeddingScoreDebug = embeddingSimilarityResult.stats.skipped
    ? `r59_embedding_score:skipped=${embeddingSimilarityResult.stats.skipped}`
    : `r59_embedding_score:n=${embeddingSimilarityResult.stats.candidates},avg=${embeddingSimilarityResult.stats.averageScore},max=${embeddingSimilarityResult.stats.maxScore},min=${embeddingSimilarityResult.stats.minScore},posProfile=${embeddingSimilarityResult.stats.positiveProfileItems},negProfile=${embeddingSimilarityResult.stats.negativeProfileItems},provider=python_service`;
  const textSimilarityResult = applyTextSimilarityScoring({
    candidates,
    mediaItems,
  });
  candidates = textSimilarityResult.candidates;
  const hybridFeatures = buildCandidateFeatureVectors({
    candidates,
    intent,
    message,
    profile,
  });
  const hybridScoringResult = applyHybridScoring({
    candidates,
    features: hybridFeatures,
  });
  candidates = hybridScoringResult.candidates;
  if (scopeMode === "one-per-world") {
    candidates = balanceOnePerWorld(candidates);
    debugNotes.push("r45_one_per_world_balanced_order");
  }
  const scoringRejected = [...scoringResult.rejected, ...feedbackScoringResult.rejected];
  const scoringStats = scoringResult.stats;
  debugNotes.push(
    `r36_scored:n=${candidates.length} avg=${scoringStats.averageScore} max=${scoringStats.maxScore} min=${scoringStats.minScore} inLibReject=${scoringStats.inLibraryRejected} droppedPenalty=${scoringStats.droppedSimilarPenalty} pausedPenalty=${scoringStats.pausedSimilarPenalty}`
  );
  debugNotes.push(
    `r53_feedback_adjusted:events=${feedbackScoringResult.stats.events} adjusted=${feedbackScoringResult.stats.adjusted} rejected=${feedbackScoringResult.stats.rejectedDismissedExact} positives=${feedbackScoringResult.stats.positiveBoosts} penalties=${feedbackScoringResult.stats.dismissedPenalties} avg=${feedbackScoringResult.stats.averageAdjustment} maxBoost=${feedbackScoringResult.stats.maxBoost} maxPenalty=${feedbackScoringResult.stats.maxPenalty}`
  );
  debugNotes.push(
    `r54_hybrid_score_breakdown:n=${hybridScoringResult.stats.count} avg=${hybridScoringResult.stats.averageFinalScore} max=${hybridScoringResult.stats.maxFinalScore} min=${hybridScoringResult.stats.minFinalScore} content=${hybridScoringResult.stats.contentAdjusted} behavior=${hybridScoringResult.stats.behaviorAdjusted} popularity=${hybridScoringResult.stats.popularityAdjusted} textSimilarity=${hybridScoringResult.stats.textSimilarityAdjusted} embedding=${hybridScoringResult.stats.embeddingAdjusted}`
  );
  debugNotes.push(`r55_embedding_text_ready:n=${candidates.filter((candidate) => candidate.embeddingHash).length}`);
  debugNotes.push(
    `r57_embedding_provider:provider=${embeddingVectorResult.provider} requested=${embeddingVectorResult.requested} embedded=${embeddingVectorResult.embedded} dims=${embeddingVectorResult.dimensions} fallback=${embeddingVectorResult.fallbackUsed ? "yes" : "no"} error=${embeddingVectorResult.error ? "yes" : "no"}`
  );
  debugNotes.push(
    `r60_embedding_cache:hits=${embeddingVectorResult.cache?.hits ?? 0},misses=${embeddingVectorResult.cache?.misses ?? 0},stored=${embeddingVectorResult.cache?.stored ?? 0},size=${embeddingVectorResult.cache?.size ?? 0}`
  );
  debugNotes.push(
    `r61_persistent_embedding_cache:hits=${embeddingVectorResult.persistentCache?.hits ?? 0},misses=${embeddingVectorResult.persistentCache?.misses ?? 0},stored=${embeddingVectorResult.persistentCache?.stored ?? 0},disabled=${embeddingVectorResult.persistentCache?.disabled ? "yes" : "no"}`
  );
  debugNotes.push(embeddingScoreDebug);
  debugNotes.push(
    `r56_text_similarity:n=${textSimilarityResult.stats.candidates},avg=${textSimilarityResult.stats.averageScore},pos=${textSimilarityResult.stats.positiveProfileItems},neg=${textSimilarityResult.stats.negativeProfileItems},adjusted=${textSimilarityResult.stats.adjusted},max=${textSimilarityResult.stats.maxScore},min=${textSimilarityResult.stats.minScore}`
  );

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
    sourceTitles: deterministicTaste.sourceTitles,
    excludedSourceTitles: deterministicTaste.excludedSourceTitles,
    tasteSignalQueries: deterministicTaste.queries,
    directTitleQueryUsed: planHasDirectTitleQuery(retrievalPlan, deterministicTaste.excludedSourceTitles),
  });
  retrievalDebug.ideationFailedReason = ideationFailedReason;
  retrievalDebug.safeFallbackUsed = false;
  retrievalDebug.parseRepairUsed = false;
  if (providerEvidenceTelemetry) retrievalDebug.providerEvidence = providerEvidenceTelemetry;

  if (candidates.length === 0) {
    providerState.selectedProvider = "safe_fallback";
    providerState.safeFallbackUsed = true;
    retrievalDebug.safeFallbackUsed = true;
    let baseMsg = buildEmptyPoolMessage(retrievalPlan, intent, profile, retrievalDebug.notes || []);
    if (deterministicFallbackUsed) {
      baseMsg = providerPlanSucceeded
        ? "İlk arama yeterli aday bulamadı; daha geniş zevk sinyalleriyle de uygun aday çıkmadı."
        : "Bu kapsamda uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.";
    } else if (deterministicTaste.highRatedSourceCount > 0 && /yeterli/i.test(baseMsg)) {
      const targets = (retrievalPlan?.targetMediaTypes || intent.targetTypes).map(targetLabel).join(", ") || "hedef tür";
      baseMsg = `${targets} tarafında uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`;
    }
    if (ideationFailedReason && ideationFailedReason !== "skipped_library_based") {
      baseMsg = providerState.rateLimitHit || providerState.timeoutHit
        ? PROVIDER_RATE_LIMIT_MESSAGE
        : baseMsg;
    }
    // R37.2/R44 — dış kaynak/web modları: library fallback'e DÜŞME; net mesaj döndür.
    if (researchMode === "source-apis" || researchMode === "web") {
      const scopeLabel =
        scopeMode === "east" ? "Doğu" :
        scopeMode === "screen" ? "Kadraj" :
        scopeMode === "arch" ? "Arşiv" :
        scopeMode === "one-per-world" ? "her dünya" : "karışık";
      baseMsg = researchMode === "web"
        ? `Web araştırması ve kaynak doğrulamasıyla ${scopeLabel} kapsamında uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`
        : `Kaynaklardan ${scopeLabel} kapsamında uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`;
    }
    const mergedRejectedEmpty: { title: string; reason: string }[] = [];
    const seenEmpty = new Set<string>();
    for (const r of [...scoringRejected, ...policyRejected]) {
      if (seenEmpty.has(r.title)) continue;
      seenEmpty.add(r.title);
      mergedRejectedEmpty.push(r);
    }
    const empty: AiRecommendResponse = {
      assistantMessage: baseMsg,
      recommendations: [],
      rejectedCandidates: mergedRejectedEmpty.length > 0 ? mergedRejectedEmpty : undefined,
      transparencySummary: buildTransparencySummary(settings),
      intent,
      engineStatus: buildAiEngineStatus({
        provider: providerState.selectedProvider || "safe_fallback",
        model: providerState.usedModel,
        providerFallbackUsed: providerState.safeFallbackUsed || providerState.failedProviders.length > 0,
        evaluatedCandidateCount: hybridScoringResult.stats.count,
        candidates,
        feedbackEventCount: feedbackScoringResult.stats.events,
        feedbackAdjustedCount: feedbackScoringResult.stats.adjusted + feedbackScoringResult.stats.rejectedDismissedExact,
        embedding: {
          provider: embeddingVectorResult.provider,
          requested: embeddingVectorResult.requested,
          fallbackUsed: embeddingVectorResult.fallbackUsed,
          persistentCacheDisabled: embeddingVectorResult.persistentCache?.disabled,
        },
      }),
      debug: {
        provider: providerState.selectedProvider || "safe_fallback",
        ...providerDebugFields(providerState),
        note: "empty candidate pool",
        retrieval: retrievalDebug,
      },
    };
    if (providerState.rateLimitHit || providerState.timeoutHit) {
      empty.assistantMessage = PROVIDER_RATE_LIMIT_MESSAGE;
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

    response.debug = {
      ...(response.debug || { provider: providerState.selectedProvider || "mock" }),
      provider: providerState.selectedProvider || response.debug?.provider || "mock",
      ...providerDebugFields(providerState),
      note: response.debug?.note,
      retrieval: retrievalDebug,
    };
    response.recommendations = retainVerifiedRecommendations(response.recommendations, candidates).map((r) => ({
      ...r,
      inLibrary:
        r.inLibrary ||
        (!!r.externalSource && !!r.externalId && libIndex.has(`${r.externalSource}:${r.externalId}`)),
    }));
    response.assistantMessage = buildPolishedAssistantMessage({
      message,
      count: response.recommendations.length,
      researchMode,
      providerIssue: providerState.rateLimitHit || providerState.timeoutHit,
    });
    response.engineStatus = buildAiEngineStatus({
      provider: providerState.selectedProvider || response.debug?.provider,
      model: providerState.usedModel,
      providerFallbackUsed: providerState.safeFallbackUsed || providerState.failedProviders.length > 0,
      evaluatedCandidateCount: hybridScoringResult.stats.count,
      candidates,
      feedbackEventCount: feedbackScoringResult.stats.events,
      feedbackAdjustedCount: feedbackScoringResult.stats.adjusted + feedbackScoringResult.stats.rejectedDismissedExact,
      embedding: {
        provider: embeddingVectorResult.provider,
        requested: embeddingVectorResult.requested,
        fallbackUsed: embeddingVectorResult.fallbackUsed,
        persistentCacheDisabled: embeddingVectorResult.persistentCache?.disabled,
      },
    });
    // R36 + R37.2 — sistem tarafından hard-reject edilen adayları (skorlayıcı
    // + politika filtresi) LLM'in rejectedCandidates listesine ekle.
    const systemRejected = [...scoringRejected, ...policyRejected];
    if (systemRejected.length > 0) {
      const existing = new Set((response.rejectedCandidates || []).map((r) => r.title));
      const merged = [...(response.rejectedCandidates || [])];
      for (const r of systemRejected) {
        if (existing.has(r.title)) continue;
        existing.add(r.title);
        merged.push(r);
      }
      response.rejectedCandidates = merged;
    }
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
      note: "provider_ranking_failed",
      retrieval: { ...retrievalDebug, providerFallback: true },
    };
    fallback.recommendations = retainVerifiedRecommendations(fallback.recommendations, candidates).map((r) => ({
      ...r,
      inLibrary:
        r.inLibrary ||
        (!!r.externalSource && !!r.externalId && libIndex.has(`${r.externalSource}:${r.externalId}`)),
    }));
    fallback.assistantMessage = buildPolishedAssistantMessage({
      message,
      count: fallback.recommendations.length,
      researchMode,
      providerIssue: providerState.rateLimitHit || providerState.timeoutHit,
    });
    fallback.engineStatus = buildAiEngineStatus({
      provider: "mock",
      model: providerState.usedModel,
      providerFallbackUsed: true,
      evaluatedCandidateCount: hybridScoringResult.stats.count,
      candidates,
      feedbackEventCount: feedbackScoringResult.stats.events,
      feedbackAdjustedCount: feedbackScoringResult.stats.adjusted + feedbackScoringResult.stats.rejectedDismissedExact,
      embedding: {
        provider: embeddingVectorResult.provider,
        requested: embeddingVectorResult.requested,
        fallbackUsed: embeddingVectorResult.fallbackUsed,
        persistentCacheDisabled: embeddingVectorResult.persistentCache?.disabled,
      },
    });
    return NextResponse.json(fallback);
  }
}
