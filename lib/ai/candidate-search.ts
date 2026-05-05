// ============================================
// AI Candidate Search
// ============================================
// Niyet + profile göre dış kaynaklardan / local kütüphaneden aday toplar.
// - reference_based: referans serisi (sequel/season/recap) hariç tutulur.
// - cross_media: yalnızca hedef tür için arama yapılır.
// - mood/general: query expansion ile çoklu deneme yapılır.
// - library_based: status/favorite/rating/aktivite/ilerleme'ye göre skorlanır.

import { MediaItem, MediaType, ProgressLog } from "@/lib/types";
import { AiCandidate, AiIntent, LibraryProfile } from "./types";
import { AniListNormalizedResult, AniListCategory } from "@/lib/anilist-types";
import { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { GlobalSearchResult } from "@/lib/global-search-types";

const PER_SOURCE_LIMIT = 8;
const MAX_TOTAL = 24;

interface SearchContext {
  baseUrl: string;
}

function getBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

// ---- Hedef türleri belirle ----
export function resolveTargetTypes(intent: AiIntent, profile: LibraryProfile | null): MediaType[] {
  // Intent açıkça hedef belirtmişse onu kullan (cross_media için kritik).
  if (intent.targetTypes.length > 0) return intent.targetTypes;
  if (intent.kind === "library_based") return [];
  if (intent.kind === "cross_media_translation") return ["book"];
  if (profile) {
    const sorted = Object.entries(profile.byType).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) return [sorted[0][0] as MediaType];
  }
  return ["anime"];
}

// ---- Query expansion ----
const MOOD_EXPANSIONS: { keys: RegExp; queries: string[] }[] = [
  { keys: /romantik|romance/i, queries: ["romance", "romance fantasy", "romantic"] },
  { keys: /chill|rahat|hafif|cozy|feel-good|iyileştirici/i, queries: ["slice of life", "iyashikei", "feel-good", "cozy"] },
  { keys: /kısa|short/i, queries: ["short", "movie", "OVA"] },
  { keys: /karanlık|dark|psikolojik/i, queries: ["dark fantasy", "psychological", "thriller"] },
  { keys: /güçlenme|leveling|sistem|dungeon/i, queries: ["power progression", "leveling", "game system", "dungeon"] },
  { keys: /komik|comedy/i, queries: ["comedy", "gag"] },
  { keys: /aksiyon|action/i, queries: ["action", "adventure"] },
  { keys: /hüzün|sad|drama/i, queries: ["drama", "tragedy"] },
];

