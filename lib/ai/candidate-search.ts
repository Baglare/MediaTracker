// ============================================
// AI Candidate Search
// ============================================
// Niyet + profile göre dış kaynaklardan / local kütüphaneden aday toplar.
// - reference_based: referans serisi (sequel/season/recap) hariç tutulur.
// - cross_media: yalnızca hedef tür için arama yapılır.
// - mood/general: query expansion ile çoklu deneme yapılır.
// - library_based: status/favorite/rating/aktivite/ilerleme'ye göre skorlanır.

import { MediaItem, MediaType, ProgressLog } from "@/lib/types";
import {
  AiCandidate,
  AiCandidateIdea,
  AiIntent,
  AiRetrievalDebug,
  AiRetrievalPlan,
  AiSearchPlan,
  LibraryProfile,
  RetrievalSource,
} from "./types";
import { AniListNormalizedResult, AniListCategory } from "@/lib/anilist-types";
import { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { OmdbNormalizedResult } from "@/lib/omdb-types";
import { TmdbNormalizedResult } from "@/lib/tmdb-types";
import { GlobalSearchResult } from "@/lib/global-search-types";
import type { AdvisorScopeMode } from "./types";
import { expandTargetFamily } from "./target-family";

const PER_SOURCE_LIMIT = 8;
const MAX_TOTAL = 24;
const MAX_PLAN_QUERIES = 4;

interface SearchContext {
  baseUrl: string;
  debug?: CandidateSearchDebug;
}

interface CandidateSearchDebug {
  executedQueries: AiRetrievalDebug["executedQueries"];
  sourceCandidateCounts: Record<string, number>;
  filterReasons: Record<string, number>;
  filterBefore: number;
}

export interface CandidateSearchResult {
  candidates: AiCandidate[];
  debug: {
    executedQueries: AiRetrievalDebug["executedQueries"];
    sourceCandidateCounts: Record<string, number>;
    filterSummary: AiRetrievalDebug["filterSummary"];
    finalCandidateCount: number;
    notes: string[];
  };
}

export interface CandidateVerificationResult extends CandidateSearchResult {
  ideaCount: number;
  verifiedCount: number;
  rejectedUnverifiedCount: number;
  verificationSourceCounts: Record<string, number>;
}

function createSearchDebug(): CandidateSearchDebug {
  return {
    executedQueries: [],
    sourceCandidateCounts: {},
    filterReasons: {},
    filterBefore: 0,
  };
}

function addSourceCount(debug: CandidateSearchDebug | undefined, source: string, count: number) {
  if (!debug) return;
  debug.sourceCandidateCounts[source] = (debug.sourceCandidateCounts[source] || 0) + count;
}

function addFilterReason(debug: CandidateSearchDebug | undefined, reason: string) {
  if (!debug) return;
  debug.filterReasons[reason] = (debug.filterReasons[reason] || 0) + 1;
}

function recordQuery(
  debug: CandidateSearchDebug | undefined,
  source: RetrievalSource,
  mediaType: MediaType,
  query: string,
  resultCount: number
) {
  if (!debug) return;
  debug.executedQueries.push({ source, mediaType, query, resultCount });
  addSourceCount(debug, source, resultCount);
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

export function expandQueries(intent: AiIntent, profile: LibraryProfile | null, message: string): string[] {
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

// ============================================
// R37.1 — AniList structured discover
// ============================================
// Doğal dil title-search'in 0 sonuç döndürdüğü mood/length intentlerini
// AniList'in genre/tag/episodes_lesser filtrelerine çevirir. İki pass:
//   strict   → tam mood+length+tags
//   relaxed  → daha az genre, tag yok, ep limiti yok
// AniList genre adları PascalCase ("Slice of Life" gibi); tag adları AniList
// tag kataloğu (ör. "Iyashikei", "Heartwarming", "Dark Fantasy").

interface AniListStructuredQuery {
  genres?: string[];
  tags?: string[];
  episodesLesser?: number;
  sort?: string[];
  reason: string;
}

interface AniListStructuredPasses {
  strict?: AniListStructuredQuery;
  relaxed?: AniListStructuredQuery;
}

function extractAniListStructuredFilters(intent: AiIntent, message: string): AniListStructuredPasses {
  const text = (message + " " + intent.mood.join(" ")).toLowerCase();
  const genres = new Set<string>();
  const tags = new Set<string>();
  let episodesLesser: number | undefined;
  const reasons: string[] = [];

  if (/chill|sakin|rahat|relax|cozy|heart-?warm|iyileş|huzur|feel-?good/i.test(text)) {
    genres.add("Slice of Life");
    genres.add("Comedy");
    tags.add("Iyashikei");
    tags.add("Heartwarming");
    reasons.push("chill→slice_of_life+iyashikei");
  }
  if (/romantik|romance|aşk\b/i.test(text)) {
    genres.add("Romance");
    reasons.push("romance");
  }
  if (/karanlık|karanlik|\bdark\b|psikoloj|psycholog|grim/i.test(text)) {
    genres.add("Psychological");
    genres.add("Thriller");
    tags.add("Dark Fantasy");
    reasons.push("dark→psychological+dark_fantasy");
  }
  if (/fantasy|fantastik|fantazi/i.test(text)) {
    genres.add("Fantasy");
    reasons.push("fantasy");
  }
  if (/sci-?fi|bilim ?kurgu|uzay/i.test(text)) {
    genres.add("Sci-Fi");
    reasons.push("sci-fi");
  }
  if (/aksiyon|action|dövüş|dovus/i.test(text)) {
    genres.add("Action");
    genres.add("Adventure");
    reasons.push("action");
  }
  if (/komedi|comedy|gülmek|gulmek/i.test(text)) {
    genres.add("Comedy");
    reasons.push("comedy");
  }
  if (/gerilim|thriller|gergin/i.test(text)) {
    genres.add("Thriller");
    reasons.push("thriller");
  }
  if (/gizem|mystery|detektif/i.test(text)) {
    genres.add("Mystery");
    reasons.push("mystery");
  }
  if (/\bhorror\b|korku/i.test(text)) {
    genres.add("Horror");
    reasons.push("horror");
  }
  if (/\bdram\b|\bdrama\b/i.test(text)) {
    genres.add("Drama");
    reasons.push("drama");
  }

  // Length → episodes_lesser. "13 bölüm altı" / "12 bölüm" / "kısa" / "short".
  const explicitEp = /(\d+)\s*(?:bölüm|bolum|episode|ep)\b/i.exec(text);
  if (explicitEp) {
    const n = parseInt(explicitEp[1], 10);
    if (n >= 1 && n <= 200) {
      // "12 bölüm" → <=12 + 1; AniList episodes_lesser strict less-than.
      episodesLesser = n + 1;
      reasons.push(`length:<=${n}`);
    }
  }
  if (!episodesLesser && /\b(kısa|kisa|short|tek ot[uü]r)\b/i.test(text)) {
    episodesLesser = 14;
    reasons.push("length:short→<14");
  }

  if (genres.size === 0 && tags.size === 0 && !episodesLesser) {
    return {};
  }

  const strict: AniListStructuredQuery = {
    genres: genres.size > 0 ? Array.from(genres) : undefined,
    tags: tags.size > 0 ? Array.from(tags) : undefined,
    episodesLesser,
    sort: ["POPULARITY_DESC", "SCORE_DESC"],
    reason: reasons.join("|"),
  };

  // Relaxed: en güçlü sinyali bırak (ilk genre), tag/ep limitini kaldır.
  const relaxed: AniListStructuredQuery = {
    genres: strict.genres ? strict.genres.slice(0, 1) : undefined,
    tags: undefined,
    episodesLesser: undefined,
    sort: ["POPULARITY_DESC"],
    reason: `${strict.reason}+relaxed`,
  };

  return { strict, relaxed };
}

function aniListCategoryFor(type: MediaType): AniListCategory | null {
  if (type === "anime") return "anime";
  if (type === "manga") return "manga";
  if (type === "manhwa") return "manhwa";
  if (type === "manhua") return "manhua";
  return null;
}

async function searchAniListDiscover(
  ctx: SearchContext,
  cat: AniListCategory,
  filters: AniListStructuredQuery
): Promise<AiCandidate[]> {
  const url = new URL(`${ctx.baseUrl}/api/anilist/search`);
  url.searchParams.set("category", cat);
  if (filters.genres && filters.genres.length > 0) url.searchParams.set("genres", filters.genres.join(","));
  if (filters.tags && filters.tags.length > 0) url.searchParams.set("tags", filters.tags.join(","));
  if (typeof filters.episodesLesser === "number") {
    url.searchParams.set("episodesLte", String(filters.episodesLesser));
  }
  if (filters.sort && filters.sort.length > 0) url.searchParams.set("sort", filters.sort.join(","));

  // mediaType debug satırı için temsili tür — gerçek sonuçlar normalize'da
  // doğru MediaType ile gelir.
  const debugType: MediaType =
    cat === "anime" ? "anime" : cat === "manhwa" ? "manhwa" : cat === "manhua" ? "manhua" : "manga";
  const queryLabel = `[discover:${filters.reason || "structured"}]`;

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      recordQuery(ctx.debug, "anilist", debugType, queryLabel, 0);
      return [];
    }
    const data = (await res.json()) as { results?: AniListNormalizedResult[] };
    const results = (data.results || []).slice(0, PER_SOURCE_LIMIT);
    recordQuery(ctx.debug, "anilist", debugType, queryLabel, results.length);
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
        format: r.format,
        status: r.anilistStatus,
        globalSearch: gs,
      };
    });
  } catch {
    recordQuery(ctx.debug, "anilist", debugType, queryLabel, 0);
    return [];
  }
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
    recordQuery(ctx.debug, "anilist", type, q, results.length);
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
        format: r.format,
        status: r.anilistStatus,
        globalSearch: gs,
      };
    });
  } catch {
    recordQuery(ctx.debug, "anilist", type, q, 0);
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
    recordQuery(ctx.debug, "tvmaze", "tv", q, results.length);
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
    recordQuery(ctx.debug, "tvmaze", "tv", q, 0);
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
    recordQuery(ctx.debug, "openlibrary", "book", q, results.length);
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
        authors: r.authors,
        totalProgress: r.totalProgress,
        globalSearch: gs,
      };
    });
  } catch {
    recordQuery(ctx.debug, "openlibrary", "book", q, 0);
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
    case "light_novel":
    case "web_novel":
    case "visual_novel":
      return searchOpenLibrary(ctx, q);
    case "movie":
      return searchOmdb(ctx, q);
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

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter((t) => t.length > 1));
}

function titleSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return Math.min(0.92, Math.min(na.length, nb.length) / Math.max(na.length, nb.length) + 0.25);
  const at = tokenSet(na);
  const bt = tokenSet(nb);
  const union = new Set([...at, ...bt]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const t of at) {
    if (bt.has(t)) intersection++;
  }
  return intersection / union.size;
}

function authorMatches(candidate: AiCandidate, author?: string): boolean {
  if (!author) return false;
  const wanted = normalize(author);
  return (candidate.authors || []).some((a) => {
    const got = normalize(a);
    return got === wanted || got.includes(wanted) || wanted.includes(got);
  });
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

function isAniListClip(candidate: AiCandidate): boolean {
  if (candidate.source !== "anilist") return false;
  const format = (candidate.format || "").toUpperCase();
  if (["MUSIC", "PV", "CM"].includes(format)) return true;
  const text = normalize(`${candidate.title} ${candidate.overview || ""}`);
  return /\b(music video|theme song|opening theme|ending theme|commercial|trailer|promotional video|pv)\b/i.test(text);
}

function candidateMatchesTarget(candidate: AiCandidate, targetTypes: MediaType[]): boolean {
  if (targetTypes.length === 0) return true;
  return targetTypes.includes(candidate.type);
}

function hygieneFilterCandidates(
  candidates: AiCandidate[],
  targetTypes: MediaType[],
  references: string[],
  debug?: CandidateSearchDebug
): AiCandidate[] {
  if (debug) debug.filterBefore += candidates.length;
  const filtered = candidates.filter((c) => {
    if (!c.externalId) {
      addFilterReason(debug, "missing_external_id");
      return false;
    }
    if (!candidateMatchesTarget(c, targetTypes)) {
      addFilterReason(debug, "target_type_mismatch");
      return false;
    }
    if (isAniListClip(c)) {
      addFilterReason(debug, "anilist_clip_format");
      return false;
    }
    if (references.some((r) => matchesReference(c.title, r))) {
      addFilterReason(debug, "reference_self_or_variant");
      return false;
    }
    return true;
  });
  return filtered;
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
  progressLogs: ProgressLog[],
  debug?: CandidateSearchDebug,
  message: string = ""
): AiCandidate[] {
  const lastByMedia = new Map<string, ProgressLog>();
  for (const l of progressLogs) {
    const prev = lastByMedia.get(l.mediaId);
    if (!prev || prev.createdAt < l.createdAt) lastByMedia.set(l.mediaId, l);
  }

  // R40.1 — Hedef türler doluysa aile filtresini uygula (manga→manga/manhwa/
  // manhua, "novel" message hint → light/web/visual novel). Hedef yoksa
  // "kütüphane analizi / yarım kalanlar" gibi açık library-continue intent
  // sayılır ve tüm türlere izin verilir.
  const family = intent.targetTypes.length > 0 ? expandTargetFamily(intent.targetTypes, message) : null;
  const filtered = mediaItems.filter((m) => {
    if (m.status === "dropped") {
      addFilterReason(debug, "library_dropped");
      return false;
    }
    if (family && !family.has(m.type)) {
      addFilterReason(debug, "library_target_type_mismatch");
      return false;
    }
    return true;
  });
  if (debug) {
    debug.filterBefore += mediaItems.length;
    debug.sourceCandidateCounts.library = filtered.length;
  }

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
    currentProgress: m.currentProgress,
    totalProgress: m.totalProgress,
    status: m.status,
    userRating: m.userRating,
    favorite: m.favorite,
    lastActivityAt: lastByMedia.get(m.id)?.createdAt,
  }));
}

