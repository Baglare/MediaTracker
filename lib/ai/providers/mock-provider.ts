// ============================================
// Mock AI Provider
// ============================================
// Anahtar yokken / fallback için kullanılan deterministik provider.
// Sadece doğrulanmış adaylar üzerinden öneri üretir; hayali başlık üretmez.

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
    case "omdb": return "OMDb";
    case "tmdb": return "TMDB";
    case "library": return "Kütüphanen";
  }
  return "Kaynak";
}

function libraryReason(c: AiCandidate): string {
  const parts = [
    c.status ? `durum: ${c.status}` : null,
    typeof c.currentProgress === "number" && typeof c.totalProgress === "number" && c.totalProgress > 0
      ? `ilerleme: ${c.currentProgress}/${c.totalProgress}`
      : null,
    c.favorite ? "favorilerinde" : null,
    typeof c.userRating === "number" ? `puan: ${c.userRating}/10` : null,
    c.lastActivityAt ? `son aktivite: ${new Date(c.lastActivityAt).toLocaleDateString("tr-TR")}` : null,
  ].filter(Boolean);
  return parts.length > 0
    ? `Kütüphanendeki somut sinyaller öne çıkarıyor: ${parts.join(", ")}.`
    : "Kütüphanendeki tamamlanmamış ve devam etmeye uygun adaylardan biri.";
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
      ? libraryReason(c)
      : `${sourceLabel(c)} kaynağından doğrulanmış; ${c.genres?.slice(0, 3).join(", ") || c.type} tonları isteğine yakın duruyor.`,
    inLibrary: isLib,
    candidate: c,
  };
}

function buildAssistantMessage(message: string, settings: AiSettings, count: number): string {
  if (count === 0) {
    return `İsteğini "${message.trim()}" olarak yorumladım. Bu kapsamda uygun yeni aday bulamadım. Kapsamı genişletmeyi veya farklı bir mood/tür denemeyi deneyebilirsin.`;
  }
  const used = [
    settings.useProfile && "kütüphane profili",
    settings.useRecentActivity && "son aktiviteler",
    settings.usePersonalNotes && "kişisel notlar",
    settings.useWebResearch && "AI bilgi sinyali",
    settings.deepResearch && "derin araştırma",
  ]
    .filter(Boolean)
    .join(", ");
  return `İsteğini "${message.trim()}" olarak yorumladım. ${used || "Yalnızca istek metni"} ile ${count} öneri hazırladım.`;
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
