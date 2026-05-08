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
} from "lucide-react";
import { MediaItem, MediaType, ProgressLog } from "@/lib/types";
import { GlobalSearchResult } from "@/lib/global-search-types";

// ---- Tipler ----
export interface AiSettings {
  useProfile: boolean;
  useRecentActivity: boolean;
  usePersonalNotes: boolean;
  useWebResearch: boolean;
  deepResearch: boolean;
  useOpenAIProvider: boolean;
}

interface AiCandidate {
  source: "tvmaze" | "anilist" | "openlibrary" | "omdb" | "library";
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
  externalSource?: "tvmaze" | "anilist" | "openlibrary" | "omdb" | "library";
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
}

const SETTINGS_KEY = "media-tracker-ai-settings";
const SESSIONS_KEY = "media-tracker-ai-sessions";
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
  "Solo Leveling gibi ama daha romantik anime Ã¶ner.",
  "7+ puan verdiÄŸim dizilere gÃ¶re kitap Ã¶ner.",
  "BugÃ¼n kÃ¼tÃ¼phanemden neye devam etsem?",
  "Chill ve kÄ±sa bir ÅŸey Ã¶ner.",
];

const LOADING_STEPS = [
  "Ä°stek analiz ediliyor",
  "KÃ¼tÃ¼phane profili hazÄ±rlanÄ±yor",
  "Adaylar aranÄ±yor",
  "Ã–neriler hazÄ±rlanÄ±yor",
];
const AI_REQUEST_TIMEOUT_MS = 35000;

function generateId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

function buildLocalFallbackRecs(prompt: string, mediaList: MediaItem[]): AiRecommendation[] {
  const lower = prompt.toLowerCase();
  const isContinue = /devam|bugÃ¼n|kÃ¼tÃ¼phan|chill/.test(lower);
  if (isContinue && mediaList.length > 0) {
    return mediaList.slice(0, 3).map<AiRecommendation>((m, i) => ({
      id: `rec-${m.id}-${i}`,
      title: m.title,
      mediaType: m.type,
      source: "KÃ¼tÃ¼phanen",
      externalSource: "library",
      externalId: m.id,
      coverUrl: m.coverImage,
      overview: m.overview,
      fitLabel: i === 0 ? "BugÃ¼n iÃ§in ideal" : "Devam etmeye uygun",
      reason: `${m.currentProgress}/${m.totalProgress} ilerleme.`,
      inLibrary: true,
    }));
  }
  return [];
}