// ---- Aday havuzunu birleştir & dedupe ----
export function dedupeCandidates(all: AiCandidate[]): AiCandidate[] {
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

function sourceMatchesMediaType(plan: AiSearchPlan): boolean {
  switch (plan.source) {
    case "anilist":
      return ["anime", "manga", "manhwa", "manhua"].includes(plan.mediaType);
    case "tvmaze":
      return plan.mediaType === "tv";
    case "openlibrary":
      return plan.mediaType === "book";
    case "omdb":
      return plan.mediaType === "movie";
    case "tmdb":
      return plan.mediaType === "movie";
    case "library":
      return true;
  }
}

function normalizePlan(plan: AiRetrievalPlan, intent: AiIntent): AiRetrievalPlan {
  const searchPlans = (Array.isArray(plan.searchPlans) ? plan.searchPlans : [])
    .filter(sourceMatchesMediaType)
    .map((p) => ({
      ...p,
      queries: (Array.isArray(p.queries) ? p.queries : [])
        .map((q) => String(q || "").trim())
        .filter(Boolean)
        .slice(0, MAX_PLAN_QUERIES),
      reason: String(p.reason || ""),
    }))
    .filter((p) => p.queries.length > 0)
    .slice(0, 8);

  const targetMediaTypes = (Array.isArray(plan.targetMediaTypes) ? plan.targetMediaTypes : [])
    .filter((t): t is MediaType => ["movie", "tv", "anime", "manga", "manhwa", "manhua", "book"].includes(t));

  return {
    ...plan,
    taskType: plan.taskType || intent.kind,
    interpretation: String(plan.interpretation || ""),
    targetMediaTypes,
    sourceTypes: Array.isArray(plan.sourceTypes) ? plan.sourceTypes : intent.sourceTypes,
    preferenceSignals: Array.isArray(plan.preferenceSignals) ? plan.preferenceSignals.map(String) : [],
    avoidSignals: Array.isArray(plan.avoidSignals) ? plan.avoidSignals.map(String) : intent.avoid,
    needsClarification: Boolean(plan.needsClarification),
    clarificationQuestion: plan.clarificationQuestion ? String(plan.clarificationQuestion) : undefined,
    searchPlans,
  };
}

async function runRetrievalPlan(
  ctx: SearchContext,
  plan: AiRetrievalPlan
): Promise<AiCandidate[]> {
  const tasks: Promise<AiCandidate[]>[] = [];

  for (const p of plan.searchPlans) {
    if (p.source === "library") continue;
    for (const q of p.queries.slice(0, MAX_PLAN_QUERIES)) {
      if (p.source === "anilist") tasks.push(searchAniList(ctx, q, p.mediaType));
      else if (p.source === "tvmaze") tasks.push(searchTvmaze(ctx, q));
      else if (p.source === "openlibrary") tasks.push(searchOpenLibrary(ctx, q));
      else if (p.source === "omdb" || p.source === "tmdb") tasks.push(searchOmdb(ctx, q));
    }
  }

  const settled = await Promise.allSettled(tasks);
  const out: AiCandidate[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value);
  }
  return out;
}