function expandQueries(intent: AiIntent, profile: LibraryProfile | null, message: string): string[] {
  const text = message.toLowerCase();
  const queries: string[] = [];

  // 1) Referans varsa ilk sorgu referansın kendisi
  if (intent.references.length > 0) {
    queries.push(intent.references[0]);
  }

  // 2) Mood expansion'ları
  for (const m of MOOD_EXPANSIONS) {
    if (m.keys.test(text)) queries.push(...m.queries);
  }

  // 3) Profilden top genre (sadece library_based değilken anlamlı)
  if (profile && profile.topGenres.length > 0) {
    queries.push(profile.topGenres[0]);
    if (profile.topGenres[1]) queries.push(profile.topGenres[1]);
  }

  // 4) Mesaj kelimeleri (genel fallback)
  const words = message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length >= 2) queries.push(words.slice(0, 4).join(" "));

  // 5) Boşsa anlamlı default
  if (queries.length === 0) queries.push("popular");

  // Dedupe + lower
  const seen = new Set<string>();
  return queries.filter((q) => {
    const k = q.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---- AniList ----
async function searchAniList(
  ctx: SearchContext,
  q: string,
  type: MediaType
): Promise<AiCandidate[]> {
  if (!q.trim()) return [];
  const cat: AniListCategory =
    type === "anime" ? "anime" :
    type === "manga" ? "manga" :
    type === "manhwa" ? "manhwa" :
    type === "manhua" ? "manhua" :
    "anime";
  try {
    const url = `${ctx.baseUrl}/api/anilist/search?q=${encodeURIComponent(q)}&category=${cat}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: AniListNormalizedResult[] };
    const results = (data.results || []).slice(0, PER_SOURCE_LIMIT);
    return results.map<AiCandidate>((r) => {
      const gs: GlobalSearchResult = {
        source: "anilist",
        externalId: r.externalId,
        type: r.type,
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        genres: r.genres,
        totalProgress: r.totalProgress,
        raw: r,
      };
      return {
        source: "anilist",
        externalId: r.externalId,
        type: r.type,
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        genres: r.genres,
        totalProgress: r.totalProgress,
        averageScore: r.averageScore,
        globalSearch: gs,
      };
    });
  } catch {
    return [];
  }
}

// ---- TVmaze ----
async function searchTvmaze(ctx: SearchContext, q: string): Promise<AiCandidate[]> {
  if (!q.trim()) return [];
  try {
    const url = `${ctx.baseUrl}/api/tvmaze/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: TvmazeNormalizedResult[] };
    const results = (data.results || []).slice(0, PER_SOURCE_LIMIT);
    return results.map<AiCandidate>((r) => {
      const gs: GlobalSearchResult = {
        source: "tvmaze",
        externalId: r.externalId,
        type: "tv",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        genres: r.genres,
        raw: r,
      };
      return {
        source: "tvmaze",
        externalId: r.externalId,
        type: "tv",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        genres: r.genres,
        globalSearch: gs,
      };
    });
  } catch {
    return [];
  }
}

// ---- OpenLibrary ----
async function searchOpenLibrary(ctx: SearchContext, q: string): Promise<AiCandidate[]> {
  if (!q.trim()) return [];
  try {
    const url = `${ctx.baseUrl}/api/openlibrary/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: OpenLibraryNormalizedResult[] };
    const results = (data.results || []).slice(0, PER_SOURCE_LIMIT);
    return results.map<AiCandidate>((r) => {
      const gs: GlobalSearchResult = {
        source: "openlibrary",
        externalId: r.externalId,
        type: "book",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        subjects: r.subjects,
        authors: r.authors,
        totalProgress: r.totalProgress,
        raw: r,
      };
      return {
        source: "openlibrary",
        externalId: r.externalId,
        type: "book",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        genres: r.subjects,
        totalProgress: r.totalProgress,
        globalSearch: gs,
      };
    });
  } catch {
    return [];
  }
}

// ---- Tek bir tür için seçili kaynaktan arama ----
async function searchForType(ctx: SearchContext, type: MediaType, q: string): Promise<AiCandidate[]> {
  switch (type) {
    case "anime":
    case "manga":
    case "manhwa":
    case "manhua":
      return searchAniList(ctx, q, type);
    case "tv":
      return searchTvmaze(ctx, q);
    case "book":
      return searchOpenLibrary(ctx, q);
    case "movie":
      return []; // TMDB pasif
  }
}

// ---- Reference filter (sequel/season/recap dahil dışla) ----
const SEQUEL_TOKENS = [
  "season", "s2", "s3", "s4", "s5", "part", "ii", "iii", "iv", "2nd", "3rd",
  "movie", "the movie", "recap", "reawakening", "special", "ova", "spin off",
  "sequel", "next", "new", "kanketsu",
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function matchesReference(candidateTitle: string, reference: string): boolean {
  const ct = normalize(candidateTitle);
  const rt = normalize(reference);
  if (!rt || rt.length < 3) return false;
  if (ct === rt) return true;
  if (!ct.includes(rt)) return false;
  // Referans alt-string olarak içeriliyor → muhtemelen sequel/recap.
  const extra = ct.replace(rt, " ").trim();
  if (!extra) return true;
  return SEQUEL_TOKENS.some((t) => extra.includes(t)) || /\b\d+\b/.test(extra);
}

function filterReferenceCandidates(
  candidates: AiCandidate[],
  references: string[]
): AiCandidate[] {
  if (references.length === 0) return candidates;
  return candidates.filter((c) => !references.some((r) => matchesReference(c.title, r)));
}

// ---- Library candidate scoring ----
function scoreLibraryItem(m: MediaItem, lastByMedia: Map<string, ProgressLog>): number {
  if (m.status === "dropped") return -Infinity;
  let score = 0;
  if (m.status === "watching" || m.status === "reading") score += 100;
  else if (m.status === "paused") score += 60;
  else if (m.status === "planning") score += 40;
  else if (m.status === "completed") score -= 200;

  if (m.favorite) score += 30;
  if (typeof m.userRating === "number" && m.userRating >= 7) score += m.userRating * 4;

  if (m.totalProgress > 0 && m.currentProgress < m.totalProgress) {
    const pct = m.currentProgress / m.totalProgress;
    if (pct >= 0.5) score += 25; // bitirmeye yakın
    else if (pct >= 0.1) score += 10;
  }

  const last = lastByMedia.get(m.id);
  if (last) {
    const days = (Date.now() - new Date(last.createdAt).getTime()) / 86400000;
    if (days < 3) score += 30;
    else if (days < 14) score += 18;
    else if (days < 60) score += 6;
  }
  return score;
}

function localCandidates(
  mediaItems: MediaItem[],
  intent: AiIntent,
  progressLogs: ProgressLog[]
): AiCandidate[] {
  const lastByMedia = new Map<string, ProgressLog>();
  for (const l of progressLogs) {
    const prev = lastByMedia.get(l.mediaId);
    if (!prev || prev.createdAt < l.createdAt) lastByMedia.set(l.mediaId, l);
  }

  const filtered = mediaItems.filter((m) => {
    if (m.status === "dropped") return false;
    if (intent.targetTypes.length > 0 && !intent.targetTypes.includes(m.type)) return false;
    return true;
  });

  const scored = filtered
    .map((m) => ({ m, s: scoreLibraryItem(m, lastByMedia) }))
    .filter((x) => x.s > -Infinity)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12);

  return scored.map<AiCandidate>(({ m }) => ({
    source: "library",
    externalId: m.id,
    libraryItemId: m.id,
    type: m.type,
    title: m.title,
    overview: m.overview,
    releaseYear: m.releaseYear,
    coverUrl: m.coverImage,
    genres: m.genres,
    totalProgress: m.totalProgress,
  }));
}

// ---- Aday havuzunu birleştir & dedupe ----
function dedupeCandidates(all: AiCandidate[]): AiCandidate[] {
  const seen = new Set<string>();
  return all.filter((c) => {
    const k = `${c.source}:${c.externalId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function runQueriesAcrossTargets(
  ctx: SearchContext,
  targets: MediaType[],
  q: string
): Promise<AiCandidate[]> {
  const tasks = targets.map((t) => searchForType(ctx, t, q));
  const settled = await Promise.allSettled(tasks);
  const out: AiCandidate[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value);
  }
  return out;
}

// ---- Ana fonksiyon ----
export async function searchCandidates(args: {
  intent: AiIntent;
  profile: LibraryProfile | null;
  message: string;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
}): Promise<AiCandidate[]> {
  const { intent, profile, message, mediaItems, progressLogs } = args;

  if (intent.kind === "library_based") {
    return localCandidates(mediaItems, intent, progressLogs);
  }

  const ctx: SearchContext = { baseUrl: getBaseUrl() };
  const targets = resolveTargetTypes(intent, profile);
  if (targets.length === 0) return [];

  const queries = expandQueries(intent, profile, message);

  // İlk sorgu havuzunu topla; boşsa sıradakini dene; aday yine yoksa toplam 3 sorguyu birleştir.
  let pool: AiCandidate[] = [];
  let attempts = 0;
  for (const q of queries) {
    if (attempts >= 3) break;
    const batch = await runQueriesAcrossTargets(ctx, targets, q);
    pool = dedupeCandidates([...pool, ...batch]);
    attempts++;
    if (pool.length >= 6) break; // yeterli çeşitlilik
  }

  // Reference-based: referans serisi/sequel/recap dışla
  if (intent.kind === "reference_based" || intent.references.length > 0) {
    pool = filterReferenceCandidates(pool, intent.references);
  }

  return pool.slice(0, MAX_TOTAL);
}
