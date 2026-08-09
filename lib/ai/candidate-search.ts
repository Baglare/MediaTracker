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
  RankedTagRetrievalTelemetry,
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
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import {
  ASPECT_REGISTRY,
  evidenceStrategyForProvider,
  providerRetrievalMappingsFor,
  type AspectId,
  type AspectProviderRetrievalMapping,
} from "@/features/recommendations/domain/aspect-registry";
import type { CandidateProviderEvidenceSnapshot } from "@/features/recommendations/providers/types";
import {
  ProviderRequestError,
  emptyProviderRequestTelemetry,
  fetchWithProviderRequestPolicy,
  mergeProviderRequestTelemetry,
  type ProviderRequestTelemetry,
} from "@/features/recommendations/providers/request-policy";
import type { RecommendationProvider } from "@/features/recommendations/domain/types";

const PER_SOURCE_LIMIT = 8;
const MAX_TOTAL = 24;
const MAX_PLAN_QUERIES = 4;
const WEB_REQUEST_TIMEOUT_MS = 7000;
const MAX_WEB_QUERIES = 3;
const MAX_WEB_HITS_PER_QUERY = 5;
const MAX_WEB_HITS_TOTAL = 12;
const MAX_WEB_VERIFICATION_QUERIES = 4;
const MAX_WEB_VERIFICATION_QUERIES_PER_SOURCE = 3;
const MAX_RESEARCH_RESCUE_CANDIDATES = 8;

interface SearchContext {
  baseUrl: string;
  debug?: CandidateSearchDebug;
}

interface WebSearchHit {
  title: string;
  url?: string;
  snippet?: string;
}

interface CandidateSearchDebug {
  executedQueries: AiRetrievalDebug["executedQueries"];
  sourceCandidateCounts: Record<string, number>;
  filterReasons: Record<string, number>;
  filterBefore: number;
  providerRequests: Partial<Record<RecommendationProvider, ProviderRequestTelemetry>>;
}

export interface CandidateSearchResult {
  candidates: AiCandidate[];
  debug: {
    executedQueries: AiRetrievalDebug["executedQueries"];
    sourceCandidateCounts: Record<string, number>;
    filterSummary: AiRetrievalDebug["filterSummary"];
    finalCandidateCount: number;
    notes: string[];
    rankedTagRetrieval?: RankedTagRetrievalTelemetry;
    providerRequests?: Partial<Record<RecommendationProvider, ProviderRequestTelemetry>>;
  };
  internal?: {
    rankedTagTraceByCandidateKey: ReadonlyMap<string, CandidateRankedTagTrace>;
  };
}

export interface CandidateRankedTagTrace {
  retrievalPass: "strict_tag" | "relaxed_tag" | "provider_plan" | "title_verification";
  requestedTagMappings: readonly { aspectId: AspectId; canonicalTags: readonly string[] }[];
  returnedTagEvidence: readonly { aspectId: AspectId; canonicalTag: string; rank: number }[];
  rankBand: "85-100" | "60-84" | "40-59" | "20-39" | "below-20" | "unknown";
  eligibility: "retrieval_qualified" | "missing_requested_tag";
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
    providerRequests: {},
  };
}

function recordProviderRequest(debug: CandidateSearchDebug | undefined, telemetry: ProviderRequestTelemetry): void {
  if (!debug) return;
  const current = debug.providerRequests[telemetry.provider] ?? emptyProviderRequestTelemetry(telemetry.provider);
  debug.providerRequests[telemetry.provider] = mergeProviderRequestTelemetry(current, telemetry);
}