async function searchForIdea(ctx: SearchContext, idea: AiCandidateIdea): Promise<AiCandidate[]> {
  const query = idea.searchHint?.trim() || [idea.title, idea.author].filter(Boolean).join(" ");
  if (!query) return [];
  switch (idea.mediaType) {
    case "anime":
    case "manga":
    case "manhwa":
    case "manhua":
      return searchAniList(ctx, query, idea.mediaType);
    case "tv":
      return searchTvmaze(ctx, query);
    case "book":
    case "light_novel":
    case "web_novel":
    case "visual_novel":
      return searchOpenLibrary(ctx, query);
    case "movie":
      return searchOmdb(ctx, query);
  }
}

// R37 — TMDB film araması (source-apis modunun birincil film kaynağı).
// TMDB route'u key eksikse 503 + boş results döndürdüğü için bu fonksiyon
// boş sonuç durumunda OMDb fallback'in çağrıldığını söyleyen bir sinyal
// üretmez — orchestrator (searchSourceApiCandidates) zaten ardından OMDb'yi
// çalıştırır.
async function searchTmdb(ctx: SearchContext, q: string): Promise<AiCandidate[]> {
  if (!q.trim()) return [];
  try {
    const url = `${ctx.baseUrl}/api/tmdb/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      recordQuery(ctx.debug, "tmdb", "movie", q, 0);
      return [];
    }
    const data = (await res.json()) as { results?: TmdbNormalizedResult[] };
    const results = (data.results || []).filter((r) => r.type === "movie").slice(0, PER_SOURCE_LIMIT);
    recordQuery(ctx.debug, "tmdb", "movie", q, results.length);
    return results.map<AiCandidate>((r) => {
      const gs: GlobalSearchResult = {
        source: "tmdb",
        externalId: r.externalId,
        type: "movie",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        totalProgress: r.totalProgress,
        raw: r,
      };
      return {
        source: "tmdb",
        externalId: r.externalId,
        type: "movie",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        totalProgress: r.totalProgress,
        globalSearch: gs,
      };
    });
  } catch {
    recordQuery(ctx.debug, "tmdb", "movie", q, 0);
    return [];
  }
}

async function searchOmdb(ctx: SearchContext, q: string): Promise<AiCandidate[]> {
  if (!q.trim()) return [];
  try {
    const url = `${ctx.baseUrl}/api/omdb/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: OmdbNormalizedResult[] };
    const results = (data.results || []).slice(0, PER_SOURCE_LIMIT);
    recordQuery(ctx.debug, "omdb", "movie", q, results.length);
    return results.map<AiCandidate>((r) => {
      const gs: GlobalSearchResult = {
        source: "omdb",
        externalId: r.externalId,
        type: "movie",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        genres: r.genres,
        totalProgress: r.totalProgress,
        raw: r,
      };
      return {
        source: "omdb",
        externalId: r.externalId,
        type: "movie",
        title: r.title,
        overview: r.overview,
        releaseYear: r.releaseYear,
        coverUrl: r.coverUrl,
        genres: r.genres,
        totalProgress: r.totalProgress,
        averageScore: r.imdbRating,
        globalSearch: gs,
      };
    });
  } catch {
    recordQuery(ctx.debug, "omdb", "movie", q, 0);
    return [];
  }
}

