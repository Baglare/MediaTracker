// ============================================
// AI Danışman - Ortak Tipler
// ============================================

import { MediaItem, ProgressLog, MediaType } from "@/lib/types";
import { GlobalSearchResult } from "@/lib/global-search-types";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import type { RecommendationFeedbackEventV2 } from "@/features/recommendations/feedback";
import type { SemanticVerifierMode } from "@/features/recommendations/domain/types";

export interface AiSettings {
  useProfile: boolean;
  useRecentActivity: boolean;
  usePersonalNotes: boolean;
  useWebResearch: boolean;
  deepResearch: boolean;
  useOpenAIProvider: boolean;
  // R35 — granular data toggles (optional; treated as true when undefined for
  // backward compat). Client mirror'ı `components/ai-advisor.tsx` içinde de var.
  includeRatings?: boolean;
  includeFavorites?: boolean;
  includeProgress?: boolean;
}

export type IntentKind =
  | "reference_based"
  | "cross_media_translation"
  | "library_based"
  | "mood_based"
  | "avoidance_analysis"
  | "general_recommendation";

export interface AiIntent {
  kind: IntentKind;
  references: string[];
  /** Önerilecek hedef tür(ler). "kitap öner" → ["book"]. Boşsa sezgisel. */
  targetTypes: MediaType[];
  /** Profil filtresi olarak kullanılan kaynak türleri. "dizilere göre kitap" → ["tv"]. */
  sourceTypes: MediaType[];
  mood: string[];
  avoid: string[];
  needsLibraryProfile: boolean;
  needsCandidateSearch: boolean;
  needsWebResearch: boolean;
  notes?: string;
}

export interface LibraryProfile {
  totalItems: number;
  byType: Record<string, number>;
  topGenres: string[];
  topTags: string[];
  highRated: { title: string; type: MediaType; rating: number }[];
  favorites: { title: string; type: MediaType }[];
  dropped: { title: string; type: MediaType }[];
  recentActivity: { title: string; type: MediaType; action: string; at: string }[];
  notes?: { title: string; note: string }[];
  // R35 — yeni gruplar. Toggle kapalıysa boş array / undefined.
  inProgress: { title: string; type: MediaType; currentProgress?: number; totalProgress?: number }[];
  completed: { title: string; type: MediaType }[];
  planned: { title: string; type: MediaType }[];
  paused: { title: string; type: MediaType }[];
  averageRating?: { value: number; count: number };
  worldDistribution: { east: number; screen: number; arch: number };
}

export type RetrievalSource = "anilist" | "tvmaze" | "openlibrary" | "omdb" | "tmdb" | "library" | "web";

export interface AiSearchPlan {
  source: RetrievalSource;
  mediaType: MediaType;
  queries: string[];
  reason: string;
}

export interface AiRetrievalPlan {
  taskType: IntentKind | string;
  interpretation: string;
  targetMediaTypes: MediaType[];
  sourceContext?: string;
  sourceTypes: MediaType[];
  preferenceSignals: string[];
  avoidSignals: string[];
  needsClarification: boolean;
  clarificationQuestion?: string;
  searchPlans: AiSearchPlan[];
}

export interface AiCandidateIdea {
  title: string;
  mediaType: MediaType;
  author?: string;
  studio?: string;
  year?: number;
  whyItMightFit: string;
  searchHint?: string;
}

export interface AiRetrievalDebug {
  parsedIntent: AiIntent;
  taskType: IntentKind | string;
  targetMediaTypes: MediaType[];
  sourceTypes: MediaType[];
  sourceContext?: string;
  preferenceSignals: string[];
  avoidSignals: string[];
  needsClarification: boolean;
  clarificationQuestion?: string;
  searchPlans: AiSearchPlan[];
  candidateIdeasCount?: number;
  verifiedCount?: number;
  verificationSourceCounts?: Record<string, number>;
  rejectedUnverifiedCount?: number;
  fallbackSearchUsed?: boolean;
  executedQueries: { source: RetrievalSource; mediaType: MediaType; query: string; resultCount: number }[];
  sourceCandidateCounts: Record<string, number>;
  filterSummary: {
    before: number;
    after: number;
    removed: number;
    reasons: Record<string, number>;
  };
  finalCandidateCount: number;
  refinedPassUsed: boolean;
  providerFallback: boolean;
  parseRepairUsed?: boolean;
  ideationFailedReason?: "provider_parse_error" | "all_providers_failed" | "empty_ideas" | "rate_limit" | "key_missing" | "api_error" | "skipped_library_based";
  safeFallbackUsed?: boolean;
  highRatedSourceCount?: number;
  deterministicTasteSignals?: string[];
  deterministicFallbackUsed?: boolean;
  sourceTitles?: string[];
  excludedSourceTitles?: string[];
  tasteSignalQueries?: string[];
  directTitleQueryUsed?: boolean;
  notes?: string[];
  providerEvidence?: {
    snapshots: number;
    enrichedCandidates: number;
    cacheHits: number;
    cacheMisses: number;
    enrichmentFailures: number;
    tvmaze_anime_excluded: number;
    tvmaze_anime_likely_excluded: number;
    tvmaze_anime_unknown: number;
    tvmaze_non_anime_kept: number;
    same_provider_deduped: number;
    exact_bridge_deduped: number;
    identity_conflicts: number;
  };
}