async function providerFetch(
  ctx: SearchContext,
  provider: RecommendationProvider,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    const result = await fetchWithProviderRequestPolicy({ provider, url, init });
    recordProviderRequest(ctx.debug, result.telemetry);
    return result.response;
  } catch (error) {
    if (error instanceof ProviderRequestError) recordProviderRequest(ctx.debug, error.telemetry);
    throw error;
  }
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

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeProviderResults<T extends { externalId: string; title: string; type: MediaType; overview?: string }>(
  value: unknown,
  debug: CandidateSearchDebug | undefined,
  allowedTypes: readonly MediaType[],
): T[] {
  if (!Array.isArray(value)) {
    addFilterReason(debug, "provider_response_schema_invalid");
    return [];
  }
  const decoded: T[] = [];
  for (const item of value.slice(0, PER_SOURCE_LIMIT * 2)) {
    if (!item || typeof item !== "object") {
      addFilterReason(debug, "provider_response_item_malformed");
      continue;
    }
    const candidate = item as Partial<T>;
    if (
      typeof candidate.externalId !== "string"
      || candidate.externalId.length === 0
      || candidate.externalId.length > 160
      || typeof candidate.title !== "string"
      || candidate.title.trim().length === 0
      || candidate.title.length > 500
      || typeof candidate.type !== "string"
      || !allowedTypes.includes(candidate.type as MediaType)
    ) {
      addFilterReason(debug, "provider_response_item_malformed");
      continue;
    }
    decoded.push({
      ...candidate,
      title: candidate.title.trim(),
      overview: typeof candidate.overview === "string"
        ? stripHtml(candidate.overview).slice(0, 2_000)
        : undefined,
    } as T);
    if (decoded.length >= PER_SOURCE_LIMIT) break;
  }
  return decoded;
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

type SourceQuerySource = "tmdb" | "tvmaze" | "openlibrary";

const SOURCE_QUERY_SIGNALS: {
  key: string;
  keys: RegExp;
  tmdb: string[];
  tvmaze: string[];
  openlibrary: string[];
}[] = [
  {
    key: "fantasy",
    keys: /fantasy|fantastik|fantazi|buyu|büyü|magic|dragon/i,
    tmdb: ["fantasy adventure", "fantasy"],
    tvmaze: ["fantasy", "supernatural"],
    openlibrary: ["subject:fantasy", "fantasy fiction"],
  },
  {
    key: "sci-fi",
    keys: /sci-?fi|science fiction|bilim ?kurgu|uzay|space|cyberpunk/i,
    tmdb: ["science fiction", "sci fi"],
    tvmaze: ["science fiction", "sci fi"],
    openlibrary: ["subject:science fiction", "science fiction"],
  },
  {
    key: "comedy",
    keys: /komedi|komik|comedy|gulmek|gülmek|funny/i,
    tmdb: ["comedy", "romantic comedy"],
    tvmaze: ["comedy", "sitcom"],
    openlibrary: ["subject:humor", "comic fiction"],
  },
  {
    key: "romance",
    keys: /romantik|romance|ask|aşk|love/i,
    tmdb: ["romance", "romantic drama"],
    tvmaze: ["romance", "romantic drama"],
    openlibrary: ["subject:romance", "romance fiction"],
  },
  {
    key: "thriller",
    keys: /thriller|gerilim|gergin|suspense/i,
    tmdb: ["thriller", "suspense thriller"],
    tvmaze: ["thriller", "suspense"],
    openlibrary: ["subject:thriller", "suspense fiction"],
  },
  {
    key: "horror",
    keys: /horror|korku|paranormal/i,
    tmdb: ["horror", "supernatural horror"],
    tvmaze: ["horror", "supernatural"],
    openlibrary: ["subject:horror", "horror fiction"],
  },
  {
    key: "mystery",
    keys: /mystery|gizem|detektif|detective|crime/i,
    tmdb: ["mystery", "detective mystery"],
    tvmaze: ["mystery", "crime mystery"],
    openlibrary: ["subject:mystery", "detective fiction"],
  },
  {
    key: "drama",
    keys: /\bdrama\b|\bdram\b|huzun|hüzün|sad/i,
    tmdb: ["drama", "character drama"],
    tvmaze: ["drama", "family drama"],
    openlibrary: ["subject:drama", "literary fiction"],
  },
  {
    key: "action",
    keys: /action|aksiyon|macera|adventure|dovus|dövüş/i,
    tmdb: ["action adventure", "action"],
    tvmaze: ["action", "adventure"],
    openlibrary: ["subject:adventure", "action adventure fiction"],
  },
  {
    key: "chill",
    keys: /chill|rahat|hafif|cozy|feel-?good|huzur|sakin/i,
    tmdb: ["feel good", "light comedy"],
    tvmaze: ["feel good", "comedy drama"],
    openlibrary: ["subject:comfort reading", "cozy fiction"],
  },
];

function dedupeQueries(queries: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const clean = q.replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function hasShortRequest(message: string, intent: AiIntent): boolean {
  const text = `${message} ${intent.mood.join(" ")}`;
  return /\b(kısa|kisa|short|tek otur|tek otür|az bölüm|az bolum|cabuk|çabuk)\b/i.test(text);
}

function sourceQueriesFor(
  source: SourceQuerySource,
  intent: AiIntent,
  profile: LibraryProfile | null,
  message: string,
  baseQueries: string[]
): { queries: string[]; signals: string[] } {
  const text = `${message} ${intent.mood.join(" ")}`.toLowerCase();
  const queries: string[] = [];
  const signals: string[] = [];

  for (const signal of SOURCE_QUERY_SIGNALS) {
    if (!signal.keys.test(text)) continue;
    signals.push(signal.key);
    queries.push(...signal[source]);
  }

  if (profile) {
    for (const genre of profile.topGenres.slice(0, 2)) {
      if (source === "openlibrary") queries.push(`subject:${genre}`);
      queries.push(genre);
    }
    for (const tag of profile.topTags.slice(0, 1)) {
      if (source === "openlibrary") queries.push(`subject:${tag}`);
      else queries.push(tag);
    }
  }

  queries.push(...baseQueries.filter((q) => !/^short$|^movie$|^OVA$/i.test(q)));
  return { queries: dedupeQueries(queries, 3), signals };
}

function targetLabelForWeb(type: MediaType): string {
  switch (type) {
    case "movie": return "movies";
    case "tv": return "tv shows";
    case "anime": return "anime";
    case "manga": return "manga";
    case "manhwa": return "manhwa";
    case "manhua": return "manhua";
    case "book":
    case "light_novel":
    case "web_novel":
    case "visual_novel":
      return "books";
  }
}

function buildWebResearchQueries(intent: AiIntent, profile: LibraryProfile | null, message: string): string[] {
  const year = new Date().getFullYear();
  const targets = intent.targetTypes.length > 0 ? intent.targetTypes : resolveTargetTypes(intent, profile);
  const target = targetLabelForWeb(targets[0] || "anime");
  const text = `${message} ${intent.mood.join(" ")}`.toLowerCase();
  const terms = expandQueries(intent, profile, message).filter((q) => !/^popular$/i.test(q)).slice(0, 2);
  const base = terms.length > 0 ? terms.join(" ") : message.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).slice(0, 5).join(" ");
  const queries: string[] = [];

  if (/güncel|guncel|yeni|new|latest|popüler|popular|trend/i.test(text)) {
    queries.push(`best new ${base} ${target} ${year}`);
    queries.push(`popular ${base} ${target} ${year}`);
  }
  if (/yaklaşan|yaklasan|upcoming|gelecek|çıkacak|cikacak/i.test(text)) {
    queries.push(`upcoming ${base} ${target} ${year}`);
  }
  if (/okuma sırası|okuma sirasi|watch order|reading order|sıra|sirasi/i.test(text)) {
    const ref = intent.references[0] || base;
    queries.push(`${ref} reading order ${target}`);
    queries.push(`${ref} watch order ${target}`);
  }
  queries.push(`${base} ${target} recommendations ${year}`);

  return dedupeQueries(queries, MAX_WEB_QUERIES);
}

function extractWebCandidateQueries(hits: WebSearchHit[], fallbackQueries: string[]): string[] {
  const out: string[] = [];
  for (const hit of hits) {
    const title = hit.title
      .replace(/\b(Top|Best|New|Upcoming|Popular|Latest)\s+\d*\b/gi, " ")
      .replace(/\b(Anime|Manga|Movies?|TV Shows?|Books?)\b/gi, " ")
      .split(/\s[-|:]\s/)[0]
      .replace(/\b\d{4}\b/g, " ")
      .replace(/\b(to watch|to read|ranked|list|guide|recommendations?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = title.split(/\s+/).filter((w) => w.length > 2);
    if (words.length >= 2 && words.length <= 8) out.push(words.join(" "));
  }
  out.push(...fallbackQueries);
  return dedupeQueries(out, MAX_WEB_VERIFICATION_QUERIES);
}

async function searchWeb(ctx: SearchContext, query: string, mediaType: MediaType): Promise<{ hits: WebSearchHit[]; note?: string }> {
  if (!query.trim()) return { hits: [] };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEB_REQUEST_TIMEOUT_MS);
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 MediaTracker AI Advisor" },
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) {
      recordQuery(ctx.debug, "web", mediaType, query, 0);
      return { hits: [], note: `web_request_http_${res.status}` };
    }
    const html = await res.text();
    const hits: WebSearchHit[] = [];
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const m of html.matchAll(re)) {
      hits.push({
        url: stripHtml(m[1] || ""),
        title: stripHtml(m[2] || ""),
        snippet: stripHtml(m[3] || ""),
      });
      if (hits.length >= MAX_WEB_HITS_PER_QUERY) break;
    }
    if (hits.length === 0) {
      const titleOnly = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      for (const m of html.matchAll(titleOnly)) {
        hits.push({ url: stripHtml(m[1] || ""), title: stripHtml(m[2] || "") });
        if (hits.length >= MAX_WEB_HITS_PER_QUERY) break;
      }
    }
    recordQuery(ctx.debug, "web", mediaType, query, hits.length);
    return { hits, note: hits.length === 0 ? "web_parse_empty" : undefined };
  } catch (error) {
    recordQuery(ctx.debug, "web", mediaType, query, 0);
    return {
      hits: [],
      note: error instanceof Error && error.name === "AbortError" ? "web_request_timeout" : "web_request_failed",
    };
  }
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
  minimumTagRank?: number;
  episodesLesser?: number;
  sort?: string[];
  reason: string;
}