function buildAssistantMessage(prompt: string, settings: AiSettings, count: number): string {
  const used = [
    settings.useProfile && "kÃ¼tÃ¼phane profili",
    settings.useRecentActivity && "son aktiviteler",
    settings.usePersonalNotes && "kiÅŸisel notlar",
    settings.useWebResearch && "AI bilgi sinyali",
    settings.deepResearch && "derin araÅŸtÄ±rma",
  ]
    .filter(Boolean)
    .join(", ");
  if (count === 0) {
    return `Ä°steÄŸini "${prompt.trim()}" olarak yorumladÄ±m. DoÄŸrulanmÄ±ÅŸ aday bulunamadÄ±.`;
  }
  return `Ä°steÄŸini "${prompt.trim()}" olarak yorumladÄ±m. ${used || "YalnÄ±zca istek metni"} kullanÄ±larak ${count} doÄŸrulanmÄ±ÅŸ Ã¶neri hazÄ±rlandÄ±.`;
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
      `OpenAI toggle: ${debug.useOpenAIProvider ? "AÃ§Ä±k" : "KapalÄ±"} | Rate limit: ${debug.rateLimitHit ? "Evet" : "Hayir"} | Timeout: ${debug.timeoutHit ? "Evet" : "Hayir"} | Safe fallback: ${debug.safeFallbackUsed ? "Evet" : "Hayir"}`,
      `Fallback reason: ${debug.fallbackReason || "yok"} | Note: ${debug.note || "yok"}`,
      `Failed providers: ${failedProviders} | Follow-up merged: ${debug.followUpMerged ? "Evet" : "Hayir"} | Active context: ${debug.activeContextSummary || "yok"}`,
    ];
  }

  const querySummary = r.executedQueries && r.executedQueries.length > 0
    ? r.executedQueries
        .slice(0, 6)
        .map((q) => `${q.source}/${q.mediaType}: "${q.query}" (${q.resultCount})`)
        .join(" | ")
    : "Ã‡alÄ±ÅŸtÄ±rÄ±lan query yok";

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
    `OpenAI toggle: ${debug.useOpenAIProvider ? "AÃ§Ä±k" : "KapalÄ±"} | Rate limit: ${debug.rateLimitHit ? "Evet" : "Hayir"} | Timeout: ${debug.timeoutHit ? "Evet" : "Hayir"} | Safe fallback: ${debug.safeFallbackUsed ? "Evet" : "Hayir"}`,
    `Fallback reason: ${debug.fallbackReason || "yok"} | Provider errors: ${
      debug.providerErrors ? Object.entries(debug.providerErrors).map(([k, v]) => `${k}: ${v}`).join(", ") || "yok" : "yok"
    }`,
    `Failed providers: ${failedProviders} | Follow-up merged: ${debug.followUpMerged ? "Evet" : "Hayir"} | Active context: ${debug.activeContextSummary || "yok"}`,
    `Target: ${formatList(r.targetMediaTypes)} | Source: ${formatList(r.sourceTypes)}${r.sourceContext ? ` | Context: ${r.sourceContext}` : ""}`,
    `Signals: ${formatList(r.preferenceSignals)} | Avoid: ${formatList(r.avoidSignals)}`,
    `Clarification: ${r.needsClarification ? r.clarificationQuestion || "Ä°stendi" : "HayÄ±r"}`,
    `Plan: ${(r.searchPlans || []).map((p) => `${p.source}/${p.mediaType} [${p.queries.join(", ")}]`).join(" | ") || "Yok"}`,
    `Ideas: ${r.candidateIdeasCount ?? 0} | Verified: ${r.verifiedCount ?? 0} | Unverified: ${r.rejectedUnverifiedCount ?? 0} | Fallback search: ${r.fallbackSearchUsed ? "Evet" : "HayÄ±r"}`,
    `Verification counts: ${
      r.verificationSourceCounts
        ? Object.entries(r.verificationSourceCounts).map(([k, v]) => `${k}: ${v}`).join(", ") || "Yok"
        : "Yok"
    }`,
    `Queries: ${querySummary}`,
    `Source counts: ${sourceCounts}`,
    `Filtering: ${r.filterSummary?.before ?? 0} -> ${r.filterSummary?.after ?? 0} | Removed: ${r.filterSummary?.removed ?? 0} | Reasons: ${filterReasons}`,
    `Final candidates: ${r.finalCandidateCount ?? 0} | Refined pass: ${r.refinedPassUsed ? "Evet" : "HayÄ±r"} | Notes: ${formatList(r.notes)}`,
    `High-rated source: ${r.highRatedSourceCount ?? 0} | Deterministic fallback: ${r.deterministicFallbackUsed ? "Evet" : "HayÄ±r"} | Taste signals: ${formatList(r.deterministicTasteSignals)}`,
    `Source titles: ${formatList(r.sourceTitles)} | Excluded source titles: ${formatList(r.excludedSourceTitles)}`,
    `Taste queries: ${formatList(r.tasteSignalQueries)} | Direct title query used: ${r.directTitleQueryUsed ? "Evet" : "HayÄ±r"}`,
    `Parse repair: ${r.parseRepairUsed ? "Evet" : "HayÄ±r"} | Safe fallback: ${r.safeFallbackUsed ? "Evet" : "HayÄ±r"} | Ideation failed: ${r.ideationFailedReason || "yok"}`,
  ];
}