export interface AiCandidate {
  source: "tvmaze" | "anilist" | "openlibrary" | "omdb" | "tmdb" | "library";
  externalId: string;
  type: MediaType;
  title: string;
  overview?: string;
  releaseYear?: number;
  coverUrl?: string;
  genres?: string[];
  totalProgress?: number;
  averageScore?: number;
  authors?: string[];
  format?: string;
  status?: string;
  currentProgress?: number;
  userRating?: number | null;
  favorite?: boolean;
  lastActivityAt?: string;
  // Quick Add'a yollanmak için orijinal global search uyumlu yapı (library hariç)
  globalSearch?: GlobalSearchResult;
  // Local kütüphane adayı için item id
  libraryItemId?: string;
  // R36 — Rule-based ön skorlama. Provider sıralama prompt'unda görür ve
  // explanation üretirken bu nedenleri tutarlı şekilde kullanır.
  score?: number;
  scoreReasons?: string[];
  feedbackScore?: number;
  feedbackReasons?: string[];
  finalScore?: number;
  hybridScoreBreakdown?: HybridScoreBreakdown;
  embeddingText?: string;
  embeddingHash?: string;
  embeddingSignals?: string[];
  textSimilarityScore?: number;
  textSimilarityReasons?: string[];
  embeddingScore?: number;
  embeddingSimilarityReasons?: string[];
}

export interface EmbeddingTextPayload {
  text: string;
  hash: string;
  signals: string[];
}

export interface CandidateFeatureVector {
  candidateKey: string;
  title: string;
  mediaType: MediaType;
  source: AiCandidate["source"];
  ruleScore: number;
  feedbackScore: number;
  contentScore: number;
  behaviorScore: number;
  popularityScore: number;
  textSimilarityScore: number;
  embeddingScore: number;
  contentReasons: string[];
  behaviorReasons: string[];
  popularityReasons: string[];
  textSimilarityReasons: string[];
  embeddingSimilarityReasons: string[];
}

export interface HybridScoreBreakdown {
  ruleScore: number;
  feedbackScore: number;
  contentScore: number;
  behaviorScore: number;
  popularityScore: number;
  textSimilarityScore: number;
  embeddingScore: number;
  finalScore: number;
  reasons: string[];
}

export interface AiRecommendation {
  id: string;
  title: string;
  mediaType: MediaType;
  source: string;             // "AniList" | "TVmaze" | "Open Library" | "Kütüphanen"
  externalSource?: "tvmaze" | "anilist" | "openlibrary" | "omdb" | "tmdb" | "library";
  externalId?: string;
  coverUrl?: string;
  overview?: string;
  fitLabel: string;           // Eski "matchTag" yerine
  reason: string;
  risk?: string;              // Eski "warning"
  communitySignal?: string;   // Eski "community"
  inLibrary?: boolean;
  candidate?: AiCandidate;    // Quick Add akışı için
  resultKind?: "primary" | "near_match";
  evidenceSummary?: { label: string; value: string; confidenceLabel?: string }[];
}

export interface AiNearMatchRecommendation extends AiRecommendation {
  resultKind: "near_match";
  violatedConstraints: string[];
  satisfiedConstraints: string[];
  nearMatchReason: string;
}

export type AiEngineProvider =
  | "deterministic_v2"
  | "mock"
  | "openai"
  | "gemini"
  | "openrouter"
  | "groq"
  | "safe_fallback"
  | "unknown";

export type AiEmbeddingMode = "python_service" | "local_mock" | "disabled";
export type AiPersistentCacheStatus = "active" | "disabled" | "not_used";

