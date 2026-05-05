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
    fellBackToMock?: boolean;
    note?: string;
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
  generate(args: {
    message: string;
    profile: LibraryProfile | null;
    intent: AiIntent;
    settings: AiSettings;
    candidates: AiCandidate[];
    recentContext?: { role: "user" | "assistant"; content: string }[];
  }): Promise<AiRecommendResponse>;
}
