// ============================================
// R36 — Rule-based candidate scorer
// ============================================
// ML yok, web research yok. Yalnızca mevcut LibraryProfile + intent + user
// message üzerinden aday skorlaması yapar. Provider sıralama prompt'unda
// score + reasons görünür ve "neden önerildi" açıklamaları bunlara bağlanır.
//
// Bu modül adayların KAYNAĞINI değiştirmez — sadece sıralar ve sebepler ekler.
// Hard-reject davranışı: kütüphanede zaten bulunan (library source dışı)
// adaylar elenir ve `rejected` listesine taşınır.

import { MediaItem, MediaType } from "@/lib/types";
import { AiCandidate, AiIntent, LibraryProfile } from "./types";

export interface ScoredCandidatesResult {
  scored: AiCandidate[];
  rejected: { title: string; reason: string }[];
  /** Debug için: kaç tane hard-reject edildi, ortalama skor vs. */
  stats: {
    inLibraryRejected: number;
    droppedSimilarPenalty: number;
    pausedSimilarPenalty: number;
    averageScore: number;
    maxScore: number;
    minScore: number;
  };
}

const EAST_TYPES: ReadonlySet<MediaType> = new Set([
  "anime",
  "manga",
  "manhwa",
  "manhua",
  "light_novel",
  "web_novel",
  "visual_novel",
]);
const SCREEN_TYPES: ReadonlySet<MediaType> = new Set(["tv", "movie"]);
const ARCH_TYPES: ReadonlySet<MediaType> = new Set(["book"]);

type WorldKey = "east" | "screen" | "arch";

function worldOf(type: MediaType): WorldKey | null {
  if (EAST_TYPES.has(type)) return "east";
  if (SCREEN_TYPES.has(type)) return "screen";
  if (ARCH_TYPES.has(type)) return "arch";
  return null;
}

function worldLabel(w: WorldKey): string {
  return w === "east" ? "Doğu" : w === "screen" ? "Kadraj" : "Arşiv";
}

// Mood / keyword → tür sözlüğü. Düşük cümlede prefix arama yapar.
const MOOD_KEYWORDS: { keyword: RegExp; label: string; genres: string[] }[] = [
  { keyword: /\bchill\b|sakin|rahat|hafif/i, label: "chill", genres: ["comedy", "slice of life", "iyashikei", "romance"] },
  { keyword: /\bkısa\b|kisa|short|tek otur|hızlı|kısa|kisa/i, label: "kısa", genres: [] },
  { keyword: /\bkaranlık\b|karanlik|grim|dark|psikoloj|psycholog/i, label: "karanlık", genres: ["thriller", "psychological", "horror", "drama", "mystery", "noir"] },
  { keyword: /\bfantasy\b|fantastik|fantazi/i, label: "fantasy", genres: ["fantasy", "high fantasy", "dark fantasy"] },
  { keyword: /\bromantik\b|romance|aşk\b/i, label: "romantik", genres: ["romance"] },
  { keyword: /\b(sci-?fi|bilim ?kurgu|uzay)\b/i, label: "sci-fi", genres: ["sci-fi", "science fiction", "space"] },
  { keyword: /\baksiyon\b|action|dövüş|dovus/i, label: "aksiyon", genres: ["action", "martial arts", "shounen"] },
  { keyword: /\bkomedi\b|komik|comedy|gülmek/i, label: "komedi", genres: ["comedy"] },
  { keyword: /\bgerilim\b|thriller|gergin/i, label: "gerilim", genres: ["thriller", "suspense"] },
  { keyword: /\bgizem\b|mystery|detektif/i, label: "gizem", genres: ["mystery", "detective"] },
];

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function genreSet(values: (string | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    out.add(normalize(v));
  }
  return out;
}

function intersect(a: Set<string>, b: Set<string>): string[] {
  const result: string[] = [];
  for (const v of a) if (b.has(v)) result.push(v);
  return result;
}

