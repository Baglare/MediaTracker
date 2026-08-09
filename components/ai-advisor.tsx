"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Plus,
  X,
  Loader2,
  Check,
  History,
  ChevronRight,
  ShieldCheck,
  Wand2,
  Library,
  Star,
  Heart,
  PlayCircle,
  Globe2,
  Database,
  Cloud,
  Search,
  Compass,
  ThumbsDown,
  RotateCcw,
  Repeat,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import { MediaItem, MediaType, ProgressLog } from "@/lib/types";
import { GlobalSearchResult } from "@/lib/global-search-types";
import { expandTargetFamily } from "@/lib/ai/target-family";
import {
  appendScopedRecommendationFeedbackEvent,
  appendScopedRecommendationFeedbackEventV2,
  clearScopedDismissedRecommendationFeedback,
  removeScopedDismissedRecommendationFeedback,
} from "@/lib/ai/recommendation-feedback";
import { buildAiEngineStatus } from "@/lib/ai/engine-status";
import type {
  AiEngineStatus,
  AiPlanningProviderPolicyStatus,
  AiRecommendation,
  AiNearMatchRecommendation,
  AiSettings,
  PublicResearchOutcomeNotice,
  RecommendationFeedbackAction,
} from "@/lib/ai/types";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import type { RecommendationStrictness, SemanticVerifierMode } from "@/features/recommendations/domain/types";
import type { RecommendationFeedbackEventV2, RecommendationFeedbackReasonCode } from "@/features/recommendations/feedback";
import type { AiEntitlement } from "@/lib/ai/entitlement";
import { ASPECT_REGISTRY } from "@/features/recommendations/domain/aspect-registry";
import {
  EngineTransparency,
  EvidenceSummary,
  FeedbackReasonDialog,
  NearMatchSection,
  ParsedRequestPanel,
  RecommendationCardHeader,
  ResearchEvidenceDisclosure,
  ResearchOutcomeNotice,
  RequestComposer,
  appendRecommendationMessage,
  buildInterpretReferencePayload,
  buildRecommendationMediaPayload,
  userFacingConstraintLabel,
  userFacingCapabilityValidationSummary,
  userFacingNoResultSummary,
  userFacingRejectionReason,
} from "@/features/recommendations/ui";
import { decodePublicResearchEvidenceSummary, decodePublicResearchOutcomeNotice } from "@/features/recommendations/research/active/public-codec";
export type { AiSettings } from "@/lib/ai/types";
import { useAuth } from "@/hooks/use-auth";
import {
  isHydratedOwnerVisible,
  resolveLocalOwnerScope,
} from "@/lib/local-owner-scope";
import {
  readAiFeedbackState,
  readAiPreferencesState,
  readAiSessionState,
  writeAiFeedbackState,
  writeAiPreferencesState,
  writeAiSessionState,
} from "@/lib/ai/local-state";
import { migrateLegacyPersonalDomainToGuest } from "@/lib/personal-data-ownership";

// ---- Tipler ----
interface AiRetrievalDebug {
  taskType?: string;
  targetMediaTypes?: MediaType[];
  sourceTypes?: MediaType[];
  sourceContext?: string;
  preferenceSignals?: string[];
  avoidSignals?: string[];
  needsClarification?: boolean;
  clarificationQuestion?: string;
  searchPlans?: {
    source: string;
    mediaType: MediaType;
    queries: string[];
    reason: string;
  }[];
  candidateIdeasCount?: number;
  verifiedCount?: number;
  verificationSourceCounts?: Record<string, number>;
  rejectedUnverifiedCount?: number;
  fallbackSearchUsed?: boolean;
  executedQueries?: { source: string; mediaType: MediaType; query: string; resultCount: number }[];
  sourceCandidateCounts?: Record<string, number>;
  filterSummary?: {
    before: number;
    after: number;
    removed: number;
    reasons: Record<string, number>;
  };
  finalCandidateCount?: number;
  refinedPassUsed?: boolean;
  providerFallback?: boolean;
  parseRepairUsed?: boolean;
  ideationFailedReason?: string;
  safeFallbackUsed?: boolean;
  highRatedSourceCount?: number;
  deterministicTasteSignals?: string[];
  deterministicFallbackUsed?: boolean;
  sourceTitles?: string[];
  excludedSourceTitles?: string[];
  tasteSignalQueries?: string[];
  directTitleQueryUsed?: boolean;
  notes?: string[];
}

interface AiDebugInfo {
  provider?: string;
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
  fellBackToMock?: boolean;
  note?: string;
  usedModel?: string;
  followUpMerged?: boolean;
  activeContextSummary?: string;
  safeFallbackUsed?: boolean;
  retrieval?: AiRetrievalDebug;
}

interface RejectedCandidate {
  title: string;
  reason: string;
}

// R39 — session-level feedback sinyali. Backend payload'una bu şekilde gider;
// route.ts aday havuzunu (externalSource:externalId) ve (normalize(title))
// eşleşmesiyle filtreler.
interface DismissedSignal {
  title: string;
  externalSource?: string;
  externalId?: string;
  mediaType: MediaType;
  dismissedAt?: string;
}

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AiSession {
  id: string;
  createdAt: string;
  prompt: string;
  assistantMessage: string;
  recommendations: AiRecommendation[];
  nearMatches?: AiNearMatchRecommendation[];
  structuredRequestV2?: RecommendationRequestV2;
  rejectedCandidates?: RejectedCandidate[];
  researchOutcomeNotice?: PublicResearchOutcomeNotice;
  settings: AiSettings;
  debug?: AiDebugInfo;
  engineStatus?: AiEngineStatus;
}

interface AiActiveContext {
  previousPrompt: string;
  lastAssistantMessage?: string;
  lastRecommendations?: { title: string; mediaType: MediaType; source?: string }[];
  followUpMessage?: string;
  summary?: string;
  followUpMerged?: boolean;
}

interface AiAdvisorProps {
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  resetSignal: number;
  onAddToLibrary: (gs: GlobalSearchResult) => void | Promise<void>;
  // R38 — Quick Add'a uygun olmayan (canAdd=false) öneriler için kart aksiyonu:
  // kullanıcıyı Keşfet sekmesine alıp orada elle aratabilsin. Opsiyonel; prop
  // verilmezse buton hâlâ render edilir ama no-op.
  onOpenDiscover?: (rec: AiRecommendation) => void;
}

const MAX_DISMISSED_FEEDBACK = 100;
// R40 — Aktif AI oturumu (chat + öneri kartları + local feedback) sayfa
// yenilenmesinde geri yüklenebilmesi için bu key'e yazılır. handleNewTopic
// veya boş state durumunda silinir. Konu Kapat → sohbeti temizler; kalıcı
// feedback ayrı key'de tutulur.
const ACTIVE_SESSION_VERSION = 1;
const MAX_SESSIONS = 8;

const DEFAULT_SETTINGS: AiSettings = {
  useProfile: true,
  useRecentActivity: true,
  usePersonalNotes: false,
  useWebResearch: true,
  deepResearch: false,
  useOpenAIProvider: false,
};

const VALID_MEDIA_TYPES = new Set<MediaType>([
  "tv",
  "anime",
  "manga",
  "manhwa",
  "manhua",
  "book",
  "movie",
  "light_novel",
  "web_novel",
  "visual_novel",
]);

function normalizeFeedbackTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function feedbackKeyFromSignal(signal: DismissedSignal): string {
  if (signal.externalSource && signal.externalId) {
    return `external:${signal.externalSource}:${signal.externalId}`;
  }
  return `title:${normalizeFeedbackTitle(signal.title)}:${signal.mediaType}`;
}

function feedbackSignalFromRec(rec: AiRecommendation): DismissedSignal {
  return {
    title: rec.title,
    externalSource: rec.externalSource,
    externalId: rec.externalId,
    mediaType: rec.mediaType,
    dismissedAt: new Date().toISOString(),
  };
}

function feedbackKeyFromRec(rec: AiRecommendation): string {
  return feedbackKeyFromSignal(feedbackSignalFromRec(rec));
}

function limitDismissedSignals(signals: Record<string, DismissedSignal>): Record<string, DismissedSignal> {
  const entries = Object.entries(signals);
  if (entries.length <= MAX_DISMISSED_FEEDBACK) return signals;
  return Object.fromEntries(entries.slice(-MAX_DISMISSED_FEEDBACK));
}

function parseDismissedSignals(raw: unknown): Record<string, DismissedSignal> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, DismissedSignal> = {};
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const item = value as Partial<DismissedSignal>;
    if (typeof item.title !== "string" || !item.title.trim()) continue;
    if (!item.mediaType || !VALID_MEDIA_TYPES.has(item.mediaType)) continue;
    const signal: DismissedSignal = {
      title: item.title,
      mediaType: item.mediaType,
      externalSource: typeof item.externalSource === "string" ? item.externalSource : undefined,
      externalId: typeof item.externalId === "string" ? item.externalId : undefined,
      dismissedAt: typeof item.dismissedAt === "string" ? item.dismissedAt : undefined,
    };
    out[feedbackKeyFromSignal(signal)] = signal;
  }
  return limitDismissedSignals(out);
}

const SAMPLE_PROMPTS = [
  "Solo Leveling gibi ama daha romantik anime öner.",
  "7+ puan verdiğim dizilere göre kitap öner.",
  "Bugün kütüphanemden neye devam etsem?",
  "Chill ve kısa bir şey öner.",
];

// R34 — Mod kartları / kapsam / araştırma seçimleri
type AdvisorMode =
  | "recommend"
  | "library-analysis"
  | "by-ratings"
  | "by-favorites"
  | "unfinished"
  | "one-per-world";

interface ModeCard {
  key: AdvisorMode;
  label: string;
  hint: string;
  icon: typeof Sparkles;
}

const MODE_CARDS: ModeCard[] = [
  { key: "recommend", label: "Öneri Al", hint: "Profilime göre yeni öneriler", icon: Wand2 },
  { key: "library-analysis", label: "Kütüphane Analizi", hint: "Zevkim ve eksiklerim", icon: Library },
  { key: "by-ratings", label: "Puanlarıma Göre", hint: "Yüksek puan verdiklerime benzer", icon: Star },
  { key: "by-favorites", label: "Favorilerime Göre", hint: "Favori imzalarımla", icon: Heart },
  { key: "unfinished", label: "Yarım Kalanlar", hint: "Bugün neye devam etsem", icon: PlayCircle },
  { key: "one-per-world", label: "Her Dünyadan Öner", hint: "Doğu · Kadraj · Arşiv", icon: Globe2 },
];

type ScopeMode = "mixed" | "east" | "screen" | "arch" | "one-per-world";

const SCOPE_OPTIONS: { key: ScopeMode; label: string }[] = [
  { key: "mixed", label: "Karışık" },
  { key: "east", label: "Doğu" },
  { key: "screen", label: "Kadraj" },
  { key: "arch", label: "Arşiv" },
  { key: "one-per-world", label: "Her dünyadan bir öneri" },
];

