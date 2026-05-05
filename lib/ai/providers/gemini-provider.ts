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
} from "../types";
import { summarizeProfile } from "../profile-builder";

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

function buildPrompt(args: {
  message: string;
  profile: LibraryProfile | null;
  intent: AiIntent;
  settings: AiSettings;
  candidates: AiCandidate[];
}): string {
  const { message, profile, intent, settings, candidates } = args;
  const profileBlock = settings.useProfile && profile
    ? `Kütüphane profili (özet): ${summarizeProfile(profile)}`
    : "Kütüphane profili kullanılmıyor.";
  const notesBlock = settings.usePersonalNotes && profile?.notes?.length
    ? `Kişisel notlar: ${profile.notes.map((n) => `${n.title}: ${n.note}`).join(" | ")}`
    : "Kişisel notlar dahil değil.";
  const webBlock = settings.useWebResearch
    ? "Web araştırması açık: topluluk genel kanısı için kendi bilgine başvurabilirsin (kısa cümle, kaynak iddia etme)."
    : "Web araştırması kapalı: communitySignal alanını boş bırak.";

  return [
    "Sen bir medya tavsiye danışmanısın. Türkçe cevap ver.",
    `Kullanıcı isteği: """${message}"""`,
    `Niyet: ${intent.kind}. Hedef türler: ${intent.targetTypes.join(",") || "belirsiz"}. Mood: ${intent.mood.join(",") || "belirsiz"}. Referanslar: ${intent.references.join(",") || "yok"}.`,
    profileBlock,
    notesBlock,
    webBlock,
    "",
    "ADAY HAVUZU (yalnızca buradan seç, asla başka başlık uydurma):",
    describeCandidates(candidates) || "(boş)",
    "",
    "Görev: Aday havuzundan en uygun 3-5 öneriyi seç. Her öneri için 'externalSource' ve 'externalId' alanlarını listedeki köşeli parantez değerleriyle birebir döndür.",
    "Uymayan adaylardan 1-3 tanesi için kısa not ver (rejectedCandidates).",
    "Sadece geçerli JSON döndür, başka hiçbir şey yazma. Şema:",
    `{
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

function extractJson(text: string): ParsedJson | null {
  const stripped = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function buildTransparency(settings: AiSettings): string {
  const parts = [
    settings.useProfile ? "kütüphane profil özeti" : null,
    settings.useRecentActivity ? "son aktivite özeti" : null,
    `web araştırması ${settings.useWebResearch ? "açık" : "kapalı"}`,
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
    case "library": return "Kütüphanen";
  }
}

export const geminiProvider: AiProvider = {
  name: "gemini",
  async generate({ message, profile, intent, settings, candidates }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing");
    if (candidates.length === 0) {
      throw new Error("No candidates to rank");
    }

    const prompt = buildPrompt({ message, profile, intent, settings, candidates });
    const res = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data: GeminiResponse = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.recommendations)) {
      throw new Error("Gemini returned non-JSON or invalid shape");
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
      throw new Error("Gemini chose no valid candidate");
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
      debug: { provider: "gemini" },
    };
    return out;
  },
};
