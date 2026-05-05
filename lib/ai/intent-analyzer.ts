// ============================================
// Intent Analyzer
// ============================================
// Kullanıcı mesajını dinamik sınıflandırır. Heuristik (LLM-bağımsız) çalışır.
// targetTypes: önerilecek tür(ler). sourceTypes: profil filtresi (kaynak zevki).

import { AiIntent, IntentKind } from "./types";
import { MediaType } from "@/lib/types";

const REFERENCE_HINTS = ["gibi", "benzeri", "tarzı", "tarzında", "gibisi", "like"];
const LIBRARY_HINTS = [
  "kütüphan", "listemde", "elimdeki", "bende ne var",
  "bugün ne", "neye devam", "puan verdiğim", "sevdiğim",
];
const MOOD_HINTS = [
  "chill", "rahat", "kısa", "hafif", "ağır", "depresif",
  "romantik", "komik", "karanlık", "kanlı", "hüzünlü",
  "mood", "ruh hali", "feel-good", "cozy", "cozy", "iyileştirici",
];
const AVOIDANCE_HINTS = [
  "bırakt", "dropped", "sıkıldığım", "sevmediğim",
  "neden bırakt", "kaçın", "neye benzemesin",
];

const TYPE_TOKENS: Record<string, MediaType> = {
  film: "movie",
  filmler: "movie",
  movie: "movie",
  dizi: "tv",
  diziler: "tv",
  dizilere: "tv",
  dizilerden: "tv",
  tv: "tv",
  anime: "anime",
  animeler: "anime",
  manga: "manga",
  manhwa: "manhwa",
  manhua: "manhua",
  kitap: "book",
  kitaplar: "book",
  kitaplara: "book",
  book: "book",
};

const RECOMMEND_VERBS = ["öner", "tavsiye", "öneriyo", "ister", "isterim", "istiyorum", "lazım", "arıyorum"];

interface TypeMatch {
  type: MediaType;
  index: number;
}

function findTypeMatches(text: string): TypeMatch[] {
  const matches: TypeMatch[] = [];
  for (const [tok, type] of Object.entries(TYPE_TOKENS)) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(tok, from);
      if (idx === -1) break;
      // Kelime sınırı kontrolü (basit)
      const before = idx === 0 ? " " : text[idx - 1];
      const after = idx + tok.length >= text.length ? " " : text[idx + tok.length];
      if (/[\s\p{P}]/u.test(before) && /[\s\p{P}]/u.test(after)) {
        matches.push({ type, index: idx });
      }
      from = idx + tok.length;
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

/** Hedef türü, "öner/tavsiye" fiiline en yakın tür belirler. */
function resolveTargets(text: string, allMatches: TypeMatch[]): { targets: MediaType[]; sources: MediaType[] } {
  if (allMatches.length === 0) return { targets: [], sources: [] };

  // "öner/tavsiye" konumlarını bul
  const verbPositions: number[] = [];
  for (const v of RECOMMEND_VERBS) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(v, from);
      if (idx === -1) break;
      verbPositions.push(idx);
      from = idx + v.length;
    }
  }

  if (verbPositions.length === 0) {
    // Fiil yoksa: tüm türler hedef sayılır (eski davranış)
    return { targets: dedupe(allMatches.map((m) => m.type)), sources: [] };
  }

  // Her tür için en yakın "öner" mesafesini bul; en yakın olan target.
  let bestTarget: MediaType | null = null;
  let bestDist = Infinity;
  for (const m of allMatches) {
    const dist = Math.min(...verbPositions.map((vp) => Math.abs(vp - m.index)));
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = m.type;
    }
  }

  const targets = bestTarget ? [bestTarget] : [];
  const sources = dedupe(
    allMatches.map((m) => m.type).filter((t) => !targets.includes(t))
  );
  return { targets, sources };
}

export function analyzeIntent(message: string): AiIntent {
  const text = message.toLowerCase();
  const has = (arr: string[]) => arr.some((kw) => text.includes(kw));

  const allTypeMatches = findTypeMatches(text);
  const { targets, sources } = resolveTargets(text, allTypeMatches);

  const isReference = has(REFERENCE_HINTS);
  // cross_media: hem kaynak hem hedef tür var ya da target tür açıkça farklı
  const isCross = sources.length > 0 && targets.length > 0;
  const isLibrary = has(LIBRARY_HINTS);
  const isMood = has(MOOD_HINTS);
  const isAvoid = has(AVOIDANCE_HINTS);

  let kind: IntentKind = "general_recommendation";
  if (isAvoid) kind = "avoidance_analysis";
  else if (isCross) kind = "cross_media_translation";
  else if (isLibrary) kind = "library_based";
  else if (isReference) kind = "reference_based";
  else if (isMood) kind = "mood_based";

  const references = extractReferences(message);
  const mood = MOOD_HINTS.filter((m) => text.includes(m));

  const needsLibraryProfile =
    kind === "library_based" ||
    kind === "avoidance_analysis" ||
    kind === "cross_media_translation" ||
    kind === "reference_based";

  const needsCandidateSearch =
    kind === "reference_based" ||
    kind === "cross_media_translation" ||
    kind === "general_recommendation" ||
    kind === "mood_based";

  const needsWebResearch = kind === "reference_based" || kind === "cross_media_translation";

  return {
    kind,
    references,
    targetTypes: targets,
    sourceTypes: sources,
    mood,
    avoid: [],
    needsLibraryProfile,
    needsCandidateSearch,
    needsWebResearch,
  };
}

function extractReferences(message: string): string[] {
  const refs: string[] = [];
  const re = /([A-ZÇĞİÖŞÜ][\wÇĞİÖŞÜçğıöşü'’\- ]{1,40})\s+(gibi|benzeri|tarzı|tarzında|gibisi)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    refs.push(m[1].trim());
  }
  return refs;
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