function bestVerifiedCandidate(idea: AiCandidateIdea, candidates: AiCandidate[]): AiCandidate | null {
  let best: { candidate: AiCandidate; score: number } | null = null;
  for (const c of candidates) {
    if (c.type !== idea.mediaType) continue;
    let score = titleSimilarity(c.title, idea.title);
    if (idea.mediaType === "book" && authorMatches(c, idea.author)) score += 0.18;
    if (idea.year && c.releaseYear && Math.abs(c.releaseYear - idea.year) <= 1) score += 0.04;
    if (!best || score > best.score) best = { candidate: c, score };
  }
  if (!best) return null;
  const threshold = idea.mediaType === "book" && idea.author ? 0.72 : 0.78;
  return best.score >= threshold ? best.candidate : null;
}

// ---- Ana fonksiyon ----
export async function searchCandidates(args: {
  intent: AiIntent;
  retrievalPlan?: AiRetrievalPlan | null;
  profile: LibraryProfile | null;
  message: string;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
}): Promise<AiCandidate[]> {
  const result = await searchCandidatesWithDebug(args);
  return result.candidates;
}

export async function verifyCandidateIdeasWithDebug(args: {
  ideas: AiCandidateIdea[];
  intent: AiIntent;
  targetTypes: MediaType[];
}): Promise<CandidateVerificationResult> {
  const debug = createSearchDebug();
  const ctx: SearchContext = { baseUrl: getBaseUrl(), debug };
  const verificationSourceCounts: Record<string, number> = {};
  const verified: AiCandidate[] = [];
  let rejectedUnverifiedCount = 0;

  for (const idea of args.ideas) {
    if (args.targetTypes.length > 0 && !args.targetTypes.includes(idea.mediaType)) {
      rejectedUnverifiedCount++;
      addFilterReason(debug, "idea_target_type_mismatch");
      continue;
    }
    const results = await searchForIdea(ctx, idea);
    const match = bestVerifiedCandidate(idea, results);
    if (!match) {
      rejectedUnverifiedCount++;
      addFilterReason(debug, "idea_unverified");
      continue;
    }
    verificationSourceCounts[match.source] = (verificationSourceCounts[match.source] || 0) + 1;
    verified.push(match);
  }

  const rawCount = verified.length;
  const deduped = dedupeCandidates(verified);
  if (deduped.length < rawCount) {
    debug.filterReasons.duplicate = (debug.filterReasons.duplicate || 0) + (rawCount - deduped.length);
  }
  const filtered = hygieneFilterCandidates(
    deduped,
    args.targetTypes,
    args.intent.references,
    debug
  ).slice(0, MAX_TOTAL);

  const filterSummary = {
    before: debug.filterBefore,
    after: filtered.length,
    removed: Math.max(0, debug.filterBefore - filtered.length),
    reasons: debug.filterReasons,
  };

  return {
    candidates: filtered,
    ideaCount: args.ideas.length,
    verifiedCount: filtered.length,
    rejectedUnverifiedCount,
    verificationSourceCounts,
    debug: {
      executedQueries: debug.executedQueries,
      sourceCandidateCounts: debug.sourceCandidateCounts,
      filterSummary,
      finalCandidateCount: filtered.length,
      notes: [],
    },
  };
}