const SCOPE_PROMPT_HINT: Record<ScopeMode, string> = {
  "mixed": "Kapsam: kütüphanemdeki tüm dünyalardan karışık olsun.",
  "east": "Kapsam: Doğu dünyası (anime, manga, manhwa, manhua, novel) odaklı olsun.",
  "screen": "Kapsam: Kadraj dünyası (film, dizi) odaklı olsun.",
  "arch": "Kapsam: Arşiv dünyası (kitap) odaklı olsun.",
  "one-per-world": "Kapsam: Doğu, Kadraj ve Arşiv dünyalarının her birinden birer öneri ver.",
};

type ResearchMode = "library-only" | "source-apis" | "web";

const RESEARCH_OPTIONS: { key: ResearchMode; label: string; desc: string; icon: typeof Database }[] = [
  { key: "library-only", label: "Sadece kütüphanem", desc: "Yalnızca eklediklerim üstünden", icon: Database },
  { key: "source-apis", label: "Kaynak API'leriyle öner", desc: "AniList · TVmaze · OpenLibrary · TMDB/OMDb", icon: Search },
  { key: "web", label: "Web araştırması", desc: "Web araması + kaynak doğrulaması", icon: Cloud },
];

interface DataToggles {
  ratings: boolean;
  favorites: boolean;
  progress: boolean;
  notes: boolean;
  recentActivity: boolean;
}

const DEFAULT_DATA_TOGGLES: DataToggles = {
  ratings: true,
  favorites: true,
  progress: true,
  notes: false,
  recentActivity: true,
};

const DATA_TOGGLE_META: { key: keyof DataToggles; label: string }[] = [
  { key: "ratings", label: "Puanlar" },
  { key: "favorites", label: "Favoriler" },
  { key: "progress", label: "İlerleme" },
  { key: "notes", label: "Notlar" },
  { key: "recentActivity", label: "Son aktiviteler" },
];


function buildModePrompt(
  mode: AdvisorMode,
  scope: ScopeMode,
  research: ResearchMode,
  toggles: DataToggles
): string {
  const base: Record<AdvisorMode, string> = {
    "recommend": "Bana göre yeni bir şey öner.",
    "library-analysis": "Kütüphanemi analiz et: zevk profilim, baskın türler, eksik kalan alanlar ve dağılım hakkında kısa bir analiz çıkar.",
    "by-ratings": "7+ puan verdiğim eserlere benzer yeni öneriler ver.",
    "by-favorites": "Favori olarak işaretlediğim eserlerin ortak imzalarına uygun yeni öneriler ver.",
    "unfinished": "Yarım bıraktığım ya da devam ettiğim eserlerden bugün hangisine devam etmem gerektiğini söyle ve gerekçelendir.",
    "one-per-world": "Doğu (anime/manga/manhwa/manhua/novel), Kadraj (film/dizi) ve Arşiv (kitap) dünyalarının her birinden birer öneri ver.",
  };

  const scopeLine = mode === "one-per-world" ? SCOPE_PROMPT_HINT["one-per-world"] : SCOPE_PROMPT_HINT[scope];

  const researchLine =
    research === "library-only"
      ? "Araştırma modu: yalnızca kütüphanemden öner, dış kaynak kullanma."
      : research === "source-apis"
      ? "Araştırma modu: kaynak API verileriyle doğrulanmış dış adaylar öner; kütüphane fallback'i kullanma."
      : "Araştırma modu: web araştırması yap, sonra adayları kaynak API'lerinde doğrula.";

  const activeData = DATA_TOGGLE_META
    .filter((m) => toggles[m.key])
    .map((m) => m.label.toLowerCase());
  const dataLine = activeData.length
    ? `Kullanılabilecek verilerim: ${activeData.join(", ")}.`
    : "Profil verilerimi kullanma, sadece istek metnine göre cevap ver.";

  const whyLine = "Her öneri için neden bana uyduğunu kısa ama somut biçimde açıkla.";

  return [base[mode], scopeLine, researchLine, dataLine, whyLine].filter(Boolean).join(" ");
}

// R38 — Öneri kartı için "neden önerildi" üretici. Önce R36 scoreReasons,
// yoksa LLM'in rec.reason'unu kısa maddelere böl. Maddeler 110 karaktere
// kırpılır; ham debug satırı gibi durmasın diye trailing "ile ortak X, Y"
// formatı temiz tutuluyor.
function humanizeReason(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const highRated = text.match(/^Yüksek puan verdiğin "([^"]+)"(?: \(([^)]+)\))? ile ortak tür sinyali: (.+)$/);
  if (highRated) {
    return `Daha önce yüksek puan verdiğin ${highRated[1]} ile benzer türlere sahip.`;
  }

  const favorite = text.match(/^Favorilerine benziyor: "([^"]+)" ile ortak (.+)$/);
  if (favorite) {
    return `Favorin ${favorite[1]} ile benzer tatlara yakın.`;
  }

  const targetType = text.match(/^İstenen tür hedefiyle uyumlu \(([^)]+)\)$/);
  if (targetType) {
    return `İstediğin ${targetType[1]} türüne uygun.`;
  }

  const scope = text.match(/^(.+) kapsamına uyuyor$/);
  if (scope) {
    return `Seçtiğin ${scope[1]} kapsamına uygun.`;
  }

  const dropped = text.match(/^Bırakdığın "([^"]+)" ile benzeşiyor/);
  if (dropped) {
    return `Daha önce bıraktığın ${dropped[1]} ile benzerlik taşıyor; bu yüzden riskli olabilir.`;
  }

  const paused = text.match(/^Duraklattığın "([^"]+)" ile benzeşiyor$/);
  if (paused) {
    return `Daha önce duraklattığın ${paused[1]} ile benzer bir çizgide.`;
  }

  const mood = text.match(/^İstediğin "([^"]+)" tonuna uyan tür sinyali var$/);
  if (mood) {
    return `İstediğin ${mood[1]} tona yakın.`;
  }

  if (/^Kısa süreli/.test(text)) {
    return "Kısa sürede tamamlanabilecek bir seçenek.";
  }

  return text;
}

function reasonKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/"[^"]+"/g, "")
    .replace(/\b\d+([.,]\d+)?\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function buildReasonBullets(rec: AiRecommendation): string[] {
  const scoreReasons = rec.resultKind ? undefined : rec.candidate?.scoreReasons;
  if (scoreReasons && scoreReasons.length > 0) {
    const seen = new Set<string>();
    const bullets: string[] = [];
    for (const raw of scoreReasons) {
      const human = humanizeReason(raw);
      const key = reasonKey(human);
      if (!human || seen.has(key)) continue;
      seen.add(key);
      bullets.push(truncateBullet(human));
      if (bullets.length >= 3) break;
    }
    return bullets;
  }
  const raw = (rec.reason || "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?<=[.!?;])\s+|\s*\|\s*/)
    .map((s) => humanizeReason(s.replace(/[\s.;]+$/g, "").trim()))
    .filter((s) => s.length >= 6);
  if (parts.length === 0) return [truncateBullet(humanizeReason(raw))];
  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const part of parts) {
    const key = reasonKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(truncateBullet(part));
    if (bullets.length >= 3) break;
  }
  return bullets;
}

function truncateBullet(s: string): string {
  const trimmed = s.trim();
  return trimmed.length > 110 ? trimmed.slice(0, 107).trimEnd() + "…" : trimmed;
}

// R38 — "Buna benzer öner" promptu. Mevcut chat akışına güvenli bir Türkçe
// string olarak girer; provider/aday flow'u standart yoldan ilerler.
function buildSimilarPrompt(rec: AiRecommendation): string {
  const typeLabel = (() => {
    switch (rec.mediaType) {
      case "tv": return "dizi";
      case "movie": return "film";
      case "book": return "kitap";
      case "anime": return "anime";
      case "manga": return "manga";
      case "manhwa": return "manhwa";
      case "manhua": return "manhua";
      default: return rec.mediaType;
    }
  })();
  return `"${rec.title}" gibi başka bir ${typeLabel} öner. Tonu ve ana türünü koru, neden önerdiğini somut biçimde açıkla.`;
}

const LOADING_STEPS = [
  "İstek analiz ediliyor",
  "Kütüphane profili hazırlanıyor",
  "Adaylar aranıyor",
  "Öneriler hazırlanıyor",
];
const AI_REQUEST_TIMEOUT_MS = 35000;

function generateId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

// R40.1 — Prompt'tan hedef tür ailesini çıkar. intent-analyzer'ın azaltılmış
// türevi: yalnızca client fallback için yeterli. "anime öner"/"manga öner"/
// "novel öner"/"film"/"dizi"/"kitap" gibi açık tür sinyallerini yakalar.
function detectFallbackTargetTypes(prompt: string): MediaType[] {
  const text = prompt.toLowerCase();
  const out: MediaType[] = [];
  if (/\banime(ler|leri|den)?\b/.test(text)) out.push("anime");
  if (/\bmanga(lar|ları)?\b/.test(text)) out.push("manga");
  if (/\bmanhwa\b/.test(text)) out.push("manhwa");
  if (/\bmanhua\b/.test(text)) out.push("manhua");
  if (/\bfilm(ler|leri)?\b|\bmovie\b/.test(text)) out.push("movie");
  if (/\bdizi(ler|leri|lere|lerden)?\b|\btv\b/.test(text)) out.push("tv");
  if (/\bkitap(lar|lara|ları)?\b|\bbook\b/.test(text)) out.push("book");
  return [...new Set(out)];
}

// R40.1 — Library-analysis / continue niyetleri: tür belirtilmemişse library
// adayları serbest kalabilir. Tür belirtilmişse filtre yine uygulanır.
function isLibraryAnalysisOrContinuePrompt(prompt: string): boolean {
  const text = prompt.toLowerCase();
  return /(kütüphan|bugün ne|neye devam|yarım kalan|yarım bırakt|analiz et|devam etmem)/.test(text);
}

function buildLocalFallbackRecs(prompt: string, mediaList: MediaItem[]): AiRecommendation[] {
  const lower = prompt.toLowerCase();
  const isContinue = /devam|bugün|kütüphan|chill/.test(lower);
  if (!isContinue || mediaList.length === 0) return [];

  // R40.1 — Tür belirtilmişse library aday havuzuna da aile filtresini uygula.
  // Sadece açık library-analysis/continue intentlerinde tür belirtilmemişse
  // tüm türlere izin verilir.
  const targets = detectFallbackTargetTypes(prompt);
  const allowAll = targets.length === 0 && isLibraryAnalysisOrContinuePrompt(prompt);
  const family = targets.length > 0 ? expandTargetFamily(targets, prompt) : null;

  const pool = mediaList.filter((m) => {
    if (m.status === "dropped") return false;
    if (family) return family.has(m.type);
    if (allowAll) return true;
    // Hedef yok ve library-analysis sinyali de yok → güvenli taraf: aday verme.
    return false;
  });
  if (pool.length === 0) return [];

  return pool.slice(0, 3).map<AiRecommendation>((m, i) => ({
    id: `rec-${m.id}-${i}`,
    title: m.title,
    mediaType: m.type,
    source: "Kütüphanen",
    externalSource: "library",
    externalId: m.id,
    coverUrl: m.coverImage,
    overview: m.overview,
    fitLabel: i === 0 ? "Bugün için ideal" : "Devam etmeye uygun",
    reason: `${m.currentProgress}/${m.totalProgress} ilerleme.`,
    inLibrary: true,
  }));
}

function buildAssistantMessage(prompt: string, settings: AiSettings, count: number): string {
  const used = [
    settings.useProfile && "kütüphane profili",
    settings.useRecentActivity && "son aktiviteler",
    settings.usePersonalNotes && "kişisel notlar",
    settings.useWebResearch && "web araştırması",
    settings.deepResearch && "derin araştırma",
  ]
    .filter(Boolean)
    .join(", ");
  if (count === 0) {
    return `İsteğini "${prompt.trim()}" olarak yorumladım. Bu kapsamda uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`;
  }
  return `İsteğini "${prompt.trim()}" olarak yorumladım. ${used || "Yalnızca istek metni"} ile ${count} öneri hazırladım.`;
}

function buildExternalClientEmptyMessage(prompt: string, researchMode: ResearchMode): string {
  const sourceLabel = researchMode === "web" ? "Web araştırması ve kaynak doğrulamasıyla" : "Kaynaklardan";
  return `İsteğini "${prompt.trim()}" olarak yorumladım. ${sourceLabel} bu kapsamda uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`;
}

function providerLabel(provider: AiEngineStatus["provider"]): string {
  if (provider === "mock") return "Mock";
  if (provider === "openai") return "OpenAI";
  if (provider === "safe_fallback") return "Güvenli fallback";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "unknown") return "Bilinmiyor";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function embeddingLabel(mode: AiEngineStatus["embeddingMode"]): string {
  if (mode === "python_service") return "Python ML service";
  if (mode === "local_mock") return "Local mock embedding";
  return "Devre dışı";
}

function persistentCacheLabel(status: AiEngineStatus["persistentCache"]): string {
  if (status === "active") return "Aktif";
  if (status === "disabled") return "Pasif";
  return "Kullanılmadı";
}

function recommendationContextLabels(rec: AiRecommendation): string[] {
  const labels: string[] = [];
  const status = rec.candidate?.status;
  if (rec.inLibrary && (status === "watching" || status === "reading" || status === "paused")) {
    labels.push("Devam önerisi");
  } else if (rec.inLibrary) {
    labels.push("Kütüphanende");
  } else if (rec.fitLabel !== "Yeni keşif") {
    labels.push("Yeni keşif");
  }
  if ((rec.candidate?.feedbackScore ?? 0) < 0) labels.push("Negatif feedback nedeniyle aşağı sıralandı");
  if ((rec.candidate?.feedbackScore ?? 0) > 0) labels.push("Olumlu feedback ile güçlendi");
  return labels;
}

export default function AiAdvisor({
  mediaList,
  progressLogs,
  resetSignal,
  onAddToLibrary,
  onOpenDiscover,
}: AiAdvisorProps) {
  const auth = useAuth();
  const ownerScope = useMemo(
    () => resolveLocalOwnerScope(auth.loading ? undefined : auth.user?.id ?? null),
    [auth.loading, auth.user?.id],
  );
  const ownerScopeKey = ownerScope?.key ?? null;
  const [hydratedOwnerKey, setHydratedOwnerKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([]);
  const [nearMatches, setNearMatches] = useState<AiNearMatchRecommendation[]>([]);
  const [structuredRequest, setStructuredRequest] = useState<RecommendationRequestV2 | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [availableVerifierModes, setAvailableVerifierModes] = useState<Exclude<SemanticVerifierMode, "structured_only">[]>([]);
  const [recommendationStrictness, setRecommendationStrictness] = useState<RecommendationStrictness>("balanced");
  const [interpretationLoading, setInterpretationLoading] = useState(false);
  const [rejected, setRejected] = useState<RejectedCandidate[]>([]);
  const [researchOutcomeNotice, setResearchOutcomeNotice] = useState<PublicResearchOutcomeNotice | null>(null);
  const [loadingStep, setLoadingStep] = useState(-1);
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  // R42 — "İlgilenmiyorum" feedback'i localStorage'da kalıcı tutulur.
  // Backend aday havuzunu title/externalSource/externalId/mediaType ile filtreler.
  const [dismissedSignals, setDismissedSignals] = useState<Record<string, DismissedSignal>>({});
  const [recommendationFeedbackEvents, setRecommendationFeedbackEvents] = useState<
    import("@/lib/ai/types").RecommendationFeedbackEvent[]
  >([]);
  const [recommendationFeedbackEventsV2, setRecommendationFeedbackEventsV2] = useState<RecommendationFeedbackEventV2[]>([]);
  const [feedbackDialogRec, setFeedbackDialogRec] = useState<AiRecommendation | null>(null);
  const [debugInfo, setDebugInfo] = useState<AiDebugInfo | null>(null);
  const [engineStatus, setEngineStatus] = useState<AiEngineStatus | null>(null);
  const [planningPolicy, setPlanningPolicy] = useState<AiPlanningProviderPolicyStatus | null>(null);
  const [aiEntitlement, setAiEntitlement] = useState<AiEntitlement | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [aiStorageError, setAiStorageError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [pendingClarification, setPendingClarification] = useState<{
    originalPrompt: string;
    question: string;
  } | null>(null);
  // R34 — yeni UI state'leri
  const [scopeMode, setScopeMode] = useState<ScopeMode>("mixed");
  const [researchMode, setResearchMode] = useState<ResearchMode>("library-only");
  const [dataToggles, setDataToggles] = useState<DataToggles>(DEFAULT_DATA_TOGGLES);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRequestId = useRef<string | null>(null);
  const inFlightPromptKey = useRef<string | null>(null);
  const activeRequestController = useRef<AbortController | null>(null);
  const lastPersistedSessionKey = useRef<string | null>(null);
  const activeContextRef = useRef<AiActiveContext | null>(null);
  const feedbackContextRef = useRef<{ sessionId?: string; prompt?: string } | null>(null);
  const shownFeedbackKeysRef = useRef<Set<string>>(new Set());
  const feedbackLoadedRef = useRef(false);
  const persistenceReadyRef = useRef(false);
  const ownerVisible = isHydratedOwnerVisible(ownerScopeKey, hydratedOwnerKey);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/capabilities", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<AiEntitlement> : null)
      .then((capability) => {
        if (!cancelled) setAiEntitlement(capability);
      })
      .catch(() => {
        if (!cancelled) setAiEntitlement(null);
      });
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  useEffect(() => {
    persistenceReadyRef.current = false;
    if (!ownerVisible) return;
    const timer = window.setTimeout(() => {
      persistenceReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ownerScopeKey, ownerVisible]);

  useEffect(() => {
    try {
      feedbackLoadedRef.current = false;
      activeRequestController.current?.abort();
      activeRequestController.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- owner switch must mask previous personal state
      setSettings({ ...DEFAULT_SETTINGS });
      setSessions([]);
      setMessages([]);
      setRecommendations([]);
      setNearMatches([]);
      setResearchOutcomeNotice(null);
      setStructuredRequest(null);
      setDraftWarnings([]);
      setFeedbackDialogRec(null);
      setNearMatches([]);
      setStructuredRequest(null);
      setDraftWarnings([]);
      setRecommendationStrictness("balanced");
      setInterpretationLoading(false);
      setRejected([]);
      setAddedIds({});
      setDismissedSignals({});
      setRecommendationFeedbackEvents([]);
      setRecommendationFeedbackEventsV2([]);
      setFeedbackDialogRec(null);
      setDataToggles({ ...DEFAULT_DATA_TOGGLES });
      setScopeMode("mixed");
      setResearchMode("library-only");
      setPendingClarification(null);
      setDebugInfo(null);
      setEngineStatus(null);
      setPlanningPolicy(null);
      setAiStorageError(null);
      activeContextRef.current = null;
      inFlightRequestId.current = null;
      inFlightPromptKey.current = null;
      setHydratedOwnerKey(null);
      if (!ownerScope) return;
      if (ownerScope.kind === "guest") {
        migrateLegacyPersonalDomainToGuest("ai", window.localStorage);
      }
      const storedPreferences = readAiPreferencesState(ownerScope);
      if (storedPreferences.status === "valid") {
        setSettings(storedPreferences.data.settings);
        setDataToggles(storedPreferences.data.dataToggles);
        setScopeMode(storedPreferences.data.scopeMode);
        setResearchMode(storedPreferences.data.researchMode);
        setRecommendationStrictness(storedPreferences.data.recommendationStrictness ?? "balanced");
      }
      const storedSessions = readAiSessionState(ownerScope);
      if (storedSessions.status === "valid") {
        setSessions(storedSessions.data.sessions as unknown as AiSession[]);
        const snap = storedSessions.data.activeSession as {
          v?: number;
          messages?: AiMessage[];
          recommendations?: AiRecommendation[];
          nearMatches?: AiNearMatchRecommendation[];
          structuredRequestV2?: RecommendationRequestV2 | null;
          rejected?: RejectedCandidate[];
          researchOutcomeNotice?: PublicResearchOutcomeNotice;
          addedIds?: Record<string, boolean>;
          pendingClarification?: { originalPrompt: string; question: string } | null;
          debugInfo?: AiDebugInfo | null;
          engineStatus?: AiEngineStatus | null;
          planningPolicy?: AiPlanningProviderPolicyStatus | null;
          activeContext?: AiActiveContext | null;
        } | undefined;
        if (snap?.v === ACTIVE_SESSION_VERSION) {
          if (Array.isArray(snap.messages)) setMessages(snap.messages);
          if (Array.isArray(snap.recommendations)) setRecommendations(snap.recommendations);
          if (Array.isArray(snap.nearMatches)) setNearMatches(snap.nearMatches);
          if (snap.structuredRequestV2) setStructuredRequest(snap.structuredRequestV2);
          if (Array.isArray(snap.rejected)) setRejected(snap.rejected);
          setResearchOutcomeNotice(snap.researchOutcomeNotice ?? null);
          if (snap.addedIds) setAddedIds(snap.addedIds);
          if (snap.pendingClarification) setPendingClarification(snap.pendingClarification);
          if (snap.debugInfo) setDebugInfo(snap.debugInfo);
          if (snap.engineStatus) setEngineStatus(snap.engineStatus);
          if (snap.planningPolicy) setPlanningPolicy(snap.planningPolicy);
          if (snap.activeContext) activeContextRef.current = snap.activeContext;
        }
      }
      const storedFeedback = readAiFeedbackState(ownerScope);
      if (storedFeedback.status === "valid") {
        setDismissedSignals(parseDismissedSignals(storedFeedback.data.dismissedSignals));
        setRecommendationFeedbackEvents(storedFeedback.data.recommendationEvents);
        setRecommendationFeedbackEventsV2(storedFeedback.data.recommendationEventsV2 ?? []);
      }
      setHydratedOwnerKey(ownerScope.key);
    } catch {
      // ignore
    } finally {
      feedbackLoadedRef.current = true;
    }
  }, [ownerScope, ownerScopeKey]);

  // R40 — Aktif oturumu localStorage'a yaz. Boş state → key silinir.
  useEffect(() => {
    if (!feedbackLoadedRef.current || !persistenceReadyRef.current || !ownerScope || !ownerVisible) return;
    try {
      const isEmpty =
        messages.length === 0 &&
        recommendations.length === 0 &&
        nearMatches.length === 0 &&
        !structuredRequest &&
        rejected.length === 0 &&
        Object.keys(addedIds).length === 0 &&
        !pendingClarification;
      if (isEmpty) {
        const result = writeAiSessionState(ownerScope, {
          version: 1,
          sessions: sessions as unknown as Record<string, unknown>[],
        });
        if (!result.ok) queueMicrotask(() => setAiStorageError(result.message));
        return;
      }
      const snap = {
        v: ACTIVE_SESSION_VERSION,
        messages,
        recommendations,
        nearMatches,
        structuredRequestV2: structuredRequest,
        rejected,
        researchOutcomeNotice,
        addedIds,
        pendingClarification,
        debugInfo,
        engineStatus,
        planningPolicy,
        activeContext: activeContextRef.current,
      };
      const result = writeAiSessionState(ownerScope, {
        version: 1,
        sessions: sessions as unknown as Record<string, unknown>[],
        activeSession: snap,
      });
      queueMicrotask(() => setAiStorageError(result.ok ? null : result.message));
    } catch {
      // ignore (kotanın dolması ya da JSON cycle gibi nadir durumlar)
    }
  }, [messages, recommendations, nearMatches, structuredRequest, rejected, researchOutcomeNotice, addedIds, pendingClarification, debugInfo, engineStatus, planningPolicy, ownerScope, ownerVisible, sessions]);

  useEffect(() => {
    if (!persistenceReadyRef.current || !ownerScope || !ownerVisible) return;
    try {
      const limited = limitDismissedSignals(dismissedSignals);
      if (Object.keys(limited).length === 0) {
        const result = writeAiFeedbackState(ownerScope, {
          version: 1,
          dismissedSignals: {},
          recommendationEvents: recommendationFeedbackEvents,
          recommendationEventsV2: recommendationFeedbackEventsV2,
        });
        if (!result.ok) queueMicrotask(() => setAiStorageError(result.message));
        return;
      }
      const result = writeAiFeedbackState(ownerScope, {
        version: 1,
        dismissedSignals: limited as unknown as Record<string, Record<string, unknown>>,
        recommendationEvents: recommendationFeedbackEvents,
        recommendationEventsV2: recommendationFeedbackEventsV2,
      });
      if (!result.ok) queueMicrotask(() => setAiStorageError(result.message));
      if (Object.keys(limited).length !== Object.keys(dismissedSignals).length) {
        // Cap'i aşan kayıtlar localStorage'a yazıldıktan sonra state'i normalize ediyoruz;
        // bu nadir bir trim olduğu için cascading render maliyeti kabul edilebilir.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissedSignals(limited);
      }
    } catch {
      // bozuk veya dolu localStorage app'i düşürmesin
    }
  }, [dismissedSignals, ownerScope, ownerVisible, recommendationFeedbackEvents, recommendationFeedbackEventsV2]);

  useEffect(() => {
    if (recommendations.length === 0) return;
    for (const rec of recommendations) {
      const shownKey = `${feedbackContextRef.current?.sessionId || "active"}:${feedbackKeyFromRec(rec)}`;
      if (shownFeedbackKeysRef.current.has(shownKey)) continue;
      shownFeedbackKeysRef.current.add(shownKey);
      recordRecommendationFeedback("shown", rec, {
        canAdd: !!rec.candidate?.globalSearch,
        inLibrary: !!rec.inLibrary,
      });
      recordExactFeedbackV2("shown", rec);
    }
    // recordRecommendationFeedback ref tabanlı bağlam okur; shown event'leri
    // yalnızca recommendation listesi değiştiğinde yazılmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations]);

  useEffect(() => {
    if (!persistenceReadyRef.current || !ownerScope || !ownerVisible) return;
    try {
      const result = writeAiPreferencesState(ownerScope, {
        version: 2,
        settings,
        dataToggles,
        scopeMode,
        researchMode,
        recommendationStrictness,
      });
      if (!result.ok) queueMicrotask(() => setAiStorageError(result.message));
    } catch {
      // ignore
    }
  }, [dataToggles, ownerScope, ownerVisible, researchMode, scopeMode, settings, recommendationStrictness]);

  // R34/R44 — araştırma modu route'a ayrıca gönderilir; web modu provider
  // context'inde de gerçek web araştırması olarak işaretlenir.
  // CLAUDE.md modal-style prev-prop kalıbı: render fazında karşılaştır, effect kullanma.
  const expectedUseWebResearch = researchMode === "web";
  if (settings.useWebResearch !== expectedUseWebResearch) {
    setSettings((prev) =>
      prev.useWebResearch === expectedUseWebResearch ? prev : { ...prev, useWebResearch: expectedUseWebResearch }
    );
  }

  // R19: AI sekmesi dışına çıkıldığında parent `resetSignal`'ı artırır;
  // bu effect tüm aktif sohbet state'ini ve refs'i temizliyordu. React 19'da
  // `react-hooks/set-state-in-effect` kuralı bu kalıba hata düşürüyor.
  // CLAUDE.md'deki "modal-style prev-prop karşılaştırması" kalıbına geçtik:
  //   - setState çağrıları render fazında, `lastResetSignal` izleme state'i
  //     üzerinden guard'lanmış olarak yapılır (cascading render'ı önler;
  //     `react-hooks/set-state-in-effect` tetiklemez).
  //   - Side-effect mutasyonları (timer/refs) ayrı bir useEffect içinde —
  //     render içinde ref.current yazmıyoruz (`react-hooks/refs` da temiz).
  const [lastResetSignal, setLastResetSignal] = useState(0);
  if (resetSignal !== lastResetSignal) {
    setLastResetSignal(resetSignal);
    if (resetSignal !== 0) {
      setMessages([]);
      setRecommendations([]);
      setRejected([]);
      setInput("");
      setViewingSessionId(null);
      setAddedIds({});
      setDebugInfo(null);
      setEngineStatus(null);
      setPlanningPolicy(null);
      setFeedbackNotice(null);
      setShowDebug(false);
      setPendingClarification(null);
      setLoadingStep(-1);
      setResearchOutcomeNotice(null);
    }
  }
  useEffect(() => {
    if (resetSignal === 0) return;
    activeRequestController.current?.abort();
    activeRequestController.current = null;
    if (stepTimer.current) clearTimeout(stepTimer.current);
    inFlightRequestId.current = null;
    inFlightPromptKey.current = null;
    activeContextRef.current = null;
    feedbackContextRef.current = null;
    shownFeedbackKeysRef.current.clear();
  }, [resetSignal]);

  const isLoading = loadingStep >= 0 && loadingStep < LOADING_STEPS.length;

  function persistSessions(next: AiSession[]) {
    setSessions(next);
  }

  function finishWith(
    prompt: string,
    recs: AiRecommendation[],
    assistantText: string,
    rejectedList: RejectedCandidate[],
    debug?: AiDebugInfo,
    requestId?: string,
    status?: AiEngineStatus,
    nearMatchList: AiNearMatchRecommendation[] = [],
    approvedRequest?: RecommendationRequestV2,
    outcomeNotice?: PublicResearchOutcomeNotice,
  ) {
    if (requestId && inFlightRequestId.current !== requestId) return;
    if (requestId) {
      inFlightRequestId.current = null;
      inFlightPromptKey.current = null;
    }
    const sessionId = requestId || generateId("session");
    feedbackContextRef.current = { sessionId, prompt };
    setRecommendations(recs);
    setNearMatches(nearMatchList);
    if (approvedRequest) setStructuredRequest(approvedRequest);
    setRejected(rejectedList);
    setResearchOutcomeNotice(outcomeNotice ?? null);
    setDebugInfo(debug || null);
    setEngineStatus(status || null);
    setFeedbackNotice(null);
    setShowDebug(false);
    if (debug?.retrieval?.needsClarification) {
      setPendingClarification({
        originalPrompt: prompt,
        question: debug.retrieval.clarificationQuestion || assistantText,
      });
    } else {
      setPendingClarification(null);
    }
    setMessages((prev) => [...prev, { id: generateId("msg"), role: "assistant", content: assistantText }]);
    setLoadingStep(-1);
    if (debug?.retrieval?.needsClarification) return;

    activeContextRef.current = {
      previousPrompt: prompt,
      lastAssistantMessage: assistantText,
      lastRecommendations: recs.map((r) => ({ title: r.title, mediaType: r.mediaType, source: r.source })),
      summary: debug?.activeContextSummary || `${prompt} -> ${assistantText.slice(0, 160)}`,
    };

    const sessionKey = `${prompt.trim().toLowerCase()}|${recs.map((r) => r.externalSource + ":" + r.externalId).join(",")}|${assistantText}`;
    if (lastPersistedSessionKey.current === sessionKey) {
      return;
    }
    lastPersistedSessionKey.current = sessionKey;

    const session: AiSession = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      prompt,
      assistantMessage: assistantText,
      recommendations: recs,
      nearMatches: nearMatchList,
      structuredRequestV2: approvedRequest,
      rejectedCandidates: rejectedList,
      researchOutcomeNotice: outcomeNotice,
      settings,
      debug,
      engineStatus: status,
    };
    persistSessions([
      session,
      ...sessions.filter((s) => `${s.prompt.trim().toLowerCase()}|${s.recommendations.map((r) => r.externalSource + ":" + r.externalId).join(",")}|${s.assistantMessage}` !== sessionKey),
    ].slice(0, MAX_SESSIONS));
  }

  async function runApi(prompt: string, activeContext?: AiActiveContext | null): Promise<{
    recs: AiRecommendation[];
    text: string;
    rejected: RejectedCandidate[];
    debug?: AiDebugInfo;
    engineStatus?: AiEngineStatus;
    nearMatches: AiNearMatchRecommendation[];
    researchOutcomeNotice?: PublicResearchOutcomeNotice;
  } | null> {
    const controller = new AbortController();
    activeRequestController.current?.abort();
    activeRequestController.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    // R35 — Veri toggle'larını sunucuya iletilecek AiSettings'e yansıt.
    // Notlar/Son aktiviteler de toggle ile gerçekten kapatılır (server tarafı
    // zaten useRecentActivity / usePersonalNotes'a saygı duyuyor).
    const effectiveSettings: AiSettings = {
      ...settings,
      useOpenAIProvider: settings.useOpenAIProvider && aiEntitlement?.canUseOpenAi === true,
      useRecentActivity: settings.useRecentActivity && dataToggles.recentActivity,
      usePersonalNotes: settings.usePersonalNotes && dataToggles.notes,
      includeRatings: dataToggles.ratings,
      includeFavorites: dataToggles.favorites,
      includeProgress: dataToggles.progress,
    };
    // R35 — Boş kütüphane: güvenli payload (server zaten boş kütüphaneyi
    // tolere ediyor ama mediaItems'in array olduğundan emin oluyoruz).
    const safeMediaItems = buildRecommendationMediaPayload(Array.isArray(mediaList) ? mediaList : [], {
      ratings: dataToggles.ratings,
      favorites: dataToggles.favorites,
      progress: dataToggles.progress,
      notes: dataToggles.notes && settings.usePersonalNotes,
      profile: settings.useProfile,
    });
    const safeProgressLogs = dataToggles.recentActivity && settings.useRecentActivity && Array.isArray(progressLogs)
      ? progressLogs.slice(-500)
      : [];
    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: prompt,
          mediaItems: safeMediaItems,
          progressLogs: safeProgressLogs,
          settings: effectiveSettings,
          recentContext: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          activeContext: activeContext || undefined,
          // R37 — Backend, source-apis modunda harici kaynak aday toplamayı
          // bu sinyallere göre tetikler.
          researchMode,
          scopeMode,
          // R39 — Session-level feedback: kullanıcının "İlgilenmiyorum"
          // dediği önerileri backend aday havuzundan filtrelesin.
          dismissed: Object.values(dismissedSignals),
          recommendationFeedback: recommendationFeedbackEvents,
          recommendationFeedbackV2: recommendationFeedbackEventsV2,
          structuredRequestV2: structuredRequest,
        }),
      });
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null) as {
          code?: string;
          capabilities?: import("@/features/recommendations/domain/evidence-capability").ConstraintEvidenceCapability[];
        } | null;
        if (
          res.status === 422
          && errorPayload?.code === "structured_request_capability_invalid"
          && structuredRequest
          && Array.isArray(errorPayload.capabilities)
        ) {
          return {
            recs: [],
            text: userFacingCapabilityValidationSummary({
              request: structuredRequest,
              capabilities: errorPayload.capabilities,
              availableVerifierModes,
            }),
            rejected: [],
            nearMatches: [],
          };
        }
        return null;
      }
      const data = await res.json();
      if (!Array.isArray(data?.recommendations)) return null;
      const recs: AiRecommendation[] = data.recommendations.map(
        (r: AiRecommendation, i: number) => ({
          id: r.id || `api-${Date.now()}-${i}`,
          title: r.title,
          mediaType: r.mediaType,
          source: r.source,
          externalSource: r.externalSource,
          externalId: r.externalId,
          coverUrl: r.coverUrl,
          overview: r.overview,
          fitLabel: r.fitLabel,
          reason: r.reason,
          risk: r.risk,
          communitySignal: r.communitySignal,
          inLibrary: r.inLibrary,
          candidate: r.candidate,
          resultKind: r.resultKind,
          evidenceSummary: r.evidenceSummary,
          researchEvidence: decodePublicResearchEvidenceSummary(r.researchEvidence) ?? undefined,
        })
      );
      return {
        recs,
        text: data.assistantMessage || buildAssistantMessage(prompt, settings, recs.length),
        rejected: Array.isArray(data.rejectedCandidates) ? data.rejectedCandidates : [],
        debug: data.debug,
        engineStatus: data.engineStatus,
        nearMatches: Array.isArray(data.nearMatches) ? data.nearMatches.slice(0, 3) : [],
        researchOutcomeNotice: decodePublicResearchOutcomeNotice(data.researchOutcomeNotice) ?? undefined,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      if (activeRequestController.current === controller) activeRequestController.current = null;
    }
  }

  function runStep(
    step: number,
    prompt: string,
    requestId: string,
    apiPromise: Promise<{
      recs: AiRecommendation[];
      text: string;
      rejected: RejectedCandidate[];
      debug?: AiDebugInfo;
      engineStatus?: AiEngineStatus;
      nearMatches: AiNearMatchRecommendation[];
      researchOutcomeNotice?: PublicResearchOutcomeNotice;
    } | null>
  ) {
    if (inFlightRequestId.current !== requestId) return;
    if (step >= LOADING_STEPS.length) {
      const finishWithClientFallback = () => {
        const localStatus = buildAiEngineStatus({
          provider: "mock",
          providerFallbackUsed: true,
          evaluatedCandidateCount: mediaList.length,
          candidates: [],
        });
        if (structuredRequest || researchMode === "source-apis" || researchMode === "web") {
          finishWith(prompt, [], buildExternalClientEmptyMessage(prompt, researchMode), [], undefined, requestId, localStatus);
          return;
        }
        const recs = buildLocalFallbackRecs(prompt, mediaList);
        const text = buildAssistantMessage(prompt, settings, recs.length);
        finishWith(prompt, recs, text, [], undefined, requestId, localStatus);
      };

      apiPromise
        .then((apiResult) => {
          if (inFlightRequestId.current !== requestId) return;
          if (apiResult) {
            finishWith(prompt, apiResult.recs, apiResult.text, apiResult.rejected, apiResult.debug, requestId, apiResult.engineStatus, apiResult.nearMatches, structuredRequest ?? undefined, apiResult.researchOutcomeNotice);
          } else {
            finishWithClientFallback();
          }
        })
        .catch(() => {
          if (inFlightRequestId.current !== requestId) return;
          finishWithClientFallback();
        })
        .finally(() => {
          if (inFlightRequestId.current !== requestId) return;
          inFlightRequestId.current = null;
          inFlightPromptKey.current = null;
          setLoadingStep(-1);
        });
      return;
    }
    setLoadingStep(step);
    stepTimer.current = setTimeout(() => runStep(step + 1, prompt, requestId, apiPromise), 550);
  }

  function dominantMediaType(): MediaType | null {
    const counts = new Map<MediaType, number>();
    for (const item of mediaList) {
      counts.set(item.type, (counts.get(item.type) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  }

  function parseShortTarget(answer: string): MediaType | "auto" | null {
    const lower = answer.toLowerCase().trim();
    if (/^(istediğin gibi|fark etmez|sen seç|sen bilirsin|herhangi biri)$/i.test(lower)) return "auto";
    if (/\b(dizi|tv)\b/i.test(lower)) return "tv";
    if (/\banime\b/i.test(lower)) return "anime";
    if (/\b(kitap|book)\b/i.test(lower)) return "book";
    if (/\b(manga)\b/i.test(lower)) return "manga";
    if (/\b(manhwa)\b/i.test(lower)) return "manhwa";
    if (/\b(manhua)\b/i.test(lower)) return "manhua";
    if (/\b(film|movie)\b/i.test(lower)) return "movie";
    return null;
  }

  function targetLabelForPrompt(type: MediaType): string {
    switch (type) {
      case "tv": return "dizi";
      case "book": return "kitap";
      case "movie": return "film";
      default: return type;
    }
  }

  function mergeClarificationPrompt(answer: string): string {
    if (!pendingClarification) return answer;
    const target = parseShortTarget(answer);
    if (!target) return answer;

    if (target === "auto") {
      const dominant = dominantMediaType();
      if (!dominant) {
        return pendingClarification.originalPrompt;
      }
      return `${pendingClarification.originalPrompt}. Profil çoğunluğuna göre ${targetLabelForPrompt(dominant)} hedef türünü varsay.`;
    }

    const label = targetLabelForPrompt(target);
    const original = pendingClarification.originalPrompt;
    if (/bir şey/i.test(original)) {
      return original.replace(/bir şey/gi, label);
    }
    return `${original}. Hedef medya türü: ${label}.`;
  }

  function isShortFollowUp(answer: string): boolean {
    const lower = answer.toLowerCase().trim();
    if (isExplicitNewTask(lower)) return false;
    if (lower.length > 60) return false;
    if (isShortTargetAnswer(lower)) return true;
    return isDependentFollowUp(lower);
  }

  function isDependentFollowUp(lower: string): boolean {
    return /^(yani\s+)?(sonu[cç]\s+olarak\s+)?(ne\s+öneriyorsun|ne\s+oneriyorsun|hangisini\s+se[cç]eyim|peki\s+hangisi|peki\s+ya\??|devam\s+et|devam|özetle|ozetle|kısaca|kisaca)$/i.test(lower);
  }

  function isExplicitNewTask(answer: string): boolean {
    const lower = answer.toLowerCase().trim();
    if (isDependentFollowUp(lower)) return false;
    if (/7\+|puan\s+verdi[ğg]im|k[üu]t[üu]phaneme\s+g[öo]re|\bgibi\b|\bbenzeri\b|\btarz[ıi]\b/i.test(lower)) return true;
    if (/\b(kitap|book|anime|dizi|tv|film|movie|manga|manhwa|manhua)\s+(öner|oner|tavsiye)\b/i.test(lower)) return true;
    return /\b(öner|oner|tavsiye)\b/i.test(lower) && lower.split(/\s+/).length > 3;
  }

  function isShortTargetAnswer(answer: string): boolean {
    const lower = answer.toLowerCase().trim();
    if (!parseShortTarget(lower)) return false;
    return /^(dizi|tv|anime|kitap|book|manga|manhwa|manhua|film|movie)(\s+(olsun|tabii ki|tabi ki))?$|^(istediğin gibi|istedigin gibi|fark etmez|sen seç|sen sec|sen bilirsin|herhangi biri)$/i.test(lower);
  }

  function mergeTargetIntoPrompt(original: string, answer: string): string {
    const target = parseShortTarget(answer);
    if (!target || target === "auto") return original;
    const label = targetLabelForPrompt(target);
    if (/bir şey/i.test(original)) {
      return original.replace(/bir şey/gi, label);
    }
    if (/bir şey/i.test(original)) {
      return original.replace(/bir şey/gi, label);
    }
    return `${original}. Hedef medya türü: ${label}.`;
  }

  function buildFollowUpRequest(rawPrompt: string): { prompt: string; activeContext: AiActiveContext | null } {
    if (pendingClarification) {
      if (isExplicitNewTask(rawPrompt)) {
        return { prompt: rawPrompt, activeContext: null };
      }
      const prompt = mergeClarificationPrompt(rawPrompt);
      return {
        prompt,
        activeContext: {
          previousPrompt: pendingClarification.originalPrompt,
          lastAssistantMessage: pendingClarification.question,
          followUpMessage: rawPrompt,
          followUpMerged: true,
          summary: `${pendingClarification.originalPrompt} -> ${rawPrompt}`,
        },
      };
    }

    const active = activeContextRef.current;
    if (active && isShortFollowUp(rawPrompt)) {
      const prompt = parseShortTarget(rawPrompt) ? mergeTargetIntoPrompt(active.previousPrompt, rawPrompt) : active.previousPrompt;
      return {
        prompt,
        activeContext: {
          ...active,
          previousPrompt: prompt,
          followUpMessage: rawPrompt,
          followUpMerged: true,
          summary: `${active.previousPrompt} -> ${rawPrompt}`,
        },
      };
    }

    return { prompt: rawPrompt, activeContext: null };
  }

  function executeRecommendation(text?: string) {
    const rawPrompt = (text ?? input).trim();
    if (!rawPrompt || isLoading || inFlightRequestId.current) return;
    const { prompt, activeContext } = buildFollowUpRequest(rawPrompt);
    const promptKey = `${prompt}|${activeContext?.followUpMessage || ""}`.toLowerCase();
    if (inFlightPromptKey.current === promptKey) return;
    setViewingSessionId(null);
    setInput("");
    setRecommendations([]);
    setRejected([]);
    setResearchOutcomeNotice(null);
    setDebugInfo(null);
    setEngineStatus(null);
    setFeedbackNotice(null);
    setShowDebug(false);
    const requestId = generateId("req");
    inFlightRequestId.current = requestId;
    inFlightPromptKey.current = promptKey;
    const apiPromise = runApi(prompt, activeContext);
    runStep(0, prompt, requestId, apiPromise);
  }

  async function handleSend(text?: string) {
    const rawPrompt = (text ?? input).trim();
    if (!rawPrompt || isLoading || interpretationLoading) return;
    const messageId = generateId("msg");
    setInterpretationLoading(true);
    setViewingSessionId(null);
    try {
      const response = await fetch("/api/ai/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: rawPrompt,
          mediaItems: buildInterpretReferencePayload(Array.isArray(mediaList) ? mediaList : []),
          settings: {
            useProfile: settings.useProfile,
            useOpenAIProvider: settings.useOpenAIProvider,
          },
          strictness: recommendationStrictness,
          previousStructuredRequestV2: structuredRequest ?? undefined,
        }),
      });
      const data = await response.json();
      if (data?.resetRequested) {
        handleNewTopic();
        return;
      }
      if (!response.ok || !data?.request) {
        setPendingClarification({ originalPrompt: rawPrompt, question: data?.clarificationQuestion || "İstek çözümlenemedi; hedef medya türünü ve sınırları netleştirir misin?" });
        return;
      }
      const draft = data.request as RecommendationRequestV2;
      setPlanningPolicy(data.planningPolicy as AiPlanningProviderPolicyStatus ?? null);
      setStructuredRequest(draft);
      setRecommendationStrictness(draft.strictness);
      setDraftWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setAvailableVerifierModes(Array.isArray(data.availableVerifierModes) ? data.availableVerifierModes : []);
      setPendingClarification(null);
      setRecommendations([]);
      setNearMatches([]);
      setRejected([]);
      setEngineStatus(null);
      setMessages((prev) => appendRecommendationMessage(prev, { id: messageId, role: "user", content: rawPrompt }));
      setInput("");
    } catch {
      setPendingClarification({ originalPrompt: rawPrompt, question: "İstek özeti hazırlanamadı. Tekrar dener misin?" });
    } finally {
      setInterpretationLoading(false);
    }
  }

  function handleFindRecommendations() {
    if (!structuredRequest || interpretationLoading) return;
    executeRecommendation(structuredRequest.queryText);
  }

  function handleModeClick(mode: AdvisorMode) {
    if (isLoading || inFlightRequestId.current) return;
    const effectiveScope: ScopeMode = mode === "one-per-world" ? "one-per-world" : scopeMode;
    const prompt = buildModePrompt(mode, effectiveScope, researchMode, dataToggles);
    handleSend(prompt);
  }

  function handleNewTopic() {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    activeRequestController.current?.abort();
    activeRequestController.current = null;
    inFlightRequestId.current = null;
    inFlightPromptKey.current = null;
    setMessages([]);
    setRecommendations([]);
    setNearMatches([]);
    setStructuredRequest(null);
    setDraftWarnings([]);
    setFeedbackDialogRec(null);
    setRejected([]);
    setResearchOutcomeNotice(null);
    setInput("");
    setViewingSessionId(null);
    setAddedIds({});
    setDebugInfo(null);
    setEngineStatus(null);
    setPlanningPolicy(null);
    setFeedbackNotice(null);
    setShowDebug(false);
    setPendingClarification(null);
    setLoadingStep(-1);
    feedbackContextRef.current = null;
    activeContextRef.current = null;
    shownFeedbackKeysRef.current.clear();
  }

  function handleViewSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    setViewingSessionId(id);
    feedbackContextRef.current = { sessionId: id, prompt: s.prompt };
    setMessages([]);
    setRecommendations(s.recommendations);
    setNearMatches(s.nearMatches ?? []);
    setStructuredRequest(s.structuredRequestV2 ?? null);
    setRejected(s.rejectedCandidates || []);
    setResearchOutcomeNotice(s.researchOutcomeNotice ?? null);
    setDebugInfo(s.debug || null);
    setEngineStatus(s.engineStatus || null);
    setFeedbackNotice(null);
    setShowDebug(false);
    setPendingClarification(null);
    activeContextRef.current = null;
    setInput("");
  }

  async function handleAddRec(rec: AiRecommendation) {
    if (rec.inLibrary || addedIds[rec.id]) return;
    const gs = rec.candidate?.globalSearch;
    if (!gs) return; // library veya eksik adayda Quick Add yok
    setAddedIds((prev) => ({ ...prev, [rec.id]: true }));
    try {
      await onAddToLibrary(gs);
      recordRecommendationFeedback("added", rec, {
        canAdd: true,
        inLibrary: true,
      });
      recordExactFeedbackV2("added", rec);
    } catch {
      // ekleme başarısız olursa state geri al
      setAddedIds((prev) => {
        const next = { ...prev };
        delete next[rec.id];
        return next;
      });
    }
  }

  // R38/R39 — local feedback ve chat'e bağlı aksiyonlar.
  function recordRecommendationFeedback(
    action: RecommendationFeedbackAction,
    rec: AiRecommendation,
    metadata?: { canAdd?: boolean; inLibrary?: boolean }
  ) {
    if (!ownerScope || !ownerVisible) return;
    const persisted = appendScopedRecommendationFeedbackEvent(ownerScope, {
      action,
      recommendationId: rec.id,
      title: rec.title,
      mediaType: rec.mediaType,
      source: rec.source,
      externalSource: rec.externalSource,
      externalId: rec.externalId,
      sessionId: feedbackContextRef.current?.sessionId || viewingSessionId || undefined,
      metadata: {
        fitLabel: rec.fitLabel,
        inLibrary: metadata?.inLibrary ?? !!rec.inLibrary,
        canAdd: metadata?.canAdd ?? !!rec.candidate?.globalSearch,
      },
    });
    if (persisted) {
      setAiStorageError(null);
      setRecommendationFeedbackEvents((current) => [...current, persisted].slice(-1000));
    } else {
      setAiStorageError("AI feedback yerel owner storage alanina kaydedilemedi.");
    }
  }

  function handleDismissRec(rec: AiRecommendation) {
    if ((!rec.externalSource || !rec.externalId) && !rec.candidate?.libraryItemId) {
      setFeedbackNotice("Bu önerinin doğrulanmış kimliği olmadığı için kalıcı feedback kaydedilmedi.");
      return;
    }
    const signal = feedbackSignalFromRec(rec);
    const key = feedbackKeyFromSignal(signal);
    setDismissedSignals((prev) => {
      const next = { ...prev };
      delete next[key];
      next[key] = signal;
      return limitDismissedSignals(next);
    });
    setFeedbackDialogRec(rec);
    setFeedbackNotice("Öneri exact kimliğiyle gizlendi. İstersen nedenini seçebilirsin.");
  }

  function feedbackV2Identity(rec: AiRecommendation): RecommendationFeedbackEventV2["candidateIdentity"] | null {
    if (rec.externalSource && rec.externalSource !== "library" && rec.externalId) {
      return { kind: "provider", provider: rec.externalSource, externalId: rec.externalId, mediaType: rec.mediaType as import("@/features/recommendations/domain/types").RecommendationMediaType };
    }
    if (rec.candidate?.libraryItemId) return { kind: "library", libraryItemId: rec.candidate.libraryItemId, mediaType: rec.mediaType as import("@/features/recommendations/domain/types").RecommendationMediaType };
    return null;
  }

  function recordExactFeedbackV2(action: RecommendationFeedbackEventV2["action"], rec: AiRecommendation) {
    if (!ownerScope || !ownerVisible) return;
    const candidateIdentity = feedbackV2Identity(rec);
    if (!candidateIdentity) return;
    const event = appendScopedRecommendationFeedbackEventV2(ownerScope, {
      action, candidateIdentity,
      sessionId: feedbackContextRef.current?.sessionId || viewingSessionId || undefined,
      resultKind: rec.resultKind === "near_match" ? "near_match" : "primary",
      aspectIds: [], constraintKeys: [], metadata: { fitLabel: rec.fitLabel },
    });
    if (event) setRecommendationFeedbackEventsV2((current) => [...current, event].slice(-1000));
  }

  function feedbackAspectIds(reason: RecommendationFeedbackReasonCode): RecommendationFeedbackEventV2["aspectIds"] {
    if (reason === "love_triangle" || reason === "fanservice" || reason === "violence_gore") return [reason];
    if (reason === "weak_requested_aspect" || reason === "too_much_aspect") {
      return structuredRequest?.aspectConstraints.slice(0, 1).map((item) => item.aspectId) ?? [];
    }
    if (reason === "wrong_tone") return structuredRequest?.aspectConstraints.filter((item) => ASPECT_REGISTRY[item.aspectId].group === "tone_content").map((item) => item.aspectId) ?? [];
    return [];
  }

  function recordFeedbackReason(rec: AiRecommendation, reasonCode: RecommendationFeedbackReasonCode) {
    if (!ownerScope || !ownerVisible) return;
    const candidateIdentity = feedbackV2Identity(rec);
    if (!candidateIdentity) return;
    const event = appendScopedRecommendationFeedbackEventV2(ownerScope, {
      action: "dismissed",
      candidateIdentity,
      sessionId: feedbackContextRef.current?.sessionId || viewingSessionId || undefined,
      resultKind: rec.resultKind === "near_match" ? "near_match" : "primary",
      reasonCode,
      aspectIds: feedbackAspectIds(reasonCode),
      constraintKeys: structuredRequest?.aspectConstraints.filter((constraint) => feedbackAspectIds(reasonCode).includes(constraint.aspectId)).map((constraint) => constraint.id) ?? [],
      metadata: { fitLabel: rec.fitLabel, ...(reasonCode === "too_long" ? { objectiveField: "length" as const } : {}), ...(reasonCode === "ongoing_not_wanted" ? { objectiveField: "release_status" as const } : {}) },
    });
    if (event) setRecommendationFeedbackEventsV2((current) => [...current, event].slice(-1000));
    setFeedbackDialogRec(null);
  }
  function handleUndoDismissRec(rec: AiRecommendation) {
    const key = feedbackKeyFromRec(rec);
    if (!ownerScope || !ownerVisible) return;
    removeScopedDismissedRecommendationFeedback(ownerScope, {
      title: rec.title,
      mediaType: rec.mediaType,
      externalSource: rec.externalSource,
      externalId: rec.externalId,
    });
    setRecommendationFeedbackEvents((current) => current.filter(
      (event) => event.action !== "dismissed"
        || (rec.externalSource && rec.externalId
          ? event.externalSource !== rec.externalSource || event.externalId !== rec.externalId
          : event.mediaType !== rec.mediaType
            || event.title.trim().toLowerCase() !== rec.title.trim().toLowerCase()),
    ));
    setRecommendationFeedbackEventsV2((current) => current.filter((event) => {
      if (event.action !== "dismissed") return true;
      return event.candidateIdentity.kind !== "provider" || event.candidateIdentity.provider !== rec.externalSource || event.candidateIdentity.externalId !== rec.externalId;
    }));
    setDismissedSignals((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFeedbackNotice("İlgilenmiyorum tercihi geri alındı.");
  }
  function handleClearDismissedFeedback() {
    if (!ownerScope || !ownerVisible) return;
    if (!window.confirm("Bu owner için gizlenen AI önerilerini ve nedenlerini sıfırlamak istiyor musun?")) return;
    clearScopedDismissedRecommendationFeedback(ownerScope);
    setRecommendationFeedbackEvents((current) => current.filter(
      (event) => event.action !== "dismissed",
    ));
    setRecommendationFeedbackEventsV2((current) => current.filter((event) => event.action !== "dismissed"));
    setDismissedSignals({});
    setFeedbackNotice("İlgilenmiyorum kayıtları temizlendi.");
  }
  function handleSimilarRec(rec: AiRecommendation) {
    if (isLoading || inFlightRequestId.current) return;
    recordRecommendationFeedback("similar_requested", rec);
    recordExactFeedbackV2("similar_requested", rec);
    handleSend(buildSimilarPrompt(rec));
  }
  function handleOpenDiscoverFor(rec: AiRecommendation) {
    recordRecommendationFeedback("open_discover", rec);
    recordExactFeedbackV2("open_discover", rec);
    if (onOpenDiscover) onOpenDiscover(rec);
  }

  const transparencyText = useMemo(() => {
    const data: string[] = [];
    if (dataToggles.ratings) data.push("puanlar");
    if (dataToggles.favorites) data.push("favoriler");
    if (dataToggles.progress) data.push("ilerleme grupları");
    if (settings.useRecentActivity && dataToggles.recentActivity) data.push("son aktiviteler");
    if (settings.usePersonalNotes && dataToggles.notes) data.push("kişisel notlar");
    const dataLabel = data.length > 0 ? data.join(", ") : "yalnızca istek metni";
    const research =
      researchMode === "library-only"
        ? "yalnızca kütüphane içi adaylar"
        : researchMode === "source-apis"
        ? "kaynak API adayları"
        : "web araştırması + kaynak doğrulaması";
    const deep = settings.deepResearch ? ", derin araştırma" : "";
    return `Bu istekte kullanılacaklar: ${dataLabel}; araştırma modu: ${research}${deep}.`;
  }, [settings, dataToggles, researchMode]);

  const profileSummary = useMemo(() => {
    return `${mediaList.length} medya · ${progressLogs.length} aktivite kaydı`;
  }, [mediaList.length, progressLogs.length]);

  const viewingSession = viewingSessionId ? sessions.find((s) => s.id === viewingSessionId) : null;
  const dismissedFeedbackCount = Object.keys(dismissedSignals).length;
  const visibleProviderPolicyMode = engineStatus?.providerPolicyMode ?? planningPolicy?.providerPolicyMode;
  const configuredPlanningProvider = engineStatus?.configuredPlanningProvider
    ?? planningPolicy?.configuredPlanningProvider;
  const openAiPreferenceLocked = aiEntitlement?.canUseOpenAi !== true
    || (visibleProviderPolicyMode !== undefined && visibleProviderPolicyMode !== "auto");

  if (!ownerVisible) {
    return (
      <section className="app-panel rounded-2xl border p-6" aria-busy="true">
        <p className="text-sm text-[var(--app-text-muted)]">
          Kisisel AI durumu guvenli owner scope icin yukleniyor...
        </p>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] gap-6 2xl:gap-8">
      {aiStorageError && (
        <p role="alert" className="rounded-xl border border-[var(--app-danger)] bg-[var(--app-danger-soft)] p-3 text-sm text-[var(--app-danger)] lg:col-span-2">
          {aiStorageError} Degisiklik bu owner icin kalici olmayabilir.
        </p>
      )}
      <div className="space-y-5 min-w-0">
        {/* Başlık */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-zinc-100">AI Danışman</h2>
              <p className="text-xs text-zinc-500">{profileSummary}</p>
            </div>
          </div>
          {(messages.length > 0 || recommendations.length > 0 || viewingSessionId) && (
            <button
              onClick={handleNewTopic}
              title="Aktif AI sohbetini ve önerileri temizler; ilgilenmiyorum feedback'i kalır"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800/70 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
            >
              <X className="w-3.5 h-3.5" />
              Konuyu kapat
            </button>
          )}
        </div>

        {/* R34 — Mod kartları */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Ne yapmak istersin?</p>
            <span className="hidden sm:inline text-[10px] text-zinc-600">Kartlara basınca öneri akışı tetiklenir</span>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2">
            {MODE_CARDS.map((m) => {
              const Icon = m.icon;
              const disabled = isLoading;
              return (
                <button
                  key={m.key}
                  onClick={() => handleModeClick(m.key)}
                  disabled={disabled}
                  className="group text-left p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/70 hover:border-violet-500/40 hover:bg-zinc-900/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-violet-300" />
                    </div>
                    <span className="text-sm font-medium text-zinc-100 truncate">{m.label}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">{m.hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* R34 — Öneri kapsamı */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-zinc-500" />
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Öneri kapsamı</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SCOPE_OPTIONS.map((opt) => {
              const active = scopeMode === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setScopeMode(opt.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                    active
                      ? "bg-violet-500/20 text-violet-200 border-violet-500/50"
                      : "bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* R34 — Araştırma modu */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Araştırma modu</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {RESEARCH_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = researchMode === opt.key;
              const disabled = opt.key !== "library-only" && aiEntitlement?.canUseServerProviders !== true;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => { if (!disabled) setResearchMode(opt.key); }}
                  className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer min-w-0 ${
                    active
                      ? "bg-violet-500/15 border-violet-500/40"
                      : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? "text-violet-300" : "text-zinc-500"}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate ${active ? "text-violet-100" : "text-zinc-300"}`}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-zinc-500 leading-snug line-clamp-2">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Şeffaflık */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
          <ShieldCheck className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
          <p className="text-xs text-zinc-400 leading-relaxed">{transparencyText}</p>
        </div>

        {/* Boş durum */}
        {messages.length === 0 && recommendations.length === 0 && !viewingSessionId && (
          <div className="space-y-3">
            {mediaList.length === 0 ? (
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-center">
                <Sparkles className="w-5 h-5 text-violet-400 mx-auto mb-2" />
                <p className="text-sm text-zinc-200 mb-1">Kütüphanen boş görünüyor.</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  AI Danışman en iyi sonucu birkaç eklediğin eserle verir. Önce <span className="text-zinc-300">Keşfet</span> sekmesinden birkaç şey ekle, sonra burada
                  &ldquo;Öneri Al&rdquo; veya &ldquo;Yarım Kalanlar&rdquo; modlarını dene. İstersen yine de aşağıdaki örnek istekleri sorabilirsin.
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Örnek istekler</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="text-left px-4 py-3 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/40 hover:bg-zinc-900/70 transition-colors text-sm text-zinc-300 cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewingSession && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
            <div className="min-w-0">
              <p className="text-xs text-violet-300 uppercase tracking-wide">Geçmiş öneri oturumu</p>
              <p className="text-sm text-zinc-200 truncate">{viewingSession.prompt}</p>
            </div>
            <span className="text-xs text-zinc-500 shrink-0">
              {new Date(viewingSession.createdAt).toLocaleString("tr-TR")}
            </span>
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-3 rounded-xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-violet-500/10 border border-violet-500/20 text-zinc-100 ml-auto max-w-[90%] sm:max-w-[85%]"
                    : "bg-zinc-900/50 border border-zinc-800/60 text-zinc-300"
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>
        )}

        {structuredRequest && (
          <ParsedRequestPanel
            request={structuredRequest}
            warnings={draftWarnings}
            availableVerifierModes={availableVerifierModes}
            onChange={(next) => {
              setStructuredRequest(next);
              setRecommendationStrictness(next.strictness);
              setRecommendations([]);
              setNearMatches([]);
              setFeedbackNotice("İstek değişti; mevcut sonuçlar temizlendi. Yeni arama başlatabilirsin.");
            }}
          />
        )}

        {(isLoading || interpretationLoading) && (
          <div className="space-y-2 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
            {LOADING_STEPS.map((label, i) => {
              const done = i < loadingStep;
              const active = i === loadingStep;
              return (
                <div key={label} className="flex items-center gap-2 text-sm">
                  {done ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : active ? (
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-zinc-700" />
                  )}
                  <span className={done ? "text-zinc-500" : active ? "text-zinc-200" : "text-zinc-600"}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {engineStatus && !isLoading && (
          <div className="rounded-xl bg-zinc-950/30 border border-zinc-800/60 overflow-hidden">
            <button
              onClick={() => setShowDebug((prev) => !prev)}
              aria-expanded={showDebug}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
                Öneri Motoru Durumu
              </span>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showDebug ? "rotate-90" : ""}`} />
            </button>
            {showDebug && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 pb-3">
                {[
                  ["AI provider", `${providerLabel(engineStatus.provider)}${engineStatus.model ? ` · ${engineStatus.model}` : ""}`],
                  ["Embedding", embeddingLabel(engineStatus.embeddingMode)],
                  ["Provider fallback", engineStatus.providerFallbackUsed ? "Kullanıldı" : "Kullanılmadı"],
                  ["Değerlendirilen aday", String(engineStatus.evaluatedCandidateCount)],
                  ["Kaynaklar", engineStatus.sources.length > 0 ? engineStatus.sources.join(", ") : "Kaynak yok"],
                  ["Feedback sinyali", engineStatus.feedbackApplied ? `Uygulandı · ${engineStatus.feedbackEventCount} kayıt` : engineStatus.feedbackEventCount > 0 ? `${engineStatus.feedbackEventCount} kayıt, bu sonuçta skor değişmedi` : "Sinyal yok"],
                  ["Persistent cache", persistentCacheLabel(engineStatus.persistentCache)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-zinc-800/60 bg-zinc-900/35 px-2.5 py-2 min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-300 break-words">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <EngineTransparency status={engineStatus} settings={{ ...settings, includeRatings: dataToggles.ratings, includeFavorites: dataToggles.favorites, includeProgress: dataToggles.progress }} profileEnabled={structuredRequest?.profileSignalsEnabled ?? settings.useProfile} />

        <ResearchOutcomeNotice notice={researchOutcomeNotice ?? undefined} />

        {feedbackNotice && (
          <p role="status" className="px-3 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-300/90">
            {feedbackNotice}
          </p>
        )}

        {/* R38 — Öneri kartları */}
        {recommendations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {recommendations.map((rec) => {
              const added = addedIds[rec.id] || rec.inLibrary;
              const canAdd = !!rec.candidate?.globalSearch;
              const dismissed = !!dismissedSignals[feedbackKeyFromRec(rec)];
              const reasonBullets = buildReasonBullets(rec);
              const contextLabels = recommendationContextLabels(rec);
              const releaseYear = rec.candidate?.releaseYear;
              return (
                <div
                  key={rec.id}
                  className={`group relative p-4 rounded-2xl border min-w-0 transition-opacity ${
                    dismissed
                      ? "bg-zinc-900/20 border-zinc-800/40 opacity-40"
                      : "bg-zinc-900/50 border-zinc-800/60"
                  }`}
                >
                <RecommendationCardHeader title={rec.title} coverUrl={rec.coverUrl} mediaType={rec.mediaType} source={rec.source} releaseYear={releaseYear} badge={rec.fitLabel} />
                <div className="mt-2 min-w-0">
                    {rec.overview && (
                      <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                        {rec.overview}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {contextLabels.map((label) => (
                        <span key={`${rec.id}-${label}`} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/70 text-zinc-400 border border-zinc-700/60">
                          {label}
                        </span>
                      ))}
                    </div>
                </div>

                {reasonBullets.length > 0 && (
                  <div className="mt-3 p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/15">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Lightbulb className="w-3 h-3 text-violet-300/80" />
                      <span className="text-[10px] uppercase tracking-wider text-violet-300/80 font-medium">
                        Neden önerildi
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {reasonBullets.map((b, i) => (
                        <li
                          key={`${rec.id}-reason-${i}`}
                          className="text-xs text-zinc-300 leading-relaxed flex gap-1.5 min-w-0"
                        >
                          <span className="text-violet-300/70 shrink-0">•</span>
                          <span className="min-w-0 break-words">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <EvidenceSummary items={rec.evidenceSummary} />
                <ResearchEvidenceDisclosure evidence={rec.researchEvidence} />

                {(rec.risk || rec.communitySignal) && (
                  <div className="mt-2 space-y-1">
                    {rec.risk && (
                      <p className="text-xs text-amber-300/80 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">{rec.risk}</span>
                      </p>
                    )}
                    {rec.communitySignal && (
                      <p className="text-[11px] text-zinc-500 leading-relaxed break-words">
                        {rec.communitySignal}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {canAdd ? (
                    <button
                      disabled={!!added}
                      onClick={() => handleAddRec(rec)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        added
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                          : "bg-violet-500/15 text-violet-300 border-violet-500/30 hover:bg-violet-500/25 cursor-pointer"
                      }`}
                    >
                      {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {added ? "Listede" : "Listeye Ekle"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenDiscoverFor(rec)}
                      title="Keşfet sekmesinde elle ara"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 text-zinc-300 border border-zinc-700 hover:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Keşfet&apos;te Ara
                    </button>
                  )}

                  <button
                    onClick={() => handleSimilarRec(rec)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900/60 text-zinc-300 border border-zinc-800 hover:bg-zinc-800/70 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    Buna benzer
                  </button>

                  {dismissed ? (
                    <button
                      onClick={() => handleUndoDismissRec(rec)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/70 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Geri al
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDismissRec(rec)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900/40 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:bg-zinc-900/70 cursor-pointer transition-colors"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      İlgilenmiyorum
                    </button>
                  )}
                </div>
                </div>
              );
            })}
          </div>
        )}

        {engineStatus && !isLoading && recommendations.length === 0 && (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Uygun eser bulamadım</h3>
            <p className="mt-1 text-xs text-zinc-400">{userFacingNoResultSummary({ rejectedReasons: rejected.map((item) => item.reason), providerFallbackUsed: engineStatus.providerFallbackUsed, evaluatedCandidateCount: engineStatus.evaluatedCandidateCount, rankedTagNoResultReason: engineStatus.rankedTagNoResultReason, rankedTagAspectLabel: structuredRequest?.aspectConstraints.find((constraint) => constraint.role === "must" && ASPECT_REGISTRY[constraint.aspectId].defaultEvidenceStrategy === "ranked_tag") ? userFacingConstraintLabel(structuredRequest.aspectConstraints.find((constraint) => constraint.role === "must" && ASPECT_REGISTRY[constraint.aspectId].defaultEvidenceStrategy === "ranked_tag")!) : undefined })}</p>
            {structuredRequest && [...structuredRequest.aspectConstraints, ...structuredRequest.objectiveConstraints].filter((constraint) => constraint.role === "must").length > 0 && <p className="mt-1 text-xs text-zinc-500">Daraltan koşullar: {[...structuredRequest.aspectConstraints, ...structuredRequest.objectiveConstraints].filter((constraint) => constraint.role === "must").map(userFacingConstraintLabel).join(", ")}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {structuredRequest?.strictness !== "exploratory" && <button type="button" onClick={() => structuredRequest && setStructuredRequest({ ...structuredRequest, strictness: "exploratory" })} className="text-xs text-violet-300">Keşifçi moda geç</button>}
              {structuredRequest?.aspectConstraints.some((constraint) => constraint.role === "must" && constraint.minimumLevel === "primary") && <button type="button" onClick={() => setStructuredRequest((current) => current ? { ...current, aspectConstraints: current.aspectConstraints.map((constraint) => constraint.role === "must" && constraint.minimumLevel === "primary" ? { ...constraint, minimumLevel: "significant", source: "explicit" } : constraint) } : current)} className="text-xs text-violet-300">{userFacingConstraintLabel(structuredRequest.aspectConstraints.find((constraint) => constraint.role === "must" && constraint.minimumLevel === "primary")!)} için “Belirgin veya ana unsur” seç</button>}
              {structuredRequest?.aspectConstraints.some((constraint) => constraint.role === "must") && <button type="button" onClick={() => setStructuredRequest((current) => current ? { ...current, aspectConstraints: current.aspectConstraints.map((constraint, index) => index === current.aspectConstraints.findIndex((item) => item.role === "must") ? { ...constraint, role: "prefer", source: "explicit", rejectAtLevel: undefined } : constraint) as RecommendationRequestV2["aspectConstraints"] } : current)} className="text-xs text-violet-300">{userFacingConstraintLabel(structuredRequest.aspectConstraints.find((constraint) => constraint.role === "must")!)} koşulunu tercihe çevir</button>}
              {structuredRequest?.objectiveConstraints.some((constraint) => constraint.field === "length" || constraint.field === "release_status") && <button type="button" onClick={() => setStructuredRequest((current) => current ? { ...current, objectiveConstraints: current.objectiveConstraints.filter((constraint) => constraint.field !== "length" && constraint.field !== "release_status") } : current)} className="text-xs text-violet-300">Süre/yayın filtresini kaldır</button>}
              {researchMode === "library-only" && aiEntitlement?.canUseServerProviders === true && <button type="button" onClick={() => setResearchMode("source-apis")} className="text-xs text-violet-300">Provider kapsamını genişlet</button>}
            </div>
          </section>
        )}

        <NearMatchSection
          strictness={structuredRequest?.strictness ?? recommendationStrictness}
          items={nearMatches}
          onAdd={handleAddRec}
          onDiscover={handleOpenDiscoverFor}
          onDismiss={handleDismissRec}
        />

        {/* Elenen adaylar */}
        {rejected.length > 0 && (
          <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Elenenler</p>
            <ul className="space-y-1.5">
              {rejected.slice(0, 3).map((r, i) => (
                <li key={`rejected-${i}-${r.title}`} className="text-xs text-zinc-400">
                  <span className="text-zinc-300">{r.title}</span> — {userFacingRejectionReason(r.reason)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <RequestComposer
          value={input}
          onChange={setInput}
          onInterpret={() => void handleSend()}
          onRecommend={handleFindRecommendations}
          hasDraft={Boolean(structuredRequest)}
          loading={isLoading || interpretationLoading}
        />
      </div>

      <aside className="space-y-4">
        {/* R34 — Kullanılacak veriler */}
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
          <h3 className="text-sm font-semibold text-zinc-200 mb-1">Kullanılacak veriler</h3>
          <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">
            AI Danışman önerileri hazırlarken hangi profil bilgilerinden besleneceğini seç.
          </p>
          <div className="space-y-1">
            {DATA_TOGGLE_META.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 cursor-pointer"
              >
                <span className="text-xs text-zinc-300">{label}</span>
                <input
                  type="checkbox"
                  checked={dataToggles[key]}
                  onChange={(e) =>
                    setDataToggles((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="accent-violet-500 cursor-pointer"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Gelişmiş / sağlayıcı */}
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Gelişmiş</h3>
          <div className="space-y-2">
            {(
              [
                ["usePersonalNotes", "Kişisel notlarımı dahil et"],
                ["deepResearch", "Derin araştırma modu"],
                ["useOpenAIProvider", "OpenAI API kullan"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 cursor-pointer"
              >
                <span className="text-xs text-zinc-300">
                  {label}
                  {key === "useOpenAIProvider" ? (
                    <span className="block text-[10px] text-zinc-500 mt-0.5">
                      {visibleProviderPolicyMode === "fixed"
                        ? `Sağlayıcı modu sabit: ${configuredPlanningProvider ? providerLabel(configuredPlanningProvider) : "yapılandırılmış provider"}. OpenAI tercihi uygulanmaz.`
                        : visibleProviderPolicyMode === "mock"
                          ? "Sağlayıcı modu mock. OpenAI tercihi uygulanmaz."
                          : aiEntitlement?.canUseOpenAi !== true
                            ? "Server provider erişimi bu hesap için kapalı."
                            : "Otomatik modda OpenAI arama planında ilk denenir; final sıralama değişmez."}
                    </span>
                  ) : null}
                </span>
                <input
                  type="checkbox"
                  checked={key === "useOpenAIProvider" ? settings[key] && aiEntitlement?.canUseOpenAi === true : settings[key]}
                  disabled={key === "useOpenAIProvider" && openAiPreferenceLocked}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="accent-violet-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            ))}
            <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg">
              <span className="text-xs text-zinc-300">
                Feedback kayıtları
                <span className="block text-[10px] text-zinc-500 mt-0.5">
                  {dismissedFeedbackCount} / {MAX_DISMISSED_FEEDBACK} ilgilenmiyorum kaydı
                </span>
              </span>
              <button
                type="button"
                onClick={handleClearDismissedFeedback}
                disabled={dismissedFeedbackCount === 0}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/70 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Feedback&apos;i sıfırla
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-zinc-400" />
            Son Oturumlar
          </h3>
          {sessions.length === 0 ? (
            <p className="text-xs text-zinc-500">Henüz oturum yok.</p>
          ) : (
            <div className="space-y-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleViewSession(s.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    viewingSessionId === s.id
                      ? "bg-violet-500/15 border border-violet-500/30"
                      : "hover:bg-zinc-800/40 border border-transparent"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-200 truncate">{s.prompt}</p>
                    <p className="text-[10px] text-zinc-500">
                      {new Date(s.createdAt).toLocaleDateString("tr-TR")} ·{" "}
                      {s.recommendations.length} öneri
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
      <FeedbackReasonDialog
        open={Boolean(feedbackDialogRec)}
        title={feedbackDialogRec?.title ?? "Öneri"}
        onSelect={(reason) => feedbackDialogRec && recordFeedbackReason(feedbackDialogRec, reason)}
        onClose={() => {
          if (feedbackDialogRec) recordFeedbackReason(feedbackDialogRec, "not_interested_now");
          else setFeedbackDialogRec(null);
        }}
      />
    </div>
  );
}
