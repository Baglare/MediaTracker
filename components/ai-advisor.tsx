"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Send,
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

// ---- Tipler ----
export interface AiSettings {
  useProfile: boolean;
  useRecentActivity: boolean;
  usePersonalNotes: boolean;
  useWebResearch: boolean;
  deepResearch: boolean;
  useOpenAIProvider: boolean;
  // R35 — granular data toggles (default true on server side via flag())
  includeRatings?: boolean;
  includeFavorites?: boolean;
  includeProgress?: boolean;
}

interface AiCandidate {
  // R36/R38 — server tarafı `score` + `scoreReasons` üretiyor; client kartta
  // "Neden önerildi" bullet listesi olarak gösteriyor.
  score?: number;
  scoreReasons?: string[];
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
  globalSearch?: GlobalSearchResult;
  libraryItemId?: string;
}

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

interface AiRecommendation {
  id: string;
  title: string;
  mediaType: MediaType;
  source: string;
  externalSource?: "tvmaze" | "anilist" | "openlibrary" | "omdb" | "tmdb" | "library";
  externalId?: string;
  coverUrl?: string;
  overview?: string;
  fitLabel: string;
  reason: string;
  risk?: string;
  communitySignal?: string;
  inLibrary?: boolean;
  candidate?: AiCandidate;
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
  rejectedCandidates?: RejectedCandidate[];
  settings: AiSettings;
  debug?: AiDebugInfo;
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

const SETTINGS_KEY = "media-tracker-ai-settings";
const SESSIONS_KEY = "media-tracker-ai-sessions";
// R40 — Aktif AI oturumu (chat + öneri kartları + local feedback) sayfa
// yenilenmesinde geri yüklenebilmesi için bu key'e yazılır. handleNewTopic
// veya boş state durumunda silinir. Konu Kapat → temizler.
const ACTIVE_SESSION_KEY = "media-tracker-ai-active-session";
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
  { key: "source-apis", label: "Kaynak API'leriyle öner", desc: "TMDB · TVmaze · AniList · OL · OMDb", icon: Search },
  { key: "web", label: "Web araştırması", desc: "AI bilgi sinyali ile genişletilmiş", icon: Cloud },
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

const DATA_TOGGLES_KEY = "media-tracker-ai-data-toggles";
const ADVISOR_PREFS_KEY = "media-tracker-ai-advisor-prefs";

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
      ? "Araştırma modu: kaynak API verileri (TVmaze/AniList/OpenLibrary/OMDb) ile destekle."
      : "Araştırma modu: web bilgi sinyali ile genişletilmiş öneri ver.";

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
function buildReasonBullets(rec: AiRecommendation): string[] {
  const scoreReasons = rec.candidate?.scoreReasons;
  if (scoreReasons && scoreReasons.length > 0) {
    return scoreReasons.slice(0, 3).map(truncateBullet);
  }
  const raw = (rec.reason || "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?<=[.!?;])\s+|\s*\|\s*/)
    .map((s) => s.replace(/[\s.;]+$/g, "").trim())
    .filter((s) => s.length >= 6);
  if (parts.length === 0) return [truncateBullet(raw)];
  return parts.slice(0, 3).map(truncateBullet);
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
    settings.useWebResearch && "AI bilgi sinyali",
    settings.deepResearch && "derin araştırma",
  ]
    .filter(Boolean)
    .join(", ");
  if (count === 0) {
    return `İsteğini "${prompt.trim()}" olarak yorumladım. Doğrulanmış aday bulunamadı.`;
  }
  return `İsteğini "${prompt.trim()}" olarak yorumladım. ${used || "Yalnızca istek metni"} kullanılarak ${count} doğrulanmış öneri hazırlandı.`;
}

function buildSourceApisClientEmptyMessage(prompt: string): string {
  return `İsteğini "${prompt.trim()}" olarak yorumladım. Kaynak API modunda dış kaynaklardan doğrulanmış aday alınamadı; kütüphane fallback'i kullanılmadı.`;
}

function formatList(values?: string[]) {
  return values && values.length > 0 ? values.join(", ") : "Yok";
}

function summarizeDebug(debug: AiDebugInfo): string[] {
  const r = debug.retrieval;
  const failedProviders = debug.failedProviders?.length
    ? debug.failedProviders.map((p) => `${p.provider}/${p.stage}: ${p.error}`).join(", ")
    : "yok";
  if (!r) {
    return [
      `Provider: ${debug.selectedProvider || debug.provider || "mock"}${debug.fellBackToMock ? " (fallback)" : ""} | Error: ${debug.providerError || "yok"} | Model: ${debug.usedModel || "bilinmiyor"}`,
      `Attempts: ${formatList(debug.attemptedProviders)} | Calls: ${
        debug.providerCallCounts ? Object.entries(debug.providerCallCounts).map(([k, v]) => `${k}: ${v}`).join(", ") : `openai: ${debug.openaiCallCount ?? 0}, gemini: ${debug.geminiCallCount ?? 0}, openrouter: ${debug.openrouterCallCount ?? 0}, groq: ${debug.groqCallCount ?? 0}`
      }`,
      `OpenAI toggle: ${debug.useOpenAIProvider ? "Açık" : "Kapalı"} | Rate limit: ${debug.rateLimitHit ? "Evet" : "Hayir"} | Timeout: ${debug.timeoutHit ? "Evet" : "Hayir"} | Safe fallback: ${debug.safeFallbackUsed ? "Evet" : "Hayir"}`,
      `Fallback reason: ${debug.fallbackReason || "yok"} | Note: ${debug.note || "yok"}`,
      `Failed providers: ${failedProviders} | Follow-up merged: ${debug.followUpMerged ? "Evet" : "Hayir"} | Active context: ${debug.activeContextSummary || "yok"}`,
    ];
  }

  const querySummary = r.executedQueries && r.executedQueries.length > 0
    ? r.executedQueries
        .slice(0, 6)
        .map((q) => `${q.source}/${q.mediaType}: "${q.query}" (${q.resultCount})`)
        .join(" | ")
    : "Çalıştırılan query yok";

  const sourceCounts = r.sourceCandidateCounts
    ? Object.entries(r.sourceCandidateCounts).map(([k, v]) => `${k}: ${v}`).join(", ")
    : "Yok";

  const filterReasons = r.filterSummary?.reasons
    ? Object.entries(r.filterSummary.reasons).map(([k, v]) => `${k}: ${v}`).join(", ")
    : "Yok";

  return [
    `Task: ${r.taskType || "bilinmiyor"} | Provider: ${debug.selectedProvider || debug.provider || "mock"}${debug.fellBackToMock || r.providerFallback ? " (fallback)" : ""} | Error: ${debug.providerError || "yok"} | Model: ${debug.usedModel || "bilinmiyor"}`,
    `Attempts: ${formatList(debug.attemptedProviders)} | Calls: ${
      debug.providerCallCounts ? Object.entries(debug.providerCallCounts).map(([k, v]) => `${k}: ${v}`).join(", ") : `openai: ${debug.openaiCallCount ?? 0}, gemini: ${debug.geminiCallCount ?? 0}, openrouter: ${debug.openrouterCallCount ?? 0}, groq: ${debug.groqCallCount ?? 0}`
    }`,
    `OpenAI toggle: ${debug.useOpenAIProvider ? "Açık" : "Kapalı"} | Rate limit: ${debug.rateLimitHit ? "Evet" : "Hayir"} | Timeout: ${debug.timeoutHit ? "Evet" : "Hayir"} | Safe fallback: ${debug.safeFallbackUsed ? "Evet" : "Hayir"}`,
    `Fallback reason: ${debug.fallbackReason || "yok"} | Provider errors: ${
      debug.providerErrors ? Object.entries(debug.providerErrors).map(([k, v]) => `${k}: ${v}`).join(", ") || "yok" : "yok"
    }`,
    `Failed providers: ${failedProviders} | Follow-up merged: ${debug.followUpMerged ? "Evet" : "Hayir"} | Active context: ${debug.activeContextSummary || "yok"}`,
    `Target: ${formatList(r.targetMediaTypes)} | Source: ${formatList(r.sourceTypes)}${r.sourceContext ? ` | Context: ${r.sourceContext}` : ""}`,
    `Signals: ${formatList(r.preferenceSignals)} | Avoid: ${formatList(r.avoidSignals)}`,
    `Clarification: ${r.needsClarification ? r.clarificationQuestion || "İstendi" : "Hayır"}`,
    `Plan: ${(r.searchPlans || []).map((p) => `${p.source}/${p.mediaType} [${p.queries.join(", ")}]`).join(" | ") || "Yok"}`,
    `Ideas: ${r.candidateIdeasCount ?? 0} | Verified: ${r.verifiedCount ?? 0} | Unverified: ${r.rejectedUnverifiedCount ?? 0} | Fallback search: ${r.fallbackSearchUsed ? "Evet" : "Hayır"}`,
    `Verification counts: ${
      r.verificationSourceCounts
        ? Object.entries(r.verificationSourceCounts).map(([k, v]) => `${k}: ${v}`).join(", ") || "Yok"
        : "Yok"
    }`,
    `Queries: ${querySummary}`,
    `Source counts: ${sourceCounts}`,
    `Filtering: ${r.filterSummary?.before ?? 0} -> ${r.filterSummary?.after ?? 0} | Removed: ${r.filterSummary?.removed ?? 0} | Reasons: ${filterReasons}`,
    `Final candidates: ${r.finalCandidateCount ?? 0} | Refined pass: ${r.refinedPassUsed ? "Evet" : "Hayır"} | Notes: ${formatList(r.notes)}`,
    `High-rated source: ${r.highRatedSourceCount ?? 0} | Deterministic fallback: ${r.deterministicFallbackUsed ? "Evet" : "Hayır"} | Taste signals: ${formatList(r.deterministicTasteSignals)}`,
    `Source titles: ${formatList(r.sourceTitles)} | Excluded source titles: ${formatList(r.excludedSourceTitles)}`,
    `Taste queries: ${formatList(r.tasteSignalQueries)} | Direct title query used: ${r.directTitleQueryUsed ? "Evet" : "Hayır"}`,
    `Parse repair: ${r.parseRepairUsed ? "Evet" : "Hayır"} | Safe fallback: ${r.safeFallbackUsed ? "Evet" : "Hayır"} | Ideation failed: ${r.ideationFailedReason || "yok"}`,
  ];
}

export default function AiAdvisor({
  mediaList,
  progressLogs,
  resetSignal,
  onAddToLibrary,
  onOpenDiscover,
}: AiAdvisorProps) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([]);
  const [rejected, setRejected] = useState<RejectedCandidate[]>([]);
  const [loadingStep, setLoadingStep] = useState(-1);
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  // R38/R39 — "İlgilenmiyorum" sadece o oturum içinde geçerli local feedback;
  // localStorage'a yazılmaz. R39: artık sinyal (title/externalSource/externalId/
  // mediaType) saklıyoruz çünkü backend aday havuzunu bunlarla filtreliyor.
  const [dismissedSignals, setDismissedSignals] = useState<Record<string, DismissedSignal>>({});
  const [debugInfo, setDebugInfo] = useState<AiDebugInfo | null>(null);
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
  const lastPersistedSessionKey = useRef<string | null>(null);
  const activeContextRef = useRef<AiActiveContext | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
      const list = localStorage.getItem(SESSIONS_KEY);
      if (list) setSessions(JSON.parse(list));
      const dt = localStorage.getItem(DATA_TOGGLES_KEY);
      if (dt) setDataToggles({ ...DEFAULT_DATA_TOGGLES, ...JSON.parse(dt) });
      const prefs = localStorage.getItem(ADVISOR_PREFS_KEY);
      if (prefs) {
        const parsed = JSON.parse(prefs) as { scopeMode?: ScopeMode; researchMode?: ResearchMode };
        if (parsed.scopeMode) setScopeMode(parsed.scopeMode);
        if (parsed.researchMode) setResearchMode(parsed.researchMode);
      }
      // R40 — Aktif oturum snapshot'ını geri yükle.
      const active = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (active) {
        const snap = JSON.parse(active) as {
          v?: number;
          messages?: AiMessage[];
          recommendations?: AiRecommendation[];
          rejected?: RejectedCandidate[];
          addedIds?: Record<string, boolean>;
          dismissedSignals?: Record<string, DismissedSignal>;
          pendingClarification?: { originalPrompt: string; question: string } | null;
          debugInfo?: AiDebugInfo | null;
          activeContext?: AiActiveContext | null;
        };
        if (snap.v === ACTIVE_SESSION_VERSION) {
          if (Array.isArray(snap.messages)) setMessages(snap.messages);
          if (Array.isArray(snap.recommendations)) setRecommendations(snap.recommendations);
          if (Array.isArray(snap.rejected)) setRejected(snap.rejected);
          if (snap.addedIds && typeof snap.addedIds === "object") setAddedIds(snap.addedIds);
          if (snap.dismissedSignals && typeof snap.dismissedSignals === "object") {
            setDismissedSignals(snap.dismissedSignals);
          }
          if (snap.pendingClarification) setPendingClarification(snap.pendingClarification);
          if (snap.debugInfo) setDebugInfo(snap.debugInfo);
          if (snap.activeContext) activeContextRef.current = snap.activeContext;
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // R40 — Aktif oturumu localStorage'a yaz. Boş state → key silinir.
  useEffect(() => {
    try {
      const isEmpty =
        messages.length === 0 &&
        recommendations.length === 0 &&
        rejected.length === 0 &&
        Object.keys(addedIds).length === 0 &&
        Object.keys(dismissedSignals).length === 0 &&
        !pendingClarification;
      if (isEmpty) {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
        return;
      }
      const snap = {
        v: ACTIVE_SESSION_VERSION,
        messages,
        recommendations,
        rejected,
        addedIds,
        dismissedSignals,
        pendingClarification,
        debugInfo,
        activeContext: activeContextRef.current,
      };
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(snap));
    } catch {
      // ignore (kotanın dolması ya da JSON cycle gibi nadir durumlar)
    }
  }, [messages, recommendations, rejected, addedIds, dismissedSignals, pendingClarification, debugInfo]);

  useEffect(() => {
    try {
      localStorage.setItem(DATA_TOGGLES_KEY, JSON.stringify(dataToggles));
    } catch {
      // ignore
    }
  }, [dataToggles]);

  useEffect(() => {
    try {
      localStorage.setItem(ADVISOR_PREFS_KEY, JSON.stringify({ scopeMode, researchMode }));
    } catch {
      // ignore
    }
  }, [scopeMode, researchMode]);

  // R34 — araştırma modu mevcut AiSettings.useWebResearch'e haritalanır
  // (provider/route logic'i değişmesin diye). "source-apis" şimdilik UI-only.
  // CLAUDE.md modal-style prev-prop kalıbı: render fazında karşılaştır, effect kullanma.
  const expectedUseWebResearch = researchMode === "web";
  if (settings.useWebResearch !== expectedUseWebResearch) {
    setSettings((prev) =>
      prev.useWebResearch === expectedUseWebResearch ? prev : { ...prev, useWebResearch: expectedUseWebResearch }
    );
  }

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

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
      setDismissedSignals({});
      setDebugInfo(null);
      setShowDebug(false);
      setPendingClarification(null);
      setLoadingStep(-1);
    }
  }
  useEffect(() => {
    if (resetSignal === 0) return;
    if (stepTimer.current) clearTimeout(stepTimer.current);
    inFlightRequestId.current = null;
    inFlightPromptKey.current = null;
    activeContextRef.current = null;
  }, [resetSignal]);

  const isLoading = loadingStep >= 0 && loadingStep < LOADING_STEPS.length;

  function persistSessions(next: AiSession[]) {
    setSessions(next);
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function finishWith(
    prompt: string,
    recs: AiRecommendation[],
    assistantText: string,
    rejectedList: RejectedCandidate[],
    debug?: AiDebugInfo,
    requestId?: string
  ) {
    if (requestId && inFlightRequestId.current !== requestId) return;
    if (requestId) {
      inFlightRequestId.current = null;
      inFlightPromptKey.current = null;
    }
    setRecommendations(recs);
    setRejected(rejectedList);
    setDebugInfo(debug || null);
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
      id: requestId || generateId("session"),
      createdAt: new Date().toISOString(),
      prompt,
      assistantMessage: assistantText,
      recommendations: recs,
      rejectedCandidates: rejectedList,
      settings,
      debug,
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
  } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    // R35 — Veri toggle'larını sunucuya iletilecek AiSettings'e yansıt.
    // Notlar/Son aktiviteler de toggle ile gerçekten kapatılır (server tarafı
    // zaten useRecentActivity / usePersonalNotes'a saygı duyuyor).
    const effectiveSettings: AiSettings = {
      ...settings,
      useRecentActivity: settings.useRecentActivity && dataToggles.recentActivity,
      usePersonalNotes: settings.usePersonalNotes && dataToggles.notes,
      includeRatings: dataToggles.ratings,
      includeFavorites: dataToggles.favorites,
      includeProgress: dataToggles.progress,
    };
    // R35 — Boş kütüphane: güvenli payload (server zaten boş kütüphaneyi
    // tolere ediyor ama mediaItems'in array olduğundan emin oluyoruz).
    const safeMediaItems = Array.isArray(mediaList) ? mediaList : [];
    const safeProgressLogs = Array.isArray(progressLogs) ? progressLogs : [];
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
        }),
      });
      if (!res.ok) return null;
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
        })
      );
      return {
        recs,
        text: data.assistantMessage || buildAssistantMessage(prompt, settings, recs.length),
        rejected: Array.isArray(data.rejectedCandidates) ? data.rejectedCandidates : [],
        debug: data.debug,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
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
    } | null>
  ) {
    if (inFlightRequestId.current !== requestId) return;
    if (step >= LOADING_STEPS.length) {
      const finishWithClientFallback = () => {
        if (researchMode === "source-apis") {
          finishWith(prompt, [], buildSourceApisClientEmptyMessage(prompt), [], undefined, requestId);
          return;
        }
        const recs = buildLocalFallbackRecs(prompt, mediaList);
        const text = buildAssistantMessage(prompt, settings, recs.length);
        finishWith(prompt, recs, text, [], undefined, requestId);
      };

      apiPromise
        .then((apiResult) => {
          if (inFlightRequestId.current !== requestId) return;
          if (apiResult) {
            finishWith(prompt, apiResult.recs, apiResult.text, apiResult.rejected, apiResult.debug, requestId);
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

  function handleSend(text?: string) {
    const rawPrompt = (text ?? input).trim();
    if (!rawPrompt || isLoading || inFlightRequestId.current) return;
    const { prompt, activeContext } = buildFollowUpRequest(rawPrompt);
    const promptKey = `${prompt}|${activeContext?.followUpMessage || ""}`.toLowerCase();
    if (inFlightPromptKey.current === promptKey) return;
    setViewingSessionId(null);
    setMessages((prev) => [...prev, { id: generateId("msg"), role: "user", content: rawPrompt }]);
    setInput("");
    setRecommendations([]);
    setRejected([]);
    setDebugInfo(null);
    setShowDebug(false);
    const requestId = generateId("req");
    inFlightRequestId.current = requestId;
    inFlightPromptKey.current = promptKey;
    const apiPromise = runApi(prompt, activeContext);
    runStep(0, prompt, requestId, apiPromise);
  }

  function handleModeClick(mode: AdvisorMode) {
    if (isLoading || inFlightRequestId.current) return;
    const effectiveScope: ScopeMode = mode === "one-per-world" ? "one-per-world" : scopeMode;
    const prompt = buildModePrompt(mode, effectiveScope, researchMode, dataToggles);
    handleSend(prompt);
  }

  function handleNewTopic() {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    inFlightRequestId.current = null;
    inFlightPromptKey.current = null;
    setMessages([]);
    setRecommendations([]);
    setRejected([]);
    setInput("");
    setViewingSessionId(null);
    setAddedIds({});
    setDismissedSignals({});
    setDebugInfo(null);
    setShowDebug(false);
    setPendingClarification(null);
    setLoadingStep(-1);
  }

  function handleViewSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    setViewingSessionId(id);
    setMessages([]);
    setRecommendations(s.recommendations);
    setRejected(s.rejectedCandidates || []);
    setDebugInfo(s.debug || null);
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
  function handleDismissRec(rec: AiRecommendation) {
    setDismissedSignals((prev) => ({
      ...prev,
      [rec.id]: {
        title: rec.title,
        externalSource: rec.externalSource,
        externalId: rec.externalId,
        mediaType: rec.mediaType,
      },
    }));
  }
  function handleUndoDismissRec(rec: AiRecommendation) {
    setDismissedSignals((prev) => {
      const next = { ...prev };
      delete next[rec.id];
      return next;
    });
  }
  function handleSimilarRec(rec: AiRecommendation) {
    if (isLoading || inFlightRequestId.current) return;
    handleSend(buildSimilarPrompt(rec));
  }
  function handleOpenDiscoverFor(rec: AiRecommendation) {
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
        ? "yalnızca kütüphane"
        : researchMode === "source-apis"
        ? "kaynak API'leri (yakında)"
        : "AI bilgi sinyali açık";
    const deep = settings.deepResearch ? ", derin araştırma" : "";
    return `Bu istekte kullanılacaklar: ${dataLabel}; araştırma modu: ${research}${deep}.`;
  }, [settings, dataToggles, researchMode]);

  const profileSummary = useMemo(() => {
    return `${mediaList.length} medya · ${progressLogs.length} aktivite kaydı`;
  }, [mediaList.length, progressLogs.length]);

  const viewingSession = viewingSessionId ? sessions.find((s) => s.id === viewingSessionId) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-5 min-w-0">
        {/* Başlık */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">AI Danışman</h2>
              <p className="text-xs text-zinc-500">{profileSummary}</p>
            </div>
          </div>
          {(messages.length > 0 || recommendations.length > 0 || viewingSessionId) && (
            <button
              onClick={handleNewTopic}
              title="Aktif AI sohbetini, önerileri ve oturum içi feedback'i sıfırlar"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800/70 transition-colors cursor-pointer"
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
            <span className="text-[10px] text-zinc-600">Kartlara basınca öneri akışı tetiklenir</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MODE_CARDS.map((m) => {
              const Icon = m.icon;
              const disabled = isLoading;
              return (
                <button
                  key={m.key}
                  onClick={() => handleModeClick(m.key)}
                  disabled={disabled}
                  className="group text-left p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/70 hover:border-violet-500/40 hover:bg-zinc-900/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-w-0"
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
              return (
                <button
                  key={opt.key}
                  onClick={() => setResearchMode(opt.key)}
                  className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer min-w-0 ${
                    active
                      ? "bg-violet-500/15 border-violet-500/40"
                      : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700"
                  }`}
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

        {isLoading && (
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

        {debugInfo && !isLoading && (
          <div className="rounded-xl bg-zinc-950/30 border border-zinc-800/60 overflow-hidden">
            <button
              onClick={() => setShowDebug((prev) => !prev)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors cursor-pointer"
            >
              <span>Teknik planı göster</span>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showDebug ? "rotate-90" : ""}`} />
            </button>
            {showDebug && (
              <div className="px-3 pb-3 space-y-1.5">
                {summarizeDebug(debugInfo).map((line, i) => (
                  <p key={`debug-${i}`} className="text-[11px] leading-relaxed text-zinc-500">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* R38 — Öneri kartları */}
        {recommendations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendations.map((rec) => {
              const added = addedIds[rec.id] || rec.inLibrary;
              const canAdd = !!rec.candidate?.globalSearch;
              const dismissed = !!dismissedSignals[rec.id];
              const reasonBullets = buildReasonBullets(rec);
              const score = rec.candidate?.score;
              const externalSource = rec.externalSource;
              const externalId = rec.externalId;
              const releaseYear = rec.candidate?.releaseYear;
              return (
                <div
                  key={rec.id}
                  className={`relative p-4 rounded-2xl border min-w-0 transition-opacity ${
                    dismissed
                      ? "bg-zinc-900/20 border-zinc-800/40 opacity-40"
                      : "bg-zinc-900/50 border-zinc-800/60"
                  }`}
                >
                <div className="flex gap-3 min-w-0">
                  {rec.coverUrl ? (
                    <div className="relative w-14 h-20 shrink-0 rounded-md overflow-hidden bg-zinc-800">
                      <Image
                        src={rec.coverUrl}
                        alt={rec.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-20 shrink-0 rounded-md bg-zinc-800/60 flex items-center justify-center text-zinc-600"><Sparkles className="w-5 h-5" /></div>
                  )}
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-zinc-100 break-words">
                          {rec.title}
                        </h4>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {rec.mediaType}
                          <span className="mx-1 text-zinc-700">·</span>
                          {rec.source}
                          {releaseYear ? (
                            <>
                              <span className="mx-1 text-zinc-700">·</span>
                              {releaseYear}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30 shrink-0">
                        {rec.fitLabel}
                      </span>
                    </div>
                    {rec.overview && (
                      <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                        {rec.overview}
                      </p>
                    )}
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
                          className="text-xs text-zinc-300 leading-relaxed flex gap-1.5"
                        >
                          <span className="text-violet-300/70 shrink-0">•</span>
                          <span className="min-w-0">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(rec.risk || rec.communitySignal) && (
                  <div className="mt-2 space-y-1">
                    {rec.risk && (
                      <p className="text-xs text-amber-300/80 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="min-w-0">{rec.risk}</span>
                      </p>
                    )}
                    {rec.communitySignal && (
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        {rec.communitySignal}
                      </p>
                    )}
                  </div>
                )}

                {(typeof score === "number" || externalSource) && (
                  <p className="mt-2 text-[10px] text-zinc-600 font-mono break-all">
                    {typeof score === "number" ? `score ${score}` : null}
                    {typeof score === "number" && externalSource ? "  ·  " : null}
                    {externalSource ? `${externalSource}${externalId ? ":" + externalId : ""}` : null}
                  </p>
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

        {/* Elenen adaylar */}
        {rejected.length > 0 && (
          <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Elenenler</p>
            <ul className="space-y-1.5">
              {rejected.slice(0, 3).map((r, i) => (
                <li key={`rejected-${i}-${r.title}`} className="text-xs text-zinc-400">
                  <span className="text-zinc-300">{r.title}</span> — {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Input */}
        <div className="sticky bottom-4 pt-2">
          <div className="flex items-end gap-2 p-2 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="AI Danışmana sor: ne izlemek/okumak istersin?"
              className="flex-1 bg-transparent resize-none px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none max-h-32"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-violet-500/20 text-violet-300 border border-violet-500/40 hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Gönder</span>
            </button>
          </div>
        </div>
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
                      Açıksa OpenAI API öncelikli kullanılır; ücretli olabilir.
                    </span>
                  ) : null}
                </span>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="accent-violet-500 cursor-pointer"
                />
              </label>
            ))}
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
    </div>
  );
}