export async function searchCandidatesWithDebug(args: {
  intent: AiIntent;
  retrievalPlan?: AiRetrievalPlan | null;
  profile: LibraryProfile | null;
  message: string;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
}): Promise<CandidateSearchResult> {
  const { intent, retrievalPlan, profile, message, mediaItems, progressLogs } = args;
  const debug = createSearchDebug();
  const notes: string[] = [];

  const finish = (candidates: AiCandidate[]): CandidateSearchResult => {
    const filterSummary = {
      before: debug.filterBefore,
      after: candidates.length,
      removed: Math.max(0, debug.filterBefore - candidates.length),
      reasons: debug.filterReasons,
    };
    return {
      candidates,
      debug: {
        executedQueries: debug.executedQueries,
        sourceCandidateCounts: debug.sourceCandidateCounts,
        filterSummary,
        finalCandidateCount: candidates.length,
        notes,
      },
    };
  };

  if (intent.kind === "library_based") {
    return finish(localCandidates(mediaItems, intent, progressLogs, debug, message));
  }

  const ctx: SearchContext = { baseUrl: getBaseUrl(), debug };

  if (retrievalPlan) {
    const plan = normalizePlan(retrievalPlan, intent);
    if (plan.needsClarification) {
      notes.push("planning_requested_clarification");
      return finish([]);
    }
    const rawPool = await runRetrievalPlan(ctx, plan);
    const pool = dedupeCandidates(rawPool);
    if (pool.length < rawPool.length) {
      debug.filterReasons.duplicate = (debug.filterReasons.duplicate || 0) + (rawPool.length - pool.length);
    }
    const plannedTargets = plan.targetMediaTypes.length > 0
      ? plan.targetMediaTypes
      : [...new Set(plan.searchPlans.map((p) => p.mediaType))];
    // R40.1 — Aile genişletmesi: "manga öner" planı manhwa/manhua adaylarını da
    // tutsun; "novel" mesajı light/web/visual novel'a yayılsın.
    const plannedFamily = [...expandTargetFamily(plannedTargets, message)];
    return finish(hygieneFilterCandidates(
      pool,
      plannedFamily,
      intent.references,
      debug
    ).slice(0, MAX_TOTAL));
  }

  const targets = resolveTargetTypes(intent, profile);
  if (targets.length === 0) {
    notes.push("target_types_empty");
    return finish([]);
  }

  const queries = expandQueries(intent, profile, message);

  // İlk sorgu havuzunu topla; boşsa sıradakini dene; aday yine yoksa toplam 3 sorguyu birleştir.
  let pool: AiCandidate[] = [];
  let attempts = 0;
  for (const q of queries) {
    if (attempts >= 3) break;
    const batch = await runQueriesAcrossTargets(ctx, targets, q);
    const before = pool.length + batch.length;
    pool = dedupeCandidates([...pool, ...batch]);
    if (pool.length < before) {
      debug.filterReasons.duplicate = (debug.filterReasons.duplicate || 0) + (before - pool.length);
    }
    attempts++;
    if (pool.length >= 6) break; // yeterli çeşitlilik
  }

  // R40.1 — Aile genişletmesi: target tek MediaType olsa da filtre adımı
  // (örn. manga → manhwa/manhua) için aile setini geç.
  const targetsFamily = [...expandTargetFamily(targets, message)];
  return finish(hygieneFilterCandidates(pool, targetsFamily, intent.references, debug).slice(0, MAX_TOTAL));
}