export function scoreCandidates(args: {
  candidates: AiCandidate[];
  profile: LibraryProfile | null;
  intent: AiIntent;
  message: string;
  mediaItems: MediaItem[];
  /** route.ts'te kurulan `${source}:${externalId}` set'i */
  libIndex: Map<string, true>;
}): ScoredCandidatesResult {
  const { candidates, profile, intent, message, mediaItems, libIndex } = args;

  // High-rated ve favorite kayıtların tam genre/tag setini lookup için indeksle.
  // LibraryProfile özetinde sadece title/type/rating var; tür eşleşmesi için
  // ham MediaItem'lara title-key ile döneriz.
  const itemByTitle = new Map<string, MediaItem>();
  for (const m of mediaItems) {
    itemByTitle.set(normalize(m.title), m);
  }

  const highRatedSignals: { title: string; type: MediaType; rating: number; genres: Set<string> }[] =
    (profile?.highRated || []).map((h) => {
      const item = itemByTitle.get(normalize(h.title));
      return {
        title: h.title,
        type: h.type,
        rating: h.rating,
        genres: genreSet([...(item?.genres || []), ...(item?.subjects || []), ...(item?.tags || [])]),
      };
    });

  const favoriteSignals: { title: string; type: MediaType; genres: Set<string> }[] =
    (profile?.favorites || []).map((f) => {
      const item = itemByTitle.get(normalize(f.title));
      return {
        title: f.title,
        type: f.type,
        genres: genreSet([...(item?.genres || []), ...(item?.subjects || []), ...(item?.tags || [])]),
      };
    });

  const droppedSignals: { title: string; genres: Set<string> }[] =
    (profile?.dropped || []).map((d) => {
      const item = itemByTitle.get(normalize(d.title));
      return {
        title: d.title,
        genres: genreSet([...(item?.genres || []), ...(item?.subjects || []), ...(item?.tags || [])]),
      };
    });

  const pausedSignals: { title: string; genres: Set<string> }[] =
    (profile?.paused || []).map((p) => {
      const item = itemByTitle.get(normalize(p.title));
      return {
        title: p.title,
        genres: genreSet([...(item?.genres || []), ...(item?.subjects || []), ...(item?.tags || [])]),
      };
    });

  const matchedMoods = MOOD_KEYWORDS.filter(
    (m) => m.keyword.test(message) || intent.mood.some((mm) => m.keyword.test(mm))
  );
  const wantsShort = matchedMoods.some((m) => m.label === "kısa");

  const targetTypeSet = new Set(intent.targetTypes);
  const targetWorlds = new Set<WorldKey>();
  for (const t of intent.targetTypes) {
    const w = worldOf(t);
    if (w) targetWorlds.add(w);
  }

  const rejected: { title: string; reason: string }[] = [];
  let inLibraryRejected = 0;
  let droppedSimilarPenalty = 0;
  let pausedSimilarPenalty = 0;

  const scored: AiCandidate[] = [];

  for (const c of candidates) {
    const candKey = `${c.source}:${c.externalId}`;
    // R36 — Hard reject: zaten kütüphanede olan dış kaynak adayı.
    // Library source intentional (continue mode için), bunlar elenmez.
    if (c.source !== "library" && libIndex.has(candKey)) {
      rejected.push({ title: c.title, reason: "Zaten listende olduğu için elendi" });
      inLibraryRejected++;
      continue;
    }

    let score = 0;
    const reasons: string[] = [];

    const candGenres = genreSet(c.genres || []);
    const candWorld = worldOf(c.type);

    // --- Yüksek puanlılara benzerlik ---
    let bestHighRatedOverlap = 0;
    let bestHighRatedSample: { title: string; rating: number; shared: string[] } | null = null;
    for (const hr of highRatedSignals) {
      const shared = intersect(candGenres, hr.genres);
      if (shared.length > bestHighRatedOverlap) {
        bestHighRatedOverlap = shared.length;
        bestHighRatedSample = { title: hr.title, rating: hr.rating, shared };
      }
      // Tür eşleşmesi + 9+ rating bonus
      if (hr.type === c.type && hr.rating >= 9) {
        score += 1.5;
      }
    }
    if (bestHighRatedOverlap > 0 && bestHighRatedSample) {
      const bonus = Math.min(bestHighRatedOverlap * 1.5, 6);
      score += bonus;
      const sharedLabel = bestHighRatedSample.shared.slice(0, 2).join(", ");
      reasons.push(
        `Yüksek puan verdiğin "${bestHighRatedSample.title}" (${bestHighRatedSample.rating}) ile ortak tür sinyali: ${sharedLabel}`
      );
    }

    // --- Favorilere benzerlik ---
    let bestFavOverlap = 0;
    let bestFavSample: { title: string; shared: string[] } | null = null;
    for (const fav of favoriteSignals) {
      const shared = intersect(candGenres, fav.genres);
      if (shared.length > bestFavOverlap) {
        bestFavOverlap = shared.length;
        bestFavSample = { title: fav.title, shared };
      }
      if (fav.type === c.type) score += 0.5;
    }
    if (bestFavOverlap > 0 && bestFavSample) {
      const bonus = Math.min(bestFavOverlap * 1.0, 4);
      score += bonus;
      reasons.push(
        `Favorilerine benziyor: "${bestFavSample.title}" ile ortak ${bestFavSample.shared.slice(0, 2).join(", ")}`
      );
    }

    // --- Scope / world / target type uyumu ---
    if (targetTypeSet.size > 0) {
      if (targetTypeSet.has(c.type)) {
        score += 2;
        reasons.push(`İstenen tür hedefiyle uyumlu (${c.type})`);
      } else {
        score -= 1;
      }
    }
    if (candWorld && targetWorlds.has(candWorld)) {
      score += 1;
      reasons.push(`${worldLabel(candWorld)} kapsamına uyuyor`);
    }

    // --- Dropped / paused benzerliği — eksi puan ---
    let worstDroppedOverlap = 0;
    let droppedSample = "";
    for (const d of droppedSignals) {
      const shared = intersect(candGenres, d.genres);
      if (shared.length > worstDroppedOverlap) {
        worstDroppedOverlap = shared.length;
        droppedSample = d.title;
      }
    }
    if (worstDroppedOverlap >= 2) {
      score -= 3;
      droppedSimilarPenalty++;
      reasons.push(`Bırakdığın "${droppedSample}" ile benzeşiyor — risk var`);
    } else if (worstDroppedOverlap === 1) {
      score -= 1;
    }

    let worstPausedOverlap = 0;
    let pausedSample = "";
    for (const p of pausedSignals) {
      const shared = intersect(candGenres, p.genres);
      if (shared.length > worstPausedOverlap) {
        worstPausedOverlap = shared.length;
        pausedSample = p.title;
      }
    }
    if (worstPausedOverlap >= 2) {
      score -= 1.5;
      pausedSimilarPenalty++;
      reasons.push(`Duraklattığın "${pausedSample}" ile benzeşiyor`);
    }

    // --- Mood / keyword eşleşmesi ---
    for (const mood of matchedMoods) {
      if (mood.label === "kısa") continue; // length signal aşağıda
      const hit = mood.genres.some((g) => candGenres.has(normalize(g)));
      if (hit) {
        score += 2;
        reasons.push(`İstediğin "${mood.label}" tonuna uyan tür sinyali var`);
      }
    }
    if (wantsShort) {
      const tp = c.totalProgress;
      if (typeof tp === "number" && tp > 0 && tp <= 13) {
        score += 1.5;
        reasons.push(`Kısa süreli (${tp} bölüm/parça)`);
      }
    }

    // --- Community average score küçük tiebreaker ---
    if (typeof c.averageScore === "number" && c.averageScore > 0) {
      // 0..10 ölçeğine indir; AniList 100 ölçekli olabilir.
      const normalized = c.averageScore > 10 ? c.averageScore / 10 : c.averageScore;
      score += Math.max(0, (normalized - 6.5) * 0.4);
    }

    // Sonucu yuvarla
    score = Math.round(score * 10) / 10;
    // En anlamlı 4 nedeni tut, sıralama prompt'u kısa kalsın
    const dedupedReasons = Array.from(new Set(reasons)).slice(0, 4);

    scored.push({
      ...c,
      score,
      scoreReasons: dedupedReasons,
    });
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const scores = scored.map((s) => s.score ?? 0);
  const sum = scores.reduce((acc, v) => acc + v, 0);
  const averageScore = scores.length > 0 ? Math.round((sum / scores.length) * 10) / 10 : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  return {
    scored,
    rejected,
    stats: {
      inLibraryRejected,
      droppedSimilarPenalty,
      pausedSimilarPenalty,
      averageScore,
      maxScore,
      minScore,
    },
  };
}
