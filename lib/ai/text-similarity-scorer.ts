import { buildLibraryItemEmbeddingText } from "@/lib/ai/embedding-text-builder";
import type { AiCandidate } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";

export interface TextSimilarityScoringResult {
  candidates: AiCandidate[];
  stats: {
    candidates: number;
    positiveProfileItems: number;
    negativeProfileItems: number;
    adjusted: number;
    averageScore: number;
    maxScore: number;
    minScore: number;
  };
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "title",
  "mediatype",
  "world",
  "subtype",
  "subtypeorformat",
  "genres",
  "tags",
  "subjects",
  "authors",
  "overview",
  "personalnotes",
]);

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tokenize(text: string, signals: string[] = []): Set<string> {
  const tokens = new Set<string>();
  const source = `${text} ${signals.join(" ")}`.toLowerCase();
  for (const raw of source.match(/[\p{L}\p{N}]+/gu) || []) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function profileItems(mediaItems: MediaItem[], mode: "positive" | "negative"): MediaItem[] {
  return mediaItems.filter((item) => {
    if (mode === "positive") return Boolean(item.favorite) || (typeof item.userRating === "number" && item.userRating >= 8);
    return item.status === "dropped" || (typeof item.userRating === "number" && item.userRating <= 4);
  });
}

function buildProfile(items: MediaItem[]): { title: string; tokens: Set<string>; signals: string[] }[] {
  return items.map((item) => {
    const embedding = buildLibraryItemEmbeddingText(item);
    return {
      title: item.title,
      tokens: tokenize(embedding.text, embedding.signals),
      signals: embedding.signals,
    };
  });
}

function bestSimilarity(candidateTokens: Set<string>, profile: { title: string; tokens: Set<string> }[]): {
  score: number;
  title?: string;
} {
  let score = 0;
  let title: string | undefined;
  for (const item of profile) {
    const similarity = jaccard(candidateTokens, item.tokens);
    if (similarity > score) {
      score = similarity;
      title = item.title;
    }
  }
  return { score, title };
}

export function applyTextSimilarityScoring(args: {
  candidates: AiCandidate[];
  mediaItems: MediaItem[];
}): TextSimilarityScoringResult {
  const positiveProfile = buildProfile(profileItems(args.mediaItems, "positive"));
  const negativeProfile = buildProfile(profileItems(args.mediaItems, "negative"));
  let adjusted = 0;
  let total = 0;

  const candidates = args.candidates.map((candidate) => {
    const candidateTokens = tokenize(candidate.embeddingText || "", candidate.embeddingSignals || []);
    const positive = bestSimilarity(candidateTokens, positiveProfile);
    const negative = bestSimilarity(candidateTokens, negativeProfile);
    const score = roundScore(clamp((positive.score - negative.score) * 10, -3, 3));
    const reasons: string[] = [];

    if (score >= 0.7 && positive.title) {
      reasons.push(`Yerel metin benzerliği güçlü: "${positive.title}" çizgisine yakın`);
    } else if (score <= -0.7 && negative.title) {
      reasons.push(`Yerel metin benzerliği riski: "${negative.title}" ile negatif profile yakın`);
    }

    if (score !== 0) {
      adjusted++;
      total += score;
    }

    return {
      ...candidate,
      textSimilarityScore: score,
      textSimilarityReasons: reasons,
      scoreReasons: Array.from(new Set([...(candidate.scoreReasons || []), ...reasons])).slice(0, 6),
    };
  });

  const scores = candidates.map((candidate) => candidate.textSimilarityScore || 0);

  return {
    candidates,
    stats: {
      candidates: candidates.length,
      positiveProfileItems: positiveProfile.length,
      negativeProfileItems: negativeProfile.length,
      adjusted,
      averageScore: adjusted > 0 ? roundScore(total / adjusted) : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
    },
  };
}