interface AniListStructuredPasses {
  strict?: AniListStructuredQuery;
  relaxed?: AniListStructuredQuery;
}

export function extractAniListStructuredFilters(
  intent: AiIntent,
  message: string,
  structuredRequest?: RecommendationRequestV2,
): AniListStructuredPasses {
  if (structuredRequest) {
    const genres = new Set<string>();
    const tags = new Set<string>();
    const reasons: string[] = [];
    let rankedTagMust = false;
    let strictMinimumTagRank: number | undefined;
    let relaxedMinimumTagRank: number | undefined;
    const positiveConstraints = [...structuredRequest.aspectConstraints]
      .filter((constraint) => constraint.role !== "avoid")
      .sort((a, b) => (a.role === "must" ? 0 : 1) - (b.role === "must" ? 0 : 1));
    for (const constraint of positiveConstraints) {
      const mappings = providerRetrievalMappingsFor(constraint.aspectId, "anilist")
        .filter((mapping) => structuredRequest.targetMediaTypes.some((mediaType) => mapping.supportedMediaTypes.includes(mediaType)));
      for (const mapping of mappings) {
        for (const genre of mapping.canonicalGenres ?? []) genres.add(genre);
        for (const tag of mapping.canonicalTags ?? []) tags.add(tag);
        if (mapping.strategy === "ranked_tag") {
          const policy = mapping.minimumRankPolicy ?? { strict: 40, relaxed: 20 };
          strictMinimumTagRank = Math.max(strictMinimumTagRank ?? 0, constraint.role === "must" ? policy.strict : policy.relaxed);
          relaxedMinimumTagRank = Math.max(relaxedMinimumTagRank ?? 0, policy.relaxed);
          if (constraint.role === "must") rankedTagMust = true;
        }
        reasons.push(`structured:${constraint.role}:${constraint.aspectId}`);
      }
    }
    const episodeLimit = structuredRequest.objectiveConstraints.find((constraint) => (
      constraint.field === "length"
      && constraint.unit === "episode"
      && constraint.operator === "lte"
      && typeof constraint.value === "number"
      && constraint.role !== "avoid"
    ));
    const episodeLimitValue = episodeLimit && typeof episodeLimit.value === "number" ? episodeLimit.value : undefined;
    const episodesLesser = episodeLimitValue !== undefined ? episodeLimitValue + 1 : undefined;
    if (episodesLesser !== undefined) reasons.push(`structured:length:<=${episodeLimitValue}`);
    if (genres.size === 0 && tags.size === 0 && episodesLesser === undefined) return {};
    const strict: AniListStructuredQuery = {
      genres: genres.size > 0 ? [...genres] : undefined,
      tags: tags.size > 0 ? [...tags] : undefined,
      minimumTagRank: tags.size > 0 ? strictMinimumTagRank : undefined,
      episodesLesser,
      sort: ["POPULARITY_DESC", "SCORE_DESC"],
      reason: reasons.join("|"),
    };
    return {
      strict,
      relaxed: {
        genres: strict.genres?.slice(0, 1),
        tags: rankedTagMust ? strict.tags : undefined,
        minimumTagRank: rankedTagMust ? relaxedMinimumTagRank : undefined,
        sort: ["POPULARITY_DESC"],
        reason: `${strict.reason}+relaxed`,
      },
    };
  }
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
): Promise<{ candidates: AiCandidate[]; unavailable: boolean }> {
  const url = `${ctx.baseUrl}/api/anilist/search`;
  const requestBody = {
    category: cat,
    ...(filters.genres?.length ? { genres: filters.genres } : {}),
    ...(filters.tags?.length ? { tags: filters.tags } : {}),
    ...(typeof filters.minimumTagRank === "number" ? { minimumTagRank: filters.minimumTagRank } : {}),
    ...(typeof filters.episodesLesser === "number" ? { episodesLte: filters.episodesLesser } : {}),
    ...(filters.sort?.length ? { sort: filters.sort } : {}),
  };

  // mediaType debug satırı için temsili tür — gerçek sonuçlar normalize'da
  // doğru MediaType ile gelir.
  const debugType: MediaType =
    cat === "anime" ? "anime" : cat === "manhwa" ? "manhwa" : cat === "manhua" ? "manhua" : "manga";
  const queryLabel = `[discover:${filters.reason || "structured"}]`;

  try {
    const res = await providerFetch(ctx, "anilist", url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), cache: "no-store",
    });
    if (!res.ok) {
      recordQuery(ctx.debug, "anilist", debugType, queryLabel, 0);
      return { candidates: [], unavailable: true };
    }
    const data = (await res.json()) as { results?: unknown };
    if (!Array.isArray(data?.results)) {
      addFilterReason(ctx.debug, "provider_response_schema_invalid");
      recordQuery(ctx.debug, "anilist", debugType, queryLabel, 0);
      return { candidates: [], unavailable: true };
    }
    const results = decodeProviderResults<AniListNormalizedResult>(
      data.results,
      ctx.debug,
      ["anime", "manga", "manhwa", "manhua"],
    );
    recordQuery(ctx.debug, "anilist", debugType, queryLabel, results.length);
    return { unavailable: false, candidates: results.map<AiCandidate>((r) => {
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
    }) };
  } catch {
    recordQuery(ctx.debug, "anilist", debugType, queryLabel, 0);
    return { candidates: [], unavailable: true };
  }
}

