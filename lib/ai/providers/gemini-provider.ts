// ============================================
// Gemini AI Provider
// ============================================
// Gemini Free üzerinden adayları sıralatır + zenginleştirir.
// SADECE verilen aday havuzundan seçim yapması istenir; hayalî başlık üretmez.
// Cevap bozuksa hata fırlatır → route mock fallback'e düşer.

import {
  AiProvider,
  AiRecommendResponse,
  AiRecommendation,
  AiCandidate,
  LibraryProfile,
  AiIntent,
  AiSettings,
  AiRetrievalPlan,
  AiCandidateIdea,
} from "../types";
import { summarizeProfile } from "../profile-builder";
import { MediaType } from "@/lib/types";

export type GeminiProviderErrorCode =
  | "rate_limit"
  | "gemini_key_missing"
  | "parse_error"
  | "api_error";

export class GeminiProviderError extends Error {
  code: GeminiProviderErrorCode;
  status?: number;
  provider = "gemini" as const;

  constructor(code: GeminiProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = "GeminiProviderError";
    this.code = code;
    this.status = status;
  }
}

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

function describeCandidates(candidates: AiCandidate[]): string {
  return candidates
    .map((c, i) => {
      const meta = [
        c.releaseYear,
        c.genres?.slice(0, 4).join("/"),
        c.averageScore ? `score:${c.averageScore}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const overview = (c.overview || "").replace(/\s+/g, " ").slice(0, 220);
      return `${i + 1}. [${c.source}:${c.externalId}] ${c.title} (${c.type}${meta ? " · " + meta : ""})${overview ? " — " + overview : ""}`;
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
}): string {
  const { message, profile, intent, settings, candidates, retrievalPlan } = args;
  const profileBlock = settings.useProfile && profile
    ? `Kütüphane profili (özet): ${summarizeProfile(profile)}`
    : "Kütüphane profili kullanılmıyor.";
  const notesBlock = settings.usePersonalNotes && profile?.notes?.length
    ? `Kişisel notlar: ${profile.notes.map((n) => `${n.title}: ${n.note}`).join(" | ")}`
    : "Kişisel notlar dahil değil.";
  const webBlock = settings.useWebResearch
    ? "AI bilgi sinyali açık: genel model bilgini kısa communitySignal için kullanabilirsin; gerçek web/grounding yaptığını iddia etme."
    : "AI bilgi sinyali kapalı: communitySignal alanını boş bırak.";

  return [
    "Sen bir medya tavsiye danışmanısın. Türkçe cevap ver.",
    `Kullanıcı isteği: """${message}"""`,
    `Niyet: ${intent.kind}. Hedef türler: ${intent.targetTypes.join(",") || "belirsiz"}. Mood: ${intent.mood.join(",") || "belirsiz"}. Referanslar: ${intent.references.join(",") || "yok"}.`,
    profileBlock,
    notesBlock,
    webBlock,
    retrievalPlan
      ? `Retrieval plan: ${JSON.stringify({
          taskType: retrievalPlan.taskType,
          interpretation: retrievalPlan.interpretation,
          targetMediaTypes: retrievalPlan.targetMediaTypes,
          sourceTypes: retrievalPlan.sourceTypes,
          preferenceSignals: retrievalPlan.preferenceSignals,
          avoidSignals: retrievalPlan.avoidSignals,
        })}`
      : "Retrieval plan yok.",
    "",
    "ADAY HAVUZU (yalnızca buradan seç, asla başka başlık uydurma):",
    describeCandidates(candidates) || "(boş)",
    "",
    "Görev: Aday havuzundan en uygun 3-5 öneriyi seç. Her öneri için 'externalSource' ve 'externalId' alanlarını listedeki köşeli parantez değerleriyle birebir döndür.",
    "reason somut olsun: kullanıcı isteği + aday metadata + profil sinyalini bağla. risk alanına gerçek uyumsuzluk yaz; yoksa null.",
    "Cross-media önerilerde tema/ton/deneyim çevirisi yaptığını reason içinde belirt.",
    "Aday havuzu zayıfsa assistantMessage içinde bunu açıkça söyle; yine de yalnızca havuzdan seç.",
    "Uymayan adaylardan 1-3 tanesi için kısa not ver (rejectedCandidates).",
    "Sadece geçerli JSON döndür, başka hiçbir şey yazma. Şema:",
    `{
  "assistantMessage": string,
  "recommendations": [
    {
      "externalSource": "anilist"|"tvmaze"|"openlibrary"|"omdb"|"library",
      "externalId": string,
      "fitLabel": string,
      "reason": string,
      "risk": string|null,
      "communitySignal": string|null
    }
  ],
  "rejectedCandidates": [ { "title": string, "reason": string } ]
}`,
    "Tek bir 'Solo Leveling formatına' kilitlenme; isteğin niyetine göre uyarla.",
  ].join("\n");
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

interface ParsedItem {
  externalSource?: string;
  externalId?: string;
  fitLabel?: string;
  reason?: string;
  risk?: string | null;
  communitySignal?: string | null;
}

interface ParsedJson {
  assistantMessage?: string;
  recommendations?: ParsedItem[];
  rejectedCandidates?: { title?: string; reason?: string }[];
}

function extractJson<T = ParsedJson>(text: string): T | null {
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

function isRateLimitResponse(status: number, bodyText: string) {
  return status === 429 || /TooManyRequests|rate.?limit|quota/i.test(bodyText);
}

async function fetchGeminiJson(
  key: string,
  body: Record<string, unknown>,
  context: string
): Promise<GeminiResponse> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${error}`;
    throw new GeminiProviderError("api_error", `Gemini ${context} network error: ${message}`);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    if (isRateLimitResponse(res.status, bodyText)) {
      throw new GeminiProviderError("rate_limit", `Gemini ${context} rate limit`, res.status);
    }
    throw new GeminiProviderError(
      "api_error",
      `Gemini ${context} HTTP ${res.status}: ${bodyText.slice(0, 200)}`,
      res.status
    );
  }

  try {
    return await res.json();
  } catch {
    throw new GeminiProviderError("parse_error", `Gemini ${context} response parse error`);
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
}): string {
  const { message, profile, intent, settings, refinement } = args;
  const profileBlock = settings.useProfile && profile
    ? summarizeProfile(profile)
    : "Profil kullanılmıyor veya yok.";
  const refineBlock = refinement
    ? `Önceki plan ${refinement.candidateCount} aday getirdi. En fazla bir kez daha, daha iyi ama hâlâ gerçek kaynaklarda aranabilir sorgular üret. Önceki plan: ${JSON.stringify(refinement.previousPlan)}`
    : "İlk retrieval planını üret.";

  return [
    "Sen medya tavsiye sistemi için arama planlayıcısın. Türkçe düşün, sadece geçerli JSON döndür.",
    `Kullanıcı mesajı: """${message}"""`,
    `Heuristik intent: ${JSON.stringify(intent)}`,
    `Library profile: ${profileBlock}`,
    refineBlock,
    "",
    "Kurallar:",
    "- Aday başlığı uydurma; sadece arama planı yaz.",
    "- targetMediaTypes belirsizse ve kullanıcı genel olarak 'bir şey öner' diyorsa needsClarification true yap; rastgele TVmaze/OpenLibrary/AniList araması planlama.",
    "- anime/manga/manhwa/manhua için source anilist, tv için tvmaze, book için openlibrary, movie/film için omdb kullan.",
    "- Zevk kararını keyword filtresine bırakma; arama sorgularını kullanıcı isteği, profil ve referanslardan üret.",
    "- searchPlans en fazla 6 plan, her plan en fazla 4 query içersin.",
    "",
    `Şema:
{
  "taskType": "reference_based|cross_media_translation|library_based|mood_based|avoidance_analysis|general_recommendation",
  "interpretation": string,
  "targetMediaTypes": ["tv"|"anime"|"manga"|"manhwa"|"manhua"|"book"|"movie"],
  "sourceContext": string,
  "sourceTypes": ["tv"|"anime"|"manga"|"manhwa"|"manhua"|"book"|"movie"],
  "preferenceSignals": string[],
  "avoidSignals": string[],
  "needsClarification": boolean,
  "clarificationQuestion": string|null,
  "searchPlans": [
    { "source": "anilist"|"tvmaze"|"openlibrary"|"omdb", "mediaType": "tv"|"anime"|"manga"|"manhwa"|"manhua"|"book"|"movie", "queries": string[], "reason": string }
  ]
}`,
  ].join("\n");
}

function buildCandidateIdeasPrompt(args: {
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
  retrievalPlan?: AiRetrievalPlan | null;
  refinement?: {
    previousIdeas: AiCandidateIdea[];
    verifiedCount: number;
  };
}): string {
  const { message, profile, intent, settings, retrievalPlan, refinement } = args;
  const profileBlock = settings.useProfile && profile
    ? summarizeProfile(profile)
    : "Profil kullanılmıyor veya yok.";
  const notesBlock = settings.usePersonalNotes && profile?.notes?.length
    ? profile.notes.map((n) => `${n.title}: ${n.note}`).join(" | ")
    : "Kişisel not yok.";
  const refineBlock = refinement
    ? `Önceki aday fikirlerinden yalnızca ${refinement.verifiedCount} tanesi doğrulandı. Aynı başlıkları tekrar etme. Önceki fikirler: ${JSON.stringify(refinement.previousIdeas)}`
    : "İlk aday fikirlerini üret.";

  return [
    "Sen medya tavsiye sistemi için aday başlık fikirleri üreten bir asistansın. Sadece JSON döndür.",
    "Kaynak doğrulaması yaptığını iddia etme. Sadece doğrulanabilir başlık fikirleri üret.",
    `Kullanıcı mesajı: """${message}"""`,
    `Intent: ${JSON.stringify(intent)}`,
    `Retrieval plan/context: ${JSON.stringify(retrievalPlan || null)}`,
    `Library profile: ${profileBlock}`,
    `Notlar: ${notesBlock}`,
    refineBlock,
    "",
    "Kurallar:",
    "- Her fikir gerçek kaynaklarda title search ile bulunabilecek spesifik bir başlık olmalı.",
    "- Hedef medya türüne kesin uy: target book ise sadece book, target anime ise sadece anime üret.",
    "- Cross-media isteklerde source zevkini hedef türe çevir: tema, ton, tempo, karakter dinamiği, deneyim.",
    "- Referans başlığın kendisini veya sequel/season/recap/movie/special varyantını fikir olarak verme.",
    "- Kitap fikirlerinde mümkünse author ver; searchHint kısa ve title/author odaklı olsun.",
    "- En fazla 10 fikir üret.",
    "",
    `Şema:
{
  "ideas": [
    {
      "title": string,
      "mediaType": "tv"|"anime"|"manga"|"manhwa"|"manhua"|"book"|"movie",
      "author": string|null,
      "studio": string|null,
      "year": number|null,
      "whyItMightFit": string,
      "searchHint": string
    }
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
        ["anilist", "tvmaze", "openlibrary", "omdb", "library"].includes(p.source) &&
        isMediaType(p.mediaType)
      )
      .slice(0, 6),
  };
}

export async function generateGeminiRetrievalPlan(args: {
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
  refinement?: {
    previousPlan: AiRetrievalPlan | null;
    candidateCount: number;
  };
}): Promise<AiRetrievalPlan> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiProviderError("gemini_key_missing", "GEMINI_API_KEY missing");

  const prompt = buildPlanningPrompt(args);
  const data = await fetchGeminiJson(
    key,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: args.refinement ? 0.55 : 0.35,
      },
    },
    "planning"
  );
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const parsed = extractJson<Partial<AiRetrievalPlan>>(text);
  if (!parsed) {
    throw new GeminiProviderError("parse_error", "Gemini planning returned invalid JSON");
  }
  return normalizePlanShape(parsed, args.intent);
}

interface CandidateIdeasJson {
  ideas?: Partial<AiCandidateIdea>[];
}

export async function generateGeminiCandidateIdeas(args: {
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
  retrievalPlan?: AiRetrievalPlan | null;
  refinement?: {
    previousIdeas: AiCandidateIdea[];
    verifiedCount: number;
  };
}): Promise<AiCandidateIdea[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiProviderError("gemini_key_missing", "GEMINI_API_KEY missing");

  const prompt = buildCandidateIdeasPrompt(args);
  const data = await fetchGeminiJson(
    key,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: args.refinement ? 0.7 : 0.55,
      },
    },
    "candidate ideas"
  );
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const parsed = extractJson<CandidateIdeasJson>(text);
  if (!parsed) {
    throw new GeminiProviderError("parse_error", "Gemini candidate ideas returned invalid JSON");
  }
  return (parsed?.ideas || [])
    .map((idea): Partial<AiCandidateIdea> => ({
      title: String(idea.title || "").trim(),
      mediaType: idea.mediaType,
      author: idea.author ? String(idea.author).trim() : undefined,
      studio: idea.studio ? String(idea.studio).trim() : undefined,
      year: typeof idea.year === "number" ? idea.year : undefined,
      whyItMightFit: String(idea.whyItMightFit || "").trim(),
      searchHint: idea.searchHint ? String(idea.searchHint).trim() : undefined,
    }))
    .filter((idea): idea is AiCandidateIdea =>
      !!idea.title &&
      isMediaType(idea.mediaType)
    )
    .slice(0, 10);
}

function buildTransparency(settings: AiSettings): string {
  const parts = [
    settings.useProfile ? "kütüphane profil özeti" : null,
    settings.useRecentActivity ? "son aktivite özeti" : null,
    `AI bilgi sinyali ${settings.useWebResearch ? "açık" : "kapalı"}`,
    `kişisel notlar ${settings.usePersonalNotes ? "dahil" : "değil"}`,
    settings.deepResearch ? "derin araştırma modu" : null,
  ].filter(Boolean);
  return `Bu istekte kullanılacaklar: ${parts.join(", ")}.`;
}

function sourceLabel(s: AiCandidate["source"]): string {
  switch (s) {
    case "anilist": return "AniList";
    case "tvmaze": return "TVmaze";
    case "openlibrary": return "Open Library";
    case "omdb": return "OMDb";
    case "library": return "Kütüphanen";
  }
}

export const geminiProvider: AiProvider = {
  name: "gemini",
  isAvailable() {
    return !!process.env.GEMINI_API_KEY;
  },
  generateRetrievalPlan(args) {
    return generateGeminiRetrievalPlan(args);
  },
  async generate({ message, profile, intent, settings, candidates, retrievalPlan }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new GeminiProviderError("gemini_key_missing", "GEMINI_API_KEY missing");
    if (candidates.length === 0) {
      throw new GeminiProviderError("api_error", "No candidates to rank");
    }

    const prompt = buildRankingPrompt({ message, profile, intent, settings, candidates, retrievalPlan });
    const data = await fetchGeminiJson(
      key,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      },
      "ranking"
    );
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.recommendations)) {
      throw new GeminiProviderError("parse_error", "Gemini returned non-JSON or invalid shape");
    }

    // Adayları map'le
    const candByKey = new Map<string, AiCandidate>();
    for (const c of candidates) {
      candByKey.set(`${c.source}:${c.externalId}`, candByKey.get(`${c.source}:${c.externalId}`) ?? c);
      candByKey.set(c.externalId, candByKey.get(c.externalId) ?? c);
    }

    const recommendations: AiRecommendation[] = [];
    for (const [i, item] of parsed.recommendations.entries()) {
      if (!item || !item.externalId) continue;
      const key = item.externalSource
        ? `${item.externalSource}:${item.externalId}`
        : item.externalId;
      const cand = candByKey.get(key) || candByKey.get(item.externalId);
      if (!cand) continue; // hayalî başlık → at
      recommendations.push({
        id: `gemini-${cand.source}-${cand.externalId}-${i}`,
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
      throw new GeminiProviderError("parse_error", "Gemini chose no valid candidate");
    }

    const out: AiRecommendResponse = {
      assistantMessage:
        parsed.assistantMessage ||
        `İsteğini yorumladım, ${recommendations.length} doğrulanmış öneri hazırladım.`,
      recommendations,
      rejectedCandidates: parsed.rejectedCandidates
        ?.filter((c) => c && c.title && c.reason)
        .map((c) => ({ title: String(c.title), reason: String(c.reason) }))
        .slice(0, 3),
      transparencySummary: buildTransparency(settings),
      intent,
      debug: { provider: "gemini", usedModel: MODEL },
    };
    return out;
  },
};
