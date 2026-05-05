// ============================================
// AI Danışman - Ortak Tipler
// ============================================

import { MediaItem, ProgressLog, MediaType } from "@/lib/types";
import { GlobalSearchResult } from "@/lib/global-search-types";

export interface AiSettings {
  useProfile: boolean;
  useRecentActivity: boolean;
  usePersonalNotes: boolean;
  useWebResearch: boolean;
  deepResearch: boolean;
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
}

export type RetrievalSource = "anilist" | "tvmaze" | "openlibrary" | "tmdb" | "library";

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
  notes?: string[];
}

export interface AiCandidate {
  source: "tvmaze" | "anilist" | "openlibrary" | "library";
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
}

export interface AiRecommendation {
  id: string;
  title: string;
  mediaType: MediaType;
  source: string;             // "AniList" | "TVmaze" | "Open Library" | "Kütüphanen"
  externalSource?: "tvmaze" | "anilist" | "openlibrary" | "library";
  externalId?: string;
  coverUrl?: string;
  overview?: string;
  fitLabel: string;           // Eski "matchTag" yerine
  reason: string;
  risk?: string;              // Eski "warning"
  communitySignal?: string;   // Eski "community"
  inLibrary?: boolean;
  candidate?: AiCandidate;    // Quick Add akışı için
}

export interface AiRecommendResponse {
  assistantMessage: string;
  recommendations: AiRecommendation[];
  rejectedCandidates?: { title: string; reason: string }[];
  transparencySummary: string;
  intent?: AiIntent;
  debug?: {
    provider: string;
    attemptedProviders?: string[];
    selectedProvider?: string;
    providerErrors?: Record<string, string>;
    providerError?: "rate_limit" | "gemini_key_missing" | "openrouter_key_missing" | "groq_key_missing" | "parse_error" | "api_error" | "openrouter_skipped_paid_model";
    geminiCallCount?: number;
    openrouterCallCount?: number;
    groqCallCount?: number;
    rateLimitHit?: boolean;
    fallbackReason?: string;
    fellBackToMock?: boolean;
    note?: string;
    usedModel?: string;
    retrieval?: AiRetrievalDebug;
  };
}

export interface AiRecommendRequest {
  message: string;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  settings: AiSettings;
  recentContext?: { role: "user" | "assistant"; content: string }[];
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
