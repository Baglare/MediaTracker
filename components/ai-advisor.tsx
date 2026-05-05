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
}

interface AiCandidate {
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
  globalSearch?: GlobalSearchResult;
  libraryItemId?: string;
}

interface AiRecommendation {
  id: string;
  title: string;
  mediaType: MediaType;
  source: string;
  externalSource?: "tvmaze" | "anilist" | "openlibrary" | "library";
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
};

const SAMPLE_PROMPTS = [
  "Solo Leveling gibi ama daha romantik anime öner.",
  "7+ puan verdiğim dizilere göre kitap öner.",
  "Bugün kütüphanemden neye devam etsem?",
  "Chill ve kısa bir şey öner.",
];

const LOADING_STEPS = [
  "İstek analiz ediliyor",
  "Kütüphane profili hazırlanıyor",
  "Adaylar aranıyor",
  "Öneriler hazırlanıyor",
];

function buildLocalFallbackRecs(prompt: string, mediaList: MediaItem[]): AiRecommendation[] {
  const lower = prompt.toLowerCase();
  const isContinue = /devam|bugün|kütüphan|chill/.test(lower);
  if (isContinue && mediaList.length > 0) {
    return mediaList.slice(0, 3).map<AiRecommendation>((m, i) => ({
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
  return [];
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
    return `İsteğini "${prompt.trim()}" olarak yorumladım. Doğrulanmış aday bulunamadı.`;
  }
  return `İsteğini "${prompt.trim()}" olarak yorumladım. ${used || "Yalnızca istek metni"} kullanılarak ${count} doğrulanmış öneri hazırlandı.`;
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
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (stepTimer.current) clearTimeout(stepTimer.current);
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
    rejectedList: RejectedCandidate[]
  ) {
    setRecommendations(recs);
    setRejected(rejectedList);
    setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
    setLoadingStep(-1);
    const session: AiSession = {
      id: `ai-${Date.now()}`,
      createdAt: new Date().toISOString(),
      prompt,
      assistantMessage: assistantText,
      recommendations: recs,
      rejectedCandidates: rejectedList,
      settings,
    };
    persistSessions([session, ...sessions].slice(0, MAX_SESSIONS));
  }

  async function runApi(prompt: string): Promise<{
    recs: AiRecommendation[];
    text: string;
    rejected: RejectedCandidate[];
  } | null> {
    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          mediaItems: mediaList,
          progressLogs,
          settings,
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
      };
    } catch {
      return null;
    }
  }

  function runStep(
    step: number,
    prompt: string,
    apiPromise: Promise<{
      recs: AiRecommendation[];
      text: string;
      rejected: RejectedCandidate[];
    } | null>
  ) {
    if (step >= LOADING_STEPS.length) {
      apiPromise.then((apiResult) => {
        if (apiResult) {
          finishWith(prompt, apiResult.recs, apiResult.text, apiResult.rejected);
        } else {
          // Sunucu erişilemezse local fallback (sadece library_based benzeri)
          const recs = buildLocalFallbackRecs(prompt, mediaList);
          const text = buildAssistantMessage(prompt, settings, recs.length);
          finishWith(prompt, recs, text, []);
        }
      });
      return;
    }
    setLoadingStep(step);
    stepTimer.current = setTimeout(() => runStep(step + 1, prompt, apiPromise), 550);
  }

  function handleSend(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || isLoading) return;
    setViewingSessionId(null);
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setInput("");
    setRecommendations([]);
    setRejected([]);
    const apiPromise = runApi(prompt);
    runStep(0, prompt, apiPromise);
  }

  function handleNewTopic() {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    setMessages([]);
    setRecommendations([]);
    setRejected([]);
    setInput("");
    setViewingSessionId(null);
    setAddedIds({});
    setLoadingStep(-1);
  }

  function handleViewSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    setViewingSessionId(id);
    setMessages([]);
    setRecommendations(s.recommendations);
    setRejected(s.rejectedCandidates || []);
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

  const transparencyText = useMemo(() => {
    const parts = [
      settings.useProfile ? "kütüphane profil özeti" : null,
      settings.useRecentActivity ? "son aktivite özeti" : null,
      `web araştırması ${settings.useWebResearch ? "açık" : "kapalı"}`,
      `kişisel notlar ${settings.usePersonalNotes ? "dahil" : "değil"}`,
      settings.deepResearch ? "derin araştırma modu" : null,
    ].filter(Boolean);
    return `Bu istekte kullanılacaklar: ${parts.join(", ")}.`;
  }, [settings]);

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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              {viewingSessionId ? "Konuyu kapat" : "Yeni konu"}
            </button>
          )}
        </div>

        {/* Şeffaflık */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
          <ShieldCheck className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
          <p className="text-xs text-zinc-400 leading-relaxed">{transparencyText}</p>
        </div>

        {/* Boş durum */}
        {messages.length === 0 && recommendations.length === 0 && !viewingSessionId && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Örnek istekler</p>
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
            {messages.map((m, i) => (
              <div
                key={i}
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

        {/* Öneri kartları */}
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
                      {rec.mediaType === "book" ? "📖" : "🎬"}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-zinc-100 truncate">{rec.title}</h4>
                        <p className="text-xs text-zinc-500 truncate">
                          {rec.mediaType} · {rec.source}
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
                    {rec.risk && <p className="text-xs text-amber-300/80">⚠ {rec.risk}</p>}
                    {rec.communitySignal && (
                      <p className="text-xs text-zinc-500">{rec.communitySignal}</p>
                    )}
                    <button
                      disabled={!!added || !canAdd}
                      onClick={() => handleAddRec(rec)}
                      title={!canAdd && !added ? "Bu öneri Quick Add'a uygun değil" : undefined}
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
                <li key={i} className="text-xs text-zinc-400">
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
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Gizlilik / Araştırma</h3>
          <div className="space-y-2">
            {(
              [
                ["useProfile", "Kütüphane profilimi kullan"],
                ["useRecentActivity", "Son aktivitelerimi kullan"],
                ["usePersonalNotes", "Kişisel notlarımı dahil et"],
                ["useWebResearch", "Web araştırması kullan"],
                ["deepResearch", "Derin araştırma modu"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 cursor-pointer"
              >
                <span className="text-xs text-zinc-300">{label}</span>
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
