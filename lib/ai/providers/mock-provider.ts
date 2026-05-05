// ============================================
// Mock AI Provider
// ============================================
// Anahtar yokken / fallback için kullanılan deterministik provider.
// Sadece doğrulanmış adaylar üzerinden öneri üretir; hayalî başlık üretmez.

import {
  AiProvider,
  AiRecommendResponse,
  AiRecommendation,
  AiCandidate,
  AiSettings,
} from "../types";

function pickFitLabel(i: number, isLibrary: boolean): string {
  if (isLibrary) return i === 0 ? "Bugün için ideal" : "Devam etmeye uygun";
  return i === 0 ? "Yüksek uyum" : i === 1 ? "Alternatif yön" : "Keşif değeri";
}

function sourceLabel(c: AiCandidate): string {
  switch (c.source) {
    case "anilist": return "AniList";
    case "tvmaze": return "TVmaze";
    case "openlibrary": return "Open Library";
    case "library": return "Kütüphanen";
  }
}

function candidateToRec(c: AiCandidate, i: number): AiRecommendation {
  const isLib = c.source === "library";
  return {
    id: `mock-${c.source}-${c.externalId}-${i}`,
    title: c.title,
    mediaType: c.type,
    source: sourceLabel(c),
    externalSource: c.source,
    externalId: c.externalId,
    coverUrl: c.coverUrl,
    overview: c.overview,
    fitLabel: pickFitLabel(i, isLib),
    reason: isLib
      ? "Profilindeki güçlü sinyallere dayanan seçim."
      : "Mesajınla örtüşen bir aday — kütüphane sinyallerine yakın.",
    inLibrary: isLib,
    candidate: c,
  };
}

function buildAssistantMessage(message: string, settings: AiSettings, count: number): string {
  if (count === 0) {
    return `İsteğini "${message.trim()}" olarak yorumladım, ancak doğrulanmış aday bulunamadı.`;
  }
  const used = [
    settings.useProfile && "kütüphane profili",
    settings.useRecentActivity && "son aktiviteler",
    settings.usePersonalNotes && "kişisel notlar",
    settings.useWebResearch && "web araştırması",
    settings.deepResearch && "derin araştırma",
  ]
    .filter(Boolean)
    .join(", ");
  return `İsteğini "${message.trim()}" olarak yorumladım. ${used || "Yalnızca istek metni"} kullanılarak ${count} doğrulanmış öneri hazırlandı.`;
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

export const mockProvider: AiProvider = {
  name: "mock",
  async generate({ message, intent, settings, candidates }) {
    const picks = candidates.slice(0, 3);
    const recs = picks.map((c, i) => candidateToRec(c, i));
    const res: AiRecommendResponse = {
      assistantMessage: buildAssistantMessage(message, settings, recs.length),
      recommendations: recs,
      transparencySummary: buildTransparency(settings),
      intent,
      debug: { provider: "mock" },
    };
    return res;
  },
};