/** Kullanıcıya gösterilebilen, secret ve ham hata içermeyen sınırlı motor özeti. */
export interface AiEngineStatus {
  provider: AiEngineProvider;
  model?: string;
  embeddingMode: AiEmbeddingMode;
  providerFallbackUsed: boolean;
  evaluatedCandidateCount: number;
  sources: AiCandidate["source"][];
  feedbackApplied: boolean;
  feedbackEventCount: number;
  persistentCache: AiPersistentCacheStatus;
  semanticVerifierMode?: SemanticVerifierMode;
}

export type RecommendationFeedbackAction =
  | "shown"
  | "dismissed"
  | "similar_requested"
  | "added"
  | "open_discover";

export interface RecommendationFeedbackEvent {
  id: string;
  action: RecommendationFeedbackAction;
  recommendationId: string;
  title: string;
  mediaType: MediaType;
  source: string;
  externalSource?: AiRecommendation["externalSource"];
  externalId?: string;
  sessionId?: string;
  prompt?: string;
  metadata?: {
    fitLabel?: string;
    inLibrary?: boolean;
    canAdd?: boolean;
  };
  createdAt: string;
}

export interface AiRecommendResponse {
  assistantMessage: string;
  recommendations: AiRecommendation[];
  nearMatches?: AiNearMatchRecommendation[];
  rejectedCandidates?: { title: string; reason: string }[];
  transparencySummary: string;
  intent?: AiIntent;
  engineStatus?: AiEngineStatus;
  debug?: {
    provider: string;
    attemptedProviders?: string[];
    selectedProvider?: string;
    failedProviders?: { provider: string; stage: "planning" | "ranking"; error: string }[];
    providerErrors?: Record<string, string>;
    providerError?: "rate_limit" | "gemini_key_missing" | "openai_key_missing" | "openrouter_key_missing" | "groq_key_missing" | "parse_error" | "api_error" | "openrouter_skipped_paid_model" | "timeout";
    useOpenAIProvider?: boolean;
    openaiCallCount?: number;
    geminiCallCount?: number;
    openrouterCallCount?: number;
    groqCallCount?: number;
    providerCallCounts?: Record<string, number>;
    rateLimitHit?: boolean;
    timeoutHit?: boolean;
    fallbackReason?: string;
    safeFallbackUsed?: boolean;
    fellBackToMock?: boolean;
    note?: string;
    usedModel?: string;
    followUpMerged?: boolean;
    activeContextSummary?: string;
    retrieval?: AiRetrievalDebug;
  };
}

export interface AiActiveContext {
  previousPrompt: string;
  lastAssistantMessage?: string;
  lastRecommendations?: { title: string; mediaType: MediaType; source?: string }[];
  followUpMessage?: string;
  summary?: string;
  followUpMerged?: boolean;
}

// R37 — Advisor UI'dan gelen araştırma modu ve kapsam seçimi.
// "library-only" → yalnızca kütüphane içi adaylar.
// "source-apis"  → harici kaynak API adayları.
// "web"          → web araştırması + kaynak API doğrulaması.
export type AdvisorResearchMode = "library-only" | "source-apis" | "web";
export type AdvisorScopeMode = "mixed" | "east" | "screen" | "arch" | "one-per-world";

export interface AiRecommendRequest {
  message: string;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  settings: AiSettings;
  recentContext?: { role: "user" | "assistant"; content: string }[];
  activeContext?: AiActiveContext;
  researchMode?: AdvisorResearchMode;
  scopeMode?: AdvisorScopeMode;
  // R39 — Session-level feedback suppression (kalıcı değil; sadece bu request)
  dismissed?: {
    title?: string;
    externalSource?: string;
    externalId?: string;
    mediaType?: string;
  }[];
  recommendationFeedback?: RecommendationFeedbackEvent[];
  recommendationFeedbackV2?: RecommendationFeedbackEventV2[];
  structuredRequestV2?: RecommendationRequestV2;
}

export interface AiProvider {
  name: string;
  isAvailable?(): boolean;
  generateRetrievalPlan?(args: {
    message: string;
    profile: LibraryProfile | null;
    intent: AiIntent;
    settings: AiSettings;
    refinement?: {
      previousPlan: AiRetrievalPlan | null;
      candidateCount: number;
    };
  }): Promise<AiRetrievalPlan>;
  generate(args: {
    message: string;
    profile: LibraryProfile | null;
    intent: AiIntent;
    settings: AiSettings;
    candidates: AiCandidate[];
    retrievalPlan?: AiRetrievalPlan | null;
    recentContext?: { role: "user" | "assistant"; content: string }[];
  }): Promise<AiRecommendResponse>;
}