export function buildResearchRescueRequest(request: RecommendationRequestV2): {
  request: RecommendationRequestV2;
  relaxedAspectIds: readonly AspectId[];
} | null {
  const relaxedAspectIds = request.aspectConstraints.flatMap((constraint) => {
    if (
      constraint.source !== "explicit"
      || constraint.role !== "must"
      || (constraint.minimumLevel !== "significant" && constraint.minimumLevel !== "primary")
    ) return [];
    const entry = ASPECT_REGISTRY[constraint.aspectId];
    const researchableExactTaxonomy = entry.semanticVerifier !== "not_required"
      && providerRetrievalMappingsFor(constraint.aspectId, "anilist").some((mapping) => (
        mapping.queryable
        && mapping.strategy === "exact_taxonomy"
        && request.targetMediaTypes.some((mediaType) => mapping.supportedMediaTypes.includes(mediaType))
      ));
    return researchableExactTaxonomy ? [constraint.aspectId] : [];
  });
  if (relaxedAspectIds.length === 0) return null;
  const relaxed = new Set(relaxedAspectIds);
  return {
    request: {
      ...request,
      aspectConstraints: request.aspectConstraints.filter((constraint) => !relaxed.has(constraint.aspectId)),
    },
    relaxedAspectIds,
  };
}

const MAX_RANKED_TAG_CONSTRAINT_QUERIES = 4;
const STRICT_TAG_SUFFICIENT_CANDIDATES = 3;

interface ResolvedRankedTagConstraint {
  aspectId: AspectId;
  mapping: AspectProviderRetrievalMapping;
}

function candidateTraceKey(candidate: Pick<AiCandidate, "source" | "type" | "externalId">): string {
  return `${candidate.source}:${candidate.type}:${candidate.externalId}`;
}