// ============================================
// R37 — Source-API candidate aggregator
// ============================================
// "Kaynak API'leriyle öner" modu için: kullanıcının seçtiği kapsama göre
// uygun harici API'leri paralel sorgular, scope için anlamsız olanları
// atlar. Hatalar Promise.allSettled ile yutulur — biri patladığında diğer
// kaynaklar yine sonuç döndürür. Çıktı R36 scorer'ından geçecek; bu
// fonksiyon kendi başına filtreleme/sıralama yapmaz.

interface ScopePlan {
  /** Bu kapsam için sorgulanacak (source, mediaType) çiftleri */
  pairs: { source: RetrievalSource; mediaType: MediaType }[];
  /** TMDB → OMDb fallback yapılacak mı (sadece movie hedefliyse) */
  tmdbToOmdbFallback: boolean;
}

function planForScope(scope: AdvisorScopeMode): ScopePlan {
  const east: ScopePlan["pairs"] = [
    { source: "anilist", mediaType: "anime" },
    { source: "anilist", mediaType: "manga" },
    { source: "anilist", mediaType: "manhwa" },
    { source: "anilist", mediaType: "manhua" },
  ];
  const screen: ScopePlan["pairs"] = [
    { source: "tmdb", mediaType: "movie" },
    { source: "tvmaze", mediaType: "tv" },
  ];
  const arch: ScopePlan["pairs"] = [{ source: "openlibrary", mediaType: "book" }];

  switch (scope) {
    case "east":
      return { pairs: east, tmdbToOmdbFallback: false };
    case "screen":
      return { pairs: screen, tmdbToOmdbFallback: true };
    case "arch":
      return { pairs: arch, tmdbToOmdbFallback: false };
    case "one-per-world":
    case "mixed":
    default:
      return { pairs: [...east, ...screen, ...arch], tmdbToOmdbFallback: true };
  }
}

function dispatchSearch(
  ctx: SearchContext,
  source: RetrievalSource,
  mediaType: MediaType,
  query: string
): Promise<AiCandidate[]> {
  switch (source) {
    case "anilist":
      // AniList için mediaType halihazırda anime/manga/manhwa/manhua olmalı
      if (mediaType === "anime" || mediaType === "manga" || mediaType === "manhwa" || mediaType === "manhua") {
        return searchAniList(ctx, query, mediaType);
      }
      return Promise.resolve([]);
    case "tvmaze":
      return searchTvmaze(ctx, query);
    case "openlibrary":
      return searchOpenLibrary(ctx, query);
    case "tmdb":
      return searchTmdb(ctx, query);
    case "omdb":
      return searchOmdb(ctx, query);
    case "library":
      return Promise.resolve([]);
  }
}

export interface SourceApiCandidatesResult {
  candidates: AiCandidate[];
  executedQueries: AiRetrievalDebug["executedQueries"];
  sourceCandidateCounts: Record<string, number>;
  notes: string[];
}

