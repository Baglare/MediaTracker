import {
  AiCandidate,
  AiIntent,
  AiProvider,
  AiRecommendation,
  AiRecommendResponse,
  AiRetrievalPlan,
  AiSettings,
  LibraryProfile,
} from "../types";
import { summarizeProfile } from "../profile-builder";
import { MediaType } from "@/lib/types";

export type CompatibleProviderName = "openrouter" | "groq";
export type CompatibleProviderErrorCode =
  | "rate_limit"
  | "openrouter_key_missing"
  | "groq_key_missing"
  | "parse_error"
  | "api_error"
  | "openrouter_skipped_paid_model";

export class CompatibleProviderError extends Error {
  code: CompatibleProviderErrorCode;
  provider: CompatibleProviderName;
  status?: number;

  constructor(provider: CompatibleProviderName, code: CompatibleProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = "CompatibleProviderError";
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

interface CompatibleConfig {
  name: CompatibleProviderName;
  apiKeyEnv: "OPENROUTER_API_KEY" | "GROQ_API_KEY";
  modelEnv: "OPENROUTER_MODEL" | "GROQ_MODEL";
  defaultModel: string;
  endpoint: string;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

interface ParsedItem {
  externalSource?: string;
  externalId?: string;
  fitLabel?: string;
  reason?: string;
  risk?: string | null;
  communitySignal?: string | null;
}

interface ParsedRankJson {
  assistantMessage?: string;
  recommendations?: ParsedItem[];
  rejectedCandidates?: { title?: string; reason?: string }[];
}

function extractJson<T>(text: string): T | null {
  const stripped = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

function isRateLimit(status: number, text: string) {
  return status === 429 || /rate.?limit|quota|too many requests/i.test(text);
}

function keyMissingCode(provider: CompatibleProviderName): CompatibleProviderErrorCode {
  return provider === "openrouter" ? "openrouter_key_missing" : "groq_key_missing";
}

async function fetchChatJson(config: CompatibleConfig, prompt: string, temperature: number) {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new CompatibleProviderError(config.name, keyMissingCode(config.name), `${config.apiKeyEnv} missing`);
  }

  const model = process.env[config.modelEnv] || config.defaultModel;

  if (config.name === "openrouter") {
    const aiProvider = (process.env.AI_PROVIDER || "mock").toLowerCase();
    const isAuto = aiProvider === "auto";
    const isFreeModel = model === "openrouter/free" || model.endsWith(":free");
    if (isAuto && !isFreeModel) {
      throw new CompatibleProviderError("openrouter", "openrouter_skipped_paid_model", `OpenRouter ücretli modele düşmemek için atlandı (${model})`);
    }
  }
  let res: Response;
  try {
    res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(config.name === "openrouter"
          ? {
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
              "X-Title": "Media Tracker AI Advisor",
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${error}`;
    throw new CompatibleProviderError(config.name, "api_error", `${config.name} network error: ${message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isRateLimit(res.status, body)) {
      throw new CompatibleProviderError(config.name, "rate_limit", `${config.name} rate limit`, res.status);
    }
    throw new CompatibleProviderError(config.name, "api_error", `${config.name} HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
  }

  try {
    return (await res.json()) as ChatResponse;
  } catch {
    throw new CompatibleProviderError(config.name, "parse_error", `${config.name} response parse error`);
  }
}

function buildPlanningPrompt(args: {
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
  refinement?: {
    previousPlan: AiRetrievalPlan | null;
    candidateCount: number;
  };
}) {
  const profileBlock = args.settings.useProfile && args.profile
    ? summarizeProfile(args.profile)
    : "Profil kullanılmıyor veya yok.";
  const refineBlock = args.refinement
    ? `Önceki plan ${args.refinement.candidateCount} aday getirdi. Önceki plan: ${JSON.stringify(args.refinement.previousPlan)}`
    : "İlk retrieval planını üret.";

  return [
    "Medya tavsiye sistemi için arama planlayıcısın. Sadece geçerli JSON döndür.",
    `Kullanıcı mesajı: """${args.message}"""`,
    `Intent: ${JSON.stringify(args.intent)}`,
    `Library profile: ${profileBlock}`,
    refineBlock,
    "Kurallar: hedef tür belirsizse clarification iste; anime/manga/manhwa/manhua için anilist, tv için tvmaze, book için openlibrary, movie için tmdb kullan.",
    `Şema:
{
  "taskType": string,
  "interpretation": string,
  "targetMediaTypes": ["tv"|"anime"|"manga"|"manhwa"|"manhua"|"book"|"movie"],
  "sourceContext": string,
  "sourceTypes": ["tv"|"anime"|"manga"|"manhwa"|"manhua"|"book"|"movie"],
  "preferenceSignals": string[],
  "avoidSignals": string[],
  "needsClarification": boolean,
  "clarificationQuestion": string|null,
  "searchPlans": [
    { "source": "anilist"|"tvmaze"|"openlibrary"|"tmdb", "mediaType": "tv"|"anime"|"manga"|"manhwa"|"manhua"|"book"|"movie", "queries": string[], "reason": string }
  ]
}`,
  ].join("\n");
}

function isMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && ["movie", "tv", "anime", "manga", "manhwa", "manhua", "book"].includes(value);
}

function normalizePlanShape(parsed: Partial<AiRetrievalPlan> | null, intent: AiIntent): AiRetrievalPlan {
  return {
    taskType: parsed?.taskType || intent.kind,
    interpretation: String(parsed?.interpretation || ""),
    targetMediaTypes: (parsed?.targetMediaTypes || []).filter(isMediaType),
    sourceContext: parsed?.sourceContext ? String(parsed.sourceContext) : undefined,
    sourceTypes: (parsed?.sourceTypes || []).filter(isMediaType),
    preferenceSignals: (parsed?.preferenceSignals || []).map(String).slice(0, 12),
    avoidSignals: (parsed?.avoidSignals || []).map(String).slice(0, 12),
    needsClarification: Boolean(parsed?.needsClarification),
    clarificationQuestion: parsed?.clarificationQuestion ? String(parsed.clarificationQuestion) : undefined,
    searchPlans: (parsed?.searchPlans || [])
      .map((p) => ({
        source: p.source,
        mediaType: p.mediaType,
        queries: (p.queries || []).map(String).filter(Boolean).slice(0, 4),
        reason: String(p.reason || ""),
      }))
      .filter((p) =>
        ["anilist", "tvmaze", "openlibrary", "tmdb", "library"].includes(p.source) &&
        isMediaType(p.mediaType)
      )
      .slice(0, 6),
  };
}

function describeCandidates(candidates: AiCandidate[]) {
  return candidates
    .map((c, i) => {
      const meta = [c.releaseYear, c.genres?.slice(0, 4).join("/"), c.averageScore ? `score:${c.averageScore}` : null]
        .filter(Boolean)
        .join(" · ");
      const overview = (c.overview || "").replace(/\s+/g, " ").slice(0, 220);
      return `${i + 1}. [${c.source}:${c.externalId}] ${c.title} (${c.type}${meta ? " · " + meta : ""})${overview ? " - " + overview : ""}`;
    })
    .join("\n");
}

function buildRankingPrompt(args: {
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
  candidates: AiCandidate[];
  retrievalPlan?: AiRetrievalPlan | null;
}) {
  const profileBlock = args.settings.useProfile && args.profile
    ? `Kütüphane profili: ${summarizeProfile(args.profile)}`
    : "Kütüphane profili kullanılmıyor.";

  return [
    "Türkçe cevap veren medya tavsiye danışmanısın. Sadece geçerli JSON döndür.",
    `Kullanıcı isteği: """${args.message}"""`,
    `Intent: ${JSON.stringify(args.intent)}`,
    profileBlock,
    `Retrieval plan: ${JSON.stringify(args.retrievalPlan || null)}`,
    "ADAY HAVUZU: yalnızca buradan seç, asla başka başlık uydurma.",
    describeCandidates(args.candidates),
    "Her öneride externalSource ve externalId havuzdaki köşeli parantezle birebir aynı olmalı. reason somut olsun; risk gerçek uyumsuzluğu yazsın.",
    `Şema:
{
  "assistantMessage": string,
  "recommendations": [
    {
      "externalSource": "anilist"|"tvmaze"|"openlibrary"|"library",
      "externalId": string,
      "fitLabel": string,
      "reason": string,
      "risk": string|null,
      "communitySignal": string|null
    }
  ],
  "rejectedCandidates": [ { "title": string, "reason": string } ]
}`,
  ].join("\n");
}

function sourceLabel(s: AiCandidate["source"]): string {
  switch (s) {
    case "anilist": return "AniList";
    case "tvmaze": return "TVmaze";
    case "openlibrary": return "Open Library";
    case "library": return "Kütüphanen";
  }
}

function buildTransparency(settings: AiSettings) {
  const parts = [
    settings.useProfile ? "kütüphane profil özeti" : null,
    settings.useRecentActivity ? "son aktivite özeti" : null,
    `AI bilgi sinyali ${settings.useWebResearch ? "açık" : "kapalı"}`,
    `kişisel notlar ${settings.usePersonalNotes ? "dahil" : "değil"}`,
    settings.deepResearch ? "derin araştırma modu" : null,
  ].filter(Boolean);
  return `Bu istekte kullanılacaklar: ${parts.join(", ")}.`;
}

function createCompatibleProvider(config: CompatibleConfig): AiProvider {
  return {
    name: config.name,
    isAvailable() {
      return !!process.env[config.apiKeyEnv];
    },
    async generateRetrievalPlan(args) {
      const response = await fetchChatJson(config, buildPlanningPrompt(args), args.refinement ? 0.55 : 0.35);
      const text = response.choices?.[0]?.message?.content || "";
      const parsed = extractJson<Partial<AiRetrievalPlan>>(text);
      if (!parsed) {
        throw new CompatibleProviderError(config.name, "parse_error", `${config.name} planning returned invalid JSON`);
      }
      return normalizePlanShape(parsed, args.intent);
    },
    async generate(args) {
      if (args.candidates.length === 0) {
        throw new CompatibleProviderError(config.name, "api_error", "No candidates to rank");
      }

      const response = await fetchChatJson(config, buildRankingPrompt(args), 0.7);
      const text = response.choices?.[0]?.message?.content || "";
      const parsed = extractJson<ParsedRankJson>(text);
      if (!parsed || !Array.isArray(parsed.recommendations)) {
        throw new CompatibleProviderError(config.name, "parse_error", `${config.name} ranking returned invalid JSON`);
      }

      const candByKey = new Map<string, AiCandidate>();
      for (const c of args.candidates) {
        candByKey.set(`${c.source}:${c.externalId}`, c);
        candByKey.set(c.externalId, candByKey.get(c.externalId) || c);
      }

      const recommendations: AiRecommendation[] = [];
      for (const [i, item] of parsed.recommendations.entries()) {
        if (!item.externalId) continue;
        const key = item.externalSource ? `${item.externalSource}:${item.externalId}` : item.externalId;
        const cand = candByKey.get(key) || candByKey.get(item.externalId);
        if (!cand) continue;
        recommendations.push({
          id: `${config.name}-${cand.source}-${cand.externalId}-${i}`,
          title: cand.title,
          mediaType: cand.type,
          source: sourceLabel(cand.source),
          externalSource: cand.source,
          externalId: cand.externalId,
          coverUrl: cand.coverUrl,
          overview: cand.overview,
          fitLabel: String(item.fitLabel || "Öneri"),
          reason: String(item.reason || ""),
          risk: item.risk ? String(item.risk) : undefined,
          communitySignal: item.communitySignal ? String(item.communitySignal) : undefined,
          inLibrary: cand.source === "library",
          candidate: cand,
        });
      }

      if (recommendations.length === 0) {
        throw new CompatibleProviderError(config.name, "parse_error", `${config.name} chose no valid candidate`);
      }

      return {
        assistantMessage: parsed.assistantMessage || `İsteğini yorumladım, ${recommendations.length} doğrulanmış öneri hazırladım.`,
        recommendations,
        rejectedCandidates: parsed.rejectedCandidates
          ?.filter((c) => c.title && c.reason)
          .map((c) => ({ title: String(c.title), reason: String(c.reason) }))
          .slice(0, 3),
        transparencySummary: buildTransparency(args.settings),
        intent: args.intent,
        debug: { provider: config.name, usedModel: process.env[config.modelEnv] || config.defaultModel },
      } satisfies AiRecommendResponse;
    },
  };
}

export const openrouterProvider = createCompatibleProvider({
  name: "openrouter",
  apiKeyEnv: "OPENROUTER_API_KEY",
  modelEnv: "OPENROUTER_MODEL",
  defaultModel: "openrouter/free",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
});

export const groqProvider = createCompatibleProvider({
  name: "groq",
  apiKeyEnv: "GROQ_API_KEY",
  modelEnv: "GROQ_MODEL",
  defaultModel: "llama-3.1-8b-instant",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
});