function normalizeProviderTaxonomy(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function rankBand(rank: number | undefined): CandidateRankedTagTrace["rankBand"] {
  if (rank === undefined) return "unknown";
  if (rank >= 85) return "85-100";
  if (rank >= 60) return "60-84";
  if (rank >= 40) return "40-59";
  if (rank >= 20) return "20-39";
  return "below-20";
}

function resolveHardRankedTagConstraints(request: RecommendationRequestV2): {
  constraints: readonly ResolvedRankedTagConstraint[];
  total: number;
  unmapped: number;
} {
  const hard = request.aspectConstraints.filter((constraint) => (
    constraint.role === "must"
    && constraint.source === "explicit"
    && evidenceStrategyForProvider(constraint.aspectId, "anilist") === "ranked_tag"
  ));
  const constraints: ResolvedRankedTagConstraint[] = [];
  let unmapped = 0;
  for (const constraint of hard) {
    const mapping = providerRetrievalMappingsFor(constraint.aspectId, "anilist").find((candidate) => (
      candidate.queryable
      && candidate.strategy === "ranked_tag"
      && (candidate.canonicalTags?.length ?? 0) > 0
      && request.targetMediaTypes.some((mediaType) => candidate.supportedMediaTypes.includes(mediaType))
    ));
    if (!mapping) {
      unmapped += 1;
      continue;
    }
    constraints.push({ aspectId: constraint.aspectId, mapping });
  }
  return { constraints, total: hard.length, unmapped };
}

function tagEvidenceForCandidate(
  candidate: AiCandidate,
  constraint: ResolvedRankedTagConstraint,
): CandidateRankedTagTrace["returnedTagEvidence"] {
  const raw = candidate.globalSearch?.raw as Partial<AniListNormalizedResult> | undefined;
  const tags = Array.isArray(raw?.tags) ? raw.tags : [];
  const canonical = new Map((constraint.mapping.canonicalTags ?? []).map((tag) => [normalizeProviderTaxonomy(tag), tag]));
  return tags.flatMap((tag) => {
    const canonicalTag = canonical.get(normalizeProviderTaxonomy(tag.name));
    const rank = tag.rank;
    if (!canonicalTag || typeof rank !== "number" || !Number.isFinite(rank) || rank < 0 || rank > 100) return [];
    return [{ aspectId: constraint.aspectId, canonicalTag, rank }];
  });
}

async function searchHardRankedTagCandidates(
  ctx: SearchContext,
  request: RecommendationRequestV2,
): Promise<{
  candidates: AiCandidate[];
  telemetry: RankedTagRetrievalTelemetry;
  traceByCandidateKey: ReadonlyMap<string, CandidateRankedTagTrace>;
} | null> {
  const resolved = resolveHardRankedTagConstraints(request);
  if (resolved.total === 0) return null;
  const telemetry: RankedTagRetrievalTelemetry = {
    ranked_tag_constraints: resolved.total,
    ranked_tag_queryable_constraints: resolved.constraints.length,
    ranked_tag_unmapped_constraints: resolved.unmapped,
    anilist_strict_tag_queries: 0,
    anilist_relaxed_tag_queries: 0,
    strict_tag_candidate_count: 0,
    relaxed_tag_candidate_count: 0,
    title_fallback_candidate_count: 0,
    candidates_without_requested_tag: 0,
    ranked_tag_primary_count: 0,
    ranked_tag_near_match_count: 0,
    structuredTagRetrievalUsed: resolved.constraints.length > 0,
  };
  const traces = new Map<string, CandidateRankedTagTrace>();
  if (resolved.unmapped > 0) {
    telemetry.noResultReason = "provider_tag_mapping_missing";
    return { candidates: [], telemetry, traceByCandidateKey: traces };
  }
  if (resolved.constraints.length > MAX_RANKED_TAG_CONSTRAINT_QUERIES) {
    telemetry.noResultReason = "provider_tag_query_unavailable";
    return { candidates: [], telemetry, traceByCandidateKey: traces };
  }
  const categories = [...new Set(request.targetMediaTypes.map(aniListCategoryFor).filter((value): value is AniListCategory => value !== null))];
  if (categories.length === 0 || resolved.constraints.length * categories.length > MAX_RANKED_TAG_CONSTRAINT_QUERIES) {
    telemetry.noResultReason = "provider_tag_query_unavailable";
    return { candidates: [], telemetry, traceByCandidateKey: traces };
  }
  const structured = extractAniListStructuredFilters({
    kind: "general_recommendation", references: [], targetTypes: [...request.targetMediaTypes], sourceTypes: [], mood: [], avoid: [],
    needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false,
  }, request.queryText, request);

  const runPass = async (pass: "strict_tag" | "relaxed_tag") => {
    const tasks = resolved.constraints.flatMap((constraint) => categories.map(async (category) => {
      const policy = constraint.mapping.minimumRankPolicy ?? { strict: 40, relaxed: 20 };
      const minimumRank = pass === "strict_tag" ? policy.strict : policy.relaxed;
      const result = await searchAniListDiscover(ctx, category, {
        genres: structured.strict?.genres,
        tags: [...(constraint.mapping.canonicalTags ?? [])],
        minimumTagRank: minimumRank,
        episodesLesser: pass === "strict_tag" ? structured.strict?.episodesLesser : undefined,
        sort: ["POPULARITY_DESC", "SCORE_DESC", "ID"],
        reason: `ranked:${constraint.aspectId}:${pass}`,
      });
      return { ...result, constraint, minimumRank };
    }));
    if (pass === "strict_tag") telemetry.anilist_strict_tag_queries += tasks.length;
    else telemetry.anilist_relaxed_tag_queries += tasks.length;
    const settled = await Promise.allSettled(tasks);
    const candidates: AiCandidate[] = [];
    let unavailable = false;
    let belowMinimum = false;
    for (const item of settled) {
      if (item.status === "rejected" || item.value.unavailable) {
        unavailable = true;
        continue;
      }
      for (const candidate of item.value.candidates) {
        const returnedTagEvidence = tagEvidenceForCandidate(candidate, item.value.constraint);
        const qualifying = returnedTagEvidence.filter((evidence) => evidence.rank >= item.value.minimumRank);
        if (qualifying.length === 0) {
          telemetry.candidates_without_requested_tag += 1;
          if (returnedTagEvidence.length > 0) belowMinimum = true;
          continue;
        }
        const bestRank = Math.max(...qualifying.map((evidence) => evidence.rank));
        const key = candidateTraceKey(candidate);
        const previous = traces.get(key);
        traces.set(key, {
          retrievalPass: previous?.retrievalPass ?? pass,
          requestedTagMappings: [
            ...(previous?.requestedTagMappings ?? []),
            { aspectId: item.value.constraint.aspectId, canonicalTags: [...(item.value.constraint.mapping.canonicalTags ?? [])] },
          ],
          returnedTagEvidence: [...(previous?.returnedTagEvidence ?? []), ...qualifying],
          rankBand: rankBand(Math.max(bestRank, ...(previous?.returnedTagEvidence.map((evidence) => evidence.rank) ?? []))),
          eligibility: "retrieval_qualified",
        });
        candidates.push(candidate);
      }
    }
    return { candidates: dedupeCandidates(candidates), unavailable, belowMinimum };
  };

  const strict = await runPass("strict_tag");
  telemetry.strict_tag_candidate_count = strict.candidates.length;
  if (strict.unavailable) {
    telemetry.noResultReason = "provider_tag_query_unavailable";
    return { candidates: [], telemetry, traceByCandidateKey: traces };
  }
  let combined = strict.candidates;
  if (strict.candidates.length < STRICT_TAG_SUFFICIENT_CANDIDATES) {
    const relaxed = await runPass("relaxed_tag");
    telemetry.relaxed_tag_candidate_count = relaxed.candidates.length;
    if (relaxed.unavailable) {
      if (strict.candidates.length > 0) {
        return { candidates: strict.candidates.slice(0, MAX_TOTAL), telemetry, traceByCandidateKey: traces };
      }
      telemetry.noResultReason = "provider_tag_query_unavailable";
      return { candidates: [], telemetry, traceByCandidateKey: traces };
    }
    combined = dedupeCandidates([...strict.candidates, ...relaxed.candidates]);
    if (combined.length === 0 && (strict.belowMinimum || relaxed.belowMinimum)) {
      telemetry.noResultReason = "candidates_below_tag_rank";
    }
  }
  if (combined.length === 0 && !telemetry.noResultReason) telemetry.noResultReason = "provider_tag_no_candidates";
  return { candidates: combined.slice(0, MAX_TOTAL), telemetry, traceByCandidateKey: traces };
}

async function searchStructuredResearchRescueCandidates(
  ctx: SearchContext,
  request: RecommendationRequestV2,
): Promise<AiCandidate[]> {
  const categories = [...new Set(request.targetMediaTypes.map(aniListCategoryFor).filter((value): value is AniListCategory => value !== null))];
  const structured = extractAniListStructuredFilters({
    kind: "general_recommendation", references: [], targetTypes: [...request.targetMediaTypes], sourceTypes: [], mood: [], avoid: [],
    needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false,
  }, request.queryText, request);
  if (categories.length === 0 || !structured.strict) return [];
  const settled = await Promise.allSettled(categories.map((category) => searchAniListDiscover(ctx, category, {
    ...structured.strict,
    sort: ["POPULARITY_DESC", "SCORE_DESC", "ID"],
    reason: `${structured.strict?.reason ?? "structured"}:research_rescue`,
  })));
  return dedupeCandidates(settled.flatMap((item) => item.status === "fulfilled" ? item.value.candidates : [])).slice(0, MAX_RESEARCH_RESCUE_CANDIDATES);
}

function mergeRankedTagTraces(
  primary: ReadonlyMap<string, CandidateRankedTagTrace>,
  rescue: ReadonlyMap<string, CandidateRankedTagTrace>,
): ReadonlyMap<string, CandidateRankedTagTrace> {
  return new Map([...primary, ...rescue]);
}

function snapshotHasRequestedRankedTag(
  snapshot: CandidateProviderEvidenceSnapshot | undefined,
  requestedAspectIds: ReadonlySet<AspectId>,
): boolean {
  if (!snapshot) return false;
  return snapshot.rawEvidenceClaims.some((claim) => {
    if (claim.sourceKind !== "provider_tag_rank" || !claim.mappedAspectIds.some((id) => requestedAspectIds.has(id))) return false;
    const value = normalizeProviderTaxonomy(String(claim.value ?? ""));
    const rank = snapshot.objectiveMetadata.tags?.find((tag) => normalizeProviderTaxonomy(tag.name) === value)?.rank;
    return typeof rank === "number" && Number.isFinite(rank) && rank >= 20 && rank <= 100;
  });
}

export function applyRankedTagCandidatePoolGate(input: {
  request?: RecommendationRequestV2;
  candidates: readonly AiCandidate[];
  evidenceByCandidateKey: ReadonlyMap<string, CandidateProviderEvidenceSnapshot>;
  traceByCandidateKey?: ReadonlyMap<string, CandidateRankedTagTrace>;
}): { candidates: AiCandidate[]; rejected: { title: string; reason: string }[]; candidatesWithoutRequestedTag: number } {
  if (!input.request) return { candidates: [...input.candidates], rejected: [], candidatesWithoutRequestedTag: 0 };
  const resolved = resolveHardRankedTagConstraints(input.request);
  if (resolved.total === 0) return { candidates: [...input.candidates], rejected: [], candidatesWithoutRequestedTag: 0 };
  const requestedAspectIds = new Set(resolved.constraints.map((constraint) => constraint.aspectId));
  const snapshots = [...input.evidenceByCandidateKey.values()];
  const candidates: AiCandidate[] = [];
  const rejected: { title: string; reason: string }[] = [];
  for (const candidate of input.candidates) {
    const trace = input.traceByCandidateKey?.get(candidateTraceKey(candidate));
    const fromRequestedPass = Boolean(trace?.returnedTagEvidence.some((evidence) => requestedAspectIds.has(evidence.aspectId) && evidence.rank >= 20));
    const snapshot = snapshots.find((item) => item.candidateIdentity.primaryProvider === candidate.source && item.candidateIdentity.primaryExternalId === candidate.externalId);
    if (fromRequestedPass || snapshotHasRequestedRankedTag(snapshot, requestedAspectIds)) candidates.push(candidate);
    else rejected.push({ title: candidate.title, reason: "candidates_failed_ranked_tag_confidence" });
  }
  return { candidates, rejected, candidatesWithoutRequestedTag: rejected.length };
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
    const url = `${ctx.baseUrl}/api/anilist/search`;
    const res = await providerFetch(ctx, "anilist", url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, category: cat }), cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: unknown };
    const results = decodeProviderResults<AniListNormalizedResult>(
      data.results,
      ctx.debug,
      ["anime", "manga", "manhwa", "manhua"],
    );
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
    const url = `${ctx.baseUrl}/api/tvmaze/search`;
    const res = await providerFetch(ctx, "tvmaze", url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: unknown };
    const results = decodeProviderResults<TvmazeNormalizedResult>(data.results, ctx.debug, ["tv"]);
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
    const url = `${ctx.baseUrl}/api/openlibrary/search`;
    const res = await providerFetch(ctx, "openlibrary", url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: unknown };
    const results = decodeProviderResults<OpenLibraryNormalizedResult>(data.results, ctx.debug, ["book"]);
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
      return plan.mediaType === "movie" || plan.mediaType === "tv";
    case "library":
      return true;
    case "web":
      return false;
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
    if (p.source === "tvmaze" && plan.targetMediaTypes.includes("anime") && !plan.targetMediaTypes.includes("tv")) continue;
    for (const q of p.queries.slice(0, MAX_PLAN_QUERIES)) {
      if (p.source === "anilist") tasks.push(searchAniList(ctx, q, p.mediaType));
      else if (p.source === "tvmaze") tasks.push(searchTvmaze(ctx, q));
      else if (p.source === "openlibrary") tasks.push(searchOpenLibrary(ctx, q));
      else if (p.source === "omdb") tasks.push(searchOmdb(ctx, q));
      else if (p.source === "tmdb") tasks.push(searchTmdb(ctx, q, p.mediaType === "tv" ? "tv" : "movie"));
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

// R37/D6-2 — TMDB movie/TV araması. Movie source-apis modunun birincil film
// kaynağıdır; TV ise TVMaze yanında discovery/enrichment kaynağıdır.
// TMDB route'u token eksikse 503 + boş results döndürdüğü için bu fonksiyon
// boş sonuç durumunda OMDb fallback'in çağrıldığını söyleyen bir sinyal
// üretmez — orchestrator (searchSourceApiCandidates) zaten ardından OMDb'yi
// çalıştırır.
async function searchTmdb(ctx: SearchContext, q: string, mediaType: "movie" | "tv" = "movie"): Promise<AiCandidate[]> {
  if (!q.trim()) return [];
  try {
    const url = `${ctx.baseUrl}/api/tmdb/search`;
    const res = await providerFetch(ctx, "tmdb", url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, mediaType }), cache: "no-store",
    });
    if (!res.ok) {
      recordQuery(ctx.debug, "tmdb", mediaType, q, 0);
      return [];
    }
    const data = (await res.json()) as { results?: unknown };
    const results = decodeProviderResults<TmdbNormalizedResult>(data.results, ctx.debug, [mediaType]);
    recordQuery(ctx.debug, "tmdb", mediaType, q, results.length);
    return results.map<AiCandidate>((r) => {
      const gs: GlobalSearchResult = {
        source: "tmdb",
        externalId: r.externalId,
        type: r.type,
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
        type: r.type,
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
    const url = `${ctx.baseUrl}/api/omdb/search`;
    const res = await providerFetch(ctx, "omdb", url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: unknown };
    const results = decodeProviderResults<OmdbNormalizedResult>(data.results, ctx.debug, ["movie"]);
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
  structuredRequest?: RecommendationRequestV2;
  researchRescue?: boolean;
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
  structuredRequest?: RecommendationRequestV2;
  researchRescue?: boolean;
}): Promise<CandidateSearchResult> {
  const { intent, retrievalPlan, profile, message, mediaItems, progressLogs, structuredRequest, researchRescue } = args;
  const debug = createSearchDebug();
  const notes: string[] = [];
  let rankedTagRetrieval: RankedTagRetrievalTelemetry | undefined;
  let rankedTagTraceByCandidateKey: ReadonlyMap<string, CandidateRankedTagTrace> | undefined;

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
        rankedTagRetrieval,
        providerRequests: debug.providerRequests,
      },
      internal: rankedTagTraceByCandidateKey ? { rankedTagTraceByCandidateKey } : undefined,
    };
  };

  if (intent.kind === "library_based") {
    return finish(localCandidates(mediaItems, intent, progressLogs, debug, message));
  }

  const ctx: SearchContext = { baseUrl: getBaseUrl(), debug };

  if (structuredRequest) {
    const rankedTagResult = await searchHardRankedTagCandidates(ctx, structuredRequest);
    if (rankedTagResult) {
      rankedTagRetrieval = rankedTagResult.telemetry;
      rankedTagTraceByCandidateKey = rankedTagResult.traceByCandidateKey;
      notes.push(`ranked_tag_retrieval:strict=${rankedTagRetrieval.strict_tag_candidate_count} relaxed=${rankedTagRetrieval.relaxed_tag_candidate_count}`);
      if (rankedTagRetrieval.noResultReason) notes.push(`ranked_tag_no_result:${rankedTagRetrieval.noResultReason}`);
      let rankedCandidates = researchRescue && !rankedTagRetrieval.structuredTagRetrievalUsed
        ? await searchStructuredResearchRescueCandidates(ctx, structuredRequest)
        : rankedTagResult.candidates;
      if (researchRescue) {
          const rescueRequest = buildResearchRescueRequest(structuredRequest);
          if (rescueRequest) {
            const rescueRanked = await searchHardRankedTagCandidates(ctx, rescueRequest.request);
          const useRankedRescue = rescueRanked?.telemetry.structuredTagRetrievalUsed === true;
          const rescueCandidates = useRankedRescue
            ? rescueRanked.candidates.slice(0, MAX_RESEARCH_RESCUE_CANDIDATES)
            : await searchStructuredResearchRescueCandidates(ctx, rescueRequest.request);
          rankedCandidates = dedupeCandidates([...rankedCandidates, ...rescueCandidates]).slice(0, MAX_TOTAL);
          if (useRankedRescue && rescueRanked) rankedTagTraceByCandidateKey = mergeRankedTagTraces(rankedTagTraceByCandidateKey, rescueRanked.traceByCandidateKey);
          notes.push(`research_rescue:relaxed=${rescueRequest.relaxedAspectIds.join(",")} candidates=${rescueCandidates.length}`);
        }
      }
      const targetFamily = [...expandTargetFamily([...structuredRequest.targetMediaTypes], message)];
      return finish(hygieneFilterCandidates(
        rankedCandidates,
        targetFamily,
        intent.references,
        debug,
      ).slice(0, MAX_TOTAL));
    }
    if (researchRescue) {
      const rescueRequest = buildResearchRescueRequest(structuredRequest);
      if (rescueRequest) {
        const structuredCandidates = await searchStructuredResearchRescueCandidates(ctx, structuredRequest);
        const rescueCandidates = await searchStructuredResearchRescueCandidates(ctx, rescueRequest.request);
        const candidates = dedupeCandidates([...structuredCandidates, ...rescueCandidates]).slice(0, MAX_TOTAL);
        notes.push(`research_rescue:relaxed=${rescueRequest.relaxedAspectIds.join(",")} candidates=${rescueCandidates.length}`);
        const targetFamily = [...expandTargetFamily([...structuredRequest.targetMediaTypes], message)];
        return finish(hygieneFilterCandidates(candidates, targetFamily, intent.references, debug).slice(0, MAX_TOTAL));
      }
    }
  }

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
// kaynaklar yine sonuç döndürür. Çıktı orchestration katmanındaki etkin
// scorer/ranking yolundan geçer; bu fonksiyon kendi başına sıralama yapmaz.

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
    { source: "tmdb", mediaType: "tv" },
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
      return mediaType === "movie" || mediaType === "tv" ? searchTmdb(ctx, query, mediaType) : Promise.resolve([]);
    case "omdb":
      return searchOmdb(ctx, query);
    case "web":
      return Promise.resolve([]);
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