export default function AiAdvisor({
  mediaList,
  progressLogs,
  resetSignal,
  onAddToLibrary,
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
  const [debugInfo, setDebugInfo] = useState<AiDebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [pendingClarification, setPendingClarification] = useState<{
    originalPrompt: string;
    question: string;
  } | null>(null);
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
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    if (resetSignal === 0) return;
    setMessages([]);
    setRecommendations([]);
    setRejected([]);
    setInput("");
    setViewingSessionId(null);
    setAddedIds({});
    setDebugInfo(null);
    setShowDebug(false);
    setPendingClarification(null);
    if (stepTimer.current) clearTimeout(stepTimer.current);
    inFlightRequestId.current = null;
    inFlightPromptKey.current = null;
    activeContextRef.current = null;
    setLoadingStep(-1);
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
    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: prompt,
          mediaItems: mediaList,
          progressLogs,
          settings,
          recentContext: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          activeContext: activeContext || undefined,
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
      apiPromise
        .then((apiResult) => {
          if (inFlightRequestId.current !== requestId) return;
          if (apiResult) {
            finishWith(prompt, apiResult.recs, apiResult.text, apiResult.rejected, apiResult.debug, requestId);
          } else {
            const recs = buildLocalFallbackRecs(prompt, mediaList);
            const text = buildAssistantMessage(prompt, settings, recs.length);
            finishWith(prompt, recs, text, [], undefined, requestId);
          }
        })
        .catch(() => {
          if (inFlightRequestId.current !== requestId) return;
          const recs = buildLocalFallbackRecs(prompt, mediaList);
          const text = buildAssistantMessage(prompt, settings, recs.length);
          finishWith(prompt, recs, text, [], undefined, requestId);
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
    if (/^(istediÄŸin gibi|fark etmez|sen seÃ§|sen bilirsin|herhangi biri)$/i.test(lower)) return "auto";
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
      return `${pendingClarification.originalPrompt}. Profil Ã§oÄŸunluÄŸuna gÃ¶re ${targetLabelForPrompt(dominant)} hedef tÃ¼rÃ¼nÃ¼ varsay.`;
    }

    const label = targetLabelForPrompt(target);
    const original = pendingClarification.originalPrompt;
    if (/bir ÅŸey/i.test(original)) {
      return original.replace(/bir ÅŸey/gi, label);
    }
    return `${original}. Hedef medya tÃ¼rÃ¼: ${label}.`;
  }

  function isShortFollowUp(answer: string): boolean {
    const lower = answer.toLowerCase().trim();
    if (isExplicitNewTask(lower)) return false;
    if (lower.length > 60) return false;
    if (isShortTargetAnswer(lower)) return true;
    return isDependentFollowUp(lower);
  }

  function isDependentFollowUp(lower: string): boolean {
    return /^(yani\s+)?(sonu[cÃ§]\s+olarak\s+)?(ne\s+Ã¶neriyorsun|ne\s+oneriyorsun|hangisini\s+se[cÃ§]eyim|peki\s+hangisi|peki\s+ya\??|devam\s+et|devam|Ã¶zetle|ozetle|kÄ±saca|kisaca)$/i.test(lower);
  }

  function isExplicitNewTask(answer: string): boolean {
    const lower = answer.toLowerCase().trim();
    if (isDependentFollowUp(lower)) return false;
    if (/7\+|puan\s+verdi[ÄŸg]im|k[Ã¼u]t[Ã¼u]phaneme\s+g[Ã¶o]re|\bgibi\b|\bbenzeri\b|\btarz[Ä±i]\b/i.test(lower)) return true;
    if (/\b(kitap|book|anime|dizi|tv|film|movie|manga|manhwa|manhua)\s+(Ã¶ner|oner|tavsiye)\b/i.test(lower)) return true;
    return /\b(Ã¶ner|oner|tavsiye)\b/i.test(lower) && lower.split(/\s+/).length > 3;
  }

  function isShortTargetAnswer(answer: string): boolean {
    const lower = answer.toLowerCase().trim();
    if (!parseShortTarget(lower)) return false;
    return /^(dizi|tv|anime|kitap|book|manga|manhwa|manhua|film|movie)(\s+(olsun|tabii ki|tabi ki))?$|^(istediÄŸin gibi|istedigin gibi|fark etmez|sen seÃ§|sen sec|sen bilirsin|herhangi biri)$/i.test(lower);
  }

  function mergeTargetIntoPrompt(original: string, answer: string): string {
    const target = parseShortTarget(answer);
    if (!target || target === "auto") return original;
    const label = targetLabelForPrompt(target);
    if (/bir Ã…Å¸ey/i.test(original)) {
      return original.replace(/bir Ã…Å¸ey/gi, label);
    }
    if (/bir ÅŸey/i.test(original)) {
      return original.replace(/bir ÅŸey/gi, label);
    }
    return `${original}. Hedef medya tÃ¼rÃ¼: ${label}.`;
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
      // ekleme baÅŸarÄ±sÄ±z olursa state geri al
      setAddedIds((prev) => {
        const next = { ...prev };
        delete next[rec.id];
        return next;
      });
    }
  }

  const transparencyText = useMemo(() => {
    const parts = [
      settings.useProfile ? "kÃ¼tÃ¼phane profil Ã¶zeti" : null,
      settings.useRecentActivity ? "son aktivite Ã¶zeti" : null,
      `AI bilgi sinyali ${settings.useWebResearch ? "aÃ§Ä±k" : "kapalÄ±"}`,
      `kiÅŸisel notlar ${settings.usePersonalNotes ? "dahil" : "deÄŸil"}`,
      settings.deepResearch ? "derin araÅŸtÄ±rma modu" : null,
    ].filter(Boolean);
    return `Bu istekte kullanÄ±lacaklar: ${parts.join(", ")}.`;
  }, [settings]);

  const profileSummary = useMemo(() => {
    return `${mediaList.length} medya Â· ${progressLogs.length} aktivite kaydÄ±`;
  }, [mediaList.length, progressLogs.length]);

  const viewingSession = viewingSessionId ? sessions.find((s) => s.id === viewingSessionId) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-5 min-w-0">
        {/* BaÅŸlÄ±k */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">AI DanÄ±ÅŸman</h2>
              <p className="text-xs text-zinc-500">{profileSummary}</p>
            </div>
          </div>
          {(messages.length > 0 || recommendations.length > 0 || viewingSessionId) && (
            <button
              onClick={handleNewTopic}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              {viewingSessionId ? "Konuyu kapat" : "Yeni konu"}
            </button>
          )}
        </div>

        {/* ÅeffaflÄ±k */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
          <ShieldCheck className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
          <p className="text-xs text-zinc-400 leading-relaxed">{transparencyText}</p>
        </div>

        {/* BoÅŸ durum */}
        {messages.length === 0 && recommendations.length === 0 && !viewingSessionId && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Ã–rnek istekler</p>
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
              <p className="text-xs text-violet-300 uppercase tracking-wide">GeÃ§miÅŸ Ã¶neri oturumu</p>
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
                className={`p-3 rounded-xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-violet-500/10 border border-violet-500/20 text-zinc-100 ml-auto max-w-[85%]"
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
              <span>Teknik planÄ± gÃ¶ster</span>
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

        {/* Ã–neri kartlarÄ± */}
        {recommendations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendations.map((rec) => {
              const added = addedIds[rec.id] || rec.inLibrary;
              const canAdd = !!rec.candidate?.globalSearch;
              return (
                <div
                  key={rec.id}
                  className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/60 flex gap-3"
                >
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
                    <div className="w-14 h-20 shrink-0 rounded-md bg-zinc-800/60 flex items-center justify-center text-zinc-600 text-xl">
                      {rec.mediaType === "book" ? "ğŸ“–" : "ğŸ¬"}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-zinc-100 truncate">{rec.title}</h4>
                        <p className="text-xs text-zinc-500 truncate">
                          {rec.mediaType} Â· {rec.source}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30 shrink-0">
                        {rec.fitLabel}
                      </span>
                    </div>
                    {rec.overview && (
                      <p className="text-xs text-zinc-500 line-clamp-2">{rec.overview}</p>
                    )}
                    <p className="text-xs text-zinc-300 leading-relaxed">{rec.reason}</p>
                    {rec.risk && <p className="text-xs text-amber-300/80">âš  {rec.risk}</p>}
                    {rec.communitySignal && (
                      <p className="text-xs text-zinc-500">{rec.communitySignal}</p>
                    )}
                    <button
                      disabled={!!added || !canAdd}
                      onClick={() => handleAddRec(rec)}
                      title={!canAdd && !added ? "Bu Ã¶neri Quick Add'a uygun deÄŸil" : undefined}
                      className={`mt-1 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        added
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default"
                          : canAdd
                          ? "bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 cursor-pointer"
                          : "bg-zinc-800/40 text-zinc-500 border border-zinc-800 cursor-not-allowed"
                      }`}
                    >
                      {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {added ? "Listede" : "Listeme Ekle"}
                    </button>
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
                  <span className="text-zinc-300">{r.title}</span> â€” {r.reason}
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
              placeholder="AI DanÄ±ÅŸmana sor: ne izlemek/okumak istersin?"
              className="flex-1 bg-transparent resize-none px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none max-h-32"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-violet-500/20 text-violet-300 border border-violet-500/40 hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">GÃ¶nder</span>
            </button>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Gizlilik / AraÅŸtÄ±rma</h3>
          <div className="space-y-2">
            {(
              [
                ["useProfile", "KÃ¼tÃ¼phane profilimi kullan"],
                ["useRecentActivity", "Son aktivitelerimi kullan"],
                ["usePersonalNotes", "KiÅŸisel notlarÄ±mÄ± dahil et"],
                ["useWebResearch", "AI bilgi sinyali kullan"],
                ["deepResearch", "Derin araÅŸtÄ±rma modu"],
                ["useOpenAIProvider", "OpenAI API kullan"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 cursor-pointer"
              >
                <span className="text-xs text-zinc-300">{label}{key === "useOpenAIProvider" ? (<span className="block text-[10px] text-zinc-500 mt-0.5">Açıksa OpenAI API öncelikli kullanılır; ücretli olabilir.</span>) : null}</span>
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
            <p className="text-xs text-zinc-500">HenÃ¼z oturum yok.</p>
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
                      {new Date(s.createdAt).toLocaleDateString("tr-TR")} Â·{" "}
                      {s.recommendations.length} Ã¶neri
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