export async function searchSourceApiCandidates(args: {
  intent: AiIntent;
  profile: LibraryProfile | null;
  message: string;
  scopeMode?: AdvisorScopeMode;
  /** İstenirse caller'ın paylaşılan debug nesnesi (queries/counts buraya da yazılır) */
  sharedDebug?: CandidateSearchDebug;
}): Promise<SourceApiCandidatesResult> {
  const { intent, profile, message, scopeMode } = args;
  const scope = scopeMode || "mixed";
  const plan = planForScope(scope);
  const notes: string[] = [];

  // Hedef tür intent'te belirginse onunla pair'leri filtrele (örn. "kitap öner"
  // → sadece book pair'i çağrılsın). Boşsa scope'un tüm pair'leri çalışsın.
  let pairs = plan.pairs;
  if (intent.targetTypes.length > 0) {
    const targetSet = new Set(intent.targetTypes);
    const filtered = pairs.filter((p) => targetSet.has(p.mediaType));
    if (filtered.length > 0) pairs = filtered;
  }

  // Çok az pair varsa (scope=arch gibi) tek sorgu yeterli; aksi halde ilk 2 sorgu.
  const expanded = expandQueries(intent, profile, message);
  const queryCount = pairs.length <= 2 ? 2 : 1;
  const queries = expanded.slice(0, queryCount);
  if (queries.length === 0) {
    notes.push("source_apis_no_query");
    return { candidates: [], executedQueries: [], sourceCandidateCounts: {}, notes };
  }

  const localDebug: CandidateSearchDebug = args.sharedDebug || createSearchDebug();
  const ctx: SearchContext = { baseUrl: getBaseUrl(), debug: localDebug };

  const collected: AiCandidate[] = [];

  // R37.1 — AniList tarafında doğal dil title-search yerine structured discover
  // dene. Mood/length intentleri varsa strict pass, 0 dönerse relaxed pass.
  const anilistPairs = pairs.filter((p) => p.source === "anilist");
  const otherPairs = pairs.filter((p) => p.source !== "anilist");
  const structured = extractAniListStructuredFilters(intent, message);

  if (anilistPairs.length > 0 && structured.strict) {
    const anilistCats = new Set<AniListCategory>();
    for (const pair of anilistPairs) {
      const cat = aniListCategoryFor(pair.mediaType);
      if (cat) anilistCats.add(cat);
    }

    const strictTasks: Promise<AiCandidate[]>[] = [];
    for (const cat of anilistCats) {
      strictTasks.push(searchAniListDiscover(ctx, cat, structured.strict));
    }
    const strictSettled = await Promise.allSettled(strictTasks);
    const strictBatch: AiCandidate[] = [];
    for (const s of strictSettled) {
      if (s.status === "fulfilled") strictBatch.push(...s.value);
    }
    notes.push(
      `anilist_discover_strict:filters=${structured.strict.reason} cats=${Array.from(anilistCats).join("/")} hits=${strictBatch.length}`
    );

    if (strictBatch.length === 0 && structured.relaxed) {
      const relaxedTasks: Promise<AiCandidate[]>[] = [];
      for (const cat of anilistCats) {
        relaxedTasks.push(searchAniListDiscover(ctx, cat, structured.relaxed));
      }
      const relaxedSettled = await Promise.allSettled(relaxedTasks);
      const relaxedBatch: AiCandidate[] = [];
      for (const s of relaxedSettled) {
        if (s.status === "fulfilled") relaxedBatch.push(...s.value);
      }
      notes.push(
        `anilist_discover_relaxed:filters=${structured.relaxed.reason} cats=${Array.from(anilistCats).join("/")} hits=${relaxedBatch.length}`
      );
      collected.push(...relaxedBatch);
    } else {
      collected.push(...strictBatch);
    }
  } else if (anilistPairs.length > 0) {
    // Structured sinyal yok → mevcut title-search davranışı.
    const titleTasks: Promise<AiCandidate[]>[] = [];
    for (const pair of anilistPairs) {
      for (const q of queries) {
        titleTasks.push(dispatchSearch(ctx, pair.source, pair.mediaType, q));
      }
    }
    const settled = await Promise.allSettled(titleTasks);
    for (const s of settled) {
      if (s.status === "fulfilled") collected.push(...s.value);
    }
    notes.push(`anilist_title_search:queries=${queries.length} pairs=${anilistPairs.length}`);
  }

  // AniList dışı kaynaklar: title-search hâlâ geçerli.
  const otherTasks: Promise<AiCandidate[]>[] = [];
  for (const pair of otherPairs) {
    for (const q of queries) {
      otherTasks.push(dispatchSearch(ctx, pair.source, pair.mediaType, q));
    }
  }
  const otherSettled = await Promise.allSettled(otherTasks);
  for (const s of otherSettled) {
    if (s.status === "fulfilled") collected.push(...s.value);
  }

  // Film için TMDB hiç sonuç döndürmediyse OMDb fallback'i.
  if (plan.tmdbToOmdbFallback) {
    const wantsMovie = pairs.some((p) => p.mediaType === "movie");
    if (wantsMovie) {
      const tmdbCount = collected.filter((c) => c.source === "tmdb").length;
      if (tmdbCount === 0) {
        notes.push("tmdb_empty_omdb_fallback");
        for (const q of queries) {
          try {
            const fb = await searchOmdb(ctx, q);
            collected.push(...fb);
          } catch {
            // yutulur — fallback'in başarısız olması akışı durdurmaz
          }
        }
      }
    }
  }

  const deduped = dedupeCandidates(collected);

  // Kapsam sınırlandırması: scope explicit ise diğer dünyaları sızdırma.
  let finalCandidates = deduped;
  if (scope === "east") {
    finalCandidates = deduped.filter((c) =>
      c.type === "anime" || c.type === "manga" || c.type === "manhwa" || c.type === "manhua"
    );
  } else if (scope === "screen") {
    finalCandidates = deduped.filter((c) => c.type === "tv" || c.type === "movie");
  } else if (scope === "arch") {
    finalCandidates = deduped.filter((c) => c.type === "book");
  }

  return {
    candidates: finalCandidates.slice(0, MAX_TOTAL),
    executedQueries: localDebug.executedQueries,
    sourceCandidateCounts: localDebug.sourceCandidateCounts,
    notes,
  };
}