export async function searchWebResearchCandidates(args: {
  intent: AiIntent;
  profile: LibraryProfile | null;
  message: string;
  scopeMode?: AdvisorScopeMode;
  sharedDebug?: CandidateSearchDebug;
  structuredRequest?: RecommendationRequestV2;
}): Promise<SourceApiCandidatesResult> {
  const { intent, profile, message, scopeMode } = args;
  const notes: string[] = [];
  const localDebug: CandidateSearchDebug = args.sharedDebug || createSearchDebug();
  const ctx: SearchContext = { baseUrl: getBaseUrl(), debug: localDebug };
  const scope = scopeMode || "mixed";
  const plan = planForScope(scope);
  let pairs = plan.pairs;
  if (intent.targetTypes.length > 0) {
    const targetSet = new Set(intent.targetTypes);
    const filtered = pairs.filter((p) => targetSet.has(p.mediaType));
    if (filtered.length > 0) pairs = filtered;
  }

  const webQueries = buildWebResearchQueries(intent, profile, message);
  if (webQueries.length === 0) {
    notes.push("web_research_no_query");
    return { candidates: [], executedQueries: localDebug.executedQueries, sourceCandidateCounts: localDebug.sourceCandidateCounts, notes };
  }
  notes.push(`web_research_limits:timeoutMs=${WEB_REQUEST_TIMEOUT_MS} maxQueries=${MAX_WEB_QUERIES} maxHitsPerQuery=${MAX_WEB_HITS_PER_QUERY} maxHitsTotal=${MAX_WEB_HITS_TOTAL}`);

  const targetForDebug = pairs[0]?.mediaType || intent.targetTypes[0] || "anime";
  const webHits: WebSearchHit[] = [];
  for (const query of webQueries) {
    const result = await searchWeb(ctx, query, targetForDebug);
    if (result.note) notes.push(`web_research_${result.note}:query=${query}`);
    webHits.push(...result.hits);
    if (webHits.length >= MAX_WEB_HITS_TOTAL) break;
  }
  if (webHits.length > MAX_WEB_HITS_TOTAL) webHits.length = MAX_WEB_HITS_TOTAL;
  notes.push(`web_research_query_count:${webQueries.length}`);
  notes.push(`web_research_queries:${webQueries.join("|")}`);
  notes.push(`web_research_hits:${webHits.length}`);
  if (webHits.length === 0) {
    notes.push("web_research_empty");
    return { candidates: [], executedQueries: localDebug.executedQueries, sourceCandidateCounts: localDebug.sourceCandidateCounts, notes };
  }

  const baseQueries = expandQueries(intent, profile, message);
  const webCandidateQueries = extractWebCandidateQueries(webHits, baseQueries);
  notes.push(`web_research_candidate_queries:${webCandidateQueries.join("|") || "-"}`);

  const tasks: Promise<AiCandidate[]>[] = [];
  for (const pair of pairs) {
    if (pair.source === "anilist") {
      const structured = extractAniListStructuredFilters(intent, message, args.structuredRequest);
      const cat = aniListCategoryFor(pair.mediaType);
      if (cat && structured.strict) {
        tasks.push(searchAniListDiscover(ctx, cat, structured.strict).then((result) => result.candidates));
      }
    }
    for (const q of webCandidateQueries.slice(0, MAX_WEB_VERIFICATION_QUERIES_PER_SOURCE)) {
      tasks.push(dispatchSearch(ctx, pair.source, pair.mediaType, q));
    }
  }

  const settled = await Promise.allSettled(tasks);
  const collected: AiCandidate[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") collected.push(...s.value);
  }

  const deduped = dedupeCandidates(collected).map((c) => ({
    ...c,
    scoreReasons: [
      "Web araştırmasıyla bulunan güncel/popüler kaynak sinyallerinden doğrulandı.",
      ...(c.scoreReasons || []),
    ],
  }));
  notes.push(`web_research_verified_candidates:${deduped.length}`);

  return {
    candidates: deduped.slice(0, MAX_TOTAL),
    executedQueries: localDebug.executedQueries,
    sourceCandidateCounts: localDebug.sourceCandidateCounts,
    notes,
  };
}

export async function searchSourceApiCandidates(args: {
  intent: AiIntent;
  profile: LibraryProfile | null;
  message: string;
  scopeMode?: AdvisorScopeMode;
  /** İstenirse caller'ın paylaşılan debug nesnesi (queries/counts buraya da yazılır) */
  sharedDebug?: CandidateSearchDebug;
  structuredRequest?: RecommendationRequestV2;
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

  const expanded = expandQueries(intent, profile, message);
  const anilistQueryCount = pairs.length <= 2 ? 2 : 1;
  const anilistQueries = expanded.slice(0, anilistQueryCount);
  if (expanded.length === 0) {
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
  const structured = extractAniListStructuredFilters(intent, message, args.structuredRequest);

  if (anilistPairs.length > 0 && structured.strict) {
    const anilistCats = new Set<AniListCategory>();
    for (const pair of anilistPairs) {
      const cat = aniListCategoryFor(pair.mediaType);
      if (cat) anilistCats.add(cat);
    }

    const strictTasks: Promise<AiCandidate[]>[] = [];
    for (const cat of anilistCats) {
      strictTasks.push(searchAniListDiscover(ctx, cat, structured.strict).then((result) => result.candidates));
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
        relaxedTasks.push(searchAniListDiscover(ctx, cat, structured.relaxed).then((result) => result.candidates));
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
      for (const q of anilistQueries) {
        titleTasks.push(dispatchSearch(ctx, pair.source, pair.mediaType, q));
      }
    }
    const settled = await Promise.allSettled(titleTasks);
    for (const s of settled) {
      if (s.status === "fulfilled") collected.push(...s.value);
    }
    notes.push(`anilist_title_search:queries=${anilistQueries.length} pairs=${anilistPairs.length}`);
  }

  // AniList dışı kaynaklar: source-specific mood/genre/subject query stratejisi.
  const otherTasks: Promise<AiCandidate[]>[] = [];
  const shortRequested = hasShortRequest(message, intent);
  for (const pair of otherPairs) {
    if (pair.source !== "tmdb" && pair.source !== "tvmaze" && pair.source !== "openlibrary") continue;
    const sourcePlan = sourceQueriesFor(pair.source, intent, profile, message, expanded);
    if (sourcePlan.queries.length === 0) continue;
    notes.push(
      `${pair.source}_query_strategy:signals=${sourcePlan.signals.join("/") || "base"} queries=${sourcePlan.queries.join("|")}`
    );
    if (shortRequested) {
      notes.push(`${pair.source}_short_signal_unsupported:no_length_filter_applied`);
    }
    for (const q of sourcePlan.queries) {
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
        const omdbPlan = sourceQueriesFor("tmdb", intent, profile, message, expanded);
        notes.push(`omdb_query_strategy:source=tmdb_fallback queries=${omdbPlan.queries.join("|") || "-"}`);
        for (const q of omdbPlan.queries) {
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

